"""Phase 4 spectral extraction and comparison contracts.

Scientific boundaries
---------------------
* The supported product is the SPHEREx DR1 All-Sky Cube: a static mosaic of
  calibrated surface brightness in ``MJy/sr``, one value per spectral channel.
* A cube spectrum has **no epoch**: the product is a survey mosaic, not a
  time-resolved observation.
* The cube has no ``VARIANCE`` extension. Per-channel uncertainty is therefore
  ``None`` and the spectrum-level uncertainty status is ``NOT_VERIFIED``. A
  local spatial scatter is not a flux uncertainty and must never be reported as
  one.
* Flux is surface brightness, not integrated source flux. A per-pixel Jy value
  is not total-source flux either.
* Blank channels (``BLANKCH`` / ``NHITS == 0``) and invalid-flag channels stay
  distinguishable from a measured zero.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import Field, model_validator

from app.core.versions import SPECTRAL_ALGORITHM_VERSION
from app.schemas.common import StrictModel
from app.schemas.image_processing import HduInfo, WcsValidation

SpectralQuality = Literal["PASS", "WARNING", "FAIL", "NOT_VERIFIED"]

WavelengthUnit = Literal["um"]
FluxUnit = Literal["MJy/sr"]
FluxKind = Literal["surface_brightness"]

SPECTRAL_PRODUCT_TYPE = "spherex_dr1_all_sky_cube"
SPECTRAL_EXTRACTION_METHOD = "cube_point_extraction"


class SpectralExtractionConfig(StrictModel):
    """How a cube spectrum is sampled at the requested position.

    Only point sampling is supported. No aperture integration or PSF correction
    is applied: the returned value is the cube's calibrated surface brightness
    at that position.
    """

    spatial_method: Literal["bilinear", "nearest"] = Field(
        "bilinear",
        description="Spatial sampling of the cube at the requested position",
    )


class SpectralExtractionRequest(StrictModel):
    """Extract one cube spectrum at a persisted source or explicit coordinates."""

    source_id: str | None = Field(
        None,
        pattern=r"^[0-9a-f]{32}$",
        description="Persisted Phase 3 internal source id; mutually exclusive with ra/dec",
    )
    ra: float | None = Field(None, ge=0.0, lt=360.0, allow_inf_nan=False)
    dec: float | None = Field(None, ge=-90.0, le=90.0, allow_inf_nan=False)
    collection: str | None = Field(
        None, min_length=1, max_length=128, description="SIA2 collection; defaults to the spectral cube collection"
    )
    config: SpectralExtractionConfig = Field(default_factory=SpectralExtractionConfig)

    @model_validator(mode="after")
    def _source_or_coordinates(self) -> "SpectralExtractionRequest":
        has_position = self.ra is not None or self.dec is not None
        if self.source_id is None:
            if self.ra is None or self.dec is None:
                raise ValueError("Provide either source_id or both ra and dec")
        elif has_position:
            raise ValueError("Provide either source_id or ra/dec, not both")
        return self


class SpectralChannel(StrictModel):
    index: int = Field(..., ge=0, description="0-based channel index in the archived cube")
    detector: int | None = Field(None, ge=1, le=6)
    subchan: int | None = Field(None, ge=1, le=17)
    wavelength_um: float | None = Field(None, gt=0.0, description="Central wavelength in micrometres")
    wl_min_um: float | None = Field(None, gt=0.0, description="Channel lower edge from SPECTRAL_CHANNELS")
    wl_max_um: float | None = Field(None, gt=0.0, description="Channel upper edge from SPECTRAL_CHANNELS")
    bandwidth_um: float | None = Field(None, gt=0.0)
    resolving_power: float | None = Field(None, gt=0.0)
    flux_mjy_sr: float | None = Field(
        None, description="Calibrated surface brightness at the sampled position; null when unusable"
    )
    uncertainty_mjy_sr: float | None = Field(
        None, description="Always null for the cube: the product has no VARIANCE extension"
    )
    nhits: int | None = Field(None, ge=0)
    flags: int | None = Field(None, ge=0, description="Raw FLAGS bitmap value at the sampled position")
    flags_applied: list[str] = Field(
        default_factory=list, description="Flag names that made this channel unusable"
    )
    quality: SpectralQuality


class SpectralQualitySummary(StrictModel):
    overall_status: SpectralQuality
    uncertainty_status: SpectralQuality = "NOT_VERIFIED"
    warnings: list[str] = Field(default_factory=list)


class Spectrum(StrictModel):
    spectrum_id: str = Field(..., pattern=r"^[0-9a-f]{32}$")
    source_id: str | None = Field(None, pattern=r"^[0-9a-f]{32}$")
    product_type: Literal["spherex_dr1_all_sky_cube"] = SPECTRAL_PRODUCT_TYPE
    collection: str
    product_id: str = Field(..., description="Archive obs_publisher_did of the cube tile")
    obs_id: str | None = None
    obs_publisher_did: str | None = None
    ra_deg: float = Field(..., ge=0.0, lt=360.0)
    dec_deg: float = Field(..., ge=-90.0, le=90.0)
    pixel_x: float | None = Field(None, description="0-based cube pixel x used for extraction")
    pixel_y: float | None = Field(None, description="0-based cube pixel y used for extraction")
    wavelength_unit: WavelengthUnit = "um"
    flux_unit: FluxUnit = "MJy/sr"
    flux_kind: FluxKind = "surface_brightness"
    extraction_method: Literal["cube_point_extraction"] = SPECTRAL_EXTRACTION_METHOD
    channel_count: int = Field(..., ge=0)
    valid_channel_count: int = Field(..., ge=0)
    blank_channels: list[int] = Field(default_factory=list)
    wavelength_min_um: float | None = None
    wavelength_max_um: float | None = None
    channels: list[SpectralChannel] = Field(default_factory=list)
    quality: SpectralQualitySummary
    limitations: list[str] = Field(default_factory=list)


class SpectralProvenance(StrictModel):
    created_at: str
    software: dict[str, str]
    algorithm: str = "cube channel extraction at the requested sky position"
    algorithm_version: str = SPECTRAL_ALGORITHM_VERSION
    collection: str
    access_url: str
    fits_sha256: str
    npix: int | None = Field(None, description="HEALPix tile index from the cube header")
    order: int | None = Field(None, description="HEALPix order from the cube header")
    config: dict[str, Any] = Field(default_factory=dict)


class SpectralExtractionResponse(StrictModel):
    success: Literal[True] = True
    spectrum: Spectrum
    provenance: SpectralProvenance


class SpectralChannelsInfo(StrictModel):
    """Summary of the product's spectral axis, not the extracted channels."""

    available: bool = False
    source: Literal["SPECTRAL_CHANNELS", "WCS-WAVE", "none"] = "none"
    channel_count: int | None = Field(None, ge=0)
    wavelength_unit: WavelengthUnit | None = None
    wavelength_min_um: float | None = None
    wavelength_max_um: float | None = None
    monotonic: bool | None = None
    blank_channels: list[int] = Field(default_factory=list)
    detectors: list[int] = Field(default_factory=list)
    has_bandwidth: bool = False
    has_resolving_power: bool = False


