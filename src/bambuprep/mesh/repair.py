"""Audited, opt-in repairs that always write a separate STL copy."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path

import trimesh

from bambuprep.mesh.loader import MeshDocument


_ALLOWED_OPERATIONS = frozenset({"fix_normals", "fill_holes"})


@dataclass(frozen=True, slots=True)
class RepairAudit:
    destination: Path
    operation: str
    tool_version: str
    input_sha256: str
    output_sha256: str
    input_dimensions_mm: tuple[float, float, float]
    output_dimensions_mm: tuple[float, float, float]
    input_triangle_count: int
    output_triangle_count: int


def _dimensions(mesh: trimesh.Trimesh) -> tuple[float, float, float]:
    return tuple(float(value) for value in mesh.extents)


def repair_copy(document: MeshDocument, destination: Path, operation: str) -> RepairAudit:
    destination = Path(destination)
    if operation not in _ALLOWED_OPERATIONS:
        raise ValueError(f"Unknown repair operation: {operation}")
    if destination.resolve() == document.path.resolve():
        raise ValueError("Repair destination must be a separate file from the source STL")
    if destination.exists():
        raise FileExistsError(f"Repair destination already exists: {destination}")

    repaired = document.mesh.copy()
    repaired.merge_vertices(digits_vertex=8)
    if operation == "fix_normals":
        trimesh.repair.fix_normals(repaired, multibody=True)
    else:
        trimesh.repair.fill_holes(repaired)
    output = repaired.export(file_type="stl")
    if not isinstance(output, bytes) or not output:
        raise RuntimeError("Repair did not produce a valid STL byte stream")

    destination.parent.mkdir(parents=True, exist_ok=True)
    created_by_this_operation = False
    try:
        stream = destination.open("xb")
        created_by_this_operation = True
        with stream:
            stream.write(output)
    except Exception:
        if created_by_this_operation:
            destination.unlink(missing_ok=True)
        raise

    return RepairAudit(
        destination=destination,
        operation=operation,
        tool_version=trimesh.__version__,
        input_sha256=document.sha256,
        output_sha256=hashlib.sha256(output).hexdigest(),
        input_dimensions_mm=_dimensions(document.mesh),
        output_dimensions_mm=_dimensions(repaired),
        input_triangle_count=len(document.mesh.faces),
        output_triangle_count=len(repaired.faces),
    )
