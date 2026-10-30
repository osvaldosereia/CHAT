import json
import runpy
import os
import subprocess
import sys
import textwrap
from pathlib import Path

import pytest

from bambuprep.bambu.profiles import ProfileCatalog, ProfileCatalogError


def _install_fixture(root: Path, *, omit: str | None = None, incompatible_default: bool = False) -> Path:
    vendor_root = root / "resources" / "profiles"
    bbl_root = vendor_root / "BBL"
    manifest = {
        "name": "Bambulab",
        "version": "test-profile-version",
        "machine_model_list": [
            {"name": "Bambu Lab A1 mini", "sub_path": "machine/Bambu Lab A1 mini.json"}
        ],
        "machine_list": [
            {
                "name": "Bambu Lab A1 mini 0.4 nozzle",
                "sub_path": "machine/Bambu Lab A1 mini 0.4 nozzle.json",
            },
            {
                "name": "Bambu Lab A1 mini 0.2 nozzle",
                "sub_path": "machine/Bambu Lab A1 mini 0.2 nozzle.json",
            },
        ],
        "filament_list": [
            {"name": "Generic PLA @BBL A1M", "sub_path": "filament/Generic PLA @BBL A1M.json"},
            {
                "name": "Generic PLA @BBL A1M 0.2 nozzle",
                "sub_path": "filament/Generic PLA @BBL A1M 0.2 nozzle.json",
            },
        ],
        "process_list": [
            {"name": "fdm_process_common", "sub_path": "process/fdm_process_common.json"},
            {"name": "fdm_process_single_0.20", "sub_path": "process/fdm_process_single_0.20.json"},
            {
                "name": "fdm_process_single_0.10_nozzle_0.2",
                "sub_path": "process/fdm_process_single_0.10_nozzle_0.2.json",
            },
            {
                "name": "0.20mm Standard @BBL A1M",
                "sub_path": "process/0.20mm Standard @BBL A1M.json",
            },
            {
                "name": "0.16mm Quality @BBL A1M",
                "sub_path": "process/0.16mm Quality @BBL A1M.json",
            },
            {
                "name": "0.10mm Standard @BBL A1M 0.2 nozzle",
                "sub_path": "process/0.10mm Standard @BBL A1M 0.2 nozzle.json",
            },
        ],
    }
    if omit:
        for key in ("machine_model_list", "machine_list", "filament_list", "process_list"):
            manifest[key] = [entry for entry in manifest[key] if entry["name"] != omit]
    bbl_root.mkdir(parents=True)
    (vendor_root / "BBL.json").write_text(json.dumps(manifest), encoding="utf-8")

    profiles = {
        "machine/Bambu Lab A1 mini.json": {
            "type": "machine_model",
            "name": "Bambu Lab A1 mini",
            "from": "system",
            "nozzle_diameter": "0.4;0.2;0.6;0.8",
            "default_bed_type": "Textured PEI Plate",
            "not_support_bed_type": "Cool Plate;Engineering Plate",
        },
        "machine/Bambu Lab A1 mini 0.4 nozzle.json": {
            "type": "machine",
            "name": "Bambu Lab A1 mini 0.4 nozzle",
            "from": "system",
            "printer_model": "Bambu Lab A1 mini",
            "nozzle_diameter": ["0.4"],
            "default_print_profile": "0.20mm Standard @BBL A1M",
        },
        "machine/Bambu Lab A1 mini 0.2 nozzle.json": {
            "type": "machine",
            "name": "Bambu Lab A1 mini 0.2 nozzle",
            "from": "system",
            "printer_model": "Bambu Lab A1 mini",
            "nozzle_diameter": ["0.2"],
            "default_print_profile": "0.10mm Standard @BBL A1M 0.2 nozzle",
        },
        "filament/Generic PLA @BBL A1M.json": {
            "type": "filament",
            "name": "Generic PLA @BBL A1M",
            "from": "system",
            "compatible_printers": ["Bambu Lab A1 mini 0.4 nozzle"],
        },
        "filament/Generic PLA @BBL A1M 0.2 nozzle.json": {
            "type": "filament",
            "name": "Generic PLA @BBL A1M 0.2 nozzle",
            "from": "system",
            "compatible_printers": ["Bambu Lab A1 mini 0.2 nozzle"],
        },
        "process/fdm_process_common.json": {
            "type": "process",
            "name": "fdm_process_common",
            "from": "system",
            "support_type": "tree(auto)",
            "brim_width": "5",
            "skirt_loops": "0",
            "raft_layers": "0",
        },
        "process/fdm_process_single_0.20.json": {
            "type": "process",
            "name": "fdm_process_single_0.20",
            "from": "system",
            "inherits": "fdm_process_common",
        },
        "process/fdm_process_single_0.10_nozzle_0.2.json": {
            "type": "process",
            "name": "fdm_process_single_0.10_nozzle_0.2",
            "from": "system",
            "inherits": "fdm_process_common",
        },
        "process/0.20mm Standard @BBL A1M.json": {
            "type": "process",
            "name": "0.20mm Standard @BBL A1M",
            "from": "system",
            "inherits": "fdm_process_single_0.20",
            "compatible_printers": [
                "Bambu Lab A1 mini 0.2 nozzle" if incompatible_default else "Bambu Lab A1 mini 0.4 nozzle"
            ],
        },
        "process/0.16mm Quality @BBL A1M.json": {
            "type": "process",
            "name": "0.16mm Quality @BBL A1M",
            "from": "system",
            "inherits": "fdm_process_single_0.20",
            "compatible_printers": ["Bambu Lab A1 mini 0.4 nozzle"],
            "support_type": "normal(auto)",
            "brim_width": "0",
        },
        "process/0.10mm Standard @BBL A1M 0.2 nozzle.json": {
            "type": "process",
            "name": "0.10mm Standard @BBL A1M 0.2 nozzle",
            "from": "system",
            "inherits": "fdm_process_single_0.10_nozzle_0.2",
            "compatible_printers": ["Bambu Lab A1 mini 0.2 nozzle"],
        },
    }
    for relative_path, data in profiles.items():
        destination = bbl_root / relative_path
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(json.dumps(data), encoding="utf-8")
    return root


