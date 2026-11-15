# Planet X — SPHEREx Backend TODO

Single source of truth for backend progress. Updated at the end of each phase.

## A. Repository Analysis

- [x] Inspect the complete repository structure (empty at start — no repo code existed).
- [x] Identify the existing backend framework and entry point (none; FastAPI chosen and installed).
- [x] Identify existing API routes and services (none).
- [x] Inspect existing dependencies and configuration (Python 3.14, FastAPI, Astropy installed during Phase 1).
- [-] Locate existing SPHEREx research code and notebooks (none present in repository).
- [-] Identify reusable implementations (none present; Kaggle result used only as reference test case).
- [x] Document the current architecture (see README.md).
- [x] Finalize the implementation plan (minimal FastAPI + services layout).

## B. IRSA Integration

- [x] Configure IRSA SIA2 endpoint.
- [x] Implement reusable HTTP client.
- [x] Implement coordinate validation.
- [x] Implement SPHEREx collection selection.
- [x] Implement SIA2 observation search.
- [x] Parse VOTable responses.
- [x] Extract observation metadata.
- [x] Extract valid FITS access URLs.
- [x] Handle zero-result responses.
- [x] Handle network errors and timeouts.
- [x] Verify integration using the previously validated coordinates (live: 126 rows, 2026-11-14).

## C. Observation Management

- [x] Define observation metadata schema.
- [x] Extract observation identifiers (obs_publisher_did is unique per SIA row).
- [x] Extract observation dates where available (t_min/t_max MJD → ISO UTC).
- [x] Extract collection and product information.
- [x] Implement observation selection (per-product records, 126 rows).
- [x] Implement observation detail retrieval (SIA ID query + cache).
- [x] Preserve observation-to-FITS product associations.
- [x] Support date filtering where supported by IRSA (SIA TIME, MJD).

## D. FITS Retrieval & Cutout Processing

- [x] Implement FITS product selection.
- [x] Validate external FITS URLs.
- [x] Implement streamed FITS downloads.
- [x] Implement IRSA spatial cutout requests (IBE `?center=&size=`).
- [x] Validate downloaded FITS files.
- [x] Handle corrupted and incomplete downloads.
- [x] Implement safe local storage (hash-named files).
- [x] Inspect FITS HDU structures.
- [x] Identify science IMAGE extensions (by EXTNAME, not index).
- [x] Extract science pixel data.
- [x] Extract FLAGS and VARIANCE where available.
- [x] Preserve FITS headers and metadata.
- [x] Handle missing extensions gracefully.

## E. Astronomical Processing

- [x] Implement celestial WCS extraction.
- [x] Implement RA/Dec to pixel coordinate conversion.
- [x] Validate whether the target lies inside the cutout.
- [x] Extract image dimensions and units.
- [x] Handle invalid and NaN pixels.
- [x] Implement image normalization.
- [x] Generate PNG previews.
- [x] Validate generated previews against the original FITS data.

## F. Backend API Development

- [x] Implement observation search endpoint.
- [x] Implement observation detail endpoint.
- [x] Implement cutout retrieval endpoint.
- [x] Implement preview generation endpoint or workflow.
- [x] Implement secure FITS and PNG file-serving endpoints.
- [x] Define request validation schemas.
- [x] Define response schemas.
- [x] Implement standardized error responses.
- [x] Add API documentation.
- [x] Verify frontend/backend API contracts.

## G. Reliability & Performance

- [x] Add structured logging.
- [x] Add request timeouts.
- [x] Add download size limits.
- [x] Add safe temporary file handling.
- [x] Ensure FITS resources are closed correctly.
- [x] Implement basic caching (SIA search + row cache, disk cutout cache).
- [x] Implement safe cache invalidation.
- [x] Handle concurrent requests (per-key locks, thread-safe cache).
- [x] Prevent path traversal (name allowlist).
- [x] Validate external URL hosts.
- [x] Review memory consumption (streaming, memmap, size caps).

## H. Testing

- [x] Unit-test coordinate validation.
- [x] Unit-test SIA2 response parsing.
- [x] Unit-test empty search results.
- [x] Unit-test FITS URL selection.
- [x] Unit-test download validation.
- [x] Unit-test FITS extension identification.
- [x] Unit-test science image extraction.
- [x] Unit-test WCS transformations.
- [x] Unit-test preview generation.
- [x] Unit-test API endpoints.
- [x] Unit-test error handling.
- [x] Run live IRSA integration test.
- [x] Reproduce the previously validated SPHEREx retrieval.
- [x] Verify generated FITS and PNG outputs.

## I. Documentation & Frontend Handoff

- [x] Document backend architecture.
- [x] Document installation and setup.
- [x] Document environment variables.
- [x] Document API endpoints.
- [x] Add curl examples.
- [x] Add Python requests examples.
- [x] Document request and response schemas.
- [x] Document error responses.
- [x] Provide frontend integration instructions.
- [x] Document known limitations.
- [x] Document remaining work.

