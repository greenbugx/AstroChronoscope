"""Phase 5 ↔ Phase 3/4 integration tests: source-level Gaia association.

The Phase 3 source record is persisted for real (same write path the production
service uses); the Gaia Archive is mocked. Synthetic Gaia values are shaped like
real DR3 records but are never presented as real observations.
"""

from __future__ import annotations

import pytest

from app.core.config import Settings
from app.main import app
from app.schemas.gaia import (
    CrossMatchConfig,
    GaiaAstrometry,
    GaiaCoordinates,
    GaiaConeSearchMetadata,
    GaiaConeSearchResponse,
    GaiaPhotometry,
    GaiaProvenance,
    GaiaSource,
)
from app.schemas.lightcurve import (
    AssociatedSource,
)
from app.schemas.lightcurve import (
    LightCurveProvenance,
    LightCurveQuery,
    MatchedDetection,
    SourceLightCurve,
    SourceRecord,
    Target,
)
from app.schemas.photometry import FluxMeasurement
from app.services.catalog_crossmatch import CatalogCrossMatcher
from app.services.gaia_source_association import SourceGaiaAssociationService
from app.services.source_catalog import SourceCatalogService
from tests.conftest import TARGET_DEC, TARGET_RA

_SOURCE_ID = "a" * 32
_OTHER_ID = "b" * 32
_GAIA_STYLE_ID = "123456789"  # a Gaia-style numeric id is never an internal id


def _gaia_source(
    *,
    ra: float,
    dec: float,
    source_id: int,
    pmra: float | None = 0.0,
    pmdec: float | None = 0.0,
    ra_error_mas: float | None = 50.0,
    dec_error_mas: float | None = 50.0,
) -> GaiaSource:
    return GaiaSource(
        source_id=str(source_id),
        coordinates=GaiaCoordinates(ra=ra, dec=dec, ra_error_mas=ra_error_mas, dec_error_mas=dec_error_mas),
        astrometry=GaiaAstrometry(
            parallax_mas=1.0,
            parallax_error_mas=0.1,
            pmra_mas_yr=pmra,
            pmdec_mas_yr=pmdec,
            ruwe=1.0,
        ),
        photometry=GaiaPhotometry(g=15.0),
        provenance=GaiaProvenance(retrieved_at="2026-11-15T00:00:00+00:00", tap_endpoint="https://tap"),
    )


class StubGaiaService:
    """cone_search stand-in: returns canned sources for any cone."""

    def __init__(self, sources: list[GaiaSource]) -> None:
        self.sources = sources
        self.calls: list[dict] = []
        # The crossmatcher reads limits from the service settings.
        self.settings = Settings(storage_dir="/tmp/planetx-test-p5")
        self._memo: dict[tuple, GaiaConeSearchResponse] = {}

    def cone_search(self, **kwargs):
        # Mirror the real GaiaService cache contract: identical cone parameters
        # (ra, dec, radius, limit) hit the memo, never the "archive".
        key = (kwargs["ra"], kwargs["dec"], kwargs["radius_arcsec"], kwargs.get("limit"))
        if key not in self._memo:
            self.calls.append(kwargs)
            self._memo[key] = self._response(kwargs)
        return self._memo[key]

    def _response(self, kwargs) -> GaiaConeSearchResponse:
        return GaiaConeSearchResponse(
            query=GaiaConeSearchMetadata(
                ra=kwargs["ra"], dec=kwargs["dec"], radius_arcsec=kwargs["radius_arcsec"],
                limit=kwargs.get("limit", 100), total_found=len(self.sources), truncated=False,
            ),
            sources=self.sources,
            separations_arcsec=[0.0] * len(self.sources),
        )


