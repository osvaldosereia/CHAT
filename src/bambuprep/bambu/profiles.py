"""Read-only catalog of the installed Bambu Studio A1 mini profiles."""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from pathlib import Path, PurePosixPath
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from bambuprep.recommendations.schema import RecommendationProfileOptions


MODEL_ID = "Bambu Lab A1 mini"
_REQUIRED_NOZZLES = (0.2, 0.4)
_MANIFEST_LIMIT = 16 * 1024 * 1024
_PROFILE_LIMIT = 4 * 1024 * 1024
_TOTAL_PROFILE_LIMIT = 64 * 1024 * 1024
_PROFILE_ENTRY_LIMIT = 4096


_SAFE_PROFILE_DIAGNOSTIC_CODES = frozenset(
    {
        "profile_layout_missing",
        "profile_manifest_unreadable",
        "profile_manifest_invalid",
        "profile_catalog_limit_exceeded",
        "machine_model_profiles_invalid",
        "machine_profiles_invalid",
        "filament_profiles_invalid",
        "process_profiles_invalid",
        "profile_catalog_invalid",
    }
)


class ProfileCatalogError(ValueError):
    """Raised when installed profile data is absent, unsafe, or inconsistent."""

    def __init__(self, message: str, *, code: str = "profile_catalog_invalid") -> None:
        super().__init__(message)
        self.code = code if code in _SAFE_PROFILE_DIAGNOSTIC_CODES else "profile_catalog_invalid"


