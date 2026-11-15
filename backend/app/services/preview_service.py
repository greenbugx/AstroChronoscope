"""PNG preview rendering (display only; FITS data is never modified)."""

from __future__ import annotations

import io
import logging
import os
import threading
import uuid
from pathlib import Path

import matplotlib

matplotlib.use("Agg", force=True)

import numpy as np
from astropy.visualization import AsinhStretch, ImageNormalize
from matplotlib.backends.backend_agg import FigureCanvasAgg
from matplotlib.figure import Figure

from app.core.config import Settings, get_settings
from app.core.exceptions import PreviewGenerationError
from app.services.fits_service import ScienceImage, extract_science_image

log = logging.getLogger(__name__)

# Matplotlib is not thread-safe; serialise rendering.
_RENDER_LOCK = threading.Lock()
_DPI = 100


def generate_preview(fits_path: Path | str, output_path: Path | str | None = None, settings: Settings | None = None) -> Path:
    """Render the science image to a PNG using percentile scaling + asinh stretch."""
    settings = settings or get_settings()
    fits_path = Path(fits_path)
    output = Path(output_path) if output_path is not None else fits_path.with_suffix(".png")
    output.parent.mkdir(parents=True, exist_ok=True)

    if output.is_file() and _is_png(output):
        return output

    image = extract_science_image(fits_path)
    _render_png(image, output, settings)
    return output


def _render_png(image: ScienceImage, output: Path, settings: Settings) -> None:
    if output.is_file() and _is_png(output):
        return

    data = image.data
    finite = data[np.isfinite(data)]
    if finite.size == 0:
        raise PreviewGenerationError("Science image contains no finite pixels to display")

    vmin = float(np.percentile(finite, 0.5))
    vmax = float(np.percentile(finite, settings.preview_percentile))
    if not np.isfinite(vmin) or not np.isfinite(vmax) or vmax <= vmin:
        vmin, vmax = float(finite.min()), float(finite.max())
    if vmax <= vmin:
        vmax = vmin + 1.0

    norm = ImageNormalize(vmin=vmin, vmax=vmax, stretch=AsinhStretch(a=settings.preview_asinh_a))
    masked = np.ma.masked_invalid(data)

    cmap = matplotlib.colormaps[settings.preview_cmap].with_extremes(bad="black")

    width = max(image.width, 2)
    height = max(image.height, 2)
    figure = Figure(figsize=(width / _DPI, height / _DPI), dpi=_DPI, facecolor="black")
    FigureCanvasAgg(figure)
    axes = figure.add_axes((0, 0, 1, 1))
    axes.set_axis_off()
    axes.imshow(masked, origin="lower", cmap=cmap, norm=norm, interpolation="nearest", aspect="equal")

    buf = io.BytesIO()
    try:
        with _RENDER_LOCK:
            figure.savefig(buf, format="png", dpi=_DPI, facecolor="black")
    except Exception as exc:
        raise PreviewGenerationError("Could not render the preview PNG", details={"error": str(exc)}) from exc
    finally:
        figure.clear()

    png_bytes = buf.getvalue()
    if len(png_bytes) < 8 or png_bytes[:8] != b"\x89PNG\r\n\x1a\n":
        raise PreviewGenerationError("Rendered preview is not a valid PNG")

    if output.is_file() and _is_png(output):
        return

    temp = output.with_name(f"{output.stem}.{uuid.uuid4().hex}.part")
    try:
        temp.write_bytes(png_bytes)
        os.replace(temp, output)
    except PermissionError:
        if not (output.is_file() and _is_png(output)):
            raise PreviewGenerationError("Could not write preview PNG", details={"target": str(output)})
    except Exception as exc:
        raise PreviewGenerationError("Could not render the preview PNG", details={"error": str(exc)}) from exc
    finally:
        try:
            temp.unlink(missing_ok=True)
        except OSError:
            pass

    log.info("preview_generated", extra={"path": str(output), "vmin": vmin, "vmax": vmax, "shape": [image.height, image.width]})


def _is_png(path: Path) -> bool:
    try:
        with open(path, "rb") as handle:
            return handle.read(8) == b"\x89PNG\r\n\x1a\n"
    except OSError:
        return False
