# Gaia DR3 Catalog Integration (Phase 5)

Production-oriented Gaia DR3 catalog module: cone search, source retrieval,
coordinate cross-matching with optional proper-motion epoch propagation, and
REST APIs — independently usable without Phase 3's source-detection pipeline.

The underlying Gaia Archive interface facts were **verified live on 2026-11-15**
against the real service; see [`GAIA_INTEGRATION_RESEARCH.md`](GAIA_INTEGRATION_RESEARCH.md)
for the evidence. Nothing in this document is taken from an unverified tutorial.

## 1. Architecture

```text
API (app/api/gaia_routes.py)          3 REST endpoints under /api/v1
  └─ CatalogCrossMatcher              cross-match engine (app/services/catalog_crossmatch.py)
       └─ GaiaService                 validation, caching, normalization (app/services/gaia_service.py)
            └─ GaiaClient             TAP HTTP client + ADQL builders (app/services/gaia_client.py)
Schemas: app/schemas/gaia.py          StrictModel pydantic contracts
```

Conventions follow the Phase 1–2 backend: `uv`/Python ≥ 3.14, `requests` +
`urllib3.Retry` session, `StrictModel` schemas, `PlanetXError` exception
envelope, `/api/v1` prefix, thread-safe TTL `CacheStore`.

## 2. Gaia DR3 access

| Item | Value |
|---|---|
| Endpoint | `POST https://gea.esac.esa.int/tap-server/tap/sync` (sync TAP) |
| Form fields | `REQUEST=doQuery`, `LANG=ADQL`, `FORMAT=json`, `QUERY=<ADQL>` |
| Auth | none for public tables (anonymous) |
| Success | HTTP 200, `{"metadata": [...], "data": [[...]]}` — rows keyed by column name |
| Errors | HTTP 400 (+ VOTable `QUERY_STATUS=ERROR` body even for `FORMAT=json`), 429, 5xx |
| Async UWS | `/tap/async` exists (verified) but is **not implemented**; bounded sync queries suffice |

### ADQL strategy

All ADQL is built centrally in `gaia_client.py` from **validated numbers only**
(coordinates pass `validate_coordinates`, radius/limit/magnitude are range-checked);
no user string is ever interpolated. Column set is fixed (`SOURCE_COLUMNS`):

```sql
SELECT TOP <limit>
  source_id, ra, dec, ra_error, dec_error,
  parallax, parallax_error, pmra, pmdec, pmra_error, pmdec_error,
  phot_g_mean_mag, phot_bp_mean_mag, phot_rp_mean_mag, ruwe, ref_epoch,
  DISTANCE(POINT('ICRS', ra, dec), POINT('ICRS', <ra0>, <dec0>)) AS sep_deg
FROM gaiadr3.gaia_source
WHERE 1 = CONTAINS(POINT('ICRS', ra, dec),
                   CIRCLE('ICRS', <ra0>, <dec0>, <radius_deg>))
  [AND phot_g_mean_mag <= <magnitude_limit>]
ORDER BY sep_deg ASC
```

Server-side `DISTANCE` orders by true angular separation; the API additionally
recomputes separations client-side (see §4). An empty result is a valid success.

## 3. Fields and units

All columns verified against `TAP_SCHEMA.columns` (units as served):

| Field | Unit | Notes |
|---|---|---|
| `source_id` | — | exposed as **string** (TAP `long`; must survive JS number handling) |
| `ra`, `dec` | deg | ICRS at `ref_epoch` |
| `ra_error`, `dec_error` | mas | |
| `parallax`, `parallax_error` | mas | zero-point correction **not** applied |
| `pmra`, `pmdec` | mas yr⁻¹ | `pmra` is μα\* (**includes cos δ**) |
| `pmra_error`, `pmdec_error` | mas yr⁻¹ | |
| `phot_g_mean_mag`, `phot_bp_mean_mag`, `phot_rp_mean_mag` | mag | |
| `ruwe` | — | quality indicator (see §7) |
| `ref_epoch` | yr | **2016.0 = J2016.0** (verified in real rows) |

Missing catalog values stay `null` — never 0, never a placeholder. NaN/inf
incoming values are treated as missing. Every record carries provenance:
`catalog` ("Gaia DR3"), `retrieved_at` (ISO-8601 UTC), `query_reference`
(deterministic SHA-256 ref, not raw SQL), `tap_endpoint`.

