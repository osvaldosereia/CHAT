"""Local, injectable orchestration for STL analysis and consented recommendations."""

from __future__ import annotations

import hashlib
import json
from dataclasses import asdict
from pathlib import Path
from typing import Any, Protocol

from bambuprep.domain.models import JobRecord, JobState, PrinterSelection
from bambuprep.mesh.analyzer import MeshAnalysisLimitError, MeshReport, OrientationCandidate, analyze_mesh
from bambuprep.mesh.loader import (
    DEFAULT_MAX_FILE_BYTES,
    DEFAULT_MAX_TRIANGLES,
    MeshLoadError,
    load_stl,
)
from bambuprep.mesh.render import render_views
from bambuprep.recommendations.openai_client import (
    ApiKeyStore,
    OpenAIClient,
    RecommendationUnavailableError,
    request_recommendation,
)
from bambuprep.recommendations.schema import Recommendation
from bambuprep.storage.jobs import JobRepository


class ProfileCatalog(Protocol):
    def printer(self, printer_id: str) -> Any: ...
    def recommendation_options(self, printer_id: str) -> Any: ...


class WorkflowStateError(RuntimeError):
    """Raised when a job is not at the state required for an operation."""


class SourceChangedError(ValueError):
    """Raised when a local STL differs from the bytes originally selected."""


