"""Closed output schema and profile choices for AI recommendations."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from bambuprep.mesh.analyzer import MeshReport


@dataclass(frozen=True, slots=True)
class Recommendation:
    orientation_id: str
    support_enabled: bool
    support_option: str | None
    adhesion_option: str
    confidence: float
    rationale: list[str]
    evidence_refs: list[str]


def _unique_profile_values(name: str, values: Iterable[str]) -> tuple[str, ...]:
    result = tuple(values)
    if not result:
        raise ValueError(f"{name} must contain at least one installed profile option")
    for value in result:
        if (
            not isinstance(value, str)
            or not value.strip()
            or len(value) > 128
            or any(char in value for char in "/\\:")
            or any(ord(char) < 32 for char in value)
        ):
            raise ValueError(f"{name} contains an invalid profile identifier")
    if len(set(result)) != len(result):
        raise ValueError(f"{name} contains duplicate profile identifiers")
    return result


@dataclass(frozen=True, slots=True)
class RecommendationProfileOptions:
    """Allowlisted choices read from the installed Studio profile catalog."""

    printer_ids: tuple[str, ...]
    filament_ids: tuple[str, ...]
    plate_ids: tuple[str, ...]
    support_options: tuple[str, ...]
    adhesion_options: tuple[str, ...]

    def __post_init__(self) -> None:
        for field_name in (
            "printer_ids",
            "filament_ids",
            "plate_ids",
            "support_options",
            "adhesion_options",
        ):
            object.__setattr__(self, field_name, _unique_profile_values(field_name, getattr(self, field_name)))


def evidence_reference_ids(report: MeshReport, image_ids: Iterable[str]) -> tuple[str, ...]:
    references = [
        "mesh:dimensions_mm",
        "mesh:triangle_count",
        "mesh:component_count",
        "mesh:watertight",
        "mesh:degenerate_faces",
        "mesh:duplicate_faces",
        "mesh:scale_warning_present",
        "mesh:overhang_area_ratio",
        "mesh:contact_area_estimate",
    ]
    if report.volume_mm3 is not None:
        references.append("mesh:volume_mm3")
    for candidate in report.orientation_candidates:
        prefix = f"orientation:{candidate.orientation_id}"
        references.extend(
            (
                f"{prefix}:support_area_ratio",
                f"{prefix}:contact_area_estimate",
                f"{prefix}:height_mm",
            )
        )
    references.extend(f"view:{name}" for name in sorted(set(image_ids)))
    return tuple(references)


def build_recommendation_schema(
    report: MeshReport,
    profile_options: RecommendationProfileOptions,
    *,
    image_ids: Iterable[str],
) -> dict[str, object]:
    """Build the strict subset schema from measured orientations and installed profiles."""

    orientation_ids = [candidate.orientation_id for candidate in report.orientation_candidates]
    if not orientation_ids or len(set(orientation_ids)) != len(orientation_ids):
        raise ValueError("Report must have unique measured orientation candidates")
    evidence_ids = list(evidence_reference_ids(report, image_ids))
    if not evidence_ids:
        raise ValueError("At least one evidence reference is required")

    return {
        "type": "object",
        "properties": {
            "orientation_id": {"type": "string", "enum": orientation_ids},
            "support_enabled": {"type": "boolean"},
            "support_option": {
                "type": ["string", "null"],
                "enum": [*profile_options.support_options, None],
            },
            "adhesion_option": {"type": "string", "enum": list(profile_options.adhesion_options)},
            "confidence": {"type": "number"},
            "rationale": {"type": "array", "items": {"type": "string"}},
            "evidence_refs": {
                "type": "array",
                "items": {"type": "string", "enum": evidence_ids},
            },
        },
        "required": [
            "orientation_id",
            "support_enabled",
            "support_option",
            "adhesion_option",
            "confidence",
            "rationale",
            "evidence_refs",
        ],
        "additionalProperties": False,
    }
