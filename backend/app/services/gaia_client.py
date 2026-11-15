"""ESA Gaia Archive TAP client: HTTP access, ADQL execution and response parsing.

The interface was verified live on 2026-11-15 (see
``docs/GAIA_INTEGRATION_RESEARCH.md``):

* sync: ``POST {endpoint}`` form-encoded ``REQUEST=doQuery, LANG=ADQL, FORMAT=json,
  QUERY=...`` → ``200 {"metadata": [...], "data": [[...]]}``
* errors: ``HTTP 400`` with a VOTable body carrying
  ``<INFO name="QUERY_STATUS" value="ERROR">…`` (the JSON request format is ignored)
* no authentication for public tables
* ADQL geometry: ``1=CONTAINS(POINT('ICRS',ra,dec), CIRCLE('ICRS',ra0,dec0,r_deg))``,
  ``DISTANCE(POINT,POINT)`` in degrees

ADQL is built centrally from **validated** numbers only; no user string is ever
interpolated into a query.
"""

from __future__ import annotations

import logging
from typing import Any

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from app.core.config import Settings, get_settings
from app.core.exceptions import (
    GaiaHttpError,
    GaiaQueryError,
    GaiaRateLimitError,
    GaiaResponseError,
    GaiaTimeoutError,
    GaiaUnavailableError,
)

log = logging.getLogger(__name__)

#: Columns selected from ``gaia_source``. Verified against ``TAP_SCHEMA.columns``.
SOURCE_COLUMNS: tuple[str, ...] = (
    "source_id",
    "ra",
    "dec",
    "ra_error",
    "dec_error",
    "parallax",
    "parallax_error",
    "pmra",
    "pmdec",
    "pmra_error",
    "pmdec_error",
    "phot_g_mean_mag",
    "phot_bp_mean_mag",
    "phot_rp_mean_mag",
    "ruwe",
    "ref_epoch",
)

_COLUMNS_SQL = ", ".join(SOURCE_COLUMNS)


def cone_search_adql(
    *,
    ra: float,
    dec: float,
    radius_arcsec: float,
    magnitude_limit: float | None = None,
    limit: int,
    table: str = "gaiadr3.gaia_source",
) -> str:
    """Build the column-bounded cone-search ADQL. Inputs must already be validated.

    Radius is converted from arcseconds to degrees for the ADQL ``CIRCLE``; separation
    is selected in degrees and ordered ascending so the closest sources come first.
    """
    radius_deg = radius_arcsec / 3600.0
    sep = (
        f"DISTANCE(POINT('ICRS', ra, dec), "
        f"POINT('ICRS', {ra:.10f}, {dec:.10f})) AS sep_deg"
    )
    where = (
        f"1 = CONTAINS(POINT('ICRS', ra, dec), "
        f"CIRCLE('ICRS', {ra:.10f}, {dec:.10f}, {radius_deg:.10f}))"
    )
    if magnitude_limit is not None:
        # ``<= NULL`` is null, so unmeasured G magnitudes are excluded by design.
        where += f" AND phot_g_mean_mag <= {magnitude_limit:.4f}"
    return (
        f"SELECT TOP {int(limit)} {_COLUMNS_SQL}, {sep} "
        f"FROM {table} WHERE {where} ORDER BY sep_deg ASC"
    )


def source_by_id_adql(source_id: int, table: str = "gaiadr3.gaia_source") -> str:
    """Build the exact source lookup ADQL. ``source_id`` must be a validated integer."""
    return f"SELECT TOP 1 {_COLUMNS_SQL} FROM {table} WHERE source_id = {int(source_id)}"


def _candidates_adql(ra: float, dec: float, radius_arcsec: float, limit: int, table: str) -> str:
    """Cone query for cross-match candidates (no magnitude filter, no ordering need)."""
    radius_deg = radius_arcsec / 3600.0
    return (
        f"SELECT TOP {int(limit)} {_COLUMNS_SQL} "
        f"FROM {table} WHERE 1 = CONTAINS(POINT('ICRS', ra, dec), "
        f"CIRCLE('ICRS', {ra:.10f}, {dec:.10f}, {radius_deg:.10f}))"
    )


