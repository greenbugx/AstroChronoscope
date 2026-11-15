"""Frontend-facing contract: CORS, URL resolution, JSON strictness, error shapes."""

from __future__ import annotations

import json

import pytest
from pydantic import ValidationError

from app.core.config import Settings

ALLOWED_ORIGIN = "http://localhost:3000"
VITE_ORIGIN = "http://localhost:5173"


def strict_json(text: str) -> dict:
    """Reject NaN/Infinity — they would be invalid JSON for frontend parsers."""
    return json.loads(text, parse_constant=lambda value: (_ for _ in ()).throw(AssertionError(f"non-finite JSON: {value}")))


def _search(client, **overrides) -> dict:
    payload = {"ra": 156.09328159, "dec": -41.64466331, "radius": 0.01, "collection": "spherex_qr3"}
    payload.update(overrides)
    response = client.post("/api/v1/observations/search", json=payload)
    assert response.status_code == 200, response.text
    return response


def test_cors_preflight_allows_configured_origin(api) -> None:
    client, *_ = api
    response = client.options(
        "/api/v1/observations/search",
        headers={
            "Origin": ALLOWED_ORIGIN,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == ALLOWED_ORIGIN
    assert "POST" in response.headers["access-control-allow-methods"]
    assert "content-type" in response.headers["access-control-allow-headers"]


def test_cors_preflight_allows_loopback_vite_origin(api) -> None:
    client, *_ = api
    origin = "http://127.0.0.1:5173"
    response = client.options(
        "/",
        headers={"Origin": origin, "Access-Control-Request-Method": "GET"},
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == origin
    assert "GET" in response.headers["access-control-allow-methods"]


def test_cors_preflight_rejects_unknown_origin(api) -> None:
    client, *_ = api
    response = client.options(
        "/api/v1/observations/search",
        headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"},
    )
    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers


def test_cors_headers_and_exposed_count(api) -> None:
    client, *_ = api
    response = client.post(
        "/api/v1/observations/search",
        json={"ra": 156.09328159, "dec": -41.64466331, "radius": 0.01},
        headers={"Origin": ALLOWED_ORIGIN},
    )
    assert response.headers["access-control-allow-origin"] == ALLOWED_ORIGIN
    assert "x-observation-count" in response.headers["access-control-expose-headers"].lower()
    assert response.headers["x-observation-count"] == "1"


def test_wildcard_cors_is_rejected(settings) -> None:
    with pytest.raises(ValidationError):
        Settings(cors_origins=("*",))
    with pytest.raises(ValidationError):
        Settings(cors_origins=("http://localhost:3000", "*"))


def test_cors_origins_are_normalised() -> None:
    configured = Settings(cors_origins=(" https://planetx.example/ ",)).cors_origins
    assert configured == ("https://planetx.example",)


def test_search_json_is_strict(api) -> None:
    client, *_ = api
    response = _search(client)
    body = strict_json(response.text)
    assert body["success"] is True
    assert body["collection"] == "spherex_qr3"
    assert body["total_observations"] == 1


def test_cutout_urls_resolve_and_serve_with_cors(api) -> None:
    client, fake, settings, _ = api
    search = _search(client).json()
    observation_id = search["observations"][0]["observation_id"]

    cutout = client.post(
        f"/api/v1/observations/{observation_id}/cutout",
        json={"ra": 156.09328159, "dec": -41.64466331, "size": 0.1},
        headers={"Origin": ALLOWED_ORIGIN},
    )
    assert cutout.status_code == 200
    body = strict_json(cutout.text)

    # URLs are API-relative; the frontend resolves them against the API origin.
    assert body["cutout"]["fits_url"].startswith("/api/v1/files/")
    assert body["cutout"]["preview_url"].startswith("/api/v1/files/")

    preview = client.get(body["cutout"]["preview_url"], headers={"Origin": ALLOWED_ORIGIN})
    assert preview.status_code == 200
    assert preview.headers["content-type"] == "image/png"
    assert preview.headers["access-control-allow-origin"] == ALLOWED_ORIGIN
    assert preview.headers["cache-control"] == "public, max-age=3600"
    assert preview.content[:8] == b"\x89PNG\r\n\x1a\n"

    fits_response = client.get(body["cutout"]["fits_url"], headers={"Origin": ALLOWED_ORIGIN})
    assert fits_response.status_code == 200
    assert fits_response.headers["content-type"] == "image/fits"
    assert fits_response.headers["access-control-allow-origin"] == ALLOWED_ORIGIN
    assert fits_response.content[:6] == b"SIMPLE"

    # Repeated requests produce the same stable URLs (safe for frontend caching).
    again = client.post(
        f"/api/v1/observations/{observation_id}/cutout",
        json={"ra": 156.09328159, "dec": -41.64466331, "size": 0.1},
    ).json()
    assert again["cutout"] == body["cutout"]
    assert len(fake.session.calls) == 1


def test_file_preflight(api) -> None:
    client, *_ = api
    response = client.options(
        "/api/v1/files/" + "a" * 64 + ".png",
        headers={"Origin": ALLOWED_ORIGIN, "Access-Control-Request-Method": "GET"},
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == ALLOWED_ORIGIN


def test_error_envelopes_are_consistent(api) -> None:
    client, *_ = api

    unknown_route = client.get("/api/v1/nope")
    assert unknown_route.status_code == 404
    assert unknown_route.json()["success"] is False
    assert unknown_route.json()["error"]["code"] == "HTTP_ERROR"

    wrong_method = client.delete("/api/v1/health")
    assert wrong_method.status_code == 405
    assert wrong_method.json()["error"]["code"] == "HTTP_ERROR"

    malformed_body = client.post(
        "/api/v1/observations/search",
        content=b"{not json",
        headers={"Content-Type": "application/json"},
    )
    assert malformed_body.status_code == 422
    assert malformed_body.json()["error"]["code"] == "INVALID_REQUEST"

    bad_field = client.post("/api/v1/observations/search", json={"ra": 10, "dec": 10, "nope": True})
    assert bad_field.status_code == 422
    assert bad_field.json()["error"]["details"]["errors"]


def test_openapi_documents_all_public_routes(api) -> None:
    client, *_ = api
    paths = client.get("/openapi.json").json()["paths"]
    assert set(paths) == {
        "/",
        "/api/v1/health",
        "/api/v1/observations/search",
        "/api/v1/observations/{observation_id}",
        "/api/v1/observations/{observation_id}/cutout",
        "/api/v1/targets/timeline",
        "/api/v1/images/inspect",
        "/api/v1/images/compare",
        "/api/v1/images/comparisons/{comparison_id}",
            "/api/v1/sources/detect",
            "/api/v1/sources/photometry",
            "/api/v1/sources/{source_id}",
            "/api/v1/sources/{source_id}/catalogs",
            "/api/v1/sources/{source_id}/lightcurve",                "/api/v1/sources/{source_id}/variability",
                "/api/v1/sources/{source_id}/spectra",
                "/api/v1/targets/lightcurve",
                "/api/v1/targets/variability",
                "/api/v1/spectra/extract",
                "/api/v1/spectra/{spectrum_id}",
                "/api/v1/spectra/compare",
                "/api/v1/files/{filename}",
                "/api/v1/catalogs/gaia/search",
                "/api/v1/catalogs/gaia/crossmatch",
                "/api/v1/catalogs/gaia/{source_id}",
    }


def test_root_matches_astrochronoscope_connectivity_contract(api) -> None:
    """AstroChronoscope fetches `${VITE_API_URL}/` and displays `body.message`."""
    client, *_ = api
    response = client.get("/", headers={"Origin": VITE_ORIGIN})

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/json")
    body = response.json()
    assert isinstance(body["message"], str) and body["message"].strip()
    assert response.headers["access-control-allow-origin"] == VITE_ORIGIN


def test_root_cors_preflight_from_vite_origin(api) -> None:
    client, *_ = api
    response = client.options(
        "/",
        headers={"Origin": VITE_ORIGIN, "Access-Control-Request-Method": "GET"},
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == VITE_ORIGIN
    assert "GET" in response.headers["access-control-allow-methods"]


def test_api_health_remains_available_for_existing_clients(api) -> None:
    client, *_ = api
    response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json()["success"] is True
    assert response.json()["status"] == "ok"
