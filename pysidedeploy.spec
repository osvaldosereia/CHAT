[app]
title = BambuPrep
project_dir = .
input_file = src/bambuprep/desktop_entry.py
project_file = pyproject.toml
exec_directory = dist

[nuitka]
mode = standalone
extra_args = --assume-yes-for-downloads
