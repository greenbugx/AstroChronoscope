"""Gaia DR3 cone search and record retrieval: validation, caching, normalization."""

from __future__ import annotations

import hashlib
import logging
import math
from datetime import datetime, timezone
from typing import Any

from app.core.cache import CacheStore
from app.core.config import Settings, get_settings
from app.core.exceptions import (
    GaiaSourceNotFoundError,
    InvalidGaiaSourceIdError,
    InvalidRadiusError,
)
from app.core.validation import validate_coordinates
from app.schemas.gaia import (
    GAIA_DR3_CATALOG,
    GAIA_DR3_REFERENCE_EPOCH,
    GaiaAstrometry,
    GaiaConeSearchMetadata,
    GaiaConeSearchResponse,
    GaiaCoordinates,
    GaiaPhotometry,
    GaiaProvenance,
    GaiaSource,
)
from app.services.gaia_client import GaiaClient
from app.services.gaia_client import cone_search_adql, source_by_id_adql

log = logging.getLogger(__name__)


def angular_separation_arcsec(ra1: float, dec1: float, ra2: float, dec2: float) -> float:
    """Great-circle separation in arcseconds (spherical geometry, never Euclidean).

    Implemented via the haversine formula, which is numerically stable for small and
    near-antipodal separations and agrees with ``astropy SkyCoord.separation``.
    """
    ra1_r, ra2_r = math.radians(ra1), math.radians(ra2)
    dec1_r, dec2_r = math.radians(dec1), math.radians(dec2)
    dra = (ra2_r - ra1_r) / 2.0
    ddec = (dec2_r - dec1_r) / 2.0
    a = math.sin(ddec) ** 2 + math.cos(dec1_r) * math.cos(dec2_r) * math.sin(dra) ** 2
    return math.degrees(2.0 * math.asin(min(1.0, math.sqrt(a)))) * 3600.0


