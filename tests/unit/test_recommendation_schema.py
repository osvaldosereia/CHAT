from pathlib import Path

import pytest

from bambuprep.mesh.analyzer import analyze_mesh
from bambuprep.mesh.loader import load_stl
from bambuprep.recommendations.schema import (
    RecommendationProfileOptions,
    build_recommendation_schema,
)


FIXTURES = Path(__file__).parents[1] / "fixtures"


def profile_options():
    return RecommendationProfileOptions(
        printer_ids=("Bambu Lab A1 mini",),
        filament_ids=("Generic PLA",),
        plate_ids=("Bambu Textured PEI Plate",),
        support_options=("normal", "tree(auto)"),
        adhesion_options=("none", "brim"),
    )


def test_json_schema_limits_orientation_and_profile_choices_to_local_catalog():
    report = analyze_mesh(load_stl(FIXTURES / "cube_ascii.stl"), nozzle_mm=0.4)

    schema = build_recommendation_schema(report, profile_options(), image_ids=("front", "side", "top", "risk"))

    properties = schema["properties"]
    assert schema["additionalProperties"] is False
    assert set(schema["required"]) == set(properties)
    assert properties["orientation_id"]["enum"] == [item.orientation_id for item in report.orientation_candidates]
    assert properties["support_option"]["enum"] == ["normal", "tree(auto)", None]
    assert properties["adhesion_option"]["enum"] == ["none", "brim"]
    assert "mesh:dimensions_mm" in properties["evidence_refs"]["items"]["enum"]
    assert "view:front" in properties["evidence_refs"]["items"]["enum"]


def test_profile_options_reject_paths_and_empty_choices():
    with pytest.raises(ValueError, match="profile"):
        RecommendationProfileOptions(
            printer_ids=("C:\\Users\\private\\profile.json",),
            filament_ids=("Generic PLA",),
            plate_ids=("Bambu Textured PEI Plate",),
            support_options=("normal",),
            adhesion_options=("brim",),
        )


def test_profile_options_do_not_treat_a_single_string_as_a_sequence_of_ids():
    with pytest.raises(ValueError):
        RecommendationProfileOptions(
            printer_ids="Bambu Lab A1 mini",
            filament_ids=("Generic PLA",),
            plate_ids=("Bambu Textured PEI Plate",),
            support_options=("normal",),
            adhesion_options=("brim",),
        )

    with pytest.raises(ValueError, match="support_options"):
        RecommendationProfileOptions(
            printer_ids=("Bambu Lab A1 mini",),
            filament_ids=("Generic PLA",),
            plate_ids=("Bambu Textured PEI Plate",),
            support_options=(),
            adhesion_options=("brim",),
        )
