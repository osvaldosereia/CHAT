import json
from pathlib import Path

import pytest

from bambuprep.domain.models import PrinterSelection
from bambuprep.mesh.analyzer import analyze_mesh
from bambuprep.mesh.loader import load_stl
from bambuprep.mesh.render import render_views
from bambuprep.recommendations.openai_client import (
    CONSENT_NOTICE,
    ConsentRequiredError,
    RecommendationUnavailableError,
    ResponsesAPIClient,
    request_recommendation,
)
from bambuprep.recommendations.schema import RecommendationProfileOptions


FIXTURES = Path(__file__).parents[1] / "fixtures"
PRIVATE_NAME = "private-model-name-7f31.stl"
PRIVATE_KEY = "sk-local-test-secret-never-send"


class SpyKeyStore:
    def __init__(self, key=PRIVATE_KEY):
        self.key = key
        self.reads = 0

    def get(self):
        self.reads += 1
        return self.key


class FakeOpenAIClient:
    def __init__(self, response=None, error=None):
        self.response = response
        self.error = error
        self.calls = []

    def create_response(self, *, payload, api_key):
        self.calls.append((payload, api_key))
        if self.error:
            raise self.error
        return self.response


def sample_report():
    document = load_stl(FIXTURES / "cube_ascii.stl")
    report = analyze_mesh(document, nozzle_mm=0.4)
    return document, report


def sample_options():
    return RecommendationProfileOptions(
        printer_ids=("Bambu Lab A1 mini",),
        filament_ids=("Generic PLA",),
        plate_ids=("Bambu Textured PEI Plate",),
        support_options=("normal", "tree(auto)"),
        adhesion_options=("none", "brim"),
    )


def selection():
    return PrinterSelection("Bambu Lab A1 mini", 0.4, "Generic PLA", "Bambu Textured PEI Plate")


def response_for(report):
    recommendation = {
        "orientation_id": report.orientation_candidates[0].orientation_id,
        "support_enabled": False,
        "support_option": None,
        "adhesion_option": "brim",
        "confidence": 0.75,
        "rationale": ["The measured contact estimate is favorable."],
        "evidence_refs": ["mesh:contact_area_estimate", "view:front"],
    }
    return {
        "status": "completed",
        "output": [{"type": "message", "content": [{"type": "output_text", "text": json.dumps(recommendation)}]}],
    }


def test_without_per_job_consent_neither_reads_key_nor_calls_client():
    document, report = sample_report()
    key_store = SpyKeyStore()
    client = FakeOpenAIClient(response=response_for(report))

    with pytest.raises(ConsentRequiredError):
        request_recommendation(
            report,
            {name: b"\x89PNG\r\n\x1a\nmock" for name in ("front", "side", "top", "risk")},
            selection(),
            consent=False,
            key_store=key_store,
            client=client,
            profile_options=sample_options(),
        )

    assert key_store.reads == 0
    assert client.calls == []
    assert document.path.exists()


def test_payload_contains_only_derived_metrics_and_rendered_images_not_private_file_or_key(tmp_path):
    source = FIXTURES / "cube_ascii.stl"
    private_path = tmp_path / PRIVATE_NAME
    private_path.write_bytes(source.read_bytes())
    document = load_stl(private_path)
    report = analyze_mesh(document, nozzle_mm=0.4)
    key_store = SpyKeyStore()
    client = FakeOpenAIClient(response=response_for(report))
    views = render_views(document, report)
    source_bytes = document.path.read_bytes()

    result = request_recommendation(
        report,
        views,
        selection(),
        consent=True,
        key_store=key_store,
        client=client,
        profile_options=sample_options(),
    )

    assert result.orientation_id == report.orientation_candidates[0].orientation_id
    assert key_store.reads == 1
    assert len(client.calls) == 1
    payload, api_key = client.calls[0]
    serialized = json.dumps(payload, sort_keys=True).encode("utf-8")
    assert api_key == PRIVATE_KEY
    assert PRIVATE_NAME.encode() not in serialized
    assert str(private_path).encode() not in serialized
    assert PRIVATE_KEY.encode() not in serialized
    assert report.sha256.encode() not in serialized
    assert source_bytes not in serialized
    assert payload["store"] is False
    assert payload["model"] == "gpt-6-luna"
    assert payload["text"]["format"]["type"] == "json_schema"
    image_urls = [
        part["image_url"]
        for item in payload["input"]
        if isinstance(item.get("content"), list)
        for part in item["content"]
        if part.get("type") == "input_image"
    ]
    assert len(image_urls) == 4
    assert all(url.startswith("data:image/png;base64,") for url in image_urls)


