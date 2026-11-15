"""Extract a calibrated surface-brightness spectrum from a DR1 cube.

The output is a point sample, not an aperture measurement and not an integrated
source flux. Every unusable channel is retained in the table with a null flux and
an explicit reason, so a blank channel is never confused with a measured zero.
"""

from __future__ import annotations

import hashlib
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
from astropy.io import fits

from app.core.config import Settings, get_settings
from app.core.exceptions import SpectralExtractionError, SpectralProductUnsupportedError, SpectralTargetOutsideProductError
from app.core.versions import SPECTRAL_ALGORITHM_VERSION, software_versions
from app.schemas.spectra import (
    SpectralChannel,
    SpectralExtractionResponse,
    SpectralProvenance,
    SpectralQualitySummary,
    Spectrum,
)
from app.services.spectral_inspection import inspect_spectral_product

CUBE_FORMAT = "cube"


def extract_cube_spectrum(
    path: Path,
    *,
    ra: float,
    dec: float,
    collection: str,
    row: dict[str, Any],
    access_url: str,
    source_id: str | None = None,
    settings: Settings | None = None,
    inspection=None,
    spatial_method: str | None = None,
) -> SpectralExtractionResponse:
    """Sample every channel at ``(ra, dec)`` and return a persisted-ready response."""
    settings = settings or get_settings()
    method = spatial_method or settings.spectral_spatial_method
    if method not in {"bilinear", "nearest"}:
        raise SpectralExtractionError(
            "Unsupported spatial sampling method",
            details={"spatial_method": method},
        )

    inspection = inspection or inspect_spectral_product(
        path,
        target_ra=ra,
        target_dec=dec,
        row=row,
        settings=settings,
    )
    if inspection.product_format != CUBE_FORMAT:
        raise SpectralProductUnsupportedError(
            "Only the DR1 all-sky cube supports spectrum extraction",
            details={"product_format": inspection.product_format},
        )
    pixel = inspection.wcs.target_pixel
    if pixel is None:
        raise SpectralExtractionError(
            "The cube WCS could not map the requested position",
            details={"ra": ra, "dec": dec},
        )
    x, y = float(pixel[0]), float(pixel[1])
    if inspection.wcs.target_inside_image is False:
        raise SpectralTargetOutsideProductError(
            "The requested position is outside the cube tile",
            details={"ra": ra, "dec": dec, "pixel_x": x, "pixel_y": y},
        )

    with fits.open(path, memmap=True) as hdul:
        image = _science_image(hdul)
        if image is None or image.data is None or image.data.ndim != 3:
            raise SpectralProductUnsupportedError("Cube IMAGE extension is not 3-D")
        data = image.data
        channel_table = _channel_table(hdul)
        if channel_table is None:
            raise SpectralProductUnsupportedError("Cube has no SPECTRAL_CHANNELS table")
        if len(channel_table.data) != data.shape[0]:
            raise SpectralExtractionError(
                "Cube channel table length does not match the IMAGE channel axis",
                details={"table_rows": len(channel_table.data), "image_channels": int(data.shape[0])},
            )

        flux, partial = _sample_cube(data, x, y, method)
        nhits_values = _aux_values(hdul, "NHITS", data.shape, x, y)
        flags_values = _aux_values(hdul, "FLAGS", data.shape, x, y)
        table = _channel_columns(channel_table)
        channel_count = int(data.shape[0])

    blank_channels = set(inspection.channels.blank_channels)
    invalid_bits = tuple(inspection.invalid_flag_bits)
    invalid_mask = sum(1 << bit for bit in invalid_bits)
    flag_name_by_bit = {value: name for name, value in inspection.flag_bits.items()}

    channels: list[SpectralChannel] = []
    invalid_channels = 0
    partial_channels = 0
    for index in range(channel_count):
        value = flux[index]
        hits = int(nhits_values[index]) if nhits_values is not None else None
        raw_flags = int(flags_values[index]) if flags_values is not None else None
        is_blank = index in blank_channels
        no_coverage = hits == 0
        is_invalid = bool(raw_flags is not None and raw_flags & invalid_mask)
        applied: list[str] = []
        quality = "PASS"

        if is_blank:
            quality = "FAIL"
            applied = ["blank_channel"]
            value = math.nan
        elif no_coverage:
            quality = "FAIL"
            applied = ["no_coverage"]
            value = math.nan
        elif is_invalid:
            quality = "FAIL"
            invalid_channels += 1
            applied = [
                flag_name_by_bit.get(1 << bit, f"bit_{bit}")
                for bit in invalid_bits
                if raw_flags is not None and raw_flags & (1 << bit)
            ] or ["invalid_flag"]
            value = math.nan
        elif not np.isfinite(value):
            quality = "FAIL"
            applied = ["non_finite"]
            value = math.nan
        elif partial[index]:
            quality = "WARNING"
            partial_channels += 1

        usable = np.isfinite(value)
        channels.append(
            SpectralChannel(
                index=index,
                detector=table.detector[index],
                subchan=table.subchan[index],
                wavelength_um=table.wavelength[index],
                wl_min_um=table.wl_min[index],
                wl_max_um=table.wl_max[index],
                bandwidth_um=table.bandwidth[index],
                resolving_power=table.resolving_power[index],
                flux_mjy_sr=float(value) if usable else None,
                uncertainty_mjy_sr=None,
                nhits=hits,
                flags=raw_flags,
                flags_applied=applied,
                quality=quality,  # type: ignore[arg-type]
            )
        )

    valid_count = sum(1 for channel in channels if channel.flux_mjy_sr is not None)
    warnings = list(dict.fromkeys(inspection.warnings))
    if valid_count == 0:
        warnings.append("no_valid_channels")
    if invalid_channels:
        warnings.append("invalid_channels_masked")
    if partial_channels:
        warnings.append("partial_bilinear_coverage")
    if valid_count and not invalid_channels and not partial_channels:
        warnings.append("no_variance_extension")
    warnings = list(dict.fromkeys(warnings))

    measured = [channel.wavelength_um for channel in channels if channel.wavelength_um is not None]
    product_id = _text(row.get("obs_publisher_did")) or access_url
    spectrum_id = _spectrum_id(product_id, ra, dec, method)
    spectrum = Spectrum(
        spectrum_id=spectrum_id,
        source_id=source_id,
        collection=collection,
        product_id=product_id,
        obs_id=_text(row.get("obs_id")),
        obs_publisher_did=_text(row.get("obs_publisher_did")),
        ra_deg=ra,
        dec_deg=dec,
        pixel_x=x,
        pixel_y=y,
        channel_count=channel_count,
        valid_channel_count=valid_count,
        blank_channels=sorted(blank_channels),
        wavelength_min_um=min(measured) if measured else None,
        wavelength_max_um=max(measured) if measured else None,
        channels=channels,
        quality=SpectralQualitySummary(
            overall_status="FAIL" if valid_count == 0 else "WARNING",
            uncertainty_status="NOT_VERIFIED",
            warnings=warnings,
        ),
        limitations=[
            "cube_is_static_mosaic",
            "no_variance_extension",
            "surface_brightness_not_integrated_flux",
            "point_sample_no_aperture_or_psf_correction",
            f"spatial_sampling_{method}",
        ],
    )
    provenance = SpectralProvenance(
        created_at=datetime.now(timezone.utc).isoformat(),
        software=software_versions(),
        collection=collection,
        access_url=access_url,
        fits_sha256=inspection.fits_sha256,
        npix=inspection.metadata.npix,
        order=inspection.metadata.order,
        config={
            "spatial_method": method,
            "invalid_flag_bits": list(invalid_bits),
            "blank_channels": sorted(blank_channels),
        },
    )
    return SpectralExtractionResponse(spectrum=spectrum, provenance=provenance)


