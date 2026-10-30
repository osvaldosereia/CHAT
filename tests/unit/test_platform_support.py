import pytest

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
