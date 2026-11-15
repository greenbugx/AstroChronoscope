/**
 * Planet X — SPHEREx Data Acquisition API Client
 * Type-safe interface to the NASA/IPAC IRSA SPHEREx backend.
 */

export const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/+$/, '');

export interface TargetCoordinates {
  ra: number;
  dec: number;
  frame?: 'ICRS';
}

export interface BackendHealthResponse {
  success: boolean;
  status: string;
  version: string;
  default_collection: string;
}

export interface ObservationSearchRequest {
  ra: number;
  dec: number;
  radius?: number;
  collection?: string;
  start_date?: string;
  end_date?: string;
}

export interface ObservationSummary {
  observation_id: string;
  obs_id?: string | null;
  obs_publisher_did?: string | null;
  observation_date?: string | null;
  observation_date_mjd?: number | null;
  instrument?: string | null;
  facility?: string | null;
  collection?: string | null;
  band?: string | null;
  product_type?: string | null;
  product_subtype?: string | null;
  calib_level?: number | null;
  fits_available: boolean;
}

export interface ObservationSearchResponse {
  success: boolean;
  target: TargetCoordinates;
  collection: string | null;
  total_observations: number;
  observations: ObservationSummary[];
}

export interface ObservationDetail extends ObservationSummary {
  s_ra?: number | null;
  s_dec?: number | null;
  t_min_mjd?: number | null;
  t_max_mjd?: number | null;
  start_time?: string | null;
  end_time?: string | null;
  exposure_time_seconds?: number | null;
  access_format?: string | null;
  access_estsize_bytes?: number | null;
  width?: number | null;
  height?: number | null;
  pixel_scale_arcsec?: number | null;
  fov_deg?: number | null;
  fits_access_url?: string | null;
  processing_status: 'ready' | 'no_fits_product';
}

export interface ObservationDetailResponse {
  success: boolean;
  observation: ObservationDetail;
}

export interface CutoutRequest {
  ra: number;
  dec: number;
  size?: number;
}

export interface CutoutResponse {
  success: boolean;
  observation_id: string;
  cutout: {
    fits_url: string;
    preview_url: string;
    width: number;
    height: number;
    unit: string;
  };
  wcs: {
    available: boolean;
    target_inside_image: boolean;
    pixel_x?: number | null;
    pixel_y?: number | null;
    message?: string | null;
  };
}

export interface TimelineProduct {
  observation_id?: string | null;
  obs_publisher_did?: string | null;
  obs_id?: string | null;
  band?: string | null;
  em_min_m?: number | null;
  em_max_m?: number | null;
  t_min_mjd?: number | null;
  t_max_mjd?: number | null;
  start_time?: string | null;
  end_time?: string | null;
  observation_time?: string | null;
  timeline_eligible: boolean;
  exposure_time_seconds?: number | null;
  calib_level?: number | null;
  dataproduct_type?: string | null;
  dataproduct_subtype?: string | null;
  target_name?: string | null;
  facility?: string | null;
  instrument?: string | null;
  collection?: string | null;
  fits_available: boolean;
  fits_access_url?: string | null;
  access_url_trusted: boolean;
  processing_status: 'ready' | 'no_fits_product' | 'untrusted_access_url';
  s_ra?: number | null;
  s_dec?: number | null;
  fov_deg?: number | null;
  width?: number | null;
  height?: number | null;
  pixel_scale_arcsec?: number | null;
  target_covered?: boolean | null;
  angular_distance_deg?: number | null;
  metadata_complete: boolean;
  missing_fields: string[];
  warnings: string[];
}

export interface TimelineEpoch {
  epoch_index: number;
  epoch_key: string;
  obs_id: string | null;
  identified: boolean;
  observation_time: string | null;
  start_time: string | null;
  end_time: string | null;
  midpoint_mjd: number | null;
  duration_seconds: number | null;
  timeline_eligible: boolean;
  bands: string[];
  product_count: number;
  target_covered: boolean | null;
  target_covered_products: number;
  footprint_center_ra: number | null;
  footprint_center_dec: number | null;
  footprint_fov_deg: number | null;
  facility: string | null;
  instrument: string | null;
  collection: string | null;
  products: TimelineProduct[];
  warnings: string[];
}

