from datetime import datetime
from pathlib import Path

import pytest

from bambuprep.domain.models import JobRecord, JobState, PrinterSelection


def test_printer_selection_requires_supported_nozzle_and_confirmed_profile_ids():
    with pytest.raises(ValueError, match="0.2 or 0.4"):
        PrinterSelection("Bambu Lab A1 mini", 0.6, "Generic PLA", "Textured PEI")
    with pytest.raises(ValueError, match="printer_id"):
        PrinterSelection(" ", 0.4, "Generic PLA", "Textured PEI")


def test_job_record_requires_timezone_aware_date_and_sha256():
    with pytest.raises(ValueError, match="timezone-aware"):
        JobRecord("job", datetime(2026, 10, 30), Path("model.stl"), "a" * 64, JobState.UPLOADED)
    with pytest.raises(ValueError, match="64-character"):
        JobRecord("job", datetime.now().astimezone(), Path("model.stl"), "bad", JobState.UPLOADED)
