"""Credential settings; the API key is entered and stored only in Windows Credential Locker."""

from __future__ import annotations

from typing import Any

from PySide6.QtWidgets import (
    QDialog,
    QFormLayout,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QMessageBox,
    QPushButton,
    QVBoxLayout,
)


class SettingsDialog(QDialog):
    def __init__(self, key_store: Any, parent=None) -> None:
        super().__init__(parent)
        self._key_store = key_store
        self.setWindowTitle("Configurações do BambuPrep")
        self.setModal(True)

        layout = QVBoxLayout(self)
        form = QFormLayout()
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
