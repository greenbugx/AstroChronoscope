"""Gaia DR3 catalog routes (Phase 5)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.api.deps import get_catalog_crossmatcher, get_gaia_service
from app.schemas.common import ErrorResponse
from app.schemas.gaia import (
    CrossMatchRequest,
    CrossMatchResponse,
    GaiaConeSearchResponse,
    GaiaSourceResponse,
)
from app.services.catalog_crossmatch import CatalogCrossMatcher
from app.services.gaia_service import GaiaService

router = APIRouter(prefix="/catalogs/gaia", tags=["gaia"])

_ERRORS = {
    400: {"model": ErrorResponse},
    404: {"model": ErrorResponse},
    422: {"model": ErrorResponse},
    502: {"model": ErrorResponse},
    503: {"model": ErrorResponse},
    504: {"model": ErrorResponse},
}


@router.get(
    "/search",
    response_model=GaiaConeSearchResponse,
    responses=_ERRORS,
    summary="Cone search against Gaia DR3 (positions, astrometry, G/BP/RP photometry)",
)
def gaia_cone_search(
    service: GaiaService = Depends(get_gaia_service),
    ra: float = Query(..., ge=0.0, lt=360.0, description="ICRS right ascension, degrees"),
    dec: float = Query(..., ge=-90.0, le=90.0, description="ICRS declination, degrees"),
    radius_arcsec: float = Query(
        None, gt=0.0, le=60.0, description="Search radius in arcseconds (default 10, max 60)"
    ),
    magnitude_limit: float = Query(
        None, ge=-10.0, le=30.0, description="Optional G-band magnitude cut (phot_g_mean_mag <= limit)"
    ),
    limit: int = Query(None, ge=1, le=1000, description="Maximum number of sources returned"),
) -> GaiaConeSearchResponse:
    return service.cone_search(
        ra=ra,
        dec=dec,
        radius_arcsec=radius_arcsec,
        magnitude_limit=magnitude_limit,
        limit=limit,
    )


@router.post(
    "/crossmatch",
    response_model=CrossMatchResponse,
    responses=_ERRORS,
    summary="Cross-match external coordinates against Gaia DR3 (nearest candidate, ambiguity, epoch propagation)",
)
def gaia_crossmatch(
    payload: CrossMatchRequest,
    matcher: CatalogCrossMatcher = Depends(get_catalog_crossmatcher),
) -> CrossMatchResponse:
    return matcher.crossmatch(payload.coordinates, payload.config)


@router.get(
    "/{source_id}",
    response_model=GaiaSourceResponse,
    responses=_ERRORS,
    summary="One Gaia DR3 record by exact source identifier",
)
def gaia_source(
    source_id: str,
    service: GaiaService = Depends(get_gaia_service),
) -> GaiaSourceResponse:
    return GaiaSourceResponse(source=service.get_source(source_id))