class SpectralImageWavelength(StrictModel):
    """WCS-WAVE result for a spectral-image pixel (one channel, not a spectrum)."""

    method: Literal["bilinear_wcs_wave", "unavailable"] = "unavailable"
    wavelength_um: float | None = None
    bandwidth_um: float | None = None
    message: str | None = None


class SpectralMetadata(StrictModel):
    collection: str | None = None
    obs_id: str | None = None
    obs_publisher_did: str | None = None
    date_obs: str | None = None
    t_min_mjd: float | None = None
    t_max_mjd: float | None = None
    npix: int | None = Field(None, description="HEALPix tile index for a cube product")
    order: int | None = Field(None, description="HEALPix order for a cube product")


class SpectralInspection(StrictModel):
    """What a spectral product actually supports; missing data is never inferred."""

    product_format: Literal["cube", "spectral_image", "unsupported"]
    source: Literal["product", "cutout"] = "product"
    source_url: str | None = None
    fits_sha256: str
    shape: list[int] | None = None
    spatial_shape: list[int] | None = None
    bunit: str | None = None
    hdus: list[HduInfo] = Field(default_factory=list)
    channels: SpectralChannelsInfo = Field(default_factory=SpectralChannelsInfo)
    wcs: WcsValidation
    spectral_image_wavelength: SpectralImageWavelength | None = None
    flags_available: bool = False
    variance_available: bool = False
    nhits_available: bool = False
    flag_bit_definitions: dict[str, str] = Field(default_factory=dict)
    flag_bits: dict[str, int] = Field(default_factory=dict, description="Flag name to bit value")
    invalid_flag_bits: list[int] = Field(default_factory=list)
    metadata: SpectralMetadata = Field(default_factory=SpectralMetadata)
    quality: SpectralQuality
    warnings: list[str] = Field(default_factory=list)


