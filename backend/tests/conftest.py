"""Shared fixtures: fake HTTP, synthetic FITS, VOTable builders and API wiring.

The synthetic FITS/VOTable payloads exist only to test parsing deterministically;
production data always comes from IRSA (see tests/test_live_integration.py).
"""

from __future__ import annotations

import io
from dataclasses import dataclass, field
from typing import Any, Iterable
from xml.sax.saxutils import escape

import numpy as np
import pytest
from astropy.io import fits
from astropy.wcs import WCS
from fastapi.testclient import TestClient

from app.api.deps import get_cache_store, get_irsa_client, get_settings_dep
from app.core.cache import CacheStore
from app.core.config import Settings
from app.main import app
from app.services.observation_service import observation_token

TARGET_RA = 156.09328159
TARGET_DEC = -41.64466331
FITS_URL = (
    "https://irsa.ipac.caltech.edu/ibe/data/spherex/qr3/level2/2026W20_2A/"
    "l2b-v27-2026-267/3/level2_2026W20_2A_0436_3D3_spx_l2b-v27-2026-267.fits"
)

SIA_FIELDS: dict[str, str] = {
    "s_ra": "double",
    "s_dec": "double",
    "facility_name": "char",
    "instrument_name": "char",
    "dataproduct_subtype": "char",
    "calib_level": "short",
    "dataproduct_type": "char",
    "energy_bandpassname": "char",
    "obs_id": "char",
    "access_url": "char",
    "access_format": "char",
    "access_estsize": "long",
    "t_exptime": "double",
    "obs_collection": "char",
    "obs_publisher_did": "char",
    "s_xel1": "long",
    "s_xel2": "long",
    "s_pixel_scale": "double",
    "t_min": "double",
    "t_max": "double",
    "s_fov": "double",
    "em_min": "double",
    "em_max": "double",
    "pol_states": "char",
    "s_region": "char",
    "target_name": "char",
}


def votable_xml(
    rows: Iterable[dict[str, Any]] = (),
    *,
    status: str = "OK",
    message: str | None = None,
) -> bytes:
    """Build a SIA2-shaped VOTable, including the real ID=col_N quirk."""
    rows = list(rows)
    lines = [
        '<?xml version="1.0" encoding="utf-8"?>',
        '<VOTABLE version="1.3" xmlns="http://www.ivoa.net/xml/VOTable/v1.3">',
    ]
    if status != "OK":
        info = f'<INFO name="QUERY_STATUS" value="{status}">{escape(message or "")}</INFO>'
        lines.append(f"<RESOURCE type=\"results\">{info}</RESOURCE>")
        lines.append("</VOTABLE>")
        return "".join(lines).encode()

    lines.append('<RESOURCE type="results">')
    lines.append('<INFO name="QUERY_STATUS" value="OK"/>')
    lines.append("<TABLE>")
    for index, (name, datatype) in enumerate(SIA_FIELDS.items()):
        arraysize = ' arraysize="*"' if datatype == "char" else ""
        lines.append(f'<FIELD name="{name}" datatype="{datatype}"{arraysize} ID="col_{index}"/>')
    lines.append("<DATA><TABLEDATA>")
    for row in rows:
        lines.append("<TR>")
        for name in SIA_FIELDS:
            value = row.get(name)
            lines.append(f"<TD>{escape('' if value is None else str(value))}</TD>")
        lines.append("</TR>")
    lines.append("</TABLEDATA></DATA></TABLE></RESOURCE></VOTABLE>")
    return "".join(lines).encode()


