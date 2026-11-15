"""Central configuration, loaded from environment variables / .env."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # IRSA
    sia_endpoint: str = "https://irsa.ipac.caltech.edu/SIA"
    default_collection: str = "spherex_qr3"
    trusted_hosts: tuple[str, ...] = ("irsa.ipac.caltech.edu",)
    user_agent: str = "PlanetX-SPHEREx/1.0 (IRSA SIA2 client)"

    # HTTP behaviour
    connect_timeout: float = 10.0
    request_timeout: float = 120.0
    download_retries: int = 3
    max_download_bytes: int = 256 * 1024 * 1024

    # Query limits
    max_search_radius_deg: float = 1.0
    max_cutout_size_deg: float = 1.0

    # Storage (relative paths resolve from the process working directory)
    storage_dir: Path = Path("storage")
    api_prefix: str = "/api/v1"

    # Caching
    cache_ttl_seconds: int = 600
    cache_max_entries: int = 512

    # Preview rendering
    preview_cmap: str = "inferno"
    preview_percentile: float = 99.5
    preview_asinh_a: float = 0.1

    # Image comparison (Phase 2)
    comparison_size_deg: float = 0.2
    max_comparison_pixels: int = 1_000_000
    min_common_coverage: float = 0.3
    max_alignment_residual_px: float = 1.5
    psf_warn_ratio: float = 1.15
    psf_fail_ratio: float = 1.4
    max_concurrent_comparisons: int = 2

    # Source detection and photometry (Phase 3)
    detection_threshold_sigma: float = 5.0
    detection_min_area_px: int = 5
    detection_max_sources: int = 500
    detection_filter_fwhm_px: float = 1.5
    detection_edge_margin_px: int = 2
    detection_background_mesh: int = 4
    photometry_aperture_fwhm_factor: float = 3.0
    photometry_annulus_inner_factor: float = 1.3
    photometry_annulus_outer_factor: float = 2.0
    photometry_aperture_oversample: int = 8
    photometry_min_valid_fraction: float = 0.5
    max_concurrent_detections: int = 2

    # Spectral extraction (Phase 4)
    spectral_collection: str = "spherex_dr1_cube"
    spectral_max_download_bytes: int = 400 * 1024 * 1024
    spectral_spatial_method: Literal["bilinear", "nearest"] = "bilinear"
    spectral_invalid_flag_bits: tuple[int, ...] = (1, 19)
    max_concurrent_spectral: int = 2

    # Ops
    log_level: str = "INFO"
    cors_origins: tuple[str, ...] = (
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    )

    @field_validator("spectral_invalid_flag_bits")
    @classmethod
    def _valid_spectral_flag_bits(cls, bits: tuple[int, ...]) -> tuple[int, ...]:
        normalized = tuple(dict.fromkeys(int(bit) for bit in bits))
        if any(bit < 0 or bit > 31 for bit in normalized):
            raise ValueError("SPECTRAL_INVALID_FLAG_BITS must contain bit indices in [0, 31]")
        return normalized

    @field_validator("cors_origins")
    @classmethod
    def _explicit_origins_only(cls, origins: tuple[str, ...]) -> tuple[str, ...]:
        normalized = tuple(origin.strip().rstrip("/") for origin in origins if origin.strip())
        if "*" in normalized:
            raise ValueError(
                "CORS_ORIGINS must list explicit origins; the '*' wildcard is not allowed. "
                "Set CORS_ORIGINS to the frontend origin(s), e.g. [\"https://planetx.example\"]."
            )
        return normalized

    @property
    def fits_dir(self) -> Path:
        return self.storage_dir / "fits"

    @property
    def previews_dir(self) -> Path:
        return self.storage_dir / "previews"

    @property
    def comparisons_dir(self) -> Path:
        return self.storage_dir / "comparisons"

    @property
    def sources_dir(self) -> Path:
        return self.storage_dir / "sources"

    @property
    def lightcurves_dir(self) -> Path:
        return self.storage_dir / "lightcurves"

    @property
    def spectra_dir(self) -> Path:
        return self.storage_dir / "spectra"

    def ensure_dirs(self) -> None:
        self.fits_dir.mkdir(parents=True, exist_ok=True)
        self.previews_dir.mkdir(parents=True, exist_ok=True)
        self.comparisons_dir.mkdir(parents=True, exist_ok=True)
        self.sources_dir.mkdir(parents=True, exist_ok=True)
        self.lightcurves_dir.mkdir(parents=True, exist_ok=True)
        self.spectra_dir.mkdir(parents=True, exist_ok=True)


@lru_cache
def get_settings() -> Settings:
    return Settings()
