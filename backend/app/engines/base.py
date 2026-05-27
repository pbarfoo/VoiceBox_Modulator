"""
Abstract base class and shared types for all voice-conversion engines.
"""
from __future__ import annotations

import sys
import threading
from abc import ABC, abstractmethod
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Callable, Optional

SEED_VC_DIR    = Path(__file__).parent.parent.parent / "seed_vc"
CHECKPOINTS_DIR = SEED_VC_DIR / "checkpoints"
CHECKPOINTS_DIR.mkdir(parents=True, exist_ok=True)


class EngineNotReady(RuntimeError):
    pass


def detect_device() -> str:
    try:
        import torch
    except ImportError:
        return "cpu"
    if torch.backends.mps.is_available():
        return "mps"
    if torch.cuda.is_available():
        return "cuda"
    return "cpu"


def ensure_seed_vc() -> None:
    if not (SEED_VC_DIR / "inference.py").exists():
        raise EngineNotReady(
            f"seed-vc not found at {SEED_VC_DIR}. Run backend setup."
        )
    if str(SEED_VC_DIR) not in sys.path:
        sys.path.insert(0, str(SEED_VC_DIR))


@dataclass
class EngineParams:
    diffusion_steps: int = 25   # seed-vc
    tau: float = 0.3             # openvoice (0.1 = tight, 0.9 = loose)
    f0_up_key: int = 0           # rvc (semitones, -12 to +12)


@dataclass
class EngineStatus:
    loaded: bool
    loading: bool
    load_error: str | None
    device: str
    model: str
    engine_id: str
    torch_available: bool


class BaseEngine(ABC):
    ENGINE_ID: str = ""
    MODEL_NAME: str = ""

    def __init__(self) -> None:
        self._device_str = detect_device()
        self._loaded = False
        self._loading = False
        self._load_error: str | None = None
        self._lock = threading.Lock()

    # ── public lifecycle ──────────────────────────────────────────────────────

    def load(self, **kwargs) -> dict:
        with self._lock:
            if self._loaded:
                return self.status()
            if self._loading:
                return self.status()
            self._loading = True
            self._load_error = None
        try:
            self._do_load(**kwargs)
        except Exception as e:
            self._loading = False
            self._load_error = str(e)
            raise EngineNotReady(str(e)) from e
        self._loading = False
        return self.status()

    def load_async(self, **kwargs) -> None:
        threading.Thread(target=self.load, kwargs=kwargs, daemon=True).start()

    def is_ready(self) -> bool:
        return self._loaded

    def unload(self) -> dict:
        with self._lock:
            self._do_unload()
            self._loaded = False
        self._flush_cache()
        return self.status()

    def status(self) -> dict:
        torch_ok = False
        try:
            import torch  # noqa: F401
            torch_ok = True
        except ImportError:
            pass
        return asdict(EngineStatus(
            loaded=self._loaded,
            loading=self._loading,
            load_error=self._load_error,
            device=self._device_str,
            model=self.MODEL_NAME,
            engine_id=self.ENGINE_ID,
            torch_available=torch_ok,
        ))

    # ── abstract interface ────────────────────────────────────────────────────

    @abstractmethod
    def _do_load(self, **kwargs) -> None: ...

    def _do_unload(self) -> None:
        """Override to null out model references."""
        pass

    @abstractmethod
    def convert(
        self,
        source_path: str,
        ref_path: str,
        output_path: str,
        params: EngineParams,
        progress_cb: Optional[Callable[[str, float], None]] = None,
    ) -> str: ...

    # ── helpers ───────────────────────────────────────────────────────────────

    def _flush_cache(self) -> None:
        try:
            import torch
            if self._device_str == "mps":
                torch.mps.empty_cache()
            elif self._device_str == "cuda":
                torch.cuda.empty_cache()
        except Exception:
            pass

    def _report(self, cb: Optional[Callable], stage: str, pct: float) -> None:
        if cb:
            cb(stage, pct)
