# Phase 5 — Final Scientific & Integration Audit

Branch `backend/phase-5-gaia-integration`; audited at HEAD `48e5fde`, audit
changes committed as `0462bf1` and `98c033b`. Scope: the source-level Gaia
association added on the merged Phase 3/4 base (merge `5d6d81f`) plus its
interaction with the pre-existing Phase 5 Gaia engine (`ce25437`). The
pre-existing engine (TAP client, cone search, crossmatcher) was reviewed but
not rewritten.

## Executive summary

The integration is architecturally sound: association reuses the real Phase 3
`SourceCatalogService` persistence and the existing `CatalogCrossMatcher`
unchanged; the two identifier namespaces are kept distinct everywhere; Phase 4
spectroscopy is byte-identical to upstream; the API contract is additive.

One **demonstrable scientific defect** was found and fixed: the match
significance fed *radial-RMS* uncertainties (Phase 3's `position_scatter_arcsec`
and the Gaia `hypot(ra_error, dec_error)` term) into the Rayleigh tail
`exp(−d²/(2σ²))` as if they were *per-axis* sigmas. Since a 2-D Gaussian's
radial RMS is √2 × its per-axis sigma, the exponent was halved and
`match_p_value` equalled √(true p) — significance systematically understated
(a conservative but wrong statistic). Fixed by converting the radial-RMS
inputs to the isotropic per-axis equivalent (`/√2`), stated on the response
assumptions, pinned by a new closed-form test.

Two smaller report defects were fixed: the significance `limitation` string
claimed "No candidate inside the match radius" for AMBIGUOUS results (candidates
exist; there is no unique best), and the 200-timestamp epoch-sampling cap had
no test.

After fixes: **392 passed, 7 skipped** (7 skips = opt-in live IRSA tests),
`compileall` and `pyflakes` clean, frontend untouched. No live archive calls
were made (none permitted without explicit permission; the deterministic suite
never touches the network).

Final recommendation: **READY TO PUSH** (local push only if the maintainer
authorizes it — nothing was pushed by this audit).

## 1. Scientific methodology review

### 1.1 Positional uncertainty inputs (units verified)

- Gaia `ra_error`/`dec_error`: per-axis 1σ standard errors in **mas**, converted
  with `/1000` to arcsec. Verified against `app/schemas/gaia.py` field
  documentation ("position and parallax errors: milliarcseconds") and the live
  verification recorded in `GAIA_INTEGRATION_RESEARCH.md`.
- Phase 3 `position_scatter_arcsec`: RMS of great-circle separations of each
  detection from the reference position (`app/services/source_association.py`
  lines 319–325) — a **radial RMS**, not a per-axis sigma and not a covariance.
- Original defect (High, fixed): `hypot(σ_ra, σ_dec)` is exactly the radial RMS
  `E[D²]^½` (valid for anisotropic axes too), and the Phase 3 scatter is a
  radial RMS; both were used directly as the per-axis σ of the Rayleigh tail.
  Evidence: `gaia_source_association.py` (pre-fix lines 161, 171, 181).
  Impact: `p_code = exp(−d²/(4σ_axis²)) = √(p_true)`; e.g. d = 2σ_axis →
  0.368 instead of 0.135. Conservative direction (never over-states a match),
  but a materially wrong reported statistic.
- Fix (commit `0462bf1`): `sigma_comb = hypot(radial_inputs) / √2` — the
  isotropic per-axis equivalent. This single correction handles both the
  equal-axis and anisotropic Gaia cases and the single-source fallback.
  New pin test: candidate seeded exactly one combined per-axis sigma away →
  `match_p_value == exp(−0.5)` to 1e-6.

### 1.2 Rayleigh tail assumptions

Valid as a documented approximation: independent per-axis Gaussian errors →
isotropic-equivalent Rayleigh radial offset → `P(D ≥ d) = exp(−d²/(2σ²))`.
Stated on the response (`method`, `assumptions`) and in
`GAIA_INTEGRATION.md` §Source association: it is not a probability of physical
association, carries no covariance terms, and excludes propagated-error growth
(PM error × Δt) and any astrometric-calibration error in the Phase 3 scatter.
These exclusions are conservative; none is hidden.

Residual conservatism (documented, by design, unchanged):

- The Phase 3 reference position is the mean of N detections, so its position
  error is closer to `scatter/√N`; the full scatter is used. Conservative.
- `position_scatter_arcsec` is an empirical multi-epoch scatter, not a formal
  single-epoch error (stated in the response assumptions).

### 1.3 Propagation and epoch derivation

- `pmra` is `μα*` (includes cos δ) and is mapped to Astropy
  `pm_ra_cosdec` — correct (`catalog_crossmatch.py` `epoch_propagation`).
- Propagation remains optional, gated on a real epoch, and reports
  `propagated`, the propagated coordinates, and an explicit `limitation` when
  skipped (no PM, no epoch, ERFA failure). `pmsafe`'s "distance overridden"
  warning suppression is scoped and commented.
