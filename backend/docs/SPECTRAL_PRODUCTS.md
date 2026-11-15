# SPHEREx Spectral Products — Phase 4 Investigation

**Date:** 2026-11-15
**Target used for all live checks:** RA `156.09328159`, Dec `-41.64466331` (ICRS)
**Method:** live IRSA SIA2 queries, one QR3 spectral-image cutout, one DR1 all-sky cube tile inspected with HTTP range reads plus `astropy.io.fits`.

This document records what the archive actually provides. It is the gate for the Phase 4
implementation, not a substitute for the SPHEREx Explanatory Supplement.

---

## 1. Product inventory relevant to Phase 4

SPHEREx has **no native per-source spectrum product** in the Quick Release or DR1
collections. The two public product families that contain spectral information are:

| Product | SIA2 collection | Type | What it contains |
|---|---|---|---|
| DR1 All-Sky Cube | `spherex_dr1_cube` | `cube` | 512 × 512 × 102 surface-brightness cube per HEALPix tile |
| DR1 / QR3 Spectral Image MEF | `spherex_dr1`, `spherex_qr3` (+ `_deep`) | `image` | one 2040 × 2040 detector image per band, with a pixel → wavelength lookup |

Calibration products (Spectral WCS `CWAVE`/`CBAND`, solid angle map, gain matrix, etc.)
are **not available through SIA2**. They are published in the browsable IRSA directories
(`https://irsa.ipac.caltech.edu/ibe/data/spherex/`). Only the cube and the spectral-image
MEFs are queryable through the existing SIA2 client.

The current backend default collection is `spherex_qr3`. Phase 4 must query
`spherex_dr1_cube` explicitly for spectra; the imaging default is unchanged.

---

## 2. DR1 All-Sky Cube — verified format

### 2.1 Live SIA2 row

```
COLLECTION=spherex_dr1_cube
POS=CIRCLE 156.09328159 -41.64466331 0.01
```

Returned one genuine row:

| Field | Value |
|---|---|
| `dataproduct_type` | `cube` |
| `obs_id` | `hips5_cube-hips_20261026` |
| `obs_publisher_did` | `ivo://irsa.ipac/spherex_dr1_cube?hips5_cube-hips_20261026/9621` |
| `access_url` | `https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/hips5_cube/hips_20261026/Norder5/Dir0/Npix9621_cube.fits` |
| `access_estsize` | `320910` (KB in the SIA2 response; see file size below) |
| `s_xel1`, `s_xel2` | `512`, `512` |
| `s_pixel_scale` | `12.880` arcsec |
| `em_min`, `em_max` | `7.455e-07` m, `5.0096e-06` m |
| `s_region` | HEALPix order-5 tile polygon around the target |
| `t_min`, `t_max` | `60789.848`, `61174.4729` MJD |
| `calib_level` | `3` |

The file is **320,909,760 bytes** (306 MiB) on the archive. The existing
`MAX_DOWNLOAD_BYTES = 256 MiB` would reject it, so Phase 4 needs a separate spectral
download cap and a streaming/memory-mapped read path.

The cube is a **static mosaic**, not an epoch. `t_min`/`t_max` span the survey input
range; the cube must never be presented as a time-resolved spectrum.

### 2.2 HDUs

The file is uncompressed, big-endian FITS:

| HDU | EXTNAME | Shape | dtype | BUNIT |
|---|---|---|---|---|
| 1 | `IMAGE` | 512 × 512 × 102 | `float32` | `MJy/sr` |
| 2 | `NHITS` | 512 × 512 × 102 | `int32` | `count` |
| 3 | `FLAGS` | 512 × 512 × 102 | `int32` | — |
| 4 | `SPECTRAL_CHANNELS` | 102-row BINTABLE | — | — |
| 5 | `WCS-WAVE` | 1-row BINTABLE | — | — |

There is **no `VARIANCE` extension**, no `ZODI` extension (the cube is delivered with
the zodiacal model already subtracted), and no mask plane other than `FLAGS`.

Data offsets, useful for range-based reads or validation:

```
IMAGE data start             8,640
NHITS data start       106,971,840
FLAGS data start       213,940,800
SPECTRAL_CHANNELS hdr  320,898,240
```

Each plane is `512 * 512 * 4 = 1,048,576` bytes.

### 2.3 Celestial WCS

The `IMAGE` header carries a 3-D WCS:

```
CTYPE1 = RA---HPX, CTYPE2 = DEC--HPX, CTYPE3 = WAVE-TAB
ORDER  = 5, NPIX = 9621
```