def _seed_source(
    settings,
    cache,
    *,
    source_id: str = _SOURCE_ID,
    ra: float = TARGET_RA,
    dec: float = TARGET_DEC,
    time_mjd: float | None = 61177.27,
    position_scatter_arcsec: float | None = 0.3,
) -> SourceRecord:
    detections = []
    if time_mjd is not None:
        detections.append(
            MatchedDetection(
                measurement=FluxMeasurement(
                    detection_id="det-1", observation_id="obs-1", time_mjd=time_mjd,
                    x=10.0, y=10.0, aperture_radius_px=6.0, aperture_area_px=113.0,
                    aperture_valid_fraction=1.0, psf_fwhm_px=2.0, fwhm_source="psf",
                    quality="PASS",
                ),
                epoch_key="2026-05-17",
            )
        )
    record = SourceRecord(
        source=AssociatedSource(
            source_id=source_id,
            reference_ra_deg=ra,
            reference_dec_deg=dec,
            detection_count=len(detections),
            epoch_count=1,
            bands=["SPHEREx-D3"],
            detections=detections,
            position_scatter_arcsec=position_scatter_arcsec,
        ),
        lightcurve=SourceLightCurve(
            source_id=source_id, reference_ra_deg=ra, reference_dec_deg=dec, epoch_count=1,
        ),
        target=Target(ra=ra, dec=dec),
        query=LightCurveQuery(radius_deg=0.1, cutout_size_deg=0.1),
        provenance=LightCurveProvenance(
            created_at="2026-11-15T00:00:00+00:00", software={"planet_x_backend": "0.1.0"}
        ),
    )
    SourceCatalogService(settings, cache)._write(  # noqa: SLF001 - same write path the service uses
        settings.sources_dir / f"{source_id}.json", record
    )
    return record


@pytest.fixture
def association_env(api):
    """api fixture + a real association service over a stub Gaia archive.

    Yields ``(install, settings, cache)``; ``install(sources)`` returns
    ``(service, stub)`` wired to the fixture's real source-catalogue storage.
    """
    _client, _fake_client, settings, cache = api

    def install(sources: list[GaiaSource]) -> tuple[SourceGaiaAssociationService, StubGaiaService]:
        stub = StubGaiaService(sources)
        catalog = SourceCatalogService(settings, cache)
        service = SourceGaiaAssociationService(catalog, CatalogCrossMatcher(stub), settings)
        from app.api import deps

        app.dependency_overrides[deps.get_source_gaia_association] = lambda: service
        return service, stub

    yield install, settings, cache
    app.dependency_overrides.clear()


def _wire(install, sources: list[GaiaSource]):
    service, stub = install(sources)
    return service, stub


# ------------------------------------------------------------------ service level
def test_unique_match_distinguishes_the_two_id_namespaces(association_env) -> None:
    install, settings, cache = association_env
    service, _stub = _wire(install, [_gaia_source(ra=TARGET_RA, dec=TARGET_DEC, source_id=424242)])
    _seed_source(settings, cache)

    response = service.associate(_SOURCE_ID)

    assert response.success is True
    assert response.planetx_source_id == _SOURCE_ID          # 32-hex internal id
    assert response.best is not None
    assert response.best.gaia_source_id == "424242"          # Gaia numeric id, string
    assert response.planetx_source_id != response.best.gaia_source_id
    assert response.status == "MATCHED"


def test_significance_uses_both_uncertainties(association_env) -> None:
    install, settings, cache = association_env
    service, _stub = _wire(install, [_gaia_source(ra=TARGET_RA, dec=TARGET_DEC, source_id=1)])
    _seed_source(settings, cache, position_scatter_arcsec=0.3)

    response = service.associate(_SOURCE_ID)

    sig = response.significance
    # Inputs are radial RMS: Gaia hypot(50, 50) mas = 70.7 mas = 0.0707";
    # combined per-axis equivalent = hypot(0.3, 0.0707)/sqrt(2).
    assert sig.gaia_sigma_arcsec == pytest.approx(0.07071067811865476, rel=1e-9)
    assert sig.combined_sigma_arcsec == pytest.approx(
        (0.3**2 + 0.07071067811865476**2) ** 0.5 / 2**0.5, rel=1e-9
    )
    assert sig.normalized_separation is not None and sig.normalized_separation >= 0.0
    assert 0.0 < sig.match_p_value <= 1.0
    assert any("independent" in item for item in sig.assumptions)


