"""Orchestrate cube inspection, extraction and persisted spectrum retrieval."""

from __future__ import annotations

import threading
from typing import Any

from app.core.cache import CacheStore
from app.core.config import Settings
from app.core.exceptions import ProcessingBusyError
from app.schemas.spectra import (
    SpectralComparisonConfig,
    SpectralComparisonResponse,
    SpectralExtractionRequest,
    SpectralExtractionResponse,
    SpectralInspection,
    SourceSpectraResponse,
)
from app.services.spectral_comparison import SpectralComparisonService
from app.services.spectral_inspection import inspect_spectral_product
from app.services.spectral_resolver import resolve_cube
from app.services.spectrum_catalog import SpectrumCatalogService
from app.services.spectrum_extraction import extract_cube_spectrum
from app.services.source_catalog import SourceCatalogService

_SEMAPHORE: threading.BoundedSemaphore | None = None
_SEMAPHORE_LOCK = threading.Lock()


def _semaphore(limit: int) -> threading.BoundedSemaphore:
    global _SEMAPHORE
    with _SEMAPHORE_LOCK:
        if _SEMAPHORE is None:
            _SEMAPHORE = threading.BoundedSemaphore(max(1, limit))
        return _SEMAPHORE


class SpectralService:
    def __init__(
        self,
        settings: Settings,
        cache: CacheStore,
        observations: Any,
        source_catalog: SourceCatalogService,
    ) -> None:
        self.settings = settings
        self.cache = cache
        self.observations = observations
        self.source_catalog = source_catalog
        self.catalog = SpectrumCatalogService(settings, cache)
        self.comparison = SpectralComparisonService(self.catalog)

    def inspect(
        self,
        ra: float,
        dec: float,
        *,
        collection: str | None = None,
    ) -> SpectralInspection:
        collection = collection or self.settings.spectral_collection
        cube = resolve_cube(self.observations, ra, dec, collection=collection)
        row = {**cube.row, "collection": collection}
        return inspect_spectral_product(
            cube.path,
            target_ra=ra,
            target_dec=dec,
            source_url=cube.access_url,
            row=row,
            settings=self.settings,
        )

    def extract(self, request: SpectralExtractionRequest) -> SpectralExtractionResponse:
        semaphore = _semaphore(self.settings.max_concurrent_spectral)
        if not semaphore.acquire(timeout=self.settings.request_timeout):
            raise ProcessingBusyError(
                "Too many spectral extractions are running; retry shortly",
                details={"max_concurrent": self.settings.max_concurrent_spectral},
            )
        try:
            return self._extract(request)
        finally:
            semaphore.release()

    def _extract(self, request: SpectralExtractionRequest) -> SpectralExtractionResponse:
        ra, dec = self._position(request)
        collection = request.collection or self.settings.spectral_collection
        cube = resolve_cube(self.observations, ra, dec, collection=collection)
        row = {**cube.row, "collection": collection}
        inspection = inspect_spectral_product(
            cube.path,
            target_ra=ra,
            target_dec=dec,
            source_url=cube.access_url,
            row=row,
            settings=self.settings,
        )
        response = extract_cube_spectrum(
            cube.path,
            ra=ra,
            dec=dec,
            collection=collection,
            row=row,
            access_url=cube.access_url,
            source_id=request.source_id,
            settings=self.settings,
            inspection=inspection,
            spatial_method=request.config.spatial_method,
        )
        self.catalog.store(response)
        return response

    def compare(
        self,
        spectrum_id_a: str,
        spectrum_id_b: str,
        config: SpectralComparisonConfig | None = None,
    ) -> SpectralComparisonResponse:
        return self.comparison.compare(
            spectrum_id_a,
            spectrum_id_b,
            config or SpectralComparisonConfig(),
        )

    def spectrum(self, spectrum_id: str) -> SpectralExtractionResponse:
        record = self.catalog.get(spectrum_id)
        return SpectralExtractionResponse(spectrum=record.spectrum, provenance=record.provenance)

    def source_spectra(self, source_id: str) -> SourceSpectraResponse:
        self.source_catalog.source(source_id)
        return SourceSpectraResponse(
            source_id=source_id,
            spectra=self.catalog.list_for_source(source_id),
        )

    def _position(self, request: SpectralExtractionRequest) -> tuple[float, float]:
        if request.source_id is not None:
            source = self.source_catalog.source(request.source_id).source
            return source.reference_ra_deg, source.reference_dec_deg
        if request.ra is None or request.dec is None:  # validated by the request model
            raise ValueError("Spectral extraction request has no position")
        return request.ra, request.dec


__all__ = ["SpectralService"]
