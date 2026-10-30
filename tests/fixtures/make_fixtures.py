"""Generate tiny synthetic STL fixtures only; never use a user model here."""
from pathlib import Path
import struct

ROOT = Path(__file__).parent
V = [
    (0, 0, 0), (2, 0, 0), (2, 2, 0), (0, 2, 0),
    (0, 0, 2), (2, 0, 2), (2, 2, 2), (0, 2, 2),
]
F = [
    (0, 2, 1), (0, 3, 2), (4, 5, 6), (4, 6, 7),
    (0, 1, 5), (0, 5, 4), (1, 2, 6), (1, 6, 5),
    (2, 3, 7), (2, 7, 6), (3, 0, 4), (3, 4, 7),
]


def triangles(vertices, faces):
    return [[vertices[index] for index in face] for face in faces]


def write_ascii(path, tris, title):
    lines = [f"solid {title}"]
    for tri in tris:
        lines += ["  facet normal 0 0 0", "    outer loop"]
        lines += [f"      vertex {x:g} {y:g} {z:g}" for x, y, z in tri]
        lines += ["    endloop", "  endfacet"]
    lines += [f"endsolid {title}"]
    path.write_text("\n".join(lines) + "\n", encoding="ascii")


def write_binary(path, tris):
    data = bytearray(b"BambuPrep synthetic test fixture".ljust(80, b" "))
    data += struct.pack("<I", len(tris))
    for tri in tris:
        values = [0.0, 0.0, 0.0]
        for vertex in tri:
            values.extend(vertex)
        data += struct.pack("<12fH", *values, 0)
    path.write_bytes(data)


cube = triangles(V, F)
write_ascii(ROOT / "cube_ascii.stl", cube, "synthetic_cube")
inconsistent = list(cube)
inconsistent[0] = tuple(reversed(inconsistent[0]))
write_ascii(ROOT / "cube_inconsistent.stl", inconsistent, "synthetic_inconsistent_cube")
write_binary(ROOT / "cube_binary.stl", cube)
write_ascii(ROOT / "cube_open.stl", cube[1:], "synthetic_open_cube")

second_vertices = [(x + 5, y, z) for x, y, z in V]
write_ascii(ROOT / "cube_multi.stl", cube + triangles(second_vertices, F), "synthetic_two_cubes")
write_ascii(ROOT / "degenerate.stl", cube + [[(0, 0, 0)] * 3], "synthetic_degenerate")
write_ascii(ROOT / "duplicate.stl", cube + [cube[0]], "synthetic_duplicate")
flat_vertices = [(x, y, 0) for x, y, _ in V]
write_ascii(ROOT / "cube_flat.stl", triangles(flat_vertices, F), "synthetic_flat_cube")
small_vertices = [(x * 0.01, y * 0.01, z * 0.01) for x, y, z in V]
write_ascii(ROOT / "cube_tiny.stl", triangles(small_vertices, F), "synthetic_tiny_cube")
truncated = b"solid truncated\n facet normal 0 0 0\n outer loop\n vertex 0 0"
(ROOT / "truncated.stl").write_bytes(truncated)
(ROOT / "empty.stl").write_bytes(b"")
