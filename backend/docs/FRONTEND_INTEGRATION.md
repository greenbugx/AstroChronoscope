# Planet X — Frontend Integration Guide

Backend: FastAPI, genuine SPHEREx data from IRSA. This document is the contract the
frontend can code against. It never needs to understand VOTable or FITS.

---

## 1. TL;DR

Current AstroChronoscope connectivity check (the only API call in its current `main`):

```ts
const API_ORIGIN = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const health = await fetch(`${API_ORIGIN}/`).then(r => r.json()); // { message: string }
```

Full observation flow for future frontend work:

```ts
const API_ORIGIN = "http://localhost:8000";
const API_BASE = `${API_ORIGIN}/api/v1`;

// 1. search
const search = await fetch(`${API_BASE}/observations/search`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ ra: 156.09328159, dec: -41.64466331, radius: 0.01, collection: "spherex_qr3" }),
}).then(r => r.json());

// 2. pick an observation (its id is opaque — do not parse it)
const observation = search.observations.find(o => o.fits_available);

// 3. cutout
const cutout = await fetch(
  `${API_BASE}/observations/${observation.observation_id}/cutout`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ra: 156.09328159, dec: -41.64466331, size: 0.1 }),
  },
).then(r => r.json());

// 4. display: file URLs are ABSOLUTE PATHS from the API origin, not full URLs
const previewSrc = new URL(cutout.cutout.preview_url, API_ORIGIN).toString();
const fitsHref   = new URL(cutout.cutout.fits_url, API_ORIGIN).toString();
```

Phase 2 (inspection + comparison) for future frontend work:

```ts
// inspect one product
const inspection = await fetch(`${API_BASE}/images/inspect`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ observation_id: observation.observation_id, ra: 156.09328159, dec: -41.64466331, size: 0.2 }),
}).then(r => r.json());

// compare two epochs of the same target (pick ids from /targets/timeline)
const comparison = await fetch(`${API_BASE}/images/compare`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ observation_id_a: idA, observation_id_b: idB, ra: 156.09328159, dec: -41.64466331, size: 0.2 }),
}).then(r => r.json());

// HTTP 200 does NOT mean the science passed — always check the status
if (comparison.status === "completed") {
  const diffSrc = new URL(comparison.difference.preview_url, API_ORIGIN).toString();
  const diffFits = new URL(comparison.difference.fits_url, API_ORIGIN).toString();
} else {
  // comparison.status === "rejected": show comparison.quality.checks with status "FAIL"
}
```

Phase 3 (detection + aperture photometry + light curves):

```ts
// detect sources in one selected epoch/product
const detection = await fetch(`${API_BASE}/sources/detect`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ observation_id: observation.observation_id, ra: 156.09328159, dec: -41.64466331, size: 0.05 }),
}).then(r => r.json());

// aperture photometry (same fields; adds flux_jy / flux_jy_error)
const photometry = await fetch(`${API_BASE}/sources/photometry`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ observation_id: observation.observation_id, ra: 156.09328159, dec: -41.64466331, size: 0.05 }),
}).then(r => r.json());

// target light curve across epochs; keep max_observations small for a first call
const curve = await fetch(`${API_BASE}/targets/lightcurve`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    ra: 156.09328159, dec: -41.64466331,
    radius_deg: 0.05, cutout_size_deg: 0.05,
    bands: ["SPHEREx-D3"], max_observations: 5,
  }),
}).then(r => r.json());
// Render curve.sources[].series[] by band. Non-detections are counts, not zero flux.
// Metrics are evidence, not a classification.
```

Phase 4 (DR1 cube spectra):

```ts
// Extract a spectrum at a target or at a persisted source id.
const extracted = await fetch(`${API_BASE}/spectra/extract`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ ra: 156.09328159, dec: -41.64466331 }),
}).then(r => r.json());

// Full ordered channel table for plotting.
const spectrum = extracted.spectrum;
// flux_unit === "MJy/sr", flux_kind === "surface_brightness"; null flux means blank/invalid.
// uncertainty_mjy_sr is always null and quality.uncertainty_status === "NOT_VERIFIED".

// Retrieve later / list by source.
const stored = await fetch(`${API_BASE}/spectra/${spectrum.spectrum_id}`).then(r => r.json());
const sourceSpectra = await fetch(`${API_BASE}/sources/${sourceId}/spectra`).then(r => r.json());

// Compare two stored spectra by wavelength, not array index.
const spectralComparison = await fetch(`${API_BASE}/spectra/compare`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ spectrum_id_a: spectrum.spectrum_id, spectrum_id_b: otherId }),
}).then(r => r.json());
// Show comparison_basis, grid_compatible, quality and warnings. A different-product
// comparison is NOT evidence of time variability: the cube is a static mosaic.
```

---

## 2. Base URL, origin and file URLs

| Concept | Value |
|---|---|
| API origin | `http://localhost:8000` (configurable deployment URL) |
| API base | `http://localhost:8000/api/v1` |
| OpenAPI | `http://localhost:8000/openapi.json` |
| Swagger UI | `http://localhost:8000/docs` |

`cutout.fits_url` and `cutout.preview_url` are **absolute paths rooted at the API
origin** (`/api/v1/files/<64hex>.png`), not full URLs and not relative to the current
page.

Correct:

```ts
const src = `${API_ORIGIN}${cutout.cutout.preview_url}`;
// or
const src = new URL(cutout.cutout.preview_url, API_ORIGIN).toString();
```

Wrong (breaks when frontend and API are on different ports/hosts):

```html
<img src="/api/v1/files/abc.png" />   <!-- resolves against the frontend origin -->
```

If your dev server proxies `/api` to the backend, the plain path also works. Otherwise
always prefix the API origin.

The API prefix is configurable (`API_PREFIX`, default `/api/v1`); read the URLs from
the response rather than hardcoding the file path shape.

### 2.1 Current AstroChronoscope frontend

The current `AstroChronoscope` main branch only performs a connectivity check:

- `src/lib/api.ts` calls `fetch(`${import.meta.env.VITE_API_URL}/`)`.
- It expects HTTP 2xx and JSON `{ "message": string }`.
- `src/App.tsx` displays `message`.

Frontend `.env`:

```bash
VITE_API_URL=http://localhost:8000
```

Vite serves on `http://localhost:5173` by default (`vite.config.ts` does not override
the port), which is allowed by the backend CORS defaults.

`GET /` is the compatibility endpoint:

```json
{ "message": "Planet X SPHEREx API is running" }
```

The search/detail/cutout endpoints in this guide are available but are **not yet
called** by the current frontend.

Verification status (2026-11-14): the exact request above was reproduced against a
running backend — HTTP 200, `application/json`, `{"message":"Planet X SPHEREx API is running"}`,
`Access-Control-Allow-Origin` matching both `http://localhost:5173` and
`http://127.0.0.1:5173`, and working `OPTIONS` preflight. The button click itself was
not automated (no browser driver installed); it was verified at the HTTP/CORS layer.

---

## 3. CORS

Default allowed origins:

```
http://localhost:3000
http://127.0.0.1:3000
http://localhost:5173
http://127.0.0.1:5173
```

Configure explicitly in `.env` (JSON array; the `*` wildcard is **rejected** at
startup — unrestricted CORS is not allowed):

```bash
CORS_ORIGINS=["https://planetx.example","http://localhost:3000"]
```

Other properties:

