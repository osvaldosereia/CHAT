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
    output_directory: Path | None = None


class LocalPreferencesStore:
    """Bounded JSON preference file containing non-secret local paths only."""

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
        if (
            not isinstance(data, dict)
            or "studio_executable" not in data
            or not set(data).issubset({"studio_executable", "output_directory"})
        ):
            raise ValueError("Local preferences contain unexpected fields")
        executable = self._read_absolute_path(data["studio_executable"], "Bambu Studio executable")
        output_directory = self._read_absolute_path(data.get("output_directory"), "output directory")
        return LocalPreferences(studio_executable=executable, output_directory=output_directory)

    def save_studio_executable(self, executable: Path) -> None:
        path = self._write_absolute_path(executable, "Bambu Studio executable")
        preferences = self.load()
        self._save(LocalPreferences(studio_executable=path, output_directory=preferences.output_directory))

    def save_output_directory(self, output_directory: Path) -> None:
        path = self._write_absolute_path(output_directory, "output directory")
        preferences = self.load()
        self._save(LocalPreferences(studio_executable=preferences.studio_executable, output_directory=path))

    @staticmethod
    def _read_absolute_path(raw_path: object, label: str) -> Path | None:
        if raw_path is None:
            return None
        if not isinstance(raw_path, str) or not raw_path.strip() or len(raw_path) > 4096 or "\x00" in raw_path:
            raise ValueError(f"Configured {label} path is invalid")
        path = Path(raw_path)
        if not path.is_absolute():
            raise ValueError(f"Configured {label} path must be absolute")
        return path

    @staticmethod
    def _write_absolute_path(raw_path: Path, label: str) -> Path:
        path = Path(raw_path)
        if not path.is_absolute():
            raise ValueError(f"{label.capitalize()} path must be absolute")
        return path

    def _save(self, preferences: LocalPreferences) -> None:
        contents = json.dumps(
            {
                "studio_executable": str(preferences.studio_executable) if preferences.studio_executable else None,
                "output_directory": str(preferences.output_directory) if preferences.output_directory else None,
            },
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
