from __future__ import annotations

import pytest

from app.schemas.spectra import (
    SpectralChannel,
    SpectralComparisonConfig,
    SpectralQualitySummary,
    Spectrum,
)
from app.services.spectral_comparison import compare_spectra


def make_spectrum(
    spectrum_id: str,
    *,
    product_id: str = "product-a",
    wavelengths=(1.0, 2.0, 3.0),
    fluxes=(10.0, 20.0, 30.0),
) -> Spectrum:
    channels = [
        SpectralChannel(
            index=index,
            wavelength_um=wavelength,
            flux_mjy_sr=flux,
            uncertainty_mjy_sr=None,
            quality="PASS" if flux is not None else "FAIL",
        )
        for index, (wavelength, flux) in enumerate(zip(wavelengths, fluxes))
    ]
    valid = sum(1 for channel in channels if channel.flux_mjy_sr is not None)
    return Spectrum(
        spectrum_id=spectrum_id,
        collection="spherex_dr1_cube",
        product_id=product_id,
        ra_deg=150.0,
        dec_deg=-40.0,
        channel_count=len(channels),
        valid_channel_count=valid,
        channels=channels,
        quality=SpectralQualitySummary(
            overall_status="WARNING",
            uncertainty_status="NOT_VERIFIED",
            warnings=["no_variance_extension"],
        ),
        limitations=["cube_is_static_mosaic"],
    )


def test_same_spectrum_comparison_is_explicitly_identical():
    response = compare_spectra(
        make_spectrum("a" * 32),
        make_spectrum("a" * 32),
        SpectralComparisonConfig(min_overlap_channels=3),
    )

    assert response.comparison_basis == "same_spectrum"
    assert response.grid_compatible is True
    assert response.overlap_channel_count == 3
    assert response.quality.overall_status == "WARNING"
    assert response.quality.uncertainty_status == "NOT_VERIFIED"
    assert "identical_spectrum" in response.warnings
    assert "no_uncertainty_available" in response.warnings
    assert response.channels[0].difference_mjy_sr == pytest.approx(0.0)
    assert response.channels[0].ratio == pytest.approx(1.0)
    assert response.algorithm_version


def test_different_products_match_by_wavelength_not_array_position():
    first = make_spectrum("a" * 32, product_id="product-a", wavelengths=(1.0, 2.0, 3.0), fluxes=(10.0, 20.0, 30.0))
    second = make_spectrum(
        "b" * 32,
        product_id="product-b",
        wavelengths=(3.00001, 2.00001, 1.00001),
        fluxes=(15.0, 25.0, 35.0),
    )

    comparison = compare_spectra(first, second, SpectralComparisonConfig(min_overlap_channels=3))

    assert comparison.comparison_basis == "different_products_static_mosaic"
    assert comparison.grid_compatible is True
    assert [channel.index_a for channel in comparison.channels] == [0, 1, 2]
    assert [channel.index_b for channel in comparison.channels] == [2, 1, 0]
    assert comparison.channels[0].difference_mjy_sr == pytest.approx(-25.0)
    assert comparison.channels[0].ratio == pytest.approx(10.0 / 35.0)
    assert "static_mosaic_no_epoch_information" in comparison.warnings
    assert "cube_is_static_mosaic_no_epoch_comparison" in comparison.limitations


def test_no_wavelength_overlap_fails_without_fabricating_channels():
    first = make_spectrum("a" * 32, wavelengths=(1.0, 2.0, 3.0))
    second = make_spectrum("b" * 32, wavelengths=(4.0, 5.0, 6.0))

    comparison = compare_spectra(first, second)

    assert comparison.grid_compatible is False
    assert comparison.overlap_channel_count == 0
    assert comparison.channels == []
    assert comparison.quality.overall_status == "FAIL"
    assert "insufficient_overlap_channels" in comparison.warnings
    assert "wavelength_grid_not_identical" in comparison.warnings


def test_minimum_overlap_controls_failure():
    first = make_spectrum("a" * 32, wavelengths=(1.0, 2.0, 3.0))
    second = make_spectrum("b" * 32, wavelengths=(1.0, 2.0, 3.0))

    comparison = compare_spectra(first, second, SpectralComparisonConfig(min_overlap_channels=4))

    assert comparison.overlap_channel_count == 3
    assert comparison.quality.overall_status == "FAIL"
    assert "insufficient_overlap_channels" in comparison.warnings
