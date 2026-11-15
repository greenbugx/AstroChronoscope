"""Resolve a sky position to a cached SPHEREx DR1 all-sky cube tile.

The cube is a 306 MiB archive product, not an IBE cutout. Retrieval therefore
uses its own size cap and the same hash-addressed FITS cache as the other
products. The original archive row is preserved so provenance can name the exact
tile, publisher DID and access URL.
"""

from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from astropy.coordinates import SkyCoord

from app.core.exceptions import (
    CutoutUnavailableError,
    InvalidFitsFileError,
    SpectralProductNotFoundError,
    SpectralProductUnavailableError,
)
from app.services.fits_service import FitsProduct, download_fits, get_fits_product, verify_fits

log = logging.getLogger(__name__)

CUBE_PRODUCT_TYPE = "cube"
DEFAULT_CUBE_RADIUS_DEG = 0.01


@dataclass(frozen=True)
class ResolvedCube:
    row: dict[str, Any]
    path: Path
    product: FitsProduct
    collection: str

    @property
    def access_url(self) -> str:
        return self.product.access_url

    @property
    def product_id(self) -> str:
        return self.product.obs_publisher_did or self.product.access_url


def resolve_cube(
    observations: Any,
    ra: float,
    dec: float,
    *,
    radius: float = DEFAULT_CUBE_RADIUS_DEG,
    collection: str | None = None,
) -> ResolvedCube:
    """Find, cache and return the cube tile that covers ``(ra, dec)``.

    A cube query returns archive rows whose HEALPix tile footprints intersect the
    search cone. The nearest tile centre is chosen when several overlap; the
    caller still validates the target pixel against the tile WCS.
    """
    settings = observations.settings
    collection = collection or settings.spectral_collection
    rows = observations.search_rows(ra, dec, radius, collection=collection)

    cubes = [
        row
        for row in rows
        if str(row.get("dataproduct_type") or "").strip().lower() == CUBE_PRODUCT_TYPE
        and isinstance(row.get("access_url"), str)
        and str(row["access_url"]).strip()
    ]
    if not cubes:
        raise SpectralProductNotFoundError(
            "No spectral cube covers the requested position",
            details={"ra": ra, "dec": dec, "collection": collection, "rows": len(rows)},
        )

    row = min(cubes, key=lambda candidate: _separation_deg(ra, dec, candidate))
    product = get_fits_product({**row, "observation_id": None}, settings)
    path = settings.fits_dir / f"{hashlib.sha256(product.access_url.encode('utf-8')).hexdigest()}.fits"

    if path.is_file():
        try:
            verify_fits(path)
        except InvalidFitsFileError as exc:
            log.warning(
                "spectral_cache_invalid",
                extra={"path": str(path), "error": str(exc)},
            )
            path.unlink(missing_ok=True)

    if not path.is_file():
        try:
            download_fits(
                product.access_url,
                path,
                session=observations.client.session,
                settings=settings,
                max_bytes=settings.spectral_max_download_bytes,
            )
        except CutoutUnavailableError as exc:
            raise SpectralProductUnavailableError(
                "The spectral cube is temporarily unavailable from IRSA",
                details={"access_url": product.access_url},
            ) from exc

    return ResolvedCube(row=row, path=path, product=product, collection=collection)


def _separation_deg(ra: float, dec: float, row: dict[str, Any]) -> float:
    try:
        row_ra = float(row["s_ra"])
        row_dec = float(row["s_dec"])
    except (KeyError, TypeError, ValueError):
        return float("inf")
    try:
        return float(
            SkyCoord(ra=ra, dec=dec, unit="deg", frame="icrs")
            .separation(SkyCoord(ra=row_ra, dec=row_dec, unit="deg", frame="icrs"))
            .to_value("deg")
        )
    except Exception:  # pragma: no cover - defensive
        return float("inf")


__all__ = ["CUBE_PRODUCT_TYPE", "ResolvedCube", "resolve_cube"]
