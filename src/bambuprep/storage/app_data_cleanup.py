"""Delete only files and directories owned by BambuPrep under its local data root."""

from __future__ import annotations

import os
import stat
from dataclasses import dataclass
from pathlib import Path

from bambuprep.config import APP_DIRECTORY_NAME, AppPaths, LocalPreferencesStore


class AppDataCleanupError(RuntimeError):
    """Raised when app data cannot be removed without touching an unknown location."""

    def __init__(self, message: str, *, removed_files: int = 0) -> None:
        super().__init__(message)
        self.removed_files = removed_files


@dataclass(frozen=True, slots=True)
class _RemovalEntry:
    path: Path
    is_directory: bool


def remove_local_app_files(paths: AppPaths) -> int:
    """Remove BambuPrep's known metadata, logs, and temporary files.

    The custom output directory and the Windows Credential Locker are never
    removed. Unknown files in the application root are also preserved.
    """
    root = Path(paths.data_dir)
    database = root / "bambuprep.sqlite3"
    logs = root / "logs"
    temporary = root / "temp"
    if (
        root.name != APP_DIRECTORY_NAME
        or Path(paths.database_file) != database
        or Path(paths.logs_dir) != logs
        or Path(paths.temp_dir) != temporary
    ):
        raise AppDataCleanupError("Local BambuPrep data paths are not recognized; nothing was removed.")

    try:
        root_info = root.lstat()
    except FileNotFoundError:
        return 0
    except OSError:
        raise AppDataCleanupError("Local BambuPrep data could not be inspected; nothing was removed.") from None
    if _is_reparse_point(root_info) or not stat.S_ISDIR(root_info.st_mode):
        raise AppDataCleanupError("Local BambuPrep data is redirected or unsafe; nothing was removed.")

    try:
        root_real = root.resolve(strict=True)
    except OSError:
        raise AppDataCleanupError("Local BambuPrep data could not be inspected; nothing was removed.") from None

    output_directory = _configured_output_directory(root / "preferences.json")
    try:
        interrupted_preferences = sorted(root.glob(".preferences.json.*.tmp"))
    except OSError:
        raise AppDataCleanupError("Local BambuPrep data could not be inspected; nothing was removed.") from None
    targets = [
        root / "preferences.json",
        database,
        Path(str(database) + "-wal"),
        Path(str(database) + "-shm"),
        Path(str(database) + "-journal"),
    ]
    targets.extend(interrupted_preferences)
    for directory in (logs, temporary):
        if output_directory is not None and _is_within(directory, output_directory):
            continue
        targets.append(directory)

    entries: list[_RemovalEntry] = []
    for target in targets:
        try:
            _collect_owned_path(
                target,
                root_real,
                entries,
                output_directory=output_directory if target in (logs, temporary) else None,
                allow_directory=target in (logs, temporary),
            )
        except AppDataCleanupError:
            raise
        except OSError:
            raise AppDataCleanupError("Local BambuPrep data contains an unsafe path; nothing was removed.") from None

    removed_files = 0
    for entry in entries:
        try:
            info = entry.path.lstat()
            if _is_reparse_point(info):
                raise OSError("redirected path")
            resolved = entry.path.resolve(strict=True)
            if not _is_within(resolved, root_real):
                raise OSError("outside app root")
            if entry.is_directory:
                entry.path.rmdir()
            else:
                entry.path.unlink()
                removed_files += 1
        except FileNotFoundError:
            continue
        except OSError:
            raise AppDataCleanupError(
                "Could not remove all local BambuPrep data; some files may already have been removed.",
                removed_files=removed_files,
            ) from None
    return removed_files


def _configured_output_directory(preferences_file: Path) -> Path | None:
    try:
        output_directory = LocalPreferencesStore(preferences_file).load().output_directory
        if output_directory is None:
            return None
        return Path(os.path.abspath(os.fspath(output_directory)))
    except Exception:
        raise AppDataCleanupError("Local preferences could not be checked; nothing was removed.") from None


def _collect_owned_path(
    path: Path,
    root: Path,
    entries: list[_RemovalEntry],
    *,
    output_directory: Path | None,
    allow_directory: bool,
) -> None:
    if output_directory is not None and _same_path(path, output_directory):
        return
    try:
        info = path.lstat()
    except FileNotFoundError:
        return
    if _is_reparse_point(info):
        raise AppDataCleanupError("Local BambuPrep data contains a redirected path; nothing was removed.")
    resolved = path.resolve(strict=True)
    if not _is_within(resolved, root):
        raise AppDataCleanupError("Local BambuPrep data points outside its folder; nothing was removed.")

    is_directory = stat.S_ISDIR(info.st_mode)
    if is_directory:
        if not allow_directory:
            raise AppDataCleanupError("An expected BambuPrep file has an unexpected type; nothing was removed.")
        for child in sorted(path.iterdir()):
            _collect_owned_path(
                child,
                root,
                entries,
                output_directory=output_directory,
                allow_directory=True,
            )
        if output_directory is None or not _is_within(output_directory, path):
            entries.append(_RemovalEntry(path, True))
    elif stat.S_ISREG(info.st_mode):
        entries.append(_RemovalEntry(path, False))
    else:
        raise AppDataCleanupError("Local BambuPrep data contains an unsupported path; nothing was removed.")


def _is_reparse_point(info: os.stat_result) -> bool:
    attributes = getattr(info, "st_file_attributes", 0)
    reparse_flag = getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400)
    return stat.S_ISLNK(info.st_mode) or bool(attributes & reparse_flag)


def _same_path(left: Path, right: Path) -> bool:
    return os.path.normcase(os.path.abspath(os.fspath(left))) == os.path.normcase(os.path.abspath(os.fspath(right)))


def _is_within(candidate: Path, parent: Path) -> bool:
    candidate_path = os.path.normcase(os.path.abspath(os.fspath(candidate)))
    parent_path = os.path.normcase(os.path.abspath(os.fspath(parent)))
    try:
        return os.path.commonpath((candidate_path, parent_path)) == parent_path
    except ValueError:
        return False