- Methods: `GET`, `POST` (plus automatic `OPTIONS` preflight).
- Headers: any requested header is allowed (`Access-Control-Allow-Headers` echoes it).
- Credentials: `Access-Control-Allow-Credentials` is not enabled; no cookies are used.
- Exposed response header: `X-Observation-Count` can be read from JS (search only).
- File responses (`/api/v1/files/...`) also carry CORS headers; `<img src>` works
  cross-origin without extra configuration.

Restart the backend after changing `CORS_ORIGINS`. Changing it via env at runtime has
no effect until restart because middleware is built at import.

When an origin is not allowed, the preflight fails with HTTP 400 and no
`Access-Control-Allow-Origin` header; the browser blocks the request.

---

## 4. Endpoints

| Method | Path | Purpose | Typical duration |
|---|---|---|---|
| `GET` | `/` | frontend connectivity check (`{ "message": string }`) | immediate |
| `GET` | `/api/v1/health` | liveness + default collection | immediate |
| `POST` | `/api/v1/observations/search` | cone search in IRSA SIA2 | ~3–10 s |
| `GET` | `/api/v1/observations/{observation_id}` | metadata for one product | cached (instant) / ~20 s on cache miss |
| `POST` | `/api/v1/observations/{observation_id}/cutout` | download + process FITS cutout | ~5–60 s (new), instant (cached) |
| `GET` | `/api/v1/targets/timeline` | multi-epoch discovery: normalized products, epochs, quality | ~3–10 s (cached instant) |
| `POST` | `/api/v1/images/inspect` | FITS/WCS/mask/variance/PSF inspection | ~5–60 s (cached instant) |
| `POST` | `/api/v1/images/compare` | validated pairwise difference imaging | ~10–120 s (cached instant) |
| `GET` | `/api/v1/images/comparisons/{comparison_id}` | stored comparison record | immediate |
| `POST` | `/api/v1/sources/detect` | source detection in one product/cutout | ~5–60 s (cached instant) |
| `POST` | `/api/v1/sources/photometry` | aperture photometry in one product/cutout | ~5–60 s (cached instant) |
| `POST` | `/api/v1/targets/lightcurve` | multi-epoch detection, photometry and per-band light curves | ~30 s–several min (bounded by `max_observations`) |
| `POST` | `/api/v1/targets/variability` | same bounded pipeline, per-band metrics without point arrays | same as light curve |
| `GET` | `/api/v1/sources/{source_id}` | persisted internal source and detections | immediate |
| `GET` | `/api/v1/sources/{source_id}/lightcurve` | persisted per-band light curve | immediate |
| `GET` | `/api/v1/sources/{source_id}/variability` | persisted per-band variability metrics | immediate |
| `POST` | `/api/v1/spectra/extract` | DR1 cube spectrum extraction | ~5 s cached / several min for a new 306 MiB tile |
| `GET` | `/api/v1/spectra/{spectrum_id}` | stored spectrum + provenance | immediate |
| `GET` | `/api/v1/sources/{source_id}/spectra` | spectrum summaries for one source | immediate |
| `POST` | `/api/v1/spectra/compare` | wavelength-matched comparison of stored spectra | immediate |
| `GET` | `/api/v1/files/{filename}` | serve generated preview/FITS | immediate |

Search and cutout are `POST` because they carry parameters in a JSON body. There is no
authentication.

---

## 5. Endpoint contracts

Every successful `/api/v1` response has `"success": true`. The root compatibility
endpoint is the exception: it returns `{ "message": string }` (section 5.5). Every
failure uses the same envelope (section 8). IDs and dates below are from a real live run and are examples; always use
the values returned at runtime.

### 5.1 `POST /observations/search`

Body:

| Field | Type | Required | Rules |
|---|---|---|---|
| `ra` | number | yes | `0 <= ra < 360`, ICRS degrees |
| `dec` | number | yes | `-90 <= dec <= 90`, ICRS degrees |
| `radius` | number | no (default `0.01`) | `> 0`, max `1.0` degree |
| `collection` | string \| null | no | defaults to `spherex_qr3`; echoed in response |
| `start_date` | string \| null | no | ISO 8601 date/datetime, UTC, inclusive |
| `end_date` | string \| null | no | ISO 8601 date/datetime, UTC, inclusive |

Unknown fields are rejected (`422`). `ra`, `dec`, `radius` must be finite numbers.

Response `200`:

```json
{
  "success": true,
  "target": { "ra": 156.09328159, "dec": -41.64466331 },
  "collection": "spherex_qr3",
  "total_observations": 126,
  "observations": [
    {
      "observation_id": "aXZvOi8vaXJzYS5pcGFjL3NwaGVyZXhfcXIzPzIwMjZXMjBfMkFfMDQzNl8xL0Qz",
      "obs_id": "2026W20_2A_0436_1",
      "obs_publisher_did": "ivo://irsa.ipac/spherex_qr3?2026W20_2A_0436_1/D3",
      "observation_date": "2026-05-17T06:32:37.132800+00:00",
      "observation_date_mjd": 61177.272652,
      "instrument": "SPHEREx",
      "facility": "SPHEREx",
      "collection": "spherex_qr3",
      "band": "SPHEREx-D3",
      "product_type": "image",
      "product_subtype": "science",
      "calib_level": 2,
      "fits_available": true
    }
  ]
}
```

Field reference (`ObservationSummary`):

| Field | Type | Meaning |
|---|---|---|
| `observation_id` | string | opaque, URL-safe id for this product row |
| `obs_id` | string \| null | IRSA observation id; **not unique per band** |
| `obs_publisher_did` | string \| null | unique IRSA dataset identifier |
| `observation_date` | string \| null | ISO 8601 UTC start time (`t_min`) |
| `observation_date_mjd` | number \| null | same time as MJD |
| `instrument`, `facility` | string \| null | from SIA |
| `collection` | string \| null | IRSA collection |
| `band` | string \| null | e.g. `SPHEREx-D3`, `SPHEREx-D6` |
| `product_type`, `product_subtype` | string \| null | e.g. `image`, `science` |
| `calib_level` | integer \| null | SIA calibration level (SPHEREx level 2) |
| `fits_available` | boolean | `true` when SIA returned a non-empty `access_url`; detail validates trust (`processing_status`) and cutout rejects untrusted/unsupported products |

Empty result: still `200` with `"total_observations": 0` and `"observations": []`.
This is not an error.

Response header: `X-Observation-Count` equals `total_observations` (CORS-exposed).

Notes:
- One row = one product/band. The same `obs_id` can appear twice (e.g. D3 and D6);
  use `observation_id` for actions and `obs_id` only for grouping.
- Results are sorted by start time, then `obs_id`, then band.
- `total_observations` is the number of returned product rows.

### 5.2 `GET /observations/{observation_id}`

Path parameter: `observation_id` exactly as returned by search (opaque, no encoding
needed; characters are `[A-Za-z0-9_-]`).

Response `200`:

