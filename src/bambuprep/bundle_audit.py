"""Build-time inventory and privacy audit for the standalone Windows bundle."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from dataclasses import asdict, dataclass
from pathlib import Path


_PRIVATE_SUFFIXES = frozenset(
    {
        ".stl",
        ".3mf",
        ".sqlite",
        ".sqlite3",
        ".sqlite-wal",
        ".sqlite3-wal",
        ".sqlite-shm",
        ".sqlite3-shm",
        ".sqlite-journal",
        ".sqlite3-journal",
        ".db",
        ".log",
        ".pem",
        ".p12",
        ".pfx",
        ".key",
    }
)
_OPENAI_KEY_PATTERN = re.compile(rb"sk-[A-Za-z0-9_-]{20,}")
_SCAN_CHUNK_BYTES = 64 * 1024
_SCAN_OVERLAP_BYTES = 512


class BundleAuditError(ValueError):
    """The standalone output is incomplete or may contain user data/secrets."""


@dataclass(frozen=True, slots=True)
class BundleFile:
    path: str
    size: int
    sha256: str


@dataclass(frozen=True, slots=True)
class BundleInventory:
    bundle_name: str
    executable: str
    file_count: int
    total_bytes: int
    files: tuple[BundleFile, ...]


def inspect_standalone_bundle(
    bundle_path: Path,
    *,
    expected_executable: str = "BambuPrep.exe",
) -> BundleInventory:
    """List runtime files and reject common local-data files or OpenAI key-like tokens.

    The inventory contains only paths relative to the bundle, sizes, and hashes.
    Errors deliberately omit private filenames and matched token contents.
    """
    requested_root = Path(bundle_path)
    if requested_root.is_symlink() or not requested_root.is_dir():
        raise BundleAuditError("Standalone bundle directory is missing or unsafe.")
    root = requested_root.resolve(strict=True)
    if (
        not expected_executable
        or Path(expected_executable).name != expected_executable
        or "/" in expected_executable
        or "\\" in expected_executable
        or "\x00" in expected_executable
        or expected_executable in {".", ".."}
    ):
        raise BundleAuditError("Expected standalone executable name is invalid.")
    executable = root / expected_executable
    if executable.is_symlink() or not executable.is_file() or executable.stat().st_size <= 0:
        raise BundleAuditError("Expected standalone executable is missing or empty.")

    entries: list[BundleFile] = []
    total_bytes = 0
    for path in sorted(root.rglob("*")):
        if path.is_symlink():
            raise BundleAuditError("Standalone bundle contains an unsafe symbolic link.")
        if not path.is_file():
            continue
        relative = path.relative_to(root).as_posix()
        filename = path.name.lower()
        if (
            path.suffix.lower() in _PRIVATE_SUFFIXES
            or filename == ".env"
            or filename.startswith(".env.")
            or filename in {"credentials.json", "secrets.json"}
        ):
            raise BundleAuditError("Standalone bundle contains a user-data or credential file.")

        size, digest, has_key = _hash_and_scan(path)
        if has_key:
            raise BundleAuditError("An OpenAI-key-like token was found in the standalone bundle.")
        entries.append(BundleFile(path=relative, size=size, sha256=digest))
        total_bytes += size

    return BundleInventory(
        bundle_name=root.name,
        executable=expected_executable,
        file_count=len(entries),
        total_bytes=total_bytes,
        files=tuple(entries),
    )


def _hash_and_scan(path: Path) -> tuple[int, str, bool]:
    digest = hashlib.sha256()
    total = 0
    overlap = b""
    try:
        with path.open("rb") as stream:
            while True:
                chunk = stream.read(_SCAN_CHUNK_BYTES)
                if not chunk:
                    return total, digest.hexdigest(), False
                total += len(chunk)
                digest.update(chunk)
                sample = overlap + chunk
                if _OPENAI_KEY_PATTERN.search(sample):
                    return total, digest.hexdigest(), True
                overlap = sample[-_SCAN_OVERLAP_BYTES:]
    except OSError:
        raise BundleAuditError("A standalone bundle file could not be read.") from None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bundle", required=True, type=Path)
    parser.add_argument("--expected-executable", default="BambuPrep.exe")
    args = parser.parse_args(argv)
    try:
        inventory = inspect_standalone_bundle(
            args.bundle,
            expected_executable=args.expected_executable,
        )
    except BundleAuditError as exc:
        print(f"Bundle audit failed: {exc}", file=sys.stderr)
        return 2
    print(json.dumps(asdict(inventory), ensure_ascii=False, separators=(",", ":"), sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
