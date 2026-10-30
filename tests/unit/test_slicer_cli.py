from pathlib import Path
import json
import subprocess
from types import SimpleNamespace

import pytest

import bambuprep.bambu.slicer as slicer
from bambuprep.bambu.discovery import StudioProbe
from bambuprep.bambu.profiles import ProfileCatalog
from bambuprep.bambu.slicer import (
    REQUIRED_CAPABILITIES,
    SlicerConfigurationError,
    build_slice_plan,
    slice_project,
)
from bambuprep.domain.models import PrinterSelection
from bambuprep.recommendations.schema import Recommendation
from test_profile_catalog import _install_fixture
from test_project_3mf import _write_project




@pytest.fixture(autouse=True)
def windows_runtime(monkeypatch, tmp_path):
    monkeypatch.setattr(slicer, "IS_WINDOWS", True)
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path / "local-app-data"))


def _catalog(root: Path) -> ProfileCatalog:
    install = _install_fixture(root)
    common = install / "resources/profiles/BBL/process/fdm_process_common.json"
    process = json.loads(common.read_text(encoding="utf-8"))
    process["enable_support"] = "0"
    common.write_text(json.dumps(process), encoding="utf-8")
    return ProfileCatalog.load(install)


def _recommendation(**overrides) -> Recommendation:
    values = {
        "orientation_id": "rotate_x_90",
        "support_enabled": False,
        "support_option": None,
        "adhesion_option": "brim",
        "confidence": 0.8,
        "rationale": ["synthetic test"],
        "evidence_refs": ["mesh:dimensions_mm"],
    }
    values.update(overrides)
    return Recommendation(**values)


def _probe(executable: Path, *, available=True) -> StudioProbe:
    executable.write_bytes(b"synthetic executable")
    return StudioProbe(
        executable=executable,
        version="2.8.2.61",
        cli_available=available,
        capabilities=REQUIRED_CAPABILITIES if available else frozenset(),
        message="synthetic probe",
    )


def _selection(printer_id="Bambu Lab A1 mini 0.4 nozzle", nozzle=0.4):
    return PrinterSelection(
        printer_id=printer_id,
        nozzle_mm=nozzle,
        filament_id="Generic PLA @BBL A1M" if nozzle == 0.4 else "Generic PLA @BBL A1M 0.2 nozzle",
        plate_id="Textured PEI Plate",
    )


def _plan(tmp_path: Path, *, recommendation=None):
    catalog = _catalog(tmp_path / "install")
    probe = _probe(catalog.studio_root / "BambuStudio.exe")
    return build_slice_plan(
        _selection(), recommendation or _recommendation(), catalog, probe
    )


def test_slice_plan_refuses_non_windows_runtime(tmp_path, monkeypatch):
    catalog = _catalog(tmp_path / "install")
    probe = _probe(catalog.studio_root / "BambuStudio.exe")
    monkeypatch.setattr(slicer, "IS_WINDOWS", False)
    with pytest.raises(SlicerConfigurationError, match="local Windows"):
        build_slice_plan(_selection(), _recommendation(), catalog, probe)


def test_slice_plan_requires_installed_printer_and_matching_selected_nozzle(tmp_path):
    catalog = _catalog(tmp_path / "install")
    probe = _probe(catalog.studio_root / "BambuStudio.exe")
    with pytest.raises(SlicerConfigurationError, match="nozzle"):
        build_slice_plan(_selection(nozzle=0.2), _recommendation(), catalog, probe)


def test_slice_plan_rejects_options_not_matching_installed_process_defaults(tmp_path):
    catalog = _catalog(tmp_path / "install")
    probe = _probe(catalog.studio_root / "BambuStudio.exe")
    with pytest.raises(SlicerConfigurationError, match="support"):
        build_slice_plan(
            _selection(),
            _recommendation(support_enabled=True, support_option="tree(auto)"),
            catalog,
            probe,
        )
    with pytest.raises(SlicerConfigurationError, match="adhesion"):
        build_slice_plan(_selection(), _recommendation(adhesion_option="none"), catalog, probe)


def test_slice_plan_fails_closed_when_probe_did_not_capture_required_help(tmp_path):
    catalog = _catalog(tmp_path / "install")
    probe = _probe(tmp_path / "BambuStudio.exe", available=False)
    with pytest.raises(SlicerConfigurationError, match="capabilit"):
        build_slice_plan(_selection(), _recommendation(), catalog, probe)


def test_slice_plan_requires_all_explicit_rotation_options(tmp_path):
    catalog = _catalog(tmp_path / "install")
    probe = _probe(catalog.studio_root / "BambuStudio.exe")
    probe = StudioProbe(
        executable=probe.executable,
        version=probe.version,
        cli_available=True,
        capabilities=REQUIRED_CAPABILITIES - {"rotation_z"},
        message=probe.message,
    )
    with pytest.raises(SlicerConfigurationError, match="incomplete"):
        build_slice_plan(_selection(), _recommendation(), catalog, probe)


