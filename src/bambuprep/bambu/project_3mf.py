"""Bounded, read-only inspection of a generic 3MF package structure.

This module does not determine Bambu Studio compatibility or validate slicer
settings. Those claims still require inspecting a real Studio-generated file.
"""

from __future__ import annotations

import math
import stat
import zipfile
import zlib
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Iterable
from xml.etree import ElementTree


CONTENT_TYPES_PART = "[Content_Types].xml"
ROOT_RELATIONSHIPS_PART = "_rels/.rels"
MODEL_RELATIONSHIP_TYPE = "http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"
MODEL_CONTENT_TYPE = "application/vnd.ms-package.3dmanufacturing-3dmodel+xml"
CONTENT_TYPES_NAMESPACE = "http://schemas.openxmlformats.org/package/2006/content-types"
RELATIONSHIPS_NAMESPACE = "http://schemas.openxmlformats.org/package/2006/relationships"
SUPPORTED_UNITS = frozenset({"micron", "millimeter", "centimeter", "inch", "foot", "meter"})
MAX_ZIP_ENTRIES = 1024
MAX_MEMBER_BYTES = 32 * 1024 * 1024
MAX_TOTAL_UNCOMPRESSED_BYTES = 128 * 1024 * 1024
MAX_XML_BYTES = 32 * 1024 * 1024
READ_CHUNK_BYTES = 64 * 1024


class Project3MFError(ValueError):
    """A local 3MF file is malformed or exceeds the inspection limits."""


@dataclass(frozen=True, slots=True)
class Project3MFInspection:
    structure_valid: bool
    model_part: str
    model_units: str
    object_ids: tuple[int, ...]
    build_object_ids: tuple[int, ...]
    triangle_count: int
    metadata_parts: tuple[str, ...]


def inspect_3mf(path: Path) -> Project3MFInspection:
    """Validate a ZIP/3MF package and mesh indices without extracting or modifying it."""
    project_path = Path(path)
    if project_path.suffix.lower() != ".3mf" or not project_path.is_file():
        raise Project3MFError("Input project must be an existing .3mf file")
    try:
        with zipfile.ZipFile(project_path, mode="r") as archive:
            infos = archive.infolist()
            if not infos or len(infos) > MAX_ZIP_ENTRIES:
                raise Project3MFError("3MF package has an invalid number of ZIP entries")
            files = _validate_member_table(infos)
            if CONTENT_TYPES_PART not in files or ROOT_RELATIONSHIPS_PART not in files:
                raise Project3MFError("3MF package is missing required OPC package parts")
            relationships_bytes = _read_member(archive, ROOT_RELATIONSHIPS_PART, MAX_XML_BYTES)
            content_types_bytes = _read_member(archive, CONTENT_TYPES_PART, MAX_XML_BYTES)
            relationships = _parse_xml(relationships_bytes, "root relationship")
            content_types = _parse_xml(content_types_bytes, "content types")
            model_part = _find_model_part(relationships, content_types, files)
            model_bytes = _read_member(archive, model_part, MAX_XML_BYTES)
            model = _parse_xml(model_bytes, "3D model")
            model_units, object_ids, build_ids, triangle_count = _inspect_model(model)
            _verify_all_members(archive, infos)
            metadata = tuple(sorted(name for name in files if name.startswith("Metadata/")))
            return Project3MFInspection(
                structure_valid=True,
                model_part=model_part,
                model_units=model_units,
                object_ids=object_ids,
                build_object_ids=build_ids,
                triangle_count=triangle_count,
                metadata_parts=metadata,
            )
    except Project3MFError:
        raise
    except (OSError, zipfile.BadZipFile, zipfile.LargeZipFile, RuntimeError, EOFError, zlib.error) as exc:
        raise Project3MFError(f"Could not read 3MF package ({type(exc).__name__})") from exc


def _validate_member_table(infos: Iterable[zipfile.ZipInfo]) -> set[str]:
    names: set[str] = set()
    total_size = 0
    for info in infos:
        name = info.filename
        if not name or "\x00" in name or "\\" in name:
            raise Project3MFError("3MF package contains an unsafe part name")
        relative = PurePosixPath(name)
        if relative.is_absolute() or any(part in (".", "..") for part in relative.parts):
            raise Project3MFError("3MF package contains an unsafe part name")
        if name in names:
            raise Project3MFError("3MF package contains a duplicate ZIP part")
        names.add(name)
        if info.is_dir():
            continue
        mode = (info.external_attr >> 16) & 0o170000
        if mode == stat.S_IFLNK:
            raise Project3MFError("3MF package must not contain symlink parts")
        if info.flag_bits & 0x1:
            raise Project3MFError("Encrypted 3MF parts are not supported")
        if info.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED):
            raise Project3MFError("3MF package uses an unsupported ZIP compression method")
        if info.file_size < 0 or info.file_size > MAX_MEMBER_BYTES:
            raise Project3MFError("3MF part exceeds the supported size limit")
        total_size += info.file_size
        if total_size > MAX_TOTAL_UNCOMPRESSED_BYTES:
            raise Project3MFError("3MF package exceeds the supported total size limit")
    return {name for name in names if not name.endswith("/")}