## 4. Coordinate conventions and separation

- RA ∈ [0, 360)°, Dec ∈ [−90, 90]°, ICRS; RA wraparound and polar sources handled.
- Separations are **great-circle** (haversine) in arcseconds, implemented in
  `angular_separation_arcsec` and verified against `astropy SkyCoord.separation`
  (including near-pole and wraparound cases). Euclidean RA/Dec distance is never
  used: 90° of RA at Dec 89.9° is ~509″, not ~324000″.
- Cone-search radius: arcseconds (converted to degrees for ADQL); default 10″,
  max 60″ (config `gaia_max_search_radius_arcsec`).

## 5. Cross-matching (`POST /catalogs/gaia/crossmatch`)

Input: list of external coordinates (`external_id`, `ra`, `dec`, optional
`epoch` Julian year, optional `uncertainty_arcsec`), plus config
(`radius_arcsec` default 3″ max 60″, `ambiguous_when_more_than` default 1,
`propagate_proper_motion` default true, `propagation_margin_arcsec` default 5″).

Algorithm per target:

1. **Candidate fetch** — cone search on the *catalogue* (J2016.0) position with
   radius + margin (margin only when propagation is active and an epoch was
   given) so sources that move *into* the match radius are not missed.
2. **Per-candidate separation** — if the candidate has proper motion and the
   target has an epoch ≥ 0.01 yr from J2016.0, the Gaia position is propagated
   (§6) and the separation is computed against the **propagated** position;
   otherwise the catalogue separation is used.
3. **Filter and rank** — only candidates with used-separation ≤ `radius_arcsec`
   survive; sorted ascending. `best` is the nearest candidate only when the
   match is not ambiguous.
4. **Status**:
   - `MATCHED` — exactly `ambiguous_when_more_than` or fewer candidates.
   - `AMBIGUOUS` — more candidates than the threshold; `best` is `None`, an
     `ambiguity_note` explains that no unique counterpart can be chosen from
     position alone. A match is never forced.
   - `UNMATCHED` — no candidates inside the radius. **Not** evidence that an
     external (e.g. SPHEREx) detection is invalid — Gaia is an optical survey
     and misses embedded/IR-only sources.
5. Response aggregates `matched` / `ambiguous` / `unmatched` counts.

A coordinate match is **not** a confirmed physical association; the API labels
matches as positional only.

## 6. Epoch handling and proper-motion propagation

- Gaia DR3 positions are at reference epoch **J2016.0** (`ref_epoch` verified).
- Propagation uses Astropy `SkyCoord.apply_space_motion` (ERFA `pmsafe`), with
  `pmra` mapped to `pm_ra_cosdec` because Gaia's `pmra` is μα\*. Validated
  numerically against an independent Astropy construction in tests.
- Original (`coordinates` at `reference_epoch`) and propagated positions are
  reported separately (`epoch.propagated_ra/dec`); `separation_propagated_arcsec`
  records which separation the match decision used.
- Propagation is **skipped** (with an explicit `limitation` string) when:
  the target has no epoch, `|epoch − 2016.0| < 0.01 yr`, `pmra`/`pmdec` is
  missing (two-parameter solutions), or the transform fails. The catalogue
  position is then used unpropagated over the stated epoch gap.
- ERFA's "distance overridden" warning (no parallax-based distance supplied) is
  suppressed *in code*; for decade-scale, sub-arcsecond-per-year proper motions
  the perspective term is negligible. Propagation is **not** a full covariance
  treatment: external positional uncertainty and propagated Gaia uncertainty are
  not combined into a joint significance.

## 7. Scientific limitations (stated, not hidden)

1. **J2016.0 reference epoch** — SPHEREx epochs (2025–2026) differ by ~10 yr;
   high proper-motion stars move many arcseconds (the engine's margin improves
   recall but cannot guarantee completeness for the fastest movers).
2. **Gaia is optical** — a missing Gaia match never invalidates a SPHEREx
   detection.
3. **Coordinate match ≠ physical association**; chance alignments dominate in
   dense fields and large radii.
