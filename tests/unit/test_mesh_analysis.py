from pathlib import Path

import pytest

from bambuprep.mesh.analyzer import analyze_mesh
from bambuprep.mesh.loader import load_stl

FIXTURES = Path(__file__).parents[1] / "fixtures"


def test_closed_cube_has_deterministic_measurements_and_orientation_indicators():
    report = analyze_mesh(load_stl(FIXTURES / "cube_ascii.stl"), nozzle_mm=0.4)

    assert report.dimensions_mm == pytest.approx((2, 2, 2))
    assert report.triangle_count == 12
    assert report.component_count == 1
    assert report.watertight is True
    assert report.volume_mm3 == pytest.approx(8)
    assert report.degenerate_faces == 0
    assert report.duplicate_faces == 0
    assert report.overhang_area_ratio >= 0
    assert report.contact_area_estimate >= 0
    assert report.orientation_candidates
    assert report.orientation_candidates[0].rotation_deg
    assert "estimate" in " ".join(report.warnings).lower() or "estimate" in str(report.orientation_candidates[0]).lower()


def test_open_cube_has_no_claimed_volume_and_a_review_warning():
    report = analyze_mesh(load_stl(FIXTURES / "cube_open.stl"), nozzle_mm=0.2)

    assert report.watertight is False
    assert report.volume_mm3 is None
    assert any("open" in warning.lower() or "watertight" in warning.lower() for warning in report.warnings)


def test_disconnected_shells_are_counted_separately():
    report = analyze_mesh(load_stl(FIXTURES / "cube_multi.stl"), nozzle_mm=0.4)

    assert report.component_count == 2
    assert report.triangle_count == 24


def test_degenerate_and_duplicate_faces_are_reported():
    report = analyze_mesh(load_stl(FIXTURES / "degenerate.stl"), nozzle_mm=0.4)

    assert report.triangle_count == 13
    assert report.degenerate_faces == 1
    assert report.warnings


def test_implausibly_small_scale_is_flagged_without_rescaling():
    source = FIXTURES / "cube_tiny.stl"
    before = source.read_bytes()
    report = analyze_mesh(load_stl(source), nozzle_mm=0.4)

    assert report.scale_warning
    assert report.dimensions_mm == pytest.approx((0.02, 0.02, 0.02))
    assert source.read_bytes() == before


def test_mesh_memory_limit_returns_actionable_failure(tmp_path):
    from bambuprep.mesh.analyzer import MeshAnalysisLimitError

    document = load_stl(FIXTURES / "cube_ascii.stl")
    with pytest.raises(MeshAnalysisLimitError, match="faces"):
        analyze_mesh(document, nozzle_mm=0.4, max_triangles=2)
    assert document.path.read_bytes() == (FIXTURES / "cube_ascii.stl").read_bytes()


def test_closed_mesh_with_inconsistent_face_winding_does_not_report_volume():
    report = analyze_mesh(load_stl(FIXTURES / "cube_inconsistent.stl"), nozzle_mm=0.4)

    assert report.watertight is True
    assert report.volume_mm3 is None
    assert any("winding" in warning.lower() for warning in report.warnings)


def test_duplicate_triangle_is_counted_without_mutating_source():
    document = load_stl(FIXTURES / "duplicate.stl")
    before = document.path.read_bytes()

    report = analyze_mesh(document, nozzle_mm=0.4)

    assert report.triangle_count == 13
    assert report.duplicate_faces == 1
    assert report.degenerate_faces == 0
    assert document.path.read_bytes() == before


def test_zero_extent_is_flagged_for_review():
    report = analyze_mesh(load_stl(FIXTURES / "cube_flat.stl"), nozzle_mm=0.4)

    assert report.dimensions_mm[2] == pytest.approx(0)
    assert report.scale_warning
    assert "zero" in report.scale_warning.lower()


def test_extreme_but_finite_dimensions_are_warned_without_integer_overflow():
    import warnings
    import trimesh
    from bambuprep.mesh.loader import MeshDocument

    mesh = trimesh.Trimesh(
        vertices=[[0.0, 0.0, 0.0], [2e13, 0.0, 0.0], [0.0, 1.0, 0.0]],
        faces=[[0, 1, 2]],
        process=False,
    )
    document = MeshDocument(Path("synthetic.stl"), "a" * 64, 0, mesh)

    with warnings.catch_warnings():
        warnings.simplefilter("error", RuntimeWarning)
        report = analyze_mesh(document, nozzle_mm=0.4)

    assert report.scale_warning and "180 mm" in report.scale_warning
