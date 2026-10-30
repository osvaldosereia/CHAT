"""Local validation for constrained model responses; profile files remain authoritative."""

from __future__ import annotations

import math
from typing import Any, Mapping, Sequence

from bambuprep.mesh.analyzer import MeshReport
from bambuprep.recommendations.schema import (
    Recommendation,
    RecommendationProfileOptions,
    evidence_reference_ids,
)


class RecommendationValidationError(ValueError):
    """A response contains a field or choice that local code cannot safely apply."""


_FIELDS = frozenset(
    {
        "orientation_id",
        "support_enabled",
        "support_option",
        "adhesion_option",
        "confidence",
        "rationale",
        "evidence_refs",
    }
)


def validate_recommendation(
    raw: Any,
    report: MeshReport,
    profile_options: RecommendationProfileOptions,
    *,
    image_ids: Sequence[str],
) -> Recommendation:
    """Reject unknown, unmeasured, uninstalled, or ill-typed model choices."""

    if not isinstance(raw, Mapping) or set(raw) != _FIELDS:
        raise RecommendationValidationError("Recommendation fields do not match the allowed schema")

    orientation_id = raw["orientation_id"]
    known_orientations = {candidate.orientation_id for candidate in report.orientation_candidates}
    if not isinstance(orientation_id, str) or orientation_id not in known_orientations:
        raise RecommendationValidationError("Recommendation selected an orientation that was not measured")

    support_enabled = raw["support_enabled"]
    if type(support_enabled) is not bool:
        raise RecommendationValidationError("support_enabled must be a boolean")
    support_option = raw["support_option"]
    if support_enabled:
        if not isinstance(support_option, str) or support_option not in profile_options.support_options:
            raise RecommendationValidationError("Enabled support must use an installed profile option")
    elif support_option is not None:
        raise RecommendationValidationError("Disabled support must not include a support option")

    adhesion_option = raw["adhesion_option"]
    if not isinstance(adhesion_option, str) or adhesion_option not in profile_options.adhesion_options:
        raise RecommendationValidationError("Adhesion choice is not present in the installed profile options")

    confidence = raw["confidence"]
    if isinstance(confidence, bool) or not isinstance(confidence, (int, float)):
        raise RecommendationValidationError("confidence must be a number between 0 and 1")
    confidence = float(confidence)
    if not math.isfinite(confidence) or not 0.0 <= confidence <= 1.0:
        raise RecommendationValidationError("confidence must be a number between 0 and 1")

    rationale = raw["rationale"]
    if (
        not isinstance(rationale, list)
        or not 1 <= len(rationale) <= 5
        or any(not isinstance(item, str) or not item.strip() or len(item) > 500 for item in rationale)
    ):
        raise RecommendationValidationError("rationale must contain 1 to 5 short explanations")

    evidence_refs = raw["evidence_refs"]
    if (
        not isinstance(evidence_refs, list)
        or not 1 <= len(evidence_refs) <= 8
        or any(not isinstance(item, str) for item in evidence_refs)
        or len(set(evidence_refs)) != len(evidence_refs)
    ):
        raise RecommendationValidationError("evidence_refs must contain unique known references")
    known_evidence = set(evidence_reference_ids(report, image_ids))
    if not set(evidence_refs).issubset(known_evidence):
        raise RecommendationValidationError("Recommendation cites evidence that was not supplied")

    return Recommendation(
        orientation_id=orientation_id,
        support_enabled=support_enabled,
        support_option=support_option,
        adhesion_option=adhesion_option,
        confidence=confidence,
        rationale=list(rationale),
        evidence_refs=list(evidence_refs),
    )
