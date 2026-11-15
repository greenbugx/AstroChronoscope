"""Planet X SPHEREx data acquisition backend."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.deps import get_irsa_client
from app.api.file_routes import router as file_router
from app.api.gaia_routes import router as gaia_router
from app.api.image_routes import router as image_router
from app.api.lightcurve_routes import router as lightcurve_router
from app.api.observation_routes import router as observation_router
from app.api.source_routes import router as source_router
from app.api.spectral_routes import router as spectral_router
from app.api.timeline_routes import router as timeline_router
from app.core.config import get_settings
from app.core.exceptions import PlanetXError
from app.core.logging import configure_logging

log = logging.getLogger(__name__)

VERSION = "0.1.0"


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    configure_logging(settings.log_level)
    settings.ensure_dirs()
    log.info("backend_started", extra={"collection": settings.default_collection, "storage": str(settings.storage_dir)})
    yield
    get_irsa_client().close()
    log.info("backend_stopped")


app = FastAPI(
    title="Planet X SPHEREx API",
    version=VERSION,
    description=(
        "Genuine SPHEREx observations from NASA/IPAC IRSA: SIA2 discovery, IBE cutouts, "
        "science IMAGE extraction, celestial WCS validation, PNG previews, multi-epoch "
        "timelines, validated pairwise image comparison, source detection, aperture "
        "photometry, cross-epoch association, per-band light curves with variability metrics, "
        "and DR1 cube spectral extraction, inspection and comparison."
    ),
    lifespan=lifespan,
)

_settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(_settings.cors_origins),
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
    expose_headers=["X-Observation-Count"],
)

app.include_router(observation_router, prefix=_settings.api_prefix)
app.include_router(file_router, prefix=_settings.api_prefix)
app.include_router(timeline_router, prefix=_settings.api_prefix)
app.include_router(image_router, prefix=_settings.api_prefix)
app.include_router(gaia_router, prefix=_settings.api_prefix)
app.include_router(source_router, prefix=_settings.api_prefix)
app.include_router(lightcurve_router, prefix=_settings.api_prefix)
app.include_router(spectral_router, prefix=_settings.api_prefix)


@app.get("/", tags=["ops"], summary="Frontend connectivity check")
def root() -> dict[str, str]:
    # AstroChronoscope's src/lib/api.ts fetches the API origin root and reads `message`.
    return {"message": "Planet X SPHEREx API is running"}


@app.get(f"{_settings.api_prefix}/health", tags=["ops"])
def health() -> dict[str, object]:
    return {
        "success": True,
        "status": "ok",
        "version": VERSION,
        "default_collection": _settings.default_collection,
    }


@app.get(f"{_settings.api_prefix}/telemetry", tags=["ops"], summary="Observatory cache and storage telemetry", include_in_schema=False)
def telemetry() -> dict[str, object]:
    from pathlib import Path
    def count_and_size(path: Path) -> dict[str, int]:
        if not path.exists():
            return {"count": 0, "size_bytes": 0}
        files = [p for p in path.iterdir() if p.is_file()]
        return {"count": len(files), "size_bytes": sum(p.stat().st_size for p in files)}

    storage_fits = count_and_size(_settings.fits_dir)
    storage_previews = count_and_size(_settings.previews_dir)
    storage_comparisons = count_and_size(_settings.comparisons_dir)
    storage_sources = count_and_size(_settings.sources_dir)
    storage_lightcurves = count_and_size(_settings.lightcurves_dir)
    storage_spectra = count_and_size(_settings.spectra_dir)

    return {
        "success": True,
        "status": "ok",
        "version": VERSION,
        "default_collection": _settings.default_collection,
        "sia_endpoint": _settings.sia_endpoint,
        "storage": {
            "fits": storage_fits,
            "previews": storage_previews,
            "comparisons": storage_comparisons,
            "sources": storage_sources,
            "lightcurves": storage_lightcurves,
            "spectra": storage_spectra,
            "total_files": (
                storage_fits["count"]
                + storage_previews["count"]
                + storage_comparisons["count"]
                + storage_sources["count"]
                + storage_lightcurves["count"]
                + storage_spectra["count"]
            ),
            "total_size_bytes": (
                storage_fits["size_bytes"]
                + storage_previews["size_bytes"]
                + storage_comparisons["size_bytes"]
                + storage_sources["size_bytes"]
                + storage_lightcurves["size_bytes"]
                + storage_spectra["size_bytes"]
            ),
        },
    }


def _error_payload(code: str, message: str, details: dict | None = None) -> dict:
    return {"success": False, "error": {"code": code, "message": message, "details": details}}


@app.exception_handler(PlanetXError)
async def planetx_error_handler(_: Request, exc: PlanetXError) -> JSONResponse:
    log.info("api_error", extra={"code": exc.code, "status": exc.status_code, "detail": exc.message})
    return JSONResponse(status_code=exc.status_code, content=_error_payload(exc.code, exc.message, exc.details))


@app.exception_handler(RequestValidationError)
async def validation_error_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    details = [
        {"field": ".".join(str(part) for part in error.get("loc", ())), "message": error.get("msg", "invalid value"), "type": error.get("type", "value_error")}
        for error in exc.errors()
    ]
    return JSONResponse(
        status_code=422,
        content=_error_payload("INVALID_REQUEST", "Request validation failed", {"errors": details}),
    )


@app.exception_handler(StarletteHTTPException)
async def http_error_handler(_: Request, exc: StarletteHTTPException) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content=_error_payload("HTTP_ERROR", str(exc.detail), None),
    )


@app.exception_handler(Exception)
async def unhandled_error_handler(_: Request, exc: Exception) -> JSONResponse:
    log.exception("unhandled_error", extra={"error": str(exc)})
    return JSONResponse(
        status_code=500,
        content=_error_payload("INTERNAL_ERROR", "Unexpected server error"),
    )
