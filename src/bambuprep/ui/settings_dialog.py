"""Credential settings; the API key is entered and stored only in Windows Credential Locker."""

from __future__ import annotations

from pathlib import Path
from typing import Any

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


class SettingsDialog(QDialog):
    def __init__(self, key_store: Any, parent=None, preferences: Any = None) -> None:
        super().__init__(parent)
        self._key_store = key_store
        self._preferences = preferences
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
            "não for validada; nenhuma pasta de saída é usada por enquanto.",
            self,
        )
        self.output_note.setWordWrap(True)
        layout.addWidget(self.output_note)

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