def test_slice_plan_uses_allowlisted_profile_paths_and_separate_argv_values(tmp_path):
    plan = _plan(tmp_path)
    assert plan.profile_ids == {
        "printer": "Bambu Lab A1 mini 0.4 nozzle",
        "nozzle_mm": "0.4",
        "filament": "Generic PLA @BBL A1M",
        "plate": "Textured PEI Plate",
        "process": "0.20mm Standard @BBL A1M",
    }
    assert plan.orientation_id == "rotate_x_90"
    assert "--load-settings" in plan.cli_arguments
    settings = plan.cli_arguments[plan.cli_arguments.index("--load-settings") + 1]
    assert all(Path(value).is_file() for value in settings.split(";"))
    assert "--load-filaments" in plan.cli_arguments
    filament = plan.cli_arguments[plan.cli_arguments.index("--load-filaments") + 1]
    assert Path(filament).is_file()
    assert plan.cli_arguments[plan.cli_arguments.index("--rotate-x") + 1] == "90"
    assert "--arrange" in plan.cli_arguments
    assert "--shell" not in plan.cli_arguments


def test_slice_project_uses_argv_without_shell_and_exports_structurally_valid_3mf(tmp_path, monkeypatch):
    plan = _plan(tmp_path)
    source = tmp_path / "private model; & source.stl"
    source.write_bytes(b"synthetic source, not uploaded")
    original = source.read_bytes()
    output = tmp_path / "prepared project.3mf"
    calls = []

    def fake_run(command, **kwargs):
        calls.append((command, kwargs))
        args = command[1:]
        export_name = args[args.index("--export-3mf") + 1]
        output_dir = Path(args[args.index("--outputdir") + 1])
        _write_project(output_dir / export_name, extra={"Metadata/plate_1.json": "{}"})
        return subprocess.CompletedProcess(command, 0, "private model name", "secret-looking noise")

    monkeypatch.setattr("bambuprep.bambu.slicer.subprocess.run", fake_run)
    result = slice_project(source, plan, output, plan.studio_executable)

    assert result.exit_code == 0
    assert result.verified is True
    assert result.output_path == output
    assert output.is_file()
    assert source.read_bytes() == original
    command, kwargs = calls[0]
    assert kwargs["shell"] is False
    assert isinstance(command, list)
    assert str(source) in command
    assert command[command.index("--export-3mf") + 1] == output.name
    assert result.log_path.is_file()
    logged = result.log_path.read_text(encoding="utf-8")
    assert str(source) not in logged
    assert "private model name" not in logged
    assert "secret-looking noise" not in logged


def test_slice_project_times_out_without_publishing_partial_output(tmp_path, monkeypatch):
    plan = _plan(tmp_path)
    source = tmp_path / "input.stl"
    source.write_bytes(b"synthetic")
    output = tmp_path / "timeout.3mf"

    def fake_run(command, **kwargs):
        assert kwargs["shell"] is False
        assert kwargs["timeout"] > 0
        raise subprocess.TimeoutExpired(command, kwargs["timeout"])

    monkeypatch.setattr("bambuprep.bambu.slicer.subprocess.run", fake_run)
    result = slice_project(source, plan, output, plan.studio_executable)

    assert result.exit_code == 124
    assert result.verified is False
    assert result.output_path is None
    assert not output.exists()
    assert "timed out" in " ".join(result.diagnostics).lower()


def test_slice_project_rejects_cli_failure_and_invalid_output(tmp_path, monkeypatch):
    plan = _plan(tmp_path)
    source = tmp_path / "input.stl"
    source.write_bytes(b"synthetic")
    output = tmp_path / "failed.3mf"

    monkeypatch.setattr(
        "bambuprep.bambu.slicer.subprocess.run",
        lambda command, **kwargs: subprocess.CompletedProcess(command, 2, "", ""),
    )
    failed = slice_project(source, plan, output, plan.studio_executable)
    assert failed.exit_code == 2
    assert failed.verified is False
    assert failed.output_path is None
    assert not output.exists()

    def invalid_output(command, **kwargs):
        args = command[1:]
        staged = Path(args[args.index("--outputdir") + 1]) / args[args.index("--export-3mf") + 1]
        staged.write_bytes(b"not a 3mf")
        return subprocess.CompletedProcess(command, 0, "", "")

    monkeypatch.setattr("bambuprep.bambu.slicer.subprocess.run", invalid_output)
    invalid = slice_project(source, plan, output, plan.studio_executable)
    assert invalid.exit_code == 0
    assert invalid.verified is False
    assert invalid.output_path is None
    assert not output.exists()


def test_slice_project_refuses_existing_output_or_mismatched_studio(tmp_path, monkeypatch):
    plan = _plan(tmp_path)
    source = tmp_path / "input.stl"
    source.write_bytes(b"synthetic")
    output = tmp_path / "already.3mf"
    output.write_bytes(b"preserve")
    called = False

    def fake_run(*_args, **_kwargs):
        nonlocal called
        called = True
        return subprocess.CompletedProcess([], 0, "", "")

    monkeypatch.setattr("bambuprep.bambu.slicer.subprocess.run", fake_run)
    result = slice_project(source, plan, output, plan.studio_executable)
    assert result.verified is False
    assert output.read_bytes() == b"preserve"
    assert called is False

    wrong_executable = tmp_path / "other.exe"
    wrong_executable.write_bytes(b"other")
    with pytest.raises(SlicerConfigurationError, match="same Bambu Studio"):
        slice_project(source, plan, tmp_path / "other-output.3mf", wrong_executable)
