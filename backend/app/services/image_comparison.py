"""Multi-epoch image comparison: prerequisites, difference imaging, quality, provenance.

Scientific model
----------------
The reference product's pixel grid is the common grid. Both products are
background-corrected (optional, default on) and the second is subtracted from
the first after an optional photometric scale:

    D = I_b - alpha * I_a

with ``alpha = 1`` unless the caller asks for a data-derived relative scale.
A difference product is only written when every mandatory check passes; when a
check fails the request returns a ``rejected`` comparison describing exactly
which prerequisite failed, and no image is produced.
"""

from __future__ import annotations

import hashlib
import json
import logging
import math
import os
import platform
import re
import threading
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import astropy
import numpy as np
import scipy
from astropy.io import fits
from astropy.stats import sigma_clipped_stats
from astropy.wcs import WCS
from scipy.ndimage import gaussian_filter

from app.core.exceptions import (
    ComparisonNotFoundError,
    ImageProcessingLimitError,
    InvalidCoordinateError,
    PlanetXError,
    ProcessingBusyError,
    ReprojectionError,
)
from app.core.validation import validate_coordinates, validate_cutout_size
from app.schemas.common import Target
from app.schemas.image_processing import (
    AlignmentInfo,
    BackgroundInfo,
    CheckResult,
    CompareRequest,
    ComparisonConfig,
    ComparisonMetadata,
    ComparisonResponse,
    DifferenceProduct,
    DifferenceStatistics,
    ImageInspection,
    InputProduct,
    PhotometricInfo,
    ProvenanceInfo,
    PsfCompatibility,
    QualityAssessment,
    ReprojectionInfo,
)
from app.services.artifact_resolver import resolve_observation_artifact
from app.services.fits_service import ScienceImage, extract_science_image
from app.services.image_inspection import invalid_flag_mask, inspect_fits, pixel_scale_arcsec
from app.services.image_reprojection import CommonGrid, measure_residual_shift, reproject
from app.services.observation_service import ObservationService
from app.services.preview_service import generate_preview
from app.services.wcs_service import celestial_wcs

log = logging.getLogger(__name__)

_COMPARISON_ID_RE = re.compile(r"^[0-9a-f]{32}$")
_PHOTOMETRIC_EPSILON = 1e-30

_SEMAPHORE: threading.BoundedSemaphore | None = None
_SEMAPHORE_LOCK = threading.Lock()


def _semaphore(limit: int) -> threading.BoundedSemaphore:
    global _SEMAPHORE
    with _SEMAPHORE_LOCK:
        if _SEMAPHORE is None:
            _SEMAPHORE = threading.BoundedSemaphore(max(1, limit))
        return _SEMAPHORE


@dataclass
class _Loaded:
    observation_id: str
    detail: Any
    path: Path
    source: str
    inspection: ImageInspection
    image: ScienceImage
    wcs: WCS
    valid: np.ndarray


