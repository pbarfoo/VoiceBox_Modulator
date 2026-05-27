"""
OpenVoice v2 engine — VITS-based timbre transfer.
Fast zero-shot conversion using speaker embeddings extracted from reference audio.
"""
from __future__ import annotations

import os
from typing import Callable, Optional

from .base import (
    CHECKPOINTS_DIR, SEED_VC_DIR,
    BaseEngine, EngineNotReady, EngineParams, ensure_seed_vc,
)

os.environ.setdefault("HF_HUB_CACHE", str(CHECKPOINTS_DIR))



class OpenVoiceEngine(BaseEngine):
    ENGINE_ID  = "openvoice"
    MODEL_NAME = "openvoice-v2-tone-converter"

    def __init__(self) -> None:
        super().__init__()
        self._converter = None
        self._sr: int   = 22050

    # ── load ──────────────────────────────────────────────────────────────────

    def _do_load(self, **_) -> None:
        from huggingface_hub import hf_hub_download

        ensure_seed_vc()

        from modules.openvoice.api import ToneColorConverter

        # Download v2 converter checkpoint + config (~120 MB, cached after first run)
        converter_pth = hf_hub_download(
            "myshell-ai/OpenVoiceV2", "converter/checkpoint.pth",
            cache_dir=str(CHECKPOINTS_DIR)
        )
        converter_cfg = hf_hub_download(
            "myshell-ai/OpenVoiceV2", "converter/config.json",
            cache_dir=str(CHECKPOINTS_DIR)
        )

        # "mps" bypasses the cuda assertion in OpenVoiceBaseClass.__init__
        self._converter = ToneColorConverter(str(converter_cfg), device=self._device_str)
        self._converter.load_ckpt(converter_pth)
        self._sr = self._converter.hps.data.sampling_rate   # 22050
        self._loaded = True

    def _do_unload(self) -> None:
        self._converter = None

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

        import torch
        import librosa
        import soundfile as sf

        cb = progress_cb
        sr = self._sr
        device = self._device_str

        # ── 1. Load audio ────────────────────────────────────────────────────
        self._report(cb, "Loading audio", 0.05)
        src_np = librosa.load(source_path, sr=sr)[0]
        ref_np = librosa.load(ref_path,    sr=sr)[0][:sr * 30]

        src_t = torch.tensor(src_np).float()
        ref_t = torch.tensor(ref_np).float()

        # ── 2. Extract speaker embeddings ────────────────────────────────────
        # extract_se takes list of 1-D float tensors + list of sample lengths
        self._report(cb, "Extracting target voice embedding", 0.25)
        tgt_se = self._converter.extract_se([ref_t], [len(ref_t)])  # [1, emb_dim]

        self._report(cb, "Extracting source voice embedding", 0.45)
        src_se = self._converter.extract_se([src_t], [len(src_t)])

        # ── 3. Convert ───────────────────────────────────────────────────────
        # tau: lower = tighter match to target timbre
        # fast=0.7, balanced=0.3, high=0.1
        self._report(cb, "Converting voice", 0.60)
        src_wave = src_t.unsqueeze(0).to(device)
        src_len  = torch.LongTensor([len(src_t)]).to(device)

        audio = self._converter.convert(
            src_wave, src_len, src_se, tgt_se, tau=params.tau
        )   # → [1, 1, T]

        # ── 4. Write ─────────────────────────────────────────────────────────
        self._report(cb, "Saving output", 0.92)
        sf.write(output_path, audio[0, 0].cpu().numpy(), sr)
        return output_path
