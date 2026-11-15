import test from "node:test";
import assert from "node:assert/strict";

import {
  BENCHMARK_TARGETS,
  getBenchmarkTargetById,
  validateCoordinates,
  validateSearchRadius,
  propagateTargetCoordinates,
} from "../src/data/benchmarkTargets.ts";

test("Benchmark Target Dataset Integrity", async (t) => {
  await t.test("contains exactly the five NASA benchmark targets", () => {
    assert.strictEqual(BENCHMARK_TARGETS.length, 5);
    const expectedIds = ["barnards_star", "epsilon_indi_b", "wise_0855_0714", "rw_aurigae", "r_draconis"];
    const actualIds = BENCHMARK_TARGETS.map((t) => t.id);
    assert.deepStrictEqual(actualIds.sort(), expectedIds.sort());
  });

  await t.test("target IDs are unique", () => {
    const ids = BENCHMARK_TARGETS.map((t) => t.id);
    const uniqueIds = new Set(ids);
    assert.strictEqual(ids.length, uniqueIds.size);
  });

  await t.test("all targets have valid ICRS coordinates and preserved signs", () => {
    for (const target of BENCHMARK_TARGETS) {
      assert.strictEqual(target.coordinates.frame, "ICRS");
      assert.ok(target.coordinates.epoch.startsWith("J"));
      assert.ok(Number.isFinite(target.coordinates.ra));
      assert.ok(Number.isFinite(target.coordinates.dec));
      assert.ok(target.coordinates.ra >= 0 && target.coordinates.ra < 360);
      assert.ok(target.coordinates.dec >= -90 && target.coordinates.dec <= 90);
    }

    // Specific declination sign checks
    const epsIndi = getBenchmarkTargetById("epsilon_indi_b");
    assert.ok(epsIndi && epsIndi.coordinates.dec < 0, "Epsilon Indi B declination must be negative");

    const wise0855 = getBenchmarkTargetById("wise_0855_0714");
    assert.ok(wise0855 && wise0855.coordinates.dec < 0, "WISE 0855 declination must be negative");

    const barnard = getBenchmarkTargetById("barnards_star");
    assert.ok(barnard && barnard.coordinates.dec > 0, "Barnard's Star declination must be positive");

    const rwAur = getBenchmarkTargetById("rw_aurigae");
    assert.ok(rwAur && rwAur.coordinates.dec > 0, "RW Aurigae declination must be positive");

    const rDra = getBenchmarkTargetById("r_draconis");
    assert.ok(rDra && rDra.coordinates.dec > 0, "R Draconis declination must be positive");
  });

  await t.test("search radii are strictly positive and bounded", () => {
    for (const target of BENCHMARK_TARGETS) {
      assert.ok(target.search.defaultRadius > 0);
      assert.ok(target.search.minimumRadius > 0);
      assert.ok(target.search.maximumRadius > target.search.minimumRadius);
      assert.ok(target.search.defaultRadius >= target.search.minimumRadius);
      assert.ok(target.search.defaultRadius <= target.search.maximumRadius);
    }
  });

  await t.test("proper motion data is present and valid where applicable", () => {
    for (const target of BENCHMARK_TARGETS) {
      if (target.properMotion) {
        assert.ok(Number.isFinite(target.properMotion.pmRa));
        assert.ok(Number.isFinite(target.properMotion.pmDec));
        assert.strictEqual(target.properMotion.unit, "mas/year");
      }
    }
  });

  await t.test("catalog references exist for all targets", () => {
    for (const target of BENCHMARK_TARGETS) {
      assert.ok(target.references.catalog.length > 0);
      assert.ok(target.references.sourceUrl?.startsWith("http"));
    }
  });
});

test("Coordinate & Search Radius Validators", async (t) => {
  await t.test("validates RA and Dec bounds", () => {
    assert.deepStrictEqual(validateCoordinates(269.45, 4.69), { valid: true });
    assert.strictEqual(validateCoordinates(-1, 0).valid, false);
    assert.strictEqual(validateCoordinates(361, 0).valid, false);
    assert.strictEqual(validateCoordinates(100, -95).valid, false);
    assert.strictEqual(validateCoordinates(100, 95).valid, false);
    assert.strictEqual(validateCoordinates(NaN, 0).valid, false);
  });

  await t.test("validates search radius against target boundaries", () => {
    const barnard = getBenchmarkTargetById("barnards_star");
    assert.strictEqual(validateSearchRadius(0.05, barnard).valid, true);
    assert.strictEqual(validateSearchRadius(-0.01, barnard).valid, false);
    assert.strictEqual(validateSearchRadius(0.001, barnard).valid, false);
    assert.strictEqual(validateSearchRadius(1.5, barnard).valid, false);
  });
});

test("Astrometric Space Motion Propagation", async (t) => {
  await t.test("Barnard's Star proper motion propagation to J2026.5", () => {
    const barnard = getBenchmarkTargetById("barnards_star");
    assert.ok(barnard);

    const prop = propagateTargetCoordinates(barnard, 2026.5);
    assert.strictEqual(prop.applied, true);
    assert.strictEqual(prop.targetEpoch, 2026.5);

    // RA should decrease due to negative pmRa (-801.55 mas/yr)
    assert.ok(prop.ra < barnard.coordinates.ra, "Propagated RA should decrease");
    // Dec should increase due to large positive pmDec (+10362.39 mas/yr)
    assert.ok(prop.dec > barnard.coordinates.dec, "Propagated Dec should increase");

    // Total displacement over 26.5 years should be roughly 274-276 arcseconds
    assert.ok(prop.deltaArcsec >= 270 && prop.deltaArcsec <= 280, `Expected ~275″, got ${prop.deltaArcsec}″`);
    assert.strictEqual(prop.dec, 4.769643);
    assert.strictEqual(prop.ra, 269.446155);
  });

  await t.test("WISE 0855 proper motion propagation over 26.5 years", () => {
    const wise = getBenchmarkTargetById("wise_0855_0714");
    assert.ok(wise);

    const prop = propagateTargetCoordinates(wise, 2026.5);
    assert.strictEqual(prop.applied, true);
    // WISE 0855 has ~8.15″/yr total PM -> ~215-217″ over 26.5 years
    assert.ok(prop.deltaArcsec > 210 && prop.deltaArcsec < 220, `Expected ~216″, got ${prop.deltaArcsec}″`);
    assert.strictEqual(prop.ra, 133.734853);
    assert.strictEqual(prop.dec, -7.240191);
  });

  await t.test("Same epoch propagation yields zero shift and applied=false", () => {
    const barnard = getBenchmarkTargetById("barnards_star");
    assert.ok(barnard);

    const prop = propagateTargetCoordinates(barnard, 2000.0);
    assert.strictEqual(prop.applied, false);
    assert.strictEqual(prop.deltaArcsec, 0);
    assert.strictEqual(prop.ra, barnard.coordinates.ra);
    assert.strictEqual(prop.dec, barnard.coordinates.dec);
  });
});