def sample_row(**overrides: Any) -> dict[str, Any]:
    row = {
        "s_ra": 156.25964648686178,
        "s_dec": -41.835976255788736,
        "facility_name": "SPHEREx",
        "instrument_name": "SPHEREx",
        "dataproduct_subtype": "science",
        "calib_level": 2,
        "dataproduct_type": "image",
        "energy_bandpassname": "SPHEREx-D3",
        "obs_id": "2026W20_2A_0436_3",
        "access_url": FITS_URL,
        "access_format": "image/fits",
        "access_estsize": 65978,
        "t_exptime": 113.5826,
        "obs_collection": "spherex_qr3",
        "obs_publisher_did": "ivo://irsa.ipac/spherex_qr3?2026W20_2A_0436_3/D3",
        "s_xel1": 2040,
        "s_xel2": 2040,
        "s_pixel_scale": 6.15,
        "t_min": 61177.275636,
        "t_max": 61177.276968,
        "s_fov": 3.485,
        "em_min": 1.5e-6,
        "em_max": 2.0e-6,
        "pol_states": "I",
        "s_region": "CIRCLE 156.2596 -41.8359 1.74",
        "target_name": "field",
    }
    row.update(overrides)
    return row


@dataclass
class FakeResponse:
    status_code: int = 200
    content: bytes = b""
    headers: dict[str, str] = field(default_factory=dict)
    text: str = ""

    def __post_init__(self) -> None:
        if not self.text and self.content:
            self.text = self.content.decode("utf-8", "replace")

    def iter_content(self, chunk_size: int = 1024) -> Iterable[bytes]:
        for start in range(0, len(self.content), chunk_size):
            yield self.content[start : start + chunk_size]

    def close(self) -> None:
        pass


class FakeSession:
    """Minimal requests.Session stand-in with scripted responses."""

    def __init__(self, responses: list[FakeResponse] | FakeResponse | None = None) -> None:
        if responses is None:
            responses = [FakeResponse()]
        self.responses = responses if isinstance(responses, list) else [responses]
        self.calls: list[dict[str, Any]] = []

    def get(self, url: str, **kwargs: Any) -> FakeResponse:
        self.calls.append({"url": url, **kwargs})
        index = min(len(self.calls) - 1, len(self.responses) - 1)
        return self.responses[index]


def make_fits_bytes(
    *,
    nx: int = 58,
    ny: int = 59,
    target_x: float = 28.5,
    target_y: float = 29.0,
    target_ra: float = TARGET_RA,
    target_dec: float = TARGET_DEC,
    with_flags: bool = True,
    with_variance: bool = True,
    with_wcs: bool = True,
) -> bytes:
    """Build a small SPHEREx-like FITS with IMAGE not at a fixed index."""
    header = fits.Header()
    if with_wcs:
        wcs = WCS(naxis=2)
        wcs.wcs.ctype = ["RA---TAN", "DEC--TAN"]
        wcs.wcs.crpix = [target_x + 1.0, target_y + 1.0]
        wcs.wcs.crval = [target_ra, target_dec]
        wcs.wcs.cdelt = [-6.15 / 3600.0, 6.15 / 3600.0]
        header = wcs.to_header()
    header["BUNIT"] = "MJy / sr"

    rng = np.random.default_rng(7)
    data = rng.normal(1e-3, 2e-4, (ny, nx)).astype(np.float32)
    data[0, :] = np.nan
    data[1, 0] = np.inf

    hdus: list[fits.hdu.base.ExtensionHDU | fits.PrimaryHDU] = [
        fits.PrimaryHDU(),
        fits.ImageHDU(data=np.zeros((ny, nx), dtype=np.float32), name="ZODI"),
        fits.ImageHDU(data=data, header=header, name="IMAGE"),
    ]
    if with_flags:
        hdus.append(fits.ImageHDU(data=np.zeros((ny, nx), dtype=np.int32), name="FLAGS"))
    if with_variance:
        hdus.append(fits.ImageHDU(data=np.full((ny, nx), 4e-8, dtype=np.float32), name="VARIANCE"))
    buffer = io.BytesIO()
    fits.HDUList(hdus).writeto(buffer)
    return buffer.getvalue()


def _rotation_matrix(pixel_scale_arcsec: float, rotation_deg: float) -> np.ndarray:
    scale = pixel_scale_arcsec / 3600.0
    theta = np.deg2rad(rotation_deg)
    return np.array(
        [
            [-scale * np.cos(theta), scale * np.sin(theta)],
            [scale * np.sin(theta), scale * np.cos(theta)],
        ]
    )


