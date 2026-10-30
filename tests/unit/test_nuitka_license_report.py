import json
from pathlib import Path

import pytest

from tools.summarize_nuitka_report import LicenseInventoryError, main, summarize_nuitka_reports


LICENSE_REPORT = '''License Report
--------------

This software was compiled with Nuitka and contains parts of the following software

BambuPrep
=========

Version 0.1.0 of BambuPrep was included and is
under license "Proprietary - personal project".

The contained package is "bambuprep".

PySide6
=======

Version 6.12.0 of PySide6 was included and is
under license "LGPL-3.0-only OR GPL-2.0-only OR GPL-3.0-only".

.. code::

    synthetic full license text that must not be printed
'''

COMPILATION_REPORT = '''<?xml version="1.0"?>
<compilation-report><module name="bambuprep"/><distribution name="PySide6"/></compilation-report>'''

LOCK = '''[[package]]
name = "bambuprep"
version = "0.1.0"

[[package]]
name = "PySide6"
version = "6.12.0"
'''


def test_summary_maps_nuitka_compiled_distributions_to_locked_versions_without_license_bodies():
    summary = summarize_nuitka_reports(LICENSE_REPORT, COMPILATION_REPORT, LOCK)

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
    assert "synthetic full license text" not in json.dumps(summary)


def test_summary_truncates_long_license_metadata_before_printing_it():
    long_license = "permission grant and full license body " * 100
    report = LICENSE_REPORT.replace(
        "LGPL-3.0-only OR GPL-2.0-only OR GPL-3.0-only", long_license
    )

    summary = summarize_nuitka_reports(report, COMPILATION_REPORT, LOCK)
    pyside = next(item for item in summary["distributions"] if item["name"] == "PySide6")

    assert pyside["license_truncated"] is True
    assert len(pyside["license"]) <= 243
    assert long_license not in json.dumps(summary)


def test_cli_fails_on_distribution_not_in_lock_without_printing_paths_or_license_body(tmp_path, capsys):
    license_report = tmp_path / "private-runner-license-report.rst"
    compilation_report = tmp_path / "private-runner-compilation-report.xml"
    lock_file = tmp_path / "uv.lock"
    license_report.write_text(LICENSE_REPORT, encoding="utf-8")
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
    assert "synthetic full license text" not in captured.out + captured.err


@pytest.mark.parametrize(
    "license_report,compilation_report,lock",
    (
        ("not a Nuitka report", COMPILATION_REPORT, LOCK),
        (LICENSE_REPORT, "not XML", LOCK),
        (LICENSE_REPORT, COMPILATION_REPORT, "not TOML"),
    ),
)
def test_summary_rejects_reports_or_lock_with_invalid_format(license_report, compilation_report, lock):
    with pytest.raises(LicenseInventoryError):
        summarize_nuitka_reports(license_report, compilation_report, lock)
