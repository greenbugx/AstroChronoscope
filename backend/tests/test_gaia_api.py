"""Gaia API tests: the three /api/v1/catalogs/gaia endpoints, fully mocked.

Service/dependencies are overridden so no request reaches the real Gaia Archive.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.api.deps import get_catalog_crossmatcher, get_gaia_client, get_gaia_service
from app.core.config import Settings
from app.core.exceptions import GaiaUnavailableError, InvalidGaiaSourceIdError
from app.main import app
from app.schemas.gaia import (
    CrossMatchResponse,
    GaiaConeSearchResponse,
)
from app.services.catalog_crossmatch import CatalogCrossMatcher
from app.services.gaia_service import GaiaService


# ---------------------------------------------------------------- fake services
class StubGaiaService:
    """Records calls and returns canned responses (or raises)."""

    def __init__(self, cone: GaiaConeSearchResponse | Exception | None = None,
                 source: dict | Exception | None = None) -> None:
        self.cone = cone
        self.source = source
        self.calls: list[dict] = []

    def cone_search(self, **kwargs):
        self.calls.append(kwargs)
        if isinstance(self.cone, Exception):
            raise self.cone
        return self.cone

    def get_source(self, source_id: str):
        self.calls.append({"source_id": source_id})
        if isinstance(self.source, Exception):
            raise self.source
        return self.source


class StubCrossMatcher:
    def __init__(self, response: CrossMatchResponse | Exception | None = None) -> None:
        self.response = response
        self.calls: list[tuple] = []

    def crossmatch(self, coordinates, config=None):
        self.calls.append((coordinates, config))
        if isinstance(self.response, Exception):
            raise self.response
        return self.response


@pytest.fixture
def api_client():
    """TestClient with Gaia deps overridden per-test inside the body."""

    def install(service, matcher=None):
        app.dependency_overrides[get_gaia_service] = lambda: service
        if matcher is not None:
            app.dependency_overrides[get_catalog_crossmatcher] = lambda: matcher
        with TestClient(app, raise_server_exceptions=False) as client:
            yield client
        app.dependency_overrides.clear()

    return install


# ------------------------------------------------------------------ cone search
def test_cone_search_success(api_client) -> None:
    response = GaiaConeSearchResponse(
        query={"ra": 10.0, "dec": 20.0, "radius_arcsec": 10.0, "limit": 100,
               "total_found": 1, "truncated": False},
        sources=[], separations_arcsec=[],
    )
    stub = StubGaiaService(cone=response)
    for client in api_client(stub):
        res = client.get("/api/v1/catalogs/gaia/search", params={"ra": 10.0, "dec": 20.0})

    assert res.status_code == 200
    body = res.json()
    assert body["success"] is True
    assert body["catalog"] == "Gaia DR3"
    assert stub.calls == [{"ra": 10.0, "dec": 20.0, "radius_arcsec": None,
                           "magnitude_limit": None, "limit": None}]


def test_cone_search_passes_query_parameters(api_client) -> None:
    response = GaiaConeSearchResponse(
        query={"ra": 10.0, "dec": 20.0, "radius_arcsec": 5.0, "magnitude_limit": 18.0,
               "limit": 5, "total_found": 0, "truncated": False},
        sources=[], separations_arcsec=[],
    )
    stub = StubGaiaService(cone=response)
    for client in api_client(stub):
        client.get("/api/v1/catalogs/gaia/search",
                   params={"ra": 10.0, "dec": 20.0, "radius_arcsec": 5.0,
                           "magnitude_limit": 18.0, "limit": 5})

    assert stub.calls[0]["radius_arcsec"] == 5.0
    assert stub.calls[0]["magnitude_limit"] == 18.0
    assert stub.calls[0]["limit"] == 5


def test_cone_search_rejects_out_of_range_parameters(api_client) -> None:
    stub = StubGaiaService()
    for client in api_client(stub):
        # ra beyond 360
        res = client.get("/api/v1/catalogs/gaia/search", params={"ra": 361.0, "dec": 0.0})
        assert res.status_code == 422
        # dec beyond ±90
        res = client.get("/api/v1/catalogs/gaia/search", params={"ra": 0.0, "dec": 95.0})
        assert res.status_code == 422
        # radius beyond the documented 60"
        res = client.get("/api/v1/catalogs/gaia/search",
                         params={"ra": 0.0, "dec": 0.0, "radius_arcsec": 61.0})
        assert res.status_code == 422
    assert stub.calls == []


def test_empty_cone_search_is_a_200_success(api_client) -> None:
    response = GaiaConeSearchResponse(
        query={"ra": 10.0, "dec": 20.0, "radius_arcsec": 10.0, "limit": 100,
               "total_found": 0, "truncated": False},
        sources=[], separations_arcsec=[],
    )
    for client in api_client(StubGaiaService(cone=response)):
        res = client.get("/api/v1/catalogs/gaia/search", params={"ra": 10.0, "dec": 20.0})

    assert res.status_code == 200
    assert res.json()["sources"] == []
    assert res.json()["query"]["total_found"] == 0


def test_gaia_unavailable_maps_to_503(api_client) -> None:
    for client in api_client(StubGaiaService(cone=GaiaUnavailableError("Archive down"))):
        res = client.get("/api/v1/catalogs/gaia/search", params={"ra": 10.0, "dec": 20.0})

    assert res.status_code == 503
    body = res.json()
    assert body["error"]["code"] == "GAIA_UNAVAILABLE"


# ------------------------------------------------------------------- crossmatch
def _crossmatch_response(status: str, n_candidates: int = 1) -> CrossMatchResponse:
    result = {
        "external_id": "t1",
        "status": status,
        "candidates": [
            {"separation_arcsec": 0.5, "source": _source_payload()} for _ in range(n_candidates)
        ],
        "best": None if status == "AMBIGUOUS" else (
            {"separation_arcsec": 0.5, "source": _source_payload()} if status == "MATCHED" else None
        ),
        "ambiguity_note": "2 Gaia sources lie within 3.0\"" if status == "AMBIGUOUS" else None,
        "epoch": {"gaia_reference_epoch": 2016.0, "propagated": False},
    }
    return CrossMatchResponse(
        catalog="Gaia DR3",
        config={"radius_arcsec": 3.0, "propagate_proper_motion": True,
                "propagation_margin_arcsec": 5.0, "ambiguous_when_more_than": 1},
        results=[result],
        matched=1 if status == "MATCHED" else 0,
        ambiguous=1 if status == "AMBIGUOUS" else 0,
        unmatched=1 if status == "UNMATCHED" else 0,
    )


def _source_payload() -> dict:
    return {
        "source_id": "1111",
        "coordinates": {"ra": 10.0, "dec": 20.0, "reference_epoch": 2016.0},
        "astrometry": {},
        "photometry": {},
        "provenance": {"retrieved_at": "2026-11-15T00:00:00+00:00",
                       "tap_endpoint": "https://tap"},
    }


def test_crossmatch_success(api_client) -> None:
    stub = StubCrossMatcher(_crossmatch_response("MATCHED"))
    for client in api_client(StubGaiaService(), stub):
        res = client.post("/api/v1/catalogs/gaia/crossmatch", json={
            "coordinates": [{"external_id": "t1", "ra": 10.0, "dec": 20.0, "epoch": 2025.5}],
            "config": {"radius_arcsec": 3.0, "propagate_proper_motion": True},
        })

    assert res.status_code == 200
    body = res.json()
    assert body["matched"] == 1
    assert body["results"][0]["status"] == "MATCHED"
    assert body["results"][0]["best"]["source"]["source_id"] == "1111"
    coordinates, config = stub.calls[0]
    assert coordinates[0].external_id == "t1"
    assert config.radius_arcsec == 3.0
    assert config.propagate_proper_motion is True


def test_crossmatch_ambiguous(api_client) -> None:
    stub = StubCrossMatcher(_crossmatch_response("AMBIGUOUS", n_candidates=2))
    for client in api_client(StubGaiaService(), stub):
        res = client.post("/api/v1/catalogs/gaia/crossmatch", json={
            "coordinates": [{"external_id": "t1", "ra": 10.0, "dec": 20.0}],
        })

    assert res.status_code == 200
    body = res.json()
    assert body["ambiguous"] == 1
    assert body["results"][0]["best"] is None
    assert body["results"][0]["ambiguity_note"]


def test_crossmatch_rejects_empty_coordinates_and_bad_values(api_client) -> None:
    for client in api_client(StubGaiaService(), StubCrossMatcher()):
        res = client.post("/api/v1/catalogs/gaia/crossmatch", json={"coordinates": []})
        assert res.status_code == 422
        res = client.post("/api/v1/catalogs/gaia/crossmatch", json={
            "coordinates": [{"external_id": "t1", "ra": 400.0, "dec": 0.0}]
        })
        assert res.status_code == 422
        res = client.post("/api/v1/catalogs/gaia/crossmatch", json={
            "coordinates": [{"external_id": "t1", "ra": 0.0, "dec": 0.0}],
            "config": {"radius_arcsec": 0.0},
        })
        assert res.status_code == 422


# ---------------------------------------------------------------- source detail
def test_source_detail_success(api_client) -> None:
    stub = StubGaiaService(source=_source_payload())  # get_source returns a GaiaSource
    for client in api_client(stub):
        res = client.get("/api/v1/catalogs/gaia/1111")

    assert res.status_code == 200
    assert res.json()["source"]["source_id"] == "1111"
    assert stub.calls == [{"source_id": "1111"}]


def test_source_detail_missing_record_maps_to_404(api_client) -> None:
    from app.core.exceptions import GaiaSourceNotFoundError

    for client in api_client(StubGaiaService(source=GaiaSourceNotFoundError("no such source"))):
        res = client.get("/api/v1/catalogs/gaia/999999999999")

    assert res.status_code == 404
    assert res.json()["error"]["code"] == "GAIA_SOURCE_NOT_FOUND"


def test_source_detail_invalid_identifier_maps_to_400(api_client) -> None:
    for client in api_client(StubGaiaService(source=InvalidGaiaSourceIdError("bad id"))):
        res = client.get("/api/v1/catalogs/gaia/not-a-number")

    assert res.status_code == 400
    assert res.json()["error"]["code"] == "INVALID_GAIA_SOURCE_ID"


# ------------------------------------------------------- wiring sanity (no overrides)
def test_gaia_dependencies_are_wired() -> None:
    """The router resolves through real deps when no override is active."""
    from app.api.deps import get_cache_store, get_settings_dep

    app.dependency_overrides.clear()
    try:
        service = get_gaia_service(
            client=get_gaia_client(),
            cache=get_cache_store(),
            settings=get_settings_dep(),
        )
        matcher = get_catalog_crossmatcher(service)
        assert isinstance(service, GaiaService)
        assert isinstance(matcher, CatalogCrossMatcher)
        assert isinstance(service.settings, Settings)
        assert service.cache is not None
    finally:
        app.dependency_overrides.clear()
