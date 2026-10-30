from __future__ import annotations

import json
from pathlib import Path

from bambuprep.bambu.discovery import StudioProbe
from bambuprep.bambu.profiles import (
    ProfileCatalog,
    ProfileCatalogError,
    PrinterProfile,
)
from tools import bambu_cli_probe


def _catalog() -> ProfileCatalog:
    return ProfileCatalog(
        model_id="Bambu Lab A1 mini",
        profile_version="test-profile-version",
        printers=(
            PrinterProfile(
                printer_id="Bambu Lab A1 mini 0.2 nozzle",
                nozzle_mm=0.2,
                generic_pla_profile_id="Generic PLA @BBL A1M 0.2 nozzle",
                default_process_profile_id="0.10mm Standard @BBL A1M 0.2 nozzle",
                plate_id="Textured PEI Plate",
                compatible_process_profile_ids=("0.10mm Standard @BBL A1M 0.2 nozzle",),
                support_options=("tree(auto)",),
                adhesion_options=("brim", "none"),
            ),
            PrinterProfile(
                printer_id="Bambu Lab A1 mini 0.4 nozzle",
                nozzle_mm=0.4,
                generic_pla_profile_id="Generic PLA @BBL A1M",
                default_process_profile_id="0.20mm Standard @BBL A1M",
                plate_id="Textured PEI Plate",
                compatible_process_profile_ids=("0.20mm Standard @BBL A1M",),
                support_options=("tree(auto)",),
                adhesion_options=("brim", "none"),
            ),
        ),
    )


def test_profile_summary_reports_only_allowlisted_system_profile_ids(tmp_path, monkeypatch):
    catalog = _catalog()
    monkeypatch.setattr(ProfileCatalog, "load", lambda *_args: catalog)

    summary = bambu_cli_probe.profile_catalog_summary(tmp_path)

    assert summary["available"] is True
    assert summary["model_id"] == "Bambu Lab A1 mini"
    assert summary["profile_version"] == "test-profile-version"
    assert [profile["nozzle_mm"] for profile in summary["printers"]] == [0.2, 0.4]
    assert {profile["plate_id"] for profile in summary["printers"]} == {"Textured PEI Plate"}
    assert all(profile["generic_pla_profile_id"].startswith("Generic PLA") for profile in summary["printers"])
    assert str(tmp_path) not in json.dumps(summary)


def test_profile_summary_fails_closed_without_install_profile_data(tmp_path, monkeypatch):
    def missing_profiles(*_args):
        raise ProfileCatalogError("profile details are intentionally not echoed")

    monkeypatch.setattr(ProfileCatalog, "load", missing_profiles)

    summary = bambu_cli_probe.profile_catalog_summary(tmp_path)

    assert summary == {
        "available": False,
        "error_code": "profile_catalog_invalid",
        "message": "The installed A1 mini system profile set could not be validated.",
        "printers": [],
    }
    assert str(tmp_path) not in json.dumps(summary)


def test_cli_json_contains_profile_summary_even_when_help_is_uncaptured(tmp_path, monkeypatch, capsys):
    executable = tmp_path / "Bambu Studio" / "bambu-studio.exe"
    probe = StudioProbe(
        executable=executable,
        version=None,
        cli_available=False,
        capabilities=frozenset(),
        message="Help was not captured (exit code 0).",
    )
    monkeypatch.setattr(bambu_cli_probe, "probe_studio", lambda *_args, **_kwargs: probe)
    monkeypatch.setattr(ProfileCatalog, "load", lambda *_args: _catalog())

    exit_code = bambu_cli_probe.main(["--executable", str(executable)])

    assert exit_code == 2
    payload = json.loads(capsys.readouterr().out)
    assert payload["cli_available"] is False
    assert payload["profile_catalog"]["available"] is True
    assert payload["profile_catalog"]["printers"][1]["plate_id"] == "Textured PEI Plate"
    assert str(tmp_path) not in json.dumps(payload["profile_catalog"])

