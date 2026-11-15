"""Small thread-safe TTL cache (no external dependency)."""

from __future__ import annotations

import threading
import time
from collections import OrderedDict
from typing import Any


class TTLCache:
    """Bounded LRU cache where entries expire after ``ttl_seconds``."""

    def __init__(self, ttl_seconds: float, max_entries: int = 512) -> None:
        self._ttl = ttl_seconds
        self._max = max_entries
        self._data: OrderedDict[Any, tuple[float, Any]] = OrderedDict()
        self._lock = threading.RLock()

    def get(self, key: Any) -> Any | None:
        now = time.monotonic()
        with self._lock:
            item = self._data.get(key)
            if item is None:
                return None
            expires_at, value = item
            if expires_at <= now:
                del self._data[key]
                return None
            self._data.move_to_end(key)
            return value

    def set(self, key: Any, value: Any) -> None:
        with self._lock:
            self._data[key] = (time.monotonic() + self._ttl, value)
            self._data.move_to_end(key)
            while len(self._data) > self._max:
                self._data.popitem(last=False)

    def clear(self) -> None:
        with self._lock:
            self._data.clear()


class CacheStore:
    """Named caches shared across requests (one Application instance)."""

    def __init__(self, ttl_seconds: float = 600, max_entries: int = 512) -> None:
        self.search = TTLCache(ttl_seconds, max_entries)
        self.observations = TTLCache(ttl_seconds, max_entries)
        self.timeline = TTLCache(ttl_seconds, max_entries)
        self.comparisons = TTLCache(ttl_seconds, max_entries)
        self.gaia = TTLCache(ttl_seconds, max_entries)
        self.sources = TTLCache(ttl_seconds, max_entries)
        self.photometry = TTLCache(ttl_seconds, max_entries)
        self.lightcurves = TTLCache(ttl_seconds, max_entries)
        self.variability = TTLCache(ttl_seconds, max_entries)
        self.spectra = TTLCache(ttl_seconds, max_entries)

    def clear(self) -> None:
        self.search.clear()
        self.observations.clear()
        self.timeline.clear()
        self.comparisons.clear()
        self.gaia.clear()
        self.sources.clear()
        self.photometry.clear()
        self.lightcurves.clear()
        self.variability.clear()
        self.spectra.clear()