## J. Final Verification

- [x] Genuine SPHEREx observations can be discovered.
- [x] Actual FITS products can be retrieved.
- [x] Spatial cutouts can be generated.
- [x] Science IMAGE extensions can be extracted.
- [x] PNG previews can be generated.
- [x] Celestial WCS validation works.
- [x] API responses are frontend-consumable.
- [x] Automated tests pass.
- [x] Live integration test passes when IRSA is available.
- [x] Documentation is complete.

## K. Frontend Integration Preparation

- [x] Audit routes, schemas, configuration and tests for the frontend contract.
- [x] Make CORS origins configurable; add Vite (`localhost:5173`) defaults.
- [x] Reject `CORS_ORIGINS=["*"]` at startup (unrestricted CORS is not allowed).
- [x] Expose `X-Observation-Count` via CORS `expose_headers`.
- [x] Verify file URLs are API-relative and served with CORS headers.
- [x] Verify strict JSON (no NaN/Infinity), error envelopes and status codes.
- [x] Add deterministic integration contract tests (`tests/test_integration_contract.py`).
- [x] Add opt-in live API workflow test (`tests/test_live_api_workflow.py`).
- [x] Write `docs/FRONTEND_INTEGRATION.md` (base URL, endpoints, schemas, IDs, files, errors, CORS).
- [x] Add curl and Python examples to README and the integration guide.
- [x] Update `.env.example` with CORS examples and the wildcard prohibition.
- [x] Add `GET /` compatibility endpoint returning `{ "message": string }` for AstroChronoscope.
- [x] Verify Vite's dev origin `http://localhost:5173` is CORS-allowed.
- [x] Document the frontend `VITE_API_URL` setting and the connectivity-only scope of the current UI.
- [ ] Frontend consumes the contract and implements search/detail/cutout UI.
- [ ] Set production `CORS_ORIGINS` explicitly at deployment (never `*`).
- [ ] Add authentication/rate limiting before public exposure (out of scope for this task).

## L. Phase 1 — Multi-Epoch Observation Discovery

- [x] Inspect SIA2 metadata: identity, timestamps, bands, footprints, duplicate structure.
- [x] Confirm 126 product rows = 63 unique `obs_id`; sibling bands share `t_min`/`t_max`.
- [x] Confirm FITS `MJD-BEG`/`MJD-END` match SIA2 `t_min`/`t_max` and `MJD-AVG` equals the midpoint (`TIMESYS=UTC`).
- [x] Add normalized timeline schemas (`app/schemas/timeline.py`).
- [x] Add `TimelineService` (`app/services/timeline_service.py`): normalization, dedupe, `obs_id` grouping, sorting, quality/warnings.
- [x] Reuse `ObservationService.search_rows` (validated, cached SIA2 rows) instead of duplicating discovery logic.
- [x] Add per-query timeline cache keyed by `(ra, dec, radius, collection, bands, start_date, end_date)`.
- [x] Add `GET /api/v1/targets/timeline` with coordinate/radius/date/band validation.
- [x] Compute `target_covered` from SIA2 `s_region` (`POLYGON`/`CIRCLE`), not the search cone.
- [x] Preserve missing values as `null`; emit per-product/epoch warnings and aggregate counts.
- [x] Separate discovery, timeline eligibility and comparability (`comparability_assessed=false`).
- [x] Add deterministic tests (`tests/test_timeline_service.py`, `tests/test_timeline_api.py`).
- [x] Add opt-in live invariants test (`tests/test_live_timeline.py`).
- [x] Update README, frontend integration guide and TODO.
- [x] Phase 3: photometry / light curves implemented; see section N.
- [ ] Optional: persist timeline caches or add a target/epoch database if query volume grows.

## M. Phase 2 — FITS Inspection & Multi-Epoch Image Comparison

