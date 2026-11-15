"""Phase 4 spectral extraction, retrieval and comparison routes."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.deps import get_spectral_service
from app.schemas.common import ErrorResponse
from app.schemas.spectra import (
    SpectralComparisonRequest,
    SpectralComparisonResponse,
    SpectralExtractionRequest,
    SpectralExtractionResponse,
)
from app.services.spectral_service import SpectralService

router = APIRouter(prefix="/spectra", tags=["spectra"])

_ERRORS = {
    400: {"model": ErrorResponse},
    404: {"model": ErrorResponse},
    422: {"model": ErrorResponse},
    502: {"model": ErrorResponse},
    503: {"model": ErrorResponse},
    504: {"model": ErrorResponse},
}


@router.post(
    "/extract",
    response_model=SpectralExtractionResponse,
    responses=_ERRORS,
    summary="Extract a DR1 cube spectrum at a source or sky position",
)
def extract_spectrum(
    payload: SpectralExtractionRequest,
    service: SpectralService = Depends(get_spectral_service),
) -> SpectralExtractionResponse:
    return service.extract(payload)


@router.post(
    "/compare",
    response_model=SpectralComparisonResponse,
    responses=_ERRORS,
    summary="Compare two stored spectra on a matched wavelength grid",
)
def compare_spectra(
    payload: SpectralComparisonRequest,
    service: SpectralService = Depends(get_spectral_service),
) -> SpectralComparisonResponse:
    return service.compare(payload.spectrum_id_a, payload.spectrum_id_b, payload.config)


@router.get(
    "/{spectrum_id}",
    response_model=SpectralExtractionResponse,
    responses=_ERRORS,
    summary="Retrieve a stored spectrum by id",
)
def get_spectrum(
    spectrum_id: str,
    service: SpectralService = Depends(get_spectral_service),
) -> SpectralExtractionResponse:
    return service.spectrum(spectrum_id)