export interface TimelineResponse {
  success: boolean;
  target: TargetCoordinates;
  query: {
    radius_deg: number;
    collection: string;
    bands?: string[] | null;
    start_date?: string | null;
    end_date?: string | null;
  };
  total_product_rows: number;
  total_products: number;
  unique_observations: number;
  unique_epochs: number;
  earliest_observation_time: string | null;
  latest_observation_time: string | null;
  temporal_baseline_days: number | null;
  available_bands: string[];
  band_counts: Record<string, number>;
  epochs: TimelineEpoch[];
  quality: {
    total_product_rows: number;
    products_included: number;
    duplicate_products_removed: number;
    products_with_valid_timestamps: number;
    products_without_valid_timestamps: number;
    products_with_band: number;
    products_without_band: number;
    products_with_spatial_metadata: number;
    products_without_spatial_metadata: number;
    products_target_covered: number;
    products_target_outside: number;
    products_target_coverage_unknown: number;
    products_missing_identifier: number;
    inconsistent_epochs: number;
    metadata_complete_products: number;
    metadata_incomplete_products: number;
  };
  warnings: Array<{ code: string; message: string; count: number }>;
  metadata: {
    time_standard: string;
    time_format: string;
    timestamp_source: string;
    observation_time_definition: string;
    epoch_grouping: string;
    frame: string;
    comparability_assessed: boolean;
    comparability_note: string;
  };
}

export interface TimelineQueryParams {
  ra: number;
  dec: number;
  radius?: number;
  collection?: string;
  bands?: string[];
  start_date?: string;
  end_date?: string;
}

export interface InspectRequest {
  observation_id: string;
  ra?: number;
  dec?: number;
  size?: number;
}

export interface InspectResponse {
  success: boolean;
  inspection: Record<string, unknown>;
}

export interface CompareRequest {
  observation_id_a: string;
  observation_id_b: string;
  ra: number;
  dec: number;
  size?: number;
  config?: {
    background_correction?: 'none' | 'median';
    photometric_scaling?: 'none' | 'median_ratio';
    psf_matching?: 'none' | 'gaussian';
    reference?: 'first' | 'second';
    interpolation?: 'bilinear' | 'nearest';
  };
}

export interface DifferenceProduct {
  fits_url: string;
  preview_url: string | null;
  uncertainty_url?: string | null;
  mask_url?: string | null;
  width: number;
  height: number;
  unit?: string | null;
  uncertainty_available: boolean;
  uncertainty_valid_fraction?: number | null;
  uncertainty_note: string;
  statistics: {
    finite_fraction: number;
    valid_fraction: number;
    min?: number | null;
    max?: number | null;
    mean?: number | null;
    median?: number | null;
    std?: number | null;
    sum?: number | null;
  };
}

export interface ComparisonCheckResult {
  name: string;
  status: 'PASS' | 'WARNING' | 'FAIL' | 'NOT_VERIFIED';
  critical: boolean;
  message: string;
  details?: Record<string, unknown> | null;
}

export interface ComparisonResponse {
  success: boolean;
  comparison_id: string;
  status: 'completed' | 'rejected';
  scientifically_valid: boolean;
  comparability_assessed: boolean;
  target: TargetCoordinates;
  difference?: DifferenceProduct | null;
  quality?: {
    overall_status: 'PASS' | 'WARNING' | 'FAIL' | 'NOT_VERIFIED';
    checks: ComparisonCheckResult[];
    critical_checks: string[];
    failed_checks: string[];
    unverified_checks: string[];
    warnings: string[];
  };
  metadata?: {
    size_deg: number;
    difference_model: string;
    note: string;
  };
}