4. **RUWE** is preserved as a quality indicator with an explanatory note
   (`ruwe_note`); values ≫ 1.4 suggest the single-star model is inadequate
   (binary motion, extension, excess noise). It is never a rejection criterion.
5. **No distance from parallax** — `1/ϖ` is biased for uncertain parallaxes;
   parallax and its error are reported, distance is never derived.
6. **Missing values are real** — nulls preserved; propagation skipped for them.
7. **Parallax zero points** (`gaiadr3.zeropoint`, ~ −0.02 mas systematics) are
   not applied.
8. Separation-based matching ignores the combined positional-uncertainty
   ellipse; `uncertainty_arcsec` is accepted on targets but not yet folded into
   a significance test (future work).

## 8. API endpoints

Prefix `/api/v1`. Errors use the standard `PlanetXError` envelope
(`{"success": false, "error": {"code", "message", "details"}}`).

### `GET /api/v1/catalogs/gaia/search`

| Query param | Range | Default |
|---|---|---|
| `ra` | [0, 360) | required |
| `dec` | [−90, 90] | required |
| `radius_arcsec` | (0, 60] | 10 |
| `magnitude_limit` | [−10, 30] | none |
| `limit` | [1, 1000] | 1000 |

```bash
curl "http://localhost:8000/api/v1/catalogs/gaia/search?ra=156.09328159&dec=-41.64466331&radius_arcsec=10&limit=5"
```

```json
{
  "success": true,
  "catalog": "Gaia DR3",
  "query": {"ra": 156.09328159, "dec": -41.64466331, "radius_arcsec": 10.0,
            "magnitude_limit": null, "limit": 5, "total_found": 1, "truncated": false},
  "sources": [{
    "catalog": "Gaia DR3",
    "source_id": "5416565780217346432",
    "coordinates": {"ra": 156.09786, "dec": -41.64594, "reference_epoch": 2016.0,
                    "ra_error_mas": 0.065, "dec_error_mas": 0.08},
    "astrometry": {"parallax_mas": 0.362, "parallax_error_mas": 0.116,
                   "pmra_mas_yr": -8.867, "pmdec_mas_yr": 5.384,
                   "pmra_error_mas_yr": 0.079, "pmdec_error_mas_yr": 0.099,
                   "ruwe": 1.039, "ruwe_note": "Renormalised unit weight error; …"},
    "photometry": {"g": 17.94, "bp": 18.41, "rp": 17.32},
    "provenance": {"catalog": "Gaia DR3", "retrieved_at": "2026-11-15T00:00:00+00:00",
                   "query_reference": "…", "tap_endpoint": "https://gea.esac.esa.int/tap-server/tap/sync"}
  }],
  "separations_arcsec": [13.148498]
}
```

(`sources` values above are illustrative shapes; the live smoke test against the
real Archive returned exactly this structure with real values.)

### `POST /api/v1/catalogs/gaia/crossmatch`

```bash
curl -X POST http://localhost:8000/api/v1/catalogs/gaia/crossmatch \
  -H "Content-Type: application/json" -d '{
    "coordinates": [
      {"external_id": "target-001", "ra": 180.123, "dec": 45.678, "epoch": 2020.5}
    ],
    "config": {"radius_arcsec": 3.0, "propagate_proper_motion": true}
  }'
```

```json
{
  "success": true,
  "catalog": "Gaia DR3",
  "config": {"radius_arcsec": 3.0, "ambiguous_when_more_than": 1,
             "propagate_proper_motion": true, "propagation_margin_arcsec": 5.0},
  "results": [{
    "external_id": "target-001",
    "status": "MATCHED",
    "candidates": [{"separation_arcsec": 0.5, "separation_propagated_arcsec": 0.5,
                    "source": {"…": "…"}}],
    "best": {"separation_arcsec": 0.5, "separation_propagated_arcsec": 0.5,
             "source": {"…": "…"}},
    "ambiguity_note": null,
    "epoch": {"requested_epoch": 2020.5, "gaia_reference_epoch": 2016.0,
              "propagated": true, "propagated_ra": 180.123, "propagated_dec": 45.678,
              "limitation": null}
  }],
  "matched": 1, "ambiguous": 0, "unmatched": 0
}
```

Errors: request validation → 422; `radius_arcsec` out of configured range → 400
(`INVALID_RADIUS`); coordinates rejected → 400 (`INVALID_COORDINATES`).

