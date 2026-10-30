import json
import subprocess
import sys
from pathlib import Path


def test_probe_script_runs_from_checkout_without_installing_package(tmp_path):
    repo_root = Path(__file__).resolve().parents[2]
    missing_executable = tmp_path / "missing.exe"

    result = subprocess.run(
        [
            sys.executable,
            "tools/bambu_cli_probe.py",
            "--executable",
            str(missing_executable),
        ],
        cwd=repo_root,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 2
    report = json.loads(result.stdout)
    assert report["cli_available"] is False
    assert report["version"] is None
    assert report["capabilities"] == []
    assert "not found" in report["message"].lower()
