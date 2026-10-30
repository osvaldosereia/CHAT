from hashlib import sha256
from pathlib import Path

import pytest

from bambuprep.mesh.loader import MeshLoadError, MeshTooLargeError, load_stl

FIXTURES = Path(__file__).parents[1] / "fixtures"


def test_ascii_and_binary_stl_load_to_same_geometry_and_keep_source_bytes():
    ascii_path = FIXTURES / "cube_ascii.stl"
    binary_path = FIXTURES / "cube_binary.stl"
    original_ascii = ascii_path.read_bytes()
    original_binary = binary_path.read_bytes()

    ascii_doc = load_stl(ascii_path)
    binary_doc = load_stl(binary_path)

    assert ascii_doc.mesh.faces.shape == binary_doc.mesh.faces.shape == (12, 3)
    assert ascii_doc.mesh.bounds.tolist() == binary_doc.mesh.bounds.tolist()
    assert ascii_doc.sha256 == sha256(original_ascii).hexdigest()
    assert binary_doc.sha256 == sha256(original_binary).hexdigest()
    assert ascii_doc.file_bytes == len(original_ascii)
    assert binary_doc.file_bytes == len(original_binary)
    assert ascii_path.read_bytes() == original_ascii
    assert binary_path.read_bytes() == original_binary


@pytest.mark.parametrize("name", ["empty.stl", "truncated.stl"])
def test_empty_or_truncated_stl_fails_with_actionable_error(name):
    with pytest.raises(MeshLoadError, match="STL"):
        load_stl(FIXTURES / name)


def test_stl_over_configured_byte_limit_is_rejected_without_modifying_source(tmp_path):
    source = FIXTURES / "cube_ascii.stl"
    before = source.read_bytes()

    with pytest.raises(MeshTooLargeError, match="limit"):
        load_stl(source, max_file_bytes=20)

    assert source.read_bytes() == before


def test_non_stl_extension_is_rejected(tmp_path):
    path = tmp_path / "mesh.obj"
    path.write_text("solid should_not_be_accepted", encoding="ascii")

    with pytest.raises(MeshLoadError, match=r"\.stl"):
        load_stl(path)


def test_ascii_triangle_count_limit_is_enforced_before_mesh_use():
    with pytest.raises(MeshTooLargeError, match="triangle"):
        load_stl(FIXTURES / "cube_ascii.stl", max_triangles=2)


def test_stl_size_limit_uses_open_file_size_not_a_stale_path_stat(tmp_path, monkeypatch):
    from types import SimpleNamespace
    import stat

    source = FIXTURES / "cube_ascii.stl"
    original_stat = Path.stat

    def stale_stat(path, *args, **kwargs):
        actual = original_stat(path, *args, **kwargs)
        if path == source:
            return SimpleNamespace(st_size=1, st_mode=stat.S_IFREG, st_mtime_ns=actual.st_mtime_ns)
        return actual

    monkeypatch.setattr(Path, "stat", stale_stat)

    with pytest.raises(MeshTooLargeError, match="limit"):
        load_stl(source, max_file_bytes=20)