def _read_member(archive: zipfile.ZipFile, name: str, limit: int) -> bytes:
    try:
        with archive.open(name, mode="r") as stream:
            contents = stream.read(limit + 1)
    except (KeyError, OSError, RuntimeError, zipfile.BadZipFile) as exc:
        raise Project3MFError(f"Could not read required 3MF part {name}") from exc
    if len(contents) > limit:
        raise Project3MFError(f"3MF XML part exceeds the supported size limit: {name}")
    return contents


def _verify_all_members(archive: zipfile.ZipFile, infos: list[zipfile.ZipInfo]) -> None:
    total_actual = 0
    for info in infos:
        if info.is_dir():
            continue
        actual_member = 0
        try:
            with archive.open(info, mode="r") as stream:
                while True:
                    chunk = stream.read(READ_CHUNK_BYTES)
                    if not chunk:
                        break
                    actual_member += len(chunk)
                    total_actual += len(chunk)
                    if actual_member > MAX_MEMBER_BYTES or total_actual > MAX_TOTAL_UNCOMPRESSED_BYTES:
                        raise Project3MFError("3MF package expands beyond the supported size limits")
        except Project3MFError:
            raise
        except (OSError, RuntimeError, zipfile.BadZipFile, EOFError) as exc:
            raise Project3MFError("3MF package contains a corrupt or unreadable ZIP part") from exc
        if actual_member != info.file_size:
            raise Project3MFError("3MF ZIP part size does not match its directory record")


def _parse_xml(data: bytes, description: str) -> ElementTree.Element:
    upper = data.upper()
    if b"<!DOCTYPE" in upper or b"<!ENTITY" in upper:
        raise Project3MFError(f"3MF {description} XML cannot contain DTD/entity declarations")
    try:
        return ElementTree.fromstring(data)
    except ElementTree.ParseError:
        raise Project3MFError(f"3MF {description} XML is invalid") from None


def _find_model_part(
    relationships: ElementTree.Element,
    content_types: ElementTree.Element,
    files: set[str],
) -> str:
    if relationships.tag != f"{{{RELATIONSHIPS_NAMESPACE}}}Relationships":
        raise Project3MFError("3MF root relationship part has an unexpected XML namespace")
    roots = [
        item
        for item in relationships.findall(f"{{{RELATIONSHIPS_NAMESPACE}}}Relationship")
        if item.get("Type") == MODEL_RELATIONSHIP_TYPE
    ]
    if len(roots) != 1:
        raise Project3MFError("3MF root package must identify exactly one 3D model relationship")
    target_mode = roots[0].get("TargetMode", "Internal")
    if target_mode.lower() != "internal":
        raise Project3MFError("3MF model relationship cannot be external")
    target = roots[0].get("Target")
    if not target or "\\" in target or "\x00" in target:
        raise Project3MFError("3MF model relationship has an invalid target")
    relative = PurePosixPath(target.lstrip("/"))
    if relative.is_absolute() or any(part in (".", "..") for part in relative.parts):
        raise Project3MFError("3MF model relationship target is unsafe")
    part_name = relative.as_posix()
    if part_name not in files:
        raise Project3MFError("3MF model relationship points to a missing part")

    if content_types.tag != f"{{{CONTENT_TYPES_NAMESPACE}}}Types":
        raise Project3MFError("3MF content types part has an unexpected XML namespace")
    expected_part_name = "/" + part_name
    model_overrides = [
        item
        for item in content_types.findall(f"{{{CONTENT_TYPES_NAMESPACE}}}Override")
        if item.get("PartName") == expected_part_name
    ]
    if model_overrides:
        if len(model_overrides) != 1 or model_overrides[0].get("ContentType") != MODEL_CONTENT_TYPE:
            raise Project3MFError("3MF model part is not declared with the standard 3D model content type")
    else:
        extension = PurePosixPath(part_name).suffix.lstrip(".")
        defaults = [
            item
            for item in content_types.findall(f"{{{CONTENT_TYPES_NAMESPACE}}}Default")
            if (item.get("Extension") or "").lower() == extension.lower()
        ]
        if len(defaults) != 1 or defaults[0].get("ContentType") != MODEL_CONTENT_TYPE:
            raise Project3MFError("3MF model part is not declared with the standard 3D model content type")
    return part_name


