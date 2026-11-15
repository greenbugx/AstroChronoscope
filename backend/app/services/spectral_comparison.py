"""Compare two extracted cube spectra on a matched wavelength grid.

The DR1 cube is a static survey mosaic. Two cube spectra therefore differ because
they sample different positions (or products), not because they are two epochs of
the same source. The comparison reports that basis explicitly and never claims
temporal variability.

Only channels that are valid in both spectra are paired. Pairing is by central
wavelength, not by array position, so a reordered or subset channel table is
handled honestly. Missing uncertainty remains missing: no significance is
computed from a variance that the cube does not provide.
"""

from __future__ import annotations

from datetime import datetime, timezone

from app.core.versions import SPECTRAL_ALGORITHM_VERSION
from app.schemas.spectra import (
    SpectralComparison,
    SpectralComparisonChannel,
    SpectralComparisonConfig,
    SpectralComparisonResponse,
    SpectralQualitySummary,
    Spectrum,
)
from app.services.spectrum_catalog import SpectrumCatalogService

_ZERO_EPSILON = 1e-30


class SpectralComparisonService:
    def __init__(self, catalog: SpectrumCatalogService) -> None:
        self.catalog = catalog

    def compare(self, spectrum_id_a: str, spectrum_id_b: str, config: SpectralComparisonConfig) -> SpectralComparisonResponse:
        first = self.catalog.get(spectrum_id_a).spectrum
        second = self.catalog.get(spectrum_id_b).spectrum
        return SpectralComparisonResponse(comparison=compare_spectra(first, second, config))


def compare_spectra(
    first: Spectrum,
    second: Spectrum,
    config: SpectralComparisonConfig | None = None,
) -> SpectralComparison:
    config = config or SpectralComparisonConfig()
    valid_a = _valid_channels(first)
    valid_b = _valid_channels(second)
    matched, unmatched_a, unmatched_b = _match_channels(
        valid_a, valid_b, config.wavelength_tolerance_um
    )

    grid_compatible = (
        len(matched) == len(valid_a) == len(valid_b) and bool(valid_a) and bool(valid_b)
    )
    warnings: list[str] = ["no_uncertainty_available", "static_mosaic_no_epoch_information"]
    if first.spectrum_id == second.spectrum_id:
        basis = "same_spectrum"
        warnings.append("identical_spectrum")
    elif first.product_id == second.product_id:
        basis = "same_product_static_mosaic"
    else:
        basis = "different_products_static_mosaic"
    if not grid_compatible:
        warnings.append("wavelength_grid_not_identical")
    if len(matched) < config.min_overlap_channels:
        warnings.append("insufficient_overlap_channels")

    channels = [
        SpectralComparisonChannel(
            index_a=channel_a.index,
            index_b=channel_b.index,
            wavelength_um=channel_a.wavelength_um,
            flux_a_mjy_sr=channel_a.flux_mjy_sr,
            flux_b_mjy_sr=channel_b.flux_mjy_sr,
            difference_mjy_sr=_difference(channel_a.flux_mjy_sr, channel_b.flux_mjy_sr),
            ratio=_ratio(channel_a.flux_mjy_sr, channel_b.flux_mjy_sr),
            quality="PASS",
        )
        for channel_a, channel_b in matched
    ]
    if unmatched_a or unmatched_b:
        warnings.append("unmatched_valid_channels_excluded")

    status = "FAIL" if len(matched) < config.min_overlap_channels else "WARNING"
    warnings = list(dict.fromkeys(warnings))
    return SpectralComparison(
        spectrum_id_a=first.spectrum_id,
        spectrum_id_b=second.spectrum_id,
        product_id_a=first.product_id,
        product_id_b=second.product_id,
        comparison_basis=basis,
        grid_compatible=grid_compatible,
        overlap_channel_count=len(matched),
        channels=channels,
        quality=SpectralQualitySummary(
            overall_status=status,
            uncertainty_status="NOT_VERIFIED",
            warnings=warnings,
        ),
        warnings=warnings,
        limitations=[
            "cube_is_static_mosaic_no_epoch_comparison",
            "no_variance_extension_no_uncertainty_or_significance",
            "surface_brightness_not_integrated_flux",
            f"wavelength_match_tolerance_um_{config.wavelength_tolerance_um:g}",
        ],
        algorithm_version=SPECTRAL_ALGORITHM_VERSION,
        created_at=datetime.now(timezone.utc).isoformat(),
    )


def _valid_channels(spectrum: Spectrum):
    return sorted(
        (
            channel
            for channel in spectrum.channels
            if channel.wavelength_um is not None
            and channel.wavelength_um > 0
            and channel.flux_mjy_sr is not None
        ),
        key=lambda channel: channel.wavelength_um,
    )


def _match_channels(valid_a, valid_b, tolerance_um: float):
    used_b: set[int] = set()
    matched = []
    unmatched_a = []
    for channel_a in valid_a:
        best_index: int | None = None
        best_delta = float("inf")
        for index_b, channel_b in enumerate(valid_b):
            if index_b in used_b:
                continue
            delta = abs(channel_a.wavelength_um - channel_b.wavelength_um)
            if delta <= tolerance_um and delta < best_delta:
                best_index = index_b
                best_delta = delta
        if best_index is None:
            unmatched_a.append(channel_a)
            continue
        used_b.add(best_index)
        matched.append((channel_a, valid_b[best_index]))
    unmatched_b = [channel for index, channel in enumerate(valid_b) if index not in used_b]
    matched.sort(key=lambda pair: pair[0].wavelength_um)
    return matched, unmatched_a, unmatched_b


def _difference(first: float | None, second: float | None) -> float | None:
    if first is None or second is None:
        return None
    return float(first - second)


def _ratio(first: float | None, second: float | None) -> float | None:
    if first is None or second is None or abs(second) <= _ZERO_EPSILON:
        return None
    return float(first / second)


__all__ = ["SpectralComparisonService", "compare_spectra"]