`WAVE-TAB` makes Astropy require the `WCS-WAVE` extension. For the celestial
transform, rebuild a 2-D header from `CTYPE1/2`, `CRVAL1/2`, `CRPIX1/2`,
`PC1_1/PC1_2/PC2_1/PC2_2`, `CDELT1/2`, `PV2_1/2`, `LONPOLE`, `LATPOLE` and
`RADESYS`. Verified result:

```
target pixel (0-based) = (282.10, 229.07)
pixel scale            = 13.98 arcsec/pixel
corners                = (157.497, -41.810), (156.094, -40.231),
                         (156.773, -43.404), (154.690, -41.810)
```

The target is inside the tile.

### 2.4 Spectral axis

`SPECTRAL_CHANNELS` has 102 rows with these columns:

```
DETECTOR, SUBCHAN, WAVELENGTH [um], WL_MIN [um], WL_MAX [um],
R, R_STD, BANDWIDTH [um]
```

Verified characteristics:

- Wavelengths are strictly increasing: `0.753 µm` → `4.988 µm`.
- 17 channels per detector × 6 detectors = 102.
- `BLANKCH = "D3:17,D4:01"` marks detector 3 sub-channel 17 and detector 4
  sub-channel 1 as blank. In the 0-based channel array these are **indices 50 and 51**
  (wavelengths `2.399` and `2.445 µm`). Both have `NaN` flux, `NHITS = 0`, `FLAGS = 0`.
- `WCS-WAVE` repeats the channel wavelengths and bandwidths as arrays
  (`PLANE`, `WAVELENGTHS`, `BANDWIDTHS`); use `SPECTRAL_CHANNELS` as the authoritative
  table and cross-check against `WCS-WAVE`.

### 2.5 Values at the target

Sampled from the real cube at pixel `(282, 229)` across all 102 planes:

| Quantity | Verified result |
|---|---|
| Finite `IMAGE` channels | 100 of 102 (the two blank channels are `NaN`) |
| Flux range | `0.0220` – `1.438` MJy/sr |
| `NHITS` at target | `8` – `24` for valid channels; `0` for blank channels |
| `FLAGS` at target | `2097152` = bit 21 = `SOURCE` on every valid channel |

`SOURCE` means “pixel mapped to a known source” and is **informational**. It must not
invalidate a channel. The cube aggregates only `OVERFLOW` (bit 1), the outlier flag
(bit 19) and `SOURCE` (bit 21); bits 1 and 19 are invalidating, bit 21 is not.

### 2.6 Uncertainty

The cube has no variance plane. A 5 × 5 spatial neighbourhood around the target gives
channel scatters of roughly `0.17` – `1.25 MJy/sr`, comparable to or larger than the
source flux itself. That scatter is dominated by crowding and background structure, not
by measurement noise, so it **must not be reported as a flux uncertainty**.

Decision: cube spectra carry `uncertainty: null`, an explicit
`uncertainty_method = "unavailable_no_variance_extension"` and a `NOT_VERIFIED`
quality status. A local-scatter value may be exposed only as a clearly named diagnostic,
never as a per-channel error bar.

---

## 3. QR3 Spectral Image — verified format

A `0.1°` cutout of `2026W20_2A_0436_3/D3` around the same target is 4,083,840 bytes:

| HDU | EXTNAME | Shape | BUNIT |
|---|---|---|---|
| 1 | `IMAGE` | 59 × 58 | `MJy / sr` |
| 2 | `FLAGS` | 59 × 58 | — |
| 3 | `VARIANCE` | 59 × 58 | `MJy2 / sr2` |
| 4 | `ZODI` | 59 × 58 | `MJy / sr` |
| 5 | `EPSF` | 451-row BINTABLE | — |
| 6 | `WCS-WAVE` | 1-row BINTABLE | — |

`WCS-WAVE` is `X[9]`, `Y[14]`, `VALUES[14, 9, 2]`: a control grid in **original
detector pixel coordinates**, each node holding `(central wavelength, bandwidth)` in
µm. The cutout uses:

```
xpix_original = 1 + xpix_cutout - CRPIX1A
ypix_original = 1 + ypix_cutout - CRPIX2A
```

Verified at the target:

```
cutout pixel (0-based)   = (28.31, 29.07)
original detector pixel  = (902.31, 960.07)
central wavelength       = 2.00735 µm
bandwidth                = 0.0497 µm
```

The wavelength varies mainly along the detector Y axis (the dispersion axis) and is
effectively constant over one spatial PSF. A single exposure therefore supplies
**one spectral channel per source**, not a spectrum. Multiple repointings are required
to build a spectrum from spectral images, and the DR1 cube already performs that
combination.

The archive notes that `WCS-WAVE` is intended for visualization fidelity; science-grade
wavelengths should use the separate `CWAVE`/`CBAND` calibration product, which is not
available via SIA2. Phase 4 must label spectral-image wavelengths accordingly.

