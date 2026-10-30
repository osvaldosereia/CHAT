from pathlib import Path
import tomllib


ROOT = Path(__file__).resolve().parents[2]


def test_pyproject_declares_standalone_windows_entrypoint():
    project = tomllib.loads((ROOT / "pyproject.toml").read_text(encoding="utf-8"))

    deploy = project["tool"]["pyside6"]["deploy"]
    assert deploy["title"] == "BambuPrep"
    assert deploy["input_file"] == "src/bambuprep/__main__.py"
    assert deploy["exec_directory"] == "dist"
    assert deploy["mode"] == "standalone"


def test_windows_build_check_does_not_publish_or_use_secrets():
    workflow_path = ROOT / ".github" / "workflows" / "windows-build.yml"
    workflow = workflow_path.read_text(encoding="utf-8")

    assert "runs-on: windows-latest" in workflow
    assert "pyside6-deploy" in workflow
    assert "vcvars64.bat" in workflow
    assert "dumpbin.exe" in workflow
    assert "ilammy/msvc-dev-cmd@" not in workflow
    assert "permissions:\n  contents: read" in workflow
    assert "upload-artifact" not in workflow.lower()
    assert "${{ secrets." not in workflow
