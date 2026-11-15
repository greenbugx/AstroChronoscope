"""FITS product selection, streamed download and science-image extraction."""

from __future__ import annotations

import logging
import os
import re
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping
from urllib.parse import urlsplit

import numpy as np
import requests
from astropy.io import fits

from app.core.config import Settings, get_settings
from app.core.exceptions import (
    CutoutUnavailableError,
    InvalidFitsFileError,
    IrsaHttpError,
    IrsaTimeoutError,
    IrsaUnavailableError,
    MissingAccessUrlError,
    MissingImageExtensionError,
    UnsupportedProductError,
    UntrustedUrlError,
)

log = logging.getLogger(__name__)

_SCIENCE_EXTNAMES = ("IMAGE", "SCI", "SCIENCE")
_SUPPORTED_ACCESS_FORMATS = ("image/fits", "application/fits", "application/x-fits")
_HTML_TYPES = ("text/html", "application/xhtml+xml", "text/xml", "application/xml")


@dataclass(frozen=True)
class FitsProduct:
    """A downloadable FITS product bound to its SIA observation."""

    access_url: str
    access_format: str | None
    observation_id: str | None
    obs_publisher_did: str | None


@dataclass
class ScienceImage:
    """Science pixels plus the metadata the API exposes."""

    data: np.ndarray
    header: fits.Header
    extname: str
    unit: str | None
    flags: np.ndarray | None
    variance: np.ndarray | None
    available_hdus: list[str]
    flag_masks: dict[str, int] | None = None

    @property
    def height(self) -> int:
        return int(self.data.shape[0])

    @property
    def width(self) -> int:
        return int(self.data.shape[1])

    def stats(self) -> dict[str, float | int | None]:
        finite = np.isfinite(self.data)
        count = int(finite.sum())
        if count == 0:
            return {"finite_pixels": 0, "min": None, "max": None}
        values = self.data[finite]
        return {
            "finite_pixels": count,
            "min": float(values.min()),
            "max": float(values.max()),
        }


def get_fits_product(observation: Mapping[str, Any], settings: Settings | None = None) -> FitsProduct:
    """Validate and return the FITS product referenced by an SIA row.

    The URL always comes from the SIA response; it is never constructed from an
    observation identifier.
    """
    settings = settings or get_settings()
    url = observation.get("access_url")
    if not isinstance(url, str) or not url.strip():
        raise MissingAccessUrlError(
            "This observation has no access_url in the IRSA SIA response",
            details={"obs_publisher_did": observation.get("obs_publisher_did")},
        )
    url = url.strip()

    access_format = observation.get("access_format")
    if access_format and not str(access_format).lower().startswith(_SUPPORTED_ACCESS_FORMATS):
        raise UnsupportedProductError(
            f"Unsupported access_format: {access_format}",
            details={"access_format": access_format, "obs_publisher_did": observation.get("obs_publisher_did")},
        )

    validate_fits_url(url, settings)
    return FitsProduct(
        access_url=url,
        access_format=str(access_format) if access_format else None,
        observation_id=observation.get("observation_id"),
        obs_publisher_did=observation.get("obs_publisher_did"),
    )


def validate_fits_url(url: str, settings: Settings | None = None) -> str:
    """Reject anything that is not HTTPS on a trusted IRSA host."""
    settings = settings or get_settings()
    try:
        parts = urlsplit(url)
    except ValueError as exc:
        raise UntrustedUrlError("Malformed FITS URL", details={"url": url}) from exc

    host = (parts.hostname or "").lower()
    if parts.scheme != "https":
        raise UntrustedUrlError("FITS URL must use HTTPS", details={"scheme": parts.scheme})
    if host not in {h.lower() for h in settings.trusted_hosts}:
        raise UntrustedUrlError("FITS URL host is not a trusted IRSA host", details={"host": host})
    if parts.username or parts.password:
        raise UntrustedUrlError("FITS URL must not contain credentials")
    if not parts.path or parts.path == "/":
        raise UntrustedUrlError("FITS URL has no product path", details={"url": url})
    return url


