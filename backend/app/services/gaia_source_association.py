"""Gaia DR3 association for persisted Phase 3 sources.

Bridges the Phase 3 source catalogue (internal 32-hex source ids, persisted under
``storage/sources/``) to the Phase 5 Gaia engine. The internal id and Gaia's
numeric ``source_id`` are different namespaces and are reported under distinct
field names everywhere.

Match evaluation reuses :class:`~app.services.catalog_crossmatch.CatalogCrossMatcher`
in full (spherical separation, ambiguity, optional proper-motion propagation);
this module adds the Phase 3 source context: derived observation epoch and a
scalar positional-uncertainty significance statistic (assumptions documented on
the response, never fabricated from missing data).
"""

from __future__ import annotations

import logging
import math

from astropy.time import Time

from app.core.config import Settings
from app.schemas.gaia import (
    CrossMatchConfig,
    CrossMatchTarget,
    GaiaAssociationCandidate,
    GaiaAssociationEpoch,
    GaiaAssociationSignificance,
    SourceGaiaAssociationResponse,
)
from app.services.catalog_crossmatch import CatalogCrossMatcher
from app.services.source_catalog import SourceCatalogService

log = logging.getLogger(__name__)

#: Above this many detections the epoch mean is still fine (they cluster in
#: time); the bound only guards pathological inputs.
_MAX_EPOCH_SAMPLES = 200


