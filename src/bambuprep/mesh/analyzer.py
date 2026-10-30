"""Deterministic geometry measurements and explicitly heuristic orientations."""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import trimesh

from bambuprep.mesh.loader import DEFAULT_MAX_TRIANGLES, MeshDocument


@dataclass(frozen=True, slots=True)
class OrientationCandidate:
    orientation_id: str
    rotation_deg: tuple[int, int, int]
    support_area_ratio: float
    contact_area_estimate: float
    height_mm: float
    ranking_indicators: dict[str, float]


@dataclass(frozen=True, slots=True)
class MeshReport:
    sha256: str
    dimensions_mm: tuple[float, float, float]
    triangle_count: int
    component_count: int
    volume_mm3: float | None
    watertight: bool
    degenerate_faces: int
    duplicate_faces: int
    scale_warning: str | None
    overhang_area_ratio: float
    contact_area_estimate: float
    orientation_candidates: list[OrientationCandidate]
    warnings: list[str] = field(default_factory=list)


class MeshAnalysisLimitError(ValueError):
    """The model exceeds the configured analysis face limit."""


_ROTATIONS = (
    ("keep", (0, 0, 0), np.eye(3)),
    ("rotate_x_90", (90, 0, 0), np.array([[1, 0, 0], [0, 0, -1], [0, 1, 0]], dtype=float)),
    ("rotate_x_180", (180, 0, 0), np.array([[1, 0, 0], [0, -1, 0], [0, 0, -1]], dtype=float)),
    ("rotate_y_90", (0, 90, 0), np.array([[0, 0, 1], [0, 1, 0], [-1, 0, 0]], dtype=float)),
    ("rotate_y_180", (0, 180, 0), np.array([[-1, 0, 0], [0, 1, 0], [0, 0, -1]], dtype=float)),
    ("rotate_z_90", (0, 0, 90), np.array([[0, -1, 0], [1, 0, 0], [0, 0, 1]], dtype=float)),
)


def orientation_rotation_degrees(orientation_id: str) -> tuple[int, int, int]:
    """Return the deterministic rotation for a measured orientation identifier."""
    for candidate_id, rotation_degrees, _matrix in _ROTATIONS:
        if candidate_id == orientation_id:
            return rotation_degrees
    raise ValueError("Orientation identifier is not a measured local candidate")


def _face_geometry(mesh: trimesh.Trimesh) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    triangles = np.asarray(mesh.vertices, dtype=np.float64)[np.asarray(mesh.faces, dtype=np.int64)]
    cross = np.cross(triangles[:, 1] - triangles[:, 0], triangles[:, 2] - triangles[:, 0])
    double_area = np.linalg.norm(cross, axis=1)
    normals = np.zeros_like(cross)
    valid = double_area > 1e-12
    normals[valid] = cross[valid] / double_area[valid, None]
    return double_area * 0.5, normals, triangles.mean(axis=1)


def _topology_copy(mesh: trimesh.Trimesh) -> trimesh.Trimesh:
    copy = mesh.copy()
    maximum_coordinate = float(np.max(np.abs(copy.vertices)))
    if maximum_coordinate == 0:
        digits_vertex = 8
    else:
        precision_headroom = np.iinfo(np.int64).max / (4 * maximum_coordinate)
        digits_vertex = max(0, min(8, int(np.floor(np.log10(precision_headroom)))))
    copy.merge_vertices(digits_vertex=digits_vertex)
    return copy


def _rotation_candidate(
    mesh: trimesh.Trimesh,
    orientation_id: str,
    rotation_deg: tuple[int, int, int],
    rotation: np.ndarray,
    nozzle_mm: float,
) -> OrientationCandidate:
    vertices = np.asarray(mesh.vertices, dtype=np.float64) @ rotation.T
    vertices -= vertices.min(axis=0)
    faces = np.asarray(mesh.faces, dtype=np.int64)
    triangles = vertices[faces]
    cross = np.cross(triangles[:, 1] - triangles[:, 0], triangles[:, 2] - triangles[:, 0])
    double_area = np.linalg.norm(cross, axis=1)
    areas = double_area * 0.5
    normals = np.zeros_like(cross)
    valid = double_area > 1e-12
    normals[valid] = cross[valid] / double_area[valid, None]
    centers = triangles.mean(axis=1)
    total_area = float(areas.sum())
    downward = normals[:, 2] <= -float(np.cos(np.deg2rad(45)))
    support_area = float(areas[downward].sum())
    support_ratio = support_area / total_area if total_area else 0.0
    bottom_tolerance = max(0.05, nozzle_mm * 0.5)
    at_bed = centers[:, 2] <= bottom_tolerance
    contact = float(np.sum(areas[at_bed] * np.abs(normals[at_bed, 2])))
    height = float(vertices[:, 2].max() - vertices[:, 2].min())
    return OrientationCandidate(
        orientation_id=orientation_id,
        rotation_deg=rotation_deg,
        support_area_ratio=support_ratio,
        contact_area_estimate=contact,
        height_mm=height,
        ranking_indicators={
            "lower_support_area_ratio_is_better": support_ratio,
            "higher_contact_area_is_better": contact,
            "lower_height_is_better": height,
        },
    )