def test_significance_is_null_not_fabricated_when_data_missing(association_env) -> None:
    install, settings, cache = association_env
    service, _stub = _wire(
        install, [_gaia_source(ra=TARGET_RA, dec=TARGET_DEC, source_id=2, ra_error_mas=None, dec_error_mas=None)]
    )
    _seed_source(settings, cache, position_scatter_arcsec=None)

    response = service.associate(_SOURCE_ID)

    assert response.status == "MATCHED"
    assert response.significance.combined_sigma_arcsec is None
    assert response.significance.match_p_value is None
    assert response.significance.limitation and "significance not evaluated" in response.significance.limitation


def test_no_candidate_is_unmatched_and_never_forced(association_env) -> None:
    install, settings, cache = association_env
    service, _stub = _wire(install, [])
    _seed_source(settings, cache)

    response = service.associate(_SOURCE_ID)

    assert response.status == "UNMATCHED"
    assert response.best is None
    assert response.candidates == []
    assert response.significance.limitation and "No candidate" in response.significance.limitation


def test_ambiguous_candidates_are_all_preserved(association_env) -> None:
    install, settings, cache = association_env
    service, _stub = _wire(
        install,
        [
            _gaia_source(ra=TARGET_RA + 0.5 / 3600.0, dec=TARGET_DEC, source_id=11),
            _gaia_source(ra=TARGET_RA - 0.5 / 3600.0 / 0.7, dec=TARGET_DEC, source_id=12),
        ],
    )
    _seed_source(settings, cache)

    response = service.associate(_SOURCE_ID, CrossMatchConfig(radius_arcsec=3.0))

    assert response.status == "AMBIGUOUS"
    assert response.best is None
    assert len(response.candidates) == 2
    assert {c.gaia_source_id for c in response.candidates} == {"11", "12"}
    assert response.ambiguity_note
    assert response.significance.match_p_value is None
    assert "ambiguous" in response.significance.limitation


def test_observation_epoch_derived_from_detection_timestamps(association_env) -> None:
    install, settings, cache = association_env
    service, _stub = _wire(install, [])
    _seed_source(settings, cache, time_mjd=61177.27)

    response = service.associate(_SOURCE_ID)

    assert response.observation_epoch.julian_year == pytest.approx(2026.37, abs=0.1)  # MJD 61177.27
    assert "detection timestamps" in response.observation_epoch.basis
    assert response.observation_epoch.detection_count == 1


def test_epoch_without_timestamps_reports_limitation(association_env) -> None:
    install, settings, cache = association_env
    service, _stub = _wire(
        install, [_gaia_source(ra=TARGET_RA, dec=TARGET_DEC, source_id=3, pmra=-500.0, pmdec=200.0)]
    )
    _seed_source(settings, cache, time_mjd=None)

    response = service.associate(_SOURCE_ID)

    assert response.observation_epoch.julian_year is None
    assert response.observation_epoch.limitation and "No detection timestamps" in response.observation_epoch.limitation
    assert response.propagation.propagated is False  # no epoch → no propagation


def test_propagation_uses_the_derived_observation_epoch(association_env) -> None:
    # The Phase 3 source sits where the star has moved TO by 2026.37; only
    # propagation from the Gaia catalogue epoch can close that gap.
    star = _gaia_source(ra=TARGET_RA, dec=TARGET_DEC, source_id=4, pmra=-500.0, pmdec=200.0)
    from app.services.catalog_crossmatch import epoch_propagation

    moved = epoch_propagation(star, 2026.3730869267624)
    assert moved.propagated is True
    install, settings, cache = association_env
    service, _stub = _wire(install, [star])
    _seed_source(settings, cache, ra=moved.propagated_ra, dec=moved.propagated_dec, time_mjd=61177.27)

    response = service.associate(_SOURCE_ID)

    assert response.propagation.propagated is True
    assert response.propagation.requested_epoch == pytest.approx(2026.37, abs=0.1)
    assert response.status == "MATCHED"
    assert response.best.gaia_source_id == "4"


def test_unknown_and_gaia_style_ids_follow_the_phase3_contract(association_env) -> None:
    from app.core.exceptions import SourceNotFoundError

    install, _settings, _cache = association_env
    service, _stub = _wire(install, [])

    with pytest.raises(SourceNotFoundError):
        service.associate("f" * 32)          # well-formed but unknown
    with pytest.raises(SourceNotFoundError):
        service.associate(_GAIA_STYLE_ID)    # a Gaia-style id is not an internal id