- [x] Audit the Phase 1 architecture and reuse IRSA client, cutout cache, error envelope and schemas.
- [x] Add inspection/comparison schemas (`app/schemas/image_processing.py`).
- [x] Implement FITS inspection (`app/services/image_inspection.py`): HDUs by EXTNAME, statistics, WCS validation, FLAGS mask bits, VARIANCE unit/range, EPSF FWHM with real oversampling.
- [x] Implement reprojection (`app/services/image_reprojection.py`): reference-grid `CommonGrid`, bilinear/nearest interpolation via `astropy.wcs` + `scipy.ndimage.map_coordinates`, validity-weight propagation (no zero-fill), FFT phase-correlation alignment measurement.
- [x] Implement comparison orchestration (`app/services/image_comparison.py`): prerequisite checks, background, photometric scaling, PSF compatibility/matching, difference + uncertainty + mask FITS, PNG preview, quality, provenance, persistence.
- [x] Add `POST /api/v1/images/inspect`, `POST /api/v1/images/compare`, `GET /api/v1/images/comparisons/{comparison_id}`.
- [x] Add typed errors: `COMPARISON_NOT_FOUND` (404), `IMAGE_PROCESSING_LIMIT` (422), `REPROJECTION_FAILED` (422), `PROCESSING_BUSY` (503).
- [x] Add comparison settings (`COMPARISON_SIZE_DEG`, `MAX_COMPARISON_PIXELS`, `MIN_COMMON_COVERAGE`, `MAX_ALIGNMENT_RESIDUAL_PX`, `PSF_WARN_RATIO`, `PSF_FAIL_RATIO`, `MAX_CONCURRENT_COMPARISONS`) and `storage/comparisons/`.
- [x] Deterministic cache key (SHA-256 of ids/target/size/config) + full response JSON persisted so `GET` survives TTL.
- [x] Bound concurrency with a process-wide semaphore; sync handlers stay in the threadpool.
- [x] Preserve original FITS files; generated products are separately named `sha256("<key>|<kind>")` and served by the existing hash allowlist.
- [x] Deterministic tests on synthetic FITS fixtures (`tests/test_image_inspection.py`, `tests/test_image_reprojection.py`, `tests/test_image_comparison.py`, `tests/test_image_api.py`).
- [x] Opt-in live test (`tests/test_live_image_comparison.py`); never substitutes another survey.
- [x] Update README (4.8–4.10, architecture, errors, examples, limitations 13–20), `docs/FRONTEND_INTEGRATION.md` (5.8–5.10, errors, runbook, troubleshooting), TODO.
- [x] Live validation (2026-11-14): real SPHEREx D3 pair 33 days apart → all 12 checks PASS, 89.2% coverage, 0.03 px residual, difference/uncertainty/mask FITS + PNG served; `RUN_LIVE=1 pytest -q tests/test_live_image_comparison.py` → 2 passed in 46 s.
## N. Phase 3 - Source Detection, Photometry, Association & Light Curves

- [x] Add Phase 3 schemas (`app/schemas/sources.py`, `photometry.py`, `lightcurve.py`) with quality vocabulary, provenance and algorithm version strings.
- [x] Add Phase 3 settings (`DETECTION_*`, `PHOTOMETRY_*`, `MAX_CONCURRENT_DETECTIONS`) and `storage/sources/`, `storage/lightcurves/`.
- [x] Add source/photometry/lightcurve/variability caches and shared artifact resolver (`app/services/artifact_resolver.py`, `app/core/versions.py`).
- [x] Implement image preparation (`app/services/image_preparation.py`): validity mask, variance masking, sigma-clipped background/noise, mesh variation, PSF summary, projection-plane pixel solid angle; invalid pixels never zero-filled.
- [x] Implement source detection (`app/services/source_detection.py`): mask-normalised matched filter, threshold, connected components, nearest-peak deblend, flux-weighted centroids, second-moment shapes, WCS positions, deterministic ids, edge/blend flags, approximate centroid uncertainty.
- [x] Implement aperture photometry (`app/services/photometry.py`): fractional apertures, annulus/global background fallback, variance-aware uncertainty, explicit MJy/sr -> Jy conversion, unsupported-unit handling, no aperture correction, propagated centroid uncertainty.
- [x] Implement cross-epoch association (`app/services/source_association.py`): great-circle nearest neighbour, bounded centroid-uncertainty match radius, ranked candidate audit, ambiguity/duplicate/missing-position flags, deterministic internal source ids and position scatter.
- [x] Implement variability metrics (`app/services/variability.py`): mean/median/weighted mean, std/MAD/robust sigma, F_var, chi2/dof/p-value, range, baseline and gaps; undefined values remain null.
- [x] Implement end-to-end target light curves (`app/services/lightcurve_service.py`): timeline -> one product per epoch (all requested bands) -> detection -> photometry -> association -> per-band series, non-detection counts, below-minimum retention, per-epoch failures and caching.
- [x] Persist source detail, per-band light curves and variability (`app/services/source_catalog.py`): atomic JSON under `storage/sources/` and `storage/lightcurves/`, safe 32-hex id validation, typed 404/500 errors.
- [x] Add `POST /api/v1/sources/detect`, `POST /api/v1/sources/photometry`, `POST /api/v1/targets/lightcurve`, `POST /api/v1/targets/variability`, `GET /api/v1/sources/{id}`, `/lightcurve`, `/variability`, dependency wiring and OpenAPI documentation.
- [x] Add deterministic tests: image preparation, detection, photometry, association uncertainty/candidates, variability, light-curve service, source persistence, unknown-source 404, single-epoch retention and API contract (57 Phase 3 tests).
- [x] Validate deterministic suite twice: `280 passed, 7 skipped`; `pyflakes app tests`, `compileall` and `git diff --check` clean.
- [x] Update README (4.11-4.16, architecture, data flow, config, errors, examples, limitations 24-33), frontend integration guide (5.11-5.16, errors, troubleshooting) and TODO.
- [x] Live Phase 3 validation (2026-11-15): D3 band, two bounded epochs -> detections, photometry, association, per-band metrics and persisted source round-trip; `RUN_LIVE=1 pytest -q tests/test_live_phase3.py` -> `1 passed in 40 s`.
- [ ] PSF/forced photometry, transient-candidate ranking and classification remain future phases.