def download_fits(
    url: str,
    destination: Path,
    *,
    session: requests.Session | None = None,
    settings: Settings | None = None,
    max_bytes: int | None = None,
) -> Path:
    """Stream ``url`` to ``destination`` atomically, validating it is real FITS.

    Retries transient 429/5xx responses (IRSA's IBE cutout service regularly
    answers "Server busy, retry later.").
    """
    settings = settings or get_settings()
    validate_fits_url(url, settings)
    limit = settings.max_download_bytes if max_bytes is None else max(1, int(max_bytes))
    destination.parent.mkdir(parents=True, exist_ok=True)
    temp_path = destination.with_suffix(destination.suffix + ".part")
    attempts = max(1, settings.download_retries + 1)
    last_error: Exception | None = None

    for attempt in range(1, attempts + 1):
        try:
            _stream_to_file(url, temp_path, session or requests, settings, limit)
            verify_fits(temp_path)
            os.replace(temp_path, destination)
            log.info("fits_downloaded", extra={"url": url, "path": str(destination), "bytes": destination.stat().st_size})
            return destination
        except (IrsaUnavailableError, IrsaTimeoutError, IrsaHttpError) as exc:
            last_error = exc
            if attempt == attempts:
                break
            delay = min(8.0, 2.0 ** (attempt - 1))
            log.warning("fits_download_retry", extra={"url": url, "attempt": attempt, "delay_s": delay, "error": str(exc)})
            time.sleep(delay)
        finally:
            try:
                temp_path.unlink(missing_ok=True)
            except OSError:
                pass

    if isinstance(last_error, (IrsaUnavailableError, IrsaTimeoutError)):
        raise CutoutUnavailableError(
            "IRSA cutout service is temporarily unavailable; try again shortly",
            details={"url": url, "reason": str(last_error)},
        ) from last_error
    assert last_error is not None
    raise last_error


def _stream_to_file(url: str, temp_path: Path, http: Any, settings: Settings, max_bytes: int) -> None:
    try:
        response = http.get(
            url,
            stream=True,
            timeout=(settings.connect_timeout, settings.request_timeout),
            headers={"User-Agent": settings.user_agent},
        )
    except requests.Timeout as exc:
        raise IrsaTimeoutError("Timed out requesting the IRSA FITS file", details={"url": url}) from exc
    except requests.ConnectionError as exc:
        raise IrsaUnavailableError("Could not connect to IRSA for the FITS file", details={"url": url}) from exc
    except requests.RequestException as exc:
        raise IrsaUnavailableError("FITS download request failed", details={"url": url, "error": str(exc)}) from exc

    try:
        if response.status_code >= 500 or response.status_code == 429:
            raise IrsaUnavailableError(
                f"IRSA returned HTTP {response.status_code}", details={"status_code": response.status_code}
            )
        if response.status_code >= 400:
            snippet = _snippet(response)
            raise CutoutUnavailableError(
                f"IRSA rejected the cutout request (HTTP {response.status_code})",
                details={"status_code": response.status_code, "irsa_message": snippet},
            )

        content_type = (response.headers.get("Content-Type") or "").split(";")[0].strip().lower()
        if content_type in _HTML_TYPES:
            raise InvalidFitsFileError(
                "IRSA returned HTML/XML instead of FITS", details={"content_type": content_type, "irsa_message": _snippet(response)}
            )

        declared = response.headers.get("Content-Length")
        if declared and declared.isdigit() and int(declared) > max_bytes:
            raise InvalidFitsFileError(
                "FITS product exceeds the configured download limit",
                details={"content_length": int(declared), "max_download_bytes": max_bytes},
            )

        written = 0
        with open(temp_path, "wb") as handle:
            for chunk in response.iter_content(chunk_size=1024 * 256):
                if not chunk:
                    continue
                written += len(chunk)
                if written > max_bytes:
                    raise InvalidFitsFileError(
                        "FITS product exceeded the configured download limit",
                        details={"max_download_bytes": max_bytes},
                    )
                handle.write(chunk)

        if declared and declared.isdigit() and written != int(declared):
            raise InvalidFitsFileError(
                "Incomplete FITS download",
                details={"expected_bytes": int(declared), "received_bytes": written},
            )
        if written == 0:
            raise InvalidFitsFileError("IRSA returned an empty response")
        if written < 2880:
            raise InvalidFitsFileError("Response is too small to be a FITS file", details={"received_bytes": written})
    finally:
        response.close()


