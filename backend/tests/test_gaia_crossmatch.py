"""Cross-match engine tests: spherical separation, ambiguity, epoch propagation.

Candidate rows come from the fake TAP client; coordinates and astrometry are synthetic
but shaped like real DR3 records. Astropy provides the independent ground truth for
separations and propagated positions.
"""

from __future__ import annotations

import math

import pytest
from astropy.coordinates import SkyCoord
import astropy.units as u
from astropy.time import Time
from pydantic import ValidationError

from app.core.cache import CacheStore
from app.core.config import Settings
from app.core.exceptions import InvalidRadiusError
from app.schemas.gaia import (
    CrossMatchConfig,
    CrossMatchTarget,
    GaiaAstrometry,
    GaiaCoordinates,
    GaiaPhotometry,
    GaiaProvenance,
    GaiaSource,
)
from app.services.catalog_crossmatch import CatalogCrossMatcher, epoch_propagation
from app.services.gaia_service import GaiaService, angular_separation_arcsec


def source(
    *,
    ra: float,
    dec: float,
    source_id: int = 1111,
    parallax: float | None = 1.0,
    pmra: float | None = 0.0,
    pmdec: float | None = 0.0,
    ruwe: float | None = 1.0,
    ref_epoch: float = 2016.0,
) -> GaiaSource:
    return GaiaSource(
        source_id=str(source_id),
        coordinates=GaiaCoordinates(ra=ra, dec=dec, reference_epoch=ref_epoch),
        astrometry=GaiaAstrometry(
            parallax_mas=parallax,
            parallax_error_mas=None if parallax is None else 0.1,
            pmra_mas_yr=pmra,
            pmdec_mas_yr=pmdec,
            pmra_error_mas_yr=None if pmra is None else 0.1,
            pmdec_error_mas_yr=None if pmdec is None else 0.1,
            ruwe=ruwe,
        ),
        photometry=GaiaPhotometry(g=15.0),
        provenance=GaiaProvenance(retrieved_at="2026-11-15T00:00:00+00:00", tap_endpoint="https://tap"),
    )


class FakeGaiaClient:
    """Returns a synthetic DR3-shaped row for the queried cone."""

    def __init__(self, rows: list[dict] | None = None) -> None:
        self.rows = rows if rows is not None else []
        self.adql_calls: list[str] = []

    def run_adql(self, adql: str) -> list[dict]:
        self.adql_calls.append(adql)
        return self.rows

    def close(self) -> None:
        pass


def row_of(src: GaiaSource) -> dict:
    return {
        "source_id": int(src.source_id),
        "ra": src.coordinates.ra,
        "dec": src.coordinates.dec,
        "ra_error": src.coordinates.ra_error_mas,
        "dec_error": src.coordinates.dec_error_mas,
        "parallax": src.astrometry.parallax_mas,
        "parallax_error": src.astrometry.parallax_error_mas,
        "pmra": src.astrometry.pmra_mas_yr,
        "pmdec": src.astrometry.pmdec_mas_yr,
        "pmra_error": src.astrometry.pmra_error_mas_yr,
        "pmdec_error": src.astrometry.pmdec_error_mas_yr,
        "phot_g_mean_mag": src.photometry.g,
        "phot_bp_mean_mag": None,
        "phot_rp_mean_mag": None,
        "ruwe": src.astrometry.ruwe,
        "ref_epoch": src.coordinates.reference_epoch,
    }


def matcher_with(*sources: GaiaSource, settings: Settings | None = None) -> CatalogCrossMatcher:
    settings = settings or Settings(storage_dir="/tmp/planetx-test-gaia")
    service = GaiaService(FakeGaiaClient([row_of(s) for s in sources]), CacheStore(60, 32), settings)
    return CatalogCrossMatcher(service)


def target(ra: float, dec: float, external_id: str = "t1", **kwargs) -> CrossMatchTarget:
    return CrossMatchTarget(external_id=external_id, ra=ra, dec=dec, **kwargs)


# ------------------------------------------------------------------- separation
def test_angular_separation_matches_astropy() -> None:
    pairs = [
        (10.0, 20.0, 10.001, 20.0),
        (0.0, 89.9, 90.0, 89.9),      # near the pole: RA is compressed
        (359.5, 10.0, 0.5, 10.0),     # RA wraparound
        (-0.001 % 360.0, 45.0, 0.001, 45.0),
    ]
    for ra1, dec1, ra2, dec2 in pairs:
        expected = SkyCoord(ra=ra1 * u.deg, dec=dec1 * u.deg).separation(SkyCoord(ra=ra2 * u.deg, dec=dec2 * u.deg)).arcsec
        assert angular_separation_arcsec(ra1, dec1, ra2, dec2) == pytest.approx(expected, rel=1e-9)