## O. Phase 4 - Spectral Data Processing

- [x] Investigate genuine IRSA spectral products (`backend/docs/SPECTRAL_PRODUCTS.md`): only the DR1 All-Sky Cube is a full-spectrum product; spectral images expose one `WCS-WAVE` channel.
- [x] Add Phase 4 contracts (`app/schemas/spectra.py`), settings, `storage/spectra/`, cache namespace and algorithm version (`phase4-spectrum-extraction-v1`).
- [x] Implement DR1 cube resolution (`app/services/spectral_resolver.py`): SIA2 cube rows, nearest tile, hash-addressed FITS cache, 400 MB spectral download cap.
- [x] Implement product-specific FITS inspection (`app/services/spectral_inspection.py`): cube/spectral-image detection, HDUs, `SPECTRAL_CHANNELS`, `BLANKCH`, `NHITS`, `FLAGS`, `WCS-WAVE`, target pixel and coverage.
- [x] Fix real QR3 cutout `WCS-WAVE` evaluation by applying `CRPIX1A`/`CRPIX2A` detector offsets; target resolves to 2.007347 um instead of 2.425 um.
- [x] Implement cube extraction (`app/services/spectrum_extraction.py`): bilinear/nearest point sampling, per-channel table, blank/invalid/non-finite handling, `MJy/sr`, no fabricated variance, deterministic 32-hex ids and provenance.
- [x] Implement atomic spectrum persistence and source listing (`app/services/spectrum_catalog.py`).
- [x] Implement spectral comparison (`app/services/spectral_comparison.py`): wavelength matching, `comparison_basis`, grid compatibility, per-channel difference/ratio, explicit static-mosaic/no-uncertainty limitations.
- [x] Add API routes (`POST /api/v1/spectra/extract`, `GET /api/v1/spectra/{id}`, `GET /api/v1/sources/{id}/spectra`, `POST /api/v1/spectra/compare`), dependency wiring, concurrency bound and OpenAPI docs.
- [x] Add deterministic tests: contracts, cube/spectral-image inspection, extraction, persistence, resolver, comparison, API success/error paths and source listing.
- [x] Validate a genuine DR1 cube end to end: 320,909,760 bytes, 102x512x512, target pixel (282.099,229.071), 100 valid channels, blanks 50/51, 0.753-4.988 um, no `VARIANCE`.
- [x] Update README, frontend integration guide, TODO and spectral product report.
- [ ] Multi-epoch spectra are not supported by DR1 (static mosaic); spectral slope/SED fitting and other spectral products remain future work.

## Validation log (2026-11-15, Phase 4 spectral pipeline)

- Deterministic suite: **315 passed, 7 skipped** (the 7 skips are the opt-in live IRSA tests); `compileall` and `pyflakes` clean.
- Real DR1 validation: downloaded `Npix9621_cube.fits` (320,909,760 bytes) through the backend's spectral-size-capped downloader; inspection found `[102,512,512]`, 102 channels, blank channels 50/51, target pixel (282.099,229.071), 13.983 arcsec/px, `MJy/sr`, no `VARIANCE`; extraction returned 100 valid channels over 0.753-4.988 um with `uncertainty_status=NOT_VERIFIED`.
- Real QR3 spectral-image check: target `(28.310,29.069)` maps through cutout offsets to detector `(902.310,960.069)` and `WCS-WAVE` gives 2.007347 um, bandwidth 0.049704 um (matches the earlier detector-coordinate result).
- IRSA SIA returned intermittent `503` during live validation; the direct archive cube URL was reachable and the file was verified locally. This is an archive availability issue, not fabricated data.

## Validation log (2026-11-15, Phase 3 science pipeline)