class ImageComparisonService:
    def __init__(self, observations: ObservationService) -> None:
        self.observations = observations
        self.settings = observations.settings
        self.cache = observations.cache
        self.settings.ensure_dirs()

    # -------------------------------------------------------------- inspection
    def inspect(
        self,
        observation_id: str,
        ra: float | None = None,
        dec: float | None = None,
        size: float | None = None,
    ) -> ImageInspection:
        if (ra is None) != (dec is None):
            raise InvalidCoordinateError("ra and dec must be provided together", details={"ra": ra, "dec": dec})
        detail, path, source = self._resolve_artifact(observation_id, ra, dec, size)
        return inspect_fits(
            path,
            observation_id=observation_id,
            obs_publisher_did=detail.obs_publisher_did,
            band=detail.band,
            target_ra=ra,
            target_dec=dec,
            source=source,
            source_url=detail.fits_access_url or "",
        )

    # --------------------------------------------------------------- comparison
    def compare(self, request: CompareRequest) -> ComparisonResponse:
        ra, dec = validate_coordinates(request.ra, request.dec)
        size = validate_cutout_size(request.size, self.settings.max_cutout_size_deg)
        key = _cache_key(request, ra, dec, size)

        cached = self.cache.comparisons.get(key)
        if cached is not None:
            return cached

        semaphore = _semaphore(self.settings.max_concurrent_comparisons)
        if not semaphore.acquire(timeout=self.settings.request_timeout):
            raise ProcessingBusyError(
                "Too many image comparisons are running; retry shortly",
                details={"max_concurrent": self.settings.max_concurrent_comparisons},
            )
        try:
            result = self._compare(request, ra, dec, size, key)
        finally:
            semaphore.release()

        self.cache.comparisons.set(key, result)
        self._store(result)
        return result

    def get_comparison(self, comparison_id: str) -> ComparisonResponse:
        if not _COMPARISON_ID_RE.fullmatch(comparison_id or ""):
            raise ComparisonNotFoundError("Unknown comparison id", details={"comparison_id": comparison_id})
        path = self.settings.comparisons_dir / f"{comparison_id}.json"
        if not path.is_file():
            raise ComparisonNotFoundError(
                "Comparison record not found; run /images/compare first",
                details={"comparison_id": comparison_id},
            )
        try:
            return ComparisonResponse.model_validate_json(path.read_text(encoding="utf-8"))
        except Exception as exc:
            raise ComparisonNotFoundError(
                "Comparison record is unreadable", details={"comparison_id": comparison_id, "error": str(exc)}
            ) from exc

    # ------------------------------------------------------------------ engine
    def _compare(
        self, request: CompareRequest, ra: float, dec: float, size: float, key: str
    ) -> ComparisonResponse:
        comparison_id = key[:32]
        config = request.config
        created_at = datetime.now(timezone.utc).isoformat()

        loaded_a = self._load(request.observation_id_a, ra, dec, size)
        loaded_b = self._load(request.observation_id_b, ra, dec, size)

        checks: list[CheckResult] = [
            _check("fits_a", loaded_a.inspection.stats.finite_pixels > 0, "Science image A has usable pixels",
                   "Science image A has no finite pixels"),
            _check("fits_b", loaded_b.inspection.stats.finite_pixels > 0, "Science image B has usable pixels",
                   "Science image B has no finite pixels"),
            _check("wcs_a", loaded_a.wcs is not None, "Celestial WCS present for A",
                   "Product A has no usable celestial WCS"),
            _check("wcs_b", loaded_b.wcs is not None, "Celestial WCS present for B",
                   "Product B has no usable celestial WCS"),
        ]
        if loaded_a.wcs is None or loaded_b.wcs is None or checks[0].status == "FAIL" or checks[1].status == "FAIL":
            return self._rejected(comparison_id, request, ra, dec, size, key, created_at, checks,
                                  [loaded_a, loaded_b], None, None, None, None, None)

        pixels = loaded_a.image.data.size + loaded_b.image.data.size
        if pixels > self.settings.max_comparison_pixels:
            raise ImageProcessingLimitError(
                "Image pair exceeds the configured comparison pixel limit",
                details={"pixels": pixels, "max_comparison_pixels": self.settings.max_comparison_pixels},
            )

        reference_is_a = config.reference == "first"
        reference = loaded_a if reference_is_a else loaded_b
        other = loaded_b if reference_is_a else loaded_a
        grid = CommonGrid(
            wcs=reference.wcs,
            shape=reference.image.data.shape,
            pixel_scale_arcsec=pixel_scale_arcsec(reference.wcs),
        )

        try:
            ref_projected = reproject(
                reference.image.data, reference.valid, reference.image.variance,
                reference.wcs, grid, config.interpolation, same_grid=True,
            )
            other_projected = reproject(
                other.image.data, other.valid, other.image.variance,
                other.wcs, grid, config.interpolation,
            )
        except ReprojectionError as exc:
            checks.append(CheckResult(name="reprojection", status="FAIL", message=exc.message, details=exc.details))
            return self._rejected(comparison_id, request, ra, dec, size, key, created_at, checks,
                                  [loaded_a, loaded_b], None, None, None, None, None)

        if reference_is_a:
            projected_a, projected_b = ref_projected, other_projected
        else:
            projected_a, projected_b = other_projected, ref_projected

        common = projected_a.valid & projected_b.valid
        common_pixels = int(common.sum())
        total = int(common.size)
        common_fraction = common_pixels / total if total else 0.0
        smaller = min(int(projected_a.valid.sum()), int(projected_b.valid.sum()))
        overlap_fraction = common_pixels / smaller if smaller else 0.0

        reprojection_info = ReprojectionInfo(
            method=config.interpolation,
            reference=config.reference,
            output_shape=[int(grid.shape[0]), int(grid.shape[1])],
            pixel_scale_arcsec=grid.pixel_scale_arcsec or 0.0,
            valid_fraction_a=projected_a.valid_fraction,
            valid_fraction_b=projected_b.valid_fraction,
            common_valid_pixels=common_pixels,
            common_coverage_fraction=common_fraction,
            overlap_fraction=overlap_fraction,
            flux_conserving=False,
            note=(
                "Interpolation of calibrated surface brightness on the reference pixel grid; "
                "not flux-conserving for aperture photometry. Invalid pixels are never zero-filled."
            ),
        )
        checks.append(
            _check(
                "reprojection",
                common_pixels > 0,
                "Both products reprojected onto the reference grid",
                "Reprojection produced no common valid pixels",
            )
        )
        coverage_ok = common_fraction >= self.settings.min_common_coverage
        checks.append(
            CheckResult(
                name="coverage",
                critical=True,
                status="PASS" if coverage_ok else "FAIL",
                message=(
                    f"Common valid coverage {common_fraction:.1%} of the output grid"
                    if coverage_ok
                    else f"Common valid coverage {common_fraction:.1%} is below the "
                    f"{self.settings.min_common_coverage:.0%} minimum"
                ),
                details={
                    "common_coverage_fraction": round(common_fraction, 6),
                    "overlap_fraction": round(overlap_fraction, 6),
                    "min_common_coverage": self.settings.min_common_coverage,
                },
            )
        )

        alignment = self._alignment(loaded_a, loaded_b, projected_a, projected_b, common, grid)
        checks.append(
            CheckResult(
                name="alignment",
                critical=True,
                status=alignment.status,
                message=alignment.message,
                details={
                    "residual_offset_px": alignment.residual_offset_px,
                    "verified": alignment.verified,
                    "peak_confidence": alignment.peak_confidence,
                },
            )
        )

        background_a = estimate_background(loaded_a.image.data, loaded_a.valid)
        background_b = estimate_background(loaded_b.image.data, loaded_b.valid)
        backgrounds = [
            _background_info(background_a, config.background_correction),
            _background_info(background_b, config.background_correction),
        ]
        background_details = {
            "correction": config.background_correction,
            "levels": [item.level for item in backgrounds],
            "variation": [item.mesh_variation for item in backgrounds],
            "reliable": [item.reliable for item in backgrounds],
        }
        if config.background_correction == "none":
            checks.append(
                CheckResult(
                    name="background",
                    critical=True,
                    status="NOT_VERIFIED",
                    message=(
                        "Background correction is disabled; additive sky offsets are neither removed "
                        "nor verified, so the difference cannot be attributed to the sky signal alone"
                    ),
                    details=background_details,
                )
            )
        elif all(item.reliable for item in backgrounds):
            checks.append(
                CheckResult(
                    name="background",
                    critical=True,
                    status="PASS",
                    message="Background estimated and subtracted from both products",
                    details=background_details,
                )
            )
        else:
            checks.append(
                CheckResult(
                    name="background",
                    critical=True,
                    status="NOT_VERIFIED",
                    message=(
                        "Background estimate is unreliable for at least one product; the additive "
                        "offset cannot be verified"
                    ),
                    details=background_details,
                )
            )

        photometric = self._photometric(loaded_a, loaded_b, projected_a, projected_b, common, config)
        if photometric.units_compatible is False:
            units_status = "FAIL"
            units_message = f"BUNIT mismatch ({photometric.bunit_a!r} vs {photometric.bunit_b!r}); no supported conversion"
        elif photometric.units_compatible is None:
            units_status = "NOT_VERIFIED"
            units_message = "One or both products have no BUNIT; photometric compatibility is unknown"
        else:
            units_status = "PASS"
            units_message = f"Compatible units ({photometric.bunit_a})"
        checks.append(CheckResult(name="units", critical=True, status=units_status, message=units_message,
                                  details={"bunit_a": photometric.bunit_a, "bunit_b": photometric.bunit_b}))
        checks.append(
            CheckResult(
                name="photometric",
                critical=True,
                status="PASS" if photometric.absolute_calibration else "NOT_VERIFIED",
                message=photometric.note,
                details={
                    "scale_factor": photometric.scale_factor,
                    "method": photometric.scaling_method,
                    "absolute_calibration": photometric.absolute_calibration,
                },
            )
        )

        mask_a = loaded_a.inspection.mask
        mask_b = loaded_b.inspection.mask
        missing_masks = [label for label, item in (("A", mask_a), ("B", mask_b)) if not item.available]
        checks.append(
            CheckResult(
                name="masking",
                critical=True,
                status="NOT_VERIFIED" if missing_masks else "PASS",
                message=(
                    f"No FLAGS extension for product(s) {', '.join(missing_masks)}; only non-finite "
                    "pixels are masked, so masked-source contamination is unverified"
                    if missing_masks
                    else "FLAGS mask applied to both products (informational bits SOURCE/FULLSAMPLE preserved)"
                ),
                details={
                    "mask_available": [mask_a.available, mask_b.available],
                    "invalid_fraction": [mask_a.invalid_fraction, mask_b.invalid_fraction],
                },
            )
        )

        variance_a = projected_a.variance
        variance_b = projected_b.variance
        uncertainty_available = variance_a is not None and variance_b is not None
        variance_fractions = [projected_a.variance_valid_fraction, projected_b.variance_valid_fraction]
        variance_complete = uncertainty_available and all(
            fraction is not None and fraction >= 0.99 for fraction in variance_fractions
        )
        if variance_complete:
            uncertainty_status = "PASS"
            uncertainty_message = (
                "VARIANCE extensions propagated with squared interpolation weights; "
                "sigma_D^2 = sigma_b^2 + alpha^2 sigma_a^2 (independent per-pixel errors)"
            )
        elif uncertainty_available:
            uncertainty_status = "NOT_VERIFIED"
            uncertainty_message = (
                "VARIANCE extensions exist but the propagated variance is incomplete over the common "
                f"footprint (finite fractions {variance_fractions}); the difference uncertainty is partial"
            )
        else:
            uncertainty_status = "NOT_VERIFIED"
            uncertainty_message = (
                "At least one product lacks a VARIANCE extension; the difference has no propagated uncertainty"
            )
        checks.append(
            CheckResult(
                name="uncertainty",
                critical=True,
                status=uncertainty_status,
                message=uncertainty_message,
                details={
                    "uncertainty_available": uncertainty_available,
                    "variance_valid_fraction": variance_fractions,
                    "propagation": "V_out = sum_i w_i^2 V_i (per-pixel variance only; covariance not modelled)",
                    "covariance_modelled": False,
                },
            )
        )

        psf = self._psf(loaded_a, loaded_b, config, grid.pixel_scale_arcsec)
        checks.append(
            CheckResult(
                name="psf",
                critical=True,
                status=psf.status,
                message=psf.note,
                details={
                    "ratio": psf.ratio,
                    "verified": psf.verified,
                    "matched": psf.matched,
                    "matching_supported": psf.matching_supported,
                    "spatially_varying": psf.spatially_varying,
                },
            )
        )

        quality = _quality(checks)
        scientifically_valid = _scientifically_valid(checks)
        inputs = [_input_product(item) for item in (loaded_a, loaded_b)]

        if quality.overall_status == "FAIL":
            return self._rejected(
                comparison_id, request, ra, dec, size, key, created_at, checks,
                [loaded_a, loaded_b], reprojection_info, alignment, backgrounds, photometric, psf,
            )

        difference = self._difference(
            comparison_id, key, loaded_a, loaded_b, projected_a, projected_b,
            common, background_a, background_b, photometric, psf, config, grid, quality,
        )
        provenance = self._provenance(
            comparison_id, created_at, key, loaded_a, loaded_b, config, grid,
            backgrounds, photometric, psf, uncertainty_available, quality,
        )
        return ComparisonResponse(
            comparison_id=comparison_id,
            status="completed",
            scientifically_valid=scientifically_valid,
            target=Target(ra=ra, dec=dec),
            config=config,
            inputs=inputs,
            reprojection=reprojection_info,
            alignment=alignment,
            backgrounds=backgrounds,
            photometric=photometric,
            psf=psf,
            difference=difference,
            quality=quality,
            provenance=provenance,
            metadata=ComparisonMetadata(size_deg=size),
        )

    # --------------------------------------------------------------- alignment
    def _alignment(
        self,
        loaded_a: _Loaded,
        loaded_b: _Loaded,
        projected_a: Any,
        projected_b: Any,
        common: np.ndarray,
        grid: CommonGrid,
    ) -> AlignmentInfo:
        shift = measure_residual_shift(projected_a.data, projected_b.data, common)
        pixel_scale = grid.pixel_scale_arcsec
        offset_px = math.hypot(shift.dx_px, shift.dy_px)
        offset_arcsec = offset_px * pixel_scale if pixel_scale is not None else None

        target_a = _target_pixel(loaded_a)
        target_b = _target_pixel(loaded_b)
        scale_a = pixel_scale_arcsec(loaded_a.wcs)
        scale_b = pixel_scale_arcsec(loaded_b.wcs)
        scale_ratio = scale_a / scale_b if scale_a and scale_b else None
        orientation_a = loaded_a.inspection.wcs.orientation_deg
        orientation_b = loaded_b.inspection.wcs.orientation_deg
        orientation_diff = None
        if orientation_a is not None and orientation_b is not None:
            orientation_diff = abs((orientation_a - orientation_b + 180.0) % 360.0 - 180.0)

        if not shift.verified:
            status = "NOT_VERIFIED"
            message = (
                "Residual alignment could not be independently verified: the images share too "
                "little correlated structure for phase correlation"
            )
        elif offset_px > self.settings.max_alignment_residual_px:
            status = "FAIL"
            message = (
                f"Residual misalignment {offset_px:.2f} px exceeds the "
                f"{self.settings.max_alignment_residual_px:.2f} px limit"
            )
        else:
            status = "PASS"
            message = f"Residual misalignment {offset_px:.2f} px after reprojection"

        return AlignmentInfo(
            target_pixel_a=target_a,
            target_pixel_b=target_b,
            pixel_scale_ratio=_round(scale_ratio, 6),
            orientation_difference_deg=_round(orientation_diff, 4),
            residual_dx_px=_round(shift.dx_px, 4),
            residual_dy_px=_round(shift.dy_px, 4),
            residual_offset_px=_round(offset_px, 4),
            residual_offset_arcsec=_round(offset_arcsec, 4),
            peak_confidence=_round(shift.confidence, 3),
            verified=shift.verified,
            status=status,
            message=message,
        )

    # ------------------------------------------------------------ photometry
    def _photometric(
        self,
        loaded_a: _Loaded,
        loaded_b: _Loaded,
        projected_a: Any,
        projected_b: Any,
        common: np.ndarray,
        config: ComparisonConfig,
    ) -> PhotometricInfo:
        bunit_a = loaded_a.inspection.stats.bunit
        bunit_b = loaded_b.inspection.stats.bunit
        compatible = _units_compatible(bunit_a, bunit_b)

        if compatible is False:
            return PhotometricInfo(
                bunit_a=bunit_a,
                bunit_b=bunit_b,
                units_compatible=False,
                scale_factor=1.0,
                scaling_method=config.photometric_scaling,
                absolute_calibration=False,
                note="Incompatible units; subtraction is not scientifically supported",
            )

        scale = 1.0
        note = "Calibrated surface-brightness units; alpha = 1 by construction (no data-derived scaling)"
        if config.photometric_scaling == "median_ratio" and common.any():
            ratio = _robust_ratio(projected_b.data, projected_a.data, common)
            if ratio is not None:
                scale = ratio
                note = (
                    "alpha estimated from the sigma-clipped median ratio of the two images; "
                    "this is a relative scale and can absorb real variability"
                )
            else:
                note = "Median-ratio scaling requested but no usable pixels; alpha = 1"

        absolute = (
            compatible is True
            and config.photometric_scaling == "none"
            and loaded_a.detail.calib_level == 2
            and loaded_b.detail.calib_level == 2
        )
        return PhotometricInfo(
            bunit_a=bunit_a,
            bunit_b=bunit_b,
            units_compatible=compatible,
            scale_factor=_round(scale, 8) or 1.0,
            scaling_method=config.photometric_scaling,
            absolute_calibration=bool(absolute),
            note=note,
        )

    # -------------------------------------------------------------------- PSF
    def _psf(
        self,
        loaded_a: _Loaded,
        loaded_b: _Loaded,
        config: ComparisonConfig,
        grid_pixel_scale: float | None,
    ) -> PsfCompatibility:
        """Compare EPSF widths and, only on request, apply a global Gaussian match.

        What is implemented: a single global FWHM per product, derived from the
        median EPSF kernel, compared through a ratio, and an optional Gaussian
        convolution that broadens the sharper product to the broader FWHM.
        What is *not* implemented: resampling of the actual EPSF kernels,
        spatially varying PSF matching, or matching of non-Gaussian profiles.
        """
        fwhm_a = loaded_a.inspection.psf.fwhm_arcsec
        fwhm_b = loaded_b.inspection.psf.fwhm_arcsec
        metadata_a = bool(loaded_a.inspection.psf.available)
        metadata_b = bool(loaded_b.inspection.psf.available)
        ratio = None
        if fwhm_a and fwhm_b:
            ratio = max(fwhm_a, fwhm_b) / min(fwhm_a, fwhm_b)
        verified = fwhm_a is not None and fwhm_b is not None
        base = {
            "metadata_available_a": metadata_a,
            "metadata_available_b": metadata_b,
            "fwhm_a_arcsec": fwhm_a,
            "fwhm_b_arcsec": fwhm_b,
            "ratio": _round(ratio, 4),
            "verified": verified,
            "spatially_varying": False,
        }

        if config.psf_matching == "gaussian":
            if not verified or not grid_pixel_scale:
                return PsfCompatibility(
                    **base,
                    matching="gaussian",
                    matched=False,
                    matching_supported=False,
                    status="NOT_VERIFIED",
                    note=(
                        "PSF matching requested but the EPSF FWHM is unavailable for one or both "
                        "products; no convolution was applied and PSF compatibility is not verified"
                    ),
                )
            narrow, broad = sorted([fwhm_a, fwhm_b])
            sigma_arcsec = math.sqrt(max(broad ** 2 - narrow ** 2, 0.0)) / 2.3548200450309493
            sigma_px = sigma_arcsec / grid_pixel_scale
            if sigma_px < 0.05:
                return PsfCompatibility(
                    **base,
                    matching="gaussian",
                    matched=False,
                    matching_supported=True,
                    method="global_gaussian_convolution",
                    sigma_px=_round(sigma_px, 6),
                    status="PASS",
                    note="PSF FWHM difference is below 0.05 px; compatible without convolution",
                )
            return PsfCompatibility(
                **base,
                matching="gaussian",
                matched=True,
                matching_supported=True,
                method="global_gaussian_convolution",
                sigma_px=_round(sigma_px, 6),
                status="PASS",
                note=(
                    "Sharper product convolved to the broader EPSF FWHM using a Gaussian kernel "
                    f"(sigma = {sigma_px:.3f} px; EPSF approximated as one global Gaussian, "
                    "spatially varying PSF not modelled)"
                ),
            )

        if not verified:
            return PsfCompatibility(
                **base,
                matching="none",
                matched=False,
                matching_supported=False,
                status="NOT_VERIFIED",
                note=(
                    "No EPSF FWHM for one or both products; PSF compatibility could not be checked "
                    "and no matching was applied, so direct subtraction is not validated"
                ),
            )
        if ratio <= self.settings.psf_warn_ratio:
            status = "PASS"
            note = f"PSF FWHM ratio {ratio:.2f}; compatible within the warning threshold, no matching required"
        elif ratio <= self.settings.psf_fail_ratio:
            status = "WARNING"
            note = (
                f"PSF FWHM ratio {ratio:.2f} exceeds the {self.settings.psf_warn_ratio:.2f} warning "
                "threshold; residual structure may be instrumental and the comparison is not valid "
                "unless matching is requested"
            )
        else:
            status = "FAIL"
            note = (
                f"PSF FWHM ratio {ratio:.2f} exceeds the {self.settings.psf_fail_ratio:.2f} limit; "
                "direct subtraction is not scientifically valid without PSF matching"
            )
        return PsfCompatibility(
            **base,
            matching="none",
            matched=False,
            matching_supported=False,
            status=status,
            note=note,
        )

    # ------------------------------------------------------------- difference
    def _difference(
        self,
        comparison_id: str,
        key: str,
        loaded_a: _Loaded,
        loaded_b: _Loaded,
        projected_a: Any,
        projected_b: Any,
        common: np.ndarray,
        background_a: BackgroundInfo,
        background_b: BackgroundInfo,
        photometric: PhotometricInfo,
        psf: PsfCompatibility,
        config: ComparisonConfig,
        grid: CommonGrid,
        quality: QualityAssessment,
    ) -> DifferenceProduct:
        data_a = np.array(projected_a.data, dtype=np.float64, copy=True)
        data_b = np.array(projected_b.data, dtype=np.float64, copy=True)
        variance_a = projected_a.variance
        variance_b = projected_b.variance

        if config.background_correction == "median":
            if background_a.level is not None:
                data_a = data_a - background_a.level
            if background_b.level is not None:
                data_b = data_b - background_b.level

        if psf.matched and psf.fwhm_a_arcsec and psf.fwhm_b_arcsec and grid.pixel_scale_arcsec:
            sharper = "a" if psf.fwhm_a_arcsec < psf.fwhm_b_arcsec else "b"
            narrow, broad = sorted([psf.fwhm_a_arcsec, psf.fwhm_b_arcsec])
            sigma_arcsec = math.sqrt(max(broad ** 2 - narrow ** 2, 0.0)) / 2.3548200450309493
            sigma_px = sigma_arcsec / grid.pixel_scale_arcsec
            if sigma_px >= 0.05:
                if sharper == "a":
                    data_a, valid_a = _smooth(data_a, common, sigma_px)
                    data_b, valid_b = data_b, projected_b.valid
                    if variance_a is not None:
                        variance_a = _smooth_variance(variance_a, common, sigma_px)
                else:
                    data_b, valid_b = _smooth(data_b, common, sigma_px)
                    data_a, valid_a = data_a, projected_a.valid
                    if variance_b is not None:
                        variance_b = _smooth_variance(variance_b, common, sigma_px)
                common = common & valid_a & valid_b

        alpha = photometric.scale_factor
        difference = np.full(grid.shape, np.nan, dtype=np.float64)
        difference[common] = data_b[common] - alpha * data_a[common]

        variance_difference = None
        uncertainty_fraction = None
        if variance_a is not None and variance_b is not None:
            variance_difference = np.full(grid.shape, np.nan, dtype=np.float64)
            variance_difference[common] = variance_b[common] + alpha ** 2 * variance_a[common]
            finite = np.isfinite(variance_difference[common])
            uncertainty_fraction = float(finite.mean()) if finite.size else 0.0

        values = difference[common]
        statistics = DifferenceStatistics(
            valid_pixels=int(values.size),
            valid_fraction=float(values.size / difference.size) if difference.size else 0.0,
            min=float(values.min()) if values.size else None,
            max=float(values.max()) if values.size else None,
            mean=float(values.mean()) if values.size else None,
            median=float(np.median(values)) if values.size else None,
            std=float(values.std()) if values.size else None,
            robust_sigma=_robust_sigma(values),
        )

        unit = loaded_a.inspection.stats.bunit or loaded_b.inspection.stats.bunit
        header = grid.wcs.to_header(relax=True)
        header["BUNIT"] = (unit or "")
        header["COMPID"] = comparison_id
        header["OBSID1"] = _card(loaded_a.detail.obs_id)
        header["OBSID2"] = _card(loaded_b.detail.obs_id)
        header["DID1"] = _card(loaded_a.detail.obs_publisher_did)
        header["DID2"] = _card(loaded_b.detail.obs_publisher_did)
        header["BAND1"] = _card(loaded_a.detail.band)
        header["BAND2"] = _card(loaded_b.detail.band)
        header["ALPHA"] = (float(alpha), "photometric scale applied to image A")
        header["BGA"] = (float(background_a.level or 0.0), "background subtracted from A")
        header["BGB"] = (float(background_b.level or 0.0), "background subtracted from B")
        header["DIFFMETH"] = ("I_b - ALPHA*I_a", "difference model")
        header["REPROJ"] = (config.interpolation, "reprojection interpolation")
        header["PSFMATCH"] = ("gaussian" if psf.matched else "none", "PSF treatment")
        header["SWVERS"] = (_backend_version(), "Planet X backend version")
        header["CREATED"] = (datetime.now(timezone.utc).isoformat(timespec="seconds"), "UTC creation time")

        difference_path = self.settings.fits_dir / _artifact_name(key, "difference", ".fits")
        _write_primary(difference_path, difference.astype(np.float32), header)

        uncertainty_path = None
        if variance_difference is not None:
            uncertainty_header = header.copy()
            uncertainty_header["UNCTYPE"] = ("1-sigma standard deviation", "uncertainty definition")
            uncertainty_path = self.settings.fits_dir / _artifact_name(key, "uncertainty", ".fits")
            _write_primary(uncertainty_path, np.sqrt(variance_difference).astype(np.float32), uncertainty_header)

        mask_path = self.settings.fits_dir / _artifact_name(key, "mask", ".fits")
        mask_header = header.copy()
        mask_header["BUNIT"] = ("")
        mask_header["MASKVAL"] = ("1 = valid, 0 = invalid", "difference mask convention")
        _write_primary(mask_path, common.astype(np.uint8), mask_header)

        preview_path: Path | None = self.settings.previews_dir / _artifact_name(key, "preview", ".png")
        try:
            generate_preview(difference_path, preview_path, self.settings)
        except PlanetXError as exc:
            log.warning("difference_preview_failed", extra={"error": str(exc), "comparison_id": comparison_id})
            preview_path = None

        prefix = self.settings.api_prefix.rstrip("/")
        uncertainty_note = (
            "Propagated 1-sigma uncertainty from both VARIANCE extensions "
            "(squared interpolation weights, independent per-pixel errors; covariance not modelled)"
            if variance_difference is not None
            else "No propagated uncertainty: at least one product lacks a VARIANCE extension"
        )
        return DifferenceProduct(
            fits_url=f"{prefix}/files/{difference_path.name}",
            preview_url=f"{prefix}/files/{preview_path.name}" if preview_path else None,
            uncertainty_url=f"{prefix}/files/{uncertainty_path.name}" if uncertainty_path else None,
            mask_url=f"{prefix}/files/{mask_path.name}",
            width=int(grid.shape[1]),
            height=int(grid.shape[0]),
            unit=unit,
            uncertainty_available=variance_difference is not None,
            uncertainty_valid_fraction=uncertainty_fraction,
            uncertainty_note=uncertainty_note,
            statistics=statistics,
        )

    # ------------------------------------------------------------- provenance
    def _provenance(
        self,
        comparison_id: str,
        created_at: str,
        key: str,
        loaded_a: _Loaded,
        loaded_b: _Loaded,
        config: ComparisonConfig,
        grid: CommonGrid,
        backgrounds: list[BackgroundInfo],
        photometric: PhotometricInfo,
        psf: PsfCompatibility,
        uncertainty_available: bool,
        quality: QualityAssessment,
    ) -> ProvenanceInfo:
        header = grid.wcs.to_header(relax=True)
        return ProvenanceInfo(
            comparison_id=comparison_id,
            created_at=created_at,
            software=_software_versions(),
            algorithm="D = I_b - alpha * I_a on a common reprojected grid",
            reprojection_method=f"{config.interpolation} interpolation onto the reference WCS",
            reference_wcs={
                "ctype": [str(value) for value in (grid.wcs.wcs.ctype or [])],
                "crval": [float(value) for value in (header.get("CRVAL1", 0.0), header.get("CRVAL2", 0.0))],
                "crpix": [float(value) for value in (header.get("CRPIX1", 0.0), header.get("CRPIX2", 0.0))],
                "shape": [int(grid.shape[0]), int(grid.shape[1])],
                "pixel_scale_arcsec": grid.pixel_scale_arcsec,
            },
            background={
                "correction": config.background_correction,
                "levels": [item.level for item in backgrounds],
                "variation": [item.mesh_variation for item in backgrounds],
                "reliable": [item.reliable for item in backgrounds],
            },
            photometric={
                "method": config.photometric_scaling,
                "scale_factor": photometric.scale_factor,
                "units": [photometric.bunit_a, photometric.bunit_b],
                "absolute_calibration": photometric.absolute_calibration,
            },
            psf={
                "matching": config.psf_matching,
                "matched": psf.matched,
                "matching_supported": psf.matching_supported,
                "spatially_varying": psf.spatially_varying,
                "method": psf.method,
                "sigma_px": psf.sigma_px,
                "verified": psf.verified,
                "metadata_available": [psf.metadata_available_a, psf.metadata_available_b],
                "fwhm_arcsec": [psf.fwhm_a_arcsec, psf.fwhm_b_arcsec],
                "ratio": psf.ratio,
                "status": psf.status,
            },
            masking={
                "science_invalid": "non-finite pixels and non-informational FLAGS bits (SOURCE/FULLSAMPLE excluded)",
                "reprojection": "output pixel valid only if all contributing source pixels are valid",
                "difference": "NaN outside the common valid footprint",
            },
            uncertainty={
                "available": uncertainty_available,
                "model": "sigma_D^2 = sigma_b^2 + alpha^2 * sigma_a^2",
                "input_propagation": "V_out = sum_i w_i^2 V_i on the reference grid",
                "assumptions": "independent input-pixel noise; interpolation-correlated output noise not modelled",
                "covariance_modelled": False,
            },
            input_sha256={
                loaded_a.observation_id: loaded_a.inspection.fits_sha256,
                loaded_b.observation_id: loaded_b.inspection.fits_sha256,
            },
            quality={check.name: check.status for check in quality.checks},
            cache_key=key,
        )

    # ------------------------------------------------------------------ inputs
    def _load(self, observation_id: str, ra: float, dec: float, size: float) -> _Loaded:
        detail, path, source = self._resolve_artifact(observation_id, ra, dec, size)
        inspection = inspect_fits(
            path,
            observation_id=observation_id,
            obs_publisher_did=detail.obs_publisher_did,
            band=detail.band,
            target_ra=ra,
            target_dec=dec,
            source=source,
            source_url=detail.fits_access_url or "",
        )
        image = extract_science_image(path)
        wcs = celestial_wcs(image.header)
        valid = np.isfinite(image.data)
        if image.flags is not None:
            valid &= ~invalid_flag_mask(image.flags, image.flag_masks)
        return _Loaded(
            observation_id=observation_id,
            detail=detail,
            path=path,
            source=source,
            inspection=inspection,
            image=image,
            wcs=wcs,
            valid=valid,
        )

    def _resolve_artifact(
        self, observation_id: str, ra: float | None, dec: float | None, size: float | None
    ) -> tuple[Any, Path, str]:
        resolved = resolve_observation_artifact(
            self.observations,
            observation_id,
            ra,
            dec,
            size,
            default_size=self.settings.comparison_size_deg,
        )
        return resolved.detail, resolved.path, resolved.source

    # ----------------------------------------------------------------- storage
    def _store(self, result: ComparisonResponse) -> None:
        path = self.settings.comparisons_dir / f"{result.comparison_id}.json"
        temp = path.with_suffix(".json.part")
        temp.write_text(result.model_dump_json(), encoding="utf-8")
        os.replace(temp, path)

    def _rejected(
        self,
        comparison_id: str,
        request: CompareRequest,
        ra: float,
        dec: float,
        size: float,
        key: str,
        created_at: str,
        checks: list[CheckResult],
        loaded: list[_Loaded],
        reprojection: ReprojectionInfo | None,
        alignment: AlignmentInfo | None,
        backgrounds: list[BackgroundInfo] | None,
        photometric: PhotometricInfo | None,
        psf: PsfCompatibility | None,
    ) -> ComparisonResponse:
        quality = _quality(checks)
        result = ComparisonResponse(
            comparison_id=comparison_id,
            status="rejected",
            scientifically_valid=False,
            target=Target(ra=ra, dec=dec),
            config=request.config,
            inputs=[_input_product(item) for item in loaded],
            reprojection=reprojection,
            alignment=alignment,
            backgrounds=backgrounds,
            photometric=photometric,
            psf=psf,
            difference=None,
            quality=quality,
            provenance=ProvenanceInfo(
                comparison_id=comparison_id,
                created_at=created_at,
                software=_software_versions(),
                algorithm="prerequisite validation only; no difference image produced",
                reprojection_method="not applied",
                reference_wcs={},
                background={},
                photometric={},
                psf={},
                masking={},
                uncertainty={"available": False},
                input_sha256={item.observation_id: item.inspection.fits_sha256 for item in loaded},
                quality={check.name: check.status for check in checks},
                cache_key=key,
            ),
            metadata=ComparisonMetadata(size_deg=size),
        )
        log.info(
            "image_comparison_rejected",
            extra={"comparison_id": comparison_id, "failed": [c.name for c in checks if c.status == "FAIL"]},
        )
        return result