def test_angular_separation_is_not_euclidean() -> None:
    # 90 deg of RA at dec=89.9 would be ~324000" naively; spherical gives ~509".
    value = angular_separation_arcsec(0.0, 89.9, 90.0, 89.9)
    # Euclidean RA*delta in degrees would report 90 deg = 324000"; spherical ~509".
    assert value == pytest.approx(509.1, rel=1e-2)
    assert value != pytest.approx(324000.0)


# ------------------------------------------------------------------ match cases
def test_unique_match_inside_radius() -> None:
    gaia = source(ra=10.0 + 0.5 / 3600.0, dec=20.0)  # 0.5" away
    matcher = matcher_with(gaia)

    response = matcher.crossmatch([target(10.0, 20.0)], CrossMatchConfig(radius_arcsec=3.0))

    assert response.matched == 1 and response.ambiguous == 0 and response.unmatched == 0
    result = response.results[0]
    assert result.status == "MATCHED"
    assert result.best is not None
    assert result.best.separation_arcsec == pytest.approx(0.5 * math.cos(math.radians(20.0)), rel=1e-3)
    assert result.best.source.source_id == "1111"
    assert len(result.candidates) == 1
    assert result.epoch.propagated is False


def test_no_candidate_is_unmatched() -> None:
    matcher = matcher_with()

    response = matcher.crossmatch([target(10.0, 20.0)], CrossMatchConfig(radius_arcsec=3.0))

    result = response.results[0]
    assert result.status == "UNMATCHED"
    assert result.best is None
    assert result.candidates == []
    assert response.unmatched == 1
    assert response.matched == 0


def test_candidate_outside_radius_is_excluded() -> None:
    # 6" away: inside the 10" candidate cone but outside the 3" match radius.
    gaia = source(ra=10.0 + 6.0 / 3600.0 / math.cos(math.radians(20.0)), dec=20.0)
    matcher = matcher_with(gaia)

    response = matcher.crossmatch([target(10.0, 20.0)], CrossMatchConfig(radius_arcsec=3.0))

    assert response.results[0].status == "UNMATCHED"


def test_two_candidates_within_radius_are_ambiguous() -> None:
    gaia_a = source(ra=10.0 + 0.5 / 3600.0, dec=20.0, source_id=1)
    gaia_b = source(ra=10.0 - 0.7 / 3600.0 / math.cos(math.radians(20.0)), dec=20.0, source_id=2)
    matcher = matcher_with(gaia_a, gaia_b)

    response = matcher.crossmatch([target(10.0, 20.0)], CrossMatchConfig(radius_arcsec=3.0))

    result = response.results[0]
    assert result.status == "AMBIGUOUS"
    assert result.best is None  # never silently pick one
    assert len(result.candidates) == 2
    assert result.ambiguity_note and "2 Gaia sources" in result.ambiguity_note
    assert result.candidates[0].separation_arcsec <= result.candidates[1].separation_arcsec
    assert response.ambiguous == 1


def test_ambiguity_is_configurable() -> None:
    gaia_a = source(ra=10.0 + 0.5 / 3600.0, dec=20.0, source_id=1)
    gaia_b = source(ra=10.0 - 0.7 / 3600.0 / math.cos(math.radians(20.0)), dec=20.0, source_id=2)
    matcher = matcher_with(gaia_a, gaia_b)

    response = matcher.crossmatch(
        [target(10.0, 20.0)],
        CrossMatchConfig(radius_arcsec=3.0, ambiguous_when_more_than=2),
    )

    assert response.results[0].status == "MATCHED"
    assert response.results[0].best.source.source_id == "1"


def test_exact_positional_match_has_zero_separation() -> None:
    gaia = source(ra=10.0, dec=20.0)
    matcher = matcher_with(gaia)

    response = matcher.crossmatch([target(10.0, 20.0)], CrossMatchConfig(radius_arcsec=3.0))

    assert response.results[0].best.separation_arcsec == pytest.approx(0.0, abs=1e-6)


