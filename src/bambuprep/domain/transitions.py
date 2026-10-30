"""Explicit state transition rules for local print-preparation jobs."""

from bambuprep.domain.models import JobState, StudioReviewConfirmation


class InvalidTransitionError(ValueError):
    """Raised when a job attempts a transition not permitted by the workflow."""


_ALLOWED: dict[JobState, frozenset[JobState]] = {
    JobState.UPLOADED: frozenset({JobState.ANALYZING, JobState.BLOCKED, JobState.FAILED}),
    JobState.ANALYZING: frozenset(
        {JobState.NEEDS_REVIEW, JobState.RECOMMENDATION_READY, JobState.BLOCKED, JobState.FAILED}
    ),
    JobState.NEEDS_REVIEW: frozenset(
        {JobState.ANALYZING, JobState.RECOMMENDATION_READY, JobState.BLOCKED, JobState.FAILED}
    ),
    JobState.RECOMMENDATION_READY: frozenset(
        {JobState.PROJECT_CONFIGURED, JobState.NEEDS_REVIEW, JobState.BLOCKED, JobState.FAILED}
    ),
    JobState.PROJECT_CONFIGURED: frozenset(
        {JobState.SLICER_VERIFIED, JobState.NEEDS_REVIEW, JobState.FAILED}
    ),
    JobState.SLICER_VERIFIED: frozenset(),
    JobState.BLOCKED: frozenset({JobState.ANALYZING, JobState.FAILED}),
    JobState.FAILED: frozenset({JobState.ANALYZING}),
}


def validate_transition(
    current: JobState,
    target: JobState,
    *,
    studio_review: StudioReviewConfirmation | None = None,
) -> None:
    if target not in _ALLOWED[current]:
        raise InvalidTransitionError(f"Transition from {current.value} to {target.value} is not allowed")
    if target is JobState.SLICER_VERIFIED and (
        not isinstance(studio_review, StudioReviewConfirmation) or not studio_review.is_complete
    ):
        raise InvalidTransitionError(
            "A complete, per-project Bambu Studio review confirmation is required."
        )
