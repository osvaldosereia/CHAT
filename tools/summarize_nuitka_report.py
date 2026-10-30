"""Print a compact, lock-checked summary of Nuitka's build-time reports."""

from __future__ import annotations

import argparse
from importlib import metadata as importlib_metadata
import json
import re
import sys
import tomllib
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any, Iterable


_MAX_REPORT_BYTES = 32 * 1024 * 1024
_MAX_LICENSE_SUMMARY_CHARS = 240
class LicenseInventoryError(ValueError):
    """A build report is invalid or does not match the committed lock file."""


def summarize_nuitka_reports(
    compilation_report_text: str,
    lock_text: str,
    *,
    installed_distributions: Iterable[importlib_metadata.Distribution] | None = None,
) -> dict[str, Any]:
    """Summarize compiled distributions, reading their licenses from installed metadata."""
    compiled_distributions = _parse_compilation_report(compilation_report_text)

    try:
        lock = tomllib.loads(lock_text)
    except tomllib.TOMLDecodeError:
        raise LicenseInventoryError("Dependency lock file is not valid TOML.") from None
    packages = lock.get("package")
    if not isinstance(packages, list):
        raise LicenseInventoryError("Dependency lock file has no package list.")

    locked_versions: dict[str, set[str]] = {}
    for package in packages:
        if not isinstance(package, dict):
            raise LicenseInventoryError("Dependency lock file contains an invalid package entry.")
        name, version = package.get("name"), package.get("version")
        if isinstance(name, str) and name.strip() and isinstance(version, str) and version.strip():
            locked_versions.setdefault(_normalize_name(name), set()).add(version)

    installed_licenses = _index_installed_licenses(installed_distributions)
    summarized = []
    for name, version in compiled_distributions:
        key = (_normalize_name(name), version)
        if key not in installed_licenses:
            raise LicenseInventoryError("A compiled distribution's installed metadata could not be found.")
        license_value = " ".join(installed_licenses[key].split())
        entry = {
            "name": name,
            "version": version,
            "license": license_value[:_MAX_LICENSE_SUMMARY_CHARS],
            "lock_match": version in locked_versions.get(_normalize_name(name), set()),
        }
        if len(license_value) > _MAX_LICENSE_SUMMARY_CHARS:
            entry["license_truncated"] = True
            entry["license"] += "…"
        summarized.append(entry)
    summarized.sort(key=lambda entry: (_normalize_name(entry["name"]), entry["version"]))
    return {
        "compilation_report_valid": True,
        "distribution_count": len(summarized),
        "all_distributions_locked": all(item["lock_match"] for item in summarized),
        "distributions": summarized,
    }


def _parse_compilation_report(report_text: str) -> list[tuple[str, str]]:
    if len(report_text.encode("utf-8")) > _MAX_REPORT_BYTES:
        raise LicenseInventoryError("Nuitka compilation report exceeds the supported size limit.")
    try:
        root = ET.fromstring(report_text)
    except ET.ParseError:
        raise LicenseInventoryError("Nuitka compilation report is not valid XML.") from None
    container = root.find("distributions")
    if container is None:
        raise LicenseInventoryError("Nuitka compilation report has no distribution inventory.")

    distributions: list[tuple[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for item in container.findall("distribution"):
        name, version = item.get("name"), item.get("version")
        if not name or not version:
            raise LicenseInventoryError("Nuitka compilation report has an incomplete distribution entry.")
        key = (_normalize_name(name), version)
        if key in seen:
            raise LicenseInventoryError("Nuitka compilation report has a duplicate distribution entry.")
        seen.add(key)
        distributions.append((name, version))
    if not distributions:
        raise LicenseInventoryError("Nuitka compilation report has no distribution entries.")
    return distributions


def _index_installed_licenses(
    distributions: Iterable[importlib_metadata.Distribution] | None,
) -> dict[tuple[str, str], str]:
    if distributions is None:
        distributions = importlib_metadata.distributions()
    indexed: dict[tuple[str, str], str] = {}
    for distribution in distributions:
        name = distribution.metadata.get("Name")
        version = distribution.version
        if not name or not version:
            continue
        license_value = distribution.metadata.get("License", "")
        if not license_value or license_value == "UNKNOWN":
            for classifier in distribution.metadata.get_all("Classifier", []):
                parts = [part.strip() for part in classifier.split("::")]
                if parts and parts[0] == "License":
                    license_value = parts[-1]
                    break
        key = (_normalize_name(name), version)
        existing = indexed.get(key)
        if existing is not None and existing != license_value:
            raise LicenseInventoryError("Installed distribution metadata is ambiguous.")
        indexed[key] = license_value
    return indexed


def _normalize_name(name: str) -> str:
    return re.sub(r"[-_.]+", "-", name).lower()


def _read_report(path: Path, *, description: str) -> str:
    try:
        if path.is_symlink() or not path.is_file() or path.stat().st_size > _MAX_REPORT_BYTES:
            raise LicenseInventoryError("A Nuitka report file is missing or exceeds the supported size limit.")
        return path.read_text(encoding="utf-8")
    except LicenseInventoryError:
        raise
    except UnicodeError:
        raise LicenseInventoryError(f"{description} does not match its expected text encoding.") from None
    except OSError:
        raise LicenseInventoryError(f"{description} could not be read.") from None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--license-report", required=True, type=Path)
    parser.add_argument("--compilation-report", required=True, type=Path)
    parser.add_argument("--lock-file", required=True, type=Path)
    args = parser.parse_args(argv)
    try:
        summary = summarize_nuitka_reports(
            _read_report(args.compilation_report, description="Nuitka compilation report"),
            _read_report(args.lock_file, description="Dependency lock file"),
        )
        _validate_report_file(args.license_report, description="Nuitka license report")
    except LicenseInventoryError as exc:
        print(f"Nuitka report summary failed: {exc}", file=sys.stderr)
        return 2
    print(json.dumps(summary, ensure_ascii=False, separators=(",", ":"), sort_keys=True))
    return 0 if summary["all_distributions_locked"] else 2


def _validate_report_file(path: Path, *, description: str) -> None:
    try:
        if path.is_symlink() or not path.is_file() or path.stat().st_size > _MAX_REPORT_BYTES:
            raise LicenseInventoryError("A Nuitka report file is missing or exceeds the supported size limit.")
    except LicenseInventoryError:
        raise
    except OSError:
        raise LicenseInventoryError(f"{description} could not be read.") from None


if __name__ == "__main__":
    raise SystemExit(main())
