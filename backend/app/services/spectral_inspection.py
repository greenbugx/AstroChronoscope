"""Inspect SPHEREx spectral FITS products without pretending they are spectra.

Two formats are genuine in DR1:

* ``cube`` - the all-sky cube, with a channel table (``SPECTRAL_CHANNELS``), a
  3-D ``IMAGE`` extension and no variance plane.
* ``spectral_image`` - a single detector image whose ``WCS-WAVE`` table maps one
  pixel to one wavelength. It is useful for channel-level inspection, not for
  extracting a spectrum.

The inspector reports what is actually present. It does not invent a variance
plane, an epoch axis, or a wavelength calibration that the file does not contain.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import numpy as np
from astropy.io import fits
from astropy.wcs import WCS

from app.core.config import Settings, get_settings
from app.schemas.image_processing import HduInfo, WcsValidation
from app.schemas.spectra import (
    SpectralChannelsInfo,
    SpectralImageWavelength,
    SpectralInspection,
    SpectralMetadata,
)
from app.services.image_inspection import file_sha256, pixel_scale_arcsec
from app.services.fits_service import verify_fits

log = logging.getLogger(__name__)

_CUBE_FLAG_DEFINITIONS = {
    "OVERFLOW": "Channel value overflowed the calibrated range (bit 1)",
    "OUTLIER": "Channel rejected as an outlier (bit 19)",
    "SOURCE": "Pixel maps to a known source; informational, not a rejection (bit 21)",
}
_CUBE_FLAG_BITS = {"OVERFLOW": 1, "OUTLIER": 19, "SOURCE": 21}
_WCS_WAVE_NAMES = ("WCS-WAVE", "WCS_WAVE", "WCSWAVE")


def inspect_spectral_product(
    path: Path,
    *,
    target_ra: float | None = None,
    target_dec: float | None = None,
    source: str = "product",
    source_url: str | None = None,
    row: dict[str, Any] | None = None,
    settings: Settings | None = None,
) -> SpectralInspection:
    """Inspect a cube or spectral image and return an explicit capability report."""
    settings = settings or get_settings()
    verify_fits(path)
    row = row or {}

    with fits.open(path, memmap=True) as hdul:
        hdus = _hdu_list(hdul)
        image = _science_image(hdul)
        if image is None:
            return _unsupported(
                path,
                hdus,
                row=row,
                source=source,
                source_url=source_url,
                message="No IMAGE extension found",
            )

        data = image.data
        if data is None or data.ndim not in (2, 3):
            return _unsupported(
                path,
                hdus,
                row=row,
                source=source,
                source_url=source_url,
                message="IMAGE extension is not a 2-D or 3-D array",
            )

        wcs = _celestial_wcs(image.header, hdul)
        wcs_info = _wcs_validation(wcs, data.shape[-2:], target_ra, target_dec)
        metadata = _metadata(row, image.header, settings)
        flags_available = _has_data(hdul, "FLAGS")
        variance_available = _has_data(hdul, "VARIANCE")
        nhits_available = _has_data(hdul, "NHITS")
        flag_defs, flag_bits = _flag_definitions(hdul)
        bandpass = _channels_info(hdul, data.shape[0] if data.ndim == 3 else None)

        if data.ndim == 3:
            if bandpass.available:
                if not flag_defs:
                    flag_defs = dict(_CUBE_FLAG_DEFINITIONS)
                    flag_bits = {name: 1 << bit for name, bit in _CUBE_FLAG_BITS.items()}
                warnings = ["cube_is_static_mosaic", "no_variance_extension"]
                if bandpass.blank_channels:
                    warnings.append("blank_channels_present")
                if not flags_available:
                    warnings.append("no_flags_extension")
                quality = "WARNING"
                if wcs_info.available is False:
                    quality = "FAIL"
                return SpectralInspection(
                    product_format="cube",
                    source=source,  # type: ignore[arg-type]
                    source_url=source_url,
                    fits_sha256=file_sha256(path),
                    shape=list(data.shape),
                    spatial_shape=list(data.shape[-2:]),
                    bunit=_text(image.header.get("BUNIT")),
                    hdus=hdus,
                    channels=bandpass,
                    wcs=wcs_info,
                    flags_available=flags_available,
                    variance_available=variance_available,
                    nhits_available=nhits_available,
                    flag_bit_definitions=flag_defs,
                    flag_bits=flag_bits,
                    invalid_flag_bits=list(settings.spectral_invalid_flag_bits),
                    metadata=metadata,
                    quality=quality,
                    warnings=warnings,
                )
            return _unsupported(
                path,
                hdus,
                row=row,
                source=source,
                source_url=source_url,
                message="3-D product has no SPECTRAL_CHANNELS or WCS-WAVE table",
                shape=list(data.shape),
                wcs=wcs_info,
                metadata=metadata,
            )

        wave_image = _wcs_wave_at_target(hdul, wcs_info.target_pixel)
        if wave_image.method == "unavailable":
            return _unsupported(
                path,
                hdus,
                row=row,
                source=source,
                source_url=source_url,
                message="2-D product has no usable WCS-WAVE table",
                shape=list(data.shape),
                wcs=wcs_info,
                metadata=metadata,
            )

        warnings = ["wcs_wave_is_visualization_grade", "single_channel_product"]
        if not variance_available:
            warnings.append("no_variance_extension")
        return SpectralInspection(
            product_format="spectral_image",
            source=source,  # type: ignore[arg-type]
            source_url=source_url,
            fits_sha256=file_sha256(path),
            shape=list(data.shape),
            spatial_shape=list(data.shape[-2:]),
            bunit=_text(image.header.get("BUNIT")),
            hdus=hdus,
            channels=bandpass,
            wcs=wcs_info,
            spectral_image_wavelength=wave_image,
            flags_available=flags_available,
            variance_available=variance_available,
            nhits_available=nhits_available,
            flag_bit_definitions=flag_defs,
            flag_bits=flag_bits,
            invalid_flag_bits=[],
            metadata=metadata,
            quality="WARNING",
            warnings=warnings,
        )


def _unsupported(
    path: Path,
    hdus: list[HduInfo],
    *,
    row: dict[str, Any],
    source: str,
    source_url: str | None,
    message: str,
    shape: list[int] | None = None,
    wcs: WcsValidation | None = None,
    metadata: SpectralMetadata | None = None,
) -> SpectralInspection:
    return SpectralInspection(
        product_format="unsupported",
        source=source,  # type: ignore[arg-type]
        source_url=source_url,
        fits_sha256=file_sha256(path),
        shape=shape,
        hdus=hdus,
        wcs=wcs or WcsValidation(available=False, message=message),
        metadata=metadata or _metadata(row, fits.Header(), None),
        quality="FAIL",
        warnings=["unsupported_product_format"],
    )


def _science_image(hdul: fits.HDUList) -> fits.ImageHDU | None:
    named = next((hdu for hdu in hdul if str(hdu.name).upper() == "IMAGE" and hdu.data is not None), None)
    if named is not None:
        return named  # type: ignore[return-value]
    for hdu in hdul:
        if hdu.data is not None and not isinstance(hdu, (fits.BinTableHDU, fits.TableHDU)) and hdu.data.ndim >= 2:
            return hdu  # type: ignore[return-value]
    return None


def _has_data(hdul: fits.HDUList, name: str) -> bool:
    return any(str(hdu.name).upper() == name and hdu.data is not None for hdu in hdul)


def _find_table(hdul: fits.HDUList, names: tuple[str, ...]) -> fits.BinTableHDU | fits.TableHDU | None:
    wanted = {name.upper().replace("_", "-") for name in names}
    for hdu in hdul:
        if isinstance(hdu, (fits.BinTableHDU, fits.TableHDU)) and hdu.data is not None:
            if str(hdu.name).upper().replace("_", "-") in wanted:
                return hdu
    return None


def _hdu_list(hdul: fits.HDUList) -> list[HduInfo]:
    result: list[HduInfo] = []
    for index, hdu in enumerate(hdul):
        data = hdu.data
        if index == 0:
            kind = "primary"
        elif isinstance(hdu, (fits.ImageHDU, fits.CompImageHDU)):
            kind = "image"
        else:
            kind = "table"
        result.append(
            HduInfo(
                index=index,
                name=str(hdu.name),
                kind=kind,
                shape=list(data.shape) if data is not None else None,
                dtype=str(data.dtype) if data is not None else None,
                unit=_text(hdu.header.get("BUNIT")),
            )
        )
    return result


def _celestial_wcs(header: fits.Header, hdul: fits.HDUList | None = None) -> WCS | None:
    try:
        wcs = WCS(header, hdul, relax=True) if hdul is not None else WCS(header, relax=True)
    except Exception as exc:  # malformed WCS cards
        log.warning("spectral_wcs_parse_failed", extra={"error": str(exc)})
        return None
    if not wcs.has_celestial:
        return None
    return wcs.celestial


def _wcs_validation(
    wcs: WCS | None,
    spatial_shape: tuple[int, ...],
    target_ra: float | None,
    target_dec: float | None,
) -> WcsValidation:
    if wcs is None:
        return WcsValidation(available=False, message="FITS header has no celestial WCS")
    if len(spatial_shape) < 2:
        return WcsValidation(available=True, message="Image has no 2-D pixel grid")
    ny, nx = spatial_shape
    result = WcsValidation(
        available=True,
        ctype=[str(value) for value in wcs.wcs.ctype],
        projection=str(wcs.wcs.ctype[-1]).split("-")[-1] if wcs.wcs.ctype else None,
        has_sip=bool(getattr(wcs, "sip", None)),
        crval_ra_deg=_float(wcs.wcs.crval[0]) if len(wcs.wcs.crval) > 0 else None,
        crval_dec_deg=_float(wcs.wcs.crval[1]) if len(wcs.wcs.crval) > 1 else None,
        crpix=[float(value) for value in wcs.wcs.crpix] if len(wcs.wcs.crpix) >= 2 else None,
        pixel_scale_arcsec=pixel_scale_arcsec(wcs),
    )
    try:
        footprint = wcs.calc_footprint()
        result.footprint = [[float(value) for value in corner] for corner in footprint]
    except Exception:  # pragma: no cover - defensive
        pass
    try:
        center = wcs.pixel_to_world((nx - 1) / 2.0, (ny - 1) / 2.0)
        result.center_ra_deg = _float(center.ra.to_value("deg"))
        result.center_dec_deg = _float(center.dec.to_value("deg"))
        result.orientation_deg = _orientation_deg(wcs)
    except Exception:  # pragma: no cover - defensive
        pass

    if target_ra is not None and target_dec is not None:
        try:
            from astropy.coordinates import SkyCoord

            x, y = wcs.world_to_pixel(SkyCoord(ra=target_ra, dec=target_dec, unit="deg", frame="icrs"))
            px, py = float(np.asarray(x).item()), float(np.asarray(y).item())
            result.target_pixel = [px, py]
            result.target_inside_image = bool(0.0 <= px <= nx - 1 and 0.0 <= py <= ny - 1)
        except Exception as exc:  # pragma: no cover - defensive
            result.message = f"Could not map target to cube pixels: {exc}"
    return result


def _orientation_deg(wcs: WCS) -> float | None:
    import astropy.units as u

    try:
        first = wcs.pixel_to_world(0, 0)
        second = wcs.pixel_to_world(1, 0)
        return _float(first.position_angle(second).to_value(u.deg))
    except Exception:  # pragma: no cover - defensive
        return None


def _channels_info(hdul: fits.HDUList, channel_count: int | None) -> SpectralChannelsInfo:
    table = _find_table(hdul, ("SPECTRAL_CHANNELS", "SPECTRAL-CHANNELS"))
    if table is None:
        table = _find_table(hdul, _WCS_WAVE_NAMES)
        if table is None:
            return SpectralChannelsInfo()
        values = _wcs_wave_values(table)
        if values is None:
            return SpectralChannelsInfo()
        wavelengths = np.asarray(values[..., 0], dtype=float).ravel()
        wavelengths = wavelengths[np.isfinite(wavelengths) & (wavelengths > 0)]
        return SpectralChannelsInfo(
            available=True,
            source="WCS-WAVE",
            channel_count=channel_count,
            wavelength_unit="um",
            wavelength_min_um=_float(np.min(wavelengths)) if wavelengths.size else None,
            wavelength_max_um=_float(np.max(wavelengths)) if wavelengths.size else None,
            monotonic=None,
            has_bandwidth=bool(np.any(np.isfinite(values[..., 1]))),
        )

    columns = {name.upper(): name for name in table.columns.names}
    wave_name = columns.get("WAVELENGTH") or columns.get("WAVE") or columns.get("LAMBDA")
    waves = np.asarray(table.data[wave_name], dtype=float) if wave_name else np.array([], dtype=float)
    waves = waves[np.isfinite(waves) & (waves > 0)]
    detector_name = columns.get("DETECTOR")
    detectors = (
        sorted({int(value) for value in np.asarray(table.data[detector_name]).ravel() if np.isfinite(value)})
        if detector_name
        else []
    )
    blank_channels = _parse_blank_channels(table, len(table.data), hdul)
    return SpectralChannelsInfo(
        available=True,
        source="SPECTRAL_CHANNELS",
        channel_count=len(table.data),
        wavelength_unit="um",
        wavelength_min_um=_float(np.min(waves)) if waves.size else None,
        wavelength_max_um=_float(np.max(waves)) if waves.size else None,
        monotonic=_is_monotonic(waves),
        blank_channels=blank_channels,
        detectors=detectors,
        has_bandwidth=bool("BANDWIDTH" in columns),
        has_resolving_power=bool("R" in columns or "RESOLVING_POWER" in columns),
    )


def _parse_blank_channels(
    table: fits.BinTableHDU | fits.TableHDU,
    count: int,
    hdul: fits.HDUList | None = None,
) -> list[int]:
    value = table.header.get("BLANKCH")
    if value is None and hdul is not None:
        value = next((hdu.header.get("BLANKCH") for hdu in hdul if hdu.header.get("BLANKCH")), None)
    if value is None:
        return []
    result: set[int] = set()
    for token in str(value).replace(";", ",").split(","):
        token = token.strip().upper()
        if not token:
            continue
        if token.startswith("D") and ":" in token:
            detector, subchan = token[1:].split(":", 1)
            try:
                index = (int(detector) - 1) * 17 + (int(subchan) - 1)
            except ValueError:
                continue
            if 0 <= index < count:
                result.add(index)
        else:
            try:
                index = int(token)
            except ValueError:
                continue
            if 0 <= index < count:
                result.add(index)
    return sorted(result)


def _flag_definitions(hdul: fits.HDUList) -> tuple[dict[str, str], dict[str, int]]:
    flags = next((hdu for hdu in hdul if str(hdu.name).upper() == "FLAGS" and hdu.data is not None), None)
    if flags is None:
        return {}, {}
    definitions: dict[str, str] = {}
    bits: dict[str, int] = {}
    for index in range(32):
        name = flags.header.get(f"MSKN{index}") or flags.header.get(f"MSKN{index:04d}")
        if not name:
            continue
        description = flags.header.get(f"MSKD{index}") or flags.header.get(f"MSKD{index:04d}")
        key = str(name).upper()
        definitions[key] = str(description) if description else f"FLAGS bit {1 << index}"
        bits[key] = 1 << index
    return definitions, bits


def _wcs_wave_at_target(hdul: fits.HDUList, target_pixel: list[float] | None) -> SpectralImageWavelength:
    if target_pixel is None:
        return SpectralImageWavelength(message="No target pixel available for WCS-WAVE lookup")
    table = _find_table(hdul, _WCS_WAVE_NAMES)
    if table is None:
        return SpectralImageWavelength(message="No WCS-WAVE extension")
    values = _wcs_wave_values(table)
    if values is None:
        return SpectralImageWavelength(message="WCS-WAVE has no usable VALUES table")
    try:
        x_nodes = np.asarray(table.data["X"], dtype=float).ravel()
        y_nodes = np.asarray(table.data["Y"], dtype=float).ravel()
        # WCS-WAVE X/Y use detector coordinates. Cutouts shift the image WCS
        # with CRPIX1A/CRPIX2A, so the cutout pixel must be restored before
        # evaluating the table (the QR3 cutout offset is 874, 931 pixels).
        image = _science_image(hdul)
        offset_x = float(image.header.get("CRPIX1A", 0.0)) if image is not None else 0.0
        offset_y = float(image.header.get("CRPIX2A", 0.0)) if image is not None else 0.0
        x = float(target_pixel[0]) + 1.0 - offset_x
        y = float(target_pixel[1]) + 1.0 - offset_y
        if not (x_nodes.min() <= x <= x_nodes.max() and y_nodes.min() <= y <= y_nodes.max()):
            return SpectralImageWavelength(message="Target pixel lies outside the WCS-WAVE grid")
        wave = _bilinear_nodes(x_nodes, y_nodes, values[..., 0], x, y)
        bandwidth = _bilinear_nodes(x_nodes, y_nodes, values[..., 1], x, y)
    except Exception as exc:  # pragma: no cover - defensive
        return SpectralImageWavelength(message=f"Could not evaluate WCS-WAVE: {exc}")
    return SpectralImageWavelength(
        method="bilinear_wcs_wave",
        wavelength_um=_float(wave),
        bandwidth_um=_float(bandwidth),
    )


def _wcs_wave_values(table: fits.BinTableHDU | fits.TableHDU) -> np.ndarray | None:
    if "VALUES" not in table.columns.names:
        return None
    values = np.asarray(table.data["VALUES"], dtype=float)
    if values.ndim == 4:
        values = values[0]
    if values.ndim == 2:
        # Some writers omit TDIM and store the grid as one flat vector.
        try:
            nx = len(np.asarray(table.data["X"]).ravel())
            ny = len(np.asarray(table.data["Y"]).ravel())
        except (KeyError, TypeError):
            return None
        flat = values[0]
        if flat.size != nx * ny * 2:
            return None
        values = np.moveaxis(flat.reshape(2, ny, nx), 0, -1)
    if values.ndim != 3 or values.shape[-1] < 2:
        return None
    if values.shape[0] == 2 and values.shape[1] != 2:
        values = np.moveaxis(values, 0, -1)
    return values


def _bilinear_nodes(x_nodes: np.ndarray, y_nodes: np.ndarray, values: np.ndarray, x: float, y: float) -> float:
    ix = int(np.clip(np.searchsorted(x_nodes, x) - 1, 0, len(x_nodes) - 2))
    iy = int(np.clip(np.searchsorted(y_nodes, y) - 1, 0, len(y_nodes) - 2))
    tx = (x - x_nodes[ix]) / (x_nodes[ix + 1] - x_nodes[ix])
    ty = (y - y_nodes[iy]) / (y_nodes[iy + 1] - y_nodes[iy])
    v00 = values[iy, ix]
    v10 = values[iy, ix + 1]
    v01 = values[iy + 1, ix]
    v11 = values[iy + 1, ix + 1]
    return float(
        (1 - tx) * (1 - ty) * v00
        + tx * (1 - ty) * v10
        + (1 - tx) * ty * v01
        + tx * ty * v11
    )


def _metadata(row: dict[str, Any], header: fits.Header, settings: Settings | None) -> SpectralMetadata:
    return SpectralMetadata(
        collection=_text(row.get("collection")) or (settings.spectral_collection if settings else None),
        obs_id=_text(row.get("obs_id")) or _text(header.get("OBSID")),
        obs_publisher_did=_text(row.get("obs_publisher_did")),
        date_obs=_text(row.get("date_obs")) or _text(header.get("DATE-OBS")),
        t_min_mjd=_number(row.get("t_min")),
        t_max_mjd=_number(row.get("t_max")),
        npix=_number(header.get("NPIX"), integer=True) if header.get("NPIX") is not None else _number(row.get("npix"), integer=True),
        order=_number(header.get("ORDER"), integer=True) if header.get("ORDER") is not None else _number(row.get("order"), integer=True),
    )


def _is_monotonic(values: np.ndarray) -> bool | None:
    if values.size < 2:
        return None
    differences = np.diff(values)
    return bool(np.all(differences > 0) or np.all(differences < 0))


def _number(value: Any, *, integer: bool = False) -> int | float | None:
    if value is None or value == "":
        return None
    try:
        return int(value) if integer else float(value)
    except (TypeError, ValueError):
        return None


def _float(value: Any) -> float | None:
    parsed = _number(value)
    return float(parsed) if parsed is not None else None


def _text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


__all__ = ["inspect_spectral_product"]