```json
{
  "success": true,
  "observation": {
    "observation_id": "aXZvOi8vaXJzYS5pcGFjL3NwaGVyZXhfcXIzPzIwMjZXMjBfMkFfMDQzNl8xL0Qz",
    "obs_id": "2026W20_2A_0436_1",
    "obs_publisher_did": "ivo://irsa.ipac/spherex_qr3?2026W20_2A_0436_1/D3",
    "observation_date": "2026-05-17T06:32:37.132800+00:00",
    "observation_date_mjd": 61177.272652,
    "instrument": "SPHEREx",
    "facility": "SPHEREx",
    "collection": "spherex_qr3",
    "band": "SPHEREx-D3",
    "product_type": "image",
    "product_subtype": "science",
    "calib_level": 2,
    "fits_available": true,
    "s_ra": 156.25964649,
    "s_dec": -41.83597626,
    "t_min_mjd": 61177.272652,
    "t_max_mjd": 61177.273984,
    "start_time": "2026-05-17T06:32:37.132800+00:00",
    "end_time": "2026-05-17T06:32:52.217600+00:00",
    "exposure_time_seconds": 113.5826,
    "access_format": "image/fits",
    "access_estsize_bytes": 67565824,
    "width": 2040,
    "height": 2040,
    "pixel_scale_arcsec": 6.15,
    "fov_deg": 3.485,
    "fits_access_url": "https://irsa.ipac.caltech.edu/ibe/data/.../level2_...fits",
    "processing_status": "ready"
  }
}
```

Additional detail fields:

| Field | Type | Meaning |
|---|---|---|
| `s_ra`, `s_dec` | number \| null | product footprint centre (SIA) |
| `t_min_mjd`, `t_max_mjd` | number \| null | observation start/end (MJD) |
| `start_time`, `end_time` | string \| null | ISO 8601 UTC |
| `exposure_time_seconds` | number \| null | integration time |
| `access_format` | string \| null | e.g. `image/fits` |
| `access_estsize_bytes` | integer \| null | estimated product size |
| `width`, `height` | integer \| null | full product dimensions (`NAXIS1`, `NAXIS2`) |
| `pixel_scale_arcsec` | number \| null | SIA pixel scale |
| `fov_deg` | number \| null | SIA field of view |
| `fits_access_url` | string \| null | upstream IRSA provenance URL — **do not fetch from the browser** |
| `processing_status` | `"ready"` \| `"no_fits_product"` | whether a trusted product exists |

`404 OBSERVATION_NOT_FOUND` for unknown/expired ids.

### 5.3 `POST /observations/{observation_id}/cutout`

Body:

| Field | Type | Required | Rules |
|---|---|---|---|
| `ra` | number | yes | same ranges as search |
| `dec` | number | yes | same ranges as search |
| `size` | number | no (default `0.1`) | degrees, `> 0`, max `1.0` |

Response `200`:

```json
{
  "success": true,
  "observation_id": "aXZvOi8vaXJzYS5pcGFjL3NwaGVyZXhfcXIzPzIwMjZXMjBfMkFfMDQzNl8xL0Qz",
  "cutout": {
    "fits_url": "/api/v1/files/8d5c6495ff8b8bb13f2f1bc35dde57d44731d8dce8eb854f4e4669670b87b681.fits",
    "preview_url": "/api/v1/files/8d5c6495ff8b8bb13f2f1bc35dde57d44731d8dce8eb854f4e4669670b87b681.png",
    "width": 58,
    "height": 59,
    "unit": "MJy / sr"
  },
  "wcs": {
    "available": true,
    "target_inside_image": true,
    "pixel_x": 28.6825,
    "pixel_y": 28.8042,
    "message": null
  }
}
```

| Field | Type | Meaning |
|---|---|---|
| `cutout.fits_url` | string | API-relative URL of the science FITS cutout |
| `cutout.preview_url` | string | API-relative URL of the PNG preview |
| `cutout.width` | integer | science image width (`NAXIS1`) |
| `cutout.height` | integer | science image height (`NAXIS2`) |
| `cutout.unit` | string \| null | `BUNIT`, e.g. `MJy / sr` |
| `wcs.available` | boolean | celestial WCS present in the product |
| `wcs.target_inside_image` | boolean \| null | `null` when no reliable transform |
| `wcs.pixel_x`, `wcs.pixel_y` | number \| null | 0-based FITS pixel coordinates |
| `wcs.message` | string \| null | e.g. target outside the cutout |

Rules:
- A target outside the cutout is **not** an HTTP error: `200` with
  `target_inside_image: false`. Show the image and indicate the target is outside.
- If `wcs.available` is `false`, do not compute your own pixel position.
- `pixel_x`/`pixel_y` are in FITS pixel order: x → image width, y → image height.
  When drawing on the preview, y typically needs flipping depending on your renderer:
  FITS origin is bottom-left; `<img>` origin is top-left. For a marker overlay use
  `display_y = cutout.height - 1 - pixel_y` if you draw with a top-left origin.
- Preview is display-only (percentile + asinh scaling); use the FITS for measurements.
- Repeated requests for the same observation + position + size return the same URLs
  and are served from disk.

### 5.4 `GET /files/{filename}`

Serves only files generated by this backend: names must match `<64 lowercase hex>.fits`
or `<64 lowercase hex>.png`.

| Extension | `Content-Type` | Use |
|---|---|---|
| `.png` | `image/png` | preview `<img>` / canvas |
| `.fits` | `image/fits` | science download / FITS tooling |

- `Cache-Control: public, max-age=3600`; URLs are stable per cutout parameters.
- CORS headers included.
- Any other name (including path traversal attempts) → `404 FILE_NOT_FOUND`.
- Cached files persist until removed from `STORAGE_DIR`; if a cached file is missing,
  re-request the cutout to regenerate it.

### 5.5 `GET /` (frontend connectivity)

Compatibility endpoint for AstroChronoscope's connectivity check. It is outside the
`/api/v1` prefix because the frontend fetches the API origin root.

Response `200`:

```json
{ "message": "Planet X SPHEREx API is running" }
```

CORS headers are included. `/api/v1/health` remains the detailed health endpoint.

### 5.6 `GET /health`

```json
{ "success": true, "status": "ok", "version": "0.1.0", "default_collection": "spherex_qr3" }
```

### 5.7 `GET /targets/timeline`

Phase 1 multi-epoch discovery. Same cached SIA2 search as `/observations/search`, then
normalized into products grouped by `obs_id` and sorted into epochs.

Query parameters:

| Name | Required | Meaning |
|---|---|---|
| `ra`, `dec` | yes | ICRS degrees |
| `radius` | no | degrees, default `0.01`, max configured (1°) |
| `collection` | no | defaults to `spherex_qr3` |
| `bands` | no | repeatable exact band filter: `?bands=SPHEREx-D3&bands=SPHEREx-D6` |
| `start_date`, `end_date` | no | ISO 8601 UTC; SIA2 `TIME` + local overlap filter |

```ts
const url = new URL(`${API_BASE}/targets/timeline`);
url.searchParams.set("ra", "156.09328159");
url.searchParams.set("dec", "-41.64466331");
url.searchParams.set("radius", "0.01");
const timeline = await fetch(url).then(r => r.json());
```

Top-level response fields:

```json
{
  "success": true,
  "target": { "ra": 156.09328159, "dec": -41.64466331, "frame": "ICRS" },
  "query": { "radius_deg": 0.01, "collection": "spherex_qr3", "bands": null, "start_date": null, "end_date": null },
  "total_product_rows": 126,
  "total_products": 126,
  "unique_observations": 63,
  "unique_epochs": 63,
  "earliest_observation_time": "2026-05-17T06:33:34.675200+00:00",
  "latest_observation_time": "2026-06-20T01:57:54.604800+00:00",
  "temporal_baseline_days": 33.8086,
  "available_bands": ["SPHEREx-D1", "SPHEREx-D2", "SPHEREx-D3", "SPHEREx-D4", "SPHEREx-D5", "SPHEREx-D6"],
  "band_counts": { "SPHEREx-D1": 25, "SPHEREx-D2": 19, "SPHEREx-D3": 19, "SPHEREx-D4": 25, "SPHEREx-D5": 19, "SPHEREx-D6": 19 },
  "epochs": [],
  "quality": {},
  "warnings": [],
  "metadata": {}
}
```

