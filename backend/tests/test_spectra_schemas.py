"""Phase 4 spectral contracts: request rules, units, quality, settings and storage.

These tests do not touch IRSA. They pin the contract that the extraction and API
layers will implement: a spectrum is surface brightness per channel, cube
uncertainties are explicitly absent, and blank channels stay distinguishable from
measured zero flux.
"""

from __future__ import annotations

import json

import pytest
from pydantic import ValidationError

from app.core.cache import CacheStore
from app.core.config import Settings
from app.core.versions import SPECTRAL_ALGORITHM_VERSION
from app.schemas.spectra import (
    SourceSpectraResponse,
    SpectralChannel,
    SpectralComparisonRequest,
    SpectralExtractionConfig,
    SpectralExtractionRequest,
    SpectralExtractionResponse,
    SpectralProvenance,
    SpectralQualitySummary,
    SpectralSummary,
    Spectrum,
    SpectrumRecord,
)

CUBE_BYTES = 320_909_760


def _strict_json(text: str) -> dict:
    return json.loads(
        text,
        parse_constant=lambda value: (_ for _ in ()).throw(AssertionError(f"non-finite JSON: {value}")),
    )


def _provenance() -> SpectralProvenance:
    return SpectralProvenance(
        created_at="2026-11-15T00:00:00+00:00",
        software={"planet_x_backend": "0.1.0", "astropy": "8.0.2"},
        collection="spherex_dr1_cube",
        access_url="https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/hips5_cube/hips_20261026/Norder5/Dir0/Npix9621_cube.fits",
        fits_sha256="c" * 64,
        npix=9621,
        order=5,
        config={"spatial_method": "bilinear"},
    )


def _spectrum() -> Spectrum:
    valid = SpectralChannel(
        index=0,
        detector=1,
        subchan=1,
        wavelength_um=0.753,
        wl_min_um=0.743,
        wl_max_um=0.762,
        bandwidth_um=0.018,
        resolving_power=42.0,
        flux_mjy_sr=0.0932,
        uncertainty_mjy_sr=None,
        nhits=13,
        flags=2_097_152,
        flags_applied=[],
        quality="PASS",
    )
    blank = SpectralChannel(
        index=50,
        detector=3,
        subchan=17,
        wavelength_um=2.399,
        wl_min_um=2.367,
        wl_max_um=2.44,
        bandwidth_um=0.059,
        flux_mjy_sr=None,
        uncertainty_mjy_sr=None,
        nhits=0,
        flags=0,
        flags_applied=[],
        quality="FAIL",
    )
    return Spectrum(
        spectrum_id="a" * 32,
        source_id="b" * 32,
        collection="spherex_dr1_cube",
        product_id="ivo://irsa.ipac/spherex_dr1_cube?hips5_cube-hips_20261026/9621",
        obs_id="hips5_cube-hips_20261026",
        obs_publisher_did="ivo://irsa.ipac/spherex_dr1_cube?hips5_cube-hips_20261026/9621",
        ra_deg=156.09328159,
        dec_deg=-41.64466331,
        pixel_x=282.10,
        pixel_y=229.07,
        channel_count=2,
        valid_channel_count=1,
        blank_channels=[50],
        wavelength_min_um=0.753,
        wavelength_max_um=2.399,
        channels=[valid, blank],
        quality=SpectralQualitySummary(
            overall_status="PASS",
            uncertainty_status="NOT_VERIFIED",
            warnings=["cube_has_no_variance_extension"],
        ),
        limitations=["cube_is_static_mosaic", "surface_brightness_not_integrated_flux"],
    )


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"ra": 156.09},
        {"dec": -41.64},
    ],
)
def test_extraction_request_requires_source_or_both_coordinates(payload: dict) -> None:
    with pytest.raises(ValidationError):
        SpectralExtractionRequest(**payload)


def test_extraction_request_accepts_coordinates() -> None:
    request = SpectralExtractionRequest(ra=156.09328159, dec=-41.64466331)
    assert request.source_id is None
    assert request.config.spatial_method == "bilinear"


def test_extraction_request_accepts_source_id() -> None:
    request = SpectralExtractionRequest(source_id="b" * 32)
    assert request.ra is None and request.dec is None


def test_extraction_request_rejects_source_and_coordinates_together() -> None:
    with pytest.raises(ValidationError):
        SpectralExtractionRequest(source_id="b" * 32, ra=156.0, dec=-41.0)


def test_extraction_request_rejects_malformed_source_id() -> None:
    with pytest.raises(ValidationError):
        SpectralExtractionRequest(source_id="not-a-source-id")


def test_extraction_config_rejects_unknown_fields() -> None:
    with pytest.raises(ValidationError):
        SpectralExtractionConfig(aperture_radius_px=3.0)


