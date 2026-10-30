"""Versioned SQLite setup for the local job history."""

from __future__ import annotations

import sqlite3
from pathlib import Path


SCHEMA_VERSION = 1


def connect(database_path: Path) -> sqlite3.Connection:
    database_path = Path(database_path)
    database_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(database_path, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def initialize_database(database_path: Path) -> None:
    with connect(database_path) as connection:
        version = connection.execute("PRAGMA user_version").fetchone()[0]
        if version > SCHEMA_VERSION:
            raise RuntimeError(f"Database schema {version} is newer than supported schema {SCHEMA_VERSION}")
        if version == 0:
            connection.executescript(
                """
                CREATE TABLE jobs (
                    id TEXT PRIMARY KEY,
                    created_at TEXT NOT NULL,
                    source_path TEXT NOT NULL,
                    source_sha256 TEXT NOT NULL,
                    state TEXT NOT NULL,
                    report_json TEXT,
                    output_path TEXT
                );
                CREATE INDEX jobs_created_at_idx ON jobs(created_at DESC);
                CREATE TABLE job_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
                    created_at TEXT NOT NULL,
                    target_state TEXT NOT NULL,
                    detail TEXT
                );
                PRAGMA user_version = 1;
                """
            )