# ----------------------------------------------------------------- background
def estimate_background(data: np.ndarray, valid: np.ndarray, mesh: int = 4) -> BackgroundInfo:
    """Sigma-clipped global median plus a coarse mesh variation estimate."""
    values = data[valid]
    if values.size < 25:
        return BackgroundInfo(
            method="median", level=None, sigma=None, mesh_variation=None, reliable=False,
            applied=False, note="Too few valid pixels to estimate a background",
        )
    _, level, sigma = sigma_clipped_stats(values, sigma=3.0, maxiters=5)
    level = float(level)
    sigma = float(sigma)

    ny, nx = data.shape
    medians: list[float] = []
    for rows in np.array_split(np.arange(ny), mesh):
        for columns in np.array_split(np.arange(nx), mesh):
            block = data[np.ix_(rows, columns)]
            block_valid = valid[np.ix_(rows, columns)]
            if block_valid.sum() < max(25, int(0.2 * block.size)):
                continue
            _, block_median, _ = sigma_clipped_stats(block[block_valid], sigma=3.0, maxiters=5)
            if math.isfinite(block_median):
                medians.append(float(block_median))
    variation = float(np.std(medians)) if len(medians) >= 2 else None
    tolerance = max(5.0 * sigma, 0.5 * abs(level), _PHOTOMETRIC_EPSILON)
    reliable = math.isfinite(level) and (variation is None or variation <= tolerance)

    return BackgroundInfo(
        method="median",
        level=_round(level, 12),
        sigma=_round(sigma, 12),
        mesh_variation=_round(variation, 12),
        reliable=bool(reliable),
        applied=False,
        note=(
            f"Sigma-clipped median over {int(values.size)} valid pixels "
            f"({len(medians)} mesh blocks)"
        ),
    )


