from threading import Event

import pytest

from bambuprep.workflow.runner import WorkflowTaskRunner


def test_submit_returns_future_while_long_operation_runs_in_worker_thread():
    started = Event()
    release = Event()
    runner = WorkflowTaskRunner(max_workers=1)

    def slow_operation(value):
        started.set()
        if not release.wait(timeout=2):
            raise TimeoutError("test did not release worker")
        return value

    try:
        future = runner.submit(slow_operation, "done")
        assert started.wait(timeout=1)
        assert future.done() is False
        release.set()
        assert future.result(timeout=1) == "done"
    finally:
        release.set()
        runner.close()


def test_worker_exception_is_available_from_future():
    runner = WorkflowTaskRunner()
    try:
        future = runner.submit(lambda: (_ for _ in ()).throw(RuntimeError("worker failed")))
        with pytest.raises(RuntimeError, match="worker failed"):
            future.result(timeout=1)
    finally:
        runner.close()


def test_runner_rejects_invalid_worker_count_and_submissions_after_close():
    with pytest.raises(ValueError, match="greater than zero"):
        WorkflowTaskRunner(max_workers=0)

    runner = WorkflowTaskRunner()
    runner.close()
    with pytest.raises(RuntimeError, match="closed"):
        runner.submit(lambda: None)
