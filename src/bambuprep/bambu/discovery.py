"""Read-only discovery for a locally installed Bambu Studio executable."""

from __future__ import annotations

import ctypes
import re
import subprocess
import sys
from ctypes import wintypes
from dataclasses import dataclass
from pathlib import Path


class _VSFixedFileInfo(ctypes.Structure):
    _fields_ = [
        ("dwSignature", wintypes.DWORD),
        ("dwStrucVersion", wintypes.DWORD),
        ("dwFileVersionMS", wintypes.DWORD),
        ("dwFileVersionLS", wintypes.DWORD),
        ("dwProductVersionMS", wintypes.DWORD),
        ("dwProductVersionLS", wintypes.DWORD),
        ("dwFileFlagsMask", wintypes.DWORD),
        ("dwFileFlags", wintypes.DWORD),
        ("dwFileOS", wintypes.DWORD),
        ("dwFileType", wintypes.DWORD),
        ("dwFileSubtype", wintypes.DWORD),
        ("dwFileDateMS", wintypes.DWORD),
        ("dwFileDateLS", wintypes.DWORD),
    ]


def _format_fixed_file_version(version_ms: int, version_ls: int) -> str | None:
    """Format the four DWORD version components from VS_FIXEDFILEINFO."""
    if not version_ms and not version_ls:
        return None
    return ".".join(
        str(component)
        for component in (
            version_ms >> 16,
            version_ms & 0xFFFF,
            version_ls >> 16,
            version_ls & 0xFFFF,
        )
    )


def _windows_file_version(executable: Path) -> str | None:
    """Read the executable's ProductVersion from Windows version resources."""
    if sys.platform != "win32":
        return None
    try:
        version_dll = ctypes.WinDLL("version.dll", use_last_error=True, winmode=0x00000800)
        get_size = version_dll.GetFileVersionInfoSizeW
        get_info = version_dll.GetFileVersionInfoW
        query_value = version_dll.VerQueryValueW

        get_size.argtypes = [wintypes.LPCWSTR, ctypes.POINTER(wintypes.DWORD)]
        get_size.restype = wintypes.DWORD
        get_info.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD, ctypes.c_void_p]
        get_info.restype = wintypes.BOOL
        query_value.argtypes = [
            ctypes.c_void_p,
            wintypes.LPCWSTR,
            ctypes.POINTER(ctypes.c_void_p),
            ctypes.POINTER(wintypes.UINT),
        ]
        query_value.restype = wintypes.BOOL

        ignored_handle = wintypes.DWORD()
        size = get_size(str(executable), ctypes.byref(ignored_handle))
        if not size:
            return None
        data = ctypes.create_string_buffer(size)
        if not get_info(str(executable), 0, size, data):
            return None

        value = ctypes.c_void_p()
        value_size = wintypes.UINT()
        if not query_value(data, "\\", ctypes.byref(value), ctypes.byref(value_size)):
            return None
        if not value.value or value_size.value < ctypes.sizeof(_VSFixedFileInfo):
            return None

        fixed_info = ctypes.cast(value, ctypes.POINTER(_VSFixedFileInfo)).contents
        if fixed_info.dwSignature != 0xFEEF04BD:
            return None
        if fixed_info.dwProductVersionMS or fixed_info.dwProductVersionLS:
            return _format_fixed_file_version(
                fixed_info.dwProductVersionMS,
                fixed_info.dwProductVersionLS,
            )
        return _format_fixed_file_version(fixed_info.dwFileVersionMS, fixed_info.dwFileVersionLS)
    except (AttributeError, OSError, TypeError, ValueError):
        return None


@dataclass(frozen=True, slots=True)
class StudioProbe:
    executable: Path
    version: str | None
    cli_available: bool
    capabilities: frozenset[str]
    message: str