def _background_info(estimate: BackgroundInfo, correction: str) -> BackgroundInfo:
    applied = correction == "median" and estimate.level is not None
    return estimate.model_copy(
        update={
            "method": correction if correction in ("none", "median") else "median",
            "applied": applied,
            "note": estimate.note if applied else "Background correction disabled; original calibrated values preserved",
        }
    )


# --------------------------------------------------------------------- helpers
def _check(name: str, passed: bool, ok: str, failed: str) -> CheckResult:
    return CheckResult(
        name=name,
        critical=True,
        status="PASS" if passed else "FAIL",
        message=ok if passed else failed,
    )


def _quality(checks: list[CheckResult]) -> QualityAssessment:
    return QualityAssessment(
        overall_status=_overall(checks),
        checks=checks,
        critical_checks=[check.name for check in checks if check.critical],
        failed_checks=[check.name for check in checks if check.status == "FAIL"],
        unverified_checks=[check.name for check in checks if check.status == "NOT_VERIFIED"],
        warnings=[check.message for check in checks if check.status != "PASS"],
    )


def _overall(checks: list[CheckResult]) -> str:
    if any(check.status == "FAIL" for check in checks):
        return "FAIL"
    if any(check.status == "NOT_VERIFIED" for check in checks):
        return "NOT_VERIFIED"
    if any(check.status == "WARNING" for check in checks):
        return "WARNING"
    return "PASS"


