import os
from pathlib import Path

APP_NAME = "VoiceBox Modulator"
BACKEND_PORT = 17861


def data_dir() -> Path:
    """Per-user application data directory (macOS Application Support)."""
    override = os.environ.get("VOICEBOX_DATA_DIR")
    base = Path(override) if override else Path.home() / "Library" / "Application Support" / APP_NAME
    base.mkdir(parents=True, exist_ok=True)
    return base


def models_dir() -> Path:
    override = os.environ.get("VOICEBOX_MODELS_DIR")
    d = Path(override) if override else data_dir() / "models"
    d.mkdir(parents=True, exist_ok=True)
    return d


def audio_dir() -> Path:
    d = data_dir() / "audio"
    d.mkdir(parents=True, exist_ok=True)
    return d


def db_path() -> Path:
    return data_dir() / "voicebox.sqlite3"
