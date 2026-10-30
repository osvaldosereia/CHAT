import os
from datetime import datetime, timezone
from pathlib import Path

import pytest

pytest.importorskip("PySide6")
os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

from PySide6.QtCore import QEventLoop, QMimeData, QPointF, QThread, QTimer, Qt, QUrl
from PySide6.QtGui import QDropEvent
from PySide6.QtWidgets import QApplication, QFileDialog, QMessageBox, QLineEdit

from bambuprep.bambu.profiles import ProfileCatalog, PrinterProfile
from bambuprep.config import LocalPreferences
from bambuprep.domain.models import JobRecord, JobState
from bambuprep.mesh.analyzer import MeshReport
from bambuprep.recommendations.openai_client import CONSENT_NOTICE
from bambuprep.ui.main_window import BambuPrepMainWindow
from bambuprep.ui.settings_dialog import SettingsDialog
from bambuprep.workflow.runner import WorkflowTaskRunner


@pytest.fixture(scope="session")
def qapp():
    return QApplication.instance() or QApplication([])


class MemoryKeyStore:
    def __init__(self):
        self.value = None

    def get(self):
        return self.value

    def save(self, value):
        self.value = value

    def delete(self):
        self.value = None


class MemoryPreferences:
    def __init__(self, studio_executable=None, output_directory=None):
        self.studio_executable = studio_executable
        self.output_directory = output_directory

    def load(self):
        return LocalPreferences(self.studio_executable, self.output_directory)

    def save_studio_executable(self, path):
        self.studio_executable = Path(path)

    def save_output_directory(self, path):
        self.output_directory = Path(path)


class FakeMimeEvent:
    def __init__(self, mime_data):
        self._mime_data = mime_data
        self._accepted = False

    def mimeData(self):
        return self._mime_data

    def acceptProposedAction(self):
        self._accepted = True

    def ignore(self):
        self._accepted = False

    def isAccepted(self):
        return self._accepted


def test_settings_dialog_masks_key_and_saves_only_to_injected_credential_store(qapp, monkeypatch):
    store = MemoryKeyStore()
    dialog = SettingsDialog(store)
    monkeypatch.setattr(QMessageBox, "information", lambda *args: QMessageBox.StandardButton.Ok)

    dialog.key_input.setText("sk-local-test-only")
    assert dialog.key_input.echoMode() == QLineEdit.EchoMode.Password
    dialog._save_key()

    assert store.value == "sk-local-test-only"
    assert dialog.key_input.text() == ""
    assert "sk-local-test-only" not in dialog.key_status.text()
    dialog.close()


def test_settings_dialog_requires_delete_confirmation(qapp, monkeypatch):
    store = MemoryKeyStore()
    store.save("sk-local-test-only")
    dialog = SettingsDialog(store)
    answers = iter((QMessageBox.StandardButton.No, QMessageBox.StandardButton.Yes))
    monkeypatch.setattr(QMessageBox, "question", lambda *args: next(answers))

    dialog._delete_key()
    assert store.value == "sk-local-test-only"
    dialog._delete_key()
    assert store.value is None
    dialog.close()


def test_settings_dialog_updates_local_studio_path_and_explains_privacy_and_retention(
    qapp, tmp_path, monkeypatch
):
    preferences = MemoryPreferences()
    store = MemoryKeyStore()
    dialog = SettingsDialog(store, preferences=preferences)
    executable = tmp_path / "BambuStudio.exe"
    executable.write_bytes(b"synthetic executable placeholder")
    monkeypatch.setattr(QFileDialog, "getOpenFileName", lambda *args: (str(executable), ""))
    monkeypatch.setattr(QMessageBox, "information", lambda *args: QMessageBox.StandardButton.Ok)

    dialog.studio_button.click()

    assert preferences.studio_executable == executable
    assert "próxima inicialização" in dialog.studio_status.text().lower()
    assert "imagens renderizadas" in dialog.consent_note.text().lower()
    assert "manualmente" in dialog.retention_note.text().lower()
    assert "não remove os stl originais" in dialog.retention_note.text().lower()
    assert "não está habilitada" in dialog.output_note.text().lower()
    dialog.close()


def test_settings_dialog_saves_output_directory_without_claiming_slicing_is_enabled(
    qapp, tmp_path, monkeypatch
):
    preferences = MemoryPreferences()
    dialog = SettingsDialog(MemoryKeyStore(), preferences=preferences)
    output_directory = tmp_path / "prepared projects"
    output_directory.mkdir()
    monkeypatch.setattr(QFileDialog, "getExistingDirectory", lambda *args: str(output_directory))
    monkeypatch.setattr(QMessageBox, "information", lambda *args: QMessageBox.StandardButton.Ok)

    dialog.output_directory_button.click()

    assert preferences.output_directory == output_directory
    assert str(output_directory) in dialog.output_directory_status.text()
    assert "fatiamento/3mf não está habilitada" in dialog.output_note.text().lower()
    assert "não é usada enquanto" in dialog.output_note.text().lower()
    dialog.close()


