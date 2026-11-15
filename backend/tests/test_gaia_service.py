"""Gaia service tests: cone search, normalization, caching and record lookup.

The TAP client is replaced by a fake returning rows in the verified Archive JSON
shape; values are synthetic but shaped like real DR3 rows (never presented as real
observations).
"""

from __future__ import annotations


import pytest

from app.core.cache import CacheStore
from app.core.config import Settings
from app.core.exceptions import (
    GaiaSourceNotFoundError,
    InvalidCoordinateError,
    InvalidGaiaSourceIdError,
    InvalidRadiusError,
)
from app.services.gaia_service import GaiaService, angular_separation_arcsec

# Synthetic DR3-shaped row: identifiers and values are invented for tests.
SYNTHETIC_ROW = {
    "source_id": 1234567890,
    "ra": 180.123456,
    "dec": 45.678901,
    "ra_error": 0.12,
    "dec_error": 0.09,
    "parallax": 2.1,
    "parallax_error": 0.2,
    "pmra": 4.3,
    "pmdec": -2.1,
    "pmra_error": 0.15,
    "pmdec_error": 0.11,
    "phot_g_mean_mag": 15.2,
    "phot_bp_mean_mag": 15.8,
    "phot_rp_mean_mag": 14.6,
    "ruwe": 1.05,
    "ref_epoch": 2016.0,
}


class FakeGaiaClient:
    """run_adql stand-in with canned rows and a call log."""

    def __init__(self, rows: list[dict] | None = None) -> None:
        self.rows = rows or []
        self.adql_calls: list[str] = []

    def run_adql(self, adql: str) -> list[dict]:
        self.adql_calls.append(adql)
        return self.rows

    def close(self) -> None:
        pass


def service_with(rows: list[dict] | None = None, cached: bool = True, settings: Settings | None = None):
    settings = settings or Settings(storage_dir="/tmp/planetx-test-gaia")
    client = FakeGaiaClient(rows)
    cache = CacheStore(60, 32) if cached else None
    return GaiaService(client, cache, settings), client


# ------------------------------------------------------------------ cone search
def test_cone_search_normalizes_units_and_preserves_nulls() -> None:
    svc, _ = service_with([{**SYNTHETIC_ROW, "parallax": None, "pmra": None, "phot_bp_mean_mag": None}])

    response = svc.cone_search(ra=180.123456, dec=45.678901, radius_arcsec=5.0, limit=10)

    assert response.success is True
    assert response.catalog == "Gaia DR3"
    assert len(response.sources) == 1
    source = response.sources[0]
    assert source.source_id == "1234567890"  # string, survives JS number limits
    assert source.coordinates.ra == pytest.approx(180.123456)
    assert source.coordinates.dec == pytest.approx(45.678901)
    assert source.coordinates.reference_epoch == pytest.approx(2016.0)
    assert source.astrometry.parallax_mas is None  # missing values stay null, never 0
    assert source.astrometry.pmra_mas_yr is None
    assert source.astrometry.pmdec_mas_yr == pytest.approx(-2.1)  # mas/yr preserved
    assert source.astrometry.ruwe == pytest.approx(1.05)
    assert source.photometry.g == pytest.approx(15.2)  # mag
    assert source.photometry.bp is None
    assert source.provenance.catalog == "Gaia DR3"
    assert source.provenance.retrieved_at
    assert source.provenance.tap_endpoint.startswith("https://gea.esac.esa.int/")
    # Separation from the query centre, ascending order, arcseconds
    assert response.separations_arcsec == pytest.approx([0.0], abs=1e-6)


def test_cone_search_separation_is_spherical_not_euclidean() -> None:
    """A 90 deg RA difference near the pole is ~0.1 deg spherical, not 90 deg naive."""
    svc, _ = service_with([{**SYNTHETIC_ROW, "ra": 90.0, "dec": 89.9}])

    response = svc.cone_search(ra=0.0, dec=89.9, radius_arcsec=60.0, limit=10)

    expected = angular_separation_arcsec(0.0, 89.9, 90.0, 89.9)
    assert response.separations_arcsec[0] == pytest.approx(expected, rel=1e-3)
    # Euclidean RA/Dec distance would report ~324000" (90 deg); spherical gives ~509".
    assert response.separations_arcsec[0] == pytest.approx(509.1, rel=1e-2)
    assert response.separations_arcsec[0] < 1000.0