class GaiaService:
    """Cone search and single-source lookup over the Gaia Archive TAP service."""

    def __init__(
        self,
        client: GaiaClient | None = None,
        cache: CacheStore | None = None,
        settings: Settings | None = None,
    ) -> None:
        self.settings = settings or get_settings()
        self.client = client or GaiaClient(self.settings)
        self.cache = cache
        self._retrieved_at: str | None = None

    # ------------------------------------------------------------------ helpers
    def _validate_radius(self, radius_arcsec: float) -> float:
        if not isinstance(radius_arcsec, (int, float)) or not math.isfinite(radius_arcsec) or radius_arcsec <= 0:
            raise InvalidRadiusError("radius_arcsec must be a positive number", details={"radius_arcsec": radius_arcsec})
        if radius_arcsec > self.settings.gaia_max_search_radius_arcsec:
            raise InvalidRadiusError(
                f"radius_arcsec must not exceed {self.settings.gaia_max_search_radius_arcsec}",
                details={"radius_arcsec": radius_arcsec, "max": self.settings.gaia_max_search_radius_arcsec},
            )
        return float(radius_arcsec)

    def _validate_limit(self, limit: int | None) -> int:
        value = limit or self.settings.gaia_max_results
        if not isinstance(value, int) or value < 1:
            raise ValueError("limit must be a positive integer")
        return int(min(value, self.settings.gaia_max_results))

    @staticmethod
    def _validate_magnitude(magnitude_limit: float | None) -> float | None:
        if magnitude_limit is None:
            return None
        if not isinstance(magnitude_limit, (int, float)) or not math.isfinite(magnitude_limit) or not -10 <= magnitude_limit <= 30:
            raise ValueError("magnitude_limit must be a finite number in [-10, 30] mag")
        return float(magnitude_limit)

    def _now(self) -> str:
        if self._retrieved_at is None:
            self._retrieved_at = datetime.now(timezone.utc).isoformat()
        return self._retrieved_at

    # ------------------------------------------------------------- cone search
    def cone_search(
        self,
        ra: float,
        dec: float,
        radius_arcsec: float | None = None,
        magnitude_limit: float | None = None,
        limit: int | None = None,
    ) -> GaiaConeSearchResponse:
        """Cone search around a validated ICRS centre. Empty results are success."""
        ra, dec = validate_coordinates(ra, dec)
        radius_arcsec = self._validate_radius(
            self.settings.gaia_default_search_radius_arcsec if radius_arcsec is None else radius_arcsec
        )
        magnitude_limit = self._validate_magnitude(magnitude_limit)
        effective_limit = self._validate_limit(limit)

        cache_key = (
            "cone",
            round(ra, 9),
            round(dec, 9),
            round(radius_arcsec, 6),
            magnitude_limit,
            effective_limit,
        )
        cached = self.cache.gaia.get(cache_key) if self.cache else None
        if cached is not None:
            return cached

        adql = cone_search_adql(
            ra=ra,
            dec=dec,
            radius_arcsec=radius_arcsec,
            magnitude_limit=magnitude_limit,
            limit=effective_limit,
            table=self.settings.gaia_catalog,
        )
        rows = self.client.run_adql(adql)

        sources = [self._normalize(row) for row in rows]
        separations = [
            angular_separation_arcsec(ra, dec, source.coordinates.ra, source.coordinates.dec)
            for source in sources
        ]
        response = GaiaConeSearchResponse(
            query=GaiaConeSearchMetadata(
                ra=ra,
                dec=dec,
                radius_arcsec=radius_arcsec,
                magnitude_limit=magnitude_limit,
                limit=effective_limit,
                total_found=len(sources),
                truncated=len(sources) == effective_limit,
            ),
            sources=sources,
            separations_arcsec=[round(value, 6) for value in separations],
        )
        if self.cache is not None:
            self.cache.gaia.set(cache_key, response)
        log.info("gaia_cone_search", extra={"ra": ra, "dec": dec, "radius_arcsec": radius_arcsec, "rows": len(sources)})
        return response

    # ------------------------------------------------------------ single source
    def get_source(self, source_id: str | int) -> GaiaSource:
        """Retrieve one Gaia DR3 record by its exact source identifier."""
        try:
            numeric = int(str(source_id).strip())
        except (TypeError, ValueError) as exc:
            raise InvalidGaiaSourceIdError(
                "Gaia source_id must be a non-negative integer", details={"source_id": str(source_id)[:64]}
            ) from exc
        if numeric <= 0:
            raise InvalidGaiaSourceIdError("Gaia source_id must be positive", details={"source_id": numeric})

        cache_key = ("source", numeric)
        cached = self.cache.gaia.get(cache_key) if self.cache else None
        if cached is not None:
            return cached

        rows = self.client.run_adql(source_by_id_adql(numeric, table=self.settings.gaia_catalog))
        if not rows:
            raise GaiaSourceNotFoundError(
                "No Gaia DR3 source with that identifier",
                details={"source_id": numeric},
            )
        source = self._normalize(rows[0])
        if self.cache is not None:
            self.cache.gaia.set(cache_key, source)
        return source

    # --------------------------------------------------------------- normalize
    def _normalize(self, row: dict[str, Any]) -> GaiaSource:
        """Map one TAP row onto the internal schema, preserving nulls and units."""
        source_id = str(row.get("source_id"))
        reference_epoch = row.get("ref_epoch")
        return GaiaSource(
            catalog=GAIA_DR3_CATALOG,
            source_id=source_id,
            coordinates=GaiaCoordinates(
                ra=_as_float(row.get("ra")),
                dec=_as_float(row.get("dec")),
                reference_epoch=_as_float(reference_epoch) or GAIA_DR3_REFERENCE_EPOCH,
                ra_error_mas=_as_float(row.get("ra_error")),
                dec_error_mas=_as_float(row.get("dec_error")),
            ),
            astrometry=GaiaAstrometry(
                parallax_mas=_as_float(row.get("parallax")),
                parallax_error_mas=_as_float(row.get("parallax_error")),
                pmra_mas_yr=_as_float(row.get("pmra")),
                pmdec_mas_yr=_as_float(row.get("pmdec")),
                pmra_error_mas_yr=_as_float(row.get("pmra_error")),
                pmdec_error_mas_yr=_as_float(row.get("pmdec_error")),
                ruwe=_as_float(row.get("ruwe")),
            ),
            photometry=GaiaPhotometry(
                g=_as_float(row.get("phot_g_mean_mag")),
                bp=_as_float(row.get("phot_bp_mean_mag")),
                rp=_as_float(row.get("phot_rp_mean_mag")),
            ),
            provenance=GaiaProvenance(
                catalog=GAIA_DR3_CATALOG,
                retrieved_at=self._now(),
                query_reference=self._query_reference(row),
                tap_endpoint=self.settings.gaia_tap_endpoint,
            ),
        )

    def _query_reference(self, row: dict[str, Any]) -> str | None:
        """Deterministic reference naming the query shape (not the raw SQL)."""
        payload = f"{self.settings.gaia_catalog}|{GAIA_DR3_REFERENCE_EPOCH}|{row.get('source_id')}"
        return hashlib.sha256(payload.encode()).hexdigest()[:32]


def _as_float(value: Any) -> float | None:
    """TAP doubles arrive as floats or None; guard NaN/inf as 'missing'."""
    if value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(number):
        return None
    return number
