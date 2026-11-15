# Phase 5 — Integration Assessment after Phase 3 and Phase 4 Merges

Written after merging upstream `master` (Phase 3 merge `e1b6146`, Phase 4 merge
`ad585cf`) into `backend/phase-5-gaia-integration` (Phase 5 commit `ce25437`,
merge commit on this branch: `5d6d81f`). Every statement below is based on the
**actual merged code**, not on PR summaries.

## 1. State of the existing Gaia implementation (preserved)

- `app/services/gaia_client.py`, `gaia_service.py`, `catalog_crossmatch.py`
- `app/schemas/gaia.py`, `app/api/gaia_routes.py`
- 60 tests (`test_gaia_client/service/crossmatch/api`) — all still passing after
  the merge, unchanged.
- The upstream Phase 1–2 code already contained the scientific fixes from the
  fork's `7d0db7f` (variance propagation, `NOT_VERIFIED` gating, PSF semantics),
  so no Phase 1–2 content was lost in the merge; upstream additionally refactored
  artifact resolution (`artifact_resolver.py`) and added Phase 3/4 modules.

## 2. Phase 3 contracts (as merged)

| Item | Actual contract |
|---|---|
| Source id | 32-char lowercase hex, **internal** association id (`^[0-9a-f]{32}$`), validated in `SourceCatalogService._record`; **never** a catalogue id |
| Persistence | JSON at `storage/sources/{source_id}.json` (+ `storage/lightcurves/`), atomic writes, TTL cache `cache.sources` |
| Coordinates | `AssociatedSource.reference_ra_deg` / `reference_dec_deg` — ICRS degrees (mean reference position) |
| Position uncertainty | `position_scatter_arcsec` — **scalar** measured scatter across epochs (`float \| None`); per-detection `centroid_error_arcsec` exists but is an *approximate statistical centroid error*, not a full astrometric covariance |
| Observation epoch | Not a source-level field; `MatchedDetection.measurement.time_mjd` / `observation_time` per detection and `LightCurvePoint.time_utc`/`time_mjd` per light-curve point |
| Retrieval | `SourceCatalogService.source()` → 404 `SOURCE_NOT_FOUND` (unknown/malformed id), 500 `SOURCE_STORAGE_ERROR` (corrupt record) |
| Association | `angular_nearest_neighbour`, uncertainty-aware radius boost, candidate ranking, ambiguity flags |

## 3. Phase 4 contracts (as merged)

| Item | Actual contract |
|---|---|
| Spectrum id | 32-hex, `Spectrum.spectrum_id` |
| Source link | `Spectrum.source_id: str \| None` (32-hex, may be null) |
| Coordinates | `ra_deg`, `dec_deg` per spectrum |
| Flux | `flux_mjy_sr` per channel, `flux_kind = "surface_brightness"`, `MJy/sr` — **not** integrated source flux |
| Uncertainty | `uncertainty_mjy_sr` always `null`, `quality.uncertainty_status = "NOT_VERIFIED"` (DR1 cube has no variance plane) |
| Quality | per-channel `quality`, blank/invalid channels keep `flux = null` |
| Retrieval | `GET /spectra/{id}`, `GET /sources/{id}/spectra` (summaries) |

## 4. Compatibility findings

1. **Two different `source_id` namespaces.** Gaia's numeric `source_id`
   (stringified TAP `long`) and Planet X's 32-hex internal id must never be
   interchanged. The association layer names them explicitly
   (`planetx_source_id` vs `gaia_source_id`).
2. **Phase 3 id validation already guards the endpoint shape.** A Gaia numeric id
   passed to `GET /sources/{id}/catalogs` fails the 32-hex regex → 404
   `SOURCE_NOT_FOUND`; there is no code path where the two id spaces mix.
3. **Epoch is derivable, not stored.** The mean detection `time_mjd` gives a
   defensible source-level observation epoch for proper-motion propagation; it
   must be reported with its basis, not presented as a precise epoch.
4. **Uncertainty is scalar-only.** Phase 3 has no covariance matrix and Gaia DR3
   `ra_error`/`dec_error` are scalar standard errors → a combined
   scalar significance is a documented approximation (see §6).
5. **Cache namespaces do not collide.** Phase 3 uses `cache.sources`,
   `cache.variability`; Phase 4 uses `cache.spectra` (see `SpectralService`);
   Phase 5 uses `cache.gaia`. Source associations are computed on demand and not
   cached as new entries (the underlying Gaia cone queries are already cached in
   `cache.gaia`), so no stale-association risk when a pipeline re-run rewrites a
   source record.
6. **Gaia photometry is never a spectrum.** G/BP/RP magnitudes stay in the Gaia
   schema; no conversion to or combination with `flux_mjy_sr` is attempted.
   Spectral `NOT_VERIFIED` uncertainty is untouched.

## 5. Gaps found and planned changes

| Gap | Change |
|---|---|
| `GET /api/v1/sources/{source_id}/catalogs` did not exist (deferred in the original Phase 5 because Phase 3 was absent) | Implemented against the real `SourceCatalogService` + `CatalogCrossMatcher` |
| No source-level Gaia association response distinguishing both id spaces | New `SourceGaiaAssociationResponse` schema |
| No positional-uncertainty-aware match statistic | New `GaiaAssociationSignificance` (scalar approximation, explicit assumptions) |
| No observation epoch for a persisted source | Derived from detection `time_mjd` mean, reported with basis and limitations |

## 6. Uncertainty-aware match evaluation (P5.5) — method and assumptions

Given Phase 3's scalar `position_scatter_arcsec` (a **radial RMS** — the RMS
great-circle offset of detections from the reference position) and Gaia's
per-axis `ra_error`, `dec_error` (mas; their quadrature sum is likewise the
radial RMS `hypot(ra_error, dec_error)`):

```
sigma_gaia_radial = hypot(ra_error, dec_error) / 1000        [arcsec]
sigma_comb        = hypot(scatter, sigma_gaia_radial) / √2   [arcsec]
normalized_separation = separation / sigma_comb
match_p_value     = exp(-separation² / (2 · sigma_comb²))
```

The `√2` converts the radial-RMS inputs to the isotropic **per-axis** sigma the
Rayleigh tail `exp(-d²/(2σ²))` is defined on (for a 2-D Gaussian, radial RMS =
per-axis σ·√2); without it the exponent is halved and the p-value is biased
high (significance understated).

Assumptions, stated on the response (`method`, `assumptions`):

- Per-axis independent Gaussian errors; the 2-D positional offset then follows a
  Rayleigh distribution, giving the closed-form `match_p_value` (probability of
  seeing a separation ≥ the observed one if the candidate were the true
  counterpart at zero offset). It is **not** a probability of physical
  association and not a classification.
- No covariance terms, no proper-motion-propagated error growth, no
  astrometric-calibration error in σ_px. `position_scatter_arcsec` is an
  empirical multi-epoch scatter, not a formal single-epoch error.
- When either uncertainty is missing the statistic is `null` and a limitation
  string explains why. Nothing is fabricated.
- RUWE is carried through as a quality indicator only.

## 7. Spectrum integration decision

`GET /api/v1/sources/{source_id}/catalogs` returns the Gaia association for the
source; spectra linked to the same internal id are already retrievable via the
existing `GET /sources/{id}/spectra`. A dedicated spectrum-scoped Gaia endpoint
would duplicate that link without adding measurement content (Gaia magnitudes
cannot be combined with DR1 surface-brightness channels), so it is **not**
implemented. The association response documents this boundary.
