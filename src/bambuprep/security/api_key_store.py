"""OpenAI API key storage through Windows Credential Locker via keyring."""

from __future__ import annotations

import sys
from typing import Protocol


SERVICE_NAME = "BambuPrep"
USERNAME = "openai-api-key"


class CredentialBackend(Protocol):
    def set_password(self, service: str, username: str, password: str) -> None: ...
    def get_password(self, service: str, username: str) -> str | None: ...
    def delete_password(self, service: str, username: str) -> None: ...


class WindowsCredentialLockerKeyStore:
    """Small injectable adapter; production construction validates the Windows backend."""

    def __init__(self, backend: CredentialBackend):
        self._backend = backend

    def save(self, key: str) -> None:
        if not key or not key.strip():
            raise ValueError("API key cannot be empty")
        self._backend.set_password(SERVICE_NAME, USERNAME, key)

    def get(self) -> str | None:
        return self._backend.get_password(SERVICE_NAME, USERNAME)

    def delete(self) -> None:
        if self.get() is not None:
            self._backend.delete_password(SERVICE_NAME, USERNAME)


def create_windows_api_key_store() -> WindowsCredentialLockerKeyStore:
    if sys.platform != "win32":
        raise RuntimeError("Windows Credential Locker is available only on Windows")
    try:
        import keyring
        from keyring.backends.Windows import WinVaultKeyring
    except ImportError as exc:
        raise RuntimeError("Windows Credential Locker backend is unavailable; API key was not saved") from exc
    backend = keyring.get_keyring()
    if not isinstance(backend, WinVaultKeyring):
        raise RuntimeError("Windows Credential Locker backend is unavailable; API key was not saved")
    return WindowsCredentialLockerKeyStore(backend)