def test_spectrum_serializes_explicit_units_and_absent_uncertainty() -> None:
    body = _strict_json(_spectrum().model_dump_json())

    assert body["wavelength_unit"] == "um"
    assert body["flux_unit"] == "MJy/sr"
    assert body["flux_kind"] == "surface_brightness"
    assert body["extraction_method"] == "cube_point_extraction"
    assert body["quality"]["uncertainty_status"] == "NOT_VERIFIED"

    valid, blank = body["channels"]
    assert valid["flux_mjy_sr"] == pytest.approx(0.0932)
    assert valid["uncertainty_mjy_sr"] is None
    assert valid["flags"] == 2_097_152
    assert valid["quality"] == "PASS"

    assert blank["flux_mjy_sr"] is None
    assert blank["nhits"] == 0
    assert blank["quality"] == "FAIL"
    assert blank["index"] in body["blank_channels"]


def test_spectrum_record_round_trips() -> None:
    record = SpectrumRecord(spectrum=_spectrum(), provenance=_provenance())
    restored = SpectrumRecord.model_validate_json(record.model_dump_json())

    assert restored.spectrum.spectrum_id == record.spectrum.spectrum_id
    assert restored.provenance.algorithm_version == SPECTRAL_ALGORITHM_VERSION
    assert restored.provenance.npix == 9621
    assert restored.spectrum.channels[0].uncertainty_mjy_sr is None


def test_extraction_response_shape() -> None:
    response = SpectralExtractionResponse(spectrum=_spectrum(), provenance=_provenance())
    body = _strict_json(response.model_dump_json())

    assert body["success"] is True
    assert body["spectrum"]["spectrum_id"] == "a" * 32
    assert body["provenance"]["collection"] == "spherex_dr1_cube"


def test_source_listing_summary_omits_channel_arrays() -> None:
    summary = SpectralSummary(
        spectrum_id="a" * 32,
        source_id="b" * 32,
        collection="spherex_dr1_cube",
        product_id="ivo://irsa.ipac/spherex_dr1_cube?hips5_cube-hips_20261026/9621",
        ra_deg=156.09328159,
        dec_deg=-41.64466331,
        valid_channel_count=100,
        channel_count=102,
        wavelength_min_um=0.753,
        wavelength_max_um=4.988,
        quality="PASS",
        created_at="2026-11-15T00:00:00+00:00",
    )
    response = SourceSpectraResponse(source_id="b" * 32, spectra=[summary])
    body = _strict_json(response.model_dump_json())

    assert body["spectra"][0]["valid_channel_count"] == 100
    assert "channels" not in body["spectra"][0]


def test_comparison_request_validates_ids_and_defaults() -> None:
    request = SpectralComparisonRequest(spectrum_id_a="a" * 32, spectrum_id_b="b" * 32)
    assert request.config.min_overlap_channels == 5

    with pytest.raises(ValidationError):
        SpectralComparisonRequest(spectrum_id_a="a", spectrum_id_b="b" * 32)


def test_settings_defaults_target_the_dr1_cube(tmp_path) -> None:
    settings = Settings(
        _env_file=None,
        storage_dir=tmp_path / "storage",
    )

    assert settings.spectral_collection == "spherex_dr1_cube"
    assert settings.spectral_spatial_method == "bilinear"
    assert settings.spectral_invalid_flag_bits == (1, 19)
    assert settings.max_concurrent_spectral == 2
    assert settings.spectral_max_download_bytes > CUBE_BYTES


def test_settings_ensure_dirs_creates_spectra_and_existing_storage(tmp_path) -> None:
    settings = Settings(
        _env_file=None,
        storage_dir=tmp_path / "storage",
    )
    settings.ensure_dirs()

    assert settings.spectra_dir == settings.storage_dir / "spectra"
    for directory in (
        settings.fits_dir,
        settings.previews_dir,
        settings.comparisons_dir,
        settings.sources_dir,
        settings.lightcurves_dir,
        settings.spectra_dir,
    ):
        assert directory.is_dir()


def test_settings_normalizes_and_validates_flag_bits(tmp_path) -> None:
    settings = Settings(
        _env_file=None,
        storage_dir=tmp_path / "storage",
        spectral_invalid_flag_bits=(19, 1, 19),
    )
    assert settings.spectral_invalid_flag_bits == (19, 1)

    with pytest.raises(ValidationError):
        Settings(_env_file=None, storage_dir=tmp_path / "storage", spectral_invalid_flag_bits=(32,))
    with pytest.raises(ValidationError):
        Settings(_env_file=None, storage_dir=tmp_path / "storage", spectral_invalid_flag_bits=(-1,))


def test_settings_rejects_unknown_spatial_method(tmp_path) -> None:
    with pytest.raises(ValidationError):
        Settings(
            _env_file=None,
            storage_dir=tmp_path / "storage",
            spectral_spatial_method="cubic",
        )


def test_cache_store_has_an_independent_spectra_cache() -> None:
    cache = CacheStore(ttl_seconds=60, max_entries=8)
    cache.spectra.set("spectrum", {"spectrum_id": "a" * 32})

    assert cache.spectra.get("spectrum") == {"spectrum_id": "a" * 32}
    assert cache.sources.get("spectrum") is None

    cache.clear()
    assert cache.spectra.get("spectrum") is None