class _ChannelColumns:
    def __init__(self, table: fits.BinTableHDU | fits.TableHDU) -> None:
        names = {name.upper(): name for name in table.columns.names}
        length = len(table.data)

        def values(name: str, dtype=float):
            column = names.get(name)
            if column is None:
                return None
            array = np.asarray(table.data[column], dtype=dtype).ravel()
            return array if array.size == length else None

        wavelength = values("WAVELENGTH")
        if wavelength is None:
            wavelength = values("WAVE")
        resolving_power = values("R")
        if resolving_power is None:
            resolving_power = values("RESOLVING_POWER")
        self.wavelength = _float_list(wavelength, length)
        self.wl_min = _float_list(values("WL_MIN"), length)
        self.wl_max = _float_list(values("WL_MAX"), length)
        self.bandwidth = _float_list(values("BANDWIDTH"), length)
        self.resolving_power = _float_list(resolving_power, length)
        self.detector = _int_list(values("DETECTOR", int), length, low=1, high=6)
        self.subchan = _int_list(values("SUBCHAN", int), length, low=1, high=17)


def _sample_cube(
    data: np.ndarray,
    x: float,
    y: float,
    method: str,
) -> tuple[np.ndarray, np.ndarray]:
    ny, nx = int(data.shape[1]), int(data.shape[2])
    if ny == 0 or nx == 0:
        raise SpectralExtractionError("Cube has an empty spatial plane")
    nearest_x = int(np.clip(round(x), 0, nx - 1))
    nearest_y = int(np.clip(round(y), 0, ny - 1))

    if method == "nearest" or nx < 2 or ny < 2:
        flux = np.array(data[:, nearest_y, nearest_x], dtype=float, copy=True)
        return flux, np.zeros(flux.shape, dtype=bool)

    x0 = int(np.clip(math.floor(x), 0, nx - 2))
    y0 = int(np.clip(math.floor(y), 0, ny - 2))
    dx = float(x) - x0
    dy = float(y) - y0
    slab = np.array(data[:, y0 : y0 + 2, x0 : x0 + 2], dtype=float, copy=True)
    weights = np.array(
        [
            [(1.0 - dx) * (1.0 - dy), dx * (1.0 - dy)],
            [(1.0 - dx) * dy, dx * dy],
        ],
        dtype=float,
    )
    finite = np.isfinite(slab)
    weight_sum = np.sum(np.where(finite, weights[None, :, :], 0.0), axis=(1, 2))
    weighted = np.sum(np.where(finite, slab, 0.0) * weights[None, :, :], axis=(1, 2))
    flux = np.full(slab.shape[0], np.nan, dtype=float)
    np.divide(weighted, weight_sum, out=flux, where=weight_sum > 0)
    partial = np.any((weights[None, :, :] > 0) & ~finite, axis=(1, 2)) & (weight_sum > 0)
    return flux, partial