- `uv run pytest -q` -> **280 passed, 7 skipped** in 56.70 s, repeated -> **280 passed, 7 skipped** in 34.40 s. The 7 skips are the opt-in live IRSA tests.
- Added Phase 3 coverage: persistence survives cache clear, target variability, typed `SOURCE_NOT_FOUND`, single-epoch source retained/retrievable, ranked association candidates, uncertainty-aware match radius and missing-centroid-uncertainty flags.
- `uv run pyflakes app tests` and `uv run python -m compileall -q app tests` -> clean (exit 0). `git diff --check` -> no whitespace errors (CRLF conversion warnings only).
- Live Phase 3 (`RUN_LIVE=1 pytest -q tests/test_live_phase3.py`) -> **1 passed in 40.23 s**: real SIA discovery, bounded cutouts, detection/photometry in two D3 epochs, association, variability metrics and a persisted source detail/light-curve/variability round-trip.
- Supported contract: internal source ids are 32 lowercase hex; unknown/malformed ids return `404 SOURCE_NOT_FOUND`; unreadable stored records return `500 SOURCE_STORAGE_ERROR`; source records and light curves survive cache expiry and process restarts.

## Validation log (2026-11-14, multi-epoch timeline)

- Live SIA2: 126 rows, 63 unique `obs_id`, 126 unique `obs_publisher_did`; each `obs_id` has 2 bands (D1+D4, D2+D5 or D3+D6) with identical `t_min`/`t_max`.
- Timeline: 126 products → 63 observations → 63 epochs; earliest `2026-05-17T06:33:34.675200+00:00`, latest `2026-06-20T01:57:54.604800+00:00`, baseline **33.8086 days**.
- Band counts: D1 25, D4 25, D2 19, D5 19, D3 19, D6 19.
- Spatial: 125 products' `s_region` contain the target; 1 product's footprint intersects the search cone but does not contain the target (reported, not discarded).
- Metadata quality: 126/126 valid timestamps, bands and spatial metadata; 0 duplicate rows; 0 inconsistent epochs; 0 missing identifiers.
- FITS header cross-check (`2026W20_2A_0436_1/D3`): `MJD-OBS=61177.272651528` vs SIA `t_min=61177.272652`; `MJD-END=61177.273983906` vs `t_max=61177.273984`; `MJD-AVG=61177.273317717` vs midpoint `61177.273318`; `TIMESYS=UTC`.
- Live HTTP: timeline 200 (189,081-byte JSON), band filter D3 → 19 products / 19 epochs, date window 2026-05-17…18 → 16 products / 8 epochs, invalid band → 400 `INVALID_BAND_FILTER`, invalid radius → 400, invalid RA → 422, inverted dates → 400; CORS GET + preflight from `http://localhost:5173` pass; existing search/health unchanged.
- `python3 -m pyflakes app tests` → clean (exit 0).
- `python3 -m pytest -q` → **125 passed, 4 skipped** in 1.3 s (skips are the opt-in live tests).
- `RUN_LIVE=1 pytest -q tests/test_live_timeline.py` → **1 passed in 4.14 s**.

## Validation log (2026-11-14, live IRSA)

- SIA2 query: `POS=CIRCLE 156.09328159 -41.64466331 0.01000000`, `COLLECTION=spherex_qr3` → HTTP 200, 126 rows.
- 126 SIA rows correspond to 63 unique `obs_id` values (one row per band, e.g. D3/D6); `obs_publisher_did` is unique per row and is used as the product identity.
- Cutout: real IBE cutout 4,083,840 bytes; HDUs `PRIMARY, IMAGE, FLAGS, VARIANCE, ZODI, EPSF, WCS-WAVE`; `IMAGE` = `NAXIS1 58 × NAXIS2 59`, `BUNIT "MJy / sr"`.
- API width/height are `NAXIS1`/`NAXIS2` = 58/59. The reference experiment's "59 × 58" corresponds to the same grid written as (height × width); values are generated, not hardcoded.
- WCS validation for the product tested: target inside → true, pixel (28.6825, 28.8042). The historical (28.31, 29.07) belongs to the previously chosen product/band; cutout centring is correct.
- IBE intermittently returned `503 Server busy, retry later.`; retry/backoff handled it (a fresh live cutout took ~47 s including a retry).
- `GET /api/v1/health`, `POST /search`, `GET /observations/{id}`, `POST /cutout`, and file serving were exercised over real HTTP with uvicorn (search 200/57,579 bytes in 4.7 s; FITS download 200, 4,083,840 bytes; PNG 200, 58×59).
- Unit/API suite: 77 passed, 2 skipped. Live suite: 2 passed in 93 s.

## Validation log (2026-11-14, frontend integration)

