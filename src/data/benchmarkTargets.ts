/**
 * NASA Benchmark Targets Dataset
 *
 * Centralized, authoritative astronomical reference data for the five
 * AstroChronoscope benchmark targets.
 *
 * Coordinates verified against CDS SIMBAD, ESA Gaia DR3, and published literature:
 * - Barnard's Star: Gaia DR3 4472832130942575872 / SIMBAD
 * - Epsilon Indi B: SIMBAD / Scholz et al. (2003) A&A 398, L29
 * - WISE 0855−0714: Luhman (2014) ApJ 786, L18 / IRSA
 * - RW Aurigae: Gaia DR3 156430822114424576 / SIMBAD
 * - R Draconis: Gaia DR3 1648328016354496384 / SIMBAD
 */

export interface BenchmarkTargetCoordinates {
  ra: number;
  dec: number;
  frame: "ICRS";
  epoch: string;
}

export interface BenchmarkTargetSearch {
  defaultRadius: number;
  minimumRadius: number;
  maximumRadius: number;
}

export interface BenchmarkTargetProperMotion {
  pmRa: number;
  pmDec: number;
  referenceEpoch: string;
  unit: "mas/year";
}

export interface BenchmarkTargetReferences {
  catalog: string;
  identifier?: string;
  sourceUrl?: string;
}

export interface BenchmarkTarget {
  id: string;
  name: string;
  aliases: string[];
  coordinates: BenchmarkTargetCoordinates;
  search: BenchmarkTargetSearch;
  classification: string;
  description: string;
  properMotion?: BenchmarkTargetProperMotion;
  references: BenchmarkTargetReferences;
}

export interface PropagatedCoordinatesResult {
  ra: number;
  dec: number;
  deltaArcsec: number;
  targetEpoch: number;
  applied: boolean;
  limitation?: string;
}