def make_sky_wcs(
    *,
    nx: int = 64,
    ny: int = 64,
    target_ra: float = TARGET_RA,
    target_dec: float = TARGET_DEC,
    crpix: tuple[float, float] | None = None,
    crval: tuple[float, float] | None = None,
    pixel_scale_arcsec: float = 6.15,
    rotation_deg: float = 0.0,
) -> WCS:
    wcs = WCS(naxis=2)
    wcs.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    wcs.wcs.crpix = list(crpix or (nx / 2.0 + 0.5, ny / 2.0 + 0.5))
    wcs.wcs.crval = list(crval or (target_ra, target_dec))
    wcs.wcs.cd = _rotation_matrix(pixel_scale_arcsec, rotation_deg)
    return wcs


def render_sky(
    wcs: WCS,
    *,
    nx: int = 64,
    ny: int = 64,
    target_ra: float = TARGET_RA,
    target_dec: float = TARGET_DEC,
    sources: tuple[tuple[float, float, float, float], ...] = (),
    background: float = 1e-3,
    noise: float = 0.0,
    seed: int = 7,
) -> np.ndarray:
    """Render a fixed sky model through ``wcs``.

    ``sources`` are ``(dx_arcsec, dy_arcsec, amplitude, sigma_arcsec)`` offsets
    from the target; the same sky model rendered through two different WCSs is
    the ground truth a correct reprojection must recover.
    """
    yy, xx = np.mgrid[0:ny, 0:nx]
    ra, dec = wcs.all_pix2world(xx, yy, 0)
    offset_ra = (np.asarray(ra) - target_ra + 180.0) % 360.0 - 180.0
    dx = offset_ra * np.cos(np.deg2rad(target_dec)) * 3600.0
    dy = (np.asarray(dec) - target_dec) * 3600.0

    data = np.full((ny, nx), float(background), dtype=np.float64)
    for sx, sy, amplitude, sigma in sources:
        data += amplitude * np.exp(-((dx - sx) ** 2 + (dy - sy) ** 2) / (2.0 * sigma ** 2))
    if noise:
        data += np.random.default_rng(seed).normal(0.0, noise, data.shape)
    return data


def make_psf_table(
    *,
    entries: int = 3,
    samples: int = 33,
    fwhm_px: float = 2.0,
    oversampling: int = 5,
    wavelength_um: float = 2.0,
) -> fits.BinTableHDU:
    sigma_samples = fwhm_px * oversampling / 2.3548200450309493
    yy, xx = np.mgrid[0:samples, 0:samples]
    centre = (samples - 1) / 2.0
    kernel = np.exp(-((xx - centre) ** 2 + (yy - centre) ** 2) / (2.0 * sigma_samples ** 2))
    kernel /= kernel.sum()
    stack = np.repeat(kernel[None, :, :], entries, axis=0)

    columns = [
        fits.Column(name="CWAVE", format="E", unit="um", array=np.full(entries, wavelength_um)),
        fits.Column(name="NSTAR", format="J", array=np.full(entries, 500)),
        fits.Column(name="EPSF", format=f"{samples * samples}D", dim=f"({samples},{samples})", array=stack.reshape(entries, -1)),
    ]
    hdu = fits.BinTableHDU.from_columns(columns, name="EPSF")
    hdu.header["OVSMPX"] = oversampling
    hdu.header["OVSMPY"] = oversampling
    return hdu