def test_significance_p_value_matches_the_rayleigh_tail(association_env) -> None:
    """Pin the corrected Rayleigh tail: seed the source exactly one combined
    per-axis sigma away, so p must equal exp(-0.5) ~= 0.60653."""
    import math

    install, settings, cache = association_env
    sigma_comb = (0.3**2 + 0.07071067811865476**2) ** 0.5 / 2**0.5  # ~0.2179"
    offset_ra_deg = (sigma_comb / 3600.0) / math.cos(math.radians(TARGET_DEC))
    service, _stub = _wire(install, [_gaia_source(ra=TARGET_RA + offset_ra_deg, dec=TARGET_DEC, source_id=9)])
    _seed_source(settings, cache, position_scatter_arcsec=0.3)

    response = service.associate(_SOURCE_ID)

    assert response.status == "MATCHED"
    assert response.significance.match_p_value == pytest.approx(math.exp(-0.5), rel=1e-6)


def test_significance_falls_back_to_phase3_only_when_one_gaia_error_is_missing(association_env) -> None:
    install, settings, cache = association_env
    service, _stub = _wire(
        install,
        [_gaia_source(ra=TARGET_RA, dec=TARGET_DEC, source_id=10, ra_error_mas=50.0, dec_error_mas=None)],
    )
    _seed_source(settings, cache, position_scatter_arcsec=0.3)

    response = service.associate(_SOURCE_ID)

    sig = response.significance
    assert sig.gaia_sigma_arcsec is None  # one missing Gaia error -> Gaia term unusable
    assert sig.combined_sigma_arcsec == pytest.approx(0.3 / 2**0.5, rel=1e-9)
    assert any("only one of the two uncertainty sources" in item for item in sig.assumptions)
    assert 0.0 < sig.match_p_value <= 1.0


def test_propagated_match_significance_uses_the_propagated_separation(association_env) -> None:
    """A candidate matched only via propagation must not get its significance
    from the huge unpropagated offset."""
    import math

    from app.services.catalog_crossmatch import epoch_propagation

    install, settings, cache = association_env
    star = _gaia_source(ra=TARGET_RA, dec=TARGET_DEC, source_id=14, pmra=-500.0, pmdec=200.0)
    moved = epoch_propagation(star, 2026.3730869267624)
    service, _stub = _wire(install, [star])
    # Seed the source within 0.5" of where the star propagates TO, with a tight
    # scatter so the unpropagated offset (~7") would give a tiny p-value.
    _seed_source(
        settings,
        cache,
        ra=moved.propagated_ra + math.radians(0.5 / 3600.0) / math.cos(math.radians(TARGET_DEC)),
        dec=moved.propagated_dec,
        time_mjd=61177.27,
        position_scatter_arcsec=0.3,
    )

    response = service.associate(_SOURCE_ID)

    assert response.propagation.propagated is True
    assert response.status == "MATCHED"
    # separation_arcsec is the propagated separation (~0.5"), not the
    # unpropagated ~7" one - the normalized separation must reflect that.
    assert response.best.separation_arcsec < 1.0
    assert response.significance.normalized_separation < 1.0


def test_epoch_sampling_cap_takes_the_most_recent_200_timestamps(association_env) -> None:
    from astropy.time import Time

    from app.schemas.lightcurve import MatchedDetection
    from app.schemas.photometry import FluxMeasurement

    install, settings, cache = association_env
    service, _stub = _wire(install, [])
    # 201 detections: the first is a far-past outlier (MJD 40000), the rest sit
    # at MJD 60001..60200. The cap must keep the LAST 200 (mean 60100.5); if it
    # kept the first 200 instead, the outlier would drag the mean to ~59050.
    detections = [
        MatchedDetection(
            measurement=FluxMeasurement(
                detection_id=f"det-{i}", observation_id=f"obs-{i}",
                time_mjd=40000.0 if i == 0 else 60000.0 + i,
                x=10.0, y=10.0, aperture_radius_px=6.0, aperture_area_px=113.0,
                aperture_valid_fraction=1.0, psf_fwhm_px=2.0, fwhm_source="psf",
                quality="PASS",
            ),
            epoch_key=f"e{i}",
        )
        for i in range(201)
    ]
    record = _seed_source(settings, cache, time_mjd=None)
    record.source.detections = detections  # test-only injection on the returned record
    SourceCatalogService(settings, cache)._write(  # noqa: SLF001
        settings.sources_dir / f"{_SOURCE_ID}.json", record
    )
    cache.sources.set(_SOURCE_ID, None)  # drop the cached record so it re-reads

    response = service.associate(_SOURCE_ID)

    assert response.observation_epoch.detection_count == 200
    assert response.observation_epoch.julian_year == pytest.approx(
        float(Time(60100.5, format="mjd").jyear), abs=1e-6
    )
    assert "200" in response.observation_epoch.basis


