"""
RVC engine — zero-shot pitch-shift mode using RMVPE F0 analysis.

Computes the median pitch difference between source and reference audio,
then shifts the source audio by that many semitones. The f0_up_key param
adds an additional manual semitone offset.

Note: This is a zero-shot approximation using pitch shifting, not full
RVC inference (which requires a trained per-voice .pth model). It changes
the speaker's pitch to match the reference but does not convert timbre.
"""
from __future__ import annotations

import os
from typing import Callable, Optional

from .base import (
    CHECKPOINTS_DIR, SEED_VC_DIR,
    BaseEngine, EngineNotReady, EngineParams, ensure_seed_vc,
)

os.environ.setdefault("HF_HUB_CACHE", str(CHECKPOINTS_DIR))


class RVCEngine(BaseEngine):
    ENGINE_ID  = "rvc"
    MODEL_NAME = "rvc-zero-shot-pitch-shift"

    def __init__(self) -> None:
        super().__init__()
        self._rmvpe = None
        self._sr: int = 22050

    # ── load ──────────────────────────────────────────────────────────────────

    def _do_load(self, **_) -> None:
        import torch
        from huggingface_hub import hf_hub_download

        ensure_seed_vc()

        from modules.rmvpe import RMVPE

        rmvpe_path = hf_hub_download(
            "lj1995/VoiceConversionWebUI", "rmvpe.pt",
            cache_dir=str(CHECKPOINTS_DIR)
        )
        device = torch.device(self._device_str)
        self._rmvpe  = RMVPE(rmvpe_path, is_half=False, device=device)
        self._loaded = True

    def _do_unload(self) -> None:
        self._rmvpe = None

    # ── convert ───────────────────────────────────────────────────────────────

    def convert(
        self,
        source_path: str,
        ref_path: str,
        output_path: str,
        params: EngineParams,
        progress_cb: Optional[Callable[[str, float], None]] = None,
    ) -> str:
        if not self._loaded:
            if not self._loading:
                self.load_async()
            raise EngineNotReady("Engine is loading. Poll /engine/status until loaded=true.")

        import numpy as np
        import torch
        import torchaudio
        import librosa
        import soundfile as sf

        cb = progress_cb
        sr = self._sr

        # ── 1. Load audio ────────────────────────────────────────────────────
        self._report(cb, "Loading audio", 0.05)
        src_np = librosa.load(source_path, sr=sr)[0]
        ref_np = librosa.load(ref_path,    sr=sr)[0][:sr * 30]

        src_t = torch.tensor(src_np).unsqueeze(0).float()
        ref_t = torch.tensor(ref_np).unsqueeze(0).float()
        src_16k = torchaudio.functional.resample(src_t, sr, 16000)
        ref_16k = torchaudio.functional.resample(ref_t, sr, 16000)

        # ── 2. F0 extraction with RMVPE ───────────────────────────────────────
        self._report(cb, "Extracting pitch from source", 0.25)
        f0_src = self._rmvpe.infer_from_audio(src_16k[0], thred=0.03)

        self._report(cb, "Extracting pitch from reference", 0.50)
        f0_ref = self._rmvpe.infer_from_audio(ref_16k[0], thred=0.03)

        # ── 3. Compute semitone shift ─────────────────────────────────────────
        voiced_src = f0_src[f0_src > 0]
        voiced_ref = f0_ref[f0_ref > 0]

        if len(voiced_src) == 0 or len(voiced_ref) == 0:
            # No voiced frames — just apply manual offset, no analysis shift
            semitone_shift = params.f0_up_key
        else:
            median_src = float(np.median(voiced_src))
            median_ref = float(np.median(voiced_ref))
            semitone_shift = int(round(12 * np.log2(median_ref / median_src))) + params.f0_up_key

        # ── 4. Pitch shift ────────────────────────────────────────────────────
        self._report(cb, f"Shifting pitch by {semitone_shift:+d} semitones", 0.70)
        if semitone_shift != 0:
            wave = librosa.effects.pitch_shift(src_np, sr=sr, n_steps=semitone_shift)
        else:
            wave = src_np

        # ── 5. Write ─────────────────────────────────────────────────────────
        self._report(cb, "Saving output", 0.95)
        sf.write(output_path, wave, sr)
        return output_path