def verify_fits(path: Path) -> None:
    """Cheap structural check: FITS magic and a readable HDU list."""
    try:
        with open(path, "rb") as handle:
            head = handle.read(8)
    except OSError as exc:
        raise InvalidFitsFileError("Downloaded file could not be read") from exc
    if not head.startswith(b"SIMPLE"):
        raise InvalidFitsFileError(
            "Downloaded content is not FITS", details={"first_bytes": head[:8].hex(), "path_name": path.name}
        )
    try:
        with fits.open(path, memmap=True) as hdul:
            if len(hdul) == 0:
                raise InvalidFitsFileError("FITS file has no HDUs")
            _ = hdul[0].header
    except InvalidFitsFileError:
        raise
    except Exception as exc:
        raise InvalidFitsFileError("FITS file is corrupted or incomplete", details={"error": str(exc)}) from exc


def extract_science_image(fits_path: Path | str) -> ScienceImage:
    """Extract the science IMAGE extension by name, never by fixed index."""
    path = Path(fits_path)
    try:
        with fits.open(path, memmap=True) as hdul:
            names = [str(hdu.name).upper() for hdu in hdul]
            science_hdu = _find_science_hdu(hdul)
            data = np.array(science_hdu.data, copy=True, dtype=np.float64)
            header = science_hdu.header.copy()
            flags = _matching_extension(hdul, "FLAGS", data.shape)
            variance = _matching_extension(hdul, "VARIANCE", data.shape)
            image = ScienceImage(
                data=data,
                header=header,
                extname=str(science_hdu.name).upper(),
                unit=header.get("BUNIT"),
                flags=flags,
                variance=variance,
                available_hdus=names,
                flag_masks=_flag_definitions(hdul),
            )
    except (InvalidFitsFileError, MissingImageExtensionError):
        raise
    except OSError as exc:
        raise InvalidFitsFileError("Could not open FITS file", details={"error": str(exc)}) from exc
    except Exception as exc:
        raise InvalidFitsFileError("FITS file could not be read", details={"error": str(exc)}) from exc

    if not np.any(np.isfinite(image.data)):
        log.warning("science_image_all_invalid", extra={"path": str(path)})
    return image


def _flag_definitions(hdul: fits.HDUList) -> dict[str, int]:
    """Read the FLAGS bit names/values (MSKN/MSKM) so masking can be selective."""
    for hdu in hdul:
        if str(hdu.name).upper() == "FLAGS" and hdu.data is not None:
            masks: dict[str, int] = {}
            for index in range(32):
                name = hdu.header.get(f"MSKN{index:04d}")
                value = hdu.header.get(f"MSKM{index:04d}")
                if name and value is not None:
                    masks[str(name)] = int(value)
            return masks
    return {}


def _find_science_hdu(hdul: fits.HDUList) -> Any:
    candidates = [hdu for hdu in hdul if hdu.data is not None and getattr(hdu.data, "ndim", 0) == 2]
    if not candidates:
        raise MissingImageExtensionError(
            "FITS product has no 2-D image extension", details={"hdus": [hdu.name for hdu in hdul]}
        )

    for target in _SCIENCE_EXTNAMES:
        for hdu in candidates:
            if str(hdu.name).upper() == target:
                return hdu

    for hdu in candidates:
        header = hdu.header
        if header.get("BUNIT") and (header.get("CTYPE1") or header.get("CTYPE2")):
            return hdu

    if candidates[0].name == "PRIMARY" and (candidates[0].header.get("CTYPE1") or candidates[0].header.get("CTYPE2")):
        return candidates[0]
    raise MissingImageExtensionError(
        "No science IMAGE extension found in FITS product", details={"hdus": [hdu.name for hdu in hdul]}
    )


def _matching_extension(hdul: fits.HDUList, extname: str, shape: tuple[int, ...]) -> np.ndarray | None:
    for hdu in hdul:
        if str(hdu.name).upper() != extname or hdu.data is None:
            continue
        data = np.array(hdu.data, copy=True)
        if data.shape == shape:
            return data
        log.warning("extension_shape_mismatch", extra={"extname": extname, "shape": data.shape, "image_shape": shape})
    return None


def _snippet(response: requests.Response, limit: int = 300) -> str:
    try:
        text = response.text
    except Exception:  # pragma: no cover - defensive
        return ""
    text = re.sub(r"\s+", " ", text).strip()
    return text[:limit]
