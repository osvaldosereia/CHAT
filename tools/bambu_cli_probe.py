"""Print a safe, read-only diagnostic of a local Bambu Studio installation."""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPOSITORY_ROOT / "src"))

from bambuprep.bambu.discovery import probe_studio
from bambuprep.bambu.profiles import ProfileCatalog, ProfileCatalogError



def profile_catalog_summary(studio_root: Path) -> dict[str, object]:
    """Return only allowlisted system profile identifiers from the install tree."""
    try:
        catalog = ProfileCatalog.load(studio_root)
    except ProfileCatalogError as exc:
        return {
            "available": False,
            "error_code": exc.code,
            "message": "The installed A1 mini system profile set could not be validated.",
            "printers": [],
        }
    return {
        "available": True,
        "model_id": catalog.model_id,
        "profile_version": catalog.profile_version,
        "printers": [
            {
                "printer_id": printer.printer_id,
                "nozzle_mm": printer.nozzle_mm,
                "generic_pla_profile_id": printer.generic_pla_profile_id,
                "default_process_profile_id": printer.default_process_profile_id,
                "plate_id": printer.plate_id,
                "support_options": list(printer.support_options),
                "adhesion_options": list(printer.adhesion_options),
            }
            for printer in catalog.printers
        ],
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--executable", required=True, type=Path, help="Explicit path to Bambu Studio executable")
    parser.add_argument("--timeout", type=int, default=20, help="Timeout in seconds for each diagnostic command")
    args = parser.parse_args(argv)
    try:
        result = probe_studio(args.executable, timeout_seconds=args.timeout)
    except ValueError as exc:
        parser.error(str(exc))
    payload = asdict(result)
    payload["executable"] = str(result.executable)
    payload["capabilities"] = sorted(result.capabilities)
    payload["profile_catalog"] = profile_catalog_summary(result.executable.parent)
    print(json.dumps(payload, indent=2, ensure_ascii=False))
    return 0 if result.cli_available else 2


if __name__ == "__main__":
    sys.exit(main())