- `python3 -m pyflakes app tests` → clean (exit 0).
- `python3 -m pytest -q` → **94 passed, 3 skipped** in 0.8 s. All 3 skips are live tests (`RUN_LIVE` unset).
- AstroChronoscope compatibility: `GET /` → 200 `{"message": "Planet X SPHEREx API is running"}` with CORS for `http://localhost:5173` and `http://127.0.0.1:5173`; `/api/v1/health` unchanged.
- Live API workflow (`RUN_LIVE=1 pytest -q tests/test_live_api_workflow.py`) → **1 passed in 25–73 s** across runs.
- Live service suite is intermittently blocked by IRSA: SIA `ID=` returns `502 Proxy Error` or read timeouts, surfacing as `503 IRSA_UNAVAILABLE`. This is external, not a backend defect. Search/cutout (`POS=` queries) still succeed; malformed IDs return `404 OBSERVATION_NOT_FOUND` without an upstream call.
- Browser-level click of "Connect to Backend" was **not** automated: Firefox is installed, but no geckodriver, Selenium, Playwright or Puppeteer is available and none was installed. The request/CORS/response path was verified with `curl` and `requests` against the running servers, not by driving the UI.
- Full live flow over real HTTP with uvicorn: root 200 for both loopback Vite origins; preflight 200 for both, unknown origin 400 with no ACAO; search 200 (126 rows, 126 unique IDs, `X-Observation-Count: 126`); detail 200 `processing_status=ready`; cutout 200 (58×59, `MJy / sr`, target inside); PNG 200 `image/png` 4,725 bytes with ACAO; FITS 200 `image/fits` 4,083,840 bytes with ACAO; invalid coordinates 422, invalid radius 400, bad filename 404, unknown route 404.
- CORS: preflight from `http://localhost:3000` → 200 with matching `Access-Control-Allow-Origin`; unknown origin → 400 with no ACAO; file responses carry ACAO; `X-Observation-Count` is exposed.
- `CORS_ORIGINS=["*"]` is rejected by `Settings` validation at startup.
- File URLs `/api/v1/files/<64-hex>.{fits,png}` served with `image/fits` / `image/png`, `Cache-Control: public, max-age=3600` and CORS; traversal/unregistered names → `404 FILE_NOT_FOUND`.
- JSON responses contain no NaN/Infinity; 404/405/422 use the `{"success": false, "error": {...}}` envelope.
- OpenAPI documents exactly seven public paths: `/`, `/api/v1/health`, `/api/v1/observations/search`, `/api/v1/observations/{observation_id}`, `/api/v1/observations/{observation_id}/cutout`, `/api/v1/targets/timeline`, `/api/v1/files/{filename}`.

## Validation log (2026-11-14, Phase 2 inspection & comparison)

- `python3 -m pyflakes app tests` → clean (exit 0).
- `python3 -m pytest -q` → **188 passed, 6 skipped** in ~5–10 s (was 125/4 after Phase 1; 63 new tests). The 6 skips are the opt-in live tests.
- OpenAPI documents exactly ten public paths: `/`, `/api/v1/health`, `/api/v1/observations/search`, `/api/v1/observations/{observation_id}`, `/api/v1/observations/{observation_id}/cutout`, `/api/v1/targets/timeline`, `/api/v1/images/inspect`, `/api/v1/images/compare`, `/api/v1/images/comparisons/{comparison_id}`, `/api/v1/files/{filename}`.
- Synthetic-sky end-to-end (same sky rendered through two different WCSs, 18° rotation, shifted CRPIX): reprojection recovered the reference sky (`residual.max() < 0.1 × peak`, median `< 0.005 × peak`), alignment residual 0.13 px, `overall_status=PASS`, difference written.
- Failure paths verified deterministically: BUNIT mismatch → `status=rejected`, `units FAIL`, `difference=null`; non-overlapping footprints → `coverage FAIL`, 0 common pixels; PSF FWHM ratio 2.00 → `psf FAIL`; missing VARIANCE → `uncertainty WARNING` + no uncertainty file; shifted source (≈4.8 px) → `alignment FAIL`.
- PSF matching verified: FWHM ratio 1.50 + `psf_matching="gaussian"` → convolution σ = 0.951 px, `matched=true`, `status=PASS`.
- Determinism: same pair processed twice yields the same `comparison_id`, difference statistics and reprojection block; cached cutout files are byte-identical before/after (inputs never modified).
- Limits: `MAX_COMPARISON_PIXELS` enforced (`IMAGE_PROCESSING_LIMIT`, 422); oversized cutout → 400 `INVALID_CUTOUT_SIZE`; malformed comparison id and `../../etc/passwd` → `COMPARISON_NOT_FOUND`.
- Live IRSA (2026-11-14, after the proxy recovered): inspection of `2026W20_2A_0436_1/D3` (0.2° cutout, 117×117) → `IMAGE`/`FLAGS`/`VARIANCE`/`EPSF`/`WCS-WAVE`, `BUNIT "MJy / sr"`, pixel scale 6.156″, target inside, EPSF FWHM 1.077 px = 6.63″, 22 flag bits, valid fraction 0.965.
- Live comparison of `2026W20_2A_0436_1/D3` vs `2026W25_1A_0224_2/D3` (33-day baseline): `status=completed`, `scientifically_valid=true`, `overall_status=PASS`, coverage 89.2%, alignment residual 0.03 px (peak/σ 99.7), PSF ratio 1.0002, α = 1, propagated uncertainty available; difference median 0.0032 MJy/sr, robust σ 0.0237.
- Live HTTP: `POST /images/inspect` 200 in 0.07 s (cached cutout); `POST /images/compare` 200 in 23 s; difference/uncertainty/mask FITS and PNG served with correct MIME types; `GET /images/comparisons/<id>` round-trips provenance and statistics byte-identically; difference FITS carries `COMPID/ALPHA/DIFFMETH/REPROJ/BGA/BGB/OBSID*/BAND*/SWVERS/CREATED`.
- Bug found and fixed during live validation: the original mask policy invalidated **any** non-zero `FLAGS` bit, and the dominant SPHEREx bit is `SOURCE` ("Pixel mapped to a known source"), which masked 84.5% of real pixels (valid fraction 0.155). `SOURCE`/`FULLSAMPLE` are now treated as informational (read from `MSKN`/`MSKD`); unknown bits stay invalidating. Valid fraction became 0.965 and the comparison passed coverage.
- `RUN_LIVE=1 pytest -q tests/test_live_image_comparison.py` → **2 passed in 46 s**.
- IRSA remained intermittent (SIA `ID=` lookups intermittently `502 Proxy Error`); the row cache from a successful `POS=` search avoids the lookup, and failures surface as `503 IRSA_UNAVAILABLE`, never as fabricated data.