class SourceGaiaAssociationService:
    """Compute the Gaia DR3 counterpart candidates for one internal source."""

    def __init__(
        self,
        catalog: SourceCatalogService,
        crossmatcher: CatalogCrossMatcher,
        settings: Settings | None = None,
    ) -> None:
        self.catalog = catalog
        self.crossmatcher = crossmatcher
        self.settings = settings or crossmatcher.service.settings

    def associate(
        self,
        source_id: str,
        config: CrossMatchConfig | None = None,
    ) -> SourceGaiaAssociationResponse:
        """Associate a persisted Phase 3 source with Gaia DR3 candidates.

        Raises ``SourceNotFoundError``/``SourceStorageError`` (Phase 3 contract)
        for unknown/malformed internal ids or unreadable records — never a
        silent empty success for a missing source.
        """
        detail = self.catalog.source(source_id)
        source = detail.source
        config = config or CrossMatchConfig()

        epoch_info = self._observation_epoch(source)
        target = CrossMatchTarget(
            external_id=source.source_id,
            ra=source.reference_ra_deg,
            dec=source.reference_dec_deg,
            epoch=epoch_info.julian_year,
        )
        match = self.crossmatcher.crossmatch([target], config)
        result = match.results[0]

        candidates = [
            GaiaAssociationCandidate(
                gaia_source_id=candidate.source.source_id,
                separation_arcsec=candidate.separation_arcsec,
                separation_propagated_arcsec=candidate.separation_propagated_arcsec,
                source=candidate.source,
            )
            for candidate in result.candidates
        ]
        best = (
            GaiaAssociationCandidate(
                gaia_source_id=result.best.source.source_id,
                separation_arcsec=result.best.separation_arcsec,
                separation_propagated_arcsec=result.best.separation_propagated_arcsec,
                source=result.best.source,
            )
            if result.best is not None
            else None
        )

        significance = self._significance(
            source.position_scatter_arcsec,
            result.best,
            status=result.status,
            n_candidates=len(result.candidates),
        )

        return SourceGaiaAssociationResponse(
            planetx_source_id=source.source_id,
            reference_ra_deg=source.reference_ra_deg,
            reference_dec_deg=source.reference_dec_deg,
            status=result.status,
            candidates=candidates,
            best=best,
            ambiguity_note=result.ambiguity_note,
            config=config,
            observation_epoch=epoch_info,
            propagation=result.epoch,
            significance=significance,
            phase3={
                "epoch_count": source.epoch_count,
                "detection_count": source.detection_count,
                "bands": source.bands,
                "position_scatter_arcsec": source.position_scatter_arcsec,
                "flags": source.flags,
                "association_method": source.association_method,
            },
            provenance=best.source.provenance if best is not None else None,
        )

    # ------------------------------------------------------------------ internals
    @staticmethod
    def _observation_epoch(source) -> GaiaAssociationEpoch:
        """Mean detection epoch in Julian years, with an explicit basis."""
        samples = [
            detection.measurement.time_mjd
            for detection in source.detections
            if detection.measurement.time_mjd is not None
        ][-_MAX_EPOCH_SAMPLES:]
        if not samples:
            return GaiaAssociationEpoch(
                limitation=(
                    "No detection timestamps on this source record; the Gaia "
                    "catalogue position (J2016.0) is used unpropagated"
                ),
            )
        mean_mjd = sum(samples) / len(samples)
        return GaiaAssociationEpoch(
            julian_year=float(Time(mean_mjd, format="mjd").jyear),
            basis=f"mean of {len(samples)} detection timestamps (time_mjd)",
            detection_count=len(samples),
        )

    def _significance(
        self,
        phase3_sigma_arcsec: float | None,
        best,
        *,
        status: str = "UNMATCHED",
        n_candidates: int = 0,
    ) -> GaiaAssociationSignificance:
        """Scalar positional significance for the best candidate (or None data).

        ``phase3_sigma_arcsec`` and the Gaia ``hypot(ra_error, dec_error)`` are
        *radial RMS* uncertainties (Phase 3's scatter is the RMS great-circle
        offset of detections from the reference position; Gaia's per-axis errors
        combine to the radial RMS E[D²]^½). The Rayleigh tail
        ``exp(-d²/(2σ²))`` needs the *per-axis* sigma, whose isotropic
        equivalent is the radial RMS divided by √2 — hence the ``/sqrt(2)``.
        Without it the exponent is halved and ``match_p_value`` is biased high
        (significance understated).
        """
        info = GaiaAssociationSignificance(
            phase3_sigma_arcsec=phase3_sigma_arcsec,
        )
        if best is None:
            if status == "AMBIGUOUS":
                info.limitation = (
                    f"Match is ambiguous ({n_candidates} candidates within the radius, no unique "
                    "best); significance is not evaluated for a non-unique counterpart"
                )
            else:
                info.limitation = "No candidate inside the match radius; significance not evaluated"
            return info
        gaia = best.source
        ra_error = gaia.coordinates.ra_error_mas
        dec_error = gaia.coordinates.dec_error_mas
        if ra_error is not None and dec_error is not None:
            # radial RMS in arcsec (per-axis errors combine to E[D²]^½)
            info.gaia_sigma_arcsec = math.hypot(ra_error, dec_error) / 1000.0
        if phase3_sigma_arcsec is None and info.gaia_sigma_arcsec is None:
            info.limitation = (
                "Neither the Phase 3 position scatter nor the Gaia ra/dec errors "
                "are available; significance not evaluated"
            )
            return info
        # Use whichever uncertainties exist; the combination is only possible
        # with both, and a single-source approximation is stated as such.
        if phase3_sigma_arcsec is not None and info.gaia_sigma_arcsec is not None:
            info.combined_sigma_arcsec = math.hypot(phase3_sigma_arcsec, info.gaia_sigma_arcsec) / math.sqrt(2.0)
        else:
            radial = phase3_sigma_arcsec or info.gaia_sigma_arcsec
            info.combined_sigma_arcsec = radial / math.sqrt(2.0)
            info.assumptions = info.assumptions + (
                "only one of the two uncertainty sources was available; the "
                "combined sigma is that single value",
            )
        info.normalized_separation = best.separation_arcsec / info.combined_sigma_arcsec
        # Rayleigh tail: P(D >= d) for a 2-D Gaussian offset with the isotropic
        # per-axis sigma derived from the radial-RMS inputs above.
        ratio = best.separation_arcsec / info.combined_sigma_arcsec
        info.match_p_value = math.exp(-0.5 * ratio * ratio)
        return info
