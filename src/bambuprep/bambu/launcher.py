"""Safe local launcher for opening an original STL in Bambu Studio."""

from __future__ import annotations

import subprocess
from pathlib import Path


def open_stl_in_studio(executable: Path, stl_path: Path) -> subprocess.Popen[bytes]:
    """Start the configured local Studio with one existing STL path as an argv item.

    This helper only opens the source file in the desktop application. It does not
    run slicing options, export projects, alter the STL, or trigger a print.
    """
    executable = Path(executable)
    stl_path = Path(stl_path)
    if not executable.is_absolute():
        raise ValueError("Bambu Studio executable path must be absolute")
    if not stl_path.is_absolute():
        raise ValueError("STL path must be absolute")
    if stl_path.suffix.lower() != ".stl":
        raise ValueError("The local input must be an STL file")
    if not executable.is_file():
        raise FileNotFoundError("The configured Bambu Studio executable is unavailable")
    if not stl_path.is_file():
        raise FileNotFoundError("The selected local STL file is unavailable")

    return subprocess.Popen(
        [str(executable), str(stl_path)],
        cwd=str(executable.parent),
        shell=False,
    )
