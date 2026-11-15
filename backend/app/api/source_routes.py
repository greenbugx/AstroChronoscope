"""Phase 3 source detection, photometry and source-catalogue routes."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.deps import (
    get_photometry_service,
    get_source_catalog_service,
    get_source_detection_service,
    get_source_gaia_association,
    get_spectral_service,
)
from app.schemas.common import ErrorResponse
from app.schemas.gaia import SourceGaiaAssociationResponse
from app.schemas.spectra import SourceSpectraResponse
from app.schemas.lightcurve import (
    SourceDetailResponse,
    SourceLightCurveResponse,
    SourceVariabilityResponse,
)
from app.schemas.photometry import PhotometryRequest, PhotometryResponse
from app.schemas.sources import DetectionRequest, DetectionResponse
from app.services.gaia_source_association import SourceGaiaAssociationService
from app.services.photometry import PhotometryService
from app.services.source_catalog import SourceCatalogService
from app.services.source_detection import SourceDetectionService
from app.services.spectral_service import SpectralService

router = APIRouter(prefix="/sources", tags=["sources"])

_ERRORS = {
    400: {"model": ErrorResponse},
    404: {"model": ErrorResponse},
    422: {"model": ErrorResponse},
    502: {"model": ErrorResponse},
    503: {"model": ErrorResponse},
    504: {"model": ErrorResponse},
}


@router.post(
    "/detect",
    response_model=DetectionResponse,
    responses=_ERRORS,
    summary="Detect compact sources in one SPHEREx epoch",
)
def detect_sources(
    payload: DetectionRequest,
    service: SourceDetectionService = Depends(get_source_detection_service),
) -> DetectionResponse:
    return service.detect(payload)


@router.post(
    "/photometry",
    response_model=PhotometryResponse,
    responses=_ERRORS,
    summary="Measure aperture photometry for detected sources in one epoch",
)
def measure_sources(
    payload: PhotometryRequest,
    service: PhotometryService = Depends(get_photometry_service),
) -> PhotometryResponse:
    return service.measure(payload)


@router.get(
    "/{source_id}",
    response_model=SourceDetailResponse,
    responses=_ERRORS,
    summary="Retrieve a persisted internal source and its detections",
)
def get_source(
    source_id: str,
    service: SourceCatalogService = Depends(get_source_catalog_service),
) -> SourceDetailResponse:
    return service.source(source_id)


@router.get(
    "/{source_id}/lightcurve",
    response_model=SourceLightCurveResponse,
    responses=_ERRORS,
    summary="Retrieve the per-band light curve for one persisted source",
)
def get_source_lightcurve(
    source_id: str,
    service: SourceCatalogService = Depends(get_source_catalog_service),
) -> SourceLightCurveResponse:
    return service.lightcurve(source_id)


@router.get(
    "/{source_id}/spectra",
    response_model=SourceSpectraResponse,
    responses=_ERRORS,
    summary="Retrieve stored DR1 cube spectra associated with one source",
)
def get_source_spectra(
    source_id: str,
    service: SpectralService = Depends(get_spectral_service),
) -> SourceSpectraResponse:
    return service.source_spectra(source_id)


@router.get(
    "/{source_id}/catalogs",
    response_model=SourceGaiaAssociationResponse,
    responses=_ERRORS,
    summary="Gaia DR3 counterpart candidates for one persisted internal source",
)
def get_source_gaia_catalogs(
    source_id: str,
    service: SourceGaiaAssociationService = Depends(get_source_gaia_association),
) -> SourceGaiaAssociationResponse:
    return service.associate(source_id)


@router.get(
    "/{source_id}/variability",
    response_model=SourceVariabilityResponse,
    responses=_ERRORS,
    summary="Retrieve variability evidence for one persisted source",
)
def get_source_variability(
    source_id: str,
    service: SourceCatalogService = Depends(get_source_catalog_service),
) -> SourceVariabilityResponse:
    return service.variability(source_id)