## Known limitations / follow-ups

- [x] IBE cutout service returns intermittent `503 Server busy` — retried with backoff; persistent failures surface as `IRSA_CUTOUT_UNAVAILABLE` (503).
- [x] SIA2 `ID=` lookups are slow (~20 s) — mitigated with an in-process row cache; first detail lookup after a search is instant.
- [ ] IRSA SIA `ID=` currently returns `502 Proxy Error` or read timeouts (external); detail lookups for uncached/unknown IDs surface `503 IRSA_UNAVAILABLE`. Re-check when IRSA is healthy; malformed IDs still return `404 OBSERVATION_NOT_FOUND` locally.
- [x] SPHEREx `obs_id` is not unique across bands; `obs_publisher_did` is used as the stable per-product identity.
- [x] Preview is display-only; no photometric calibration is applied.
- [x] Multi-epoch **discovery** (`GET /targets/timeline`), pairwise **comparison** (`POST /images/compare`), source **detection** (`POST /sources/detect`), aperture **photometry** (`POST /sources/photometry`) and per-band **light curves** (`POST /targets/lightcurve`) are implemented; PSF/forced photometry, spectra and candidate classification are not.
- [ ] IRSA SIA is intermittently unavailable (`502 Proxy Error`, observed 2026-11-14). POS queries recovered and both live Phase 2 tests pass; `ID=` lookups still flake and surface as `503 IRSA_UNAVAILABLE`. Re-check when IRSA is stable.
- [x] Timeline epoch = one unique `obs_id`. No documented visit/sequence grouping exists in SIA2, so `unique_observations == unique_epochs` and consecutive exposures stay separate.
- [x] Timeline `observation_time` is the arithmetic midpoint of SIA2 `t_min`/`t_max`. FITS `MJD-AVG` matches it for SPHEREx; other collections may define `t_min`/`t_max` differently and need their own check.
- [x] `target_covered` is footprint-based (`s_region` POLYGON/CIRCLE). Unsupported encodings return `null` + `invalid_spatial_metadata`, never a guessed boolean.
- [x] Timeline `comparability_assessed` is always `false`; multiple epochs do not imply subtraction/photometry validity.
- [x] Live Phase 3 validation recorded 2026-11-15 (2 epochs, D3); deterministic tests remain the CI baseline.
- [x] Phase 3 detection is a single global-noise matched-filter baseline; crowding, extended sources and structured backgrounds need re-tuning (documented limitation).
- [x] Phase 3 photometry is circular-aperture only, with no aperture/PSF correction and no forced photometry; flux conversion uses the projection-plane pixel solid angle.
- [x] Phase 3 association uses a bounded centroid-uncertainty expansion with ranked candidate alternatives and ambiguity flags; it does not model proper motion or extended-source morphology, and internal source ids are not catalogue identities.
- [x] Phase 3 light curves count non-detections instead of fabricating zero flux/upper limits; sources below min_epochs are retained but not plotted; variability metrics are evidence, not classification. storage/sources/ and storage/lightcurves/ persist source records and are best-effort on write.
- [x] Phase 3 light-curve/variability endpoints are synchronous and bounded by `max_observations` epochs; no job queue/progress stream yet.
- [x] Phase 2 reprojection is interpolation of calibrated surface brightness on the reference grid — **not flux-conserving** (`flux_conserving: false`); no `reproject`/`photutils`/`scikit-image` dependency was added.
- [x] Phase 2 alignment is measured (FFT phase correlation), never applied; residual > `MAX_ALIGNMENT_RESIDUAL_PX` rejects the comparison.
- [x] Phase 2 PSF matching uses the real EPSF FWHM but a single global Gaussian kernel (documented approximation). Spatially varying PSFs are unsupported; missing EPSF/oversampling → `NOT_VERIFIED` (never `PASS`), `matching_supported: false`, `matched: false`.
- [x] Phase 2 background is a global sigma-clipped median (plus mesh variation for reliability), not a local background map.
- [x] Phase 2 `alpha = 1` default is justified only by matching calibrated surface brightness; `median_ratio` is labelled relative and can absorb real variability.
- [x] Phase 2 difference products are measurements, not detections: no source extraction, significance map or light curve.
- [ ] If a future data release documents visits/sequences, epoch grouping can be refined without changing product-level fields.
- [x] Disk cache has no eviction policy (files are small cutouts); add a sweeper if storage grows.
- [ ] Production deployment must set explicit `CORS_ORIGINS`; the defaults are development origins only.
- [ ] AstroChronoscope currently implements only the `GET /` connectivity check; search/detail/cutout UI is future work.
- [ ] Browser-level click of "Connect to Backend" not automated: no geckodriver/Selenium/Playwright/Puppeteer in this environment. Connectivity verified via HTTP/CORS only.
- [ ] No authentication or rate limiting; add at the gateway before public exposure.
- [ ] In-process SIA caches are per worker; multi-worker deployments re-query IRSA per worker (the disk cutout cache is shared).