def test_missing_key_fails_before_request():
    _, report = sample_report()
    key_store = SpyKeyStore(key=None)
    client = FakeOpenAIClient(response=response_for(report))

    with pytest.raises(RecommendationUnavailableError, match="chave OpenAI"):
        request_recommendation(
            report,
            {name: b"\x89PNG\r\n\x1a\nmock" for name in ("front", "side", "top", "risk")},
            selection(),
            consent=True,
            key_store=key_store,
            client=client,
            profile_options=sample_options(),
        )

    assert key_store.reads == 1
    assert client.calls == []


def test_network_failure_is_sanitized_and_local_analysis_remains_available():
    _, report = sample_report()
    key_store = SpyKeyStore()
    client = FakeOpenAIClient(error=OSError(f"failed with {PRIVATE_KEY}"))

    with pytest.raises(RecommendationUnavailableError) as error:
        request_recommendation(
            report,
            {name: b"\x89PNG\r\n\x1a\nmock" for name in ("front", "side", "top", "risk")},
            selection(),
            consent=True,
            key_store=key_store,
            client=client,
            profile_options=sample_options(),
        )

    assert PRIVATE_KEY not in str(error.value)
    assert report.triangle_count == 12


@pytest.mark.parametrize(
    "response",
    [
        {"status": "incomplete", "output": []},
        {"status": "completed", "output": [{"type": "message", "content": [{"type": "refusal", "refusal": "no"}]}]},
        {"status": "completed", "output": [{"type": "message", "content": [{"type": "output_text", "text": "not JSON"}]}]},
    ],
)
def test_incomplete_refused_or_invalid_json_response_is_unavailable(response):
    _, report = sample_report()
    client = FakeOpenAIClient(response=response)

    with pytest.raises(RecommendationUnavailableError):
        request_recommendation(
            report,
            {name: b"\x89PNG\r\n\x1a\nmock" for name in ("front", "side", "top", "risk")},
            selection(),
            consent=True,
            key_store=SpyKeyStore(),
            client=client,
            profile_options=sample_options(),
        )


def test_profile_incompatibility_and_invalid_image_set_fail_before_network():
    _, report = sample_report()
    key_store = SpyKeyStore()
    client = FakeOpenAIClient(response=response_for(report))
    with pytest.raises(ValueError, match="installed profile"):
        request_recommendation(
            report,
            {name: b"\x89PNG\r\n\x1a\nmock" for name in ("front", "side", "top", "risk")},
            selection(),
            consent=True,
            key_store=key_store,
            client=client,
            profile_options=RecommendationProfileOptions(
                printer_ids=("Bambu Lab A1 mini",),
                filament_ids=("Generic PLA",),
                plate_ids=("Smooth PEI",),
                support_options=("normal",),
                adhesion_options=("brim",),
            ),
        )
    assert key_store.reads == 0
    assert client.calls == []

    with pytest.raises(ValueError, match="four rendered views"):
        request_recommendation(
            report,
            {"front": b"\x89PNG\r\n\x1a\nmock"},
            selection(),
            consent=True,
            key_store=key_store,
            client=client,
            profile_options=sample_options(),
        )
    assert client.calls == []


def test_responses_api_client_uses_structured_post_and_bounded_timeout(monkeypatch):
    request_seen = {}

    class FakeHTTPResponse:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def read(self, limit):
            return b'{"status":"completed","output":[]}'

    def fake_urlopen(request, timeout):
        request_seen["request"] = request
        request_seen["timeout"] = timeout
        return FakeHTTPResponse()

    monkeypatch.setattr("bambuprep.recommendations.openai_client.urlopen", fake_urlopen)
    client = ResponsesAPIClient(model="gpt-4.1-mini", timeout_seconds=9)

    result = client.create_response(payload={"model": "gpt-4.1-mini", "store": False}, api_key=PRIVATE_KEY)

    request = request_seen["request"]
    assert request.full_url == "https://api.openai.com/v1/responses"
    assert request.get_header("Authorization") == f"Bearer {PRIVATE_KEY}"
    assert request.get_header("Content-type") == "application/json"
    assert request.data == b'{"model":"gpt-4.1-mini","store":false}'
    assert request_seen["timeout"] == 9
    assert json.loads(request.data)["model"] == "gpt-4.1-mini"
    assert result["status"] == "completed"


def test_consent_copy_explains_rendered_views_authentication_and_separate_api_billing():
    notice = CONSENT_NOTICE.lower()

    assert "openai" in notice
    assert "imagens renderizadas" in notice
    assert "cabeçalho de autenticação" in notice
    assert "cobrado separadamente do chatgpt plus" in notice
