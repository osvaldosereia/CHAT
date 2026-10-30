"""Fail-closed Bambu Studio CLI slice adapter.

The adapter never starts a print. Its result flag means only that the local CLI
returned success and the exported file passed generic bounded 3MF structure
checks; it does not assert that Bambu-specific settings are correct or that a
physical print will succeed. The user must still inspect the project in Studio.
"""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import tempfile
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

from bambuprep.bambu.discovery import StudioProbe
from bambuprep.bambu.profiles import ProfileCatalog, ProfileCatalogError
from bambuprep.bambu.project_3mf import Project3MFError, inspect_3mf
from bambuprep.config import get_app_paths
from bambuprep.domain.models import PrinterSelection
from bambuprep.mesh.analyzer import orientation_rotation_degrees
from bambuprep.recommendations.schema import Recommendation


REQUIRED_CAPABILITIES = frozenset(
    {
        "machine_profiles",
        "filament_profiles",
        "orientation",
        "rotation_x",
        "rotation_y",
        "rotation_z",
        "arrangement",
        "slicing",
        "export_3mf",
    }
)
SLICE_TIMEOUT_SECONDS = 600
SLICE_TIMEOUT_EXIT_CODE = 124
SLICE_START_FAILURE_EXIT_CODE = 126
MAX_SOURCE_BYTES = 100 * 1024 * 1024
IS_WINDOWS = sys.platform == "win32"


class SlicerConfigurationError(ValueError):
    """The selected local profiles or CLI have not passed required checks."""


@dataclass(frozen=True, slots=True)
class SlicePlan:
    selection: PrinterSelection
    orientation_id: str
    support_enabled: bool
    support_option: str | None
    adhesion_option: str
    profile_ids: dict[str, str]
    cli_arguments: list[str]
    studio_executable: Path
    studio_version: str
    profile_version: str


@dataclass(frozen=True, slots=True)
class SliceResult:
    exit_code: int
    output_path: Path | None
    verified: bool
    diagnostics: list[str]
    log_path: Path


