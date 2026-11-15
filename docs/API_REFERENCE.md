# REST API Reference

The AstroChronoscope backend provides a synchronous FastAPI service under prefix `/api/v1`.

## Global Conventions

- **Content-Type**: `application/json` for request and response payloads.
- **Coordinate System**: Equatorial coordinates are strictly ICRS (International Celestial Reference System) with RA in decimal degrees [0, 360) and Dec in decimal degrees [-90, +90].
- **Time Standard**: Observation times are reported in ISO-8601 UTC strings and Modified Julian Date (MJD).
- **Error Format**: Failed requests return standard HTTP error status codes with an error envelope:
  ```json
  {
    "detail": {
      "code": "ERROR_CODE",
      "message": "Human-readable fault description",
      "details": {}
    }
  }
  ```

---

## 1. System & Telemetry Endpoints

### `GET /api/v1/health`
Checks backend daemon liveness and returns active mission configuration.

- **Response** `200 OK`:
  ```json
  {
    "success": true,
    "status": "ok",
    "version": "0.1.0",
    "default_collection": "spherex_qr3"
  }
  ```

### `GET /api/v1/telemetry`
Reports disk cache usage across all local science storage subsystems.

- **Response** `200 OK`:
  - `fits`: `{ count: number, size_bytes: number }`
  - `previews`: `{ count: number, size_bytes: number }`
  - `comparisons`: `{ count: number, size_bytes: number }`
  - `sources`: `{ count: number, size_bytes: number }`
  - `lightcurves`: `{ count: number, size_bytes: number }`
  - `spectra`: `{ count: number, size_bytes: number }`
  - `total_files`: Total file count.
  - `total_size_bytes`: Total storage volume in bytes.

---

## 2. Observation Discovery Endpoints

### `GET /api/v1/targets/timeline`
Discovers all SPHEREx archive observations overlapping target celestial coordinates and groups products into temporal epochs.

- **Query Parameters**:
  - `ra` (float, required): Right ascension in degrees [0, 360).
  - `dec` (float, required): Declination in degrees [-90, 90].
  - `radius` (float, required): Cone search radius in degrees (0, 1.0].
  - `collection` (string, optional): Archive collection identifier (defaults to `spherex_qr3`).
  - `bands` (list of strings, optional): Filter by SPHEREx detector (`SPHEREx-D1` through `SPHEREx-D6`).
  - `start_date` (string, optional): ISO-8601 start timestamp filter.
  - `end_date` (string, optional): ISO-8601 end timestamp filter.
- **Response** `200 OK`:
  - `target`: Target RA, Dec, and search radius.
  - `total_epochs`: Number of temporal epochs discovered.
  - `total_products`: Total number of individual FITS products.
  - `epochs`: Array of epoch groups containing product records with `observation_id`, `band`, `start_time`, `t_min_mjd`, and `exposure_time_seconds`.

### `POST /api/v1/observations/search`
Low-level cone search against the NASA/IPAC IRSA SIA2 archive.

- **Request Body**:
  ```json
  {
    "ra": 269.452083,
    "dec": 4.693333,
    "radius_deg": 0.05,
    "collection": "spherex_qr3",
    "bands": ["SPHEREx-D1"]
  }
  ```
- **Response** `200 OK`: List of matching observation metadata records.

### `GET /api/v1/observations/{observation_id}`
Retrieves parsed metadata and footprint boundaries for a single SPHEREx observation product.

---

## 3. FITS Processing & Astrometry Endpoints

### `POST /api/v1/observations/{observation_id}/cutout`
Generates a spatial FITS cutout centered on target coordinates and renders a contrast-stretched PNG preview.

- **Request Body**:
  ```json
  {
    "ra": 269.452083,
    "dec": 4.693333,
    "size": 0.05
  }
  ```
- **Response** `200 OK`:
  - `observation_id`: Source observation ID.
  - `cutout`: Object containing `fits_url`, `preview_url`, `pixel_scale_arcsec`, `wcs_projection`, and bounding box.

### `POST /api/v1/images/inspect`
Extracts and validates celestial WCS solutions, HDU metadata, and data quality planes from a SPHEREx FITS product.

- **Request Body**:
  ```json
  {
    "observation_id": "aXZvOi8vaXJzYS5pcGFj...",
    "ra": 269.452083,
    "dec": 4.693333,
    "size": 0.05
  }
  ```
- **Response** `200 OK`:
  - `wcs`: Projection type, reference pixels (CRPIX), reference sky coordinates (CRVAL), pixel scale.
  - `target_inside`: Boolean confirming whether target coordinates fall inside the pixel boundary.
  - `hdus`: Summary of all HDU extensions in the FITS container.
  - `statistics`: Pixel statistics (min, max, mean, median, stddev) for science data.

---

## 4. Differential Image Analysis Endpoints

### `POST /api/v1/images/compare`
Executes scientific pairwise image comparison between two observation epochs.

