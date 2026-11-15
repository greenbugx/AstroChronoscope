# Detailed Features

AstroChronoscope provides an end-to-end astronomical exploration platform exposing genuine scientific workflows powered by NASA SPHEREx data. The application contains no mock observations, synthetic FITS arrays, or fabricated progress states.

## 1. Landing Interface & Visualization

- **Interactive 3D Black Hole Raymarching**: Real-time relativistic raymarching canvas visualizing gravitational light bending around a Schwarzschild/Kerr black hole with accretion disk dynamics.
- **Direct Workspace Transition**: Seamless transition into the Mission Control Dashboard via the command interface button.

## 2. Mission Control Header & Telemetry

- **Mission Clock System**: Synchronized dual-clock telemetry tracking UTC and Modified Julian Date (MJD) updated on a 1-second cadence.
- **Backend Daemon Connection State**: Active heartbeat indicator reporting daemon availability, software version, default collection (`spherex_qr3`), and round-trip ping latency (RTT).
- **Active Operations Counter**: Real-time indicator displaying the number of currently executing synchronous HTTP requests across all workspaces.

## 3. Workspace 1: Discovery Tab

The Discovery workspace connects directly to NASA/IPAC IRSA to locate observation epochs across the SPHEREx mission archive.

- **Coordinate & Search Boundary Inputs**:
  - Right Ascension (RA) in decimal degrees (0 to 360).
  - Declination (Dec) in decimal degrees (-90 to +90).
  - Cone Search Radius in decimal degrees (up to 1.0 deg).
  - Cutout Size in decimal degrees.
  - Archive collection selection (`spherex_qr3`, etc.).
  - Spectral band filtering (ALL or individual SPHEREx detectors D1 through D6).
  - Observation date filtering (ISO-8601 start date and end date).
- **NASA Benchmark Target Preset Selector**:
  - One-click loading of NASA benchmark challenge targets:
    - Barnard's Star (high-proper-motion red dwarf)
    - Epsilon Indi B (brown dwarf binary system)
    - WISE 0855-0714 (extremely cold brown dwarf)
    - RW Aurigae (young stellar binary with variable disk occultations)
    - R Draconis (Mira-type pulsating variable star)
  - Detailed target metadata inspection: object classification, catalog identifiers, coordinate frame (ICRS), default search radius, and proper motion vectors.
  - Astrometric Proper Motion Propagation toggle: Computes space-motion shifted coordinates to observation epoch (e.g. J2026.5) using linear proper motion propagation.
  - Coordinate customization badge: Automatically flags when coordinates have been edited away from reference values.
- **Multi-Epoch Timeline Retrieval**:
  - Live IRSA SIA2 query returning VOTable responses mapped into normalized observation products.
  - Products grouped into temporal epochs based on observation identifiers (`obs_id`).
  - Table displaying observation ID, detector band, observation timestamp, MJD, and exposure time.
  - Action buttons to immediately route products to downstream workspaces:
    - Route product to Image Explorer.
    - Set product as Epoch A (reference) in Differential Analysis.
    - Set product as Epoch B (target) in Differential Analysis.

## 4. Workspace 2: Image Explorer Tab

The Image Explorer workspace provides deep astrometric inspection and visual rendering of genuine SPHEREx FITS images.

- **Product Selection**: Dropdown menu containing all products identified during target discovery.
- **FITS Cutout Retrieval & Interactive Viewer**:
  - Retrieval of spatial FITS cutouts from IRSA IBE or local archive cache.
  - Percentile-based contrast stretch modes: Linear, Logarithmic, Square Root, and Asinh (hyperbolic arcsine).
  - Scientific colormap palettes: Grayscale, Inferno, Viridis, Magma, and Plasma.
  - Color inversion toggle for high-contrast inspection.
  - Interactive pan and zoom controls with coordinate readout on cursor hover.
  - Direct download links for generated full-resolution PNG previews and authoritative FITS files.
- **Astrometric WCS Inspection**:
  - Extraction and validation of celestial World Coordinate System (WCS) headers using Astropy.
  - Projection code reporting (e.g. TAN, TAN-SIP with polynomial distortions).
  - Pixel scale reporting in arcseconds per pixel.
  - Reference point coordinates (CRPIX1, CRPIX2, CRVAL1, CRVAL2).
  - Target-in-footprint verification: Confirms whether target RA/Dec falls strictly within image pixel bounds.
- **Header Data Unit (HDU) & Quality Inspection**:
  - Primary and extension HDU table listing extension names, dimensions (NAXIS1 x NAXIS2), and data types.
  - Pixel statistics calculation: Minimum, maximum, mean, median, standard deviation, and valid pixel counts.
  - Quality mask interpretation: Summary of invalid, saturated, or flagged pixels from FITS data arrays.

## 5. Workspace 3: Differential Analysis Tab

The Differential Analysis workspace compares two SPHEREx observations of the same celestial target taken at different epochs to identify time-domain transients or flux changes.

- **Epoch Selection & Preview Verification**:
  - Epoch A (Reference) selection with metadata and thumbnail preview.
  - Epoch B (Target) selection with metadata and thumbnail preview.
- **Scientific Image Reprojection & Subtraction**:
  - Bilinear or nearest-neighbor reprojection of Epoch B onto Epoch A's reference WCS coordinate grid.
  - Alignment residual measurement via Fast Fourier Transform (FFT) phase-correlation (measured to sub-pixel accuracy).
  - Background estimation and photometric scaling.
  - Difference image computation: D = Epoch_B - alpha * Epoch_A.
  - Variance and error propagation: Calculation of resulting variance array for difference image pixels.
