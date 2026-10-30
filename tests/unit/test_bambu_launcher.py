import subprocess
from pathlib import Path

import pytest

from bambuprep.bambu.launcher import open_stl_in_studio


def test_open_stl_passes_paths_as_argv_without_a_shell(tmp_path, monkeypatch):
    executable = tmp_path / "Bambu Studio ; safe" / "bambu-studio.exe"
    executable.parent.mkdir()
    executable.write_bytes(b"synthetic executable")
    source = tmp_path / "private ; $literal.stl"
    source.write_bytes(b"solid local\\nendsolid local\\n")
    calls = []
    process = object()

    def fake_popen(arguments, **kwargs):
        calls.append((arguments, kwargs))
        return process

    monkeypatch.setattr(subprocess, "Popen", fake_popen)

    assert open_stl_in_studio(executable, source) is process
    assert calls == [
        (
            [str(executable), str(source)],
            {"cwd": str(executable.parent), "shell": False},
        )
    ]


def test_open_stl_rejects_relative_paths_and_non_stl_inputs(tmp_path, monkeypatch):
    executable = tmp_path / "bambu-studio.exe"
    executable.write_bytes(b"synthetic executable")
    source = tmp_path / "model.3mf"
    source.write_bytes(b"not parsed")

    called = []
    monkeypatch.setattr(subprocess, "Popen", lambda *args, **kwargs: called.append(args))

    with pytest.raises(ValueError, match="absolute"):
        open_stl_in_studio(Path("relative.exe"), source)
    with pytest.raises(ValueError, match="STL"):
        open_stl_in_studio(executable, source)
    assert called == []


def test_open_stl_rejects_missing_local_files(tmp_path, monkeypatch):
    calls = []
    monkeypatch.setattr(subprocess, "Popen", lambda *args, **kwargs: calls.append(args))

    with pytest.raises(FileNotFoundError):
        open_stl_in_studio(tmp_path / "missing.exe", tmp_path / "part.stl")
    assert calls == []
