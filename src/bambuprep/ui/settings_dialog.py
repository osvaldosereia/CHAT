"""Credential settings; the API key is entered and stored only in Windows Credential Locker."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from PySide6.QtCore import Signal
from PySide6.QtWidgets import (
    QDialog,
    QFileDialog,
    QFormLayout,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QMessageBox,
    QPushButton,
    QVBoxLayout,
)


from bambuprep.config import AppPaths
from bambuprep.storage.app_data_cleanup import AppDataCleanupError, remove_local_app_files


class SettingsDialog(QDialog):
    app_data_removed = Signal(int)
    def __init__(
        self,
        key_store: Any,
        parent=None,
        preferences: Any = None,
        app_paths: AppPaths | None = None,
    ) -> None:
        super().__init__(parent)
        self._key_store = key_store
        self._preferences = preferences
        self._app_paths = app_paths
        self.setWindowTitle("Configurações do BambuPrep")
        self.setModal(True)

        layout = QVBoxLayout(self)
        form = QFormLayout()
        self.studio_status = QLabel(self)
        self.studio_status.setWordWrap(True)
        form.addRow("Bambu Studio", self.studio_status)
        self.studio_button = QPushButton("Escolher Bambu Studio…", self)
        self.studio_button.clicked.connect(self._choose_studio)
        form.addRow(self.studio_button)

        self.output_directory_status = QLabel(self)
        self.output_directory_status.setWordWrap(True)
        form.addRow("Pasta de saída", self.output_directory_status)
        self.output_directory_button = QPushButton("Escolher pasta de saída…", self)
        self.output_directory_button.clicked.connect(self._choose_output_directory)
        form.addRow(self.output_directory_button)

        self.key_status = QLabel(self)
        form.addRow("Chave OpenAI", self.key_status)
        self.key_input = QLineEdit(self)
        self.key_input.setEchoMode(QLineEdit.EchoMode.Password)
        self.key_input.setPlaceholderText("Cole sua chave; ela não será exibida após salvar")
        form.addRow("Nova chave", self.key_input)
        layout.addLayout(form)

        note = QLabel(
            "A chave é armazenada no Windows Credential Locker. Nunca é gravada em arquivo, banco ou log. "
            "O uso da API é cobrado separadamente do ChatGPT Plus.",
            self,
        )
        note.setWordWrap(True)
        layout.addWidget(note)

        self.consent_note = QLabel(
            "Cada recomendação exige uma confirmação nova por trabalho. Se você permitir, são enviadas "
            "métricas e imagens renderizadas; o STL, nome/caminho e histórico local ficam no computador. "
            "O uso da API pode ser cobrado separadamente do ChatGPT Plus.",
            self,
        )
        self.consent_note.setWordWrap(True)
        layout.addWidget(self.consent_note)

        self.retention_note = QLabel(
            "O histórico permanece no computador até você apagá-lo manualmente. Apagar o histórico não "
            "remove os STL originais nem outros arquivos escolhidos pelo usuário.",
            self,
        )
        self.retention_note.setWordWrap(True)
        layout.addWidget(self.retention_note)

        self.output_note = QLabel(
            "A saída de fatiamento/3MF não está habilitada enquanto a integração real com o Bambu Studio "
            "não for validada. A pasta escolhida não é usada enquanto essa integração estiver pendente.",
            self,
        )
        self.output_note.setWordWrap(True)
        layout.addWidget(self.output_note)

        self.remove_app_files_note = QLabel(
            "Remove banco/histórico, preferências, logs e arquivos temporários do BambuPrep. "
            "Não apaga STLs/3MFs escolhidos, a pasta de saída personalizada nem a chave do Credential Locker.",
            self,
        )
        self.remove_app_files_note.setWordWrap(True)
        layout.addWidget(self.remove_app_files_note)
        self.remove_app_files_button = QPushButton("Remover dados locais do BambuPrep…", self)
        self.remove_app_files_button.clicked.connect(self._remove_app_files)
        self.remove_app_files_button.setEnabled(app_paths is not None)
        layout.addWidget(self.remove_app_files_button)

        buttons = QHBoxLayout()
        self.save_button = QPushButton("Salvar chave", self)
        self.save_button.clicked.connect(self._save_key)
        buttons.addWidget(self.save_button)
        self.delete_button = QPushButton("Remover chave", self)
        self.delete_button.clicked.connect(self._delete_key)
        buttons.addWidget(self.delete_button)
        close_button = QPushButton("Fechar", self)
        close_button.clicked.connect(self.accept)
        buttons.addWidget(close_button)
        layout.addLayout(buttons)
        self._refresh_status()
        self._refresh_studio_status()
        self._refresh_output_directory_status()

    def _choose_studio(self) -> None:
        loader = getattr(self._preferences, "load", None)
        saver = getattr(self._preferences, "save_studio_executable", None)
        if not callable(loader) or not callable(saver):
            QMessageBox.warning(self, "BambuPrep", "As preferências locais do Studio estão indisponíveis.")
            return
        try:
            saved_path = loader().studio_executable
        except Exception:
            saved_path = None
        initial = str(saved_path) if saved_path is not None else ""
        selected, _ = QFileDialog.getOpenFileName(
            self,
            "Localizar BambuStudio.exe",
            initial,
            "Executável do Bambu Studio (*.exe)",
        )
        if not selected:
            return
        executable = Path(selected)
        if not executable.is_absolute() or not executable.is_file():
            QMessageBox.warning(self, "BambuPrep", "Selecione um executável local existente do Bambu Studio.")
            return
        try:
            saver(executable)
        except Exception:
            QMessageBox.warning(self, "BambuPrep", "O caminho do Bambu Studio não pôde ser salvo localmente.")
            return
        self._refresh_studio_status()
        QMessageBox.information(
            self,
            "BambuPrep",
            "O caminho local do Bambu Studio será usado na próxima inicialização.",
        )

    def _refresh_studio_status(self) -> None:
        loader = getattr(self._preferences, "load", None)
        saver = getattr(self._preferences, "save_studio_executable", None)
        available = callable(loader) and callable(saver)
        if not available:
            self.studio_status.setText("Preferências locais indisponíveis.")
            self.studio_button.setEnabled(False)
            return
        try:
            executable = loader().studio_executable
        except Exception:
            self.studio_status.setText("O caminho local salvo não pôde ser lido.")
            self.studio_button.setEnabled(False)
            return
        self.studio_status.setText(
            f"Caminho salvo para a próxima inicialização: {executable}"
            if executable is not None
            else "Nenhum executável local salvo."
        )
        self.studio_button.setEnabled(True)

    def _choose_output_directory(self) -> None:
        loader = getattr(self._preferences, "load", None)
        saver = getattr(self._preferences, "save_output_directory", None)
        if not callable(loader) or not callable(saver):
            QMessageBox.warning(self, "BambuPrep", "As preferências locais da pasta de saída estão indisponíveis.")
            return
        try:
            saved_path = getattr(loader(), "output_directory", None)
        except Exception:
            saved_path = None
        selected = QFileDialog.getExistingDirectory(
            self,
            "Escolher pasta de saída",
            str(saved_path) if saved_path is not None else "",
        )
        if not selected:
            return
        directory = Path(selected)
        if not directory.is_absolute() or not directory.is_dir():
            QMessageBox.warning(self, "BambuPrep", "Selecione uma pasta local existente para a saída.")
            return
        try:
            saver(directory)
        except Exception:
            QMessageBox.warning(self, "BambuPrep", "A pasta de saída não pôde ser salva localmente.")
            return
        self._refresh_output_directory_status()
        QMessageBox.information(
            self,
            "BambuPrep",
            "A pasta preferida foi salva. Ela só será usada após a validação da integração com o Studio.",
        )

    def _refresh_output_directory_status(self) -> None:
        loader = getattr(self._preferences, "load", None)
        saver = getattr(self._preferences, "save_output_directory", None)
        available = callable(loader) and callable(saver)
        if not available:
            self.output_directory_status.setText("Preferências locais indisponíveis.")
            self.output_directory_button.setEnabled(False)
            return
        try:
            directory = getattr(loader(), "output_directory", None)
        except Exception:
            self.output_directory_status.setText("A pasta de saída salva não pôde ser lida.")
            self.output_directory_button.setEnabled(False)
            return
        self.output_directory_status.setText(
            f"Pasta preferida: {directory}"
            if directory is not None
            else "Nenhuma pasta de saída selecionada."
        )
        self.output_directory_button.setEnabled(True)

    def _refresh_status(self) -> None:
        getter = getattr(self._key_store, "get", None)
        saver = getattr(self._key_store, "save", None)
        deleter = getattr(self._key_store, "delete", None)
        available = callable(getter) and callable(saver) and callable(deleter)
        try:
            has_key = bool(getter()) if callable(getter) else False
        except Exception:
            has_key = False
            available = False
        self.key_status.setText(
            "Chave cadastrada; o valor fica oculto." if has_key else "Nenhuma chave cadastrada."
        )
        self.save_button.setEnabled(available)
        self.delete_button.setEnabled(available and has_key)
        if not available:
            self.key_status.setText("Credential Locker indisponível; recomendações OpenAI desativadas.")

    def _save_key(self) -> None:
        value = self.key_input.text()
        saver = getattr(self._key_store, "save", None)
        if not callable(saver):
            QMessageBox.warning(self, "BambuPrep", "O Windows Credential Locker está indisponível.")
            return
        try:
            saver(value)
        except Exception:
            self.key_input.clear()
            QMessageBox.warning(self, "BambuPrep", "A chave não pôde ser protegida pelo Windows.")
            self._refresh_status()
            return
        self.key_input.clear()
        self._refresh_status()
        QMessageBox.information(self, "BambuPrep", "A chave foi salva no Windows Credential Locker.")

    def _delete_key(self) -> None:
        answer = QMessageBox.question(
            self,
            "Remover chave OpenAI",
            "Remover a chave do Windows Credential Locker?",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
            QMessageBox.StandardButton.No,
        )
        if answer != QMessageBox.StandardButton.Yes:
            return
        deleter = getattr(self._key_store, "delete", None)
        if not callable(deleter):
            return
        try:
            deleter()
        except Exception:
            QMessageBox.warning(self, "BambuPrep", "A chave não pôde ser removida do Windows.")
        finally:
            self.key_input.clear()
            self._refresh_status()



    def _remove_app_files(self) -> None:
        if self._app_paths is None:
            return
        answer = QMessageBox.question(
            self,
            "Remover dados locais do BambuPrep",
            "Esta ação apagará o histórico, as preferências, os logs e os arquivos temporários reconhecidos do BambuPrep. "
            "O aplicativo será encerrado. STL/3MFs escolhidos, a pasta de saída personalizada e a chave do Credential "
            "Locker serão preservados. Deseja continuar?",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
            QMessageBox.StandardButton.No,
        )
        if answer != QMessageBox.StandardButton.Yes:
            return
        try:
            removed = remove_local_app_files(self._app_paths)
        except AppDataCleanupError as exc:
            message = str(exc)
            if exc.removed_files:
                message += f"\nArquivos removidos antes da falha: {exc.removed_files}. Feche e reabra o BambuPrep."
            QMessageBox.warning(self, "BambuPrep", message)
            return
        QMessageBox.information(
            self,
            "Dados locais removidos",
            f"Foram removidos {removed} arquivo(s) reconhecidos do BambuPrep. O aplicativo será encerrado.",
        )
        self.app_data_removed.emit(removed)
        self.accept()