def make_sky_fits_bytes(
    *,
    nx: int = 64,
    ny: int = 64,
    target_ra: float = TARGET_RA,
    target_dec: float = TARGET_DEC,
    crpix: tuple[float, float] | None = None,
    crval: tuple[float, float] | None = None,
    pixel_scale_arcsec: float = 6.15,
    rotation_deg: float = 0.0,
    sources: tuple[tuple[float, float, float, float], ...] = (
        (0.0, 0.0, 1e-2, 12.0),
        (60.0, 40.0, 6e-3, 10.0),
        (-55.0, -35.0, 4e-3, 14.0),
    ),
    background: float = 1e-3,
    noise: float = 0.0,
    seed: int = 7,
    bunit: str | None = "MJy / sr",
    with_wcs: bool = True,
    with_flags: bool = True,
    flags: np.ndarray | None = None,
    with_variance: bool = True,
    variance: float | np.ndarray | None = 4e-8,
    with_psf: bool = False,
    psf_fwhm_px: float = 2.0,
    oversampling: int = 5,
    nan_border: bool = False,
    fill_value: float | None = None,
    mask_bits: dict[str, str] | None = None,
    header_extra: dict[str, Any] | None = None,
) -> bytes:
    """Build a SPHEREx-shaped FITS whose pixels are a rendering of a fixed sky."""
    header = fits.Header()
    if with_wcs:
        wcs = make_sky_wcs(
            nx=nx,
            ny=ny,
            target_ra=target_ra,
            target_dec=target_dec,
            crpix=crpix,
            crval=crval,
            pixel_scale_arcsec=pixel_scale_arcsec,
            rotation_deg=rotation_deg,
        )
        header = wcs.to_header(relax=True)
        data = render_sky(
            wcs,
            nx=nx,
            ny=ny,
            target_ra=target_ra,
            target_dec=target_dec,
            sources=sources,
            background=background,
            noise=noise,
            seed=seed,
        )
    else:
        data = render_sky(
            make_sky_wcs(nx=nx, ny=ny, target_ra=target_ra, target_dec=target_dec),
            nx=nx,
            ny=ny,
            target_ra=target_ra,
            target_dec=target_dec,
            sources=sources,
            background=background,
            noise=noise,
            seed=seed,
        )

    if bunit:
        header["BUNIT"] = bunit
    header["EXPTIME"] = 113.58
    header["DATE-OBS"] = "2026-09-24T06:36:54"
    header["TELESCOP"] = "SPHEREx"
    header["INSTRUME"] = "SPHEREx"
    if header_extra:
        for keyword, value in header_extra.items():
            header[keyword] = value

    if nan_border:
        data[0, :] = np.nan
        data[1, 0] = np.inf
    if fill_value is not None:
        data = np.full((ny, nx), float(fill_value), dtype=np.float64)

    hdus: list[Any] = [
        fits.PrimaryHDU(),
        fits.ImageHDU(data=np.zeros((ny, nx), dtype=np.float32), name="ZODI"),
        fits.ImageHDU(data=data.astype(np.float32), header=header, name="IMAGE"),
    ]
    if with_flags:
        flag_data = np.zeros((ny, nx), dtype=np.int32) if flags is None else np.asarray(flags, dtype=np.int32)
        flags_hdu = fits.ImageHDU(data=flag_data, name="FLAGS")
        flags_hdu.header["EXTTYPE"] = "MASK"
        for index, name in enumerate(mask_bits or {}):
            flags_hdu.header[f"MSKN{index:04d}"] = name
            flags_hdu.header[f"MSKM{index:04d}"] = 1 << index
            flags_hdu.header[f"MSKD{index:04d}"] = (mask_bits or {})[name]
        hdus.append(flags_hdu)
    if with_variance:
        if variance is None:
            variance = 4e-8
        variance_data = np.full((ny, nx), float(variance), dtype=np.float32) if np.isscalar(variance) else np.asarray(variance, dtype=np.float32)
        variance_hdu = fits.ImageHDU(data=variance_data, name="VARIANCE")
        variance_hdu.header["BUNIT"] = "MJy2 / sr2"
        hdus.append(variance_hdu)
    if with_psf:
        hdus.append(make_psf_table(fwhm_px=psf_fwhm_px, oversampling=oversampling))

    buffer = io.BytesIO()
    fits.HDUList(hdus).writeto(buffer)
    return buffer.getvalue()


