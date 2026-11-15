# Scientific Pipeline & Methodologies

AstroChronoscope implements rigorous astronomical processing methodologies with explicit uncertainty propagation and scientific quality gating.

## 1. Astrometric WCS Verification

SPHEREx images utilize the FITS World Coordinate System (WCS) standard to map detector pixel coordinates (x, y) to celestial coordinates (Right Ascension, Declination) on the sky.

- **Projection Types**: Primarily gnomonic tangent projection (`TAN`) and tangent projection with Simple Imaging Polynomial distortions (`TAN-SIP`).
- **Distortion Evaluation**: SIP polynomial coefficients are extracted from FITS headers and evaluated to correct optical field distortions.
- **Pixel Scale**: Derived from the determinant of the CD matrix or CDELT values:
  `scale = sqrt(|CD1_1 * CD2_2 - CD1_2 * CD2_1|) * 3600 arcsec/deg`
- **Target Containment**: The celestial target position (RA, Dec) is converted to pixel coordinates (x, y) using `wcs_world2pix`. The target is confirmed inside the image if:
  `0 <= x < NAXIS1` and `0 <= y < NAXIS2`.

## 2. Image Reprojection & Resampling

To compare observations from different epochs, the secondary observation (Epoch B) is reprojected onto the astrometric grid and WCS coordinate system of the reference observation (Epoch A).

- **Method**: Flux-conserving bilinear interpolation.
- **Pixel Weights**: For an output pixel mapping to fractional coordinates (u, v) on the input grid:
  `w00 = (1 - du) * (1 - dv)`
  `w10 = du * (1 - dv)`
  `w01 = (1 - du) * dv`
  `w11 = du * dv`
  where `du = u - floor(u)` and `dv = v - floor(v)`.
- **Mask and Variance Propagation**:
  - If any input tap is masked, invalid, or NaN, the pixel is marked as invalid.
  - Variance is propagated through the interpolation weights:
    `Var_out = w00^2 * Var00 + w10^2 * Var10 + w01^2 * Var01 + w11^2 * Var11`
  - Zero-covariance is assumed between adjacent pixels.

## 3. Sub-Pixel Alignment Residual Measurement

Image alignment between epochs is independently evaluated using Fast Fourier Transform (FFT) phase-correlation before subtraction:

`R = F_B * conj(F_A) / |F_B * conj(F_A)|`

The cross-power spectrum `R` is transformed back to the spatial domain via inverse FFT. The location of the peak indicates the relative spatial translation between epochs.
- Alignment residuals under 0.2 pixels are evaluated as `PASS`.
- Alignment residuals between 0.2 and 0.5 pixels are flagged as `WARNING`.
- Alignment residuals exceeding 0.5 pixels produce a `FAIL` quality assessment.
- Note: Alignment offsets are purely measured and reported; coordinates are never artificially shifted.

## 4. Photometric Scaling & Difference Image Computation

When subtracting two observations, differences in exposure time, atmospheric throughput, or calibration level must be normalized using a photometric scaling factor alpha.

- **Photometric Scale Factor (alpha)**: Derived by matching median surface brightness levels between overlapping background regions:
  `alpha = Median(Epoch_B_background) / Median(Epoch_A_background)`
- **Difference Formulation**:
  `Difference = Epoch_B - alpha * Epoch_A`
- **Uncertainty Propagation**:
  `Var_Diff = Var_Epoch_B + alpha^2 * Var_Epoch_A`
- **Mask Combination**: The output mask is the bitwise OR combination of Epoch A and Epoch B quality masks.

## 5. Scientific Quality Gates

Every differential comparison evaluates four mandatory scientific criteria:
1. **Physical Units Compatibility**: Science units must match between epochs (e.g. MJy/sr).
2. **Spatial Sky Coverage**: Overlapping valid pixel area must exceed 50 percent of the cutout field.
3. **Alignment Residual Tolerance**: FFT translation residual must not exceed 0.5 pixels.
4. **PSF Compatibility**: Point Spread Function metrics (e.g. FWHM) must be consistent within tolerance.

If all critical checks evaluate to `PASS`, the comparison is declared `scientifically_valid = true`. If any check produces `FAIL` or `NOT_VERIFIED`, validity is withheld.

## 6. Circular Aperture Photometry

Photometry is measured on detected point sources across temporal epochs:

- **Source Detection**: 2D local maxima detection above a background threshold:
  `Threshold = Median(Image) + N_sigma * StdDev(Image)`
- **Aperture Photometry**:
  - Circular source aperture radius: typically 2 to 3 pixels.
  - Sky background annulus: inner radius 5 pixels, outer radius 8 pixels.
  - Net flux is computed as:
    `Net_Flux = Total_Aperture_Flux - (Aperture_Area * Background_Per_Pixel)`
  - Surface brightness (MJy/sr) is converted to flux density (mJy) using the pixel solid angle:
    `Flux_mJy = Flux_MJy_sr * Solid_Angle_sr * 1e9 mJy/MJy`

## 7. Stetson J Variability Index

The time-domain variability of detected sources is quantified using the Stetson J variability index:

`J = sum_k sgn(P_k) * sqrt(|P_k|)`

where for epoch pairs `i` and `j` (or consecutive observations):
`P_k = delta_b_i * delta_v_j`
`delta = (Flux - Mean_Flux) / Flux_Error`

- `J < 1.0`: Steady source (photometric scatter consistent with noise).
- `1.0 <= J < 2.0`: Candidate variable source.
- `J >= 2.0`: Confirmed variable source.

## 8. 1D Spectral Cube Extraction

SPHEREx produces spectral data cubes containing 102 spectral channels distributed across 6 detectors:
- Band 1: 0.75 - 1.11 um (R ~ 41)
- Band 2: 1.11 - 1.64 um (R ~ 41)
- Band 3: 1.64 - 2.42 um (R ~ 41)
- Band 4: 2.42 - 3.82 um (R ~ 35)
- Band 5: 3.82 - 4.42 um (R ~ 110)
- Band 6: 4.42 - 5.00 um (R ~ 130)

Spectra are extracted by slicing through the spatial-spectral cube at target coordinates:
- Spatial sampling: Bilinear interpolation across spatial pixels for each channel plane.
- Wavelength attribution: Central wavelengths and channel bandwidths are extracted from spectral cube WCS headers.
- Cross-epoch correlation:
  `r = Cov(S_A, S_B) / (sigma_A * sigma_B)`
  measures spectral shape consistency over time.

## 9. Gaia DR3 Cross-Matching & Epoch Propagation

SPHEREx sources are cross-matched with ESA Gaia DR3 astrometric catalog stars:

- **Epoch Propagation**: Because stars possess proper motion, Gaia catalog coordinates (epoch J2016.0) are propagated to the SPHEREx observation epoch `t_obs`:
  `RA(t_obs) = RA_0 + (pm_ra / cos(Dec_0)) * (t_obs - 2016.0)`
  `Dec(t_obs) = Dec_0 + pm_dec * (t_obs - 2016.0)`
- **Spherical Separation**: Great-circle angular distance is computed using the Vincenty or Haversine formula:
  `d = 2 * arcsin(sqrt(sin^2(dDec/2) + cos(Dec_1)*cos(Dec_2)*sin^2(dRA/2)))`
- **Positional Uncertainty Significance**: Matches are evaluated against the combined positional uncertainty:
  `sigma_total = sqrt(sigma_SPHEREx^2 + sigma_Gaia^2)`
  A candidate inside the search radius is assigned a Bayesian match p-value using a Rayleigh distribution tail.