class WorkflowService:
    """Coordinate local analysis, persistence, and an optional consented API request.

    Methods are synchronous and intended to run in a worker thread when called by a
    desktop UI. No file content is written to SQLite, and image bytes are regenerated
    locally only when an explicitly consented recommendation is requested.
    """

    def __init__(
        self,
        repository: JobRepository,
        profile_catalog: ProfileCatalog,
        key_store: ApiKeyStore,
        openai_client: OpenAIClient,
        *,
        max_file_bytes: int = DEFAULT_MAX_FILE_BYTES,
        max_triangles: int = DEFAULT_MAX_TRIANGLES,
    ) -> None:
        if max_file_bytes <= 0 or max_triangles <= 0:
            raise ValueError("STL size and triangle limits must be greater than zero")
        self._repository = repository
        self._profile_catalog = profile_catalog
        self._key_store = key_store
        self._openai_client = openai_client
        self._max_file_bytes = max_file_bytes
        self._max_triangles = max_triangles

    def create_job(self, path: Path) -> JobRecord:
        """Validate the local STL and record only its path and source hash."""
        document = load_stl(
            path,
            max_file_bytes=self._max_file_bytes,
            max_triangles=self._max_triangles,
        )
        return self._repository.create_job(document.path, document.sha256)

    def analyze(self, job_id: str, selection: PrinterSelection) -> MeshReport:
        """Analyze the selected file locally and save a bounded metrics snapshot."""
        job = self._repository.get_job(job_id)
        if job.state not in {JobState.UPLOADED, JobState.NEEDS_REVIEW}:
            raise WorkflowStateError(f"Analysis is not available while the job is {job.state.value}")
        printer = self._profile_catalog.printer(selection.printer_id)
        if printer.nozzle_mm != selection.nozzle_mm:
            raise ValueError("Selected nozzle does not match the selected installed printer profile")
        options = self._profile_catalog.recommendation_options(selection.printer_id)
        if selection.filament_id not in options.filament_ids or selection.plate_id not in options.plate_ids:
            raise ValueError("Selected filament or plate does not match the installed profile catalog")

        starting_state = job.state
        self._repository.transition(
            job_id,
            starting_state,
            JobState.ANALYZING,
            "Local STL analysis started.",
        )
        try:
            try:
                document = load_stl(
                    job.source_path,
                    max_file_bytes=self._max_file_bytes,
                    max_triangles=self._max_triangles,
                )
            except MeshLoadError:
                if _hash_current_file(job.source_path, self._max_file_bytes) != job.source_sha256:
                    raise SourceChangedError("The selected STL changed after job creation; create a new job.") from None
                raise
            if document.sha256 != job.source_sha256:
                raise SourceChangedError("The selected STL changed after job creation; create a new job.")
            report = analyze_mesh(
                document,
                selection.nozzle_mm,
                max_triangles=self._max_triangles,
            )
            snapshot = {
                "selection": asdict(selection),
                "report": asdict(report),
                "recommendation": None,
            }
            encoded = json.dumps(snapshot, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
            self._repository.finish_with_report(
                job_id,
                JobState.ANALYZING,
                JobState.NEEDS_REVIEW,
                encoded,
                "Local analysis complete; review the report and selected setup.",
            )
            return report
        except SourceChangedError:
            self._repository.transition(
                job_id,
                JobState.ANALYZING,
                JobState.BLOCKED,
                "The selected STL changed after the job was created.",
            )
            raise
        except (MeshLoadError, MeshAnalysisLimitError):
            self._repository.transition(
                job_id,
                JobState.ANALYZING,
                JobState.BLOCKED,
                "Local input validation or analysis limits blocked this job.",
            )
            raise
        except Exception:
            self._repository.transition(
                job_id,
                JobState.ANALYZING,
                JobState.FAILED,
                "A local analysis operation failed; the source STL was preserved.",
            )
            raise

    def recommend(self, job_id: str, consent: bool) -> Recommendation | None:
        """Request a recommendation only when consent is true for this invocation."""
        if consent is not True:
            return None
        job = self._repository.get_job(job_id)
        if job.state is not JobState.NEEDS_REVIEW:
            raise WorkflowStateError("A recommendation requires a locally analyzed job awaiting review")
        snapshot = _read_snapshot(job.report_json, job.source_sha256)
        selection = PrinterSelection(**snapshot["selection"])
        report = _report_from_dict(snapshot["report"])
        options = self._profile_catalog.recommendation_options(selection.printer_id)

        try:
            document = load_stl(
                job.source_path,
                max_file_bytes=self._max_file_bytes,
                max_triangles=self._max_triangles,
            )
        except MeshLoadError:
            if _hash_current_file(job.source_path, self._max_file_bytes) != job.source_sha256:
                self._repository.transition(
                    job_id,
                    JobState.NEEDS_REVIEW,
                    JobState.BLOCKED,
                    "The selected STL changed after local analysis.",
                )
                raise SourceChangedError("The selected STL changed after analysis; create a new job.") from None
            raise
        if document.sha256 != job.source_sha256:
            self._repository.transition(
                job_id,
                JobState.NEEDS_REVIEW,
                JobState.BLOCKED,
                "The selected STL changed after local analysis.",
            )
            raise SourceChangedError("The selected STL changed after analysis; create a new job.")
        images = render_views(document, report)
        try:
            result = request_recommendation(
                report,
                images,
                selection,
                consent,
                self._key_store,
                self._openai_client,
                profile_options=options,
            )
        except RecommendationUnavailableError:
            return None

        snapshot["recommendation"] = asdict(result)
        encoded = json.dumps(snapshot, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
        self._repository.finish_with_report(
            job_id,
            JobState.NEEDS_REVIEW,
            JobState.RECOMMENDATION_READY,
            encoded,
            "A recommendation was validated against local measurements and installed options.",
        )
        return result


def _read_snapshot(raw: str | None, expected_sha256: str) -> dict[str, Any]:
    if raw is None:
        raise WorkflowStateError("The job has no saved local analysis report")
    try:
        snapshot = json.loads(raw)
    except json.JSONDecodeError:
        raise WorkflowStateError("The saved local analysis report is invalid") from None
    if not isinstance(snapshot, dict) or set(snapshot) != {"selection", "report", "recommendation"}:
        raise WorkflowStateError("The saved local analysis report has an unexpected structure")
    if not isinstance(snapshot["selection"], dict) or not isinstance(snapshot["report"], dict):
        raise WorkflowStateError("The saved local analysis report is incomplete")
    if snapshot["report"].get("sha256") != expected_sha256:
        raise WorkflowStateError("The saved local analysis report does not match the selected STL")
    return snapshot


def _hash_current_file(path: Path, max_file_bytes: int) -> str | None:
    """Hash a changed source without allowing an unbounded fallback read."""
    digest = hashlib.sha256()
    total = 0
    try:
        with Path(path).open("rb") as stream:
            while True:
                block = stream.read(min(1024 * 1024, max_file_bytes + 1 - total))
                if not block:
                    return digest.hexdigest()
                total += len(block)
                if total > max_file_bytes:
                    return None
                digest.update(block)
    except OSError:
        return None


def _report_from_dict(data: dict[str, Any]) -> MeshReport:
    try:
        candidates = [
            OrientationCandidate(
                orientation_id=item["orientation_id"],
                rotation_deg=tuple(item["rotation_deg"]),
                support_area_ratio=item["support_area_ratio"],
                contact_area_estimate=item["contact_area_estimate"],
                height_mm=item["height_mm"],
                ranking_indicators=dict(item["ranking_indicators"]),
            )
            for item in data["orientation_candidates"]
        ]
        return MeshReport(
            sha256=data["sha256"],
            dimensions_mm=tuple(data["dimensions_mm"]),
            triangle_count=data["triangle_count"],
            component_count=data["component_count"],
            volume_mm3=data["volume_mm3"],
            watertight=data["watertight"],
            degenerate_faces=data["degenerate_faces"],
            duplicate_faces=data["duplicate_faces"],
            scale_warning=data["scale_warning"],
            overhang_area_ratio=data["overhang_area_ratio"],
            contact_area_estimate=data["contact_area_estimate"],
            orientation_candidates=candidates,
            warnings=list(data["warnings"]),
        )
    except (KeyError, TypeError, ValueError):
        raise WorkflowStateError("The saved local analysis report could not be reconstructed") from None
