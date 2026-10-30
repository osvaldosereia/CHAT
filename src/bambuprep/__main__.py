"""BambuPrep application entry point."""

import sys


def main() -> int:
    if sys.platform != "win32":
        raise SystemExit("BambuPrep desktop interface requires Windows.")
    from bambuprep.app import run_windows_app

    return run_windows_app()


if __name__ == "__main__":
    raise SystemExit(main())