def _scientifically_valid(checks: list[CheckResult]) -> bool:
    """A comparison is scientifically valid only when every critical check is PASS.

    ``WARNING``, ``FAIL`` and ``NOT_VERIFIED`` on a critical check all prevent an
    unconditional valid result; the individual statuses stay in the response.
    """
    return all(check.status == "PASS" for check in checks if check.critical)


def _input_product(item: _Loaded) -> InputProduct:
    return InputProduct(
        observation_id=item.observation_id,
        obs_publisher_did=item.detail.obs_publisher_did,
        obs_id=item.detail.obs_id,
        band=item.detail.band,
        observation_time=item.detail.start_time,
        bunit=item.inspection.stats.bunit,
        shape=item.inspection.stats.shape,
        pixel_scale_arcsec=item.inspection.wcs.pixel_scale_arcsec,
        fwhm_arcsec=item.inspection.psf.fwhm_arcsec,
        fits_sha256=item.inspection.fits_sha256,
        source=item.source,
    )


def _units_compatible(unit_a: str | None, unit_b: str | None) -> bool | None:
    if not unit_a or not unit_b:
        return None
    return _normalize_unit(unit_a) == _normalize_unit(unit_b)


def _normalize_unit(unit: str) -> str:
    return " ".join(unit.replace("**", "^").split()).lower()