Unlike the cube, the spectral-image MEF **does** have a `VARIANCE` extension, so the
secondary path can return a genuine one-channel flux uncertainty. It still cannot
return a multi-channel spectrum from one exposure.

---

## 4. Supported-product decision

**Primary Phase 4 path — DR1 all-sky cube:**

- Full 0.753 – 4.988 µm SED at a sky position.
- Flux is calibrated surface brightness in `MJy/sr`; it is not integrated source flux.
- No uncertainty exists in the product; return `null` + `NOT_VERIFIED`.
- Static mosaic: no epoch-resolved spectra, no cross-epoch spectral comparison.
- Requires a dedicated size cap (`> 306 MiB`) and streaming/memory-mapped reads.

**Secondary path — spectral image MEF (inspection / one-channel context):**

- Read `WCS-WAVE` and report central wavelength/bandwidth at a source position.
- Optionally measure one channel with `VARIANCE`-based uncertainty.
- Never call a single exposure a spectrum and never concatenate channels from
  different exposures as if they were one simultaneous spectrum.
- Wavelength fidelity is visualization-grade unless/until the calibration product is
  integrated.

**Out of scope for Phase 4:**

- Multi-epoch spectra (no archive product supports them at this resolution).
- Absolute-flux/aperture corrections and physical feature interpretation.
- Re-binning or interpolating spectra onto a foreign wavelength grid.
- Mixing Phase 3 band-integrated aperture fluxes with cube channel surface brightness.

---

## 5. Consequences for implementation

1. Add a spectral download limit of at least `350 MiB`, separate from
   `MAX_DOWNLOAD_BYTES`, and stream to the existing hash-addressed cache.
2. Open the cube with `memmap=True`; read one channel at a time or a small pixel
   neighbourhood. Never materialise the whole 306 MiB cube in Python floats.
3. Build the 2-D celestial WCS explicitly; do not pass the full 3-D `WAVE-TAB` header
   to `WCS` without the `WCS-WAVE` extension.
4. Treat `BLANKCH` and `NHITS == 0` as no-coverage, not zero flux.
5. Preserve the raw `FLAGS` value and apply a documented mask: invalidate bits 1 and
   19, keep bit 21 (`SOURCE`) informational.
6. Return `wavelength`, `bandwidth`, `flux`, `flux_unit`, `flux_kind`,
   `nhits`, `flags` and quality per channel; uncertainty stays `null` for the cube.
7. Record product provenance: collection, `obs_publisher_did`, `access_url`,
   cube tile `NPIX`/`ORDER`, SHA-256 of the cached file, software and algorithm version.

---

## 6. Implementation status (Phase 4 complete)

- Cube resolution uses `spherex_dr1_cube`, the nearest SIA2 tile and a dedicated
  400 MB cap; the 320,909,760-byte file was downloaded and inspected successfully.
- Inspection reads `SPECTRAL_CHANNELS` as authoritative, `BLANKCH`/`NHITS` as
  no-coverage, `FLAGS` bits 1/19 as invalidating and bit 21 (`SOURCE`) as informational.
- Extraction returns 102 channels (100 valid for the validated tile), `MJy/sr`
  surface brightness, null uncertainty, deterministic ids and full provenance.
- Spectral-image `WCS-WAVE` is used only for inspection. The `CRPIX1A`/`CRPIX2A`
  offset was verified live: target `(28.310, 29.069)` → detector `(902.310, 960.069)`
  → 2.007347 µm, bandwidth 0.049704 µm.
- Comparison pairs valid channels by wavelength, reports `comparison_basis`, and
  explicitly refuses to treat different cube products as temporal epochs.
- API: `POST /spectra/extract`, `GET /spectra/{id}`, `GET /sources/{id}/spectra`,
  `POST /spectra/compare`.

## 7. Remaining open items

- Confirm the cube pixel solid angle (`pixel_scale_arcsec` from the header is 13.98″,
  while SIA2 reports 12.88″); no Jy conversion is exposed until this is reconciled.
- Per-pixel Jy conversion is deliberately not exposed; `MJy/sr` is the archive
  quantity and aperture integration is unsupported.
- The spectral-image one-channel path is inspection-only. It is not concatenated into
  a spectrum and its `WCS-WAVE` wavelength is labelled visualization-grade.
- Science-grade `CWAVE`/`CBAND` calibration products are not available through SIA2;
  confirm their access path only if higher-fidelity spectral-image wavelengths are
  required later.
- Multi-epoch spectra and spectral slope/SED fitting remain future work because DR1
  provides a static mosaic, not epoch-resolved spectra.