class FakeWorkflow:
    def __init__(self):
        self.calls = []

    def create_job(self, path):
        self.calls.append(("create_job", path))

    def recommend(self, job_id, consent):
        self.calls.append((job_id, consent))
        return None


def test_each_openai_attempt_requires_a_fresh_yes_and_runs_only_after_confirmation(qapp, monkeypatch):
    profile = PrinterProfile(
        printer_id="Bambu Lab A1 mini 0.4 nozzle",
        nozzle_mm=0.4,
        generic_pla_profile_id="Generic PLA @BBL A1M",
        default_process_profile_id="0.20mm Standard @BBL A1M",
        plate_id="Textured PEI Plate",
        compatible_process_profile_ids=("0.20mm Standard @BBL A1M",),
        support_options=("tree(auto)",),
        adhesion_options=("brim", "none"),
    )
    catalog = ProfileCatalog("Bambu Lab A1 mini", "synthetic", (profile,))
    workflow = FakeWorkflow()
    runner = WorkflowTaskRunner(max_workers=1)
    window = BambuPrepMainWindow(workflow, catalog, runner, MemoryKeyStore())
    window._job = JobRecord(
        id="job-1",
        created_at=datetime.now(timezone.utc),
        source_path=Path("synthetic.stl"),
        source_sha256="a" * 64,
        state=JobState.NEEDS_REVIEW,
    )
    window._report = MeshReport(
        sha256="a" * 64,
        dimensions_mm=(1.0, 1.0, 1.0),
        triangle_count=4,
        component_count=1,
        volume_mm3=1.0,
        watertight=True,
        degenerate_faces=0,
        duplicate_faces=0,
        scale_warning=None,
        overhang_area_ratio=0.0,
        contact_area_estimate=1.0,
        orientation_candidates=[],
    )
    answers = iter((QMessageBox.StandardButton.No, QMessageBox.StandardButton.Yes, QMessageBox.StandardButton.No))
    prompt_count = []
    prompt_texts = []

    def answer_prompt(*args):
        prompt_count.append(True)
        prompt_texts.append(args[2])
        return next(answers)

    monkeypatch.setattr(QMessageBox, "question", answer_prompt)

    window._recommend()
    window._recommend()
    wait_loop = QEventLoop()
    poll = QTimer()
    poll.timeout.connect(lambda: wait_loop.quit() if not window._busy else None)
    poll.start(10)
    QTimer.singleShot(2000, wait_loop.quit)
    wait_loop.exec()
    window._recommend()

    assert len(prompt_count) == 3
    assert all(CONSENT_NOTICE in text and "Permitir este envio agora?" in text for text in prompt_texts)
    assert workflow.calls == [("job-1", True)]
    poll.stop()
    window.close()
    runner.close(wait=True)


def test_future_result_callback_runs_on_the_qt_main_thread(qapp):
    profile = PrinterProfile(
        printer_id="Bambu Lab A1 mini 0.4 nozzle",
        nozzle_mm=0.4,
        generic_pla_profile_id="Generic PLA @BBL A1M",
        default_process_profile_id="0.20mm Standard @BBL A1M",
        plate_id="Textured PEI Plate",
        compatible_process_profile_ids=("0.20mm Standard @BBL A1M",),
        support_options=("tree(auto)",),
        adhesion_options=("brim", "none"),
    )
    catalog = ProfileCatalog("Bambu Lab A1 mini", "synthetic", (profile,))
    runner = WorkflowTaskRunner(max_workers=1)
    window = BambuPrepMainWindow(FakeWorkflow(), catalog, runner, MemoryKeyStore())
    callbacks = []

    window._submit(
        lambda: "completed",
        (),
        lambda result: callbacks.append((result, QThread.currentThread())),
    )
    event_loop = QEventLoop()
    poll = QTimer()
    poll.setInterval(10)
    poll.timeout.connect(lambda: event_loop.quit() if callbacks else None)
    poll.start()
    QTimer.singleShot(2000, event_loop.quit)
    event_loop.exec()
    poll.stop()

    try:
        assert callbacks == [("completed", qapp.thread())]
    finally:
        window.close()
        runner.close(wait=True)


