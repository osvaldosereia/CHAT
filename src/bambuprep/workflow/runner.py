"""Small bounded worker pool for UI actions that must not block the window."""

from __future__ import annotations

from concurrent.futures import Future, ThreadPoolExecutor
from typing import Any, Callable, TypeVar


T = TypeVar("T")


class WorkflowTaskRunner:
    """Submit synchronous workflow calls to a bounded background worker pool.

    The Qt layer should observe returned futures without calling ``result()``
    until completion, then marshal updates back onto the UI thread.
    """

    def __init__(self, *, max_workers: int = 1) -> None:
        if type(max_workers) is not int or max_workers <= 0:
            raise ValueError("max_workers must be greater than zero")
        self._executor = ThreadPoolExecutor(
            max_workers=max_workers,
            thread_name_prefix="BambuPrepWorker",
        )
        self._closed = False

    def submit(self, operation: Callable[..., T], *args: Any, **kwargs: Any) -> Future[T]:
        if self._closed:
            raise RuntimeError("Workflow task runner is closed")
        if not callable(operation):
            raise TypeError("operation must be callable")
        return self._executor.submit(operation, *args, **kwargs)

    def close(self, *, wait: bool = True, cancel_pending: bool = False) -> None:
        if self._closed:
            return
        self._closed = True
        self._executor.shutdown(wait=wait, cancel_futures=cancel_pending)

    def __enter__(self) -> WorkflowTaskRunner:
        if self._closed:
            raise RuntimeError("Workflow task runner is closed")
        return self

    def __exit__(self, exc_type: Any, exc: Any, traceback: Any) -> None:
        self.close()
