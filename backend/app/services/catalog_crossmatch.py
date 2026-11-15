"""Coordinate cross-matching against Gaia DR3.

Separations are great-circle distances in arcseconds; candidate positions are
optionally propagated from the Gaia reference epoch (J2016.0) to the external
observation epoch with Astropy's validated ``apply_space_motion`` (ERFA ``pmsafe``).

What this engine does **not** claim: a coordinate match is not a physical association,
and propagation is not a full covariance treatment — positional errors of the external
source and the propagated Gaia uncertainty are not combined into a joint significance.
"""

from __future__ import annotations

import logging
import math
import warnings

from astropy.coordinates import SkyCoord
from astropy.time import Time
import astropy.units as u

from app.core.exceptions import InvalidRadiusError
from app.core.validation import validate_coordinates
from app.schemas.gaia import (
    CrossMatchCandidate,
    CrossMatchConfig,
    CrossMatchEpochInfo,
    CrossMatchResponse,
    CrossMatchResult,
    CrossMatchTarget,
    GaiaSource,
)
from app.services.gaia_service import GaiaService, angular_separation_arcsec

log = logging.getLogger(__name__)

#: Epochs closer than this to the Gaia reference epoch need no propagation.
_EPOCH_TOLERANCE_YR = 0.01


def epoch_propagation(
    source: GaiaSource, target_epoch: float | None
) -> CrossMatchEpochInfo:
    """Propagate a Gaia position from its reference epoch to ``target_epoch``.

    Propagation requires the source's ``pmra``/``pmdec`` at the Gaia reference epoch
    and a target epoch at least ``_EPOCH_TOLERANCE_YR`` away. ``pmra`` is ``μα*``
    (includes cos δ), which is exactly what Astropy's ``pm_ra_cosdec`` expects. Missing
    or invalid proper motion → no propagation, with an explicit limitation.
    """
    info = CrossMatchEpochInfo(requested_epoch=target_epoch)
    info.gaia_reference_epoch = source.coordinates.reference_epoch
    if target_epoch is None:
        info.limitation = "No observation epoch supplied; the Gaia catalogue position (2016.0) was used as-is"
        return info
    delta = target_epoch - source.coordinates.reference_epoch
    if abs(delta) < _EPOCH_TOLERANCE_YR:
        info.limitation = None
        return info
    if source.astrometry.pmra_mas_yr is None or source.astrometry.pmdec_mas_yr is None:
        info.limitation = (
            f"Proper motion unavailable for this source; the Gaia catalogue position "
            f"(epoch {source.coordinates.reference_epoch}) was used unpropagated over "
            f"{delta:.2f} yr"
        )
        return info

    try:
        with warnings.catch_warnings():
            # ERFA pmsafe notes "distance overridden" when no parallax-based distance is
            # supplied; for decade-scale, sub-arcsecond proper motions this perspective
            # term is negligible. Not an error and not hidden from the caller: the
            # propagated flag below is only True when propagation actually ran.
            warnings.simplefilter("ignore", Warning)
            catalogue = SkyCoord(
                ra=source.coordinates.ra * u.deg,
                dec=source.coordinates.dec * u.deg,
                pm_ra_cosdec=source.astrometry.pmra_mas_yr * u.mas / u.yr,
                pm_dec=source.astrometry.pmdec_mas_yr * u.mas / u.yr,
                frame="icrs",
                obstime=Time(source.coordinates.reference_epoch, format="jyear"),
            )
            propagated = catalogue.apply_space_motion(new_obstime=Time(target_epoch, format="jyear"))
    except (ValueError, TypeError) as exc:
        info.limitation = f"Epoch propagation failed ({exc}); the catalogue position was used unpropagated"
        return info

    info.propagated = True
    info.propagated_ra = float(propagated.ra.deg % 360.0)
    info.propagated_dec = float(propagated.dec.deg)
    return info


