import ctypes
from pathlib import Path
from subprocess import CompletedProcess, TimeoutExpired
from types import SimpleNamespace

import pytest

from bambuprep.bambu import discovery
from bambuprep.bambu.discovery import _format_fixed_file_version, probe_studio


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



def test_windows_file_metadata_fills_missing_version_without_claiming_cli(tmp_path, monkeypatch):
    executable = tmp_path / "BambuStudio.exe"
    executable.write_bytes(b"stub")
    calls = []

    def fake_run(command, **kwargs):
        calls.append(command[-1])
        return CompletedProcess(command, 0, "", "")

    monkeypatch.setattr("bambuprep.bambu.discovery.subprocess.run", fake_run)
    monkeypatch.setattr(
        "bambuprep.bambu.discovery._windows_file_version",
        lambda path: "2.8.2.61",
        raising=False,
    )

    result = probe_studio(executable)

    assert result.version == "2.8.2.61"
    assert result.cli_available is False
    assert result.capabilities == frozenset()
    assert "captured stdout/stderr" in result.message.lower()
    assert calls == ["--version", "--help"]



def test_fixed_file_version_fields_are_formatted_as_four_components():
    assert _format_fixed_file_version(0x00020008, 0x0002003D) == "2.8.2.61"
    assert _format_fixed_file_version(0, 0) is None



def test_windows_version_resource_reads_fixed_product_version(tmp_path, monkeypatch):
    executable = tmp_path / "BambuStudio.exe"
    executable.write_bytes(b"stub")
    fixed_info = discovery._VSFixedFileInfo()
    fixed_info.dwSignature = 0xFEEF04BD
    fixed_info.dwProductVersionMS = 0x00020008
    fixed_info.dwProductVersionLS = 0x0002003D
    subblocks = []

    class FakeFunction:
        def __init__(self, callback):
            self.callback = callback

        def __call__(self, *args):
            return self.callback(*args)

    def get_size(_path, ignored_handle):
        ignored_handle._obj.value = 0
        return ctypes.sizeof(fixed_info)

    def get_info(_path, _reserved, _size, _data):
        return 1

    def query_value(_data, subblock, value_out, size_out):
        subblocks.append(subblock)
        value_out._obj.value = ctypes.addressof(fixed_info)
        size_out._obj.value = ctypes.sizeof(fixed_info)
        return 1

    version_api = SimpleNamespace(
        GetFileVersionInfoSizeW=FakeFunction(get_size),
        GetFileVersionInfoW=FakeFunction(get_info),
        VerQueryValueW=FakeFunction(query_value),
    )
    monkeypatch.setattr(discovery.sys, "platform", "win32")
    dll_requests = []

    def fake_windll(name, **kwargs):
        dll_requests.append((name, kwargs))
        return version_api

    monkeypatch.setattr(discovery.ctypes, "WinDLL", fake_windll, raising=False)

    assert discovery._windows_file_version(executable) == "2.8.2.61"
    assert subblocks == ["\\"]
    assert dll_requests == [
        ("version.dll", {"use_last_error": True, "winmode": 0x00000800})
    ]


def test_windows_metadata_reader_is_noop_off_windows(tmp_path, monkeypatch):
    monkeypatch.setattr(discovery.sys, "platform", "linux")
    assert discovery._windows_file_version(tmp_path / "BambuStudio.exe") is None



def test_windows_version_resource_falls_back_to_product_version_string(tmp_path, monkeypatch):
    executable = tmp_path / "BambuStudio.exe"
    executable.write_bytes(b"stub")
    translation = (ctypes.c_ushort * 2)(0x0409, 0x04B0)
    product_version = ctypes.create_unicode_buffer("02.08.02.61")
    queried = []

    class FakeFunction:
        def __init__(self, callback):
            self.callback = callback

        def __call__(self, *args):
            return self.callback(*args)

    def get_size(_path, ignored_handle):
        ignored_handle._obj.value = 0
        return 256

    def get_info(_path, _reserved, _size, _data):
        return 1

    def query_value(_data, subblock, value_out, size_out):
        queried.append(subblock)
        if subblock == r"\VarFileInfo\Translation":
            value_out._obj.value = ctypes.addressof(translation)
            size_out._obj.value = ctypes.sizeof(translation)
            return 1
        if subblock == r"\StringFileInfo\040904B0\ProductVersion":
            value_out._obj.value = ctypes.addressof(product_version)
            size_out._obj.value = len("02.08.02.61") + 1
            return 1
        return 0

    version_api = SimpleNamespace(
        GetFileVersionInfoSizeW=FakeFunction(get_size),
        GetFileVersionInfoW=FakeFunction(get_info),
        VerQueryValueW=FakeFunction(query_value),
    )
    monkeypatch.setattr(discovery.sys, "platform", "win32")
    monkeypatch.setattr(discovery.ctypes, "WinDLL", lambda *_args, **_kwargs: version_api, raising=False)

    assert discovery._windows_file_version(executable) == "02.08.02.61"
    assert queried == [
        r"\VarFileInfo\Translation",
        r"\StringFileInfo\040904B0\ProductVersion",
    ]
