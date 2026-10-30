from pathlib import Path
import struct
from zipfile import ZIP_DEFLATED, ZipFile

import pytest

from bambuprep.bambu.project_3mf import Project3MFError, inspect_3mf


CONTENT_TYPES = """<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Override PartName="/3D/3dmodel.model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>"""
RELATIONSHIPS = """<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rel-1" Target="/3D/3dmodel.model" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>"""
MODEL = """<?xml version="1.0" encoding="UTF-8"?>
<model xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" unit="millimeter">
  <resources>
    <object id="1" type="model" name="synthetic">
      <mesh>
        <vertices>
          <vertex x="0" y="0" z="0"/><vertex x="1" y="0" z="0"/>
          <vertex x="0" y="1" z="0"/><vertex x="0" y="0" z="1"/>
        </vertices>
        <triangles>
          <triangle v1="0" v2="2" v3="1"/><triangle v1="0" v2="1" v3="3"/>
          <triangle v1="0" v2="3" v3="2"/><triangle v1="1" v2="2" v3="3"/>
        </triangles>
      </mesh>
    </object>
  </resources>
  <build><item objectid="1"/></build>
</model>"""


def _write_project(path: Path, *, relationships=RELATIONSHIPS, model=MODEL, extra=None):
    with ZipFile(path, "w", compression=ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", CONTENT_TYPES)
        archive.writestr("_rels/.rels", relationships)
        archive.writestr("3D/3dmodel.model", model)
        if extra:
            for name, data in extra.items():
                archive.writestr(name, data)
    return path


def test_inspector_reports_core_structure_and_metadata_parts(tmp_path):
    project = _write_project(tmp_path / "synthetic.3mf", extra={"Metadata/plate_1.json": "{}"})
    original = project.read_bytes()

    result = inspect_3mf(project)

    assert result.structure_valid is True
    assert result.model_part == "3D/3dmodel.model"
    assert result.model_units == "millimeter"
    assert result.object_ids == (1,)
    assert result.triangle_count == 4
    assert result.metadata_parts == ("Metadata/plate_1.json",)
    assert project.read_bytes() == original


def test_inspector_accepts_default_content_type_for_model_part(tmp_path):
    project = tmp_path / "default-content-type.3mf"
    default_types = CONTENT_TYPES.replace(
        '<Override PartName="/3D/3dmodel.model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>',
        '<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>',
    )
    with ZipFile(project, "w", compression=ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", default_types)
        archive.writestr("_rels/.rels", RELATIONSHIPS)
        archive.writestr("3D/3dmodel.model", MODEL)

    assert inspect_3mf(project).structure_valid is True


def test_inspector_accepts_structurally_valid_single_triangle_mesh(tmp_path):
    model = MODEL.replace(
        '<triangle v1="0" v2="2" v3="1"/><triangle v1="0" v2="1" v3="3"/>\n'
        '          <triangle v1="0" v2="3" v3="2"/><triangle v1="1" v2="2" v3="3"/>',
        '<triangle v1="0" v2="2" v3="1"/>',
    )
    project = _write_project(tmp_path / "single-triangle.3mf", model=model)

    assert inspect_3mf(project).triangle_count == 1


def test_inspector_rejects_missing_root_model_relationship(tmp_path):
    relationship = RELATIONSHIPS.replace("/3D/3dmodel.model", "/3D/missing.model")
    project = _write_project(tmp_path / "wrong-root.3mf", relationships=relationship)

    with pytest.raises(Project3MFError, match="relationship"):
        inspect_3mf(project)


def test_inspector_rejects_external_model_relationship(tmp_path):
    relationship = RELATIONSHIPS.replace(
        'Target="/3D/3dmodel.model"',
        'Target="/3D/3dmodel.model" TargetMode="External"',
    )
    project = _write_project(tmp_path / "external-model.3mf", relationships=relationship)

    with pytest.raises(Project3MFError, match="external"):
        inspect_3mf(project)


def test_inspector_rejects_out_of_range_triangle_indices(tmp_path):
    model = MODEL.replace('v3="3"', 'v3="99"')
    project = _write_project(tmp_path / "bad-index.3mf", model=model)

    with pytest.raises(Project3MFError, match="vertex index"):
        inspect_3mf(project)


def test_inspector_rejects_path_traversal_and_duplicate_zip_members(tmp_path):
    traversal = tmp_path / "traversal.3mf"
    with ZipFile(traversal, "w", compression=ZIP_DEFLATED) as archive:
        archive.writestr("../outside.txt", "not extracted")
    with pytest.raises(Project3MFError, match="unsafe part name"):
        inspect_3mf(traversal)

    duplicate = tmp_path / "duplicate.3mf"
    with ZipFile(duplicate, "w", compression=ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", CONTENT_TYPES)
        archive.writestr("[Content_Types].xml", CONTENT_TYPES)
    with pytest.raises(Project3MFError, match="duplicate"):
        inspect_3mf(duplicate)


def test_inspector_rejects_external_entity_declarations(tmp_path):
    model = MODEL.replace(
        "<model ",
        '<!DOCTYPE model [<!ENTITY secret SYSTEM "file:///private/model">]>\n<model ',
    ).replace('name="synthetic"', 'name="&secret;"')
    project = _write_project(tmp_path / "entity.3mf", model=model)

    with pytest.raises(Project3MFError, match="entity"):
        inspect_3mf(project)


def test_inspector_reports_corrupt_deflate_stream_as_project_error(tmp_path):
    project = _write_project(tmp_path / "corrupt-deflate.3mf", extra={"unused.bin": b"A" * 4096})
    with ZipFile(project) as archive:
        info = archive.getinfo("unused.bin")
        raw = bytearray(project.read_bytes())
        filename_length, extra_length = struct.unpack_from("<HH", raw, info.header_offset + 26)
        data_offset = info.header_offset + 30 + filename_length + extra_length

    raw[data_offset] = 0xFF
    project.write_bytes(raw)

    with pytest.raises(Project3MFError, match="Could not read 3MF package"):
        inspect_3mf(project)