def make_cube_fits_bytes(
    *,
    nx: int = 8,
    ny: int = 8,
    nchan: int = 5,
    target_ra: float = TARGET_RA,
    target_dec: float = TARGET_DEC,
    target_x: float = 4.5,
    target_y: float = 4.5,
    blank_index: int = 2,
    invalid_index: int = 3,
) -> bytes:
    """Build a small DR1-cube-like FITS with a channel table and masks."""
    wcs = make_sky_wcs(
        nx=nx,
        ny=ny,
        target_ra=target_ra,
        target_dec=target_dec,
        crpix=(target_x + 1.0, target_y + 1.0),
        pixel_scale_arcsec=13.98,
    )
    header = wcs.to_header(relax=True)
    header["BUNIT"] = "MJy/sr"
    header["NPIX"] = 9621
    header["ORDER"] = 5
    header["BLANKCH"] = f"D1:{blank_index + 1:02d}"

    yy, xx = np.mgrid[0:ny, 0:nx]
    data = np.empty((nchan, ny, nx), dtype=np.float32)
    for channel in range(nchan):
        data[channel] = (1.0 + xx + 10.0 * yy) * (channel + 1)
    data[blank_index] = np.nan

    nhits = np.full((nchan, ny, nx), 10, dtype=np.int32)
    nhits[blank_index] = 0
    flags = np.full((nchan, ny, nx), 1 << 21, dtype=np.int32)
    flags[blank_index] = 0
    flags[invalid_index] |= 1 << 1

    wavelengths = np.linspace(0.75, 4.98, nchan)
    bandwidths = np.full(nchan, 0.05)
    columns = [
        fits.Column(name="DETECTOR", format="I", array=np.ones(nchan, dtype=np.int16)),
        fits.Column(name="SUBCHAN", format="I", array=np.arange(1, nchan + 1, dtype=np.int16)),
        fits.Column(name="WAVELENGTH", format="E", unit="um", array=wavelengths),
        fits.Column(name="WL_MIN", format="E", unit="um", array=wavelengths - bandwidths / 2),
        fits.Column(name="WL_MAX", format="E", unit="um", array=wavelengths + bandwidths / 2),
        fits.Column(name="BANDWIDTH", format="E", unit="um", array=bandwidths),
        fits.Column(name="R", format="E", array=wavelengths / bandwidths),
    ]
    channels = fits.BinTableHDU.from_columns(columns, name="SPECTRAL_CHANNELS")

    hdus = [
        fits.PrimaryHDU(),
        fits.ImageHDU(data=data, header=header, name="IMAGE"),
        fits.ImageHDU(data=nhits, name="NHITS"),
        fits.ImageHDU(data=flags, name="FLAGS"),
        channels,
    ]
    buffer = io.BytesIO()
    fits.HDUList(hdus).writeto(buffer)
    return buffer.getvalue()


def make_spectral_image_fits_bytes(
    *,
    nx: int = 10,
    ny: int = 10,
    target_ra: float = TARGET_RA,
    target_dec: float = TARGET_DEC,
    wavelength_start_um: float = 2.0,
    slope_um_per_pixel: float = 0.01,
    bandwidth_um: float = 0.05,
) -> bytes:
    """Build a single-channel spectral image with a WCS-WAVE lookup table."""
    base = fits.open(io.BytesIO(make_sky_fits_bytes(nx=nx, ny=ny, target_ra=target_ra, target_dec=target_dec)))
    x_nodes = np.arange(1, nx + 1, dtype=np.int32)
    y_nodes = np.arange(1, ny + 1, dtype=np.int32)
    values = np.empty((2, ny, nx), dtype=np.float64)
    values[0] = wavelength_start_um + slope_um_per_pixel * (y_nodes[:, None] - 1)
    values[1] = bandwidth_um
    table = fits.BinTableHDU.from_columns(
        [
            fits.Column(name="X", format=f"{nx}J", array=[x_nodes]),
            fits.Column(name="Y", format=f"{ny}J", array=[y_nodes]),
            fits.Column(
                name="VALUES",
                format=f"{nx * ny * 2}E",
                array=values.reshape(1, -1),
            ),
        ],
        name="WCS-WAVE",
    )
    base.append(table)
    buffer = io.BytesIO()
    base.writeto(buffer)
    base.close()
    return buffer.getvalue()


