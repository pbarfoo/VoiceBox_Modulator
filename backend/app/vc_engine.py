"""
Voice-conversion engine — wraps seed-vc (standard 22 kHz model).
"""
from __future__ import annotations

import os
import sys
import threading
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Callable, Optional

SEED_VC_DIR = Path(__file__).parent.parent / "seed_vc"
CHECKPOINTS_DIR = SEED_VC_DIR / "checkpoints"
CHECKPOINTS_DIR.mkdir(parents=True, exist_ok=True)

os.environ.setdefault("HF_HUB_CACHE", str(CHECKPOINTS_DIR))


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


@dataclass
class EngineStatus:
    loaded: bool
    loading: bool
    load_error: str | None
    device: str
    model: str
    torch_available: bool


def _seed_vc_available() -> bool:
    return (SEED_VC_DIR / "inference.py").exists()


def _patch_hf_utils() -> None:
    """Redirect seed-vc's hf_utils downloads to our checkpoints dir."""
    import hf_utils
    from huggingface_hub import hf_hub_download

    def _load(repo_id: str, model_filename: str = "pytorch_model.bin",
               config_filename: str | None = None):
        model_path = hf_hub_download(repo_id=repo_id, filename=model_filename,
                                     cache_dir=str(CHECKPOINTS_DIR))
        if config_filename is None:
            return model_path
        config_path = hf_hub_download(repo_id=repo_id, filename=config_filename,
                                      cache_dir=str(CHECKPOINTS_DIR))
        return model_path, config_path

    hf_utils.load_custom_model_from_hf = _load