Each epoch contains `epoch_key` (= `obs_id`), `observation_time` (ISO UTC midpoint of
`t_min`/`t_max`), `start_time`, `end_time`, `midpoint_mjd`, `bands`, `product_count`,
`target_covered`, `products[]` and warnings. Each product contains its existing
`observation_id` (usable with detail/cutout), `obs_publisher_did`, band, MJD/ISO
timestamps, exposure, FITS availability, footprint centre, `target_covered`,
`metadata_complete`, `missing_fields` and warnings.

Rules the frontend can rely on:

- **Do not count rows as epochs.** 126 product rows can be 63 observations/epochs.
- **One epoch = one `obs_id`.** No arbitrary time-threshold grouping is applied.
- **Missing data is `null`**, with counts in `quality` and codes in `warnings`; it is
  never replaced by zero.
- **`target_covered`** comes from the product `s_region` footprint, not the search
  cone. `null` means unknown.
- **Comparability is not asserted.** `metadata.comparability_assessed` is `false` in the
  timeline response; the timeline does not assess comparability. Pairwise comparability
  is assessed by `POST /images/compare` (section 5.9).
- Empty results are `200` with `epochs: []` and an `empty_result` warning.

Full field-by-field example: README section 4.7. The current AstroChronoscope UI does
not call this endpoint yet.

### 5.8 `POST /images/inspect`

FITS inspection for one product. Body:

| Field | Type | Required | Rules |
|---|---|---|---|
| `observation_id` | string | yes | id from search/timeline |
| `ra` | number \| null | no | ICRS; must be sent with `dec` |
| `dec` | number \| null | no | ICRS |
| `size` | number \| null | no | cutout size in degrees (defaults to `COMPARISON_SIZE_DEG` = 0.2 when `ra`/`dec` are given) |

When `ra`/`dec` are omitted the full product is inspected (`inspection.source: "product"`);
otherwise a cutout is fetched (`inspection.source: "cutout"`). Response `200`:
`{ "success": true, "inspection": { ... } }` with `hdus`, `stats`, `wcs`, `mask`,
`variance`, `psf`, `metadata`, `quality` and `warnings`. See README section 4.8 for the
full field list and warning codes.

Frontend rules:

- `wcs.available: false` means do not attempt to plot the image on the sky.
- `wcs.target_inside_image: false` means the target is outside this product's footprint.
- `stats.valid_fraction` already accounts for `FLAGS` and non-finite pixels. Informational
  bits (`SOURCE`, `FULLSAMPLE`) are not treated as defects, so real sources stay in the
  data; `mask.policy` states the exact rule.
- `psf.fwhm_arcsec: null` means the EPSF could not be converted; do not invent a value.
- `quality` is `FAIL` only when there are no finite pixels.

### 5.9 `POST /images/compare`

Compares two products of the same target. Body:

| Field | Type | Required | Rules |
|---|---|---|---|
| `observation_id_a` | string | yes | first product (default reference grid) |
| `observation_id_b` | string | yes | second product |
| `ra`, `dec` | number | yes | shared cutout centre |
| `size` | number | no (default `0.2`) | shared cutout size, ≤ `MAX_CUTOUT_SIZE_DEG` |
| `config` | object | no | see below |

`config` fields (all optional):

| Field | Values | Default |
|---|---|---|
| `background_correction` | `"median"`, `"none"` | `"median"` |
| `photometric_scaling` | `"none"`, `"median_ratio"` | `"none"` |
| `psf_matching` | `"none"`, `"gaussian"` | `"none"` |
| `reference` | `"first"`, `"second"` | `"first"` |
| `interpolation` | `"bilinear"`, `"nearest"` | `"bilinear"` |

**Read `status`, not the HTTP code.** A scientifically rejected comparison is a valid
request and returns `200` with:

```json
{ "status": "rejected", "scientifically_valid": false, "difference": null,
  "quality": { "overall_status": "FAIL", "checks": [ ... ],
               "failed_checks": ["units"], "unverified_checks": [], "warnings": [ ... ] } }
```

A completed comparison returns `status: "completed"` and a `difference` object with
`fits_url`, `preview_url`, `mask_url`, optional `uncertainty_url`,
`uncertainty_available`, `uncertainty_valid_fraction`, `uncertainty_note`, `statistics`
and `unit`. All file URLs are API-relative; resolve them with
`new URL(url, API_ORIGIN)`.

`scientifically_valid` is **derived, not a success flag**: it is `true` only when
`status === "completed"` and every entry in `quality.checks` with `critical: true` has
`status === "PASS"`. Do not infer validity from HTTP 200, from `status`, or from the
presence of a difference image.

### Check statuses

Each entry of `quality.checks` has `name`, `critical`, `status`, `message` and `details`:

| `status` | Meaning | Effect on `scientifically_valid` |
|---|---|---|
| `PASS` | check ran, evidence present, criterion met | none |
| `WARNING` | check ran, non-fatal caveat (e.g. PSF ratio between thresholds, relative photometry) | blocks it when `critical: true` |
| `FAIL` | check ran, criterion violated | rejects the comparison, no difference image |
| `NOT_VERIFIED` | check could not be performed (missing `BUNIT`/`FLAGS`/`VARIANCE`/`EPSF`, disabled background correction, unverifiable alignment) | blocks it when `critical: true` |

`NOT_VERIFIED` is **never** a pass. It is normal for a completed comparison to have
`scientifically_valid: false` while `difference` is populated: the image exists, but a
prerequisite could not be verified. Surface `quality.unverified_checks` and
`quality.failed_checks` in the UI rather than collapsing them into one boolean.

`quality.overall_status` is `FAIL` if any check failed, else `NOT_VERIFIED` if any check
could not be verified, else `WARNING` if any check warned, else `PASS`.

### PSF fields

`psf` distinguishes four independent facts; do not render `psf.status === "PASS"` as
"PSFs are matched":

| Field | Meaning |
|---|---|
| `metadata_available_a` / `metadata_available_b` | an `EPSF` extension exists for that product |
| `verified` | both FWHMs were measured and compared |
| `matched` | a convolution was actually applied (only with `psf_matching: "gaussian"`) |
| `matching_supported` | this backend can match the pair (needs both FWHMs) |
| `spatially_varying` | always `false`: spatially varying PSF matching is **not supported** |
| `method`, `sigma_px` | `"global_gaussian_convolution"` and the kernel σ when matched |
| `status` | `PASS` (compatible), `WARNING` (ratio between thresholds), `FAIL` (ratio above limit), `NOT_VERIFIED` (no EPSF) |

There is no `psf_matched` field, and `matched: true` is only set after the Gaussian
convolution runs. `PSF` compatibility by FWHM ratio is not the same as PSF matching.

Render `quality.checks[].message` for the user; `details` carries the numbers.

Typical duration: first call downloads two cutouts (seconds to ~1 min each depending on
IRSA); repeated identical calls are cached and effectively instant.

### 5.10 `GET /images/comparisons/{comparison_id}`

Returns the stored comparison record (same schema as the compare response). Use it to
re-render a previous result or to recover after a page reload. The id is the 32-hex
prefix of the deterministic cache key. Unknown/malformed ids → `404 COMPARISON_NOT_FOUND`.

### 5.11 `POST /sources/detect`

Detects compact sources in one product/cutout.

