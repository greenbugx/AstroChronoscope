# Gaia DR3 Integration Research (Phase 5)

Investigation performed 2026-11-15 against the **live ESA Gaia Archive**. Every
statement marked *verified* was confirmed with a real request; nothing here is taken
from an outdated tutorial without re-checking.

## 1. Access mechanism

| Item | Fact | Verified |
|---|---|---|
| TAP sync endpoint | `https://gea.esac.esa.int/tap-server/tap/sync` | yes |
| TAP async (UWS) endpoint | `https://gea.esac.esa.int/tap-server/tap/async` | yes |
| Authentication | **Not required** for public tables (anonymous jobs work; async job owner shows `anonymous`) | yes |
| Request method | POST, form-urlencoded | yes |
| Required parameters | `REQUEST=doQuery`, `LANG=ADQL`, `QUERY=...` | yes |
| Output format | `FORMAT=json` (or `csv`, `votable`); JSON is `{"metadata": [...], "data": [[...]]}` | yes |
| Metadata service | `TAP_SCHEMA` tables are queryable like any table (`TAP_SCHEMA.columns`, `TAP_SCHEMA.schemas`) | yes |
| Schemas present | `gaiadr3`, `gaiadr2`, `gaiadr1` (+ auxiliary) | yes |

The TAP endpoint is the programmatic interface documented by ESA
("programmatic access" → TAP+). The interactive "Advanced (ADQL)" search page in the
Archive GUI submits to the same service.

## 2. Query interface behaviour

- **Sync queries** are appropriate for bounded result sets (cone searches with `TOP`).
  Return: `HTTP 200`, JSON body `{"metadata": [{"name", "datatype", "unit", ...}],
  "data": [[v, ...], ...]}`.
- **Async queries** follow the IVOA UWS pattern: `POST /tap/async` creates a job
  (`Location` header), `GET /tap/async/{id}` polls phase, `GET /tap/async/{id}/results/result`
  retrieves the result. Verified for job creation and status retrieval.
- **Errors** (even when `FORMAT=json` was requested) come back as a **VOTable** with
  `HTTP 400` and `<INFO name="QUERY_STATUS" value="ERROR">…message…</INFO>`.
  Verified: `SELECT TOP 1 FROM bogus_table` → `HTTP 400`, parse-error text.
- **Column datatypes** are in `metadata`: `source_id` is `long`, positions are `double`.
  Nulls arrive as JSON `null` in `data`.

## 3. Relevant catalog tables and fields

Main table: **`gaiadr3.gaia_source`** (2-column narrowing verified via `TAP_SCHEMA`).

| Column | Unit | Datatype | Notes |
|---|---|---|---|
| `source_id` | — | long | unique per release, fits in int64 (as seen: 5.4e18) |
| `ra`, `dec` | deg | double | barycentric ICRS at `ref_epoch` |
| `ra_error`, `dec_error` | mas | double | standard errors of the *fitted* celestial quantities |
| `parallax`, `parallax_error` | mas | double | zero points (e.g. from `zeropoint` table) are **not** applied here |
| `pmra`, `pmdec` | mas.yr⁻¹ | double | `pmra` includes cos(dec) |
| `pmra_error`, `pmdec_error` | mas.yr⁻¹ | double | |
| `pm` | mas.yr⁻¹ | double | total proper motion |
| `phot_g_mean_mag`, `phot_bp_mean_mag`, `phot_rp_mean_mag` | mag | double | mean integrated magnitudes |
| `phot_g_mean_flux_over_error` | — | double | also available |
| `ruwe` | — | double | renormalised unit weight error (quality indicator) |
| `ref_epoch` | yr | double | **2016.0** (J2016.0), verified in returned rows |
| `phot_variable_flag`, `random_index` | — | char/int | available |

All 16 columns the client selects (`source_id … ruwe`) were confirmed present with the
units above.

## 4. Query and pagination limitations

- Cone searches must use the ADQL geo functions (no separate "cone service" endpoint).
- `TOP n` bounds result size; for bounded workloads (catalog search ≤ 1000 rows, e.g.)
  sync queries are adequate.
