"""Простой in-memory TTL-кэш (MVP, один процесс uvicorn)."""

from __future__ import annotations

from collections import OrderedDict
from threading import Lock
from time import monotonic
from typing import Any, Generic, Optional, TypeVar

T = TypeVar("T")


class TTLCache(Generic[T]):
    def __init__(self, *, maxsize: int, ttl_seconds: float) -> None:
        self._max = max(1, int(maxsize))
        self._ttl = max(1.0, float(ttl_seconds))
        self._data: OrderedDict[str, tuple[float, T]] = OrderedDict()
        self._lock = Lock()

    def get(self, key: str) -> Optional[T]:
        with self._lock:
            self._evict_expired_unlocked()
            ent = self._data.get(key)
            if ent is None:
                return None
            exp, val = ent
            if exp <= monotonic():
                del self._data[key]
                return None
            self._data.move_to_end(key)
            return val

    def set(self, key: str, value: T) -> None:
        with self._lock:
            self._evict_expired_unlocked()
            if key in self._data:
                del self._data[key]
            self._data[key] = (monotonic() + self._ttl, value)
            self._data.move_to_end(key)
            while len(self._data) > self._max:
                self._data.popitem(last=False)

    def clear(self) -> None:
        with self._lock:
            self._data.clear()

    def _evict_expired_unlocked(self) -> None:
        now = monotonic()
        dead = [k for k, (exp, _) in self._data.items() if exp <= now]
        for k in dead:
            del self._data[k]