```ts
{
  observation_id: string;      // required; opaque id
  ra?: number;                 // optional, must be paired with dec
  dec?: number;
  size?: number;               // cutout size in degrees; ignored without ra/dec
  config?: {
    threshold_sigma?: number;  // default 5 (1-20)
    min_area_px?: number;      // default 5
    max_sources?: number;      // default 500
    filter_fwhm_px?: number;   // default 1.5
    edge_margin_px?: number;   // default 2
    background_mesh?: number;  // default 4
    deblend?: boolean;         // default true
  };
}
```

Key response fields:

- `image`: shape, `BUNIT`, valid/masked pixel counts, pixel scale/solid angle, PSF FWHM.
- `background`: `method`, `level`, `sigma`, `reliable`.
- `detections[]`: `detection_id`, `x`/`y`, `ra_deg`/`dec_deg`, `peak_value` (native
  pixel value, **not flux**), `source_area`, `centroid_x`/`centroid_y`, `detection_snr`,
  `centroid_error_px`/`centroid_error_arcsec` (approximate statistical centroid error,
  not full astrometric uncertainty), `fwhm_px`/`fwhm_arcsec`, `blended`, `flags`,
  `quality`.
- `total_detections`, `truncated`, `quality.overall_status` (`PASS`/`WARNING`/`FAIL`/
  `NOT_VERIFIED`), `provenance`.

`ra`/`dec` must be supplied together; supplying neither analyses the full product
(slower, larger). Empty `detections` is a valid result. Render `quality` and `flags`;
do not treat every detection as a confirmed source.

### 5.12 `POST /sources/photometry`

Same request fields as `/sources/detect`, plus optional `photometry`:

```ts
{
  observation_id: string;
  ra?: number;
  dec?: number;
  size?: number;
  detection?: DetectionConfig;
  photometry?: {
    aperture_fwhm_factor?: number;   // default 3
    annulus_inner_factor?: number;   // default 1.3
    annulus_outer_factor?: number;   // default 2.0
    aperture_oversample?: number;    // default 8
    min_valid_fraction?: number;     // default 0.5
  };
}
```

`measurements[]` adds, per detection: `centroid_error_px`/`centroid_error_arcsec`,
`aperture_radius_px`, `aperture_valid_fraction`, `psf_fwhm_px`/`fwhm_source`,
`aperture_sum` and `aperture_sum_unit` (native), `background_level`/`background_method`,
`solid_angle_sr`, `flux_mjy`, `flux_jy`, `flux_jy_error`, `snr`, `uncertainty_method`,
`aperture_correction_applied` (always `false`) and `quality`.

- Plot/filter on `flux_jy`; show `aperture_valid_fraction`, `quality` and `flags`.
- `flux_jy` is `null` when units cannot be converted; do not substitute the native sum.
- `snr` is per-measurement, not a variability significance.
- Invalid pixels are excluded, never zero-filled. Negative flux is preserved.

### 5.13 `POST /targets/lightcurve`

```ts
{
  ra: number;
  dec: number;
  radius_deg?: number;       // archive search radius, default 0.05
  cutout_size_deg?: number;  // image cutout, default 0.1
  collection?: string;
  bands?: string[];
  start_date?: string;
  end_date?: string;
  max_observations?: number; // default 20, max 200
  detection?: DetectionConfig;
  photometry?: PhotometryConfig;
  association?: {
    match_radius_arcsec?: number;            // default 6
    ambiguity_margin_arcsec?: number;        // default 1
    position_uncertainty_sigma?: number;     // default 3
    max_uncertainty_boost_arcsec?: number;   // default 3
    min_epochs?: number;                     // default 2
    max_sources?: number;                    // default 100
  };
}
```

Response fields:

- `epochs_considered`, `epochs_processed`, `products_processed`.
- `sources[]`: `source_id` (internal, not a catalogue id), reference RA/Dec,
  `epoch_count`, `bands`, `position_scatter_arcsec`, `flags`.
- `sources[].series[]`: one series per band with `points[]`, `expected_epochs`,
  `non_detections` and `metrics`.
- `points[]`: `time_utc`, `time_mjd`, `flux_jy`, `flux_jy_error`, `unit` (`"Jy"`),
  `band`, `observation_id`, `detection_id`, `snr`, `quality`, `flags`.
- `metrics`: `status` (`computed`/`insufficient_data`/`undefined_uncertainties`),
  `n_points`, mean/median/weighted mean, std/MAD/robust sigma,
  `fractional_variability`, `chi2`/`dof`/`reduced_chi2`/`chi2_pvalue`,
  `peak_to_peak_jy`, `robust_range_jy`, `temporal_baseline_days`, `max_gap_days`.
- `failures[]`: per-epoch failures (`code`, `message`) - show them, do not hide them.
- `association.below_min_epoch_source_ids[]`: retained sources that do not meet
  `min_epochs`; they are retrievable by id but are not light-curve entries.
- `association.multi_epoch_sources`, `below_min_epoch_sources`, `sources_truncated`:
  counts after the `max_sources` bound. `matched.candidates[]` ranks alternatives and
  marks the selected association.

Rules:

- One product is selected per epoch; all requested bands for that epoch stay together.
  Bands are never merged into one series.
- Non-detections are counts, not zero flux or upper limits.
- The association radius is expanded by centroid uncertainty (bounded), and ambiguous
  matches are flagged rather than silently resolved.
- Metrics are evidence, not a classification. Do not label a source "variable",
  "transient" or "confirmed" from this response.
- The endpoint is synchronous and bounded by `max_observations` epochs; show a loading
  state, start with a small value, and let the user retry. No job id/progress stream
  exists.

### 5.14 `GET /sources/{source_id}`

Returns the persisted internal source, including every associated detection, candidate
ranking, quality flags, the original target/query and provenance. Source ids are
32-character lowercase hex and are validated before any filesystem access. Unknown or
malformed ids return `404 SOURCE_NOT_FOUND`; an unreadable stored record returns
`500 SOURCE_STORAGE_ERROR`.

Persisted records survive process restarts and cache expiry. A below-`min_epochs`
source is still returned with its detections and is not treated as a light curve.

### 5.15 `GET /sources/{source_id}/lightcurve`

Returns the persisted per-band series and metrics for one source. A below-minimum
source returns `series: []` with `below_min_epochs` and `no_light_curve` flags; do not
invent flux or upper limits.

### 5.16 `POST /targets/variability` and `GET /sources/{source_id}/variability`

`POST /targets/variability` takes the same body as `/targets/lightcurve` and returns
per-band `band_metrics[]` without duplicating point arrays. `GET
/sources/{source_id}/variability` returns the same source-level object for one stored
source. Use these for a compact review table; fetch the light curve separately when
plotting. Metrics remain evidence, not classification.

### 5.17 `POST /spectra/extract`

Body fields: `source_id` **or** (`ra`, `dec`) — mutually exclusive; optional
`collection` and `config.spatial_method` (`bilinear` default or `nearest`). Unknown
fields are rejected. `source_id` resolves the reference position from the persisted
Phase 3 source.

Response `200`:

