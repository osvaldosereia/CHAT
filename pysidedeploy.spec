[app]
title = BambuPrep
project_dir = .
input_file = src/bambuprep/desktop_entry.py
exec_directory = dist

[nuitka]
mode = standalone
extra_args = --assume-yes-for-downloads --output-filename=BambuPrep.exe --report=build-reports/bambuprep-compilation-report.xml --report-template=LicenseReport:build-reports/bambuprep-license-report.rst