@dataclass(frozen=True, slots=True)
class PrinterProfile:
    printer_id: str
    nozzle_mm: float
    generic_pla_profile_id: str
    default_process_profile_id: str
    plate_id: str
    compatible_process_profile_ids: tuple[str, ...]
    support_options: tuple[str, ...]
    adhesion_options: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class ProfileCatalog:
    model_id: str
    profile_version: str
    printers: tuple[PrinterProfile, ...]

    @classmethod
    def load(cls, studio_root: Path) -> ProfileCatalog:
        """Load local system profiles without invoking Bambu Studio or the network."""
        root = Path(studio_root).expanduser().resolve()
        manifest_path = root / "resources" / "profiles" / "BBL.json"
        bbl_root = root / "resources" / "profiles" / "BBL"
        if not manifest_path.is_file() or not bbl_root.is_dir():
            raise ProfileCatalogError(
                "Bambu Studio profile manifest or BBL profile directory was not found",
                code="profile_layout_missing",
            )
        try:
            manifest_size = manifest_path.stat().st_size
            if manifest_size > _MANIFEST_LIMIT:
                raise ProfileCatalogError(
                    "Profile manifest exceeds the supported size limit",
                    code="profile_catalog_limit_exceeded",
                )
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except ProfileCatalogError:
            raise
        except (OSError, UnicodeError, json.JSONDecodeError) as exc:
            raise ProfileCatalogError(
                "Could not read the Bambu Studio profile manifest",
                code="profile_manifest_unreadable",
            ) from exc
        if not isinstance(manifest, dict):
            raise ProfileCatalogError(
                "Profile manifest must be a JSON object",
                code="profile_manifest_invalid",
            )

        loader = _ProfileLoader(bbl_root)

        def read_profile_entries(
            list_name: str,
            expected_type: str,
            code: str,
            include_names: frozenset[str] | None = None,
        ) -> dict[str, dict[str, Any]]:
            try:
                return loader.read_entries(
                    manifest, list_name, expected_type, include_names=include_names
                )
            except ProfileCatalogError as exc:
                raise ProfileCatalogError(str(exc), code=code) from exc

        machine_models = read_profile_entries(
            "machine_model_list",
            "machine_model",
            "machine_model_profiles_invalid",
            include_names=frozenset({MODEL_ID}),
        )
        required_machine_ids = frozenset(
            f"{MODEL_ID} {nozzle:.1f} nozzle" for nozzle in _REQUIRED_NOZZLES
        )
        machines = read_profile_entries(
            "machine_list",
            "machine",
            "machine_profiles_invalid",
            include_names=required_machine_ids,
        )
        required_filament_ids = frozenset(_generic_pla_id(nozzle) for nozzle in _REQUIRED_NOZZLES)
        filaments = read_profile_entries(
            "filament_list",
            "filament",
            "filament_profiles_invalid",
            include_names=required_filament_ids,
        )
        processes = read_profile_entries("process_list", "process", "process_profiles_invalid")

        model = machine_models.get(MODEL_ID)
        if model is None:
            raise ProfileCatalogError(f"Installed profiles do not include {MODEL_ID}")
        # The BBL system manifest may identify its machine model without a "from" field.
        if model.get("from") not in (None, "system"):
            raise ProfileCatalogError("A1 mini model profile is not a system profile")
        supported_nozzles = set(_number_values(model.get("nozzle_diameter"), "model nozzle diameter"))
        if not set(_REQUIRED_NOZZLES).issubset(supported_nozzles):
            raise ProfileCatalogError("A1 mini model profile does not declare both 0.2 mm and 0.4 mm nozzles")
        plate_id = _required_string(model.get("default_bed_type"), "default bed type")

        printers: list[PrinterProfile] = []
        for nozzle in _REQUIRED_NOZZLES:
            machine_profile = _find_machine_profile(machines, nozzle)
            printer_id = _required_string(machine_profile.get("name"), "machine profile name")
            filament_id = _generic_pla_id(nozzle)
            filament = filaments.get(filament_id)
            if filament is None or filament.get("from") != "system":
                raise ProfileCatalogError(f"Required installed Generic PLA profile is missing: {filament_id}")
            if printer_id not in _string_list(filament.get("compatible_printers"), "filament compatible_printers"):
                raise ProfileCatalogError(f"Generic PLA profile is not compatible with {printer_id}")

            compatible: dict[str, dict[str, Any]] = {}
            for process_id, process in processes.items():
                compatible_printers = process.get("compatible_printers", [])
                if not isinstance(compatible_printers, list):
                    raise ProfileCatalogError(f"Invalid compatible_printers in process profile {process_id}")
                if printer_id in _string_list(compatible_printers, f"{process_id} compatible_printers"):
                    if process.get("from") == "system":
                        compatible[process_id] = process

            default_process_id = _required_string(
                machine_profile.get("default_print_profile"), "default process profile"
            )
            default_process = compatible.get(default_process_id)
            if default_process is None:
                raise ProfileCatalogError(
                    f"Default process profile is not a compatible installed process profile for {printer_id}"
                )

            resolved_processes = {
                process_id: _resolve_process(process_id, processes, set())
                for process_id in compatible
            }
            support_options: set[str] = set()
            adhesion_options: set[str] = set()
            for process_id, resolved in resolved_processes.items():
                support_type = resolved.get("support_type")
                if support_type is not None:
                    support_options.add(_required_string(support_type, f"{process_id} support_type"))
                adhesion_options.add(_adhesion_option(resolved, process_id))
            if not support_options:
                raise ProfileCatalogError(f"No installed support options were found for {printer_id}")
            if not adhesion_options:
                raise ProfileCatalogError(f"No installed adhesion options were found for {printer_id}")

            printers.append(
                PrinterProfile(
                    printer_id=printer_id,
                    nozzle_mm=nozzle,
                    generic_pla_profile_id=filament_id,
                    default_process_profile_id=default_process_id,
                    plate_id=plate_id,
                    compatible_process_profile_ids=tuple(sorted(compatible)),
                    support_options=tuple(sorted(support_options)),
                    adhesion_options=tuple(sorted(adhesion_options)),
                )
            )

        version = manifest.get("version")
        if isinstance(version, (dict, list, bool)) or version is None:
            raise ProfileCatalogError(
                "Profile manifest is missing a usable version",
                code="profile_manifest_invalid",
            )
        version_text = str(version).strip()
        if not version_text or len(version_text) > 128:
            raise ProfileCatalogError(
                "Profile manifest version is invalid",
                code="profile_manifest_invalid",
            )
        return cls(model_id=MODEL_ID, profile_version=version_text, printers=tuple(printers))

    def printer(self, printer_id: str) -> PrinterProfile:
        for printer in self.printers:
            if printer.printer_id == printer_id:
                return printer
        raise ProfileCatalogError("Printer profile is not present in the installed catalog")

    def recommendation_options(self, printer_id: str) -> RecommendationProfileOptions:
        from bambuprep.recommendations.schema import RecommendationProfileOptions

        printer = self.printer(printer_id)
        return RecommendationProfileOptions(
            printer_ids=(printer.printer_id,),
            filament_ids=(printer.generic_pla_profile_id,),
            plate_ids=(printer.plate_id,),
            support_options=printer.support_options,
            adhesion_options=printer.adhesion_options,
        )


