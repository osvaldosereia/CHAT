from configparser import ConfigParser
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_deployment_spec_selects_standalone_entrypoint_and_noninteractive_downloads():
    config = ConfigParser()
    assert config.read(ROOT / "pysidedeploy.spec", encoding="utf-8")

    app = config["app"]
    nuitka = config["nuitka"]
    assert app["title"] == "BambuPrep"
    assert app["input_file"] == "src/bambuprep/desktop_entry.py"
    assert app["project_file"] == "pyproject.toml"
    assert app["exec_directory"] == "dist"
    assert nuitka["mode"] == "standalone"
    assert nuitka["extra_args"] == "--assume-yes-for-downloads"


def test_windows_build_check_does_not_publish_or_use_secrets():
    workflow_path = ROOT / ".github" / "workflows" / "windows-build.yml"
    workflow = workflow_path.read_text(encoding="utf-8")

    assert "runs-on: windows-latest" in workflow
    assert "pyside6-deploy -c pysidedeploy.spec --force --mode standalone" in workflow
    assert "vcvars64.bat" in workflow
    assert "dumpbin.exe" in workflow
    assert "ilammy/msvc-dev-cmd@" not in workflow
    assert "permissions:\n  contents: read" in workflow
    assert "upload-artifact" not in workflow.lower()
    assert "${{ secrets." not in workflow