```json
{
  "success": true,
  "spectrum": {
    "spectrum_id": "29891c5bfbcd874dc23126ae179fbbf8",
    "source_id": null,
    "product_type": "spherex_dr1_all_sky_cube",
    "collection": "spherex_dr1_cube",
    "product_id": "ivo://irsa.ipac/spherex_dr1_cube?hips5_cube-hips_20261026/9621",
    "ra_deg": 156.09328159,
    "dec_deg": -41.64466331,
    "pixel_x": 282.099,
    "pixel_y": 229.071,
    "wavelength_unit": "um",
    "flux_unit": "MJy/sr",
    "flux_kind": "surface_brightness",
    "channel_count": 102,
    "valid_channel_count": 100,
    "blank_channels": [50, 51],
    "channels": [
      {
        "index": 0,
        "wavelength_um": 0.753,
        "flux_mjy_sr": 0.0933,
        "uncertainty_mjy_sr": null,
        "nhits": 13,
        "flags": 2097152,
        "flags_applied": [],
        "quality": "PASS"
      }
    ],
    "quality": {
      "overall_status": "WARNING",
      "uncertainty_status": "NOT_VERIFIED",
      "warnings": ["cube_is_static_mosaic", "no_variance_extension", "blank_channels_present"]
    },
    "limitations": ["cube_is_static_mosaic", "surface_brightness_not_integrated_flux"]
  },
  "provenance": {
    "created_at": "2026-11-15T00:00:00+00:00",
    "algorithm_version": "phase4-spectrum-extraction-v1",
    "access_url": "https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/...Npix9621_cube.fits",
    "fits_sha256": "...",
    "npix": 9621,
    "order": 5
  }
}
```

The first request for a tile downloads roughly 306 MiB and is synchronous; give it a
long client timeout and show a loading state. Subsequent requests use the disk cache.
Flux is surface brightness, not total source flux. Blank/invalid channels have null
flux and a non-`PASS` quality; never render them as measured zero.

### 5.18 `GET /spectra/{spectrum_id}`

Returns the same `spectrum` + `provenance` shape. Unknown/malformed ids return
`404 SPECTRUM_NOT_FOUND`; corrupt stored JSON returns `500 SPECTRUM_STORAGE_ERROR`.

### 5.19 `GET /sources/{source_id}/spectra`

```json
{
  "success": true,
  "source_id": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "spectra": [
    {
      "spectrum_id": "29891c5bfbcd874dc23126ae179fbbf8",
      "source_id": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "collection": "spherex_dr1_cube",
      "product_id": "ivo://irsa.ipac/spherex_dr1_cube?...",
      "ra_deg": 156.09328159,
      "dec_deg": -41.64466331,
      "valid_channel_count": 100,
      "channel_count": 102,
      "wavelength_min_um": 0.753,
      "wavelength_max_um": 4.988,
      "quality": "WARNING",
      "created_at": "2026-11-15T00:00:00+00:00"
    }
  ]
}
```

Listings omit channel arrays; fetch the full spectrum by id. Unknown source ids return
`404 SOURCE_NOT_FOUND`.

### 5.20 `POST /spectra/compare`

Body: `spectrum_id_a`, `spectrum_id_b`, optional `config.min_overlap_channels`
(default 5) and `config.wavelength_tolerance_um` (default `1e-4`).

Response `comparison` includes `comparison_basis`, `grid_compatible`,
`overlap_channel_count`, `channels[]` with `difference_mjy_sr` and `ratio`, plus
`quality` and `warnings`. Possible bases: `same_spectrum`,
`same_product_static_mosaic`, `different_products_static_mosaic`.

A different-product comparison is **not** a spectral time series: the DR1 cube is a
static mosaic and has no epoch or variance. `uncertainty_status` is always
`NOT_VERIFIED`; low overlap returns `FAIL`, sufficient overlap returns `WARNING`.

---

## 6. Observation identifiers

- `observation_id` — opaque, URL-safe, stable per SIA product row. **Pass it back
  unchanged.** Do not decode, split, or construct it. It is used in the detail and
  cutout URLs.
- `obs_id` — IRSA observation id. SPHEREx returns one product row per band
  (`SPHEREx-D3`, `SPHEREx-D6`, …) with the same `obs_id`. Group by `obs_id` for
  display; act on `observation_id`. The timeline endpoint already does this:
  one `obs_id` = one epoch, and sibling band products share one exposure interval.
- `obs_publisher_did` — unique IRSA dataset id, useful for provenance/debugging.
- `observation_date` / `start_time` — ISO 8601 UTC strings; safe for `new Date(...)`.
- `observation_date_mjd` / `t_min_mjd` — MJD numbers for plotting/comparisons.
- Timeline `observation_time` — ISO UTC midpoint of `t_min`/`t_max`; use it for
  chronological ordering. `unique_observations` and `unique_epochs` coincide because
  no documented visit grouping exists in SIA2.

Example live target: RA `156.09328159`, Dec `-41.64466331`, `spherex_qr3`, radius
`0.01` → 126 product rows across 63 `obs_id` values (counts vary with IRSA content).

---

## 7. Recommended user flow

1. User enters RA/Dec (or picks a target).
2. `POST /observations/search` with a small radius (0.01° is a good default).
3. If `total_observations === 0`, show "no SPHEREx coverage" (not an error dialog).
4. Group rows by `obs_id`; show time and band. Offer rows with `fits_available`.
5. User selects a row → `POST /observations/{id}/cutout` with the same RA/Dec and a
   chosen size (0.1° default).
6. Render `preview_url`; overlay the target marker at `(pixel_x, pixel_y)`.
7. Offer `fits_url` as "Download science FITS".
8. On upstream failures (`502/503/504`) show a retry action; never fake an image.

For a time-domain view, call `GET /targets/timeline` with the same target instead of
step 2. Render `epochs[]` in order and use each product's `observation_id` for the
existing detail/cutout calls. Do not infer comparability from multiple epochs; the
response explicitly sets `metadata.comparability_assessed = false`.

For Phase 3, call `POST /targets/lightcurve` with the target and a small
`max_observations` (for example 5) to get per-band series. Render `points[]` with error
bars, group by `series[].band`, and show `series[].non_detections`, `metrics.status`,
`failures[]`, quality and provenance. Do not join bands into one series and do not
present a metric or a candidate pattern as a confirmed astrophysical event. The call is
synchronous, so keep a loading/retry state and increase `max_observations` deliberately.
For one epoch only, `POST /sources/detect` and `/sources/photometry` expose the same
measurements without the timeline/association step.

To inspect one associated source, use `GET /sources/{source_id}` and
`GET /sources/{source_id}/lightcurve`. Use `POST /targets/variability` or
`GET /sources/{source_id}/variability` when only the metrics table is needed. Persisted
ids remain valid after a backend restart, and ids below `min_epochs` are still
retrievable for review.

For Phase 4, call `POST /spectra/extract` with the target coordinates or a persisted
`source_id`. Plot `spectrum.channels[]` against `wavelength_um`, skipping null flux, and
show `quality`, `blank_channels`, `flags_applied` and `limitations`. Use
`GET /sources/{source_id}/spectra` for the source tab. Comparisons are static-mosaic
comparisons, not light curves: show `comparison_basis` and warnings prominently.

---

## 8. Errors

Envelope (all non-2xx responses from application code):

```json
{
  "success": false,
  "error": {
    "code": "IRSA_TIMEOUT",
    "message": "IRSA SIA request timed out",
    "details": { "endpoint": "https://irsa.ipac.caltech.edu/SIA" }
  }
}
```

`details` is nullable and may contain diagnostics. Do not display raw upstream errors
to end users; map them to friendly text and offer retry where sensible.

