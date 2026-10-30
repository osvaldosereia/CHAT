"""Read-only STL ingestion with resource limits and source hashing."""

from __future__ import annotations

import hashlib
import io
import os
import re
import struct
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import trimesh


DEFAULT_MAX_FILE_BYTES = 100 * 1024 * 1024
DEFAULT_MAX_TRIANGLES = 500_000


class MeshLoadError(ValueError):
    """An STL could not be read as a valid triangle mesh."""


class MeshTooLargeError(MeshLoadError):
    """A selected STL exceeds an explicit resource limit."""


@dataclass(frozen=True, slots=True)
class MeshDocument:
    path: Path
    sha256: str
    file_bytes: int
    mesh: trimesh.Trimesh


def _preflight_triangle_count(data: bytes, max_triangles: int) -> None:
    if len(data) >= 84:
        count = struct.unpack_from("<I", data, 80)[0]
        if 84 + count * 50 == len(data):
            if count > max_triangles:
                raise MeshTooLargeError(
                    f"STL has {count:,} triangles; the configured limit is {max_triangles:,}. "
                    "Use a smaller model or raise the local analysis limit."
                )
            return
    # ASCII STL is bounded by the byte limit; count facet records before parsing.
    count = sum(1 for _ in re.finditer(rb"facet\s+normal\b", data, flags=re.IGNORECASE))
    if count > max_triangles:
        raise MeshTooLargeError(
            f"STL has more than the configured {max_triangles:,}-triangle limit. "
            "Use a smaller model or raise the local analysis limit."
        )


def load_stl(
    path: Path,
    *,
    max_file_bytes: int = DEFAULT_MAX_FILE_BYTES,
    max_triangles: int = DEFAULT_MAX_TRIANGLES,
) -> MeshDocument:
    """Load an STL without writing to it and return its original bytes' SHA-256."""
    path = Path(path)
    if path.suffix.lower() != ".stl":
        raise MeshLoadError("Input file must use the .stl extension")
    if max_file_bytes <= 0 or max_triangles <= 0:
        raise ValueError("STL size and triangle limits must be greater than zero")
    if not path.is_file():
        raise MeshLoadError(f"STL file was not found: {path}")

    try:
        with path.open("rb") as stream:
            before = os.fstat(stream.fileno())
            if before.st_size == 0:
                raise MeshLoadError("STL file is empty")
            if before.st_size > max_file_bytes:
                raise MeshTooLargeError(
                    f"STL is {before.st_size:,} bytes; the configured limit is {max_file_bytes:,}. "
                    "Choose a smaller model or raise the local file-size limit."
                )
            contents = bytearray()
            while len(contents) <= max_file_bytes:
                remaining = max_file_bytes + 1 - len(contents)
                chunk = stream.read(min(1024 * 1024, remaining))
                if not chunk:
                    break
                contents.extend(chunk)
                if len(contents) > max_file_bytes:
                    raise MeshTooLargeError(
                        f"STL exceeds the configured {max_file_bytes:,}-byte limit. "
                        "Choose a smaller model or raise the local file-size limit."
                    )
            after = os.fstat(stream.fileno())
            if before.st_size != after.st_size or len(contents) != after.st_size:
                raise MeshLoadError("STL changed while it was being read; select it again and retry")
            file_bytes = len(contents)
            source_bytes = bytes(contents)
    except OSError as exc:
        raise MeshLoadError(f"Could not read STL file ({type(exc).__name__})") from exc

    _preflight_triangle_count(source_bytes, max_triangles)
    digest = hashlib.sha256(source_bytes).hexdigest()
    try:
        mesh = trimesh.load(
            io.BytesIO(source_bytes),
            file_type="stl",
            force="mesh",
            process=False,
        )
    except Exception as exc:
        raise MeshLoadError(f"Could not parse STL ({type(exc).__name__})") from exc

    if not isinstance(mesh, trimesh.Trimesh) or len(mesh.faces) == 0:
        raise MeshLoadError("STL contains no triangle faces")
    if len(mesh.faces) > max_triangles:
        raise MeshTooLargeError(
            f"STL contains {len(mesh.faces):,} triangles; the configured limit is {max_triangles:,}. "
            "Use a smaller model or raise the local analysis limit."
        )
    if not np.isfinite(mesh.vertices).all():
        raise MeshLoadError("STL contains non-finite vertex coordinates")

    return MeshDocument(path=path, sha256=digest, file_bytes=file_bytes, mesh=mesh)