export const BENCHMARK_TARGETS: BenchmarkTarget[] = [
  {
    id: "barnards_star",
    name: "Barnard's Star",
    aliases: ["GJ 699", "HIP 87937", "V2500 Oph", "Gaia DR3 4472832130942575872"],
    coordinates: {
      ra: 269.452075,
      dec: 4.693364,
      frame: "ICRS",
      epoch: "J2000.0",
    },
    search: {
      defaultRadius: 0.05,
      minimumRadius: 0.005,
      maximumRadius: 0.5,
    },
    classification: "High-proper-motion red dwarf",
    description:
      "M4.0V red dwarf with the highest known stellar proper motion (10.36″/yr). Prime time-domain benchmark for astrometric motion and optical/NIR baseline.",
    properMotion: {
      pmRa: -801.55,
      pmDec: 10362.39,
      referenceEpoch: "J2000.0",
      unit: "mas/year",
    },
    references: {
      catalog: "Gaia DR3 / SIMBAD",
      identifier: "Gaia DR3 4472832130942575872",
      sourceUrl: "https://simbad.u-strasbg.fr/simbad/sim-id?Ident=Barnard%27s+Star",
    },
  },
  {
    id: "epsilon_indi_b",
    name: "Epsilon Indi B",
    aliases: ["eps Ind B", "GJ 845 B", "WISE J220410.5-564658", "Scholz et al. 2003"],
    coordinates: {
      ra: 331.044125,
      dec: -56.782806,
      frame: "ICRS",
      epoch: "J2000.0",
    },
    search: {
      defaultRadius: 0.01,
      minimumRadius: 0.005,
      maximumRadius: 0.2,
    },
    classification: "Brown-dwarf binary",
    description:
      "Nearby binary T1+T6 brown dwarf system orbiting eps Ind A at ~1460 AU. Crucial benchmark for substellar atmosphere evolution and infrared spectral characterization.",
    properMotion: {
      pmRa: 3981.98,
      pmDec: -2466.83,
      referenceEpoch: "J2000.0",
      unit: "mas/year",
    },
    references: {
      catalog: "SIMBAD / Scholz et al. (2003)",
      identifier: "NAME eps Ind B",
      sourceUrl: "https://simbad.u-strasbg.fr/simbad/sim-id?Ident=eps+Ind+B",
    },
  },
  {
    id: "wise_0855_0714",
    name: "WISE 0855−0714",
    aliases: ["WISE J085510.83-071442.5", "Luhman 2014", "W0855"],
    coordinates: {
      ra: 133.795133,
      dec: -7.245147,
      frame: "ICRS",
      epoch: "J2000.0",
    },
    search: {
      defaultRadius: 0.05,
      minimumRadius: 0.01,
      maximumRadius: 0.5,
    },
    classification: "Extremely cold brown dwarf",
    description:
      "Substellar Y-dwarf located 2.2 pc from Earth with an effective temperature of ~250 K. Second highest proper motion (~8.12″/yr) after Barnard's Star; key science driver for deep infrared SPHEREx bands.",
    properMotion: {
      pmRa: -8123.7,
      pmDec: 673.2,
      referenceEpoch: "J2000.0",
      unit: "mas/year",
    },
    references: {
      catalog: "Luhman (2014) / IRSA",
      identifier: "WISE J085510.83-071442.5",
      sourceUrl: "https://iopscience.iop.org/article/10.1088/2041-8205/786/2/L18",
    },
  },
  {
    id: "rw_aurigae",
    name: "RW Aurigae",
    aliases: ["RW Aur", "HD 243986", "HIP 24838", "Gaia DR3 156430822114424576"],
    coordinates: {
      ra: 76.956081,
      dec: 30.401205,
      frame: "ICRS",
      epoch: "J2000.0",
    },
    search: {
      defaultRadius: 0.01,
      minimumRadius: 0.005,
      maximumRadius: 0.2,
    },
    classification: "Young variable binary system",
    description:
      "Classic young T Tauri binary system experiencing dramatic multi-magnitude dimming events and accretion disk disruption due to tidal stellar flybys.",
    properMotion: {
      pmRa: 2.64,
      pmDec: -27.4,
      referenceEpoch: "J2016.0",
      unit: "mas/year",
    },
    references: {
      catalog: "Gaia DR3 / SIMBAD",
      identifier: "Gaia DR3 156430822114424576",
      sourceUrl: "https://simbad.u-strasbg.fr/simbad/sim-id?Ident=RW+Aur",
    },
  },
  {
    id: "r_draconis",
    name: "R Draconis",
    aliases: ["R Dra", "HD 149214", "HIP 79493", "Gaia DR3 1648328016354496384"],
    coordinates: {
      ra: 248.167608,
      dec: 66.754979,
      frame: "ICRS",
      epoch: "J2000.0",
    },
    search: {
      defaultRadius: 0.01,
      minimumRadius: 0.005,
      maximumRadius: 0.2,
    },
    classification: "Mira-type variable star",
    description:
      "Luminous AGB pulsating variable star with a 245-day period and large infrared flux variations. Serves as a standard benchmark for multi-epoch photometry and circumstellar shell variability.",
    properMotion: {
      pmRa: -20.64,
      pmDec: 6.15,
      referenceEpoch: "J2016.0",
      unit: "mas/year",
    },
    references: {
      catalog: "Gaia DR3 / SIMBAD",
      identifier: "Gaia DR3 1648328016354496384",
      sourceUrl: "https://simbad.u-strasbg.fr/simbad/sim-id?Ident=R+Dra",
    },
  },
];

/**
 * Retrieve a NASA benchmark target by unique ID.
 */
export function getBenchmarkTargetById(id: string): BenchmarkTarget | undefined {
  return BENCHMARK_TARGETS.find((target) => target.id === id);
}

/**
 * Validate Right Ascension and Declination decimal values.
 */
