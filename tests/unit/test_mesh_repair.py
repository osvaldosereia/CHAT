from hashlib import sha256
from pathlib import Path

from bambuprep.mesh.repair import repair_copy
from bambuprep.mesh.loader import load_stl

FIXTURES = Path(__file__).parents[1] / "fixtures"


def test_repair_writes_separate_audited_copy_and_preserves_original(tmp_path):
    source = FIXTURES / "cube_open.stl"
    original = source.read_bytes()
    document = load_stl(source)
    destination = tmp_path / "repaired.stl"

    audit = repair_copy(document, destination, "fill_holes")

    assert destination.exists()
    assert source.read_bytes() == original
    assert audit.operation == "fill_holes"
    assert audit.input_sha256 == sha256(original).hexdigest()
    assert audit.output_sha256 == sha256(destination.read_bytes()).hexdigest()
    assert audit.input_dimensions_mm == audit.output_dimensions_mm
    assert audit.output_triangle_count >= audit.input_triangle_count
    assert audit.tool_version


def test_repair_rejects_overwrite_and_unknown_operations(tmp_path):
    source = FIXTURES / "cube_ascii.stl"
    document = load_stl(source)

    try:
        repair_copy(document, source, "fix_normals")
    except ValueError as exc:
        assert "separate" in str(exc).lower()
    else:
        raise AssertionError("repair must never overwrite its input")

    try:
        repair_copy(document, tmp_path / "repair.stl", "invent_shape")
    except ValueError as exc:
        assert "operation" in str(exc).lower()
    else:
        raise AssertionError("unknown repairs must be rejected")


def test_repair_does_not_delete_file_created_after_preflight(tmp_path, monkeypatch):
    from pathlib import Path
    import pytest

    source = FIXTURES / "cube_ascii.stl"
    document = load_stl(source)
    destination = tmp_path / "race.stl"
    destination.write_bytes(b"another file")
    original_exists = Path.exists
    monkeypatch.setattr(
        Path,
        "exists",
        lambda path: False if path == destination else original_exists(path),
    )

    with pytest.raises(FileExistsError):
        repair_copy(document, destination, "fix_normals")

    assert destination.read_bytes() == b"another file"