def _inspect_model(root: ElementTree.Element) -> tuple[str, tuple[int, ...], tuple[int, ...], int]:
    local_name = root.tag.rsplit("}", 1)[-1]
    if not root.tag.startswith("{") or local_name != "model":
        raise Project3MFError("3MF model part root element is invalid")
    namespace = root.tag[1:].split("}", 1)[0]
    if not namespace.startswith("http://schemas.microsoft.com/3dmanufacturing/core/"):
        raise Project3MFError("3MF model part uses an unsupported core namespace")
    units = root.get("unit")
    if units not in SUPPORTED_UNITS:
        raise Project3MFError("3MF model unit is missing or unsupported")

    resources = root.find(f"{{{namespace}}}resources")
    build = root.find(f"{{{namespace}}}build")
    if resources is None or build is None:
        raise Project3MFError("3MF model is missing resources or build data")

    object_ids: list[int] = []
    object_nodes: dict[int, ElementTree.Element] = {}
    triangles = 0
    mesh_object_count = 0
    for obj in resources.findall(f"{{{namespace}}}object"):
        raw_id = obj.get("id")
        try:
            object_id = int(raw_id) if raw_id is not None else 0
        except ValueError:
            object_id = 0
        if object_id <= 0 or object_id in object_nodes:
            raise Project3MFError("3MF model contains an invalid or duplicate object ID")
        object_ids.append(object_id)
        object_nodes[object_id] = obj
        mesh = obj.find(f"{{{namespace}}}mesh")
        components = obj.find(f"{{{namespace}}}components")
        if mesh is not None and components is not None:
            raise Project3MFError("3MF object cannot contain both mesh and components")
        if mesh is not None:
            mesh_triangles = _inspect_mesh(mesh, namespace)
            triangles += mesh_triangles
            mesh_object_count += 1
        elif components is None:
            raise Project3MFError("3MF object contains neither mesh nor components")

    if not object_nodes or not mesh_object_count:
        raise Project3MFError("3MF model contains no triangular mesh objects")
    for obj in object_nodes.values():
        components = obj.find(f"{{{namespace}}}components")
        if components is not None:
            children = components.findall(f"{{{namespace}}}component")
            if not children:
                raise Project3MFError("3MF components object contains no component references")
            for component in children:
                try:
                    child_id = int(component.get("objectid", ""))
                except ValueError:
                    child_id = 0
                if child_id not in object_nodes:
                    raise Project3MFError("3MF component references a missing object")
    build_ids: list[int] = []
    for item in build.findall(f"{{{namespace}}}item"):
        try:
            object_id = int(item.get("objectid", ""))
        except ValueError:
            object_id = 0
        if object_id not in object_nodes:
            raise Project3MFError("3MF build item references a missing object")
        build_ids.append(object_id)
    if not build_ids:
        raise Project3MFError("3MF build section contains no printable items")
    _reject_component_cycles(object_nodes, namespace)
    return units, tuple(sorted(object_ids)), tuple(build_ids), triangles


def _inspect_mesh(mesh: ElementTree.Element, namespace: str) -> int:
    vertices_node = mesh.find(f"{{{namespace}}}vertices")
    triangles_node = mesh.find(f"{{{namespace}}}triangles")
    if vertices_node is None or triangles_node is None:
        raise Project3MFError("3MF mesh is missing vertices or triangles")
    vertices = vertices_node.findall(f"{{{namespace}}}vertex")
    if not vertices:
        raise Project3MFError("3MF mesh contains no vertices")
    for vertex in vertices:
        try:
            coordinates = [float(vertex.attrib[axis]) for axis in ("x", "y", "z")]
        except (KeyError, ValueError):
            raise Project3MFError("3MF mesh has an invalid vertex coordinate") from None
        if not all(math.isfinite(value) for value in coordinates):
            raise Project3MFError("3MF mesh has a non-finite vertex coordinate")
    faces = triangles_node.findall(f"{{{namespace}}}triangle")
    if not faces:
        raise Project3MFError("3MF mesh contains no triangles")
    for face in faces:
        try:
            indices = [int(face.attrib[key]) for key in ("v1", "v2", "v3")]
        except (KeyError, ValueError):
            raise Project3MFError("3MF mesh has an invalid triangle vertex index") from None
        if len(set(indices)) != 3 or any(index < 0 or index >= len(vertices) for index in indices):
            raise Project3MFError("3MF mesh triangle vertex index is invalid or out of range")
    return len(faces)


def _reject_component_cycles(objects: dict[int, ElementTree.Element], namespace: str) -> None:
    visiting: set[int] = set()
    visited: set[int] = set()

    def visit(object_id: int) -> None:
        if object_id in visiting:
            raise Project3MFError("3MF component graph contains a cycle")
        if object_id in visited:
            return
        visiting.add(object_id)
        components = objects[object_id].find(f"{{{namespace}}}components")
        if components is not None:
            for component in components.findall(f"{{{namespace}}}component"):
                child_id = int(component.get("objectid", "0"))
                visit(child_id)
        visiting.remove(object_id)
        visited.add(object_id)

    for object_id in objects:
        visit(object_id)
