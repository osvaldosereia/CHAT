"""Local application paths; no cloud or network configuration is stored here."""

from __future__ import annotations

import os
import json
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping


APP_DIRECTORY_NAME = "BambuPrep"
_PREFERENCES_LIMIT = 16 * 1024


@dataclass(frozen=True, slots=True)
class AppPaths:
    data_dir: Path
    database_file: Path
    logs_dir: Path
    temp_dir: Path


@dataclass(frozen=True, slots=True)
class LocalPreferences:
    """Non-secret local preferences; API credentials are never stored here."""

    studio_executable: Path | None = None


class LocalPreferencesStore:
    """Bounded JSON preference file containing only the selected Studio executable path."""

    def __init__(self, preferences_file: Path):
        self.path = Path(preferences_file)

    def load(self) -> LocalPreferences:
        if self.path.is_symlink():
            raise ValueError("Local preferences file must not be a symlink")
        try:
            with self.path.open("rb") as stream:
                contents = stream.read(_PREFERENCES_LIMIT + 1)
        except FileNotFoundError:
            return LocalPreferences()
        except OSError as exc:
            raise ValueError("Could not read local BambuPrep preferences") from exc
        if len(contents) > _PREFERENCES_LIMIT:
            raise ValueError("Local preferences file exceeds the supported size limit")
        try:
            data = json.loads(contents.decode("utf-8"))
        except (UnicodeError, json.JSONDecodeError):
            raise ValueError("Local preferences file is not valid UTF-8 JSON") from None
        if not isinstance(data, dict) or set(data) != {"studio_executable"}:
            raise ValueError("Local preferences contain unexpected fields")
        raw_path = data["studio_executable"]
        if raw_path is None:
            return LocalPreferences()
        if not isinstance(raw_path, str) or not raw_path.strip() or len(raw_path) > 4096 or "\x00" in raw_path:
            raise ValueError("Configured Bambu Studio executable path is invalid")
        executable = Path(raw_path)
        if not executable.is_absolute():
            raise ValueError("Configured Bambu Studio executable path must be absolute")
        return LocalPreferences(studio_executable=executable)

    def save_studio_executable(self, executable: Path) -> None:
        path = Path(executable)
        if not path.is_absolute():
            raise ValueError("Bambu Studio executable path must be absolute")
        contents = json.dumps(
            {"studio_executable": str(path)},
            ensure_ascii=False,
            separators=(",", ":"),
        )
        if len(contents.encode("utf-8")) > _PREFERENCES_LIMIT:
            raise ValueError("Local preferences file exceeds the supported size limit")
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if self.path.is_symlink():
            raise ValueError("Local preferences file must not be a symlink")
        temporary = self.path.with_name(f".{self.path.name}.{uuid.uuid4().hex}.tmp")
        try:
            with temporary.open("x", encoding="utf-8", newline="\n") as stream:
                stream.write(contents)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, self.path)
        except OSError as exc:
            raise ValueError("Could not save local BambuPrep preferences") from exc
        finally:
            try:
                temporary.unlink(missing_ok=True)
            except OSError:
                pass


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