def test_catalog_maps_installed_a1_mini_nozzles_generic_pla_and_default_plate(tmp_path):
    catalog = ProfileCatalog.load(_install_fixture(tmp_path))

    assert catalog.model_id == "Bambu Lab A1 mini"
    assert catalog.profile_version == "test-profile-version"
    assert {printer.nozzle_mm for printer in catalog.printers} == {0.2, 0.4}
    p04 = catalog.printer("Bambu Lab A1 mini 0.4 nozzle")
    p02 = catalog.printer("Bambu Lab A1 mini 0.2 nozzle")
    assert p04.generic_pla_profile_id == "Generic PLA @BBL A1M"
    assert p02.generic_pla_profile_id == "Generic PLA @BBL A1M 0.2 nozzle"
    assert p04.default_process_profile_id == "0.20mm Standard @BBL A1M"
    assert p02.default_process_profile_id == "0.10mm Standard @BBL A1M 0.2 nozzle"
    assert p04.plate_id == p02.plate_id == "Textured PEI Plate"
    assert p04.compatible_process_profile_ids == (
        "0.16mm Quality @BBL A1M",
        "0.20mm Standard @BBL A1M",
    )


def test_catalog_exports_only_selected_installed_profile_options(tmp_path):
    catalog = ProfileCatalog.load(_install_fixture(tmp_path))

    options = catalog.recommendation_options("Bambu Lab A1 mini 0.4 nozzle")

    assert options.printer_ids == ("Bambu Lab A1 mini 0.4 nozzle",)
    assert options.filament_ids == ("Generic PLA @BBL A1M",)
    assert options.plate_ids == ("Textured PEI Plate",)
    assert options.support_options == ("normal(auto)", "tree(auto)")
    assert options.adhesion_options == ("brim", "none")


def test_default_print_profile_must_match_the_same_nozzle(tmp_path):
    with pytest.raises(ProfileCatalogError, match="compatible installed process profile"):
        ProfileCatalog.load(_install_fixture(tmp_path, incompatible_default=True))


