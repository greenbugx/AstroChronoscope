from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.core.cache import CacheStore
from app.core.exceptions import InvalidFitsFileError, SpectralProductNotFoundError, SpectrumNotFoundError
from app.schemas.spectra import SpectralExtractionRequest
from app.services.fits_service import download_fits
from app.services.spectral_resolver import resolve_cube
from app.services.spectral_service import SpectralService
from app.services.spectrum_catalog import SpectrumCatalogService
from app.services.spectrum_extraction import extract_cube_spectrum
from tests.conftest import (
    FITS_URL,
    TARGET_DEC,
    TARGET_RA,
    FakeResponse,
    FakeSession,
    RoutedSession,
    make_cube_fits_bytes,
)


CUBE_URL = "https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/hips5_cube/test_cube.fits"
CUBE_DID = "ivo://irsa.ipac/spherex_dr1_cube?hips5_cube-hips_20261026/9621"
SOURCE_ID = "a" * 32


def cube_row() -> dict:
    return {
        "s_ra": 156.093,
        "s_dec": -41.81,
        "dataproduct_type": "cube",
        "access_url": CUBE_URL,
        "access_format": "image/fits",
        "obs_id": "hips5_cube-hips_20261026",
        "obs_publisher_did": CUBE_DID,
        "t_min": 60789.848,
        "t_max": 61174.4729,
    }


class FakeObservations:
    def __init__(self, settings, rows=None, body=None):
        self.settings = settings
        self.rows = rows if rows is not None else [cube_row()]
        self.client = SimpleNamespace(
            session=RoutedSession([("test_cube.fits", body or make_cube_fits_bytes())])
        )

    def search_rows(self, ra, dec, radius, collection=None):
        return self.rows


class FakeSourceCatalog:
    def source(self, source_id):
        return SimpleNamespace(
            source=SimpleNamespace(reference_ra_deg=TARGET_RA, reference_dec_deg=TARGET_DEC)
        )


def extract(settings, tmp_path, *, source_id=None):
    path = tmp_path / "cube.fits"
    path.write_bytes(make_cube_fits_bytes())
    return extract_cube_spectrum(
        path,
        ra=TARGET_RA,
        dec=TARGET_DEC,
        collection=settings.spectral_collection,
        row=cube_row(),
        access_url=CUBE_URL,
        source_id=source_id,
        settings=settings,
    )


def test_extracts_cube_channels_and_keeps_missing_values_null(settings, tmp_path):
    response = extract(settings, tmp_path)
    spectrum = response.spectrum

    assert spectrum.channel_count == 5
    assert spectrum.valid_channel_count == 3
    assert spectrum.blank_channels == [2]
    assert spectrum.pixel_x == pytest.approx(4.5)
    assert spectrum.pixel_y == pytest.approx(4.5)
    assert spectrum.wavelength_min_um == pytest.approx(0.75)
    assert spectrum.wavelength_max_um == pytest.approx(4.98)
    assert spectrum.flux_unit == "MJy/sr"
    assert spectrum.flux_kind == "surface_brightness"
    assert len(spectrum.spectrum_id) == 32

    assert spectrum.channels[0].flux_mjy_sr == pytest.approx(50.5)
    assert spectrum.channels[1].flux_mjy_sr == pytest.approx(101.0)
    assert spectrum.channels[2].flux_mjy_sr is None
    assert spectrum.channels[2].quality == "FAIL"
    assert spectrum.channels[2].flags_applied == ["blank_channel"]
    assert spectrum.channels[3].flux_mjy_sr is None
    assert spectrum.channels[3].flags_applied == ["OVERFLOW"]
    assert spectrum.channels[4].flux_mjy_sr == pytest.approx(252.5)
    assert all(channel.uncertainty_mjy_sr is None for channel in spectrum.channels)

    assert spectrum.quality.uncertainty_status == "NOT_VERIFIED"
    assert spectrum.quality.overall_status == "WARNING"
    assert "no_variance_extension" in spectrum.quality.warnings
    assert "invalid_channels_masked" in spectrum.quality.warnings
    assert "cube_is_static_mosaic" in spectrum.limitations
    assert "surface_brightness_not_integrated_flux" in spectrum.limitations
    assert response.provenance.fits_sha256
    assert response.provenance.config["spatial_method"] == "bilinear"


def test_nearest_sampling_returns_the_nearest_pixel(settings, tmp_path):
    path = tmp_path / "cube.fits"
    path.write_bytes(make_cube_fits_bytes())
    response = extract_cube_spectrum(
        path,
        ra=TARGET_RA,
        dec=TARGET_DEC,
        collection=settings.spectral_collection,
        row=cube_row(),
        access_url=CUBE_URL,
        settings=settings,
        spatial_method="nearest",
    )
    assert response.spectrum.channels[0].flux_mjy_sr == pytest.approx(45.0)


def test_catalog_round_trip_and_source_listing(settings, tmp_path):
    response = extract(settings, tmp_path, source_id=SOURCE_ID)
    cache = CacheStore(60, 32)
    catalog = SpectrumCatalogService(settings, cache)

    record = catalog.store(response)
    assert record.spectrum.spectrum_id == response.spectrum.spectrum_id
    stored = catalog.get(response.spectrum.spectrum_id)
    assert stored.spectrum.channels[0].flux_mjy_sr == pytest.approx(50.5)

    summaries = catalog.list_for_source(SOURCE_ID)
    assert len(summaries) == 1
    assert summaries[0].spectrum_id == response.spectrum.spectrum_id
    assert summaries[0].valid_channel_count == 3
    assert summaries[0].quality == "WARNING"
    assert not list(settings.spectra_dir.glob("*.tmp"))

    with pytest.raises(SpectrumNotFoundError):
        catalog.get("not-an-id")


def test_spectral_download_cap_does_not_reuse_the_imaging_limit(settings, tmp_path):
    session = FakeSession(FakeResponse(status_code=200, content=b"x" * 64, headers={"Content-Type": "image/fits"}))
    with pytest.raises(InvalidFitsFileError):
        download_fits(FITS_URL, tmp_path / "too_large.fits", session=session, settings=settings, max_bytes=10)


def test_resolver_caches_the_cube_and_rejects_positions_without_a_cube(settings):
    observations = FakeObservations(settings)
    resolved = resolve_cube(observations, TARGET_RA, TARGET_DEC)

    assert resolved.path.is_file()
    assert resolved.product_id == CUBE_DID
    assert resolved.access_url == CUBE_URL
    assert resolved.collection == settings.spectral_collection

    missing = FakeObservations(settings, rows=[{**cube_row(), "dataproduct_type": "image"}])
    with pytest.raises(SpectralProductNotFoundError):
        resolve_cube(missing, TARGET_RA, TARGET_DEC)


def test_service_extracts_persists_and_lists_a_source_spectrum(settings):
    observations = FakeObservations(settings)
    service = SpectralService(settings, CacheStore(60, 32), observations, FakeSourceCatalog())

    response = service.extract(SpectralExtractionRequest(source_id=SOURCE_ID))
    assert response.spectrum.source_id == SOURCE_ID
    stored = service.spectrum(response.spectrum.spectrum_id)
    assert stored.spectrum.spectrum_id == response.spectrum.spectrum_id

    listing = service.source_spectra(SOURCE_ID)
    assert listing.source_id == SOURCE_ID
    assert [item.spectrum_id for item in listing.spectra] == [response.spectrum.spectrum_id]

    inspection = service.inspect(TARGET_RA, TARGET_DEC)
    assert inspection.product_format == "cube"
    assert inspection.wcs.target_inside_image is True
