"""Small consent gate shared by UI actions and tested without a Qt runtime."""

from __future__ import annotations

from collections.abc import Callable
from typing import TypeVar


Result = TypeVar("Result")


def run_consented_action(
    *,
    prompt: Callable[[], object],
    action: Callable[[bool], Result],
) -> Result | None:
    """Prompt on every invocation and run the action only for the literal True value."""
    if prompt() is not True:
        return None
    return action(True)