export function validateCoordinates(ra: number, dec: number): { valid: boolean; error?: string } {
  if (!Number.isFinite(ra) || !Number.isFinite(dec)) {
    return { valid: false, error: "Coordinates must be finite numbers." };
  }
  if (ra < 0 || ra >= 360) {
    return { valid: false, error: `Right Ascension (${ra}°) must be in the range [0, 360).` };
  }
  if (dec < -90 || dec > 90) {
    return { valid: false, error: `Declination (${dec}°) must be in the range [-90, +90].` };
  }
  return { valid: true };
}

/**
 * Validate search cone radius against backend physical limits.
 */
export function validateSearchRadius(radius: number, target?: BenchmarkTarget): { valid: boolean; error?: string } {
  if (!Number.isFinite(radius) || radius <= 0) {
    return { valid: false, error: "Cone radius must be a positive number greater than 0." };
  }
  const min = target?.search.minimumRadius ?? 0.001;
  const max = target?.search.maximumRadius ?? 1.0;
  if (radius < min) {
    return { valid: false, error: `Radius (${radius}°) is below the recommended minimum (${min}°).` };
  }
  if (radius > max) {
    return { valid: false, error: `Radius (${radius}°) exceeds the safe maximum limit (${max}°).` };
  }
  return { valid: true };
}

/**
 * Propagate astronomical coordinates from reference epoch to target epoch.
 *
 * Implements standard astrometric space-motion transformation:
 * - Accounts for cos(dec) convention in pmRa (pm_ra_cosdec).
 * - Preserves RA modulo 360 and clamps Dec to [-90, +90].
 */
export function propagateTargetCoordinates(
  target: BenchmarkTarget,
  targetEpochYear: number = 2026.5
): PropagatedCoordinatesResult {
  if (!target.properMotion) {
    return {
      ra: target.coordinates.ra,
      dec: target.coordinates.dec,
      deltaArcsec: 0,
      targetEpoch: targetEpochYear,
      applied: false,
      limitation: "Proper motion data unavailable for this target.",
    };
  }

  const refYear = parseFloat(target.properMotion.referenceEpoch.replace(/[^\d.]/g, "")) || 2000.0;
  const deltaYears = targetEpochYear - refYear;

  if (Math.abs(deltaYears) < 0.001) {
    return {
      ra: target.coordinates.ra,
      dec: target.coordinates.dec,
      deltaArcsec: 0,
      targetEpoch: targetEpochYear,
      applied: false,
    };
  }

  // Proper motion in milliarcseconds per year (1 mas = 1 / 3,600,000 degrees)
  const dDecDeg = (target.properMotion.pmDec * deltaYears) / 3600000.0;
  const meanDecRad = ((target.coordinates.dec + dDecDeg / 2.0) * Math.PI) / 180.0;
  const cosMeanDec = Math.cos(meanDecRad);

  const dRaDeg = Math.abs(cosMeanDec) > 1e-6
    ? (target.properMotion.pmRa * deltaYears) / (cosMeanDec * 3600000.0)
    : 0;

  const rawRa = (target.coordinates.ra + dRaDeg) % 360.0;
  const newRa = rawRa < 0 ? rawRa + 360.0 : rawRa;
  const newDec = Math.max(-90.0, Math.min(90.0, target.coordinates.dec + dDecDeg));

  // Angular shift in arcseconds: 1 mas = 0.001 arcsec
  const shiftRaArcsec = (target.properMotion.pmRa * deltaYears) / 1000.0;
  const shiftDecArcsec = (target.properMotion.pmDec * deltaYears) / 1000.0;
  const deltaArcsec = Math.sqrt(shiftRaArcsec * shiftRaArcsec + shiftDecArcsec * shiftDecArcsec);

  return {
    ra: Number(newRa.toFixed(6)),
    dec: Number(newDec.toFixed(6)),
    deltaArcsec: Number(deltaArcsec.toFixed(2)),
    targetEpoch: targetEpochYear,
    applied: true,
  };
}