class VCEngine:

    MODEL_NAME = "seed-uvit-whisper-small-22k"

    def __init__(self) -> None:
        self._device_str = detect_device()
        self._loaded = False
        self._loading = False
        self._load_error: str | None = None
        self._lock = threading.Lock()

        self._device = None
        self._model = None
        self._semantic_fn = None
        self._vocoder_fn = None
        self._campplus = None
        self._to_mel = None
        self._sr: int = 22050
        self._hop: int = 256
        self._overlap_frames: int = 32

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
            torch_available=torch_ok,
        ))

    def load(self, variant: str = "standard") -> dict:
        with self._lock:
            if self._loaded:
                return self.status()
            if self._loading:
                return self.status()
            self._loading = True
            self._load_error = None
        try:
            self._do_load()
        except Exception as e:
            self._loading = False
            self._load_error = str(e)
            raise EngineNotReady(str(e)) from e
        self._loading = False
        return self.status()

    def load_async(self, variant: str = "standard") -> None:
        t = threading.Thread(target=self.load, args=(variant,), daemon=True)
        t.start()

    def is_ready(self) -> bool:
        return self._loaded

    def _do_load(self) -> None:
        import torch
        import yaml
        from transformers import AutoFeatureExtractor, WhisperModel

        self._ensure_seed_vc()
        _patch_hf_utils()

        from hf_utils import load_custom_model_from_hf
        from modules.commons import build_model, load_checkpoint, recursive_munch
        from modules.campplus.DTDNN import CAMPPlus
        from modules.bigvgan import bigvgan
        from modules.audio import mel_spectrogram

        device = torch.device(self._device_str)
        self._device = device

        dit_ckpt, dit_cfg = load_custom_model_from_hf(
            "Plachta/Seed-VC",
            "DiT_seed_v2_uvit_whisper_small_wavenet_bigvgan_pruned.pth",
            "config_dit_mel_seed_uvit_whisper_small_wavenet.yml",
        )
        cfg = yaml.safe_load(open(dit_cfg))
        model_params = recursive_munch(cfg["model_params"])
        model_params.dit_type = "DiT"
        model = build_model(model_params, stage="DiT")
        model, _, _, _ = load_checkpoint(model, None, dit_ckpt,
                                         load_only_params=True,
                                         ignore_modules=[], is_distributed=False)
        for k in model:
            model[k].eval().to(device)
        model.cfm.estimator.setup_caches(max_batch_size=1, max_seq_length=8192)
        self._model = model

        sp = cfg["preprocess_params"]["spect_params"]
        self._sr = cfg["preprocess_params"]["sr"]
        self._hop = sp["hop_length"]

        mel_args = dict(n_fft=sp["n_fft"], win_size=sp["win_length"],
                        hop_size=sp["hop_length"], num_mels=sp["n_mels"],
                        sampling_rate=self._sr, fmin=0, fmax=None, center=False)
        self._to_mel = lambda x: mel_spectrogram(x, **mel_args)

        whisper_name = cfg["model_params"].get("speech_tokenizer", {}).get("name", "openai/whisper-small")
        whisper = WhisperModel.from_pretrained(
            whisper_name, torch_dtype=torch.float16,
            cache_dir=str(CHECKPOINTS_DIR)
        ).to(device)
        del whisper.decoder
        extractor = AutoFeatureExtractor.from_pretrained(
            whisper_name, cache_dir=str(CHECKPOINTS_DIR)
        )

        def semantic_fn(waves_16k):
            inp = extractor([waves_16k.squeeze(0).cpu().numpy()],
                            return_tensors="pt", return_attention_mask=True)
            feats = whisper._mask_input_features(
                inp.input_features, attention_mask=inp.attention_mask
            ).to(device)
            with torch.no_grad():
                out = whisper.encoder(
                    feats.to(whisper.encoder.dtype),
                    head_mask=None, output_attentions=False,
                    output_hidden_states=False, return_dict=True,
                )
            S = out.last_hidden_state.to(torch.float32)
            return S[:, :waves_16k.size(-1) // 320 + 1]

        self._semantic_fn = semantic_fn

        camp_ckpt = load_custom_model_from_hf("funasr/campplus", "campplus_cn_common.bin", config_filename=None)
        campplus = CAMPPlus(feat_dim=80, embedding_size=192)
        campplus.load_state_dict(torch.load(camp_ckpt, map_location="cpu"))
        campplus.eval().to(device)
        self._campplus = campplus

        bvg = bigvgan.BigVGAN.from_pretrained("nvidia/bigvgan_v2_22khz_80band_256x", use_cuda_kernel=False)
        bvg.remove_weight_norm()
        self._vocoder_fn = bvg.eval().to(device)

        self._loaded = True

    def _ensure_seed_vc(self) -> None:
        if not _seed_vc_available():
            raise EngineNotReady(
                f"seed-vc not found at {SEED_VC_DIR}. "
                "Run the backend setup to vendor seed-vc."
            )
        if str(SEED_VC_DIR) not in sys.path:
            sys.path.insert(0, str(SEED_VC_DIR))

    def unload(self) -> dict:
        with self._lock:
            self._model = None
            self._semantic_fn = None
            self._vocoder_fn = None
            self._campplus = None
            self._loaded = False
            try:
                import torch
                if self._device_str == "mps":
                    torch.mps.empty_cache()
                elif self._device_str == "cuda":
                    torch.cuda.empty_cache()
            except Exception:
                pass
        return self.status()

    # ── conversion ────────────────────────────────────────────────────────────

    def convert(
        self,
        source_path: str,
        ref_path: str,
        output_path: str,
        diffusion_steps: int = 25,
        progress_cb: Optional[Callable[[str, float], None]] = None,
    ) -> str:
        if not self._loaded:
            if not self._loading:
                self.load_async()
            raise EngineNotReady(
                "Engine is loading. Poll /engine/status until loaded=true, then retry."
            )

        def _report(stage: str, pct: float) -> None:
            if progress_cb:
                progress_cb(stage, pct)

        import contextlib
        import numpy as np
        import torch
        import torchaudio
        import librosa
        import soundfile as sf

        device = self._device
        sr = self._sr
        hop = self._hop
        overlap_frames = self._overlap_frames
        overlap_wave = overlap_frames * hop
        max_context = sr // hop * 30

        # ── 1. Load audio ────────────────────────────────────────────────────
        _report("Loading audio", 0.03)
        src_np = librosa.load(source_path, sr=sr)[0]
        ref_np = librosa.load(ref_path, sr=sr)[0]
        ref_np = ref_np[:sr * 30]

        src = torch.tensor(src_np).unsqueeze(0).float().to(device)
        ref = torch.tensor(ref_np).unsqueeze(0).float().to(device)

        src_16k = torchaudio.functional.resample(src, sr, 16000)
        ref_16k = torchaudio.functional.resample(ref, sr, 16000)

        # ── 2. Whisper semantic features ─────────────────────────────────────
        _report("Extracting speech content", 0.12)
        S_src = self._semantic_fn(src_16k)
        S_ref = self._semantic_fn(ref_16k)

        # ── 3. Mel spectrograms ──────────────────────────────────────────────
        _report("Computing spectrograms", 0.22)
        mel_src = self._to_mel(src.float())
        mel_ref = self._to_mel(ref.float())

        tgt_len = torch.LongTensor([mel_src.size(2)]).to(device)
        ref_len = torch.LongTensor([mel_ref.size(2)]).to(device)

        # ── 4. Speaker style embedding (CAMPPlus) ────────────────────────────
        _report("Analysing target voice", 0.30)
        feat_ref = torchaudio.compliance.kaldi.fbank(
            ref_16k, num_mel_bins=80, dither=0, sample_frequency=16000
        )
        feat_ref = feat_ref - feat_ref.mean(dim=0, keepdim=True)
        style = self._campplus(feat_ref.unsqueeze(0))

        # ── 5. Length regulation ─────────────────────────────────────────────
        _report("Aligning sequence lengths", 0.36)
        cond,   *_ = self._model.length_regulator(S_src, ylens=tgt_len, n_quantizers=3)
        prompt, *_ = self._model.length_regulator(S_ref, ylens=ref_len, n_quantizers=3)

        if self._device_str == "cuda":
            autocast_ctx = lambda: torch.autocast(device_type="cuda", dtype=torch.float16)
        else:
            autocast_ctx = contextlib.nullcontext

        max_src = max_context - mel_ref.size(2)
        total_frames = cond.size(1)

        processed = 0
        chunk_idx = 0
        chunks: list[np.ndarray] = []
        prev_chunk = None

        def _crossfade(a: np.ndarray, b: np.ndarray, n: int) -> np.ndarray:
            fo = np.cos(np.linspace(0, np.pi / 2, n)) ** 2
            fi = np.cos(np.linspace(np.pi / 2, 0, n)) ** 2
            out = b.copy()
            out[:n] = b[:n] * fi + a[-n:] * fo
            return out

        # ── 6. Diffusion inference (chunked) ─────────────────────────────────
        with torch.no_grad():
            while processed < total_frames:
                chunk_cond = cond[:, processed:processed + max_src]
                is_last = processed + max_src >= total_frames

                chunk_pct = min(processed / max(total_frames, 1), 1.0)
                _report(
                    f"Running diffusion{' (final chunk)' if is_last else f' — chunk {chunk_idx + 1}'}",
                    0.36 + chunk_pct * 0.49,
                )

                cat = torch.cat([prompt, chunk_cond], dim=1)
                with autocast_ctx():
                    vc_target = self._model.cfm.inference(
                        cat,
                        torch.LongTensor([cat.size(1)]).to(device),
                        mel_ref, style, None, diffusion_steps,
                        inference_cfg_rate=0.7,
                    )
                    vc_target = vc_target[:, :, mel_ref.size(-1):]

                vc_wave = self._vocoder_fn(vc_target.float().clone()).squeeze()[None, :]

                if processed == 0:
                    if is_last:
                        chunks.append(vc_wave[0].cpu().numpy())
                        break
                    chunks.append(vc_wave[0, :-overlap_wave].cpu().numpy())
                    prev_chunk = vc_wave[0, -overlap_wave:].cpu().numpy()
                    processed += vc_target.size(2) - overlap_frames
                elif is_last:
                    chunks.append(_crossfade(prev_chunk, vc_wave[0].cpu().numpy(), overlap_wave))
                    break
                else:
                    wave_np = vc_wave[0].cpu().numpy()
                    chunks.append(_crossfade(prev_chunk, wave_np[:-overlap_wave], overlap_wave))
                    prev_chunk = wave_np[-overlap_wave:]
                    processed += vc_target.size(2) - overlap_frames

                chunk_idx += 1

        # ── 7. Write ─────────────────────────────────────────────────────────
        _report("Synthesising waveform", 0.88)
        wave = np.concatenate(chunks)

        _report("Saving output", 0.96)
        sf.write(output_path, wave, sr)
        return output_path


engine = VCEngine()
