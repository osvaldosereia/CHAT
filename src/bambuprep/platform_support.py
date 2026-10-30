"""Runtime detection of the Windows versions targeted by the prototype."""

from __future__ import annotations

import platform
import sys
from dataclasses import dataclass


_X64_ARCHITECTURES = frozenset({"amd64", "x86_64"})
_SUPPORTED_TARGETS = "Windows 10 22H2 x64 or Windows 11 x64"


@dataclass(frozen=True, slots=True)
class WindowsTarget:
    supported: bool
    label: str
    message: str


def assess_windows_target(
    *,
    platform_system: str,
    version: tuple[int, int, int],
    architecture: str,
) -> WindowsTarget:
    """Describe whether an OS/architecture matches the documented target."""
    system_name = platform_system.strip() or "Unknown OS"
    machine = architecture.strip() or "unknown architecture"
    major, minor, build = version
    architecture_name = (
        "x64"
        if system_name.casefold() == "windows" and machine.casefold() in _X64_ARCHITECTURES
        else machine
    )

    if system_name.casefold() == "windows" and major == 10 and minor == 0:
        if build == 19045 and machine.casefold() in _X64_ARCHITECTURES:
            return WindowsTarget(True, "Windows 10 22H2 x64", "")
        if build >= 22000 and machine.casefold() in _X64_ARCHITECTURES:
            return WindowsTarget(True, "Windows 11 x64", "")
        os_label = "Windows 11" if build >= 22000 else "Windows 10"
        label = f"{os_label} build {build} {architecture_name}"
    elif system_name.casefold() == "windows":
        label = f"Windows {major}.{minor} build {build} {architecture_name}"
    else:
        label = f"{system_name} {major}.{minor}.{build} {architecture_name}"

    message = (
        f"Detected environment: {label}. The validated target is {_SUPPORTED_TARGETS}. "
        "This environment has not been validated."
    )
    return WindowsTarget(False, label, message)


def detect_windows_target() -> WindowsTarget:
    """Read the current OS version and machine architecture without side effects."""
    if sys.platform == "win32":
        version = sys.getwindowsversion()
        version_tuple = (version.major, version.minor, version.build)
    else:
        version_tuple = (0, 0, 0)
    return assess_windows_target(
        platform_system=platform.system(),
        version=version_tuple,
        architecture=platform.machine(),
    )