- The association derives the observation epoch as the mean detection
  `time_mjd` → Julian year via `astropy Time(...).jyear`, consistent with the
  crossmatcher's `Time(epoch, format="jyear")`. Basis string and sample count
  are reported; when no timestamps exist the epoch is `null` with a
  `limitation` and the Gaia J2016.0 position is used unpropagated (never
  implied epoch-aligned) — covered by tests.
- The mean-epoch approach is defensible for clustered detection times; for
  widely spread epochs the mean may not represent any single observation. The
  `basis` string ("mean of N detection timestamps") makes this explicit.
- 200-timestamp cap: `[-_MAX_EPOCH_SAMPLES:]` keeps the **most recent** 200
  detections (detections are time-sorted), so for >200-detection sources the
  mean epoch is biased toward recent epochs while the reference position uses
  all detections. Low severity (Phase 3 pipeline bounds detections per source;
  the direction of the bias tracks the most recent astrometry, which is what
  propagation should target). Previously untested — now pinned by
  `test_epoch_sampling_cap_takes_the_most_recent_200_timestamps`.

### 1.4 Separation semantics

`CrossMatchCandidate.separation_arcsec` is the separation **actually used for
the match decision** (propagated separation when propagation ran,
catalogue separation otherwise — `catalog_crossmatch.py` `_match_one`). The
significance therefore consumes the same separation that justified the match;
a candidate matched only via propagation does not get a p-value from its huge
unpropagated offset. Newly pinned by
`test_propagated_match_significance_uses_the_propagated_separation`.

### 1.5 Ambiguity

`AMBIGUOUS` when more candidates than `ambiguous_when_more_than` (default 1);
`best` is `null`, all candidates preserved with their separations, ambiguity
note present, and significance explicitly not evaluated for a non-unique
counterpart (wording fixed in `98c033b`). A unique-but-close pair is never
forced into MATCHED, and UNMATCHED is never upgraded. Covered by tests,
including the ambiguity-preserving case.

## 2. Integration review

- **Phase 3**: `associate()` uses the public `SourceCatalogService.source()`
  (`SourceDetailResponse`), the real persisted record path
  (`storage/sources/{id}.json`), and the Phase 3 error contract
  (`SOURCE_NOT_FOUND` for unknown/malformed 32-hex ids, `SOURCE_STORAGE_ERROR`
  for corrupt records). No second source database; no writes to source records.
- **Phase 4**: `git diff upstream/master HEAD -- backend/app/services/spectral_*`
  and `backend/app/schemas/spectra.py` are **empty** — spectroscopy untouched;
  `NOT_VERIFIED` uncertainty semantics preserved; the association response
  documents the Gaia-photometry/SPHEREx-flux boundary.
- **Identifier namespaces**: `planetx_source_id` (32-hex internal) vs
  `gaia_source_id` (stringified Gaia numeric) are distinct fields; the route
  rejects Gaia-style ids via the Phase 3 regex (404 `SOURCE_NOT_FOUND`).
- **No regression**: full suite 392 passed / 7 skipped — all pre-existing
  Phase 1–4 and Gaia tests pass unmodified (only the two significance
  expectations were corrected alongside the math fix, plus new additive tests).

## 3. API contract review

- `GET /api/v1/sources/{source_id}/catalogs` is registered with
  `response_model=SourceGaiaAssociationResponse` and the standard error
  responses; OpenAPI path-set contract test updated additively.
- Validation/errors: malformed or unknown id → 404 `SOURCE_NOT_FOUND`; corrupt
  record → 500 `SOURCE_STORAGE_ERROR` (envelope from the global
  `PlanetXError` handler); Gaia archive failure → 503 `GAIA_UNAVAILABLE` (and
  502/504 mappings) — an archive failure is never an empty success (tested).
- Deferred `POST /api/v1/sources/{source_id}/catalogs/gaia/match`: **not
  registered** in any router, not in OpenAPI, and docs/TODO consistently mark
  it deferred. No implied implementation.
- Cosmetics (not changed): the route's `responses` dict does not enumerate 500
  (global handler still returns the correct envelope); the `ErrorResponse`
  schema covers it.

## 4. Reliability and performance review

- **TAP failure handling**: inherited unchanged from the Phase 5 client —
  timeouts, 429 (`GAIA_RATE_LIMITED`), 5xx, invalid ADQL, malformed responses
  are mapped to typed errors with retries on the shared `requests` session;
  association adds no new network path.
- **Cache**: cone queries cache in `CacheStore.gaia` keyed on
  `(kind, round(ra,9), round(dec,9), round(radius,6), magnitude_limit, limit)`
  with the shared TTL/max-entries — no collision with `cache.sources`
  (Phase 3 records) or Phase 4 namespaces. Associations are computed on demand
  with **no** association-specific cache, so a Phase 3 pipeline re-run that
  rewrites a source record can never serve a stale association; the underlying
  cone result stays correctly cached within TTL. Verified by
  `test_cone_query_is_cached_across_association_calls` (stub memoizes by the
  same key contract as the real service).
