"""Gaia DR3 catalog schemas: cone search, cross-match and provenance.

Units are the Archive's own and are stated per field:

* positions and separations: degrees / arcseconds
* position and parallax errors: milliarcseconds (mas)
* proper motion: mas yr⁻¹ (``pmra`` includes cos(dec))
* photometry: mag (mean integrated magnitudes)

Missing catalog measurements stay ``null``; they are never replaced by zero or a
placeholder. ``source_id`` is exposed as a string because it is an opaque identifier
from a TAP ``long`` column and must survive JavaScript number handling untouched.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import Field

from app.schemas.common import StrictModel

#: Gaia DR3 positions are given at this Julian epoch (verified: ``ref_epoch`` column).
GAIA_DR3_REFERENCE_EPOCH = 2016.0

#: Name of the catalog as reported by the Archive TAP service.
GAIA_DR3_CATALOG = "Gaia DR3"

MATCH_STATUS = Literal["MATCHED", "AMBIGUOUS", "UNMATCHED"]


class GaiaProvenance(StrictModel):
    """Retrieval provenance for catalog records."""

    catalog: str = GAIA_DR3_CATALOG
    retrieved_at: str
    query_reference: str | None = None
    tap_endpoint: str


class GaiaCoordinates(StrictModel):
    """Catalogued ICRS position and its reference epoch."""

    ra: float
    dec: float
    reference_epoch: float = GAIA_DR3_REFERENCE_EPOCH
    ra_error_mas: float | None = None
    dec_error_mas: float | None = None


class GaiaAstrometry(StrictModel):
    """Five- and six-parameter astrometry. ``null`` means the Archive has no value."""

    parallax_mas: float | None = None
    parallax_error_mas: float | None = None
    pmra_mas_yr: float | None = None
    pmdec_mas_yr: float | None = None
    pmra_error_mas_yr: float | None = None
    pmdec_error_mas_yr: float | None = None
    ruwe: float | None = None
    #: RUWE above ~1.4 indicates the single-star astrometric model fits poorly; it is a
    #: quality indicator, never a validity criterion on its own.
    ruwe_note: str = (
        "Renormalised unit weight error; values much above 1.4 suggest the single-star "
        "model is inadequate (binary motion, extended source, or excess noise)"
    )


class GaiaPhotometry(StrictModel):
    """Mean integrated magnitudes (mag). ``null`` when the band was not measured."""

    g: float | None = None
    bp: float | None = None
    rp: float | None = None


class GaiaSource(StrictModel):
    """One normalized Gaia DR3 record."""

    catalog: str = GAIA_DR3_CATALOG
    source_id: str
    coordinates: GaiaCoordinates
    astrometry: GaiaAstrometry
    photometry: GaiaPhotometry
    provenance: GaiaProvenance


# ------------------------------------------------------------------- cone search
class GaiaConeSearchMetadata(StrictModel):
    """Normalized query parameters as they were executed."""

    ra: float
    dec: float
    radius_arcsec: float
    magnitude_limit: float | None = None
    limit: int
    total_found: int
    truncated: bool


class GaiaConeSearchResponse(StrictModel):
    success: Literal[True] = True
    catalog: str = GAIA_DR3_CATALOG
    query: GaiaConeSearchMetadata
    sources: list[GaiaSource]
    #: Arcsecond separation from the query centre, ordered ascending; same length as
    #: ``sources``. Recomputed client-side with spherical geometry.
    separations_arcsec: list[float]


# ------------------------------------------------------------------ cross-match
class CrossMatchTarget(StrictModel):
    """One external coordinate to match against Gaia."""

    external_id: str = Field(..., min_length=1, max_length=256)
    ra: float = Field(..., ge=0.0, lt=360.0, allow_inf_nan=False)
    dec: float = Field(..., ge=-90.0, le=90.0, allow_inf_nan=False)
    #: Observation epoch in Julian years (e.g. 2025.5). ``None`` means "unknown"; the
    #: Gaia reference position is then used without propagation.
    epoch: float | None = Field(None, ge=1000.0, le=3000.0)
    #: 1-sigma positional uncertainty of the external source, arcseconds.
    uncertainty_arcsec: float | None = Field(None, gt=0.0)


class CrossMatchCandidate(StrictModel):
    """A Gaia source inside the requested radius of an external coordinate."""

    separation_arcsec: float
    separation_propagated_arcsec: float | None = None
    source: GaiaSource


class CrossMatchEpochInfo(StrictModel):
    """Whether positions were propagated to the external epoch, and how."""

    requested_epoch: float | None = None
    gaia_reference_epoch: float = GAIA_DR3_REFERENCE_EPOCH
    propagated: bool = False
    propagated_ra: float | None = None
    propagated_dec: float | None = None
    #: Why no propagation happened (missing PM, same epoch, disabled, …).
    limitation: str | None = None


class CrossMatchResult(StrictModel):
    """Outcome for one external coordinate. Never forces a match."""

    external_id: str
    status: MATCH_STATUS
    candidates: list[CrossMatchCandidate]
    best: CrossMatchCandidate | None = None
    ambiguity_note: str | None = None
    epoch: CrossMatchEpochInfo


class CrossMatchConfig(StrictModel):
    radius_arcsec: float = Field(3.0, gt=0.0, le=60.0)
    #: Flag the match as AMBIGUOUS when more than this many candidates fall inside
    #: the radius (1 = never flag ambiguity by count alone).
    ambiguous_when_more_than: int = Field(1, ge=1)
    propagate_proper_motion: bool = True
    #: Extra cone-search margin (arcseconds) applied when epoch propagation is active,
    #: so a source that moves into the match radius between the Gaia epoch and the
    #: target epoch can still be found. It improves recall; it cannot guarantee
    #: completeness for high proper-motion sources (see docs).
    propagation_margin_arcsec: float = Field(5.0, ge=0.0, le=30.0)


class CrossMatchRequest(StrictModel):
    """Cross-match request: external coordinates plus optional configuration."""

    coordinates: list[CrossMatchTarget] = Field(..., min_length=1, max_length=1000)
    config: CrossMatchConfig = Field(default_factory=CrossMatchConfig)


class CrossMatchResponse(StrictModel):
    success: Literal[True] = True
    catalog: str = GAIA_DR3_CATALOG
    config: CrossMatchConfig
    results: list[CrossMatchResult]
    matched: int
    ambiguous: int
    unmatched: int


class GaiaSourceResponse(StrictModel):
    success: Literal[True] = True
    source: GaiaSource


# -------------------------------------------------- Phase 3 source association
class GaiaAssociationCandidate(StrictModel):
    """One Gaia candidate for an internal Planet X source.

    ``gaia_source_id`` is Gaia's numeric identifier (stringified TAP ``long``);
    it is never the internal 32-hex Planet X ``source_id``.
    """

    gaia_source_id: str
    separation_arcsec: float
    separation_propagated_arcsec: float | None = None
    source: GaiaSource


class GaiaAssociationSignificance(StrictModel):
    """Scalar positional-uncertainty statistic for the best candidate.

    Assumptions (see ``method``/``assumptions``): independent Gaussian per-axis
    errors, Rayleigh-distributed radial offset, no covariance terms and no
    propagated-error growth. ``match_p_value`` is the probability of a separation
    at least this large if the candidate were the true counterpart at zero
    offset — it is not a probability of physical association.
    """

    method: str = "combined_scalar_sigma_rayleigh"
    assumptions: tuple[str, ...] = (
        "independent Gaussian per-axis errors; the reported phase3/gaia sigmas are "
        "radial-RMS uncertainties and combined_sigma_arcsec is their isotropic "
        "per-axis equivalent (radial RMS / sqrt(2))",
        "no covariance terms and no propagated-error growth",
        "position_scatter_arcsec is an empirical multi-epoch scatter, not a formal single-epoch error",
    )
    phase3_sigma_arcsec: float | None = None
    gaia_sigma_arcsec: float | None = None
    combined_sigma_arcsec: float | None = None
    normalized_separation: float | None = None
    match_p_value: float | None = None
    limitation: str | None = None


class GaiaAssociationEpoch(StrictModel):
    """Observation epoch derived from the Phase 3 detections."""

    julian_year: float | None = None
    basis: str | None = None
    detection_count: int = 0
    limitation: str | None = None


class SourceGaiaAssociationResponse(StrictModel):
    """Gaia DR3 association for one persisted Phase 3 source.

    ``planetx_source_id`` is the internal 32-hex identifier; every
    ``gaia_source_id`` in ``candidates`` is Gaia's own numeric id. The two are
    never interchangeable.
    """

    success: Literal[True] = True
    planetx_source_id: str
    reference_ra_deg: float
    reference_dec_deg: float
    status: MATCH_STATUS
    candidates: list[GaiaAssociationCandidate]
    best: GaiaAssociationCandidate | None = None
    ambiguity_note: str | None = None
    config: CrossMatchConfig
    observation_epoch: GaiaAssociationEpoch
    #: Whether/how Gaia's catalogue position was propagated to the observation
    # epoch (missing PM, no epoch, ... is reported in ``limitation``).
    propagation: CrossMatchEpochInfo
    significance: GaiaAssociationSignificance
    phase3: dict[str, Any] | None = None
    provenance: GaiaProvenance | None = None
