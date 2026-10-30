from bambuprep.domain.models import JobState
from bambuprep.domain.transitions import InvalidTransitionError, validate_transition


def test_reviewed_workflow_transitions_follow_the_declared_states():
    validate_transition(JobState.UPLOADED, JobState.ANALYZING)
    validate_transition(JobState.ANALYZING, JobState.RECOMMENDATION_READY)
    validate_transition(JobState.RECOMMENDATION_READY, JobState.PROJECT_CONFIGURED)
    validate_transition(JobState.PROJECT_CONFIGURED, JobState.SLICER_VERIFIED)


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
