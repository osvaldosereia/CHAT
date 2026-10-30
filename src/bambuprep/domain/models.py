"""Validated data structures shared by BambuPrep services."""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from pathlib import Path


class JobState(StrEnum):
    UPLOADED = "uploaded"
    ANALYZING = "analyzing"
    NEEDS_REVIEW = "needs_review"
    RECOMMENDATION_READY = "recommendation_ready"
    PROJECT_CONFIGURED = "project_configured"
    SLICER_VERIFIED = "slicer_verified"
    BLOCKED = "blocked"
    FAILED = "failed"


@dataclass(frozen=True, slots=True)
class PrinterSelection:
    printer_id: str
    nozzle_mm: float
    filament_id: str
    plate_id: str

    def __post_init__(self) -> None:
        if not self.printer_id.strip():
            raise ValueError("printer_id is required")
        if self.nozzle_mm not in (0.2, 0.4):
            raise ValueError("nozzle_mm must be 0.2 or 0.4")
        if not self.filament_id.strip() or not self.plate_id.strip():
            raise ValueError("filament_id and plate_id are required")


@dataclass(frozen=True, slots=True)
class JobRecord:
    id: str
    created_at: datetime
    source_path: Path
    source_sha256: str
    state: JobState
    report_json: str | None = None
    output_path: Path | None = None

    def __post_init__(self) -> None:
        if not self.id.strip():
            raise ValueError("id is required")
        if self.created_at.tzinfo is None:
            raise ValueError("created_at must be timezone-aware")
        if not re.fullmatch(r"[0-9a-fA-F]{64}", self.source_sha256):
            raise ValueError("source_sha256 must be a 64-character hexadecimal digest")
        object.__setattr__(self, "source_path", Path(self.source_path))
        if self.output_path is not None:
            object.__setattr__(self, "output_path", Path(self.output_path))
