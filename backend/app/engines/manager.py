"""
EngineManager — holds the active engine and handles switching between engines.
"""
from __future__ import annotations

import threading
from typing import TYPE_CHECKING

from .base import BaseEngine, EngineParams, EngineNotReady
from .seed_vc  import SeedVCEngine
from .openvoice import OpenVoiceEngine
from .rvc      import RVCEngine

_ENGINE_CLASSES: dict[str, type[BaseEngine]] = {
    "seedvc":    SeedVCEngine,
    "openvoice": OpenVoiceEngine,
    "rvc":       RVCEngine,
}


class EngineManager:
    def __init__(self) -> None:
        self._active: BaseEngine = SeedVCEngine()
        self._switch_lock = threading.Lock()

    # ── public API ────────────────────────────────────────────────────────────

    def select_engine(self, engine_id: str, **load_kwargs) -> dict:
        """Switch to the given engine. Unloads the current one first if different."""
        engine_id = engine_id.lower()
        if engine_id not in _ENGINE_CLASSES:
            raise ValueError(f"Unknown engine '{engine_id}'. Choose from: {list(_ENGINE_CLASSES)}")

        with self._switch_lock:
            # Already the right engine and loaded — nothing to do
            if self._active.ENGINE_ID == engine_id and self._active.is_ready():
                return self._active.status()

            # If same engine is still loading, just return current status
            if self._active.ENGINE_ID == engine_id and self._active._loading:
                return self._active.status()

            # Unload current engine (frees GPU memory)
            if self._active.is_ready() or self._active._loading:
                try:
                    self._active.unload()
                except Exception:
                    pass

            # Instantiate and start loading the new engine
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
