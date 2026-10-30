"""Read-only discovery for a locally installed Bambu Studio executable."""

from __future__ import annotations

import re
import subprocess
from dataclasses import dataclass
from pathlib import Path


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
            timeout=timeout_seconds,
        )
        version_text = _combined_output(version_result)
        version = _first_line(version_text) if version_result.returncode == 0 else None

        help_result = subprocess.run(
            [str(executable), "--help"],
            capture_output=True,
            text=True,
            check=False,
            shell=False,
            timeout=timeout_seconds,
        )
    except subprocess.TimeoutExpired:
        return StudioProbe(
            executable=executable,
            version=locals().get("version"),
            cli_available=False,
            capabilities=frozenset(),
            message=f"Bambu Studio CLI timed out after {timeout_seconds} seconds.",
        )
    except OSError as exc:
        return StudioProbe(
            executable=executable,
            version=None,
            cli_available=False,
            capabilities=frozenset(),
            message=f"Could not run Bambu Studio executable ({type(exc).__name__}).",
        )

    help_text = _combined_output(help_result)
    if not help_text:
        message = "Bambu Studio CLI returned no response in captured stdout/stderr to --help; it may have written help directly to the console."
    elif help_result.returncode != 0:
        message = "Bambu Studio CLI returned a non-zero exit code for --help."
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
        message = "Help responded, but required capabilities were not detected: " + ", ".join(missing)
    else:
        message = "Help responded and the expected CLI options were detected; Windows integration is unverified."

    return StudioProbe(
        executable=executable,
        version=version,
        cli_available=True,
        capabilities=capabilities,
        message=message,
    )