def build_slice_plan(
    selection: PrinterSelection,
    recommendation: Recommendation,
    catalog: ProfileCatalog,
    probe: StudioProbe,
) -> SlicePlan:
    """Resolve only installed, matching A1 mini defaults and captured CLI options."""
    if not IS_WINDOWS:
        raise SlicerConfigurationError("Bambu Studio slicing is supported only from the local Windows application")
    if not isinstance(selection, PrinterSelection):
        raise SlicerConfigurationError("An explicit A1 mini printer and nozzle selection is required")
    if not isinstance(recommendation, Recommendation):
        raise SlicerConfigurationError("A locally validated recommendation is required")
    if not isinstance(catalog, ProfileCatalog):
        raise SlicerConfigurationError("A validated local Bambu Studio profile catalog is required")
    if not isinstance(probe, StudioProbe) or not probe.cli_available or probe.version is None:
        raise SlicerConfigurationError("Bambu Studio CLI capabilities have not been captured")
    if not REQUIRED_CAPABILITIES.issubset(probe.capabilities):
        raise SlicerConfigurationError("Bambu Studio CLI capability set is incomplete")
    if probe.executable.parent.resolve() != catalog.studio_root.resolve():
        raise SlicerConfigurationError("The selected executable and installed profiles must come from the same Bambu Studio folder")
    if not probe.executable.is_absolute() or not probe.executable.is_file():
        raise SlicerConfigurationError("The configured Bambu Studio executable is unavailable")

    try:
        printer = catalog.printer(selection.printer_id)
    except ProfileCatalogError as exc:
        raise SlicerConfigurationError("Selected printer is not present in the installed A1 mini profile catalog") from exc
    if printer.nozzle_mm != selection.nozzle_mm:
        raise SlicerConfigurationError("Selected nozzle does not match the installed printer profile")
    if selection.filament_id != printer.generic_pla_profile_id:
        raise SlicerConfigurationError("Selected filament does not match the installed Generic PLA profile")
    if selection.plate_id != printer.plate_id:
        raise SlicerConfigurationError("Selected plate does not match the installed Textured PEI profile")

    if type(recommendation.support_enabled) is not bool:
        raise SlicerConfigurationError("Support selection must be an explicit boolean")
    if recommendation.support_enabled:
        if recommendation.support_option not in printer.support_options:
            raise SlicerConfigurationError("Selected support option is not present in the installed profile catalog")
        if printer.default_support_enabled is not True or recommendation.support_option != printer.default_support_option:
            raise SlicerConfigurationError("Selected support choice cannot be applied using the installed default process profile")
    else:
        if recommendation.support_option is not None:
            raise SlicerConfigurationError("Disabled support must not include a support option")
        if printer.default_support_enabled is not False:
            raise SlicerConfigurationError("The installed default process does not confirm that support is disabled")
    if recommendation.adhesion_option not in printer.adhesion_options:
        raise SlicerConfigurationError("Selected adhesion option is not present in the installed profile catalog")
    if recommendation.adhesion_option != printer.default_adhesion_option:
        raise SlicerConfigurationError("Selected adhesion choice cannot be applied using the installed default process profile")

    try:
        rotations = orientation_rotation_degrees(recommendation.orientation_id)
    except (TypeError, ValueError) as exc:
        raise SlicerConfigurationError("Selected orientation is not a measured local candidate") from exc

    try:
        machine_path = catalog.profile_path("machine", printer.printer_id)
        process_path = catalog.profile_path("process", printer.default_process_profile_id)
        filament_path = catalog.profile_path("filament", printer.generic_pla_profile_id)
    except ProfileCatalogError as exc:
        raise SlicerConfigurationError("A required installed system profile file could not be resolved") from exc
    for path in (machine_path, process_path, filament_path):
        if not path.is_file() or not path.resolve().is_relative_to(catalog.studio_root.resolve()):
            raise SlicerConfigurationError("A required system profile is outside the selected Studio installation")
        if ";" in str(path) or "\x00" in str(path):
            raise SlicerConfigurationError("A required system profile path cannot be represented safely by the Studio CLI")

    settings_path_list = f"{machine_path};{process_path}"
    arguments = [
        "--load-settings",
        settings_path_list,
        "--load-filaments",
        str(filament_path),
    ]
    for option, angle in zip(("--rotate-x", "--rotate-y", "--rotate"), rotations, strict=True):
        if angle:
            arguments.extend((option, str(angle)))
    arguments.extend(("--arrange", "1"))

    return SlicePlan(
        selection=selection,
        orientation_id=recommendation.orientation_id,
        support_enabled=recommendation.support_enabled,
        support_option=recommendation.support_option,
        adhesion_option=recommendation.adhesion_option,
        profile_ids={
            "printer": printer.printer_id,
            "nozzle_mm": f"{printer.nozzle_mm:.1f}",
            "filament": printer.generic_pla_profile_id,
            "plate": printer.plate_id,
            "process": printer.default_process_profile_id,
        },
        cli_arguments=arguments,
        studio_executable=probe.executable.resolve(),
        studio_version=probe.version,
        profile_version=catalog.profile_version,
    )


