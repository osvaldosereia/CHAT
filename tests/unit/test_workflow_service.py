import json
from pathlib import Path

import pytest

from bambuprep.domain.models import JobState, PrinterSelection
from bambuprep.recommendations.schema import RecommendationProfileOptions
from bambuprep.storage.jobs import JobRepository
from bambuprep.workflow.service import WorkflowService


FIXTURES = Path(__file__).parents[1] / "fixtures"


class FakeCatalog:
    def printer(self, printer_id):
        if printer_id not in {"Bambu Lab A1 mini 0.2 nozzle", "Bambu Lab A1 mini 0.4 nozzle"}:
            raise ValueError("unknown printer")
        from types import SimpleNamespace

        return SimpleNamespace(
            printer_id=printer_id,
            nozzle_mm=0.2 if "0.2" in printer_id else 0.4,
        )

    def recommendation_options(self, printer_id):
        profile = self.printer(printer_id)
        suffix = " 0.2 nozzle" if profile.nozzle_mm == 0.2 else ""
        filament = f"Generic PLA @BBL A1M{suffix}"
        return RecommendationProfileOptions(
            printer_ids=(printer_id,),
            filament_ids=(filament,),
            plate_ids=("Textured PEI Plate",),
            support_options=("tree(auto)",),
            adhesion_options=("brim", "none"),
        )


class FakeKeyStore:
    def __init__(self):
        self.reads = 0

    def get(self):
        self.reads += 1
        return "sk-test-only"


class FakeOpenAIClient:
    model = "test-model"

    def __init__(self):
        self.calls = []

    def create_response(self, *, payload, api_key):
        self.calls.append((payload, api_key))
        recommendation = {
            "orientation_id": "keep",
            "support_enabled": True,
            "support_option": "tree(auto)",
            "adhesion_option": "brim",
            "confidence": 0.8,
            "rationale": ["A evidência local favorece esta opção."],
            "evidence_refs": ["mesh:dimensions_mm"],
        }
        return {
            "status": "completed",
            "output": [
                {
                    "type": "message",
                    "content": [{"type": "output_text", "text": json.dumps(recommendation)}],
                }
            ],
        }


def _service(tmp_path, *, client=None, key_store=None):
    repository = JobRepository(tmp_path / "history.sqlite3")
    keys = key_store or FakeKeyStore()
    api = client or FakeOpenAIClient()
    return WorkflowService(repository, FakeCatalog(), keys, api), repository, keys, api


def _selection(nozzle=0.4):
    suffix = " 0.2 nozzle" if nozzle == 0.2 else ""
    return PrinterSelection(
        printer_id=f"Bambu Lab A1 mini {nozzle:.1f} nozzle",
        nozzle_mm=nozzle,
        filament_id=f"Generic PLA @BBL A1M{suffix}",
        plate_id="Textured PEI Plate",
    )


def test_local_analysis_and_consent_recommendation_reach_recommendation_ready(tmp_path):
    service, repository, keys, client = _service(tmp_path)

    job = service.create_job(FIXTURES / "cube_ascii.stl")
    report = service.analyze(job.id, _selection())

    assert report.triangle_count == 12
    assert repository.get_job(job.id).state is JobState.NEEDS_REVIEW
    assert service.get_job(job.id) == repository.get_job(job.id)
    assert "private" not in (repository.get_job(job.id).report_json or "")

    result = service.recommend(job.id, consent=True)

    assert result is not None
    assert result.orientation_id == "keep"
    assert repository.get_job(job.id).state is JobState.RECOMMENDATION_READY
    assert keys.reads == 1
    assert len(client.calls) == 1
    assert client.calls[0][1] == "sk-test-only"


def test_missing_per_job_consent_leaves_report_local_and_does_not_read_key(tmp_path):
    service, repository, keys, client = _service(tmp_path)
    job = service.create_job(FIXTURES / "cube_ascii.stl")
    service.analyze(job.id, _selection())

    assert service.recommend(job.id, consent=False) is None

    assert repository.get_job(job.id).state is JobState.NEEDS_REVIEW
    assert keys.reads == 0
    assert client.calls == []


