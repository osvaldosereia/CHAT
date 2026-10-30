import hashlib
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

import pytest

from bambuprep.domain.models import JobState, StudioReviewConfirmation
from bambuprep.domain.transitions import InvalidTransitionError
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


def test_repository_requires_valid_3mf_and_complete_studio_review_before_verified_state(tmp_path):
    database_path = tmp_path / "jobs.sqlite3"
    repository = JobRepository(database_path)
    source = tmp_path / "source.stl"
    source.write_bytes(b"synthetic source only")
    setup = {
        "printer_id": "Bambu Lab A1 mini 0.4 nozzle",
        "nozzle_mm": 0.4,
        "filament_id": "Generic PLA @BBL A1M",
        "plate_id": "Textured PEI Plate",
    }
    snapshot = json.dumps({"selection": setup, "recommendation": None})
    record = repository.create_job(source, hashlib.sha256(source.read_bytes()).hexdigest())
    repository.transition(record.id, JobState.UPLOADED, JobState.ANALYZING)
    repository.finish_with_report(record.id, JobState.ANALYZING, JobState.NEEDS_REVIEW, snapshot)
    repository.finish_with_report(record.id, JobState.NEEDS_REVIEW, JobState.RECOMMENDATION_READY, snapshot)
    repository.transition(record.id, JobState.RECOMMENDATION_READY, JobState.PROJECT_CONFIGURED)

    project = _write_synthetic_3mf(tmp_path / "prepared.3mf")
    digest = hashlib.sha256(project.read_bytes()).hexdigest()

    with pytest.raises(InvalidTransitionError, match="confirmation"):
        repository.transition(record.id, JobState.PROJECT_CONFIGURED, JobState.SLICER_VERIFIED)
    assert repository.get_job(record.id).state is JobState.PROJECT_CONFIGURED

    with pytest.raises(InvalidTransitionError, match="configured local 3MF"):
        repository.transition(
            record.id,
            JobState.PROJECT_CONFIGURED,
            JobState.SLICER_VERIFIED,
            studio_review=_studio_review(digest=digest),
        )
    assert repository.get_job(record.id).state is JobState.PROJECT_CONFIGURED

    _attach_output_path(database_path, record.id, project)

    wrong_hash = _studio_review(digest="b" * 64)
    with pytest.raises(InvalidTransitionError, match="does not match"):
        repository.transition(
            record.id,
            JobState.PROJECT_CONFIGURED,
            JobState.SLICER_VERIFIED,
            studio_review=wrong_hash,
        )
    assert repository.get_job(record.id).state is JobState.PROJECT_CONFIGURED

    wrong_setup = _studio_review(digest=digest, printer_id="another printer")
    with pytest.raises(InvalidTransitionError, match="selected setup"):
        repository.transition(
            record.id,
            JobState.PROJECT_CONFIGURED,
            JobState.SLICER_VERIFIED,
            studio_review=wrong_setup,
        )
    assert repository.get_job(record.id).state is JobState.PROJECT_CONFIGURED

    reviewed = repository.transition(
        record.id,
        JobState.PROJECT_CONFIGURED,
        JobState.SLICER_VERIFIED,
        studio_review=_studio_review(digest=digest),
    )
    assert reviewed.state is JobState.SLICER_VERIFIED


def test_repository_rejects_malformed_3mf_even_when_review_confirmation_is_complete(tmp_path):
    database_path = tmp_path / "jobs.sqlite3"
    repository = JobRepository(database_path)
    source = tmp_path / "source.stl"
    source.write_bytes(b"synthetic source only")
    setup = {
        "printer_id": "Bambu Lab A1 mini 0.4 nozzle",
        "nozzle_mm": 0.4,
        "filament_id": "Generic PLA @BBL A1M",
        "plate_id": "Textured PEI Plate",
    }
    snapshot = json.dumps({"selection": setup, "recommendation": None})
    record = repository.create_job(source, hashlib.sha256(source.read_bytes()).hexdigest())
    repository.transition(record.id, JobState.UPLOADED, JobState.ANALYZING)
    repository.finish_with_report(record.id, JobState.ANALYZING, JobState.NEEDS_REVIEW, snapshot)
    repository.finish_with_report(record.id, JobState.NEEDS_REVIEW, JobState.RECOMMENDATION_READY, snapshot)
    repository.transition(record.id, JobState.RECOMMENDATION_READY, JobState.PROJECT_CONFIGURED)

    project = tmp_path / "prepared.3mf"
    project.write_bytes(b"not a 3MF package")
    _attach_output_path(database_path, record.id, project)

    with pytest.raises(InvalidTransitionError, match="valid 3MF"):
        repository.transition(
            record.id,
            JobState.PROJECT_CONFIGURED,
            JobState.SLICER_VERIFIED,
            studio_review=_studio_review(digest=hashlib.sha256(project.read_bytes()).hexdigest()),
        )
    assert repository.get_job(record.id).state is JobState.PROJECT_CONFIGURED


def _attach_output_path(database_path: Path, job_id: str, project_path: Path) -> None:
    with sqlite3.connect(database_path) as connection:
        connection.execute("UPDATE jobs SET output_path = ? WHERE id = ?", (str(project_path), job_id))


def _studio_review(*, digest: str, printer_id: str = "Bambu Lab A1 mini 0.4 nozzle"):
    return StudioReviewConfirmation(
        project_sha256=digest,
        studio_version="synthetic-test-version",
        printer_id=printer_id,
        nozzle_mm=0.4,
        filament_id="Generic PLA @BBL A1M",
        plate_id="Textured PEI Plate",
        opened_in_studio=True,
        machine_confirmed=True,
        nozzle_confirmed=True,
        filament_confirmed=True,
        plate_confirmed=True,
        support_settings_confirmed=True,
        preview_confirmed=True,
    )


def _write_synthetic_3mf(path: Path) -> Path:
    content_types = '''<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Override PartName="/3D/3dmodel.model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>'''
    relationships = '''<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rel-1" Target="/3D/3dmodel.model" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>'''
    model = '''<?xml version="1.0" encoding="UTF-8"?>
<model xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" unit="millimeter">
  <resources><object id="1" type="model"><mesh>
    <vertices><vertex x="0" y="0" z="0"/><vertex x="1" y="0" z="0"/><vertex x="0" y="1" z="0"/></vertices>
    <triangles><triangle v1="0" v2="1" v3="2"/></triangles>
  </mesh></object></resources><build><item objectid="1"/></build>
</model>'''
    with ZipFile(path, "w", compression=ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", content_types)
        archive.writestr("_rels/.rels", relationships)
        archive.writestr("3D/3dmodel.model", model)
    return path