- **Request Body**:
  ```json
  {
    "observation_id_a": "aXZvOi8vaXJzYS5pcGFj..._epoch1",
    "observation_id_b": "aXZvOi8vaXJzYS5pcGFj..._epoch2",
    "ra": 269.452083,
    "dec": 4.693333,
    "size": 0.05
  }
  ```
- **Pipeline Operations**:
  1. Validates physical units and band compatibility.
  2. Resamples Epoch B onto Epoch A reference grid using flux-conserving bilinear interpolation.
  3. Measures alignment residual via 2D FFT phase-correlation.
  4. Estimates background flux and photometric scaling factor alpha.
  5. Computes difference image: D = I_B - alpha * I_A.
  6. Propagates variance plane: Var_D = Var_B + alpha^2 * Var_A.
- **Response** `200 OK`:
  - `comparison_id`: Unique identifier of comparison record.
  - `scientifically_valid`: Boolean gate indicator.
  - `quality_assessment`: Overall status (`PASS`, `WARNING`, `FAIL`) and individual check results.
  - `scale_factor`: Photometric scaling factor alpha.
  - `alignment_residual_pixels`: Sub-pixel alignment offset.
  - `difference_fits_url`: Download URL for difference FITS file.
  - `difference_preview_url`: Download URL for difference PNG preview.

### `GET /api/v1/images/comparisons/{comparison_id}`
Retrieves a previously computed differential comparison record by ID.

---

## 5. Time-Domain & Photometry Endpoints

### `POST /api/v1/targets/lightcurve`
Performs automated point-source detection and circular aperture photometry across all observation epochs matching a target position.

- **Request Body**:
  ```json
  {
    "ra": 269.452083,
    "dec": 4.693333,
    "radius_deg": 0.05,
    "cutout_size_deg": 0.1,
    "max_observations": 20,
    "bands": ["SPHEREx-D1"],
    "detection": {
      "threshold_sigma": 3.0
    }
  }
  ```
- **Response** `200 OK`:
  - `target`: Query coordinates and parameters.
  - `sources`: Array of detected source light curves. Each source includes `source_id`, mean RA/Dec, point count, Stetson J variability index, and array of photometric measurements (`time_mjd`, `flux_mjy`, `flux_err_mjy`, `band`).

### `POST /api/v1/targets/variability`
Performs target-level variability analysis across epochs, reporting amplitude variation and classification.

---

## 6. Spectral Extraction Endpoints

### `POST /api/v1/spectra/extract`
Extracts a 1D spectrum across all 102 SPHEREx spectral channels from a calibrated spectral data cube.

- **Request Body**:
  ```json
  {
    "source_id": "SRC_BARNARD_001",
    "ra": 269.452083,
    "dec": 4.693333,
    "config": {
      "spatial_method": "bilinear"
    }
  }
  ```
- **Response** `200 OK`:
  - `spectrum_id`: Generated spectrum record ID.
  - `wavelengths_microns`: Array of central channel wavelengths (0.75 to 5.00 um).
  - `flux_densities`: Extracted flux values per channel.
  - `flux_errors`: Corresponding error uncertainties.
  - `quality_flags`: Bitmask quality flags per channel.

### `POST /api/v1/spectra/compare`
Performs cross-epoch comparison between two extracted spectra.

- **Request Body**:
  ```json
  {
    "spectrum_id_a": "SPEC_001",
    "spectrum_id_b": "SPEC_002"
  }
  ```
- **Response** `200 OK`:
  - `correlation_coefficient`: Pearson correlation r between spectral vectors.
  - `mean_ratio`: Mean flux ratio between epochs.
  - `residual_spectrum`: Wavelength-by-wavelength flux residual.

---

## 7. Gaia DR3 Cross-Matching Endpoints

### `GET /api/v1/catalogs/gaia/search`
Executes an astronomical cone search against the ESA Gaia Archive TAP service.

- **Query Parameters**:
  - `ra` (float, required): ICRS Right Ascension in degrees [0, 360).
  - `dec` (float, required): ICRS Declination in degrees [-90, 90].
  - `radius_arcsec` (float, optional): Search radius in arcseconds (default 10.0, max 60.0).
  - `magnitude_limit` (float, optional): G-band brightness cutoff (`phot_g_mean_mag <= limit`).
  - `limit` (int, optional): Maximum sources returned (default 50, max 1000).
- **Response** `200 OK`:
  - `sources`: Array of Gaia DR3 records with `source_id`, `ra`, `dec`, `parallax`, `pmra`, `pmdec`, `phot_g_mean_mag`, `phot_bp_mean_mag`, and `phot_rp_mean_mag`.

### `GET /api/v1/sources/{source_id}/catalogs`
Retrieves Gaia DR3 counterparts for a detected SPHEREx source, applying proper motion propagation and reporting spherical separation and Bayesian match probability.

---

## 8. Static File Delivery

### `GET /api/v1/files/{filename}`
Serves generated FITS files and PNG previews from backend storage. Validates filename formats to prevent path-traversal attacks.