### `GET /api/v1/catalogs/gaia/{source_id}`

```bash
curl http://localhost:8000/api/v1/catalogs/gaia/5416565780217346432
```

Returns `{"success": true, "source": {...}}`; unknown but well-formed ids → 404
(`GAIA_SOURCE_NOT_FOUND`); malformed ids → 400 (`INVALID_GAIA_SOURCE_ID`).

### `GET /api/v1/sources/{source_id}/catalogs` — **Source association**

Gaia DR3 counterpart candidates for one **persisted Phase 3 source**.
Implemented after the Phase 3 merge against the real source catalogue
(`SourceCatalogService`); no second source database was invented and no
persistent association store was added — the endpoint computes on demand and the
underlying Gaia cone queries are cached in `CacheStore.gaia` as usual.

- `source_id` is the **internal 32-hex Planet X identifier**
  (`^[0-9a-f]{32}$`). It is reported as `planetx_source_id`; every Gaia
  identifier in the response is `gaia_source_id` / the nested Gaia
  `source_id`. The two namespaces are never interchangeable — a Gaia-style
  numeric id fails the internal-id validation → 404 `SOURCE_NOT_FOUND`.
- Coordinates come from the Phase 3 record
  (`reference_ra_deg`/`reference_dec_deg`, mean ICRS positions). Candidate
  evaluation reuses `CatalogCrossMatcher` unchanged: spherical separation,
  configurable radius, `MATCHED`/`AMBIGUOUS`/`UNMATCHED`, ambiguity never
  forced, optional proper-motion propagation.
- **Observation epoch** (`observation_epoch`): derived as the mean of the
  source's detection timestamps (`time_mjd` → Julian year, capped at 200
  samples), reported with its explicit `basis` string. When the record has no
  timestamps the field is `null` with a `limitation`, and the Gaia catalogue
  position (J2016.0) is used unpropagated — never implied to be epoch-aligned.
- **Significance** (`significance`): scalar positional-uncertainty statistic.
  Both inputs are *radial-RMS* uncertainties — Phase 3's
  `position_scatter_arcsec` is the RMS great-circle offset of the detections
  from the reference position, and Gaia's per-axis `ra_error`/`dec_error`
  combine to the radial RMS `hypot(ra_error, dec_error)` — while the Rayleigh
  tail is defined on the *per-axis* sigma. The combined per-axis (isotropic
  equivalent) sigma is therefore
  `sigma_comb = hypot(phase3_scatter, sigma_gaia) / √2`, and
  `match_p_value = exp(-d²/(2·sigma_comb²))` is the Rayleigh tail for a 2-D
  Gaussian offset with independent per-axis errors. Assumptions are returned on
  the response; when only one uncertainty source exists the combined sigma is
  that single value (also /√2) and the assumption is stated. When the data
  needed are missing the statistic is `null` with a `limitation` — **nothing is
  fabricated**. It is not a probability of physical association. RUWE is never
  used as positional uncertainty or as a rejection rule.
- `phase3` echoes the source context (epoch/detection counts, bands, scatter,
  flags, association method); `propagation` is the cross-match epoch info.
- Errors: 404 `SOURCE_NOT_FOUND` (unknown/malformed internal id), 503
  `GAIA_UNAVAILABLE` etc. via the standard envelope — an archive failure is
  never an empty success.

`POST /api/v1/sources/{source_id}/catalogs/gaia/match` remains **deferred**:
associations are computed on demand and Phase 3 pipeline re-runs rebuild source
records, so a separate persistent association store would be inconsistent today.

### Spectrum boundary (Phase 4)

Spectra linked to the same internal id are retrievable via the existing
`GET /sources/{id}/spectra`; no spectrum-scoped Gaia endpoint was added because
Gaia G/BP/RP magnitudes cannot be combined with SPHEREx DR1
surface-brightness channels (different measurement kinds) and DR1 spectral
uncertainty stays `NOT_VERIFIED`. The association response documents this
boundary; nothing mixes Gaia photometry with spectral flux arrays.

## 9. Caching

- `CacheStore.gaia` TTL cache (same TTL/max-entries settings as the rest of the
  backend; no new dependency).