def test_invalid_radius_is_rejected_at_the_schema_boundary() -> None:
    # CrossMatchConfig.radius_arcsec has gt=0: API input is rejected before the service.
    with pytest.raises(ValidationError):
        CrossMatchConfig(radius_arcsec=0.0)
    # Out-of-config-range values that pass the schema still hit the service check.
    matcher = matcher_with(settings=Settings(storage_dir="/tmp/planetx-test-gaia", gaia_max_search_radius_arcsec=10.0))
    with pytest.raises(InvalidRadiusError):
        matcher.crossmatch([target(10.0, 20.0)], CrossMatchConfig(radius_arcsec=59.0))


def test_invalid_coordinates_are_rejected_at_the_schema_boundary() -> None:
    with pytest.raises(ValidationError):
        target(10.0, 95.0)
    with pytest.raises(ValidationError):
        target(361.0, 20.0)


# ------------------------------------------------------------- epoch handling
def test_epoch_propagation_matches_astropy_space_motion() -> None:
    gaia = source(ra=156.0, dec=-41.0, pmra=-500.0, pmdec=300.0)
    info = epoch_propagation(gaia, 2026.0)

    assert info.propagated is True
    catalogue = SkyCoord(
        ra=156.0 * u.deg, dec=-41.0 * u.deg,
        pm_ra_cosdec=-500.0 * u.mas / u.yr, pm_dec=300.0 * u.mas / u.yr,
        frame="icrs", obstime=Time(2016.0, format="jyear"),
    )
    propagated = catalogue.apply_space_motion(new_obstime=Time(2026.0, format="jyear"))
    assert info.propagated_ra == pytest.approx(float(propagated.ra.deg), abs=1e-9)
    assert info.propagated_dec == pytest.approx(float(propagated.dec.deg), abs=1e-9)
    # The displacement is real: several hundred mas over a decade.
    moved = angular_separation_arcsec(156.0, -41.0, info.propagated_ra, info.propagated_dec)
    assert 3.0 < moved < 10.0


def test_epoch_propagation_disabled_by_config() -> None:
    gaia = source(ra=10.0, dec=20.0, pmra=-500.0, pmdec=300.0)
    matcher = matcher_with(gaia)

    response = matcher.crossmatch(
        [target(10.0, 20.0, epoch=2026.0)],
        CrossMatchConfig(radius_arcsec=3.0, propagate_proper_motion=False),
    )

    info = response.results[0].epoch
    assert info.propagated is False
    assert response.results[0].best.separation_propagated_arcsec is None


def test_missing_proper_motion_is_not_propagated() -> None:
    gaia = source(ra=10.0 + 1.0 / 3600.0, dec=20.0, pmra=None, pmdec=None)
    matcher = matcher_with(gaia)

    response = matcher.crossmatch([target(10.0, 20.0, epoch=2026.0)], CrossMatchConfig(radius_arcsec=3.0))

    result = response.results[0]
    assert result.status == "MATCHED"
    info = result.epoch
    assert info.propagated is False
    assert info.limitation and "Proper motion unavailable" in info.limitation
    assert result.best.separation_arcsec == pytest.approx(1.0 * math.cos(math.radians(20.0)), rel=1e-2)
    assert result.best.separation_propagated_arcsec is None


def test_same_epoch_as_gaia_reference_needs_no_propagation() -> None:
    gaia = source(ra=10.0, dec=20.0, pmra=-500.0, pmdec=300.0)

    info = epoch_propagation(gaia, 2016.0)

    assert info.propagated is False
    assert info.limitation is None


def test_no_epoch_supplied_uses_catalogue_position() -> None:
    gaia = source(ra=10.0, dec=20.0, pmra=-500.0, pmdec=300.0)

    info = epoch_propagation(gaia, None)

    assert info.propagated is False
    assert info.limitation and "No observation epoch" in info.limitation


def test_epoch_shifted_target_matches_via_propagation() -> None:
    """A fast mover 4" away at 2016.0 lands 0" from the 2026 target position."""
    gaia = source(ra=10.0, dec=20.0, pmra=-1440.0, pmdec=0.0, source_id=42)
    info = epoch_propagation(gaia, 2026.0)
    assert info.propagated is True
    matcher = matcher_with(gaia)

    response = matcher.crossmatch(
        [target(info.propagated_ra, info.propagated_dec, epoch=2026.0)],
        CrossMatchConfig(radius_arcsec=3.0),
    )

    result = response.results[0]
    assert result.status == "MATCHED"
    assert result.best.source.source_id == "42"
    # The propagated separation is ~0 where the catalogue separation was ~4".
    assert result.best.separation_arcsec < 0.5
    assert result.best.separation_propagated_arcsec == pytest.approx(0.0, abs=0.5)
