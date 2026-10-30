from pathlib import Path

from bambuprep.mesh.analyzer import analyze_mesh
from bambuprep.mesh.loader import load_stl
from bambuprep.mesh.render import render_views

FIXTURES = Path(__file__).parents[1] / "fixtures"
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def test_four_png_views_are_nonempty_and_bound_to_the_report_hash():
    document = load_stl(FIXTURES / "cube_ascii.stl")
    report = analyze_mesh(document, nozzle_mm=0.4)

    views = render_views(document, report)

    assert set(views) == {"front", "side", "top", "risk"}
    for image in views.values():
        assert image.startswith(PNG_SIGNATURE)
        assert len(image) > 500
    assert report.sha256 == document.sha256


def test_high_face_render_uses_only_visual_copy_and_labels_simplification(monkeypatch):
    import bambuprep.mesh.render as render_module

    document = load_stl(FIXTURES / "cube_ascii.stl")
    report = analyze_mesh(document, nozzle_mm=0.4)
    original_faces = document.mesh.faces.copy()
    monkeypatch.setattr(render_module, "MAX_RENDER_FACES", 4)
    monkeypatch.setattr(render_module, "_simplify_visual_copy", lambda mesh, count: (mesh.copy(), True))
    captions = []
    monkeypatch.setattr(
        render_module,
        "_render_one",
        lambda mesh, report, name, simplified: captions.append(simplified) or PNG_SIGNATURE + b"test",
    )

    views = render_views(document, report)

    assert len(views) == 4
    assert captions == [True] * 4
    assert document.mesh.faces.tolist() == original_faces.tolist()
    assert report.triangle_count == 12


def test_real_fast_simplification_reduces_only_the_visual_copy():
    import trimesh
    from bambuprep.mesh.render import _simplify_visual_copy

    mesh = trimesh.creation.icosphere(subdivisions=4)
    original_vertices = mesh.vertices.copy()
    original_faces = mesh.faces.copy()

    visual_copy, simplified = _simplify_visual_copy(mesh, 500)

    assert simplified is True
    assert len(visual_copy.faces) <= 500
    assert len(mesh.faces) == 5120
    assert mesh.vertices.tolist() == original_vertices.tolist()
    assert mesh.faces.tolist() == original_faces.tolist()


def test_measurement_footer_has_clear_space_below_plot(monkeypatch):
    from matplotlib.backends.backend_agg import FigureCanvasAgg

    document = load_stl(FIXTURES / "cube_ascii.stl")
    report = analyze_mesh(document, nozzle_mm=0.4)
    original_print_png = FigureCanvasAgg.print_png
    axes_bottoms = []

    def record_layout(canvas, output, *args, **kwargs):
        axes_bottoms.append(canvas.figure.axes[0].get_position().y0)
        return original_print_png(canvas, output, *args, **kwargs)

    monkeypatch.setattr(FigureCanvasAgg, "print_png", record_layout)
    render_views(document, report)

    assert axes_bottoms and min(axes_bottoms) >= 0.18