- Cone-search key: `(catalog, ra, dec, radius, magnitude_limit, limit)` with
  coordinates rounded; single-source key: `(source_id)`. Only successful
  responses are cached; failures never enter the cache.
- Failed responses are not distinguishable from cache misses — they simply
  aren't stored.

## 10. Error handling

| Exception | HTTP | Trigger |
|---|---|---|
| `GaiaTimeoutError` | 504 | TAP request timeout |
| `GaiaUnavailableError` | 503 | connection failure |
| `GaiaRateLimitError` | 503 | Archive 429 |
| `GaiaHttpError` | 502 | other HTTP errors |
| `GaiaQueryError` | 502 | ADQL rejected (parse error) |
| `GaiaResponseError` | 502 | unparseable/shapeless response |
| `GaiaSourceNotFoundError` | 404 | no record for a valid id |
| `InvalidGaiaSourceIdError` | 400 | malformed source_id |

The `GaiaClient` session retries transient 500/502/503/504 (2 attempts,
`Retry-After` respected) — queries are read-only server-side, so POST retrying
is safe. Timeouts use the shared `connect_timeout`/`request_timeout` settings.

## 11. Configuration (env-prefixed `GAIA_`, in `app/core/config.py`)

| Setting | Default |
|---|---|
| `gaia_tap_endpoint` | `https://gea.esac.esa.int/tap-server/tap/sync` |
| `gaia_catalog` | `gaiadr3.gaia_source` |
| `gaia_user_agent` | `PlanetX-GaiaDR3/1.0 (ESA Gaia TAP client)` |
| `gaia_max_search_radius_arcsec` | 60.0 |
| `gaia_default_search_radius_arcsec` | 10.0 |
| `gaia_max_results` | 1000 |
| `gaia_max_crossmatch_coordinates` | 1000 |
| `gaia_max_cache_radius_arcsec` | 30.0 (reserved for cache-policy tuning) |

## 12. Testing

`backend/tests/`:

- `test_gaia_client.py` (14) — TAP parsing by column name, empty success, all
  error mappings (400-VOTable → `GaiaQueryError`, 429, timeout, connection,
  non-JSON, wrong shape), ADQL builders (arcsec→deg, magnitude cut,
  no-injection surface, exact-id equality).
- `test_gaia_service.py` (18) — normalization/null preservation, spherical vs
  Euclidean separation, caching behaviour, truncation, empty success,
  coordinate/radius/magnitude validation, limit clamping, get_source
  (cache/404/invalid ids), polar geometry.
- `test_gaia_crossmatch.py` (16) — separation vs Astropy (wraparound/pole),
  unique/no-match/outside-radius/ambiguous/configurable-ambiguity/exact match,
  propagation vs Astropy space motion, disabled propagation, missing PM, same
  epoch, no epoch, epoch-shifted fast mover matched via propagation.
- `test_gaia_api.py` (12) — all three endpoints via dependency overrides:
  success/invalid/empty/unavailable cone search, crossmatch
  success/ambiguous/invalid bodies, source detail 200/404/400, dependency wiring.
- `test_gaia_source_association.py` (14) — Phase 3 source-level association:
  unique match with the two id namespaces kept distinct, significance with
  both/missing uncertainties, unmatched-not-forced, ambiguity preserving all
  candidates, observation-epoch derivation (MJD → Julian year) and its
  no-timestamp limitation, propagation via the derived epoch, unknown/Gaia-style
  internal ids, cone-cache reuse, API 200/404/503, Phase 4 spectra listing
  intact alongside association.

Every Gaia Archive interaction is mocked; the default suite never touches the
network (the same guarantee as the IRSA tests; live checks are `RUN_LIVE=1`
opt-in and Gaia has none — the live verification was performed once during
P5.0 and recorded in the research doc). Full suite on the merged Phase 3/4
base: **388 passed, 7 skipped** (7 skips are opt-in live IRSA tests).

## 13. Future work

- Async UWS path for large bulk retrievals (verified endpoint, not needed yet).
- Persistent cross-catalog association storage (and a
  `POST /sources/{id}/catalogs/gaia/match` endpoint) if source records stop
  being rebuilt by pipeline re-runs.
- Parallax zero-point application (`gaiadr3.zeropoint`) if distance-sensitive
  features ever arrive (still without naive `1/ϖ`).