def test_cone_query_is_cached_across_association_calls(association_env) -> None:
    install, settings, cache = association_env
    service, stub = _wire(install, [_gaia_source(ra=TARGET_RA, dec=TARGET_DEC, source_id=5)])
    _seed_source(settings, cache)

    first = service.associate(_SOURCE_ID)
    second = service.associate(_SOURCE_ID)

    assert first.best.gaia_source_id == second.best.gaia_source_id
    assert len(stub.calls) == 1  # the cone query itself is cached (cache.gaia)


# --------------------------------------------------------------------- API level
def test_api_source_catalogs_success(association_env) -> None:
    install, settings, cache = association_env
    _wire(install, [_gaia_source(ra=TARGET_RA, dec=TARGET_DEC, source_id=777)])
    _seed_source(settings, cache)
    from fastapi.testclient import TestClient

    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.get(f"/api/v1/sources/{_SOURCE_ID}/catalogs")

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["success"] is True
    assert body["planetx_source_id"] == _SOURCE_ID
    assert body["status"] == "MATCHED"
    assert body["best"]["gaia_source_id"] == "777"
    assert body["significance"]["combined_sigma_arcsec"] is not None


def test_api_source_catalogs_missing_and_malformed_ids(association_env) -> None:
    install, settings, cache = association_env
    _wire(install, [])
    _seed_source(settings, cache, source_id=_OTHER_ID)
    from fastapi.testclient import TestClient

    with TestClient(app, raise_server_exceptions=False) as client:
        missing = client.get(f"/api/v1/sources/{'f' * 32}/catalogs")
        malformed = client.get(f"/api/v1/sources/{_GAIA_STYLE_ID}/catalogs")

    assert missing.status_code == 404
    assert missing.json()["error"]["code"] == "SOURCE_NOT_FOUND"
    assert malformed.status_code == 404
    assert malformed.json()["error"]["code"] == "SOURCE_NOT_FOUND"


def test_api_gaia_failure_is_not_an_empty_success(association_env) -> None:
    from app.core.exceptions import GaiaUnavailableError
    from fastapi.testclient import TestClient

    install, settings, cache = association_env
    _wire(install, [])
    _seed_source(settings, cache)

    class FailingStub(StubGaiaService):
        def cone_search(self, **kwargs):
            raise GaiaUnavailableError("Archive down")

    failing = SourceGaiaAssociationService(
        SourceCatalogService(settings, cache), CatalogCrossMatcher(FailingStub([])), settings
    )
    from app.api import deps

    app.dependency_overrides[deps.get_source_gaia_association] = lambda: failing
    try:
        with TestClient(app, raise_server_exceptions=False) as client:
            response = client.get(f"/api/v1/sources/{_SOURCE_ID}/catalogs")
    finally:
        app.dependency_overrides.pop(deps.get_source_gaia_association, None)

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "GAIA_UNAVAILABLE"


def test_phase4_spectra_remain_intact_alongside_association(association_env) -> None:
    """Association must not disturb source-scoped Phase 4 retrieval or uncertainty."""
    install, settings, cache = association_env
    _wire(install, [])
    _seed_source(settings, cache)
    from fastapi.testclient import TestClient

    with TestClient(app, raise_server_exceptions=False) as client:
        listing = client.get(f"/api/v1/sources/{_SOURCE_ID}/spectra")

    assert listing.status_code == 200
    assert listing.json()["spectra"] == []
