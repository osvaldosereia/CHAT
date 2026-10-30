from pathlib import Path

import pytest

from bambuprep.config import get_app_paths


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