// ------------------------------------------------------------------
// Phase 3: Source Detection, Aperture Photometry & Light Curves
// ------------------------------------------------------------------

export type SourceQuality = 'PASS' | 'WARNING' | 'FAIL' | 'NOT_VERIFIED';

export interface DetectionConfig {
  threshold_sigma?: number;
  min_area_px?: number;
  max_sources?: number;
  filter_fwhm_px?: number;
  edge_margin_px?: number;
  background_mesh?: number;
  deblend?: boolean;
}

export interface DetectionRequest {
  observation_id: string;
  ra?: number;
  dec?: number;
  size?: number;
  config?: DetectionConfig;
}

export interface DetectedSource {
  detection_id: string;
  source_id?: string | null;
  x: number;
  y: number;
  ra_deg?: number | null;
  dec_deg?: number | null;
  peak_value?: number | null;
  source_area: number;
  centroid_x: number;
  centroid_y: number;
  detection_snr?: number | null;
  centroid_error_px?: number | null;
  centroid_error_arcsec?: number | null;
  fwhm_px?: number | null;
  fwhm_arcsec?: number | null;
  ellipticity?: number | null;
  orientation_deg?: number | null;
  background_level?: number | null;
  noise_sigma?: number | null;
  blended: boolean;
  flags: string[];
  quality: SourceQuality;
}

export interface DetectionResponse {
  success: boolean;
  observation_id: string;
  source: 'cutout' | 'product';
  source_url?: string | null;
  target?: TargetCoordinates | null;
  size_deg?: number | null;
  detections: DetectedSource[];
  total_detections: number;
  truncated: boolean;
  quality: {
    overall_status: SourceQuality;
    warnings: string[];
  };
}

export interface PhotometryConfig {
  aperture_fwhm_factor?: number;
  annulus_inner_factor?: number;
  annulus_outer_factor?: number;
  aperture_oversample?: number;
  min_valid_fraction?: number;
}

export interface PhotometryRequest {
  observation_id: string;
  ra?: number;
  dec?: number;
  size?: number;
  detection?: DetectionConfig;
  config?: PhotometryConfig;
}

export interface FluxMeasurement {
  detection_id: string;
  observation_id: string;
  obs_publisher_did?: string | null;
  band?: string | null;
  observation_time?: string | null;
  time_mjd?: number | null;
  x: number;
  y: number;
  ra_deg?: number | null;
  dec_deg?: number | null;
  centroid_error_px?: number | null;
  centroid_error_arcsec?: number | null;
  aperture_radius_px: number;
  aperture_radius_arcsec?: number | null;
  aperture_valid_fraction: number;
  psf_fwhm_px: number;
  flux_mjy?: number | null;
  flux_jy?: number | null;
  flux_jy_error?: number | null;
  snr?: number | null;
  quality: SourceQuality;
  flags: string[];
}

export interface PhotometryResponse {
  success: boolean;
  observation_id: string;
  measurements: FluxMeasurement[];
  total_measurements: number;
  quality: {
    overall_status: SourceQuality;
    warnings: string[];
  };
}

export interface LightCurvePoint {
  time_utc?: string | null;
  time_mjd?: number | null;
  flux_jy: number;
  flux_jy_error?: number | null;
  unit: string;
  band?: string | null;
  observation_id: string;
  detection_id: string;
  snr?: number | null;
  quality: SourceQuality;
  flags: string[];
}

export interface VariabilityMetrics {
  algorithm_version: string;
  status: 'computed' | 'insufficient_data' | 'undefined_uncertainties';
  unit: string;
  n_points: number;
  mean_flux_jy?: number | null;
  median_flux_jy?: number | null;
  weighted_mean_flux_jy?: number | null;
  sample_std_jy?: number | null;
  mad_jy?: number | null;
  robust_sigma_jy?: number | null;
  fractional_variability?: number | null;
  chi2?: number | null;
  dof?: number | null;
  reduced_chi2?: number | null;
  chi2_pvalue?: number | null;
  peak_to_peak_jy?: number | null;
  robust_range_jy?: number | null;
  min_flux_jy?: number | null;
  max_flux_jy?: number | null;
  temporal_baseline_days?: number | null;
  max_gap_days?: number | null;
  flags: string[];
}

