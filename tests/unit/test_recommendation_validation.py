from pathlib import Path

import pytest

from bambuprep.mesh.analyzer import analyze_mesh
from bambuprep.mesh.loader import load_stl
from bambuprep.recommendations.schema import RecommendationProfileOptions
from bambuprep.recommendations.validator import (
    RecommendationValidationError,
    validate_recommendation,
)


FIXTURES = Path(__file__).parents[1] / "fixtures"


@pytest.fixture
def report():
    return analyze_mesh(load_stl(FIXTURES / "cube_ascii.stl"), nozzle_mm=0.4)


@pytest.fixture
def options():
    return RecommendationProfileOptions(
        printer_ids=("Bambu Lab A1 mini",),
        filament_ids=("Generic PLA",),
        plate_ids=("Bambu Textured PEI Plate",),
        support_options=("normal", "tree(auto)"),
        adhesion_options=("none", "brim"),
    )


def payload(report):
    return {
        "orientation_id": report.orientation_candidates[0].orientation_id,
        "support_enabled": False,
        "support_option": None,
        "adhesion_option": "brim",
        "confidence": 0.75,
        "rationale": ["The contact measurement supports this option."],
        "evidence_refs": ["mesh:contact_area_estimate", "view:front"],
    }


def test_valid_recommendation_is_typed_and_copied(report, options):
    raw = payload(report)

    result = validate_recommendation(raw, report, options, image_ids=("front", "side", "top", "risk"))

    assert result.orientation_id == raw["orientation_id"]
    assert result.support_enabled is False
    assert result.support_option is None
    assert result.adhesion_option == "brim"
    assert result.confidence == 0.75
    assert result.rationale == raw["rationale"]
    assert result.rationale is not raw["rationale"]


@pytest.mark.parametrize(
    "change",
    [
        lambda value: value.update(unexpected="execute something"),
        lambda value: value.update(orientation_id="orientation-not-measured"),
        lambda value: value.update(support_enabled=True, support_option="unsupported"),
        lambda value: value.update(support_enabled=True, support_option=None),
        lambda value: value.update(adhesion_option="uninstalled-profile"),
        lambda value: value.update(confidence=1.01),
        lambda value: value.update(confidence=True),
        lambda value: value.update(evidence_refs=["local-path:/Users/private/model.stl"]),
        lambda value: value.update(rationale=[""]),
        lambda value: value.update(rationale="not a list"),
    ],
)
def test_invalid_response_fields_and_incompatible_options_are_rejected(report, options, change):
    invalid = payload(report)
    change(invalid)

    with pytest.raises(RecommendationValidationError):
        validate_recommendation(invalid, report, options, image_ids=("front", "side", "top", "risk"))


def test_disabled_support_cannot_smuggle_an_option(report, options):
    invalid = payload(report)
    invalid["support_option"] = "normal"

    with pytest.raises(RecommendationValidationError, match="Disabled support"):
        validate_recommendation(invalid, report, options, image_ids=("front", "side", "top", "risk"))


def test_invalid_reference_to_missing_rendered_view_is_rejected(report, options):
    invalid = payload(report)
    invalid["evidence_refs"] = ["view:side"]

    with pytest.raises(RecommendationValidationError, match="evidence"):
        validate_recommendation(invalid, report, options, image_ids=("front",))