def _robust_ratio(numerator: np.ndarray, denominator: np.ndarray, mask: np.ndarray) -> float | None:
    usable = mask & np.isfinite(numerator) & np.isfinite(denominator) & (np.abs(denominator) > _PHOTOMETRIC_EPSILON)
    if usable.sum() < 25:
        return None
    ratio = numerator[usable] / denominator[usable]
    _, median, _ = sigma_clipped_stats(ratio, sigma=3.0, maxiters=5)
    value = float(median)
    return value if math.isfinite(value) and value > 0 else None


def _smooth(data: np.ndarray, valid: np.ndarray, sigma: float) -> tuple[np.ndarray, np.ndarray]:
    """Normalised convolution so masked pixels do not leak into the result."""
    weights = gaussian_filter(valid.astype(np.float64), sigma, mode="constant", cval=0.0)
    numerator = gaussian_filter(np.where(valid, data, 0.0), sigma, mode="constant", cval=0.0)
    out = np.full(data.shape, np.nan, dtype=np.float64)
    good = weights > 0.2
    out[good] = numerator[good] / weights[good]
    return out, good


def _smooth_variance(variance: np.ndarray, valid: np.ndarray, sigma: float) -> np.ndarray:
    """White-noise variance after normalised Gaussian smoothing."""
    weights = gaussian_filter(valid.astype(np.float64), sigma, mode="constant", cval=0.0)
    numerator = gaussian_filter(np.where(valid & np.isfinite(variance), variance, 0.0), sigma,
                                mode="constant", cval=0.0)
    out = np.full(variance.shape, np.nan, dtype=np.float64)
    good = weights > 0.2
    out[good] = numerator[good] / weights[good] * (1.0 / (4.0 * math.pi * sigma ** 2))
    return out