export interface LightCurveSeries {
  band?: string | null;
  points: LightCurvePoint[];
  expected_epochs: number;
  non_detections: number;
  metrics: VariabilityMetrics;
}

export interface SourceLightCurve {
  source_id: string;
  reference_ra_deg: number;
  reference_dec_deg: number;
  epoch_count: number;
  bands: string[];
  position_scatter_arcsec?: number | null;
  series: LightCurveSeries[];
  flags: string[];
}

export interface TargetLightCurveRequest {
  ra: number;
  dec: number;
  radius_deg?: number;
  cutout_size_deg?: number;
  collection?: string;
  bands?: string[];
  start_date?: string;
  end_date?: string;
  max_observations?: number;
  detection?: DetectionConfig;
  photometry?: PhotometryConfig;
}

export interface TargetLightCurveResponse {
  success: boolean;
  target: TargetCoordinates;
  epochs_considered: number;
  epochs_processed: number;
  products_processed: number;
  sources: SourceLightCurve[];
  failures: Array<{ epoch_key?: string; observation_id?: string; band?: string; code: string; message: string }>;
  warnings: string[];
}

export interface SourceDetailResponse {
  success: boolean;
  source: {
    source_id: string;
    reference_ra_deg: number;
    reference_dec_deg: number;
    detection_count: number;
    epoch_count: number;
    bands: string[];
    flags: string[];
  };
}

export interface ApiErrorPayload {
  code: string;
  message: string;
  details?: unknown;
}

export class ApiError extends Error {
  code: string;
  status: number;
  details?: unknown;