_REQUIRED_CAPABILITIES = frozenset(
    {
        "machine_profiles",
        "filament_profiles",
        "orientation",
        "arrangement",
        "slicing",
        "export_3mf",
    }
)
_CAPABILITY_PATTERNS = {
    "machine_profiles": (r"--load[-_]settings\b", r"--load[-_]machine\b"),
    "filament_profiles": (r"--load[-_]filaments?\b",),
    "orientation": (r"--orient\b",),
    "arrangement": (r"--arrange\b",),
    "slicing": (r"--slice\b",),
    "export_3mf": (r"--export-3mf\b", r"--export\s+3mf\b"),
}


def _combined_output(result: subprocess.CompletedProcess[str]) -> str:
    return "\n".join(part for part in (result.stdout, result.stderr) if part).strip()


def _first_line(value: str) -> str | None:
    return next((line.strip() for line in value.splitlines() if line.strip()), None)


def _detect_capabilities(help_text: str) -> frozenset[str]:
    return frozenset(
        name
        for name, patterns in _CAPABILITY_PATTERNS.items()
        if any(re.search(pattern, help_text, flags=re.IGNORECASE) for pattern in patterns)
    )


def probe_studio(executable: Path, timeout_seconds: int = 20) -> StudioProbe:
    """Probe version and CLI help without shell expansion or modifying local files.

    Each invocation has its own timeout. Capabilities describe options observed in
    the installed executable's help output; they do not establish slicing support.
    A real Windows proof is still required before enabling any slicing workflow.
    """
    executable = Path(executable)
    if timeout_seconds <= 0:
        raise ValueError("timeout_seconds must be greater than zero")

    if not executable.is_file():
        return StudioProbe(
            executable=executable,
            version=None,
            cli_available=False,
            capabilities=frozenset(),
            message=f"Bambu Studio executable not found: {executable}",
        )

    try:
        version_result = subprocess.run(
            [str(executable), "--version"],
            capture_output=True,
            text=True,
            check=False,
            shell=False,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            timeout=timeout_seconds,
        )
        version_text = _combined_output(version_result)
        version = _first_line(version_text) if version_result.returncode == 0 else None
        version_from_metadata = False
        if version is None:
            version = _windows_file_version(executable)
            version_from_metadata = version is not None

        help_result = subprocess.run(
            [str(executable), "--help"],
            capture_output=True,
            text=True,
            check=False,
            shell=False,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            timeout=timeout_seconds,
        )
    except subprocess.TimeoutExpired:
        version = locals().get("version")
        version_from_metadata = locals().get("version_from_metadata", False)
        if version is None:
            version = _windows_file_version(executable)
            version_from_metadata = version is not None
        return StudioProbe(
            executable=executable,
            version=version,
            cli_available=False,
            capabilities=frozenset(),
            message=f"Bambu Studio CLI timed out after {timeout_seconds} seconds.",
        )
    except OSError as exc:
        version = locals().get("version")
        version_from_metadata = locals().get("version_from_metadata", False)
        if version is None:
            version = _windows_file_version(executable)
            version_from_metadata = version is not None
        return StudioProbe(
            executable=executable,
            version=version,
            cli_available=False,
            capabilities=frozenset(),
            message=f"Could not run Bambu Studio executable ({type(exc).__name__}).",
        )

    version_note = " The version came from Windows executable metadata." if version_from_metadata else ""
    help_text = _combined_output(help_result)
    if not help_text:
        message = (
            f"Bambu Studio CLI returned no response in captured stdout/stderr to --help "
            f"(exit code {help_result.returncode}); it may have written help directly to the console."
            f"{version_note}"
        )
    elif help_result.returncode != 0:
        message = "Bambu Studio CLI returned a non-zero exit code for --help." + version_note
    else:
        message = ""
    if message:
        return StudioProbe(
            executable=executable,
            version=version,
            cli_available=False,
            capabilities=frozenset(),
            message=message,
        )

    capabilities = _detect_capabilities(help_text)
    missing = sorted(_REQUIRED_CAPABILITIES - capabilities)
    if missing:
        message = "Help responded, but required capabilities were not detected: " + ", ".join(missing) + version_note
    else:
        message = "Help responded and the expected CLI options were detected; Windows integration is unverified." + version_note

    return StudioProbe(
        executable=executable,
        version=version,
        cli_available=True,
        capabilities=capabilities,
        message=message,
    )