class CatalogCrossMatcher:
    """Match external coordinates against Gaia DR3 candidates."""

    def __init__(self, service: GaiaService) -> None:
        self.service = service

    def crossmatch(
        self, targets: list[CrossMatchTarget], config: CrossMatchConfig | None = None
    ) -> CrossMatchResponse:
        config = config or CrossMatchConfig()
        if len(targets) > self.service.settings.gaia_max_crossmatch_coordinates:
            raise ValueError(
                f"at most {self.service.settings.gaia_max_crossmatch_coordinates} coordinates per request"
            )
        radius = self._validate_radius(config.radius_arcsec)

        results: list[CrossMatchResult] = []
        for target in targets:
            results.append(self._match_one(target, radius, config))

        return CrossMatchResponse(
            catalog=self.service.settings.gaia_catalog,
            config=config,
            results=results,
            matched=sum(1 for item in results if item.status == "MATCHED"),
            ambiguous=sum(1 for item in results if item.status == "AMBIGUOUS"),
            unmatched=sum(1 for item in results if item.status == "UNMATCHED"),
        )

    # ------------------------------------------------------------------ internals
    def _validate_radius(self, radius_arcsec: float) -> float:
        if not isinstance(radius_arcsec, (int, float)) or not math.isfinite(radius_arcsec) or radius_arcsec <= 0:
            raise InvalidRadiusError("radius_arcsec must be positive", details={"radius_arcsec": radius_arcsec})
        max_radius = self.service.settings.gaia_max_search_radius_arcsec
        if radius_arcsec > max_radius:
            raise InvalidRadiusError(
                f"radius_arcsec must not exceed {max_radius}",
                details={"radius_arcsec": radius_arcsec, "max": max_radius},
            )
        return float(radius_arcsec)

    def _match_one(self, target: CrossMatchTarget, radius: float, config: CrossMatchConfig) -> CrossMatchResult:
        target.ra, target.dec = validate_coordinates(target.ra, target.dec)

        # Candidate cone uses the catalogue (2016.0) positions plus a margin so that
        # sources which propagate into the match radius are not missed. Candidates are
        # filtered on the separation actually used for the match decision below.
        margin = (
            config.propagation_margin_arcsec
            if config.propagate_proper_motion and target.epoch is not None
            else 0.0
        )
        cone = self.service.cone_search(
            ra=target.ra,
            dec=target.dec,
            radius_arcsec=radius + margin,
            limit=self.service.settings.gaia_max_results,
        )
        if not cone.sources:
            return CrossMatchResult(
                external_id=target.external_id,
                status="UNMATCHED",
                candidates=[],
                best=None,
                ambiguity_note=None,
                epoch=CrossMatchEpochInfo(requested_epoch=target.epoch),
            )

        scored: list[tuple[CrossMatchCandidate, CrossMatchEpochInfo]] = []
        for source, catalogue_sep in zip(cone.sources, cone.separations_arcsec):
            epoch_info = (
                epoch_propagation(source, target.epoch)
                if config.propagate_proper_motion
                else CrossMatchEpochInfo(requested_epoch=target.epoch)
            )
            used_sep = (
                angular_separation_arcsec(
                    target.ra, target.dec, epoch_info.propagated_ra, epoch_info.propagated_dec
                )
                if epoch_info.propagated and epoch_info.propagated_ra is not None
                else catalogue_sep
            )
            if used_sep <= radius:
                scored.append(
                    (
                        CrossMatchCandidate(
                            separation_arcsec=round(used_sep, 6),
                            separation_propagated_arcsec=(
                                round(used_sep, 6) if epoch_info.propagated else None
                            ),
                            source=source,
                        ),
                        epoch_info,
                    )
                )
        scored.sort(key=lambda item: item[0].separation_arcsec)

        candidates = [item[0] for item in scored]
        best_info = scored[0][1] if scored else CrossMatchEpochInfo(requested_epoch=target.epoch)

        ambiguity_note: str | None = None
        if not candidates:
            status = "UNMATCHED"
        elif len(candidates) > config.ambiguous_when_more_than:
            status = "AMBIGUOUS"
            ambiguity_note = (
                f"{len(candidates)} Gaia sources lie within {radius}\"; no unique counterpart "
                "can be selected from position alone"
            )
        else:
            status = "MATCHED"

        return CrossMatchResult(
            external_id=target.external_id,
            status=status,
            candidates=candidates,
            best=candidates[0] if candidates and status != "AMBIGUOUS" else None,
            ambiguity_note=ambiguity_note,
            epoch=best_info,
        )