class SpectralSummary(StrictModel):
    """Light-weight spectrum view for source listings; never includes channels."""

    spectrum_id: str = Field(..., pattern=r"^[0-9a-f]{32}$")
    source_id: str | None = Field(None, pattern=r"^[0-9a-f]{32}$")
    collection: str
    product_id: str
    ra_deg: float
    dec_deg: float
    valid_channel_count: int
    channel_count: int
    wavelength_min_um: float | None = None
    wavelength_max_um: float | None = None
    quality: SpectralQuality
    created_at: str


class SourceSpectraResponse(StrictModel):
    success: Literal[True] = True
    source_id: str = Field(..., pattern=r"^[0-9a-f]{32}$")
    spectra: list[SpectralSummary] = Field(default_factory=list)


class SpectralComparisonConfig(StrictModel):
    min_overlap_channels: int = Field(
        5,
        ge=1,
        le=102,
        description="Minimum number of jointly valid channels required to report a comparison",
    )
    wavelength_tolerance_um: float = Field(
        1e-4,
        gt=0.0,
        le=1.0,
        description="Maximum separation for pairing two channels on the same wavelength grid",
    )


class SpectralComparisonRequest(StrictModel):
    spectrum_id_a: str = Field(..., pattern=r"^[0-9a-f]{32}$")
    spectrum_id_b: str = Field(..., pattern=r"^[0-9a-f]{32}$")
    config: SpectralComparisonConfig = Field(default_factory=SpectralComparisonConfig)


class SpectralComparisonChannel(StrictModel):
    index_a: int
    index_b: int
    wavelength_um: float | None = None
    flux_a_mjy_sr: float | None = None
    flux_b_mjy_sr: float | None = None
    difference_mjy_sr: float | None = None
    ratio: float | None = None
    quality: SpectralQuality = "PASS"


class SpectralComparison(StrictModel):
    spectrum_id_a: str
    spectrum_id_b: str
    product_id_a: str | None = None
    product_id_b: str | None = None
    comparison_basis: Literal[
        "same_spectrum",
        "same_product_static_mosaic",
        "different_products_static_mosaic",
        "unknown",
    ] = "unknown"
    grid_compatible: bool
    wavelength_unit: WavelengthUnit = "um"
    flux_unit: FluxUnit = "MJy/sr"
    overlap_channel_count: int = 0
    channels: list[SpectralComparisonChannel] = Field(default_factory=list)
    quality: SpectralQualitySummary
    warnings: list[str] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    algorithm_version: str = SPECTRAL_ALGORITHM_VERSION
    created_at: str | None = None


class SpectralComparisonResponse(StrictModel):
    success: Literal[True] = True
    comparison: SpectralComparison


class SpectrumRecord(StrictModel):
    """Persisted representation: the spectrum plus the provenance that made it."""

    spectrum: Spectrum
    provenance: SpectralProvenance


__all__ = [
    "FluxKind",
    "FluxUnit",
    "SPECTRAL_ALGORITHM_VERSION",
    "SPECTRAL_EXTRACTION_METHOD",
    "SPECTRAL_PRODUCT_TYPE",
    "SourceSpectraResponse",
    "SpectralChannel",
    "SpectralComparison",
    "SpectralComparisonChannel",
    "SpectralComparisonConfig",
    "SpectralComparisonRequest",
    "SpectralComparisonResponse",
    "SpectralChannelsInfo",
    "SpectralExtractionConfig",
    "SpectralExtractionRequest",
    "SpectralExtractionResponse",
    "SpectralImageWavelength",
    "SpectralInspection",
    "SpectralMetadata",
    "SpectralProvenance",
    "SpectralQuality",
    "SpectralQualitySummary",
    "SpectralSummary",
    "Spectrum",
    "SpectrumRecord",
    "WavelengthUnit",
]