- **Scientific Quality Gate**:
  - Explicit checks for physical units compatibility, sky coverage overlap, alignment residual tolerance, and Point Spread Function (PSF) compatibility.
  - Validates overall scientific integrity: difference images are marked as PASS, WARNING, or FAIL.
- **Three-Way Comparison Viewer**:
  - Visual switching or side-by-side comparison between Reference Epoch A, Reprojected Epoch B, and Difference Image.
  - Residual flux statistics: Peak residual, RMS noise, and fractional flux change.
  - File retrieval for difference image FITS products and rendered preview images.

## 6. Workspace 4: Time-Domain Analysis Tab

The Time-Domain Analysis workspace provides aperture photometry, light curve analysis, 1D spectral extraction, and Gaia DR3 cross-matching.

- **Multi-Epoch Aperture Photometry & Light Curves**:
  - Configurable source detection threshold (sigma multiplier above background).
  - Configurable maximum observation count and detector band filtering.
  - Automated point source detection on multi-epoch cutouts.
  - Circular aperture photometry with local background annulus subtraction.
  - Photometric light curve plotting: Flux (mJy) or surface brightness versus observation time (MJD).
  - Variability metric calculation: Stetson J variability index, mean flux, flux range, standard deviation, and variability classification (STEADY, CANDIDATE, VARIABLE).
- **1D Spectral Cube Extraction & Cross-Epoch Comparison**:
  - Extraction of 1D spectra across SPHEREx 102 spectral channels spanning 0.75 to 5.00 micrometers.
  - Spatial interpolation methods: Bilinear interpolation or nearest-neighbor sampling.
  - Spectrum extraction by source ID or celestial coordinates (RA/Dec).
  - Spectrum plotting: Wavelength (micrometers) versus Flux Density with error bars and invalid-channel indicators.
  - Cross-epoch spectral comparison: Normalization, wavelength grid alignment, Pearson correlation coefficient calculation, and residual spectrum plotting.
- **Gaia DR3 Integration & Astrometric Cross-Matching**:
  - Live TAP cone search against the European Space Agency (ESA) Gaia Archive.
  - Retrieval of Gaia DR3 astrometric and photometric parameters: source ID, RA, Dec, parallax, proper motion in RA/Dec, and G/BP/RP magnitudes.
  - Cross-matching SPHEREx detected sources with Gaia counterparts using great-circle spherical separation and positional error bounds.
  - Proper motion epoch propagation to the SPHEREx observation epoch.
  - Match classification: MATCHED, AMBIGUOUS, or UNMATCHED with Bayesian match probability.

## 7. Workspace 5: Scientific Reports Tab

The Scientific Reports workspace compiles analytical outputs from all workspaces into an audit-ready astronomical research report.

- **Executive Target Summary**: Coordinates, benchmark target classification, search radius, and observation counts.
- **Multi-Epoch Discovery Summary**: Discovered epochs, date ranges, and detector coverage.
- **Astrometric Quality Assessment**: WCS solution parameters, pixel scales, and footprint validations.
- **Differential Subtraction Findings**: Photometric scaling factor, residual RMS, and quality gate status.
- **Time-Domain & Photometric Results**: Detected source counts, aperture photometry parameters, and Stetson variability indices.
- **Spectral Analysis Section**: Extracted spectrum channels, wavelength coverage, and cross-epoch correlation metrics.
- **Gaia DR3 Cross-Match Audit**: Candidate counterparts, separation in arcseconds, and proper motion vectors.
- **Provenance & Reproducibility Ledger**: Cryptographic checksums of input files, software environment versions, and UTC execution timestamps.
- **Export Formats**: One-click download of the complete investigation report as structured JSON or formatted scientific text.

## 8. Workspace 6: Synchronous Operation Monitor

The Job Monitor tracks genuine synchronous HTTP requests initiated by the frontend, reflecting the request-response architecture of the FastAPI backend.

- **True Lifecycle Tracking**:
  - Valid states: RUNNING, COMPLETED, FAILED.
  - No fabricated progress percentages: uses indeterminate loading indicators during active API execution.
  - Unique frontend-generated operation identifiers (OP-0001, OP-0002, ...).
  - Accurate start timestamps, completion timestamps, and elapsed duration in milliseconds.
- **Duplicate Request Suppression**: Deduplication keys prevent redundant identical operations while a request is in flight.
- **Operation Ledger Table**:
  - Real-time table displaying operation ID, workspace origin, task name, target context (RA, Dec, Observation ID, Source ID), started timestamp, duration, and status badge.
  - Status filter buttons: ALL, RUNNING, COMPLETED, and FAILED.
  - History management: Clear Completed, Clear Failed, and Clear History controls with a 100-operation sliding window.
- **Operation Inspection Panel**:
  - Execution metadata: category, workspace, start time, end time, and duration in milliseconds.
  - Target context: coordinates, observation IDs, source IDs, and labels.
  - Fault diagnostics: error code, HTTP status, error message, and detail trace when an operation fails.
- **Observatory Storage Telemetry**:
  - Real-time disk storage breakdown: file counts and byte volumes for FITS cutouts, PNG previews, comparison files, detected sources, light curves, and spectra.
  - Computational stack environment summary: Astropy, Reproject, Photutils, and SciPy.
