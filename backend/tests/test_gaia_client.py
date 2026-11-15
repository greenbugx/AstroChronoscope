"""Gaia TAP client tests: HTTP behaviour, ADQL construction and response parsing.

All Archive responses are mocked; no test here (or anywhere in the default suite)
contacts the real Gaia Archive.
"""

from __future__ import annotations

import json
from typing import Any

import pytest
import requests

from app.core.exceptions import (
    GaiaHttpError,
    GaiaQueryError,
    GaiaRateLimitError,
    GaiaResponseError,
    GaiaTimeoutError,
    GaiaUnavailableError,
)
from app.core.config import Settings
from app.services.gaia_client import GaiaClient, cone_search_adql, source_by_id_adql

TAP_OK_BODY = {
    "metadata": [
        {"name": "source_id", "datatype": "long"},
        {"name": "ra", "datatype": "double", "unit": "deg"},
        {"name": "dec", "datatype": "double", "unit": "deg"},
    ],
    "data": [
        [6052401764442392832, 156.09, -41.64],
        [5416565470978459648, 156.09485718987077, -41.66313139228254],
    ],
}

TAP_ERROR_VOTABLE = (
    '<VOTABLE version="1.2"><RESOURCE type="results">'
    '<INFO name="QUERY_STATUS" value="ERROR">Cannot parse query'
    " 'SELECT TOP 1 FROM bogus' for job 'x-O': Encountered \"FROM\""
    "</INFO></RESOURCE></VOTABLE>"
)


class FakeResponse:
    def __init__(self, status_code: int = 200, body: Any = None, text: str | None = None) -> None:
        self.status_code = status_code
        self._text = text if text is not None else json.dumps(body)
        self._json: Any = body

    @property
    def text(self) -> str:
        return self._text

    def json(self) -> Any:
        if self._json is None:
            raise ValueError("no json")
        return self._json


class FakeSession:
    """Session stand-in recording POSTs and returning canned responses."""

    def __init__(self, response: FakeResponse | Exception) -> None:
        self.response = response
        self.calls: list[dict[str, Any]] = []

    def post(self, url: str, data: dict[str, str] | None = None, timeout: Any = None, **_: Any) -> FakeResponse:
        self.calls.append({"url": url, "data": data, "timeout": timeout})
        if isinstance(self.response, Exception):
            raise self.response
        return self.response

    def close(self) -> None:
        pass


def client_with(response: FakeResponse | Exception) -> tuple[GaiaClient, FakeSession]:
    session = FakeSession(response)
    client = GaiaClient(Settings(), session=session)
    return client, session


def run(client: GaiaClient) -> list[dict[str, Any]]:
    return client.run_adql("SELECT TOP 2 source_id, ra, dec FROM gaiadr3.gaia_source")


# ------------------------------------------------------------------ happy paths
def test_successful_tap_response_is_parsed_by_column_name() -> None:
    client, session = client_with(FakeResponse(200, TAP_OK_BODY))

    rows = run(client)

    assert rows[0]["source_id"] == 6052401764442392832
    assert rows[1]["ra"] == pytest.approx(156.09485718987077)
    assert set(rows[0]) == {"source_id", "ra", "dec"}
    sent = session.calls[0]
    assert sent["data"]["REQUEST"] == "doQuery"
    assert sent["data"]["LANG"] == "ADQL"
    assert sent["data"]["FORMAT"] == "json"
    assert "gaiadr3.gaia_source" in sent["data"]["QUERY"]
    assert sent["timeout"] == (Settings().connect_timeout, Settings().request_timeout)


def test_empty_result_is_a_valid_success() -> None:
    client, _ = client_with(FakeResponse(200, {"metadata": TAP_OK_BODY["metadata"], "data": []}))

    assert run(client) == []


# ------------------------------------------------------------------ error paths
def test_adql_parse_error_maps_to_gaia_query_error() -> None:
    client, _ = client_with(FakeResponse(400, text=TAP_ERROR_VOTABLE))

    with pytest.raises(GaiaQueryError) as excinfo:
        run(client)
    assert "Cannot parse query" in str(excinfo.value)


def test_generic_http_error_maps_to_gaia_http_error() -> None:
    client, _ = client_with(FakeResponse(503, text="Service Unavailable"))

    with pytest.raises(GaiaHttpError) as excinfo:
        run(client)
    assert "503" in str(excinfo.value)


def test_rate_limit_maps_to_gaia_rate_limit_error() -> None:
    client, _ = client_with(FakeResponse(429, text="back off"))

    with pytest.raises(GaiaRateLimitError):
        run(client)


def test_timeout_maps_to_gaia_timeout_error() -> None:
    client, _ = client_with(requests.Timeout("read timed out"))

    with pytest.raises(GaiaTimeoutError):
        run(client)


def test_connection_failure_maps_to_gaia_unavailable_error() -> None:
    client, _ = client_with(requests.ConnectionError("connection refused"))

    with pytest.raises(GaiaUnavailableError):
        run(client)


def test_non_json_body_maps_to_gaia_response_error() -> None:
    client, _ = client_with(FakeResponse(200, text="<html>proxy error</html>"))

    with pytest.raises(GaiaResponseError):
        run(client)


def test_unexpected_json_shape_maps_to_gaia_response_error() -> None:
    client, _ = client_with(FakeResponse(200, {"status": "ok"}))

    with pytest.raises(GaiaResponseError):
        run(client)


# --------------------------------------------------------------- ADQL builders
def test_cone_search_adql_converts_arcseconds_and_orders_by_separation() -> None:
    adql = cone_search_adql(ra=156.09, dec=-41.64, radius_arcsec=10.0, limit=50)

    assert "SELECT TOP 50" in adql
    assert "CIRCLE('ICRS', 156.0900000000, -41.6400000000, 0.0027777778)" in adql  # 10/3600 deg
    assert "ORDER BY sep_deg ASC" in adql
    for column in ("source_id", "ra", "dec", "parallax", "pmra", "pmdec", "phot_g_mean_mag", "ruwe", "ref_epoch"):
        assert column in adql


def test_cone_search_adql_includes_optional_magnitude_cut() -> None:
    adql = cone_search_adql(ra=10.0, dec=-20.0, radius_arcsec=5.0, magnitude_limit=18.5, limit=10)

    assert "AND phot_g_mean_mag <= 18.5000" in adql


def test_cone_search_adql_has_no_injection_surface() -> None:
    """Numbers are formatted; the only user-selectable strings are validated numerics."""
    adql = cone_search_adql(ra=1.5, dec=-2.5, radius_arcsec=1.0, magnitude_limit=12.0, limit=1)

    assert ";" not in adql
    assert "--" not in adql
    assert "'" not in adql.replace("'ICRS'", "")


def test_source_by_id_adql_uses_integer_equality() -> None:
    assert source_by_id_adql(6052401764442392832).endswith("WHERE source_id = 6052401764442392832")
