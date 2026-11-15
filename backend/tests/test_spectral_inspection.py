from __future__ import annotations

import pytest

from app.services.spectral_inspection import inspect_spectral_product
from tests.conftest import (
    TARGET_DEC,
    TARGET_RA,
    make_cube_fits_bytes,
    make_spectral_image_fits_bytes,
)


def test_inspects_cube_channels_flags_and_target_pixel(tmp_path, settings):
    path = tmp_path / "cube.fits"
    path.write_bytes(make_cube_fits_bytes())

    inspection = inspect_spectral_product(
        path,
        target_ra=TARGET_RA,
        target_dec=TARGET_DEC,
        row={"collection": settings.spectral_collection, "npix": 9621, "order": 5},
        settings=settings,
    )

    assert inspection.product_format == "cube"
    assert inspection.shape == [5, 8, 8]
    assert inspection.spatial_shape == [8, 8]
    assert inspection.channels.source == "SPECTRAL_CHANNELS"
    assert inspection.channels.channel_count == 5
    assert inspection.channels.wavelength_min_um == pytest.approx(0.75)
    assert inspection.channels.wavelength_max_um == pytest.approx(4.98)
    assert inspection.channels.monotonic is True
    assert inspection.channels.blank_channels == [2]
    assert inspection.channels.detectors == [1]
    assert inspection.flags_available is True
    assert inspection.nhits_available is True
    assert inspection.variance_available is False
    assert inspection.flag_bits["SOURCE"] == 1 << 21
    assert inspection.invalid_flag_bits == [1, 19]
    assert inspection.metadata.npix == 9621
    assert inspection.metadata.order == 5
    assert inspection.wcs.target_pixel == pytest.approx([4.5, 4.5])
    assert inspection.wcs.target_inside_image is True
    assert "no_variance_extension" in inspection.warnings
    assert "blank_channels_present" in inspection.warnings
    assert inspection.quality == "WARNING"


def test_inspects_single_channel_spectral_image_wcs_wave(tmp_path, settings):
    path = tmp_path / "image.fits"
    path.write_bytes(make_spectral_image_fits_bytes())

    inspection = inspect_spectral_product(
        path,
        target_ra=TARGET_RA,
        target_dec=TARGET_DEC,
        settings=settings,
    )

    assert inspection.product_format == "spectral_image"
    assert inspection.channels.source == "WCS-WAVE"
    assert inspection.channels.available is True
    assert inspection.spectral_image_wavelength is not None
    assert inspection.spectral_image_wavelength.method == "bilinear_wcs_wave"
    assert inspection.spectral_image_wavelength.wavelength_um == pytest.approx(2.045)
    assert inspection.spectral_image_wavelength.bandwidth_um == pytest.approx(0.05)
    assert inspection.variance_available is True
    assert "wcs_wave_is_visualization_grade" in inspection.warnings
    assert inspection.quality == "WARNING"


def test_marks_a_2d_product_without_wcs_wave_unsupported(tmp_path, settings):
    from tests.conftest import make_sky_fits_bytes

    path = tmp_path / "plain.fits"
    path.write_bytes(make_sky_fits_bytes())

    inspection = inspect_spectral_product(path, settings=settings)

    assert inspection.product_format == "unsupported"
    assert inspection.quality == "FAIL"
    assert inspection.warnings == ["unsupported_product_format"]
