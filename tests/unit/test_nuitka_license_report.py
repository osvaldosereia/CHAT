import json
from importlib import metadata
from pathlib import Path

import pytest

from tools.summarize_nuitka_report import LicenseInventoryError, main, summarize_nuitka_reports


COMPILATION_REPORT = '''<?xml version="1.0"?>
<compilation-report><modules/><distributions>
  <distribution name="BambuPrep" version="0.1.0" installer="uv"/>
  <distribution name="PySide6" version="6.12.0" installer="uv"/>
</distributions></compilation-report>'''

LOCK = '''[[package]]
name = "bambuprep"
version = "0.1.0"

[[package]]
name = "PySide6"
version = "6.12.0"
'''


def test_summary_uses_xml_distribution_ids_and_installed_metadata(tmp_path):
    installed = _installed_distributions(
        tmp_path,
        {
            "BambuPrep": ("0.1.0", "Proprietary - personal project"),
            "PySide6": ("6.12.0", "LGPL-3.0-only OR GPL-2.0-only OR GPL-3.0-only"),
        },
    )

    summary = summarize_nuitka_reports(
        COMPILATION_REPORT,
        LOCK,
        installed_distributions=installed,
    )

    assert summary["compilation_report_valid"] is True
    assert summary["all_distributions_locked"] is True
    assert summary["distribution_count"] == 2
    assert summary["distributions"] == [
        {
            "name": "BambuPrep",
            "version": "0.1.0",
            "license": "Proprietary - personal project",
            "lock_match": True,
        },
        {
            "name": "PySide6",
            "version": "6.12.0",
            "license": "LGPL-3.0-only OR GPL-2.0-only OR GPL-3.0-only",
            "lock_match": True,
        },
    ]


def test_summary_truncates_multiline_license_metadata_without_exposing_body(tmp_path):
    long_license = "License heading\n" + ("copyright and permission text " * 80)
    installed = _installed_distributions(
        tmp_path,
        {
            "BambuPrep": ("0.1.0", "Proprietary - personal project"),
            "PySide6": ("6.12.0", long_license),
        },
    )

    summary = summarize_nuitka_reports(
        COMPILATION_REPORT,
        LOCK,
        installed_distributions=installed,
    )
    pyside = next(item for item in summary["distributions"] if item["name"] == "PySide6")

    assert pyside["license_truncated"] is True
    assert len(pyside["license"]) <= 243
    assert long_license not in json.dumps(summary)


def test_cli_fails_on_distribution_not_in_lock_without_printing_paths_or_license_body(tmp_path, capsys):
    license_report = tmp_path / "runner-license-report.rst"
    compilation_report = tmp_path / "runner-compilation-report.xml"
    lock_file = tmp_path / "uv.lock"
    license_report.write_bytes(b"arbitrary local-encoding text")
    compilation_report.write_text(COMPILATION_REPORT, encoding="utf-8")
    lock_file.write_text(LOCK.replace('version = "6.12.0"', 'version = "6.11.0"'), encoding="utf-8")

    exit_code = main(
        [
            "--license-report",
            str(license_report),
            "--compilation-report",
            str(compilation_report),
            "--lock-file",
            str(lock_file),
        ]
    )

    captured = capsys.readouterr()
    assert exit_code == 2
    assert '"all_distributions_locked":false' in captured.out
    assert "PySide6" in captured.out
    assert str(tmp_path) not in captured.out + captured.err


@pytest.mark.parametrize(
    "compilation_report,lock",
    (("not XML", LOCK), (COMPILATION_REPORT, "not TOML")),
)
def test_summary_rejects_invalid_compilation_report_or_lock(compilation_report, lock):
    with pytest.raises(LicenseInventoryError):
        summarize_nuitka_reports(compilation_report, lock, installed_distributions=[])


def _installed_distributions(root: Path, entries: dict[str, tuple[str, str]]):
    for name, (version, license_text) in entries.items():
        directory = root / f"{name}-{version}.dist-info"
        directory.mkdir()
        lines = [
            "Metadata-Version: 2.1",
            f"Name: {name}",
            f"Version: {version}",
        ]
        license_lines = license_text.splitlines() or [""]
        lines.append(f"License: {license_lines[0]}")
        lines.extend(f" {line}" for line in license_lines[1:])
        (directory / "METADATA").write_text("\n".join(lines) + "\n\n", encoding="utf-8")
    return list(metadata.distributions(path=[str(root)]))
