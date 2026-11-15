"""FastAPI dependency wiring (singletons for HTTP, caches and config)."""

from __future__ import annotations

from functools import lru_cache

from fastapi import Depends

from app.core.cache import CacheStore
from app.core.config import Settings, get_settings
from app.services.irsa_client import IrsaClient
from app.services.image_comparison import ImageComparisonService
from app.services.lightcurve_service import TargetLightCurveService
from app.services.observation_service import ObservationService
from app.services.photometry import PhotometryService
from app.services.source_catalog import SourceCatalogService
from app.services.source_detection import SourceDetectionService
from app.services.spectral_service import SpectralService
from app.services.timeline_service import TimelineService


@lru_cache
def get_settings_dep() -> Settings:
    return get_settings()


@lru_cache
def get_irsa_client() -> IrsaClient:
    return IrsaClient(get_settings_dep())


@lru_cache
def get_cache_store() -> CacheStore:
    settings = get_settings_dep()
    return CacheStore(settings.cache_ttl_seconds, settings.cache_max_entries)


def get_observation_service(
    client: IrsaClient = Depends(get_irsa_client),
    cache: CacheStore = Depends(get_cache_store),
    settings: Settings = Depends(get_settings_dep),
) -> ObservationService:
    return ObservationService(client, cache, settings)


def get_timeline_service(
    observations: ObservationService = Depends(get_observation_service),
) -> TimelineService:
    return TimelineService(observations)


def get_image_comparison_service(
    observations: ObservationService = Depends(get_observation_service),
) -> ImageComparisonService:
    return ImageComparisonService(observations)


def get_source_detection_service(
    observations: ObservationService = Depends(get_observation_service),
) -> SourceDetectionService:
    return SourceDetectionService(observations)


def get_photometry_service(
    observations: ObservationService = Depends(get_observation_service),
    detection: SourceDetectionService = Depends(get_source_detection_service),
) -> PhotometryService:
    return PhotometryService(observations, detection)


def get_source_catalog_service(
    cache: CacheStore = Depends(get_cache_store),
    settings: Settings = Depends(get_settings_dep),
) -> SourceCatalogService:
    return SourceCatalogService(settings, cache)


def get_target_lightcurve_service(
    observations: ObservationService = Depends(get_observation_service),
    detection: SourceDetectionService = Depends(get_source_detection_service),
    photometry: PhotometryService = Depends(get_photometry_service),
    catalog: SourceCatalogService = Depends(get_source_catalog_service),
) -> TargetLightCurveService:
    return TargetLightCurveService(observations, detection, photometry, catalog)


def get_spectral_service(
    observations: ObservationService = Depends(get_observation_service),
    catalog: SourceCatalogService = Depends(get_source_catalog_service),
    cache: CacheStore = Depends(get_cache_store),
    settings: Settings = Depends(get_settings_dep),
) -> SpectralService:
    return SpectralService(settings, cache, observations, catalog)