class _ProfileLoader:
    def __init__(self, bbl_root: Path) -> None:
        self.root = bbl_root.resolve()
        self.total_bytes = 0
        self.entries_read = 0

    def read_entries(
        self,
        manifest: dict[str, Any],
        list_name: str,
        expected_type: str,
        *,
        include_names: frozenset[str] | None = None,
    ) -> dict[str, dict[str, Any]]:
        entries = manifest.get(list_name)
        if not isinstance(entries, list) or len(entries) > _PROFILE_ENTRY_LIMIT:
            raise ProfileCatalogError(f"Profile manifest has an invalid {list_name}")
        loaded: dict[str, dict[str, Any]] = {}
        for entry in entries:
            if not isinstance(entry, dict):
                raise ProfileCatalogError(f"Profile manifest has an invalid entry in {list_name}")
            name = _required_string(entry.get("name"), f"{list_name} name")
            if include_names is not None and name not in include_names:
                continue
            sub_path = _required_string(entry.get("sub_path"), f"{list_name} sub_path")
            if name in loaded:
                raise ProfileCatalogError(f"Profile manifest contains a duplicate {expected_type} name")
            profile = self._read_profile(sub_path)
            if profile.get("type") != expected_type or profile.get("name") != name:
                raise ProfileCatalogError(f"Profile type or name does not match the manifest entry: {name}")
            loaded[name] = profile
        return loaded

    def _read_profile(self, sub_path: str) -> dict[str, Any]:
        if len(sub_path) > 512 or "\\" in sub_path or "\x00" in sub_path:
            raise ProfileCatalogError("Profile path is invalid")
        relative = PurePosixPath(sub_path)
        if relative.is_absolute() or any(part in ("", ".", "..") for part in relative.parts):
            raise ProfileCatalogError("Profile path would resolve outside the BBL profile directory")
        path = self.root.joinpath(*relative.parts)
        try:
            resolved = path.resolve(strict=True)
            if not resolved.is_relative_to(self.root):
                raise ProfileCatalogError("Profile path resolves outside the BBL profile directory")
            if not resolved.is_file():
                raise ProfileCatalogError("Profile path does not point to a regular file")
            size = resolved.stat().st_size
            if size > _PROFILE_LIMIT:
                raise ProfileCatalogError("Profile file exceeds the supported size limit")
            self.entries_read += 1
            self.total_bytes += size
            if self.entries_read > _PROFILE_ENTRY_LIMIT * 4 or self.total_bytes > _TOTAL_PROFILE_LIMIT:
                raise ProfileCatalogError("Installed profile catalog exceeds supported resource limits")
            data = json.loads(resolved.read_text(encoding="utf-8"))
        except ProfileCatalogError:
            raise
        except (OSError, UnicodeError, json.JSONDecodeError) as exc:
            raise ProfileCatalogError("Could not read an installed Bambu Studio profile file") from exc
        if not isinstance(data, dict):
            raise ProfileCatalogError("Installed profile must be a JSON object")
        return data


def _find_machine_profile(machines: dict[str, dict[str, Any]], nozzle: float) -> dict[str, Any]:
    matches = []
    for name, profile in machines.items():
        if profile.get("printer_model") != MODEL_ID or profile.get("from") != "system":
            continue
        diameters = _number_values(profile.get("nozzle_diameter"), f"{name} nozzle diameter")
        if len(diameters) == 1 and math.isclose(diameters[0], nozzle, rel_tol=0, abs_tol=1e-9):
            matches.append(profile)
    if len(matches) != 1:
        nozzle_label = f"{nozzle:.1f}"
        raise ProfileCatalogError(f"Expected exactly one installed A1 mini {nozzle_label} mm machine profile")
    return matches[0]


