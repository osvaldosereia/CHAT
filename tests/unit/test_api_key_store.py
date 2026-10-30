import pytest

from bambuprep.security.api_key_store import WindowsCredentialLockerKeyStore, create_windows_api_key_store


class MemoryCredentialBackend:
    def __init__(self):
        self.values = {}

    def set_password(self, service, username, password):
        self.values[(service, username)] = password

    def get_password(self, service, username):
        return self.values.get((service, username))

    def delete_password(self, service, username):
        del self.values[(service, username)]


def test_key_store_round_trips_and_deletes_using_injected_credential_backend():
    backend = MemoryCredentialBackend()
    store = WindowsCredentialLockerKeyStore(backend)

    assert store.get() is None
    store.save("sk-test-secret")
    assert store.get() == "sk-test-secret"
    store.delete()
    assert store.get() is None


def test_delete_of_missing_key_is_idempotent():
    store = WindowsCredentialLockerKeyStore(MemoryCredentialBackend())
    store.delete()
    assert store.get() is None


def test_system_store_refuses_non_windows_or_unavailable_secure_backend(monkeypatch):
    monkeypatch.setattr("bambuprep.security.api_key_store.sys.platform", "linux")

    with pytest.raises(RuntimeError, match="Windows Credential Locker"):
        create_windows_api_key_store()


def test_system_store_rejects_a_non_windows_credential_backend(monkeypatch):
    import keyring

    monkeypatch.setattr("bambuprep.security.api_key_store.sys.platform", "win32")
    monkeypatch.setattr(keyring, "get_keyring", lambda: MemoryCredentialBackend())

    with pytest.raises(RuntimeError, match="not saved"):
        create_windows_api_key_store()
