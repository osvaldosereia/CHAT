import pytest

from bambuprep.domain.models import JobState, StudioReviewConfirmation
from bambuprep.domain.transitions import InvalidTransitionError, validate_transition


def test_reviewed_workflow_transitions_follow_the_declared_states():
    validate_transition(JobState.UPLOADED, JobState.ANALYZING)
    validate_transition(JobState.ANALYZING, JobState.RECOMMENDATION_READY)
    validate_transition(JobState.RECOMMENDATION_READY, JobState.PROJECT_CONFIGURED)
    with pytest.raises(InvalidTransitionError, match="confirmation"):
        validate_transition(JobState.PROJECT_CONFIGURED, JobState.SLICER_VERIFIED)
    validate_transition(
        JobState.PROJECT_CONFIGURED,
        JobState.SLICER_VERIFIED,
        studio_review=_studio_review(),
    )


def test_slicer_verified_cannot_be_reached_without_project_configuration():
    try:
        validate_transition(JobState.RECOMMENDATION_READY, JobState.SLICER_VERIFIED)
    except InvalidTransitionError:
        pass
    else:
        raise AssertionError("slicer_verified must require a configured project")


def test_terminal_verified_job_cannot_be_reopened_or_failed():
    for target in (JobState.ANALYZING, JobState.FAILED):
        try:
            validate_transition(JobState.SLICER_VERIFIED, target)
        except InvalidTransitionError:
            continue
        raise AssertionError(f"unexpected transition from verified to {target}")


@pytest.mark.parametrize(
    "field",
    (
        "opened_in_studio",
        "machine_confirmed",
        "nozzle_confirmed",
        "filament_confirmed",
        "plate_confirmed",
        "support_settings_confirmed",
        "preview_confirmed",
    ),
)
def test_slicer_verified_requires_every_studio_review_confirmation(field):
    values = {
        "project_sha256": "a" * 64,
        "studio_version": "synthetic-test-version",
        "printer_id": "Bambu Lab A1 mini 0.4 nozzle",
        "nozzle_mm": 0.4,
        "filament_id": "Generic PLA @BBL A1M",
        "plate_id": "Textured PEI Plate",
        "opened_in_studio": True,
        "machine_confirmed": True,
        "nozzle_confirmed": True,
        "filament_confirmed": True,
        "plate_confirmed": True,
        "support_settings_confirmed": True,
        "preview_confirmed": True,
    }
    values[field] = False

    with pytest.raises(InvalidTransitionError, match="confirmation"):
        validate_transition(
            JobState.PROJECT_CONFIGURED,
            JobState.SLICER_VERIFIED,
            studio_review=StudioReviewConfirmation(**values),
        )


def _studio_review():
    return StudioReviewConfirmation(
        project_sha256="a" * 64,
        studio_version="synthetic-test-version",
        printer_id="Bambu Lab A1 mini 0.4 nozzle",
        nozzle_mm=0.4,
        filament_id="Generic PLA @BBL A1M",
        plate_id="Textured PEI Plate",
        opened_in_studio=True,
        machine_confirmed=True,
        nozzle_confirmed=True,
        filament_confirmed=True,
        plate_confirmed=True,
        support_settings_confirmed=True,
        preview_confirmed=True,
    )
