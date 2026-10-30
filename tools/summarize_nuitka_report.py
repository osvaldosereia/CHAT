"""Print a compact, lock-checked summary of Nuitka's build-time reports."""

from __future__ import annotations

import argparse
import json
import re
import sys
import tomllib
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any


_MAX_REPORT_BYTES = 32 * 1024 * 1024
_MAX_LICENSE_SUMMARY_CHARS = 240
_LICENSE_SECTION = re.compile(
    r"(?m)^Version (?P<version>[^\r\n]+) of (?P<name>[^\r\n]+) was included and is\r?\n"
    r'under license "(?P<license>[^\r\n]*)"\.$'
)


class LicenseInventoryError(ValueError):
    """A build report is invalid or does not match the committed lock file."""


def summarize_nuitka_reports(
    license_report_text: str,
    compilation_report_text: str,
    lock_text: str,
) -> dict[str, Any]:
    """Summarize compiled distributions without exposing full license text or paths."""
    distributions = _parse_license_report(license_report_text)
    if len(compilation_report_text.encode("utf-8")) > _MAX_REPORT_BYTES:
        raise LicenseInventoryError("Nuitka compilation report exceeds the supported size limit.")
    try:
        ET.fromstring(compilation_report_text)
    except ET.ParseError:
        raise LicenseInventoryError("Nuitka compilation report is not valid XML.") from None

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

    summarized = []
    for distribution in distributions:
        matches = distribution["version"] in locked_versions.get(_normalize_name(distribution["name"]), set())
        summarized.append({**distribution, "lock_match": matches})
    summarized.sort(key=lambda entry: (_normalize_name(entry["name"]), entry["version"]))
    return {
        "compilation_report_valid": True,
        "distribution_count": len(summarized),
        "all_distributions_locked": all(item["lock_match"] for item in summarized),
        "distributions": summarized,
    }


def _parse_license_report(report_text: str) -> list[dict[str, str]]:
    if len(report_text.encode("utf-8")) > _MAX_REPORT_BYTES:
        raise LicenseInventoryError("Nuitka license report exceeds the supported size limit.")
    expected_sections = len(re.findall(r"(?m)^Version [^\r\n]+ was included and is\r?$", report_text))
    matches = list(_LICENSE_SECTION.finditer(report_text))
    if expected_sections == 0 or expected_sections != len(matches):
        raise LicenseInventoryError("Nuitka license report has an unsupported or incomplete format.")

    seen: set[tuple[str, str]] = set()
    distributions = []
    for match in matches:
        name = match.group("name").strip()
        version = match.group("version").strip()
        if not name or not version:
            raise LicenseInventoryError("Nuitka license report contains an incomplete distribution entry.")
        key = (_normalize_name(name), version)
        if key in seen:
            raise LicenseInventoryError("Nuitka license report contains a duplicate distribution entry.")
        seen.add(key)
        license_value = " ".join(match.group("license").split())
        entry = {
            "name": name,
            "version": version,
            "license": license_value[:_MAX_LICENSE_SUMMARY_CHARS],
        }
        if len(license_value) > _MAX_LICENSE_SUMMARY_CHARS:
            entry["license_truncated"] = True
            entry["license"] += "…"
        distributions.append(entry)
    return distributions


def _normalize_name(name: str) -> str:
    return re.sub(r"[-_.]+", "-", name).lower()


def _read_report(path: Path) -> str:
    try:
        if path.is_symlink() or not path.is_file() or path.stat().st_size > _MAX_REPORT_BYTES:
            raise LicenseInventoryError("A Nuitka report file is missing or exceeds the supported size limit.")
        return path.read_text(encoding="utf-8")
    except LicenseInventoryError:
        raise
    except (OSError, UnicodeError):
        raise LicenseInventoryError("A Nuitka report file could not be read.") from None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--license-report", required=True, type=Path)
    parser.add_argument("--compilation-report", required=True, type=Path)
    parser.add_argument("--lock-file", required=True, type=Path)
    args = parser.parse_args(argv)
    try:
        summary = summarize_nuitka_reports(
            _read_report(args.license_report),
            _read_report(args.compilation_report),
            _read_report(args.lock_file),
        )
    except LicenseInventoryError as exc:
        print(f"Nuitka report summary failed: {exc}", file=sys.stderr)
        return 2
    print(json.dumps(summary, ensure_ascii=False, separators=(",", ":"), sort_keys=True))
    return 0 if summary["all_distributions_locked"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