## Validation log (PR #1 review: scientific correctness & release readiness)

- **Variance propagation.** `app/services/image_reprojection.py` now computes the
  interpolation taps and weights itself (`_taps`, `_sample`, `_propagate_variance`) and
  uses the *same* weights for the science image and the variance map:
  `V_out = Σ w_i² V_i`. Verified equivalent to
  `scipy.ndimage.map_coordinates(order=1, mode="nearest")`. Negative/non-finite variance
  → `NaN` variance with the science value preserved; an output pixel is valid only if
  every contributing source pixel is valid; boundary taps are clamped and still sum to
  one. `variance_valid_fraction` is reported. Covariance is **not** modelled and this is
  stated in the module docstring, the provenance block and the API response.
- **Scientific validity.** `scientifically_valid` is derived:
  `all(critical check == PASS)` and `status == "completed"`. All 13 checks are
  `critical: true`. `NOT_VERIFIED` was added to the `Status` vocabulary and blocks
  validity without discarding the computed difference. `QualityAssessment` now exposes
  `critical_checks`, `failed_checks`, `unverified_checks` and `warnings`.
- **PSF.** `PsfCompatibility` separates `metadata_available_a/b`, `verified`, `matched`,
  `matching_supported`, `spatially_varying`, `method` and `sigma_px`. `UNKNOWN` was
  replaced by `NOT_VERIFIED` (a documented breaking change for consumers that tested for
  `"UNKNOWN"`). No `psf_matched` field exists; `matched` is true only after a real
  convolution.
- **Dependencies.** `backend/pyproject.toml` is the single authoritative config
  (`requires-python = ">=3.14"`, exact pins matching the tested environment,
  `[tool.uv] package = false`); `backend/uv.lock` is the lockfile (48 packages);
  `backend/requirements.txt` is a generated `uv export` with hashes. No dependency was
  added or upgraded relative to the tested versions.
- **Tests.** `pytest -q` → **223 passed, 6 skipped** (the 6 skips are the opt-in live
  IRSA tests). New files: `test_variance_propagation.py` (14 analytic tests),
  `test_scientific_validity.py` (14), `test_psf_compatibility.py` (9). Two existing
  assertions in `test_image_comparison.py` were updated because they encoded the
  superseded `WARNING` semantics; no test was weakened to hide a failure.
- **Fresh install.** `backend/scripts/fresh_install_check.sh` builds a throwaway venv,
  runs `uv sync --frozen`, executes `scripts/fresh_install_check.py` (19 checks:
  imports, app startup, `/`, health, OpenAPI, synthetic inspect, comparison, validity,
  PSF, analytic variance), then the full suite, `compileall` and `pyflakes` inside that
  environment, and asserts the frontend sources/lockfile are unchanged.
  Result: all checks passed; `223 passed, 6 skipped`.
- **Lint/compile.** `python -m compileall -q app scripts` and `python -m pyflakes app
  scripts` → clean.
- **Not run here.** The opt-in live IRSA suite (`RUN_LIVE=1`) was not re-executed in this
  review pass; it remains network-dependent and is reported separately from the
  deterministic suite.
- **Known limitation (unchanged).** PSF matching is a global Gaussian approximation;
  spatially varying PSFs and empirical-kernel resampling are unsupported. Variance
  propagation is per-pixel only; output covariance is not computed.