  constructor(status: number, error: ApiErrorPayload) {
    super(error.message || `API Request failed with status ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.code = error.code || 'UNKNOWN_ERROR';
    this.details = error.details;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
  const headers = new Headers(options.headers);
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorData: ApiErrorPayload = {
      code: `HTTP_${response.status}`,
      message: `Request failed with status ${response.status}`,
    };
    try {
      const json = await response.json();
      if (json && json.error) {
        errorData = json.error;
      }
    } catch {
      // Non-JSON response
    }
    throw new ApiError(response.status, errorData);
  }

  return response.json();
}

/** Check connectivity to root backend endpoint */
export async function checkBackend(): Promise<{ message: string }> {
  return request<{ message: string }>('/');
}

/** Get structured backend health and SPHEREx collection info */
export async function getBackendHealth(): Promise<BackendHealthResponse> {
  return request<BackendHealthResponse>('/api/v1/health');
}

/** Search IRSA for SPHEREx observations matching cone and filters */
export async function searchObservations(payload: ObservationSearchRequest): Promise<ObservationSearchResponse> {
  return request<ObservationSearchResponse>('/api/v1/observations/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

/** Get cached or retrieved metadata for a specific observation */
export async function getObservation(observationId: string): Promise<ObservationDetailResponse> {
  return request<ObservationDetailResponse>(`/api/v1/observations/${encodeURIComponent(observationId)}`);
}

/** Create spatial FITS cutout and generate PNG preview */
export async function createCutout(observationId: string, payload: CutoutRequest): Promise<CutoutResponse> {
  return request<CutoutResponse>(`/api/v1/observations/${encodeURIComponent(observationId)}/cutout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

/** Query multi-epoch target timeline from IRSA */
export async function getTargetTimeline(params: TimelineQueryParams): Promise<TimelineResponse> {
  const searchParams = new URLSearchParams();
  searchParams.set('ra', params.ra.toString());
  searchParams.set('dec', params.dec.toString());
  if (params.radius !== undefined) searchParams.set('radius', params.radius.toString());
  if (params.collection) searchParams.set('collection', params.collection);
  if (params.start_date) searchParams.set('start_date', params.start_date);
  if (params.end_date) searchParams.set('end_date', params.end_date);
  if (params.bands && params.bands.length > 0) {
    for (const b of params.bands) {
      searchParams.append('bands', b);
    }
  }

  return request<TimelineResponse>(`/api/v1/targets/timeline?${searchParams.toString()}`);
}

/** Inspect a FITS product HDUs, WCS and image statistics */
export async function inspectImage(payload: InspectRequest): Promise<InspectResponse> {
  return request<InspectResponse>('/api/v1/images/inspect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

/** Compare two SPHEREx epochs on a common grid */
export async function compareImages(payload: CompareRequest): Promise<ComparisonResponse> {
  return request<ComparisonResponse>('/api/v1/images/compare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

/** Retrieve an existing comparison record */
export async function getComparison(comparisonId: string): Promise<ComparisonResponse> {
  return request<ComparisonResponse>(`/api/v1/images/comparisons/${encodeURIComponent(comparisonId)}`);
}

/** Detect compact sources in one SPHEREx epoch product */
export async function detectSources(payload: DetectionRequest): Promise<DetectionResponse> {
  return request<DetectionResponse>('/api/v1/sources/detect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

/** Measure aperture photometry for detected sources in an epoch */
export async function measurePhotometry(payload: PhotometryRequest): Promise<PhotometryResponse> {
  return request<PhotometryResponse>('/api/v1/sources/photometry', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

/** Generate cross-epoch light curves with variability metrics */
export async function getTargetLightCurve(payload: TargetLightCurveRequest): Promise<TargetLightCurveResponse> {
  return request<TargetLightCurveResponse>('/api/v1/targets/lightcurve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

/** Retrieve a persisted source catalog record */
export async function getSource(sourceId: string): Promise<SourceDetailResponse> {
  return request<SourceDetailResponse>(`/api/v1/sources/${encodeURIComponent(sourceId)}`);
}

export interface StorageDirectoryTelemetry {
  count: number;
  size_bytes: number;
}

export interface StorageTelemetryResponse {
  success: boolean;
  status: string;
  version: string;
  default_collection: string;
  sia_endpoint: string;
  storage: {
    fits: StorageDirectoryTelemetry;
    previews: StorageDirectoryTelemetry;
    comparisons: StorageDirectoryTelemetry;
    sources: StorageDirectoryTelemetry;
    lightcurves: StorageDirectoryTelemetry;
    spectra?: StorageDirectoryTelemetry;
    total_files: number;
    total_size_bytes: number;
  };
}

// =============================================================================
// PHASE 4: SPHEREx DR1 Spectral Cube Contracts
// =============================================================================

export type SpectralQuality = "PASS" | "WARNING" | "FAIL" | "NOT_VERIFIED";
export type WavelengthUnit = "um";
export type FluxUnit = "MJy/sr";
export type FluxKind = "surface_brightness";

export interface SpectralExtractionConfig {
  spatial_method?: "bilinear" | "nearest";
}

export interface SpectralExtractionRequest {
  source_id?: string;
  ra?: number;
  dec?: number;
  collection?: string;
  config?: SpectralExtractionConfig;
}

export interface SpectralChannel {
  index: number;
  detector?: number | null;
  subchan?: number | null;
  wavelength_um?: number | null;
  wl_min_um?: number | null;
  wl_max_um?: number | null;
  bandwidth_um?: number | null;
  resolving_power?: number | null;
  flux_mjy_sr?: number | null;
  uncertainty_mjy_sr?: number | null;
  nhits?: number | null;
  flags?: number | null;
  flags_applied: string[];
  quality: SpectralQuality;
}

export interface SpectralQualitySummary {
  overall_status: SpectralQuality;
  uncertainty_status: SpectralQuality;
  warnings: string[];
}

export interface Spectrum {
  spectrum_id: string;
  source_id?: string | null;
  product_type: "spherex_dr1_all_sky_cube";
  collection: string;
  product_id: string;
  obs_id?: string | null;
  obs_publisher_did?: string | null;
  ra_deg: number;
  dec_deg: number;
  pixel_x?: number | null;
  pixel_y?: number | null;
  wavelength_unit: WavelengthUnit;
  flux_unit: FluxUnit;
  flux_kind: FluxKind;
  extraction_method: "cube_point_extraction";
  channel_count: number;
  valid_channel_count: number;
  blank_channels: number[];
  wavelength_min_um?: number | null;
  wavelength_max_um?: number | null;
  channels: SpectralChannel[];
  quality: SpectralQualitySummary;
  limitations: string[];
}

export interface SpectralProvenance {
  created_at: string;
  software: Record<string, string>;
  algorithm: string;
  algorithm_version: string;
  collection: string;
  access_url: string;
  fits_sha256: string;
  npix?: number | null;
  order?: number | null;
  config: Record<string, unknown>;
}

export interface SpectralExtractionResponse {
  success: true;
  spectrum: Spectrum;
  provenance: SpectralProvenance;
}

export interface SpectralComparisonConfig {
  min_overlap_channels?: number;
  wavelength_tolerance_um?: number;
}

export interface SpectralComparisonRequest {
  spectrum_id_a: string;
  spectrum_id_b: string;
  config?: SpectralComparisonConfig;
}

export interface SpectralComparisonChannel {
  index_a: number;
  index_b: number;
  wavelength_um?: number | null;
  flux_a_mjy_sr?: number | null;
  flux_b_mjy_sr?: number | null;
  difference_mjy_sr?: number | null;
  ratio?: number | null;
  quality: SpectralQuality;
}

export interface SpectralComparison {
  spectrum_id_a: string;
  spectrum_id_b: string;
  product_id_a?: string | null;
  product_id_b?: string | null;
  comparison_basis:
    | "same_spectrum"
    | "same_product_static_mosaic"
    | "different_products_static_mosaic"
    | "unknown";
  grid_compatible: boolean;
  wavelength_unit: WavelengthUnit;
  flux_unit: FluxUnit;
  overlap_channel_count: number;
  channels: SpectralComparisonChannel[];
  quality: SpectralQualitySummary;
  warnings: string[];
  limitations: string[];
  algorithm_version: string;
  created_at?: string | null;
}

export interface SpectralComparisonResponse {
  success: true;
  comparison: SpectralComparison;
}

export interface SpectralSummary {
  spectrum_id: string;
  source_id?: string | null;
  collection: string;
  product_id: string;
  ra_deg: number;
  dec_deg: number;
  valid_channel_count: number;
  channel_count: number;
  wavelength_min_um?: number | null;
  wavelength_max_um?: number | null;
  quality: SpectralQuality;
  created_at: string;
}

export interface SourceSpectraResponse {
  success: true;
  source_id: string;
  spectra: SpectralSummary[];
}

/** Extract a calibrated 102-channel 1D spectrum from SPHEREx DR1 all-sky cube at coordinates or source */
export async function extractSpectrum(payload: SpectralExtractionRequest): Promise<SpectralExtractionResponse> {
  return request<SpectralExtractionResponse>('/api/v1/spectra/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

/** Compare two extracted cube spectra on matched wavelength grid */
export async function compareSpectra(payload: SpectralComparisonRequest): Promise<SpectralComparisonResponse> {
  return request<SpectralComparisonResponse>('/api/v1/spectra/compare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

/** Retrieve a persisted spectrum record by ID */
export async function getSpectrum(spectrumId: string): Promise<SpectralExtractionResponse> {
  return request<SpectralExtractionResponse>(`/api/v1/spectra/${encodeURIComponent(spectrumId)}`);
}

/** Retrieve all cube spectra associated with a source */
export async function getSourceSpectra(sourceId: string): Promise<SourceSpectraResponse> {
  return request<SourceSpectraResponse>(`/api/v1/sources/${encodeURIComponent(sourceId)}/spectra`);
}

/** Retrieve observatory storage and cache telemetry */
export async function getStorageTelemetry(): Promise<StorageTelemetryResponse> {
  return request<StorageTelemetryResponse>('/api/v1/telemetry');
}

// ------------------------------------------------------------------
// Phase 5: Gaia DR3 Integration & Cross-Matching
// ------------------------------------------------------------------

export type MatchStatus = "MATCHED" | "AMBIGUOUS" | "UNMATCHED";

export interface GaiaProvenance {
  catalog: string;
  retrieved_at: string;
  query_reference?: string | null;
  tap_endpoint: string;
}

export interface GaiaCoordinates {
  ra: number;
  dec: number;
  reference_epoch: number;
  ra_error_mas?: number | null;
  dec_error_mas?: number | null;
}

export interface GaiaAstrometry {
  parallax_mas?: number | null;
  parallax_error_mas?: number | null;
  pmra_mas_yr?: number | null;
  pmdec_mas_yr?: number | null;
  pmra_error_mas_yr?: number | null;
  pmdec_error_mas_yr?: number | null;
  ruwe?: number | null;
  ruwe_note?: string;
}

export interface GaiaPhotometry {
  g?: number | null;
  bp?: number | null;
  rp?: number | null;
}

export interface GaiaSource {
  catalog: string;
  source_id: string;
  coordinates: GaiaCoordinates;
  astrometry: GaiaAstrometry;
  photometry: GaiaPhotometry;
  provenance: GaiaProvenance;
}

export interface GaiaConeSearchMetadata {
  ra: number;
  dec: number;
  radius_arcsec: number;
  magnitude_limit?: number | null;
  limit: number;
  total_found: number;
  truncated: boolean;
}

export interface GaiaConeSearchResponse {
  success: true;
  catalog: string;
  query: GaiaConeSearchMetadata;
  sources: GaiaSource[];
  separations_arcsec: number[];
}

export interface CrossMatchTarget {
  external_id: string;
  ra: number;
  dec: number;
  epoch?: number | null;
  uncertainty_arcsec?: number | null;
}

export interface CrossMatchCandidate {
  separation_arcsec: number;
  separation_propagated_arcsec?: number | null;
  source: GaiaSource;
}

export interface CrossMatchEpochInfo {
  requested_epoch?: number | null;
  gaia_reference_epoch: number;
  propagated: boolean;
  propagated_ra?: number | null;
  propagated_dec?: number | null;
  limitation?: string | null;
}

export interface CrossMatchResult {
  external_id: string;
  status: MatchStatus;
  candidates: CrossMatchCandidate[];
  best?: CrossMatchCandidate | null;
  ambiguity_note?: string | null;
  epoch: CrossMatchEpochInfo;
}

export interface CrossMatchConfig {
  radius_arcsec?: number;
  ambiguous_when_more_than?: number;
  propagate_proper_motion?: boolean;
  propagation_margin_arcsec?: number;
}

export interface CrossMatchRequest {
  coordinates: CrossMatchTarget[];
  config?: CrossMatchConfig;
}

export interface CrossMatchResponse {
  success: true;
  catalog: string;
  config: CrossMatchConfig;
  results: CrossMatchResult[];
  matched: number;
  ambiguous: number;
  unmatched: number;
}

export interface GaiaSourceResponse {
  success: true;
  source: GaiaSource;
}

export interface GaiaAssociationCandidate {
  gaia_source_id: string;
  separation_arcsec: number;
  separation_propagated_arcsec?: number | null;
  source: GaiaSource;
}

export interface GaiaAssociationSignificance {
  method: string;
  assumptions: string[];
  phase3_sigma_arcsec?: number | null;
  gaia_sigma_arcsec?: number | null;
  combined_sigma_arcsec?: number | null;
  normalized_separation?: number | null;
  match_p_value?: number | null;
  limitation?: string | null;
}

export interface GaiaAssociationEpoch {
  julian_year?: number | null;
  basis?: string | null;
  detection_count: number;
  limitation?: string | null;
}

export interface SourceGaiaAssociationResponse {
  success: true;
  planetx_source_id: string;
  reference_ra_deg: number;
  reference_dec_deg: number;
  status: MatchStatus;
  candidates: GaiaAssociationCandidate[];
  best?: GaiaAssociationCandidate | null;
  ambiguity_note?: string | null;
  config: CrossMatchConfig;
  observation_epoch: GaiaAssociationEpoch;
  propagation: CrossMatchEpochInfo;
  significance: GaiaAssociationSignificance;
  phase3?: Record<string, unknown> | null;
  provenance?: GaiaProvenance | null;
}

export interface BandVariability {
  band?: string | null;
  expected_epochs: number;
  non_detections: number;
  metrics: VariabilityMetrics;
}

export interface SourceVariability {
  source_id: string;
  reference_ra_deg: number;
  reference_dec_deg: number;
  epoch_count: number;
  bands: string[];
  position_scatter_arcsec?: number | null;
  band_metrics: BandVariability[];
  flags: string[];
}

export interface SourceVariabilityResponse {
  success: true;
  source: SourceVariability;
}

export interface TargetVariabilityResponse {
  success: true;
  target: TargetCoordinates;
  epochs_considered: number;
  epochs_processed: number;
  products_processed: number;
  sources: SourceVariability[];
  warnings: string[];
}

/** Search Gaia DR3 cone around coordinates */
export async function searchGaia(params: {
  ra: number;
  dec: number;
  radius_arcsec?: number;
  magnitude_limit?: number;
  limit?: number;
}): Promise<GaiaConeSearchResponse> {
  const query = new URLSearchParams({
    ra: params.ra.toString(),
    dec: params.dec.toString(),
  });
  if (params.radius_arcsec != null) query.set('radius_arcsec', params.radius_arcsec.toString());
  if (params.magnitude_limit != null) query.set('magnitude_limit', params.magnitude_limit.toString());
  if (params.limit != null) query.set('limit', params.limit.toString());

  return request<GaiaConeSearchResponse>(`/api/v1/catalogs/gaia/search?${query.toString()}`);
}

/** Cross-match external coordinates against Gaia DR3 with proper motion propagation */
export async function crossmatchGaia(payload: CrossMatchRequest): Promise<CrossMatchResponse> {
  return request<CrossMatchResponse>('/api/v1/catalogs/gaia/crossmatch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

/** Retrieve exact Gaia DR3 record by source ID */
export async function getGaiaSource(sourceId: string): Promise<GaiaSourceResponse> {
  return request<GaiaSourceResponse>(`/api/v1/catalogs/gaia/${encodeURIComponent(sourceId)}`);
}

/** Retrieve Gaia DR3 association for a persisted Planet X source */
export async function getSourceGaiaAssociation(sourceId: string): Promise<SourceGaiaAssociationResponse> {
  return request<SourceGaiaAssociationResponse>(`/api/v1/sources/${encodeURIComponent(sourceId)}/catalogs`);
}

/** Retrieve variability evidence for a persisted source */
export async function getSourceVariability(sourceId: string): Promise<SourceVariabilityResponse> {
  return request<SourceVariabilityResponse>(`/api/v1/sources/${encodeURIComponent(sourceId)}/variability`);
}

/** Retrieve target-level variability summary */
export async function getTargetVariability(payload: TargetLightCurveRequest): Promise<TargetVariabilityResponse> {
  return request<TargetVariabilityResponse>('/api/v1/targets/variability', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

/** Helper to convert backend file paths into absolute URLs */
export function getFileUrl(path: string): string {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}
