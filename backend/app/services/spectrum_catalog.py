"""Persist and retrieve extracted spectra as atomic JSON records."""

from __future__ import annotations

import logging
import re
import uuid
from pathlib import Path

from app.core.cache import CacheStore
from app.core.config import Settings
from app.core.exceptions import SpectrumNotFoundError, SpectrumStorageError
from app.schemas.spectra import SpectralExtractionResponse, SpectralSummary, SpectrumRecord

log = logging.getLogger(__name__)

_SPECTRUM_ID = re.compile(r"^[0-9a-f]{32}$")


class SpectrumCatalogService:
    def __init__(self, settings: Settings, cache: CacheStore) -> None:
        self.settings = settings
        self.cache = cache

    def store(self, response: SpectralExtractionResponse) -> SpectrumRecord:
        record = SpectrumRecord(
            spectrum=response.spectrum,
            provenance=response.provenance,
        )
        path = self.settings.spectra_dir / f"{record.spectrum.spectrum_id}.json"
        try:
            self._write(path, record)
        except OSError as exc:
            raise SpectrumStorageError(
                "Spectrum record could not be written.",
                details={"spectrum_id": record.spectrum.spectrum_id},
            ) from exc
        self.cache.spectra.set(record.spectrum.spectrum_id, record)
        return record

    def get(self, spectrum_id: str) -> SpectrumRecord:
        if not _SPECTRUM_ID.fullmatch(spectrum_id):
            raise SpectrumNotFoundError(f"Spectrum {spectrum_id!r} is not a valid spectrum id.")
        cached = self.cache.spectra.get(spectrum_id)
        if isinstance(cached, SpectrumRecord):
            return cached
        path = self.settings.spectra_dir / f"{spectrum_id}.json"
        if not path.is_file():
            raise SpectrumNotFoundError(f"Spectrum {spectrum_id!r} was not found.")
        try:
            record = SpectrumRecord.model_validate_json(path.read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            raise SpectrumStorageError(
                f"Stored spectrum {spectrum_id!r} could not be read.",
                details={"spectrum_id": spectrum_id},
            ) from exc
        if record.spectrum.spectrum_id != spectrum_id:
            raise SpectrumStorageError(
                f"Stored spectrum {spectrum_id!r} has a mismatched id.",
                details={"spectrum_id": spectrum_id},
            )
        self.cache.spectra.set(spectrum_id, record)
        return record

    def list_for_source(self, source_id: str) -> list[SpectralSummary]:
        if not _SPECTRUM_ID.fullmatch(source_id):
            raise SpectrumNotFoundError(f"Source {source_id!r} is not a valid internal source id.")
        summaries: list[SpectralSummary] = []
        if not self.settings.spectra_dir.is_dir():
            return summaries
        for path in self.settings.spectra_dir.glob("*.json"):
            try:
                record = SpectrumRecord.model_validate_json(path.read_text(encoding="utf-8"))
            except (OSError, ValueError) as exc:
                log.warning(
                    "spectrum_record_skipped",
                    extra={"path": str(path), "error": str(exc)},
                )
                continue
            if record.spectrum.source_id != source_id:
                continue
            summaries.append(self.summary(record))
        return sorted(summaries, key=lambda item: item.created_at, reverse=True)

    def summary(self, record: SpectrumRecord) -> SpectralSummary:
        spectrum = record.spectrum
        return SpectralSummary(
            spectrum_id=spectrum.spectrum_id,
            source_id=spectrum.source_id,
            collection=spectrum.collection,
            product_id=spectrum.product_id,
            ra_deg=spectrum.ra_deg,
            dec_deg=spectrum.dec_deg,
            valid_channel_count=spectrum.valid_channel_count,
            channel_count=spectrum.channel_count,
            wavelength_min_um=spectrum.wavelength_min_um,
            wavelength_max_um=spectrum.wavelength_max_um,
            quality=spectrum.quality.overall_status,
            created_at=record.provenance.created_at,
        )

    def _write(self, path: Path, record: SpectrumRecord) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
        try:
            temporary.write_text(record.model_dump_json(), encoding="utf-8")
            temporary.replace(path)
        finally:
            temporary.unlink(missing_ok=True)


__all__ = ["SpectrumCatalogService"]