def slice_project(
    input_path: Path,
    plan: SlicePlan,
    output_path: Path,
    executable: Path,
) -> SliceResult:
    """Run a local no-print slice and accept only a structurally valid staged 3MF.

    stdout/stderr are discarded because Bambu logs can contain model names and local
    paths. The app writes a short allowlisted status log under LOCALAPPDATA instead.
    """
    if not isinstance(plan, SlicePlan):
        raise SlicerConfigurationError("A validated local slice plan is required")
    source = Path(input_path)
    target = Path(output_path)
    studio = Path(executable)
    if not source.is_absolute() or source.suffix.lower() != ".stl" or not source.is_file():
        raise SlicerConfigurationError("Input must be an existing local STL file")
    if not target.is_absolute() or target.suffix.lower() != ".3mf":
        raise SlicerConfigurationError("Output must be an absolute .3mf path")
    if not studio.is_absolute() or studio.resolve() != plan.studio_executable:
        raise SlicerConfigurationError("Use the same Bambu Studio executable that produced the slice plan")
    if not studio.is_file():
        raise SlicerConfigurationError("The configured Bambu Studio executable is unavailable")
    if source.resolve() == target.resolve(strict=False):
        raise SlicerConfigurationError("The output project must not replace the source STL")
    if target.exists():
        return _result(target, exit_code=125, diagnostics=["The selected output already exists; it was preserved."])

    try:
        source_hash = _hash_bounded_file(source)
    except (OSError, ValueError):
        return _result(target, exit_code=125, diagnostics=["The source STL could not be read within the configured limit."])

    try:
        target.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix=".bambuprep-slice-", dir=target.parent) as stage_name:
            stage = Path(stage_name)
            staged_output = stage / target.name
            command = [
                str(studio),
                *plan.cli_arguments,
                "--outputdir",
                str(stage),
                "--slice",
                "0",
                "--export-3mf",
                staged_output.name,
                str(source),
            ]
            try:
                completed = subprocess.run(
                    command,
                    cwd=str(studio.parent),
                    shell=False,
                    check=False,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    timeout=SLICE_TIMEOUT_SECONDS,
                )
            except subprocess.TimeoutExpired:
                return _result(target, exit_code=SLICE_TIMEOUT_EXIT_CODE, diagnostics=["Bambu Studio CLI timed out; no output was accepted."])
            except OSError as exc:
                return _result(
                    target,
                    exit_code=SLICE_START_FAILURE_EXIT_CODE,
                    diagnostics=[f"Bambu Studio could not be started ({type(exc).__name__}); no output was accepted."],
                )

            if completed.returncode != 0:
                return _result(
                    target,
                    exit_code=completed.returncode,
                    diagnostics=[f"Bambu Studio CLI returned exit code {completed.returncode}; no output was accepted."],
                )
            if not staged_output.is_file():
                return _result(target, exit_code=completed.returncode, diagnostics=["Bambu Studio exited successfully but did not create the requested 3MF."])
            try:
                inspection = inspect_3mf(staged_output)
            except Project3MFError:
                return _result(target, exit_code=completed.returncode, diagnostics=["CLI output failed generic 3MF structure validation; no output was accepted."])
            if not inspection.metadata_parts:
                return _result(target, exit_code=completed.returncode, diagnostics=["CLI output contains no metadata parts; no output was accepted."])
            try:
                if _hash_bounded_file(source) != source_hash:
                    return _result(target, exit_code=completed.returncode, diagnostics=["The source STL changed during slicing; no output was accepted."])
                os.link(staged_output, target)
            except (OSError, ValueError):
                return _result(target, exit_code=completed.returncode, diagnostics=["The source changed or the verified project could not be placed without overwriting another file."])
            return _result(
                target,
                exit_code=completed.returncode,
                output_path_result=target,
                verified=True,
                diagnostics=[
                    "The CLI returned success and the 3MF passed generic structure and metadata checks.",
                    "Review printer, nozzle, filament, plate, supports and Preview in Bambu Studio; this is not physical print validation.",
                ],
            )
    except OSError as exc:
        return _result(target, exit_code=SLICE_START_FAILURE_EXIT_CODE, diagnostics=[f"Local output operation failed ({type(exc).__name__})."])


def _hash_bounded_file(path: Path) -> str:
    digest = hashlib.sha256()
    total = 0
    with path.open("rb") as stream:
        while True:
            block = stream.read(min(1024 * 1024, MAX_SOURCE_BYTES + 1 - total))
            if not block:
                return digest.hexdigest()
            total += len(block)
            if total > MAX_SOURCE_BYTES:
                raise ValueError("Source STL exceeds the configured byte limit")
            digest.update(block)


def _result(
    output_path: Path,
    *,
    exit_code: int,
    diagnostics: Sequence[str],
    verified: bool = False,
    output_path_result: Path | None = None,
) -> SliceResult:
    """Write only safe status fields to the local app log, never CLI output or paths."""
    if output_path_result is None and verified:
        output_path_result = Path(output_path)
    log_path = get_app_paths().logs_dir / f"slice-{uuid.uuid4().hex}.json"
    log_contents = json.dumps(
        {"exit_code": exit_code, "verified": verified, "diagnostics": list(diagnostics)},
        ensure_ascii=False,
        separators=(",", ":"),
    )
    try:
        log_path.parent.mkdir(parents=True, exist_ok=True)
        with log_path.open("x", encoding="utf-8", newline="\n") as stream:
            stream.write(log_contents)
    except OSError:
        diagnostics = [*diagnostics, "The local slice status log could not be written."]
    return SliceResult(
        exit_code=exit_code,
        output_path=output_path_result,
        verified=verified,
        diagnostics=list(diagnostics),
        log_path=log_path,
    )
