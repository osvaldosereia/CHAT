import sqlite3
from datetime import datetime, timezone
from pathlib import Path

import pytest

from bambuprep.domain.models import JobState
from bambuprep.storage.jobs import JobRepository, StateConflictError


def test_job_persists_across_repository_recreation_and_records_state_changes(tmp_path):
    db_path = tmp_path / "data" / "jobs.sqlite3"
    source = tmp_path / "private.stl"
    source.write_bytes(b"private STL bytes")
    sha = "a" * 64

    repository = JobRepository(db_path)
    created = repository.create_job(source, sha)
    updated = repository.transition(created.id, JobState.UPLOADED, JobState.ANALYZING, "local analysis")

    reopened = JobRepository(db_path)
    persisted = reopened.get_job(created.id)
    events = reopened.list_events(created.id)

    assert updated.state is JobState.ANALYZING
    assert persisted == updated
    assert [event["target_state"] for event in events] == ["uploaded", "analyzing"]
    assert events[0]["detail"] is None
    assert events[1]["detail"] == "local analysis"


def test_state_conflict_does_not_overwrite_concurrent_state(tmp_path):
    repository = JobRepository(tmp_path / "jobs.sqlite3")
    record = repository.create_job(tmp_path / "model.stl", "b" * 64)

    with pytest.raises(StateConflictError):
        repository.transition(record.id, JobState.ANALYZING, JobState.RECOMMENDATION_READY)

    assert repository.get_job(record.id).state is JobState.UPLOADED


def test_delete_history_removes_rows_but_keeps_user_stl_by_default(tmp_path):
    source = tmp_path / "preserve.stl"
    source.write_bytes(b"source remains local")
    repository = JobRepository(tmp_path / "jobs.sqlite3")
    repository.create_job(source, "c" * 64)

    removed = repository.delete_history()

    assert removed == 1
    assert repository.list_jobs() == []
    assert source.read_bytes() == b"source remains local"


def test_database_schema_is_versioned_and_does_not_store_file_contents_or_keys(tmp_path):
    db_path = tmp_path / "jobs.sqlite3"
    source = tmp_path / "private.stl"
    source.write_bytes(b"private mesh payload; never copy into database")
    repository = JobRepository(db_path)
    repository.create_job(source, "d" * 64)
    connection = sqlite3.connect(db_path)
    try:
        version = connection.execute("PRAGMA user_version").fetchone()[0]
    finally:
        connection.close()

    raw_database = db_path.read_bytes()
    assert version == 1
    assert b"private mesh payload" not in raw_database
    assert b"sk-test-secret" not in raw_database


def test_future_schema_version_is_rejected_without_downgrade(tmp_path):
    db_path = tmp_path / "newer.sqlite3"
    connection = sqlite3.connect(db_path)
    try:
        connection.execute("PRAGMA user_version = 99")
        connection.commit()
    finally:
        connection.close()

    with pytest.raises(RuntimeError, match="newer than supported"):
        JobRepository(db_path)
