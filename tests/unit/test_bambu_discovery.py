from pathlib import Path
from subprocess import CompletedProcess, TimeoutExpired

import pytest

from bambuprep.bambu.discovery import probe_studio


def test_missing_executable_is_reported_without_running_process(tmp_path, monkeypatch):
    def unexpected_run(*args, **kwargs):
        raise AssertionError("subprocess must not run for a missing executable")

    monkeypatch.setattr("bambuprep.bambu.discovery.subprocess.run", unexpected_run)

    result = probe_studio(tmp_path / "missing.exe")

    assert result.executable == tmp_path / "missing.exe"
    assert result.version is None
    assert result.cli_available is False
    assert not result.capabilities
    assert "not found" in result.message.lower()


def test_detects_version_and_capabilities_from_installed_help(tmp_path, monkeypatch):
    executable = tmp_path / "BambuStudio.exe"
    executable.write_bytes(b"stub")
    calls = []

    def fake_run(command, **kwargs):
        calls.append(command)
        if command[-1] == "--version":
            return CompletedProcess(command, 0, "Bambu Studio 2.3.1", "")
        return CompletedProcess(
            command,
            0,
            "Options: --load-settings --load-filaments --orient --arrange --slice --export-3mf",
            "",
        )

    monkeypatch.setattr("bambuprep.bambu.discovery.subprocess.run", fake_run)

    result = probe_studio(executable)

    assert result.version == "Bambu Studio 2.3.1"
    assert result.cli_available is True
    assert {
        "machine_profiles",
        "filament_profiles",
        "orientation",
        "arrangement",
        "slicing",
        "export_3mf",
    } <= result.capabilities
    assert [call[-1] for call in calls] == ["--version", "--help"]
    assert all(call[0] == str(executable) for call in calls)
    assert all(call[1] == "--version" or call[1] == "--help" for call in calls)


def test_empty_cli_response_is_not_reported_as_available(tmp_path, monkeypatch):
    executable = tmp_path / "BambuStudio.exe"
    executable.write_bytes(b"stub")

    def fake_run(command, **kwargs):
        return CompletedProcess(command, 0, "", "")

    monkeypatch.setattr("bambuprep.bambu.discovery.subprocess.run", fake_run)

    result = probe_studio(executable)

    assert result.cli_available is False
    assert "no response" in result.message.lower()
    assert "captured stdout/stderr" in result.message.lower()
    assert "console" in result.message.lower()
    assert "exit code 0" in result.message.lower()


@pytest.mark.parametrize("timeout_command", ["--version", "--help"])
def test_timeout_is_reported_as_unavailable(tmp_path, monkeypatch, timeout_command):
    executable = tmp_path / "BambuStudio.exe"
    executable.write_bytes(b"stub")

    def fake_run(command, **kwargs):
        if command[-1] == timeout_command:
            raise TimeoutExpired(command, kwargs["timeout"])
        return CompletedProcess(command, 0, "Bambu Studio 2.3.1", "")

    monkeypatch.setattr("bambuprep.bambu.discovery.subprocess.run", fake_run)

    result = probe_studio(executable, timeout_seconds=3)

    assert result.cli_available is False
    assert "timed out" in result.message.lower()


def test_help_without_slicing_capabilities_reports_only_observed_options(tmp_path, monkeypatch):
    executable = tmp_path / "BambuStudio.exe"
    executable.write_bytes(b"stub")

    def fake_run(command, **kwargs):
        if command[-1] == "--version":
            return CompletedProcess(command, 0, "Bambu Studio 2.3.1", "")
        return CompletedProcess(command, 0, "A graphical 3D model viewer", "")

    monkeypatch.setattr("bambuprep.bambu.discovery.subprocess.run", fake_run)

    result = probe_studio(executable)

    assert result.cli_available is True
    assert result.capabilities == frozenset()
    assert "required" in result.message.lower()


def test_invalid_timeout_is_rejected_before_subprocess(tmp_path, monkeypatch):
    executable = tmp_path / "BambuStudio.exe"
    executable.write_bytes(b"stub")

    def unexpected_run(*args, **kwargs):
        raise AssertionError("invalid timeout must be rejected before running")

    monkeypatch.setattr("bambuprep.bambu.discovery.subprocess.run", unexpected_run)

    with pytest.raises(ValueError, match="timeout_seconds"):
        probe_studio(executable, timeout_seconds=0)


def test_detects_profile_options_when_installed_help_uses_underscores(tmp_path, monkeypatch):
    executable = tmp_path / "BambuStudio.exe"
    executable.write_bytes(b"stub")

    def fake_run(command, **kwargs):
        if command[-1] == "--version":
            return CompletedProcess(command, 0, "Bambu Studio 2.8.2.61", "")
        return CompletedProcess(
            command,
            0,
            "Settings loaded with --load_settings and --load_filaments; "
            "--orient --arrange --slice --export-3mf filename.3mf",
            "",
        )

    monkeypatch.setattr("bambuprep.bambu.discovery.subprocess.run", fake_run)

    result = probe_studio(executable)

    assert result.cli_available is True
    assert {
        "machine_profiles",
        "filament_profiles",
        "orientation",
        "arrangement",
        "slicing",
        "export_3mf",
    } <= result.capabilities


def test_windows_probe_passes_create_no_window_to_version_and_help(tmp_path, monkeypatch):
    executable = tmp_path / "BambuStudio.exe"
    executable.write_bytes(b"stub")
    no_console = 0x08000000
    monkeypatch.setattr(
        "bambuprep.bambu.discovery.subprocess.CREATE_NO_WINDOW",
        no_console,
        raising=False,
    )
    calls = []

    def fake_run(command, **kwargs):
        calls.append((command, kwargs))
        if command[-1] == "--version":
            return CompletedProcess(command, 0, "Bambu Studio 2.8.2.61", "")
        return CompletedProcess(
            command,
            0,
            "--load_settings --load_filaments --orient --arrange --slice --export-3mf",
            "",
        )

    monkeypatch.setattr("bambuprep.bambu.discovery.subprocess.run", fake_run)

    result = probe_studio(executable)

    assert result.cli_available is True
    assert [call[1]["creationflags"] for call in calls] == [no_console, no_console]
