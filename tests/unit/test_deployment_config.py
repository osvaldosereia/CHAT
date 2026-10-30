from configparser import ConfigParser
from pathlib import Path
import tomllib


ROOT = Path(__file__).resolve().parents[2]


def test_deployment_spec_selects_standalone_entrypoint_and_noninteractive_downloads():
    config = ConfigParser()
    assert config.read(ROOT / "pysidedeploy.spec", encoding="utf-8")

    app = config["app"]
    nuitka = config["nuitka"]
    assert app["title"] == "BambuPrep"
    assert app["input_file"] == "src/bambuprep/desktop_entry.py"
    assert "project_file" not in app
    assert app["exec_directory"] == "dist"
    assert nuitka["mode"] == "standalone"
    assert nuitka["extra_args"] == (
        "--assume-yes-for-downloads --output-filename=BambuPrep.exe "
        "--report=build-reports/bambuprep-compilation-report.xml "
        "--report-template=LicenseReport:build-reports/bambuprep-license-report.rst"
    )


def test_windows_build_check_does_not_publish_or_use_secrets():
    workflow_path = ROOT / ".github" / "workflows" / "windows-build.yml"
    workflow = workflow_path.read_text(encoding="utf-8")

    assert "runs-on: windows-latest" in workflow
    assert "pyside6-deploy -c pysidedeploy.spec --force --mode standalone" in workflow
    assert "vcvars64.bat" in workflow
    assert "dumpbin.exe" in workflow
    assert "ilammy/msvc-dev-cmd@" not in workflow
    assert "permissions:\n  contents: read" in workflow
    assert "tools/audit_standalone_bundle.py --bundle $bundle" in workflow
    assert "tools/summarize_nuitka_report.py" in workflow
    assert "bambuprep-compilation-report.xml" in workflow
    assert "bambuprep-license-report.rst" in workflow
    assert "upload-artifact" not in workflow.lower()
    assert "${{ secrets." not in workflow
    assert "/build-reports/" in (ROOT / ".gitignore").read_text(encoding="utf-8")


def test_windows_build_installs_the_pinned_deployment_compiler():
    project = tomllib.loads((ROOT / "pyproject.toml").read_text(encoding="utf-8"))
    build_dependencies = project["project"]["optional-dependencies"]["build"]
    assert build_dependencies == ["Nuitka==4.3.1"]

    workflow = (ROOT / ".github" / "workflows" / "windows-build.yml").read_text(encoding="utf-8")
    assert "uv sync --locked --extra build" in workflow
    assert "uv run --locked --extra build pyside6-deploy" in workflow


def test_windows_actions_install_and_use_the_committed_dependency_lock():
    lock = tomllib.loads((ROOT / "uv.lock").read_text(encoding="utf-8"))
    nuitka = next(package for package in lock["package"] if package["name"] == "nuitka")
    assert nuitka["version"] == "4.3.1"

    expected = {
        ".github/workflows/windows-build.yml": "build",
        ".github/workflows/windows-tests.yml": "test",
    }
    for relative_path, extra in expected.items():
        workflow = (ROOT / relative_path).read_text(encoding="utf-8")
        assert "python -m pip install uv==0.13.4" in workflow
        assert f"uv sync --locked --extra {extra}" in workflow
        assert f"uv run --locked --extra {extra}" in workflow
        assert '"uv.lock"' in workflow
