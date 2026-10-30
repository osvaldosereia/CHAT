from pathlib import Path

import pytest

from bambuprep.config import AppPaths, get_app_paths
from bambuprep.storage.app_data_cleanup import AppDataCleanupError, remove_local_app_files


def _paths(tmp_path: Path) -> AppPaths:
    return get_app_paths(local_app_data=tmp_path / "LOCALAPPDATA")


def test_removes_only_bambuprep_owned_files_and_preserves_user_files(tmp_path):
    paths = _paths(tmp_path)
    paths.data_dir.mkdir(parents=True)
    paths.database_file.write_bytes(b"sqlite")
    Path(str(paths.database_file) + "-wal").write_bytes(b"wal")
    Path(str(paths.database_file) + "-shm").write_bytes(b"shm")
    Path(str(paths.database_file) + "-journal").write_bytes(b"journal")
    preferences = paths.data_dir / "preferences.json"
    preferences.write_text('{"studio_executable":null}')
    paths.logs_dir.mkdir()
    (paths.logs_dir / "run.log").write_text("local diagnostic")
    paths.temp_dir.mkdir()
    (paths.temp_dir / "render.png").write_bytes(b"rendered image")
    unrelated = paths.data_dir / "keep-me.txt"
    unrelated.write_text("user file")

    source = tmp_path / "synthetic-input.stl"
    source.write_bytes(b"synthetic input bytes")
    output_dir = tmp_path / "chosen-output"
    output_dir.mkdir()
    output = output_dir / "project.3mf"
    output.write_bytes(b"user output")

    removed = remove_local_app_files(paths)

    assert removed == 7
    assert not paths.database_file.exists()
    assert not Path(str(paths.database_file) + "-wal").exists()
    assert not Path(str(paths.database_file) + "-shm").exists()
    assert not Path(str(paths.database_file) + "-journal").exists()
    assert not preferences.exists()
    assert not paths.logs_dir.exists()
    assert not paths.temp_dir.exists()
    assert unrelated.read_text() == "user file"
    assert source.read_bytes() == b"synthetic input bytes"
    assert output.read_bytes() == b"user output"


def test_removal_is_idempotent_when_app_directory_does_not_exist(tmp_path):
    assert remove_local_app_files(_paths(tmp_path)) == 0


def test_rejects_mismatched_app_paths_without_touching_files(tmp_path):
    paths = _paths(tmp_path)
    paths.data_dir.mkdir(parents=True)
    unrelated_db = tmp_path / "unrelated.sqlite3"
    unrelated_db.write_text("keep")
    invalid = AppPaths(paths.data_dir, unrelated_db, paths.logs_dir, paths.temp_dir)

    with pytest.raises(AppDataCleanupError):
        remove_local_app_files(invalid)

    assert unrelated_db.read_text() == "keep"


def test_refuses_redirected_managed_directory_before_removing_anything(tmp_path):
    paths = _paths(tmp_path)
    paths.data_dir.mkdir(parents=True)
    preferences = paths.data_dir / "preferences.json"
    preferences.write_text("{}")
    outside = tmp_path / "outside"
    outside.mkdir()
    sentinel = outside / "do-not-delete.txt"
    sentinel.write_text("outside")
    paths.logs_dir.symlink_to(outside, target_is_directory=True)

    with pytest.raises(AppDataCleanupError):
        remove_local_app_files(paths)

    assert preferences.read_text() == "{}"
    assert sentinel.read_text() == "outside"



def test_preserves_selected_output_directory_inside_managed_temp_folder(tmp_path):
    paths = _paths(tmp_path)
    paths.data_dir.mkdir(parents=True)
    preferences = paths.data_dir / "preferences.json"
    preferences.write_text(
        '{"studio_executable":null,"output_directory":'
        + __import__("json").dumps(str(paths.temp_dir / "not-created" / ".." / "chosen-output"))
        + "}"
    )
    paths.database_file.write_text("sqlite")
    paths.temp_dir.mkdir()
    stale = paths.temp_dir / "stale.tmp"
    stale.write_text("generated temporary file")
    output = paths.temp_dir / "chosen-output"
    output.mkdir()
    project = output / "my-project.3mf"
    project.write_bytes(b"user output")

    removed = remove_local_app_files(paths)

    assert removed == 3
    assert not preferences.exists()
    assert not paths.database_file.exists()
    assert not stale.exists()
    assert project.read_bytes() == b"user output"
    assert output.is_dir()
    assert paths.temp_dir.is_dir()

