from __future__ import annotations

from app.schemas.common import Target
from app.schemas.lightcurve import (
    AssociatedSource,
    LightCurveProvenance,
    LightCurveQuery,
    SourceLightCurve,
    SourceRecord,
)
from app.services.source_catalog import SourceCatalogService
from tests.conftest import (
    TARGET_DEC,
    TARGET_RA,
    RoutedSession,
    make_cube_fits_bytes,
)

CUBE_URL = "https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/hips5_cube/test_cube.fits"
CUBE_DID = "ivo://irsa.ipac/spherex_dr1_cube?hips5_cube-hips_20261026/9621"


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


def seed_cube(api):
    client, fake_client, settings, cache = api
    fake_client.rows = [cube_row()]
    fake_client.session = RoutedSession([("test_cube.fits", make_cube_fits_bytes())])
    return client, settings


def test_spectral_extract_retrieve_and_compare_round_trip(api):
    client, _ = seed_cube(api)

    extracted = client.post(
        "/api/v1/spectra/extract",
        json={"ra": TARGET_RA, "dec": TARGET_DEC},
    )
    assert extracted.status_code == 200, extracted.text
    body = extracted.json()
    assert body["success"] is True
    spectrum = body["spectrum"]
    spectrum_id = spectrum["spectrum_id"]
    assert len(spectrum_id) == 32
    assert spectrum["channel_count"] == 5
    assert spectrum["valid_channel_count"] == 3
    assert spectrum["flux_unit"] == "MJy/sr"
    assert spectrum["quality"]["uncertainty_status"] == "NOT_VERIFIED"
    assert spectrum["channels"][2]["flux_mjy_sr"] is None
    assert "no_variance_extension" in spectrum["quality"]["warnings"]

    fetched = client.get(f"/api/v1/spectra/{spectrum_id}")
    assert fetched.status_code == 200, fetched.text
    assert fetched.json()["spectrum"]["spectrum_id"] == spectrum_id

    compared = client.post(
        "/api/v1/spectra/compare",
        json={
            "spectrum_id_a": spectrum_id,
            "spectrum_id_b": spectrum_id,
            "config": {"min_overlap_channels": 3},
        },
    )
    assert compared.status_code == 200, compared.text
    comparison = compared.json()["comparison"]
    assert comparison["comparison_basis"] == "same_spectrum"
    assert comparison["overlap_channel_count"] == 3
    assert comparison["grid_compatible"] is True
    assert comparison["quality"]["uncertainty_status"] == "NOT_VERIFIED"
    assert "identical_spectrum" in comparison["warnings"]


def test_source_spectra_are_listed_after_source_extraction(api):
    client, settings = seed_cube(api)
    source_id = "a" * 32
    record = SourceRecord(
        source=AssociatedSource(
            source_id=source_id,
            reference_ra_deg=TARGET_RA,
            reference_dec_deg=TARGET_DEC,
            detection_count=1,
            epoch_count=1,
        ),
        lightcurve=SourceLightCurve(
            source_id=source_id,
            reference_ra_deg=TARGET_RA,
            reference_dec_deg=TARGET_DEC,
            epoch_count=1,
        ),
        target=Target(ra=TARGET_RA, dec=TARGET_DEC),
        query=LightCurveQuery(radius_deg=0.1, cutout_size_deg=0.1),
        provenance=LightCurveProvenance(created_at="2026-11-15T00:00:00+00:00", software={"planet_x_backend": "0.1.0"}),
    )
    SourceCatalogService(settings, api[3])._write(  # noqa: SLF001 - fixture writes a real persisted record
        settings.sources_dir / f"{source_id}.json", record
    )

    extracted = client.post("/api/v1/spectra/extract", json={"source_id": source_id})
    assert extracted.status_code == 200, extracted.text
    assert extracted.json()["spectrum"]["source_id"] == source_id

    listing = client.get(f"/api/v1/sources/{source_id}/spectra")
    assert listing.status_code == 200, listing.text
    assert listing.json()["source_id"] == source_id
    assert len(listing.json()["spectra"]) == 1
    assert listing.json()["spectra"][0]["spectrum_id"] == extracted.json()["spectrum"]["spectrum_id"]


def test_spectral_api_rejects_unknown_ids_and_bad_requests(api):
    client, _ = seed_cube(api)

    missing_spectrum = client.get("/api/v1/spectra/not-an-id")
    assert missing_spectrum.status_code == 404
    assert missing_spectrum.json()["error"]["code"] == "SPECTRUM_NOT_FOUND"

    missing_source = client.get(f"/api/v1/sources/{'a' * 32}/spectra")
    assert missing_source.status_code == 404
    assert missing_source.json()["error"]["code"] == "SOURCE_NOT_FOUND"

    invalid_extract = client.post("/api/v1/spectra/extract", json={"ra": TARGET_RA})
    assert invalid_extract.status_code == 422
    assert invalid_extract.json()["error"]["code"] == "INVALID_REQUEST"

    unknown_compare = client.post(
        "/api/v1/spectra/compare",
        json={"spectrum_id_a": "a" * 32, "spectrum_id_b": "b" * 32},
    )
    assert unknown_compare.status_code == 404
    assert unknown_compare.json()["error"]["code"] == "SPECTRUM_NOT_FOUND"


def test_phase4_paths_are_documented(api):
    client, _ = seed_cube(api)
    paths = client.get("/openapi.json").json()["paths"]

    assert "/api/v1/spectra/extract" in paths
    assert "/api/v1/spectra/{spectrum_id}" in paths
    assert "/api/v1/spectra/compare" in paths
    assert "/api/v1/sources/{source_id}/spectra" in paths