- Larger bulk retrievals should use the async UWS endpoint; not needed for this module's
  bounded queries and therefore **not implemented** (documented as future work).
- There is no token-based pagination on sync queries; pages are done by repeating the
  query with a larger `TOP`/row filter if ever needed.

## 5. Expected response format (verified)

```json
{
  "metadata": [
    {"name": "source_id", "datatype": "long", "unit": null, "description": "..."},
    {"name": "ra", "datatype": "double", "unit": "deg", "description": "Right ascension"}
  ],
  "data": [[5416565470978459648, 156.09485718987077, -41.66313139228254, ...], ...]
}
```

Ordering of `data` rows matches `metadata`; parsing maps names → indices.

## 6. Timeout and availability

The Archive is a shared ESA service; cone queries against `gaia_source` (≈1.8 × 10⁹
rows) with a `CONTAINS` predicate took seconds (verified: < 10 s for the queries in
this investigation). Intermittent `502/503` and slow responses are realistic, so the
client uses retries (idempotent GET-style POST) with bounded timeouts, and the API maps
failures to `503`/`502`/`504` with actionable messages — the same envelope as IRSA.

## 7. Recommended query strategy (verified)

Use one column-bounded, row-bounded ADQL query per cone:

```sql
SELECT TOP <limit>
  source_id, ra, dec, ra_error, dec_error,
  parallax, parallax_error, pmra, pmdec, pmra_error, pmdec_error,
  phot_g_mean_mag, phot_bp_mean_mag, phot_rp_mean_mag, ruwe, ref_epoch
FROM gaiadr3.gaia_source
WHERE 1 = CONTAINS(
         POINT('ICRS', ra, dec),
         CIRCLE('ICRS', <ra>, <dec>, <radius_deg>)
       )
  [AND phot_g_mean_mag <= <mag>]
ORDER BY sep ASC
```

with `DISTANCE(POINT('ICRS', ra, dec), POINT('ICRS', ra0, dec0)) AS sep` selected (or a
second identical expression) to get the on-server angular separation. Verified:

- `1=CONTAINS(POINT, CIRCLE)` returns only sources inside the circle (radius in
  **degrees**; an empty result is a valid success, e.g. a 3.6″ cone in an empty field).
- `DISTANCE(POINT, POINT)` returns degrees; `ORDER BY sep ASC` works.
- Radius is degrees — the API converts `radius_arcsec / 3600` and must round-trip
  correctly near the poles (handled by the ADQL library server-side; client-side
  validation only checks ranges).

Server-side separation (`DISTANCE`) is the primary value; the client recomputes
separations with Astropy for cross-matching so that epoch-propagated positions (which
the Archive does not propagate) use the correct pair.

## 8. Scientific limitations

1. **Reference epoch.** DR3 positions are at `ref_epoch = 2016.0`. SPHEREx epochs
   (2025–2026) differ by ~10 yr; high proper-motion stars can move far more than the
   matching radius. Cross-matching must propagate positions or report that it did not.
2. **Gaia is optical.** Objects invisible in optical (e.g. embedded IR sources, cool
   brown dwarfs) have **no** Gaia counterpart; an empty match is *not* evidence that a
   SPHEREx detection is wrong.
3. **A coordinate match is not a physical association.** Chance alignments dominate at
   large radii and dense fields; the response labels matches as coordinate matches only.
4. **RUWE** is a fit-quality indicator for the 5-parameter astrometric solution
   (`ruwe > ~1.4` suggests the single-star model is inadequate — binary motion, noise,
   or extension). It is **not** a universal validity criterion and does not reject a
   source.
5. **Parallax → distance** (`1/ϖ`) is biased for uncertain parallaxes (Luri et al. 2018);
   this module reports parallax and its error and never derives a distance.
6. **Missing values are real.** Two-parameter solutions (e.g. many faint sources) have
   null parallax/PM; they remain `null` in the API and epoch propagation is skipped for
   them.
7. **Zero points** (`gaiadr3.zeropoint`) are not applied; parallax zero-point systematics
   (~ −0.02 mas) are not corrected.
8. **`pmra` includes cos(dec)** — it must be handled as `μα*` when propagating positions.