def _aux_values(
    hdul: fits.HDUList,
    name: str,
    shape: tuple[int, ...],
    x: float,
    y: float,
) -> np.ndarray | None:
    hdu = next((hdu for hdu in hdul if str(hdu.name).upper() == name and hdu.data is not None), None)
    if hdu is None or hdu.data.ndim != 3:
        return None
    ny, nx = int(shape[1]), int(shape[2])
    px = int(np.clip(round(x), 0, nx - 1))
    py = int(np.clip(round(y), 0, ny - 1))
    return np.array(hdu.data[:, py, px], dtype=np.int64, copy=True)


def _science_image(hdul: fits.HDUList) -> fits.ImageHDU | None:
    named = next((hdu for hdu in hdul if str(hdu.name).upper() == "IMAGE" and hdu.data is not None), None)
    if named is not None:
        return named  # type: ignore[return-value]
    for hdu in hdul:
        if hdu.data is not None and not isinstance(hdu, (fits.BinTableHDU, fits.TableHDU)) and hdu.data.ndim == 3:
            return hdu  # type: ignore[return-value]
    return None


def _channel_table(hdul: fits.HDUList) -> fits.BinTableHDU | fits.TableHDU | None:
    return next(
        (
            hdu
            for hdu in hdul
            if isinstance(hdu, (fits.BinTableHDU, fits.TableHDU))
            and hdu.data is not None
            and str(hdu.name).upper().replace("_", "-") in {"SPECTRAL-CHANNELS", "SPECTRAL_CHANNELS"}
        ),
        None,
    )


def _channel_columns(table: fits.BinTableHDU | fits.TableHDU) -> _ChannelColumns:
    return _ChannelColumns(table)


def _float_list(values: np.ndarray | None, length: int) -> list[float | None]:
    if values is None:
        return [None] * length
    return [float(value) if np.isfinite(value) and value > 0 else None for value in values]


def _int_list(values: np.ndarray | None, length: int, *, low: int, high: int) -> list[int | None]:
    if values is None:
        return [None] * length
    return [int(value) if low <= value <= high else None for value in values]


def _spectrum_id(product_id: str, ra: float, dec: float, method: str) -> str:
    material = f"{product_id}|{ra:.8f}|{dec:.8f}|{method}|{SPECTRAL_ALGORITHM_VERSION}"
    return hashlib.sha256(material.encode("utf-8")).hexdigest()[:32]


def _text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


__all__ = ["extract_cube_spectrum"]
