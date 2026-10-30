from types import SimpleNamespace

import pytest

from bambuprep import platform_support
from bambuprep.platform_support import assess_windows_target


@pytest.mark.parametrize(
    ("version", "architecture", "expected_label"),
    [
        ((10, 0, 19045), "AMD64", "Windows 10 22H2 x64"),
        ((10, 0, 26100), "AMD64", "Windows 11 x64"),
        ((10, 0, 22631), "x86_64", "Windows 11 x64"),
    ],
)
def test_supported_windows_targets_are_recognized(version, architecture, expected_label):
    result = assess_windows_target(
        platform_system="Windows",
        version=version,
        architecture=architecture,
    )

    assert result.supported is True
    assert result.label == expected_label
    assert result.message == ""


@pytest.mark.parametrize(
    ("platform_system", "version", "architecture", "expected_label"),
    [
        ("Windows", (10, 0, 19044), "AMD64", "Windows 10 build 19044 x64"),
        ("Windows", (10, 0, 26100), "ARM64", "Windows 11 build 26100 ARM64"),
        ("Linux", (6, 8, 0), "x86_64", "Linux 6.8.0 x86_64"),
    ],
)
def test_unsupported_platforms_are_reported_without_blocking_decision(
    platform_system,
    version,
    architecture,
    expected_label,
):
    result = assess_windows_target(
        platform_system=platform_system,
        version=version,
        architecture=architecture,
    )

    assert result.supported is False
    assert result.label == expected_label
    assert "Windows 10 22H2 x64" in result.message
    assert "Windows 11 x64" in result.message


def test_windows_server_build_26100_is_not_misidentified_as_windows_11():
    result = assess_windows_target(
        platform_system="Windows",
        version=(10, 0, 26100),
        architecture="AMD64",
        product_type=3,
    )

    assert result.supported is False
    assert result.label == "Windows Server build 26100 x64"
    assert "not been validated" in result.message


def test_runtime_detection_passes_windows_product_type(monkeypatch):
    class WindowsVersion:
        major = 10
        minor = 0
        build = 26100
        product_type = 3

    monkeypatch.setattr(
        platform_support,
        "sys",
        SimpleNamespace(platform="win32", getwindowsversion=lambda: WindowsVersion()),
    )
    monkeypatch.setattr(platform_support.platform, "system", lambda: "Windows")
    monkeypatch.setattr(platform_support.platform, "machine", lambda: "AMD64")

    result = platform_support.detect_windows_target()

    assert result.supported is False
    assert result.label.startswith("Windows Server")
