import sqlite3
import uuid
from datetime import datetime, timezone
from typing import Optional

from .config import db_path

_SCHEMA = """
CREATE TABLE IF NOT EXISTS profiles (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT DEFAULT '',
    language    TEXT DEFAULT 'en',
    ref_path    TEXT NOT NULL,
    created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversions (
    id           TEXT PRIMARY KEY,
    source_path  TEXT NOT NULL,
    output_path  TEXT NOT NULL,
    profile_id   TEXT,
    profile_name TEXT,
    engine       TEXT NOT NULL,
    created_at   TEXT NOT NULL
);
"""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _conn() -> sqlite3.Connection:
    c = sqlite3.connect(db_path())
    c.row_factory = sqlite3.Row
    return c


def init_db() -> None:
    with _conn() as c:
        c.executescript(_SCHEMA)


# --- profiles ---

def create_profile(name: str, ref_path: str, description: str = "", language: str = "en") -> dict:
    pid = uuid.uuid4().hex
    with _conn() as c:
        c.execute(
            "INSERT INTO profiles (id, name, description, language, ref_path, created_at) "
            "VALUES (?,?,?,?,?,?)",
            (pid, name, description, language, ref_path, _now()),
        )
    return get_profile(pid)


def get_profile(pid: str) -> Optional[dict]:
    with _conn() as c:
        row = c.execute("SELECT * FROM profiles WHERE id=?", (pid,)).fetchone()
    return dict(row) if row else None


def list_profiles() -> list[dict]:
    with _conn() as c:
        rows = c.execute("SELECT * FROM profiles ORDER BY created_at DESC").fetchall()
    return [dict(r) for r in rows]


def delete_profile(pid: str) -> None:
    with _conn() as c:
        c.execute("DELETE FROM profiles WHERE id=?", (pid,))


# --- conversions ---

def add_conversion(source_path: str, output_path: str, engine: str,
                   profile_id: Optional[str] = None, profile_name: Optional[str] = None) -> dict:
    cid = uuid.uuid4().hex
    with _conn() as c:
        c.execute(
            "INSERT INTO conversions (id, source_path, output_path, profile_id, profile_name, engine, created_at) "
            "VALUES (?,?,?,?,?,?,?)",
            (cid, source_path, output_path, profile_id, profile_name, engine, _now()),
        )
        row = c.execute("SELECT * FROM conversions WHERE id=?", (cid,)).fetchone()
    return dict(row)


def list_conversions() -> list[dict]:
    with _conn() as c:
        rows = c.execute("SELECT * FROM conversions ORDER BY created_at DESC").fetchall()
    return [dict(r) for r in rows]
