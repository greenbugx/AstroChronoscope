"""Software version provenance shared by scientific services."""

from __future__ import annotations

import platform

import astropy
import numpy as np
import scipy


#: Version of the Phase 4 cube-spectrum extraction pipeline. Bump whenever the
#: wavelength mapping, flag policy or flux extraction numerics change.
SPECTRAL_ALGORITHM_VERSION = "phase4-spectrum-extraction-v1"


def backend_version() -> str:
    try:
        from app.main import VERSION

        return VERSION
    except Exception:  # pragma: no cover - defensive
        return "unknown"


def software_versions() -> dict[str, str]:
    return {
        "planet_x_backend": backend_version(),
        "python": platform.python_version(),
        "numpy": np.__version__,
        "astropy": astropy.__version__,
        "scipy": scipy.__version__,
    }


__all__ = ["SPECTRAL_ALGORITHM_VERSION", "backend_version", "software_versions"]