@pytest.mark.parametrize(
    "missing",
    [
        "Bambu Lab A1 mini 0.2 nozzle",
        "Generic PLA @BBL A1M 0.2 nozzle",
        "Bambu Lab A1 mini",
    ],
)
def test_required_model_nozzle_filament_or_plate_data_fails_closed(tmp_path, missing):
    if missing == "Bambu Lab A1 mini":
        install = _install_fixture(tmp_path)
        model_file = install / "resources/profiles/BBL/machine/Bambu Lab A1 mini.json"
        model_file.unlink()
        error = "profile file"
    else:
        install = _install_fixture(tmp_path, omit=missing)
        error = "Generic PLA" if missing.startswith("Generic") else "0.2 mm"

    with pytest.raises(ProfileCatalogError, match=error):
        ProfileCatalog.load(install)


def test_catalog_rejects_manifest_path_traversal_without_reading_outside_root(tmp_path):
    install = _install_fixture(tmp_path)
    manifest_path = install / "resources/profiles/BBL.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["machine_model_list"][0]["sub_path"] = "../../outside.json"
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

    with pytest.raises(ProfileCatalogError, match="outside"):
        ProfileCatalog.load(install)


def test_catalog_rejects_symlinked_profile_outside_install_root(tmp_path):
    install = _install_fixture(tmp_path / "install")
    model_path = install / "resources/profiles/BBL/machine/Bambu Lab A1 mini.json"
    outside_path = tmp_path / "outside-model.json"
    outside_path.write_text(
        json.dumps({"type": "machine_model", "name": "Bambu Lab A1 mini", "from": "system"}),
        encoding="utf-8",
    )
    model_path.unlink()
    try:
        model_path.symlink_to(outside_path)
    except OSError as exc:
        pytest.skip(f"symlinks unavailable in this test environment: {exc}")

    with pytest.raises(ProfileCatalogError, match="outside"):
        ProfileCatalog.load(install)


def test_catalog_rejects_inheritance_cycles(tmp_path):
    install = _install_fixture(tmp_path)
    common = install / "resources/profiles/BBL/process/fdm_process_common.json"
    profile = json.loads(common.read_text(encoding="utf-8"))
    profile["inherits"] = "fdm_process_single_0.20"
    common.write_text(json.dumps(profile), encoding="utf-8")

    with pytest.raises(ProfileCatalogError, match="inheritance cycle"):
        ProfileCatalog.load(install)


def test_profile_catalog_module_imports_without_mesh_stack():
    repository_root = Path(__file__).resolve().parents[2]
    script = textwrap.dedent(
        """
        import importlib.abc
        import sys

        class BlockMeshImports(importlib.abc.MetaPathFinder):
            def find_spec(self, fullname, path=None, target=None):
                if fullname == "trimesh" or fullname.startswith("bambuprep.mesh"):
                    raise ModuleNotFoundError("mesh imports blocked by this test")
                return None

        sys.meta_path.insert(0, BlockMeshImports())
        from bambuprep.bambu.profiles import ProfileCatalog
        assert callable(ProfileCatalog.load)
        """
    )
    environment = os.environ.copy()
    pythonpath = [str(repository_root / "src"), environment.get("PYTHONPATH", "")]
    environment["PYTHONPATH"] = os.pathsep.join(part for part in pythonpath if part)
    result = subprocess.run(
        [sys.executable, "-c", script],
        cwd=repository_root,
        env=environment,
        capture_output=True,
        text=True,
        timeout=15,
        check=False,
    )
    assert result.returncode == 0, result.stderr



def test_missing_profile_installation_layout_has_safe_diagnostic_code(tmp_path):
    with pytest.raises(ProfileCatalogError) as error_info:
        ProfileCatalog.load(tmp_path)

    assert getattr(error_info.value, "code", None) == "profile_layout_missing"
    assert str(tmp_path) not in str(error_info.value)


def test_probe_summary_exposes_only_safe_catalog_error_code(tmp_path):
    repository_root = Path(__file__).resolve().parents[2]
    probe_module = runpy.run_path(str(repository_root / "tools" / "bambu_cli_probe.py"))

    summary = probe_module["profile_catalog_summary"](tmp_path)

    assert summary == {
        "available": False,
        "error_code": "profile_layout_missing",
        "message": "The installed A1 mini system profile set could not be validated.",
        "printers": [],
    }
    assert str(tmp_path) not in repr(summary)
