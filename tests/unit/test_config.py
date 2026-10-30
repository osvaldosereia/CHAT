from pathlib import Path

import pytest

from bambuprep.config import LocalPreferencesStore, get_app_paths


def test_default_paths_are_under_localappdata_bambuprep():
    paths = get_app_paths(environ={"LOCALAPPDATA": r"C:\Users\Tester\AppData\Local"})

    assert paths.data_dir == Path(r"C:\Users\Tester\AppData\Local") / "BambuPrep"
    assert paths.database_file == paths.data_dir / "bambuprep.sqlite3"
    assert paths.logs_dir == paths.data_dir / "logs"
    assert paths.temp_dir == paths.data_dir / "temp"


def test_app_data_root_can_be_injected_for_isolated_tests(tmp_path):
    paths = get_app_paths(local_app_data=tmp_path)

    assert paths.data_dir == tmp_path / "BambuPrep"


def test_windows_paths_fail_closed_without_localappdata():
    with pytest.raises(RuntimeError, match="LOCALAPPDATA"):
        get_app_paths(environ={})


def test_local_preferences_round_trip_only_non_secret_studio_path(tmp_path):
    preferences_file = tmp_path / "BambuPrep" / "preferences.json"
    store = LocalPreferencesStore(preferences_file)
    executable = tmp_path / "Bambu Studio" / "BambuStudio.exe"

    assert store.load().studio_executable is None
    store.save_studio_executable(executable)

    assert store.load().studio_executable == executable
    assert "BambuStudio.exe" in preferences_file.read_text(encoding="utf-8")
    assert "api_key" not in preferences_file.read_text(encoding="utf-8")


def test_local_preferences_round_trip_studio_and_output_directory(tmp_path):
    preferences_file = tmp_path / "BambuPrep" / "preferences.json"
    store = LocalPreferencesStore(preferences_file)
    executable = tmp_path / "Bambu Studio" / "BambuStudio.exe"
    output_directory = tmp_path / "BambuPrep outputs"

    store.save_studio_executable(executable)
    store.save_output_directory(output_directory)

    preferences = store.load()
    assert preferences.studio_executable == executable
    assert preferences.output_directory == output_directory
    contents = preferences_file.read_text(encoding="utf-8")
    assert "output_directory" in contents
    assert "api_key" not in contents


def test_local_preferences_reject_relative_output_directory(tmp_path):
    store = LocalPreferencesStore(tmp_path / "preferences.json")

    with pytest.raises(ValueError, match="absolute"):
        store.save_output_directory(Path("BambuPrep outputs"))


def test_local_preferences_reject_relative_paths_and_unknown_secret_fields(tmp_path):
    preferences_file = tmp_path / "preferences.json"
    store = LocalPreferencesStore(preferences_file)
    with pytest.raises(ValueError, match="absolute"):
        store.save_studio_executable(Path("BambuStudio.exe"))

    preferences_file.write_text('{"studio_executable":"C:/Studio.exe","api_key":"private"}')
    with pytest.raises(ValueError, match="unexpected"):
        store.load()
