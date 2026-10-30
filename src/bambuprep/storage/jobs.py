"""SQLite repository for job metadata and state history."""

from __future__ import annotations

import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path

from bambuprep.domain.models import JobRecord, JobState
from bambuprep.domain.transitions import validate_transition
from bambuprep.storage.database import connect, initialize_database


class StateConflictError(RuntimeError):
    """Raised when stored state differs from the caller's expected state."""


class JobRepository:
    def __init__(self, database_path: Path):
        self.database_path = Path(database_path)
        initialize_database(self.database_path)

    def create_job(self, source_path: Path, source_sha256: str) -> JobRecord:
        record = JobRecord(
            id=str(uuid.uuid4()),
            created_at=datetime.now(timezone.utc),
            source_path=Path(source_path),
            source_sha256=source_sha256.lower(),
            state=JobState.UPLOADED,
        )
        with connect(self.database_path) as connection:
            connection.execute(
                "INSERT INTO jobs(id, created_at, source_path, source_sha256, state) VALUES (?, ?, ?, ?, ?)",
                (record.id, record.created_at.isoformat(), str(record.source_path), record.source_sha256, record.state.value),
            )
            connection.execute(
                "INSERT INTO job_events(job_id, created_at, target_state) VALUES (?, ?, ?)",
                (record.id, record.created_at.isoformat(), record.state.value),
            )
        return record

    def transition(
        self,
        job_id: str,
        expected: JobState,
        target: JobState,
        detail: str | None = None,
    ) -> JobRecord:
        with connect(self.database_path) as connection:
            connection.execute("BEGIN IMMEDIATE")
            row = connection.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
            if row is None:
                raise KeyError(f"Unknown job: {job_id}")
            current = JobState(row["state"])
            if current is not expected:
                raise StateConflictError(
                    f"Job {job_id} is {current.value}; expected {expected.value}"
                )
            validate_transition(current, target)
            changed_at = datetime.now(timezone.utc)
            connection.execute(
                "UPDATE jobs SET state = ? WHERE id = ?",
                (target.value, job_id),
            )
            connection.execute(
                "INSERT INTO job_events(job_id, created_at, target_state, detail) VALUES (?, ?, ?, ?)",
                (job_id, changed_at.isoformat(), target.value, detail),
            )
            updated = connection.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
        return self._record_from_row(updated)

    def get_job(self, job_id: str) -> JobRecord:
        with connect(self.database_path) as connection:
            row = connection.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
        if row is None:
            raise KeyError(f"Unknown job: {job_id}")
        return self._record_from_row(row)

    def list_jobs(self) -> list[JobRecord]:
        with connect(self.database_path) as connection:
            rows = connection.execute("SELECT * FROM jobs ORDER BY created_at DESC, id").fetchall()
        return [self._record_from_row(row) for row in rows]

    def list_events(self, job_id: str) -> list[dict[str, str | None]]:
        with connect(self.database_path) as connection:
            rows = connection.execute(
                "SELECT created_at, target_state, detail FROM job_events WHERE job_id = ? ORDER BY id",
                (job_id,),
            ).fetchall()
        return [dict(row) for row in rows]

    def delete_history(self) -> int:
        """Delete job metadata only; source STL and output files remain untouched."""
        with connect(self.database_path) as connection:
            count = connection.execute("SELECT COUNT(*) FROM jobs").fetchone()[0]
            connection.execute("DELETE FROM jobs")
        return count

    @staticmethod
    def _record_from_row(row: sqlite3.Row) -> JobRecord:
        return JobRecord(
            id=row["id"],
            created_at=datetime.fromisoformat(row["created_at"]),
            source_path=Path(row["source_path"]),
            source_sha256=row["source_sha256"],
            state=JobState(row["state"]),
            report_json=row["report_json"],
            output_path=Path(row["output_path"]) if row["output_path"] else None,
        )
