"""Local application paths; no cloud or network configuration is stored here."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping


APP_DIRECTORY_NAME = "BambuPrep"


@dataclass(frozen=True, slots=True)
class AppPaths:
    data_dir: Path
    database_file: Path
    logs_dir: Path
    temp_dir: Path


def get_app_paths(
    local_app_data: Path | None = None,
    environ: Mapping[str, str] | None = None,
) -> AppPaths:
    if local_app_data is None:
        values = os.environ if environ is None else environ
        raw_path = values.get("LOCALAPPDATA")
        if not raw_path:
            raise RuntimeError("LOCALAPPDATA is unavailable; BambuPrep requires a Windows local profile")
        local_app_data = Path(raw_path)
    data_dir = Path(local_app_data) / APP_DIRECTORY_NAME
    return AppPaths(
        data_dir=data_dir,
        database_file=data_dir / "bambuprep.sqlite3",
        logs_dir=data_dir / "logs",
        temp_dir=data_dir / "temp",
    )