def _parse_row(raw: list[Any], metadata: list[dict[str, Any]]) -> dict[str, Any]:
    return {item["name"]: value for item, value in zip(metadata, raw)}


class GaiaClient:
    """Reusable, retrying HTTP client for the Gaia Archive TAP service."""

    def __init__(self, settings: Settings | None = None, session: requests.Session | None = None) -> None:
        self.settings = settings or get_settings()
        self._session = session

    # ------------------------------------------------------------------ HTTP
    @property
    def session(self) -> requests.Session:
        if self._session is None:
            session = requests.Session()
            session.headers.update({"User-Agent": self.settings.gaia_user_agent})
            retry = Retry(
                total=2,
                connect=2,
                read=0,
                backoff_factor=1.0,
                status_forcelist=(500, 502, 503, 504),
                allowed_methods=("POST",),  # sync queries are read-only server-side
                respect_retry_after_header=True,
            )
            adapter = HTTPAdapter(max_retries=retry, pool_connections=4, pool_maxsize=4)
            session.mount("https://", adapter)
            session.mount("http://", adapter)
            self._session = session
        return self._session

    def close(self) -> None:
        if self._session is not None:
            self._session.close()
            self._session = None

    # --------------------------------------------------------------- queries
    def run_adql(self, adql: str) -> list[dict[str, Any]]:
        """Execute one ADQL query and return rows as dicts keyed by column name.

        An empty result is a valid success and returns ``[]``.
        """
        try:
            response = self.session.post(
                self.settings.gaia_tap_endpoint,
                data={
                    "REQUEST": "doQuery",
                    "LANG": "ADQL",
                    "FORMAT": "json",
                    "QUERY": adql,
                },
                timeout=(self.settings.connect_timeout, self.settings.request_timeout),
            )
        except requests.Timeout as exc:
            raise GaiaTimeoutError("Gaia Archive TAP request timed out") from exc
        except requests.RequestException as exc:
            raise GaiaUnavailableError("Gaia Archive is unreachable", details={"reason": str(exc)}) from exc

        if response.status_code == 429:
            raise GaiaRateLimitError("Gaia Archive asked the client to back off (HTTP 429)")
        if response.status_code >= 400:
            message = self._tap_error_message(response)
            if "Cannot parse query" in message or "Syntax error" in message:
                raise GaiaQueryError(f"Gaia Archive rejected the ADQL query: {message}", details={"adql": adql})
            raise GaiaHttpError(
                f"Gaia Archive returned HTTP {response.status_code}",
                details={"status_code": response.status_code, "message": message[:500]},
            )

        try:
            payload = response.json()
        except ValueError as exc:
            raise GaiaResponseError("Gaia Archive returned non-JSON data") from exc
        if not isinstance(payload, dict) or "metadata" not in payload or "data" not in payload:
            raise GaiaResponseError(
                "Gaia Archive JSON is missing metadata/data",
                details={"keys": sorted(payload)[:10] if isinstance(payload, dict) else None},
            )

        metadata = payload["metadata"]
        rows_raw = payload["data"]
        if not isinstance(metadata, list) or not isinstance(rows_raw, list):
            raise GaiaResponseError("Gaia Archive JSON has unexpected metadata/data types")
        return [_parse_row(raw, metadata) for raw in rows_raw]

    @staticmethod
    def _tap_error_message(response: requests.Response) -> str:
        """Extract the QUERY_STATUS text from an error VOTable (or return raw text)."""
        text = response.text
        marker = 'name="QUERY_STATUS"'
        if marker in text:
            # The error text is the element content after the INFO tag.
            head, _, tail = text.partition(marker)
            start = tail.find(">")
            if start != -1:
                return tail[start + 1 : tail.find("</INFO>") if "</INFO>" in tail else None].strip()
            del head
        return text[:500]