class RoutedSession:
    """Session stand-in that picks a payload from a URL substring match."""

    def __init__(self, routes: list[tuple[str, bytes]]) -> None:
        self.routes = routes
        self.calls: list[dict[str, Any]] = []

    def get(self, url: str, **kwargs: Any) -> FakeResponse:
        self.calls.append({"url": url, **kwargs})
        for marker, content in self.routes:
            if marker in url:
                return FakeResponse(status_code=200, content=content, headers={"Content-Type": "image/fits"})
        return FakeResponse(status_code=404, content=b"not found", headers={"Content-Type": "text/plain"})


class FakeIrsaClient:
    def __init__(self, settings: Settings, rows: list[dict[str, Any]] | None = None) -> None:
        self.settings = settings
        self.rows = rows if rows is not None else [sample_row()]
        self.session = FakeSession(FakeResponse(status_code=200, content=make_fits_bytes(), headers={"Content-Type": "image/fits"}))
        self.search_calls: list[dict[str, Any]] = []
        self.did_calls: list[str] = []
        self.error: Exception | None = None
        self.fits_bytes: bytes | None = None

    def search(self, ra: float, dec: float, radius: float, collection: str | None = None,
               start_mjd: float | None = None, end_mjd: float | None = None) -> list[dict[str, Any]]:
        self.search_calls.append({"ra": ra, "dec": dec, "radius": radius, "collection": collection,
                                  "start_mjd": start_mjd, "end_mjd": end_mjd})
        if self.error:
            raise self.error
        return self.rows

    def find_by_publisher_did(self, publisher_did: str, collection: str | None = None) -> dict[str, Any] | None:
        self.did_calls.append(publisher_did)
        if self.error:
            raise self.error
        return next((row for row in self.rows if row.get("obs_publisher_did") == publisher_did), None)

    def close(self) -> None:
        pass


PAIR_ROWS: list[dict[str, Any]] = [
    sample_row(
        obs_id="EPOCH_A",
        obs_publisher_did="ivo://irsa.ipac/spherex_qr3?EPOCH_A/D3",
        access_url="https://irsa.ipac.caltech.edu/ibe/data/spherex/qr3/level2/EPOCH_A.fits",
        t_min=61177.275636,
    ),
    sample_row(
        obs_id="EPOCH_B",
        obs_publisher_did="ivo://irsa.ipac/spherex_qr3?EPOCH_B/D3",
        access_url="https://irsa.ipac.caltech.edu/ibe/data/spherex/qr3/level2/EPOCH_B.fits",
        t_min=61211.084272,
    ),
]


def seed_pair(fake_client: FakeIrsaClient, a_bytes: bytes, b_bytes: bytes) -> tuple[str, str]:
    """Point the fake IRSA client at two synthetic epoch products."""
    fake_client.rows = [dict(row) for row in PAIR_ROWS]
    fake_client.session = RoutedSession([("EPOCH_A.fits", a_bytes), ("EPOCH_B.fits", b_bytes)])
    token_a = observation_token(fake_client.rows[0])
    token_b = observation_token(fake_client.rows[1])
    assert token_a and token_b
    return token_a, token_b


@pytest.fixture
def settings(tmp_path) -> Settings:
    value = Settings(
        storage_dir=tmp_path / "storage",
        default_collection="spherex_qr3",
        connect_timeout=2.0,
        request_timeout=5.0,
        download_retries=2,
        cache_ttl_seconds=60,
        cache_max_entries=32,
        max_download_bytes=5 * 1024 * 1024,
    )
    value.ensure_dirs()
    return value


@pytest.fixture
def fake_client(settings) -> FakeIrsaClient:
    return FakeIrsaClient(settings)


@pytest.fixture
def api(settings, fake_client):
    cache = CacheStore(60, 32)
    app.dependency_overrides[get_irsa_client] = lambda: fake_client
    app.dependency_overrides[get_cache_store] = lambda: cache
    app.dependency_overrides[get_settings_dep] = lambda: settings
    with TestClient(app, raise_server_exceptions=False) as client:
        yield client, fake_client, settings, cache
    app.dependency_overrides.clear()