| HTTP | Code | Frontend handling |
|---|---|---|
| 400 | `INVALID_COORDINATES`, `INVALID_RADIUS`, `INVALID_CUTOUT_SIZE`, `INVALID_DATE_RANGE` | fix input (should be caught client-side) |
| 404 | `OBSERVATION_NOT_FOUND` | id is stale/unknown → re-run search |
| 404 | `COMPARISON_NOT_FOUND` | comparison id unknown/malformed/evicted → re-run the comparison |
| 404 | `FILE_NOT_FOUND` | cached file missing/removed → re-request cutout |
| 404 | `SPECTRAL_PRODUCT_NOT_FOUND` | no DR1 cube covers that position → try another target |
| 404 | `SPECTRUM_NOT_FOUND` | spectrum id unknown/malformed → re-extract |
| 422 | `INVALID_REQUEST` | request schema bug (unknown field, wrong type) |
| 422 | `SPECTRAL_PRODUCT_UNSUPPORTED`, `SPECTRAL_TARGET_OUTSIDE_PRODUCT`, `SPECTRAL_EXTRACTION_FAILED` | spectral product cannot produce a spectrum at this position |
| 422 | `MISSING_ACCESS_URL`, `UNTRUSTED_ACCESS_URL`, `UNSUPPORTED_PRODUCT`, `MISSING_IMAGE_EXTENSION` | this product cannot be displayed |
| 422 | `IMAGE_PROCESSING_LIMIT` | pair exceeds `MAX_COMPARISON_PIXELS` → use a smaller `size` |
| 422 | `REPROJECTION_FAILED` | WCS transform/interpolation failed → try another pair |
| 502 | `IRSA_HTTP_ERROR`, `IRSA_INVALID_RESPONSE`, `IRSA_QUERY_ERROR`, `INVALID_FITS_FILE` | upstream/data error → retry |
| 503 | `IRSA_UNAVAILABLE`, `IRSA_CUTOUT_UNAVAILABLE` | upstream busy → retry later |
| 503 | `SPECTRAL_PRODUCT_UNAVAILABLE` | cube archive temporarily unavailable → retry later |
| 503 | `PROCESSING_BUSY` | too many comparisons/extractions in flight → retry shortly |
| 504 | `IRSA_TIMEOUT` | upstream slow → retry |
| 404 | `SOURCE_NOT_FOUND` | source id unknown/malformed �+' re-run the target pipeline or use an id from the current response |
| 500 | `SOURCE_STORAGE_ERROR` | persisted source record is corrupt/unreadable �+' report; do not fabricate source data |
| 500 | `SPECTRUM_STORAGE_ERROR` | persisted spectrum JSON is corrupt/unreadable �+' report; re-extract if possible |
| 500 | `PREVIEW_GENERATION_FAILED`, `INTERNAL_ERROR` | retry / report |

Framework-level errors (`HTTP_ERROR`): unknown route (`404`) and wrong method (`405`)
also use the envelope. CORS preflight rejections are handled by the browser before
your JS sees a response.

HTTP `200` with `total_observations: 0` is a valid empty result, not a failure.

---

## 9. JavaScript / TypeScript example

```ts
export type ObservationSummary = {
  observation_id: string;
  obs_id: string | null;
  obs_publisher_did: string | null;
  observation_date: string | null;
  observation_date_mjd: number | null;
  instrument: string | null;
  facility: string | null;
  collection: string | null;
  band: string | null;
  product_type: string | null;
  product_subtype: string | null;
  calib_level: number | null;
  fits_available: boolean;
};

export type CutoutResponse = {
  success: true;
  observation_id: string;
  cutout: { fits_url: string; preview_url: string; width: number; height: number; unit: string | null };
  wcs: {
    available: boolean;
    target_inside_image: boolean | null;
    pixel_x: number | null;
    pixel_y: number | null;
    message: string | null;
  };
};

const API_ORIGIN = import.meta.env.VITE_API_ORIGIN ?? "http://localhost:8000";
const API = `${API_ORIGIN}/api/v1`;

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, init);
  const body = await response.json();
  if (!response.ok || body.success === false) {
    throw new Error(body.error?.message ?? `HTTP ${response.status}`);
  }
  return body as T;
}

export async function search(ra: number, dec: number, radius = 0.01) {
  return api<{ total_observations: number; observations: ObservationSummary[] }>(
    "/observations/search",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ra, dec, radius, collection: "spherex_qr3" }),
    },
  );
}

export async function fetchCutout(id: string, ra: number, dec: number, size = 0.1) {
  return api<CutoutResponse>(`/observations/${id}/cutout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ra, dec, size }),
  });
}

export function previewUrl(cutout: CutoutResponse): string {
  return new URL(cutout.cutout.preview_url, API_ORIGIN).toString();
}
```

React usage:

```tsx
const [cutout, setCutout] = useState<CutoutResponse | null>(null);

// on observation click
const result = await fetchCutout(observation.observation_id, ra, dec, 0.1);
setCutout(result);

{cutout && (
  <img
    src={previewUrl(cutout)}
    alt={`SPHEREx ${observation.band} cutout`}
    width={cutout.cutout.width}
    height={cutout.cutout.height}
  />
)}
```

### Python requests example

```python
import requests

BASE = "http://localhost:8000/api/v1"

search = requests.post(
    f"{BASE}/observations/search",
    json={"ra": 156.09328159, "dec": -41.64466331, "radius": 0.01, "collection": "spherex_qr3"},
    timeout=180,
)
search.raise_for_status()
target = next(o for o in search.json()["observations"] if o["fits_available"])

cutout = requests.post(
    f"{BASE}/observations/{target['observation_id']}/cutout",
    json={"ra": 156.09328159, "dec": -41.64466331, "size": 0.1},
    timeout=300,
).json()

png = requests.get(f"http://localhost:8000{cutout['cutout']['preview_url']}", timeout=60).content
fits_bytes = requests.get(f"http://localhost:8000{cutout['cutout']['fits_url']}", timeout=120).content
```

---

## 10. curl runbook

```bash
# health
curl -s http://localhost:8000/api/v1/health | jq

# search (validated target)
curl -s -X POST http://localhost:8000/api/v1/observations/search \
  -H 'Content-Type: application/json' \
  -d '{"ra":156.09328159,"dec":-41.64466331,"radius":0.01,"collection":"spherex_qr3"}' \
  | jq '{total_observations, first: .observations[0]}'

# detail
curl -s http://localhost:8000/api/v1/observations/<observation_id> | jq

# cutout
curl -s -X POST http://localhost:8000/api/v1/observations/<observation_id>/cutout \
  -H 'Content-Type: application/json' \
  -d '{"ra":156.09328159,"dec":-41.64466331,"size":0.1}' | jq

# files
curl -o preview.png http://localhost:8000/api/v1/files/<hash>.png
curl -o cutout.fits http://localhost:8000/api/v1/files/<hash>.fits

# multi-epoch timeline (Phase 1)
curl -s 'http://localhost:8000/api/v1/targets/timeline?ra=156.09328159&dec=-41.64466331&radius=0.01&collection=spherex_qr3' \
  | jq '{total_product_rows, unique_observations, unique_epochs, temporal_baseline_days, band_counts}'

# timeline filtered by band + date window
curl -s 'http://localhost:8000/api/v1/targets/timeline?ra=156.09328159&dec=-41.64466331&radius=0.01&bands=SPHEREx-D3&start_date=2026-05-17&end_date=2026-05-18' \
  | jq '{total_products, unique_epochs, epochs: [.epochs[] | {epoch_key, observation_time, bands}]}'