def _robust_sigma(values: np.ndarray) -> float | None:
    if values.size < 2:
        return None
    median = float(np.median(values))
    return _round(1.4826 * float(np.median(np.abs(values - median))), 12)


def _target_pixel(item: _Loaded) -> list[float] | None:
    if item.inspection.wcs.target_pixel is not None:
        return item.inspection.wcs.target_pixel
    return None


def _artifact_name(key: str, kind: str, suffix: str) -> str:
    return hashlib.sha256(f"{key}|{kind}".encode("utf-8")).hexdigest() + suffix


def _write_primary(path: Path, data: np.ndarray, header: fits.Header) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(f"{path.stem}.{uuid.uuid4().hex}.part")
    try:
        fits.PrimaryHDU(data=data, header=header).writeto(temp, overwrite=True, output_verify="silentfix")
        os.replace(temp, path)
    finally:
        try:
            temp.unlink(missing_ok=True)
        except OSError:
            pass


def _card(value: str | None) -> str:
    return (value or "")[:68]


def _cache_key(request: CompareRequest, ra: float, dec: float, size: float) -> str:
    payload = {
        "a": request.observation_id_a,
        "b": request.observation_id_b,
        "ra": round(ra, 8),
        "dec": round(dec, 8),
        "size": round(size, 6),
        "config": request.config.model_dump(),
    }
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode("utf-8")).hexdigest()


def _backend_version() -> str:
    try:
        from app.main import VERSION

        return VERSION
    except Exception:  # pragma: no cover - defensive
        return "unknown"


def _software_versions() -> dict[str, str]:
    return {
        "planet_x_backend": _backend_version(),
        "python": platform.python_version(),
        "numpy": np.__version__,
        "astropy": astropy.__version__,
        "scipy": scipy.__version__,
    }


def _round(value: float | None, digits: int) -> float | None:
    if value is None:
        return None
    number = float(value)
    return round(number, digits) if math.isfinite(number) else None
