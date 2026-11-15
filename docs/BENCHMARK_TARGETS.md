# NASA Benchmark Target Presets

AstroChronoscope includes pre-configured reference parameters for five NASA challenge benchmark targets. Each target represents a distinct astrophysical domain and stress-tests specific capabilities of the time-domain investigation pipeline.

## Benchmark Target Dataset

| Target ID | Name | Classification | RA (deg) | Dec (deg) | Epoch | Default Radius | Proper Motion (mas/yr) |
|---|---|---|---|---|---|---|---|
| `barnards_star` | Barnard's Star | High-proper-motion red dwarf | 269.452075 | +4.693364 | J2000.0 | 0.05 deg | pmRA: -801.55, pmDec: +10362.39 |
| `epsilon_indi_b` | Epsilon Indi B | Brown dwarf binary | 331.044125 | -56.782806 | J2000.0 | 0.01 deg | pmRA: +3981.98, pmDec: -2466.83 |
| `wise_0855_0714` | WISE 0855-0714 | Extremely cold brown dwarf | 133.795133 | -7.245147 | J2000.0 | 0.05 deg | pmRA: -8123.70, pmDec: +673.20 |
| `rw_aurigae` | RW Aurigae | Young variable binary | 76.956081 | +30.401205 | J2000.0 | 0.01 deg | pmRA: +2.64, pmDec: -27.40 |
| `r_draconis` | R Draconis | Mira-type variable star | 248.167608 | +66.754979 | J2000.0 | 0.01 deg | pmRA: -20.64, pmDec: +6.15 |

---

## Target Profiles

### 1. Barnard's Star (`barnards_star`)
- **Classification**: M4.0V red dwarf.
- **Aliases**: GJ 699, HIP 87937, V2500 Oph, Gaia DR3 4472832130942575872.
- **Reference Catalog**: Gaia DR3 / SIMBAD.
- **Proper Motion**: Total proper motion of 10.36 arcseconds per year, the highest known for any star.
- **Science Role in AstroChronoscope**: Primary benchmark for astrometric proper motion propagation and cross-epoch spatial displacement. Over a 26.5 year baseline (J2000.0 to J2026.5), Barnard's Star shifts by over 274 arcseconds across the celestial sphere.

### 2. Epsilon Indi B (`epsilon_indi_b`)
- **Classification**: T1 + T6 brown dwarf binary.
- **Aliases**: eps Ind B, GJ 845 B, WISE J220410.5-564658, Scholz et al. (2003).
- **Reference Catalog**: SIMBAD / Scholz et al. (2003) A&A 398, L29.
- **Proper Motion**: pmRA +3981.98 mas/yr, pmDec -2466.83 mas/yr.
- **Science Role in AstroChronoscope**: Benchmark for substellar infrared spectral extraction in SPHEREx bands 2 through 5. Crucial for observing methane and water absorption bands in cool substellar atmospheres.

### 3. WISE 0855-0714 (`wise_0855_0714`)
- **Classification**: Extremely cold Y-dwarf brown dwarf.
- **Aliases**: WISE J085510.83-071442.5, Luhman (2014), W0855.
- **Reference Catalog**: Luhman (2014) ApJ 786, L18 / IRSA.
- **Effective Temperature**: Approximately 250 Kelvin (sub-freezing).
- **Proper Motion**: 8.12 arcseconds per year (second highest known proper motion).
- **Science Role in AstroChronoscope**: High-contrast, faint-source detection test in SPHEREx longer wavelength channels (3 to 5 micrometers) where water ice absorption features predominate.

### 4. RW Aurigae (`rw_aurigae`)
- **Classification**: Young classical T Tauri binary star.
- **Aliases**: RW Aur, HD 243986, HIP 24838, Gaia DR3 156430822114424576.
- **Reference Catalog**: Gaia DR3 / SIMBAD.
- **Science Role in AstroChronoscope**: Demonstrates differential image subtraction and photometric variability. Known for dramatic multi-magnitude dimming events caused by circumstellar dust occultations and tidal disk disruption from stellar encounters.

### 5. R Draconis (`r_draconis`)
- **Classification**: Asymptotic Giant Branch (AGB) Mira pulsating variable.
- **Aliases**: R Dra, HD 149214, HIP 79493, Gaia DR3 1648328016354496384.
- **Reference Catalog**: Gaia DR3 / SIMBAD.
- **Period**: 245.6 days with visual amplitude delta_V ~ 6 magnitudes.
- **Science Role in AstroChronoscope**: Primary target for testing automated aperture photometry, multi-epoch light curve synthesis, and the Stetson J variability index algorithm.

---

## Astrometric Proper Motion Propagation

For fast-moving targets (such as Barnard's Star, WISE 0855-0714, and Epsilon Indi B), searching catalog coordinates without epoch propagation can cause the target to fall outside the SPHEREx search aperture.

AstroChronoscope implements linear space-motion coordinate propagation:

`delta_t = Target_Epoch - Reference_Epoch`
`delta_RA_deg = (pmRA_mas_yr / (cos(Dec_rad) * 3,600,000)) * delta_t`
`delta_Dec_deg = (pmDec_mas_yr / 3,600,000) * delta_t`

`RA_propagated = RA_initial + delta_RA_deg`
`Dec_propagated = Dec_initial + delta_Dec_deg`

Users can toggle space-motion propagation in the Discovery workspace to immediately switch the search coordinates between catalog epoch (J2000.0) and observation epoch (J2026.5).