def analyze_mesh(
    document: MeshDocument,
    nozzle_mm: float,
    *,
    max_triangles: int = DEFAULT_MAX_TRIANGLES,
) -> MeshReport:
    if nozzle_mm not in (0.2, 0.4):
        raise ValueError("nozzle_mm must be 0.2 or 0.4")
    if max_triangles <= 0:
        raise ValueError("max_triangles must be greater than zero")
    mesh = document.mesh
    triangle_count = len(mesh.faces)
    if triangle_count > max_triangles:
        raise MeshAnalysisLimitError(
            f"STL has {triangle_count:,} faces; the configured analysis limit is {max_triangles:,}. "
            "Use a smaller model or raise the local analysis limit."
        )
    if not triangle_count:
        raise ValueError("Mesh has no triangle faces")
    maximum_coordinate = float(np.max(np.abs(mesh.vertices)))
    if not np.isfinite(maximum_coordinate) or maximum_coordinate > np.iinfo(np.int64).max / 4:
        raise MeshAnalysisLimitError(
            "Model coordinates exceed the safe numeric range. Confirm STL units or use a smaller-scale model."
        )

    dimensions = np.asarray(mesh.bounds[1] - mesh.bounds[0], dtype=np.float64)
    if not np.isfinite(dimensions).all():
        raise MeshAnalysisLimitError(
            "Model bounds exceed the safe numeric range. Confirm STL units before analysis."
        )
    dimensions_tuple = tuple(float(value) for value in dimensions)
    topology = _topology_copy(mesh)
    try:
        components = topology.split(only_watertight=False)
        component_count = len(components)
        watertight = bool(topology.is_watertight)
        winding_consistent = bool(topology.is_winding_consistent)
        valid_volume = bool(topology.is_volume)
    except Exception:
        component_count = 1
        watertight = False
        winding_consistent = False
        valid_volume = False

    areas, normals, _ = _face_geometry(mesh)
    degenerate = int(np.count_nonzero(areas <= 1e-12))
    face_coordinates = np.asarray(mesh.vertices, dtype=np.float64)[np.asarray(mesh.faces, dtype=np.int64)]
    if maximum_coordinate <= np.iinfo(np.int64).max / 1_000_000:
        quantized_triangles = np.rint(face_coordinates * 1_000_000).astype(np.int64)
    else:
        # At extreme scales, preserve exact coordinate equality instead of overflowing quantization.
        quantized_triangles = face_coordinates
    order = np.lexsort(
        (quantized_triangles[:, :, 2], quantized_triangles[:, :, 1], quantized_triangles[:, :, 0]),
        axis=1,
    )
    canonical_faces = np.take_along_axis(quantized_triangles, order[:, :, None], axis=1).reshape(triangle_count, 9)
    unique_face_count = np.unique(canonical_faces, axis=0).shape[0]
    duplicate_faces = triangle_count - int(unique_face_count)
    total_area = float(areas.sum())
    downward = normals[:, 2] <= -float(np.cos(np.deg2rad(45)))
    overhang_area_ratio = float(areas[downward].sum() / total_area) if total_area else 0.0
    centers = np.asarray(mesh.vertices, dtype=np.float64)[np.asarray(mesh.faces, dtype=np.int64)].mean(axis=1)
    minimum_z = float(np.min(mesh.vertices[:, 2]))
    at_bed = (centers[:, 2] <= minimum_z + 0.1) & (normals[:, 2] < -0.5)
    contact_area = float(np.sum(areas[at_bed] * np.abs(normals[at_bed, 2])))
    volume = abs(float(topology.volume)) if valid_volume else None

    scale_messages: list[str] = []
    maximum = float(dimensions.max())
    minimum = float(dimensions.min())
    if minimum <= 1e-9:
        scale_messages.append("One or more model dimensions are zero; confirm the geometry before printing.")
    if maximum <= 1.0:
        scale_messages.append("All model dimensions are at or below 1 mm; STL units are ambiguous. Confirm scale before printing.")
    elif maximum > 180.0:
        scale_messages.append("Model exceeds the A1 mini's 180 mm build dimension; confirm scale or orientation.")
    scale_warning = " ".join(scale_messages) or None

    warnings: list[str] = ["Support and contact values are estimates; orientation heuristics do not guarantee print success."]
    if not watertight:
        warnings.append("Mesh is open or non-manifold; volume is not reported and the model needs review.")
    if watertight and not winding_consistent:
        warnings.append("Mesh has inconsistent face winding; volume is not reported and the model needs review.")
    if component_count > 1:
        warnings.append(f"Mesh contains {component_count} disconnected components.")
    if degenerate:
        warnings.append(f"Mesh contains {degenerate} degenerate triangle faces.")
    if duplicate_faces:
        warnings.append(f"Mesh contains {duplicate_faces} duplicate triangle faces.")
    if scale_warning:
        warnings.append(scale_warning)

    candidates = [
        _rotation_candidate(mesh, name, degrees, matrix, nozzle_mm)
        for name, degrees, matrix in _ROTATIONS
    ]
    candidates.sort(
        key=lambda candidate: (
            candidate.support_area_ratio,
            -candidate.contact_area_estimate,
            candidate.height_mm,
            candidate.orientation_id,
        )
    )
    return MeshReport(
        sha256=document.sha256,
        dimensions_mm=dimensions_tuple,
        triangle_count=triangle_count,
        component_count=component_count,
        volume_mm3=volume,
        watertight=watertight,
        degenerate_faces=degenerate,
        duplicate_faces=duplicate_faces,
        scale_warning=scale_warning,
        overhang_area_ratio=overhang_area_ratio,
        contact_area_estimate=contact_area,
        orientation_candidates=candidates,
        warnings=warnings,
    )
