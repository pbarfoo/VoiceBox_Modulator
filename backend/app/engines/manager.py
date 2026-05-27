"""
EngineManager — holds the active engine.
"""
from __future__ import annotations

import threading

from .base import BaseEngine, EngineParams, EngineNotReady
from .seed_vc import SeedVCEngine

_ENGINE_CLASSES: dict[str, type[BaseEngine]] = {
    "seedvc": SeedVCEngine,
}


class EngineManager:
    def __init__(self) -> None:
        self._active: BaseEngine = SeedVCEngine()
        self._switch_lock = threading.Lock()

    def select_engine(self, engine_id: str, **load_kwargs) -> dict:
        engine_id = engine_id.lower()
        if engine_id not in _ENGINE_CLASSES:
            engine_id = "seedvc"

        with self._switch_lock:
            if self._active.ENGINE_ID == engine_id and self._active.is_ready():
                return self._active.status()
            if self._active.ENGINE_ID == engine_id and self._active._loading:
                return self._active.status()
            if self._active.is_ready() or self._active._loading:
                try:
                    self._active.unload()
                except Exception:
                    pass
            self._active = _ENGINE_CLASSES[engine_id]()
            self._active.load_async(**load_kwargs)

        return self._active.status()

    def convert(self, source_path: str, ref_path: str, output_path: str,
                params: EngineParams, progress_cb=None) -> str:
        return self._active.convert(source_path, ref_path, output_path, params, progress_cb)

    def status(self) -> dict:
        return self._active.status()

    def is_ready(self) -> bool:
        return self._active.is_ready()

    @property
    def MODEL_NAME(self) -> str:
        return self._active.MODEL_NAME

    @property
    def ENGINE_ID(self) -> str:
        return self._active.ENGINE_ID


manager = EngineManager()
