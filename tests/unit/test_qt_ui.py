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
from bambuprep.config import LocalPreferences, LocalPreferencesStore, get_app_paths
from bambuprep.domain.models import JobRecord, JobState
from bambuprep.mesh.analyzer import MeshReport
from bambuprep.recommendations.openai_client import CONSENT_NOTICE
from bambuprep.recommendations.schema import Recommendation
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

    def delete_history(self):
        self.calls.append(("delete_history",))
        return 2


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


def test_window_shows_indeterminate_progress_only_while_work_is_running(qapp):
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
    runner = WorkflowTaskRunner(max_workers=1)
    window = BambuPrepMainWindow(
        FakeWorkflow(),
        ProfileCatalog("Bambu Lab A1 mini", "synthetic", (profile,)),
        runner,
        MemoryKeyStore(),
    )

    assert window.progress_bar.isHidden()
    window._set_busy(True, "Análise local em andamento…")
    assert not window.progress_bar.isHidden()
    assert window.progress_bar.minimum() == window.progress_bar.maximum() == 0
    assert window.progress_bar.accessibleName() == "Operação local em andamento"
    window._set_busy(False, "")
    assert window.progress_bar.isHidden()

    window.close()
    runner.close(wait=True)


def test_report_shows_manual_studio_values_and_keeps_slicing_unverified(qapp):
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
    runner = WorkflowTaskRunner(max_workers=1)
    window = BambuPrepMainWindow(
        FakeWorkflow(),
        ProfileCatalog("Bambu Lab A1 mini", "synthetic", (profile,)),
        runner,
        MemoryKeyStore(),
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

    window._refresh_report_view()
    text = window.report_view.toPlainText()
    assert "Máquina: Bambu Lab A1 mini 0.4 nozzle" in text
    assert "Bico: 0.4 mm" in text
    assert "Processo do catálogo local: 0.20mm Standard @BBL A1M" in text
    assert "Filamento: Generic PLA @BBL A1M" in text
    assert "Placa: Textured PEI Plate" in text
    assert "Suportes e aderência devem ser conferidos manualmente" in text
    assert "Nenhum arquivo 3MF foi gerado" in text
    assert "slicer_verified" not in text

    window._recommendation = Recommendation(
        orientation_id="flat",
        support_enabled=True,
        support_option="tree(auto)",
        adhesion_option="brim",
        confidence=0.8,
        rationale=["synthetic rationale"],
        evidence_refs=["mesh:dimensions_mm"],
    )
    window._refresh_report_view()
    text = window.report_view.toPlainText()
    assert "Orientação sugerida: flat" in text
    assert "Suportes sugeridos: tree(auto)" in text
    assert "Aderência sugerida: brim" in text
    assert "Nenhum arquivo 3MF foi gerado" in text
    window.close()
    runner.close(wait=True)


def test_nozzle_and_material_plate_confirmation_reset_after_job_or_profile_change(qapp, tmp_path, monkeypatch):
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
    assert not window.material_plate_confirm.isChecked()
    assert "Generic PLA @BBL A1M" in window.material_plate_confirm.text()
    assert "Textured PEI Plate" in window.material_plate_confirm.text()
    assert not window.analyze_button.isEnabled()
    submitted = []
    monkeypatch.setattr(window, "_submit", lambda *args: submitted.append(args))
    window.nozzle_confirm.setChecked(True)
    window._analyze()
    assert submitted == []
    assert not window.analyze_button.isEnabled()
    window.material_plate_confirm.setChecked(True)
    assert window.analyze_button.isEnabled()

    window.profile_combo.setCurrentIndex(1)
    assert not window.nozzle_confirm.isChecked()
    assert not window.material_plate_confirm.isChecked()
    assert not window.analyze_button.isEnabled()

    second_job = JobRecord(
        id="job-2",
        created_at=datetime.now(timezone.utc),
        source_path=tmp_path / "second.stl",
        source_sha256="b" * 64,
        state=JobState.NEEDS_REVIEW,
    )
    window.nozzle_confirm.setChecked(True)
    window.material_plate_confirm.setChecked(True)
    window._job_created(second_job)
    assert not window.nozzle_confirm.isChecked()
    assert not window.material_plate_confirm.isChecked()
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


def test_error_dialog_reports_persisted_state_and_recovery_action(qapp, tmp_path, monkeypatch):
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
    runner = WorkflowTaskRunner(max_workers=1)
    workflow = FakeWorkflow()
    persisted_job = JobRecord(
        id="job-1",
        created_at=datetime.now(timezone.utc),
        source_path=tmp_path / "part.stl",
        source_sha256="a" * 64,
        state=JobState.BLOCKED,
    )
    workflow.get_job = lambda job_id: persisted_job
    window = BambuPrepMainWindow(
        workflow,
        ProfileCatalog("Bambu Lab A1 mini", "synthetic", (profile,)),
        runner,
        MemoryKeyStore(),
    )
    window._job = JobRecord(
        id="job-1",
        created_at=persisted_job.created_at,
        source_path=persisted_job.source_path,
        source_sha256=persisted_job.source_sha256,
        state=JobState.UPLOADED,
    )
    window.nozzle_confirm.setChecked(True)
    window.material_plate_confirm.setChecked(True)
    assert window.analyze_button.isEnabled()
    dialogs = []
    monkeypatch.setattr(QMessageBox, "warning", lambda *args: dialogs.append(args[2]))

    window._show_error(RuntimeError("synthetic local failure"))

    assert window._job.state is JobState.BLOCKED
    assert not window.analyze_button.isEnabled()
    assert dialogs and "bloqueado (blocked)" in dialogs[0]
    assert "selecione novamente um STL válido" in dialogs[0]
    assert "synthetic local failure" in dialogs[0]
    window.close()
    runner.close(wait=True)



def _manual_studio_test_profile():
    return PrinterProfile(
        printer_id="Bambu Lab A1 mini 0.4 nozzle",
        nozzle_mm=0.4,
        generic_pla_profile_id="Generic PLA @BBL A1M",
        default_process_profile_id="0.20mm Standard @BBL A1M",
        plate_id="Textured PEI Plate",
        compatible_process_profile_ids=("0.20mm Standard @BBL A1M",),
        support_options=("tree(auto)",),
        adhesion_options=("brim", "none"),
    )


def test_manual_studio_button_opens_original_stl_without_marking_slice_verified(
    qapp, tmp_path, monkeypatch
):
    from bambuprep.domain.models import JobRecord
    from datetime import datetime, timezone

    executable = tmp_path / "Bambu Studio" / "bambu-studio.exe"
    executable.parent.mkdir()
    executable.write_bytes(b"synthetic executable placeholder")
    source = tmp_path / "private source.stl"
    source.write_bytes(b"solid local\\nendsolid local\\n")
    workflow = FakeWorkflow()
    runner = WorkflowTaskRunner(max_workers=1)
    window = BambuPrepMainWindow(
        workflow,
        ProfileCatalog("Bambu Lab A1 mini", "synthetic", (_manual_studio_test_profile(),)),
        runner,
        MemoryKeyStore(),
        MemoryPreferences(executable),
    )
    window._job = JobRecord(
        id="job-manual",
        created_at=datetime.now(timezone.utc),
        source_path=source,
        source_sha256="a" * 64,
        state=JobState.UPLOADED,
    )
    opened = []
    monkeypatch.setattr(
        "bambuprep.ui.main_window.open_stl_in_studio",
        lambda studio, stl: opened.append((studio, stl)),
    )
    window._refresh_controls()

    assert window.open_studio_button.isEnabled()
    window.open_studio_button.click()

    assert opened == [(executable, source)]
    assert window._job.state is JobState.UPLOADED
    assert "não executou fatiamento" in window.status_label.text().lower()
    assert "3mf" in window.status_label.text().lower()
    window.close()
    runner.close(wait=True)


def test_delete_history_is_available_before_selecting_a_new_stl(qapp, monkeypatch):
    workflow = FakeWorkflow()
    runner = WorkflowTaskRunner(max_workers=1)
    window = BambuPrepMainWindow(
        workflow,
        ProfileCatalog("Bambu Lab A1 mini", "synthetic", (_manual_studio_test_profile(),)),
        runner,
        MemoryKeyStore(),
    )
    monkeypatch.setattr(QMessageBox, "question", lambda *args: QMessageBox.StandardButton.Yes)

    assert window.delete_history_button.isEnabled()
    window.delete_history_button.click()

    assert workflow.calls == [("delete_history",)]
    assert "2 trabalhos" in window.status_label.text()
    assert window._job is None
    window.close()
    runner.close(wait=True)




def test_settings_dialog_removes_only_local_app_files_after_confirmation(qapp, tmp_path, monkeypatch):
    paths = get_app_paths(local_app_data=tmp_path / "LOCALAPPDATA")
    paths.data_dir.mkdir(parents=True)
    paths.database_file.write_bytes(b"local history")
    paths.logs_dir.mkdir()
    (paths.logs_dir / "run.log").write_text("local log")
    paths.temp_dir.mkdir()
    (paths.temp_dir / "view.png").write_bytes(b"temporary view")
    output = tmp_path / "chosen-output"
    output.mkdir()
    project = output / "keep.3mf"
    project.write_bytes(b"user output")
    LocalPreferencesStore(paths.data_dir / "preferences.json").save_output_directory(output)
    store = MemoryKeyStore()
    store.save("sk-local-test-only")
    dialog = SettingsDialog(store, preferences=MemoryPreferences(), app_paths=paths)
    monkeypatch.setattr(QMessageBox, "question", lambda *args: QMessageBox.StandardButton.Yes)
    monkeypatch.setattr(QMessageBox, "information", lambda *args: QMessageBox.StandardButton.Ok)
    removed = []
    dialog.app_data_removed.connect(removed.append)

    dialog.remove_app_files_button.click()

    assert removed == [4]
    assert not paths.database_file.exists()
    assert not (paths.data_dir / "preferences.json").exists()
    assert not paths.logs_dir.exists()
    assert not paths.temp_dir.exists()
    assert project.read_bytes() == b"user output"
    assert store.value == "sk-local-test-only"
    assert dialog.result() == 1
    dialog.close()


def test_settings_dialog_keeps_app_files_when_removal_is_cancelled(qapp, tmp_path, monkeypatch):
    paths = get_app_paths(local_app_data=tmp_path / "LOCALAPPDATA")
    paths.data_dir.mkdir(parents=True)
    paths.database_file.write_bytes(b"local history")
    preferences = paths.data_dir / "preferences.json"
    preferences.write_text('{"studio_executable":null}')
    dialog = SettingsDialog(MemoryKeyStore(), app_paths=paths)
    monkeypatch.setattr(QMessageBox, "question", lambda *args: QMessageBox.StandardButton.No)
    removed = []
    dialog.app_data_removed.connect(removed.append)

    dialog.remove_app_files_button.click()

    assert paths.database_file.read_bytes() == b"local history"
    assert preferences.exists()
    assert removed == []
    assert dialog.result() == 0
    dialog.close()
