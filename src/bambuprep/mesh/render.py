"""Local non-interactive PNG views; dense meshes are simplified on a copy only."""

from __future__ import annotations

import io

import matplotlib
matplotlib.use("Agg", force=True)
from matplotlib.backends.backend_agg import FigureCanvasAgg
from matplotlib.collections import PolyCollection
from matplotlib.figure import Figure
import numpy as np
import trimesh

from bambuprep.mesh.analyzer import MeshReport
from bambuprep.mesh.loader import MeshDocument


MAX_RENDER_FACES = 50_000
_VIEW_SPECS = {
    "front": ((0, 2), "Front"),
    "side": ((1, 2), "Side"),
    "top": ((0, 1), "Top"),
    "risk": ((0, 1), "Overhang risk"),
}


class MeshRenderError(RuntimeError):
    """A local PNG view could not be rendered safely."""


def _simplify_visual_copy(mesh: trimesh.Trimesh, face_count: int) -> tuple[trimesh.Trimesh, bool]:
    copy = mesh.copy()
    try:
        simplified = copy.simplify_quadric_decimation(face_count=face_count)
    except Exception as exc:
        raise MeshRenderError(
            "Dense model needs visual simplification, but fast-simplification failed. "
            "Install the supported fast-simplification dependency or use a smaller STL."
        ) from exc
    if not isinstance(simplified, trimesh.Trimesh) or len(simplified.faces) == 0:
        raise MeshRenderError("Visual simplification returned no faces; the original mesh was preserved")
    return simplified, True


def _render_one(mesh: trimesh.Trimesh, report: MeshReport, name: str, simplified: bool) -> bytes:
    axes, title = _VIEW_SPECS[name]
    vertices = np.asarray(mesh.vertices, dtype=np.float64)
    faces = np.asarray(mesh.faces, dtype=np.int64)
    polygons = vertices[faces][:, :, axes]
    figure = Figure(figsize=(5.2, 5.2), dpi=110, facecolor="white")
    canvas = FigureCanvasAgg(figure)
    axis = figure.add_subplot(111)
    _, normals, _ = _face_geometry_for_render(mesh)
    if name == "risk":
        is_overhang = normals[:, 2] <= -float(np.cos(np.deg2rad(45)))
        colors = np.where(is_overhang, "#d95d39", "#9ab7c8")
        axis.set_title(f"{title} — estimated", fontsize=12)
    else:
        colors = "#b7c4ce"
        axis.set_title(title, fontsize=12)
    collection = PolyCollection(polygons, facecolors=colors, edgecolors="#43515c", linewidths=0.18)
    axis.add_collection(collection)
    axis.autoscale_view()
    axis.set_aspect("equal", adjustable="box")
    axis.set_xlabel("mm")
    axis.set_ylabel("mm")
    axis.grid(True, linewidth=0.3, alpha=0.35)
    caption = "Dimensions and measurements use the original STL."
    if simplified:
        caption = "Visual copy simplified; measurements use the original STL."
    figure.subplots_adjust(bottom=0.22, top=0.90)
    figure.text(0.5, 0.025, f"{caption}\nModel SHA-256: {report.sha256[:12]}", ha="center", fontsize=7)
    buffer = io.BytesIO()
    canvas.print_png(buffer)
    figure.clear()
    return buffer.getvalue()


def _face_geometry_for_render(mesh: trimesh.Trimesh) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    vertices = np.asarray(mesh.vertices, dtype=np.float64)
    triangles = vertices[np.asarray(mesh.faces, dtype=np.int64)]
    cross = np.cross(triangles[:, 1] - triangles[:, 0], triangles[:, 2] - triangles[:, 0])
    lengths = np.linalg.norm(cross, axis=1)
    normals = np.zeros_like(cross)
    valid = lengths > 1e-12
    normals[valid] = cross[valid] / lengths[valid, None]
    return lengths * 0.5, normals, triangles.mean(axis=1)


def render_views(document: MeshDocument, report: MeshReport) -> dict[str, bytes]:
    if report.sha256 != document.sha256:
        raise ValueError("Mesh report does not belong to this STL document")
    source = document.mesh
    visual_mesh = source
    simplified = False
    if len(source.faces) > MAX_RENDER_FACES:
        visual_mesh, simplified = _simplify_visual_copy(source, MAX_RENDER_FACES)
    return {
        name: _render_one(visual_mesh, report, name, simplified)
        for name in _VIEW_SPECS
    }