# Phase 2: inspect one product
curl -s -X POST http://localhost:8000/api/v1/images/inspect \
  -H 'Content-Type: application/json' \
  -d '{"observation_id":"<observation_id>","ra":156.09328159,"dec":-41.64466331,"size":0.2}' \
  | jq '.inspection | {science_extname, stats, wcs, psf, quality, warnings}'

# Phase 2: compare two same-band epochs
curl -s -X POST http://localhost:8000/api/v1/images/compare \
  -H 'Content-Type: application/json' \
  -d '{"observation_id_a":"<id-A>","observation_id_b":"<id-B>","ra":156.09328159,"dec":-41.64466331,"size":0.2}' \
  | jq '{comparison_id, status, scientifically_valid, overall: .quality.overall_status,
         failed: [.quality.checks[] | select(.status == "FAIL") | .name], difference}'

# Phase 2: retrieve a stored comparison
curl -s http://localhost:8000/api/v1/images/comparisons/<comparison_id> | jq '{status, scientifically_valid, difference}'
```

---

## 11. Timeouts, caching and polling

- Give search requests ≥ 60 s client timeout; cutouts ≥ 300 s. IRSA can be slow.
- Debounce searches (e.g. 500 ms after the user finishes editing coordinates).
- Cache search responses in the UI by `(ra, dec, radius, collection, dates)`.
- Cutout URLs are deterministic and stable; cache the JSON by
  `(observation_id, ra, dec, size)` to avoid redundant requests.
- There is no job queue: the cutout request blocks until the FITS is processed.
  Show a loading state rather than polling for a job.
- Preview and FITS files are served with a 1-hour browser cache.

---

## 12. Not implemented

Do not build UI on top of features that do not exist in this backend:

- PSF photometry, forced photometry or deblending beyond the simple local-maximum split
- multi-epoch spectra, SED fitting, spectral slope fitting or physical feature claims
- spectral-image extraction (only the DR1 all-sky cube is a supported spectrum)
- image-based re-registration / deconvolution (alignment is validated, not corrected)
- candidate classification, transient confirmation or significance maps
- background jobs, progress streams or cancellation for long analyses
- authentication, quotas, or per-user storage

Implemented: multi-epoch discovery (`GET /targets/timeline`), single-epoch retrieval,
metadata, WCS validation, previews, FITS inspection (`POST /images/inspect`), validated
pairwise difference imaging (`POST /images/compare`), stored comparison records
(`GET /images/comparisons/{id}`), source detection (`POST /sources/detect`), aperture
photometry (`POST /sources/photometry`), target light curves with variability metrics
(`POST /targets/lightcurve`, `POST /targets/variability`), persisted source detail /
light-curve / variability views (`GET /sources/{id}`, `/lightcurve`, `/variability`),
and DR1 cube spectra with extraction, retrieval, source listing and comparison
(`POST /spectra/extract`, `GET /spectra/{id}`, `GET /sources/{id}/spectra`,
`POST /spectra/compare`).

For comparison UIs: render `quality.checks` rather than only the image, and never treat
HTTP `200` as "the science passed" — check `status` / `scientifically_valid`.
For detection/photometry/light-curve UIs: render quality flags and provenance, do not
call a detection a confirmed source, and do not call a variability metric a
classification.

---

## 13. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Browser blocks response, no ACAO header | frontend origin not in `CORS_ORIGINS` | add the exact origin (scheme + host + port), restart backend |
| Connect button reports `API request failed: 404` | backend build predates `GET /` | update backend; confirm `curl http://localhost:8000/` returns `{"message": ...}` |
| Backend refuses to start: wildcard CORS error | `CORS_ORIGINS=["*"]` | list explicit origins |
| `<img>` shows 404 | used `preview_url` relative to the frontend origin | prefix `API_ORIGIN` |
| `422 INVALID_REQUEST` | wrong field name/type, `Content-Type` missing | send JSON with `Content-Type: application/json` |
| `404 OBSERVATION_NOT_FOUND` | id from an old session / expired cache | re-run search |
| `400 INVALID_BAND_FILTER` | band value contains spaces/unsupported characters | use the exact `band` strings returned by search/timeline |
| Timeline `unique_epochs` < `total_products` | sibling band products share one `obs_id` | expected: 126 products can be 63 epochs; do not count rows as epochs |
| `503 IRSA_UNAVAILABLE` | IRSA SIA unreachable/slow (observed: `ID=` lookups return `502 Proxy Error` or time out) | retry; prefer an `observation_id` from a recent search so the cached row avoids the `ID=` lookup |
| `503 IRSA_CUTOUT_UNAVAILABLE` | IRSA IBE busy | retry after a few seconds |
| `404 FILE_NOT_FOUND` | cached file removed | re-request the cutout |
| `404 COMPARISON_NOT_FOUND` | comparison id typo / record not on this host | re-run the comparison; ids are per-backend-instance |
| `404 SOURCE_NOT_FOUND` | source id typo / not produced by this backend | use an id from a current target response; ids are 32 lowercase hex characters |
| `500 SOURCE_STORAGE_ERROR` | persisted source JSON is corrupt or unreadable | report the id; do not display guessed source data |
| `404 SPECTRAL_PRODUCT_NOT_FOUND` | no DR1 cube covers the target | try another position or collection |
| `404 SPECTRUM_NOT_FOUND` | spectrum id typo / not stored on this backend | extract again and use the returned `spectrum_id` |
| `422 SPECTRAL_TARGET_OUTSIDE_PRODUCT` | target lies outside the retrieved cube tile WCS | use a position inside the tile |
| `503 SPECTRAL_PRODUCT_UNAVAILABLE` | cube archive busy/unreachable | retry later |
| `503 PROCESSING_BUSY` | `MAX_CONCURRENT_SPECTRAL` saturated | retry after a few seconds |
| Spectrum has `uncertainty_mjy_sr: null` | the DR1 cube has no `VARIANCE` extension | expected; show "uncertainty not available", not zero error |
| Spectral comparison `overall_status: "FAIL"` | fewer than `min_overlap_channels` matched wavelengths | show the warning; do not invent a comparison |
| `422 IMAGE_PROCESSING_LIMIT` | pair exceeds `MAX_COMPARISON_PIXELS` | reduce `size` (0.2° is the default; 0.1° is a quarter of the pixels) |
| `422 REPROJECTION_FAILED` | one product's WCS could not be transformed onto the other grid | try a different pair; report the ids |
| `503 PROCESSING_BUSY` | `MAX_CONCURRENT_COMPARISONS` saturated | retry after a few seconds |
| Compare returns `status: "rejected"` | a mandatory prerequisite failed (units, coverage, alignment, PSF) | show `quality.checks` with `status: "FAIL"`; this is not a network error |
| Compare `overall_status: "WARNING"` | difference exists but a critical check warned (PSF ratio between thresholds, relative photometry) | show the warning text; `scientifically_valid` is `false` |
| Compare `overall_status: "NOT_VERIFIED"` | difference exists but a critical check could not be performed (missing `BUNIT`, `FLAGS`, `VARIANCE` or `EPSF`) | show `quality.unverified_checks`; `scientifically_valid` is `false` — do not present the difference as validated |
| `psf.matched: false` although `psf.status: "PASS"` | compatibility was verified but no convolution was requested/applied | expected; `matched` is true only after real matching |
| `psf.status: "NOT_VERIFIED"` | one or both products have no `EPSF` extension | compatibility cannot be checked; the comparison is not scientifically valid |
| Cutout has `target_inside_image: false` | search radius placed a product whose footprint excludes the target | render with the warning, or pick another observation |

Full backend setup, architecture and scientific notes: [`../README.md`](../README.md).