def test_cone_search_caches_repeated_queries() -> None:
    svc, client = service_with([SYNTHETIC_ROW])

    first = svc.cone_search(ra=10.0, dec=20.0, radius_arcsec=10.0, limit=5)
    second = svc.cone_search(ra=10.0, dec=20.0, radius_arcsec=10.0, limit=5)

    assert len(client.adql_calls) == 1
    assert first.sources[0].source_id == second.sources[0].source_id
    # A different radius must not reuse the cached result.
    svc.cone_search(ra=10.0, dec=20.0, radius_arcsec=20.0, limit=5)
    assert len(client.adql_calls) == 2


def test_cone_search_reports_truncation() -> None:
    rows = [
        {**SYNTHETIC_ROW, "source_id": index, "ra": 10.0 + index * 1e-4}
        for index in range(4)
    ]
    svc, _ = service_with(rows)

    response = svc.cone_search(ra=10.0, dec=45.678901, radius_arcsec=60.0, limit=4)

    assert response.query.total_found == 4
    assert response.query.truncated is True
    assert response.separations_arcsec == sorted(response.separations_arcsec)


def test_empty_cone_search_is_success_not_error() -> None:
    svc, _ = service_with([])

    response = svc.cone_search(ra=10.0, dec=20.0, radius_arcsec=10.0)

    assert response.sources == []
    assert response.separations_arcsec == []
    assert response.query.total_found == 0
    assert response.query.truncated is False


# ------------------------------------------------------------------- validation
@pytest.mark.parametrize(
    ("kwargs", "error"),
    [
        ({"ra": 361.0, "dec": 0.0}, InvalidCoordinateError),
        ({"ra": -1.0, "dec": 0.0}, InvalidCoordinateError),
        ({"ra": 10.0, "dec": 91.0}, InvalidCoordinateError),
        ({"ra": 10.0, "dec": -91.0}, InvalidCoordinateError),
        ({"ra": 10.0, "dec": 10.0, "radius_arcsec": 0.0}, InvalidRadiusError),
        ({"ra": 10.0, "dec": 10.0, "radius_arcsec": -5.0}, InvalidRadiusError),
        (
            {"ra": 10.0, "dec": 10.0, "radius_arcsec": Settings().gaia_max_search_radius_arcsec + 1},
            InvalidRadiusError,
        ),
    ],
)
def test_cone_search_rejects_invalid_inputs(kwargs: dict, error: type) -> None:
    svc, _ = service_with()

    with pytest.raises(error):
        svc.cone_search(**kwargs)


def test_cone_search_rejects_bad_magnitude_limit() -> None:
    svc, _ = service_with()

    with pytest.raises(ValueError):
        svc.cone_search(ra=10.0, dec=10.0, radius_arcsec=5.0, magnitude_limit=99.0)


def test_cone_search_clamps_limit_to_the_configured_maximum() -> None:
    svc, client = service_with([])

    response = svc.cone_search(ra=10.0, dec=10.0, radius_arcsec=5.0, limit=100_000)

    assert response.query.limit == Settings().gaia_max_results
    assert "SELECT TOP 1000" in client.adql_calls[0]


# ------------------------------------------------------------------ get_source
def test_get_source_returns_the_normalized_record() -> None:
    svc, client = service_with([SYNTHETIC_ROW])

    source = svc.get_source("1234567890")

    assert source.source_id == "1234567890"
    assert "WHERE source_id = 1234567890" in client.adql_calls[0]
    # Second call is served from cache.
    svc.get_source(1234567890)
    assert len(client.adql_calls) == 1


def test_get_source_rejects_invalid_identifiers() -> None:
    svc, _ = service_with()

    for bad in ("abc", "12x", "-5", "0", "", "1e9"):
        with pytest.raises(InvalidGaiaSourceIdError):
            svc.get_source(bad)


def test_get_source_404_when_the_archive_has_no_record() -> None:
    svc, _ = service_with([])

    with pytest.raises(GaiaSourceNotFoundError) as excinfo:
        svc.get_source("999999999999")
    assert excinfo.value.details == {"source_id": 999999999999}


def test_polar_coordinates_are_valid_and_use_spherical_geometry() -> None:
    svc, _ = service_with([{**SYNTHETIC_ROW, "ra": 0.0, "dec": 89.99}])

    response = svc.cone_search(ra=180.0, dec=89.99, radius_arcsec=60.0, limit=5)

    # Spherical separation is 2*asin(cos(dec)) ~ 72", not the naive 180 deg = 648000".
    assert response.separations_arcsec[0] == pytest.approx(72.0, rel=1e-2)
    assert response.separations_arcsec[0] < 100.0