def test_source_change_after_job_creation_is_blocked_without_mutation(tmp_path):
    service, repository, keys, client = _service(tmp_path)
    source = tmp_path / "local-model.stl"
    source.write_bytes((FIXTURES / "cube_ascii.stl").read_bytes())
    job = service.create_job(source)
    source.write_bytes(b"changed local source")

    with pytest.raises(ValueError, match="changed"):
        service.analyze(job.id, _selection())

    assert repository.get_job(job.id).state is JobState.BLOCKED
    assert client.calls == []
    assert keys.reads == 0


def test_failed_render_keeps_local_report_and_does_not_call_api(tmp_path, monkeypatch):
    import bambuprep.workflow.service as workflow_module

    service, repository, keys, client = _service(tmp_path)
    job = service.create_job(FIXTURES / "cube_ascii.stl")
    service.analyze(job.id, _selection())

    def fail_render(*args, **kwargs):
        raise RuntimeError("synthetic render failure")

    monkeypatch.setattr(workflow_module, "render_views", fail_render)
    with pytest.raises(RuntimeError, match="render failure"):
        service.recommend(job.id, consent=True)

    persisted = repository.get_job(job.id)
    assert persisted.state is JobState.NEEDS_REVIEW
    assert persisted.report_json is not None
    assert keys.reads == 0
    assert client.calls == []


def test_analysis_error_is_recorded_as_failed_and_original_stl_is_preserved(tmp_path, monkeypatch):
    import bambuprep.workflow.service as workflow_module

    service, repository, _, _ = _service(tmp_path)
    source = tmp_path / "model.stl"
    source.write_bytes((FIXTURES / "cube_ascii.stl").read_bytes())
    original = source.read_bytes()
    job = service.create_job(source)

    def fail_analysis(*args, **kwargs):
        raise RuntimeError("synthetic analysis failure")

    monkeypatch.setattr(workflow_module, "analyze_mesh", fail_analysis)
    with pytest.raises(RuntimeError, match="analysis failure"):
        service.analyze(job.id, _selection())

    assert repository.get_job(job.id).state is JobState.FAILED
    assert source.read_bytes() == original


def test_openai_unavailable_keeps_local_analysis_and_job_state(tmp_path):
    from bambuprep.recommendations.openai_client import RecommendationUnavailableError

    class UnavailableClient(FakeOpenAIClient):
        def create_response(self, *, payload, api_key):
            self.calls.append((payload, api_key))
            raise RecommendationUnavailableError("mocked unavailable")

    client = UnavailableClient()
    service, repository, keys, _ = _service(tmp_path, client=client)
    job = service.create_job(FIXTURES / "cube_ascii.stl")
    service.analyze(job.id, _selection())

    assert service.recommend(job.id, consent=True) is None

    persisted = repository.get_job(job.id)
    assert persisted.state is JobState.NEEDS_REVIEW
    assert persisted.report_json is not None
    assert keys.reads == 1
    assert len(client.calls) == 1


def test_wrong_nozzle_is_rejected_before_starting_analysis(tmp_path):
    service, repository, _, _ = _service(tmp_path)
    job = service.create_job(FIXTURES / "cube_ascii.stl")

    wrong_nozzle = PrinterSelection(
        printer_id="Bambu Lab A1 mini 0.4 nozzle",
        nozzle_mm=0.2,
        filament_id="Generic PLA @BBL A1M 0.2 nozzle",
        plate_id="Textured PEI Plate",
    )
    with pytest.raises(ValueError, match="does not match"):
        service.analyze(job.id, wrong_nozzle)

    assert repository.get_job(job.id).state is JobState.UPLOADED


def test_delete_history_removes_local_records_without_deleting_source_files(tmp_path):
    service, repository, _, _ = _service(tmp_path)
    source = tmp_path / "private-local-model.stl"
    source.write_bytes((FIXTURES / "cube_ascii.stl").read_bytes())
    original = source.read_bytes()
    service.create_job(source)

    removed = service.delete_history()

    assert removed == 1
    assert repository.list_jobs() == []
    assert source.read_bytes() == original