def test_physical_nozzle_confirmation_is_required_again_after_job_or_profile_change(qapp, tmp_path):
    profiles = (
        PrinterProfile(
            printer_id="Bambu Lab A1 mini 0.4 nozzle",
            nozzle_mm=0.4,
            generic_pla_profile_id="Generic PLA @BBL A1M",
            default_process_profile_id="0.20mm Standard @BBL A1M",
            plate_id="Textured PEI Plate",
            compatible_process_profile_ids=("0.20mm Standard @BBL A1M",),
            support_options=("tree(auto)",),
            adhesion_options=("brim", "none"),
        ),
        PrinterProfile(
            printer_id="Bambu Lab A1 mini 0.2 nozzle",
            nozzle_mm=0.2,
            generic_pla_profile_id="Generic PLA @BBL A1M 0.2 nozzle",
            default_process_profile_id="0.12mm Fine @BBL A1M 0.2 nozzle",
            plate_id="Textured PEI Plate",
            compatible_process_profile_ids=("0.12mm Fine @BBL A1M 0.2 nozzle",),
            support_options=("tree(auto)",),
            adhesion_options=("brim", "none"),
        ),
    )
    catalog = ProfileCatalog("Bambu Lab A1 mini", "synthetic", profiles)
    runner = WorkflowTaskRunner(max_workers=1)
    window = BambuPrepMainWindow(FakeWorkflow(), catalog, runner, MemoryKeyStore())
    first_job = JobRecord(
        id="job-1",
        created_at=datetime.now(timezone.utc),
        source_path=tmp_path / "first.stl",
        source_sha256="a" * 64,
        state=JobState.NEEDS_REVIEW,
    )
    window._job_created(first_job)

    assert window.nozzle_confirm.isEnabled()
    assert not window.nozzle_confirm.isChecked()
    assert not window.analyze_button.isEnabled()
    window.nozzle_confirm.setChecked(True)
    assert window.analyze_button.isEnabled()

    window.profile_combo.setCurrentIndex(1)
    assert not window.nozzle_confirm.isChecked()
    assert not window.analyze_button.isEnabled()

    second_job = JobRecord(
        id="job-2",
        created_at=datetime.now(timezone.utc),
        source_path=tmp_path / "second.stl",
        source_sha256="b" * 64,
        state=JobState.NEEDS_REVIEW,
    )
    window.nozzle_confirm.setChecked(True)
    window._job_created(second_job)
    assert not window.nozzle_confirm.isChecked()
    assert not window.analyze_button.isEnabled()

    window.close()
    runner.close(wait=True)


def test_window_accepts_one_local_stl_drop_and_rejects_other_inputs(qapp, tmp_path, monkeypatch):
    profile = PrinterProfile(
        printer_id="Bambu Lab A1 mini 0.4 nozzle",
        nozzle_mm=0.4,
        generic_pla_profile_id="Generic PLA @BBL A1M",
        default_process_profile_id="0.20mm Standard @BBL A1M",
        plate_id="Textured PEI Plate",
        compatible_process_profile_ids=("0.20mm Standard @BBL A1M",),
        support_options=("tree(auto)",),
        adhesion_options=("brim", "none"),
    )
    catalog = ProfileCatalog("Bambu Lab A1 mini", "synthetic", (profile,))
    workflow = FakeWorkflow()
    runner = WorkflowTaskRunner(max_workers=1)
    window = BambuPrepMainWindow(workflow, catalog, runner, MemoryKeyStore())
    submitted = []
    monkeypatch.setattr(
        window,
        "_submit",
        lambda operation, args, callback: submitted.append((operation, args, callback)),
    )

    stl_path = tmp_path / "local-part.stl"
    stl_path.write_text("solid local\nendsolid local\n", encoding="ascii")
    valid_mime = QMimeData()
    valid_mime.setUrls([QUrl.fromLocalFile(str(stl_path))])
    drag = FakeMimeEvent(valid_mime)
    window.dragEnterEvent(drag)
    assert drag.isAccepted()

    drop = QDropEvent(
        QPointF(5, 5),
        Qt.DropAction.CopyAction,
        valid_mime,
        Qt.MouseButton.LeftButton,
        Qt.KeyboardModifier.NoModifier,
    )
    window.dropEvent(drop)
    assert drop.isAccepted()
    assert len(submitted) == 1
    assert submitted[0][0].__self__ is workflow
    assert submitted[0][0].__name__ == "create_job"
    assert submitted[0][1] == (stl_path,)

    invalid_url_sets = (
        [QUrl.fromLocalFile(str(tmp_path / "local-project.3mf"))],
        [QUrl("https://example.invalid/remote-part.stl")],
        [QUrl.fromLocalFile(str(stl_path)), QUrl.fromLocalFile(str(stl_path))],
    )
    for urls in invalid_url_sets:
        unsupported_mime = QMimeData()
        unsupported_mime.setUrls(urls)
        unsupported_drag = FakeMimeEvent(unsupported_mime)
        window.dragEnterEvent(unsupported_drag)
        assert not unsupported_drag.isAccepted()
    assert len(submitted) == 1

    window.close()
    runner.close(wait=True)
