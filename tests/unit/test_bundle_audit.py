import hashlib
import json
import subprocess
import sys
from pathlib import Path

import pytest

from bambuprep.bundle_audit import BundleAuditError, inspect_standalone_bundle


def test_bundle_inventory_is_relative_and_hashes_runtime_files(tmp_path):
    bundle = tmp_path / "BambuPrep.dist"
    bundle.mkdir()
    executable = bundle / "BambuPrep.exe"
    executable.write_bytes(b"synthetic executable")
    license_file = bundle / "LICENSE.txt"
    license_file.write_text("synthetic notice", encoding="utf-8")

    inventory = inspect_standalone_bundle(bundle)

    assert inventory.file_count == 2
    assert inventory.total_bytes == executable.stat().st_size + license_file.stat().st_size
    assert [entry.path for entry in inventory.files] == ["BambuPrep.exe", "LICENSE.txt"]
    assert inventory.files[0].sha256 == hashlib.sha256(executable.read_bytes()).hexdigest()
    assert str(tmp_path) not in repr(inventory)


def test_bundle_audit_requires_nonempty_expected_executable(tmp_path):
    bundle = tmp_path / "bundle"
    bundle.mkdir()

    with pytest.raises(BundleAuditError, match="[Ee]xpected standalone executable"):
        inspect_standalone_bundle(bundle)

    (bundle / "BambuPrep.exe").touch()
    with pytest.raises(BundleAuditError, match="[Ee]xpected standalone executable"):
        inspect_standalone_bundle(bundle)


@pytest.mark.parametrize("private_name", ("private-model.stl", "prepared.3mf", "history.sqlite3-wal", "token.pem", ".env.local"))
def test_bundle_audit_rejects_user_file_without_echoing_private_filename(tmp_path, private_name):
    bundle = tmp_path / "bundle"
    bundle.mkdir()
    (bundle / "BambuPrep.exe").write_bytes(b"app")
    (bundle / private_name).write_bytes(b"synthetic user data")

    with pytest.raises(BundleAuditError) as caught:
        inspect_standalone_bundle(bundle)

    assert private_name not in str(caught.value)


@pytest.mark.parametrize(
    "build_tool_path",
    (
        "Nuitka/__init__.py",
        "nuitka-4.3.1.dist-info/METADATA",
        "SCons/Script/__init__.py",
        "pyside6_deploy/__main__.py",
        "pip/_internal/__init__.py",
        "setuptools/__init__.py",
        "wheel/__init__.py",
        "pytest/__init__.py",
        "uv/__init__.py",
    ),
)
def test_bundle_audit_rejects_build_tool_files_without_echoing_paths(tmp_path, build_tool_path):
    bundle = tmp_path / "bundle"
    bundle.mkdir()
    (bundle / "BambuPrep.exe").write_bytes(b"app")
    tool_file = bundle / build_tool_path
    tool_file.parent.mkdir(parents=True, exist_ok=True)
    tool_file.write_bytes(b"synthetic build tool")

    with pytest.raises(BundleAuditError, match="build-time tool") as caught:
        inspect_standalone_bundle(bundle)

    assert build_tool_path not in str(caught.value)


def test_bundle_audit_rejects_openai_key_like_content_without_echoing_it(tmp_path):
    bundle = tmp_path / "bundle"
    bundle.mkdir()
    token = "sk-" + "proj-" + "Ab9_" * 16
    (bundle / "BambuPrep.exe").write_bytes(b"prefix" + token.encode("ascii") + b"suffix")

    with pytest.raises(BundleAuditError, match="OpenAI-key-like token") as caught:
        inspect_standalone_bundle(bundle)

    assert token not in str(caught.value)


def test_bundle_audit_cli_prints_relative_inventory_json(tmp_path):
    bundle = tmp_path / "BambuPrep.dist"
    bundle.mkdir()
    (bundle / "BambuPrep.exe").write_bytes(b"synthetic executable")

    root = Path(__file__).resolve().parents[2]
    result = subprocess.run(
        [
            sys.executable,
            str(root / "tools" / "audit_standalone_bundle.py"),
            "--bundle",
            str(bundle),
        ],
        capture_output=True,
        text=True,
        check=False,
        timeout=10,
    )

    assert result.returncode == 0, result.stderr
    output = result.stdout
    inventory = json.loads(output)
    assert inventory["bundle_name"] == "BambuPrep.dist"
    assert inventory["files"][0]["path"] == "BambuPrep.exe"
    assert str(tmp_path) not in output


def test_bundle_audit_detects_key_signature_across_read_boundary(tmp_path, monkeypatch):
    import bambuprep.bundle_audit as audit_module

    bundle = tmp_path / "bundle"
    bundle.mkdir()
    token = b"sk-" + b"proj-" + b"Z7" * 20
    (bundle / "BambuPrep.exe").write_bytes(b"x" * 31 + token + b"y")
    monkeypatch.setattr(audit_module, "_SCAN_CHUNK_BYTES", 32)

    with pytest.raises(BundleAuditError, match="OpenAI-key-like token"):
        inspect_standalone_bundle(bundle)
