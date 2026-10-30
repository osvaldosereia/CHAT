"""Windows application composition root; all processing stays on the local PC."""

from __future__ import annotations

import sys
from pathlib import Path


class _UnavailableKeyStore:
    """Disable recommendations safely when Windows Credential Locker is unavailable."""

    def get(self) -> None:
        return None


def run_windows_app() -> int:
    if sys.platform != "win32":
        raise RuntimeError("BambuPrep desktop UI requires Windows")

    from PySide6.QtWidgets import QApplication, QFileDialog, QMessageBox

    from bambuprep.bambu.profiles import ProfileCatalog
    from bambuprep.config import LocalPreferencesStore, get_app_paths
    from bambuprep.recommendations.openai_client import ResponsesAPIClient
    from bambuprep.security.api_key_store import create_windows_api_key_store
    from bambuprep.storage.jobs import JobRepository
    from bambuprep.ui.main_window import BambuPrepMainWindow
    from bambuprep.workflow.runner import WorkflowTaskRunner
    from bambuprep.workflow.service import WorkflowService

    application = QApplication.instance() or QApplication(sys.argv)
    try:
        paths = get_app_paths()
        paths.data_dir.mkdir(parents=True, exist_ok=True)
        paths.logs_dir.mkdir(parents=True, exist_ok=True)
        paths.temp_dir.mkdir(parents=True, exist_ok=True)
        preferences = LocalPreferencesStore(paths.data_dir / "preferences.json")
        saved_preferences = preferences.load()
        initial_location = (
            str(saved_preferences.studio_executable)
            if saved_preferences.studio_executable is not None
            else ""
        )
        selected_executable, _ = QFileDialog.getOpenFileName(
            None,
            "Localize o BambuStudio.exe instalado",
            initial_location,
            "Executáveis do Bambu Studio (*.exe);;Todos os executáveis (*.exe)",
        )
        if selected_executable:
            executable = Path(selected_executable)
        elif saved_preferences.studio_executable is not None and saved_preferences.studio_executable.is_file():
            executable = saved_preferences.studio_executable
        else:
            return 0

        catalog = ProfileCatalog.load(executable.parent)
        preferences.save_studio_executable(executable)
        repository = JobRepository(paths.database_file)
        credential_warning = False
        try:
            key_store = create_windows_api_key_store()
        except RuntimeError:
            key_store = _UnavailableKeyStore()
            credential_warning = True
        workflow = WorkflowService(
            repository,
            catalog,
            key_store,
            ResponsesAPIClient(),
        )
        task_runner = WorkflowTaskRunner(max_workers=1)
        window = BambuPrepMainWindow(workflow, catalog, task_runner, key_store)
    except Exception as error:
        QMessageBox.critical(None, "BambuPrep", str(error))
        return 1

    if credential_warning:
        QMessageBox.information(
            window,
            "Recomendações OpenAI indisponíveis",
            "O Windows Credential Locker não está disponível. A análise local continuará funcionando; "
            "nenhuma chave será salva em arquivo.",
        )
    application.aboutToQuit.connect(
        lambda: task_runner.close(wait=False, cancel_pending=True)
    )
    window.show()
    return application.exec()