def _generic_pla_id(nozzle: float) -> str:
    if math.isclose(nozzle, 0.4, rel_tol=0, abs_tol=1e-9):
        return "Generic PLA @BBL A1M"
    return "Generic PLA @BBL A1M 0.2 nozzle"


def _resolve_process(
    profile_id: str,
    processes: dict[str, dict[str, Any]],
    ancestors: set[str],
) -> dict[str, Any]:
    if profile_id in ancestors:
        raise ProfileCatalogError("Process profile inheritance cycle detected")
    profile = processes.get(profile_id)
    if profile is None:
        raise ProfileCatalogError(f"Process profile inheritance parent is missing: {profile_id}")
    parent_name = profile.get("inherits")
    if parent_name is None or parent_name == "":
        return dict(profile)
    parent_id = _required_string(parent_name, f"{profile_id} inherits")
    parent = _resolve_process(parent_id, processes, ancestors | {profile_id})
    parent.update(profile)
    return parent


def _adhesion_option(profile: dict[str, Any], profile_id: str) -> str:
    explicit = profile.get("adhesion_type")
    if explicit is not None:
        normalized = _required_string(explicit, f"{profile_id} adhesion_type").lower()
        if normalized in {"none", "no_brim"}:
            return "none"
        if normalized in {"brim", "auto_brim", "outer_only", "outer_and_inner", "mouse_ears"}:
            return "brim"
        if normalized in {"skirt", "raft"}:
            return normalized
        raise ProfileCatalogError(f"Unsupported adhesion_type in installed profile {profile_id}")

    brim_type = profile.get("brim_type")
    if brim_type is not None:
        normalized_brim = _required_string(brim_type, f"{profile_id} brim_type").lower()
        if normalized_brim != "no_brim":
            return "brim"

    brim = _positive_number(profile.get("brim_width", 0), f"{profile_id} brim_width") > 0
    skirt = _positive_number(profile.get("skirt_loops", 0), f"{profile_id} skirt_loops") > 0
    raft = _positive_number(profile.get("raft_layers", 0), f"{profile_id} raft_layers") > 0
    if brim:
        return "brim"
    if raft:
        return "raft"
    if skirt:
        return "skirt"
    return "none"


def _required_string(value: Any, description: str) -> str:
    if not isinstance(value, str) or not value.strip() or len(value) > 256 or any(ord(char) < 32 for char in value):
        raise ProfileCatalogError(f"Invalid {description}")
    return value.strip()


def _string_list(value: Any, description: str) -> tuple[str, ...]:
    if not isinstance(value, list):
        raise ProfileCatalogError(f"Invalid {description}")
    return tuple(_required_string(item, description) for item in value)


def _number_values(value: Any, description: str) -> tuple[float, ...]:
    values = value.split(";") if isinstance(value, str) else value
    if not isinstance(values, list):
        raise ProfileCatalogError(f"Invalid {description}")
    parsed: list[float] = []
    for item in values:
        if isinstance(item, bool) or not isinstance(item, (str, int, float)):
            raise ProfileCatalogError(f"Invalid {description}")
        try:
            number = float(Decimal(str(item).strip()))
        except (InvalidOperation, ValueError):
            raise ProfileCatalogError(f"Invalid {description}") from None
        if not math.isfinite(number) or number <= 0 or number > 5:
            raise ProfileCatalogError(f"Invalid {description}")
        parsed.append(number)
    return tuple(parsed)


def _positive_number(value: Any, description: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (str, int, float)):
        raise ProfileCatalogError(f"Invalid {description}")
    try:
        number = float(Decimal(str(value).strip()))
    except (InvalidOperation, ValueError):
        raise ProfileCatalogError(f"Invalid {description}") from None
    if not math.isfinite(number) or number < 0:
        raise ProfileCatalogError(f"Invalid {description}")
    return number