- **Repeated association**: second call hits the cone cache (one "archive"
  call total, tested); `catalog.source()` is TTL-cached; no unbounded growth.
- **Bottlenecks**: per-call cost is one cone query + O(candidates) scoring +
  one astropy `Time` conversion — negligible. The one astropy propagation per
  candidate dominates for large candidate sets but is bounded by
  `gaia_max_results` (1000) and the match radius. No memory retention beyond
  the bounded LRU caches.

## 5. Missing test coverage — gaps found and filled

Added (commits `0462bf1`, `98c033b`), all deterministic, no live calls:

1. `test_significance_p_value_matches_the_rayleigh_tail` — closed-form pin of
   the corrected Rayleigh tail (`p = exp(−0.5)` at `d = σ_comb`).
2. `test_significance_falls_back_to_phase3_only_when_one_gaia_error_is_missing`
   — one Gaia error present, one null → Gaia term unusable, phase-3-only
   fallback with the stated assumption (previously only both/none were tested).
3. `test_propagated_match_significance_uses_the_propagated_separation` —
   significance consistency for a propagation-only match.
4. `test_epoch_sampling_cap_takes_the_most_recent_200_timestamps` — cap
   direction and sample count.

Other gaps considered and deliberately not added: RA-wraparound/near-pole
association cases (fully covered at the crossmatcher level, which association
reuses unchanged); per-request `CrossMatchConfig` overriding via query
parameters (the endpoint deliberately exposes no query knobs; the config is
echoed in the response).

## 6. Issues

| # | Severity | Status | Issue | Evidence | Resolution |
|---|----------|--------|-------|----------|------------|
| 1 | **High** | **Fixed** (`0462bf1`) | Radial-RMS uncertainties used as per-axis sigmas in the Rayleigh tail → `match_p_value = √(true p)`, significance understated | `gaia_source_association.py` pre-fix lines 161/171/181; Phase 3 scatter is RMS great-circle offset (`source_association.py:319–325`); Gaia `hypot` of per-axis errors is radial RMS | Divide the combined sigma by √2 (isotropic per-axis equivalent); assumption string updated; pin test added |
| 2 | Low | **Fixed** (`98c033b`) | `significance.limitation` said "No candidate inside the match radius" for AMBIGUOUS results (candidates exist, no unique best) | `_significance` pre-fix best-None branch | Status-aware limitation text; asserted in the ambiguity test |
| 3 | Low | **Fixed** (`98c033b`) | 200-timestamp epoch cap untested | no prior test | New cap test (most-recent-200 direction pinned) |
| 4 | Low | Open, documented | Epoch cap keeps the most recent 200 timestamps → mean epoch biased toward recent epochs for >200-detection sources, while the reference position uses all detections | `gaia_source_association.py:128–132`; detections time-sorted (`source_association.py:341`) | Acceptable direction (recent astrometry is what propagation targets); Phase 3 bounds detections per source. Revisit if unbounded detection counts appear |
| 5 | Low | Open, documented | UNMATCHED association response carries no query provenance (`retrieved_at`, TAP endpoint) — provenance only exists for a matched best candidate | `associate()` provenance field | Cosmetic; config/catalog context is still echoed. Add an association-level provenance block if frontend needs it |
| 6 | Low | Open, documented | Route `responses` dict does not enumerate 500 (`SOURCE_STORAGE_ERROR`) — global handler still returns the correct envelope; only OpenAPI documentation affected | `source_routes.py` `_ERRORS` | Additive OpenAPI polish only; no behaviour gap |
| 7 | Low | Open, documented (by design) | Significance excludes propagated-error growth (σ_PM × Δt) and Phase 3 scatter is not reduced to a standard error of the mean | response `assumptions` | Both are conservative exclusions, stated on every response |

No Critical issues remain. No existing test was weakened, removed or modified
to pass; the only expectation changes were the two significance values corrected
together with the math fix they pinned.

## 7. Changes made

- `app/services/gaia_source_association.py` — √2 radial→per-axis correction in
  `_significance`; status-aware ambiguity limitation. No other logic touched.
- `app/schemas/gaia.py` — `GaiaAssociationSignificance.assumptions` wording.
- `docs/GAIA_INTEGRATION.md`, `docs/PHASE5_POST_PHASE3_PHASE4_INTEGRATION.md`
  — formula corrected and the radial/per-axis distinction documented.
- `tests/test_gaia_source_association.py` — 2 corrected expectations + 4 new
  tests (14 → 18).

## 8. Final validation (post-audit)

- Full suite: **392 passed, 7 skipped** (opt-in live IRSA skips only).
- `compileall app scripts tests`: clean. `pyflakes app scripts tests`: clean.
- Frontend diff vs `upstream/master`: empty.
- No live archive calls performed. No history rewritten; no push.

## FINAL RECOMMENDATION: READY TO PUSH

(Push itself was not performed — it remains gated on explicit maintainer
authorization.)
