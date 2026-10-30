"""Read-only discovery for a locally installed Bambu Studio executable."""

from __future__ import annotations

import ctypes
import re
import subprocess
import sys
import threading
from ctypes import wintypes
from dataclasses import dataclass
from pathlib import Path


class _VSFixedFileInfo(ctypes.Structure):
    _fields_ = [
        ("dwSignature", wintypes.DWORD),
        ("dwStrucVersion", wintypes.DWORD),
        ("dwFileVersionMS", wintypes.DWORD),
        ("dwFileVersionLS", wintypes.DWORD),
        ("dwProductVersionMS", wintypes.DWORD),
        ("dwProductVersionLS", wintypes.DWORD),
        ("dwFileFlagsMask", wintypes.DWORD),
        ("dwFileFlags", wintypes.DWORD),
        ("dwFileOS", wintypes.DWORD),
        ("dwFileType", wintypes.DWORD),
        ("dwFileSubtype", wintypes.DWORD),
        ("dwFileDateMS", wintypes.DWORD),
        ("dwFileDateLS", wintypes.DWORD),
    ]


def _format_fixed_file_version(version_ms: int, version_ls: int) -> str | None:
    """Format the four DWORD version components from VS_FIXEDFILEINFO."""
    if not version_ms and not version_ls:
        return None
    return ".".join(
        str(component)
        for component in (
            version_ms >> 16,
            version_ms & 0xFFFF,
            version_ls >> 16,
            version_ls & 0xFFFF,
        )
    )


def _read_windows_version_string(data: ctypes.Array, query_value: object) -> str | None:
    """Read ProductVersion/FileVersion strings using the resource translation table."""
    translations = ctypes.c_void_p()
    translations_size = wintypes.UINT()
    if not query_value(
        data,
        r"\VarFileInfo\Translation",
        ctypes.byref(translations),
        ctypes.byref(translations_size),
    ):
        return None
    if not translations.value or translations_size.value < 4 or translations_size.value > 256:
        return None

    translation_data = ctypes.string_at(translations.value, translations_size.value)
    language_pairs = [
        (
            int.from_bytes(translation_data[offset : offset + 2], "little"),
            int.from_bytes(translation_data[offset + 2 : offset + 4], "little"),
        )
        for offset in range(0, len(translation_data) - 3, 4)
    ]
    for resource_name in ("ProductVersion", "FileVersion"):
        for language, codepage in language_pairs:
            if not language and not codepage:
                continue
            query_path = "\\StringFileInfo\\{:04X}{:04X}\\{}".format(
                language,
                codepage,
                resource_name,
            )
            value = ctypes.c_void_p()
            value_size = wintypes.UINT()
            if not query_value(data, query_path, ctypes.byref(value), ctypes.byref(value_size)):
                continue
            if not value.value or not value_size.value or value_size.value > 256:
                continue
            try:
                text = ctypes.wstring_at(value.value, value_size.value).split("\x00", 1)[0].strip()
            except (TypeError, ValueError):
                continue
            if text:
                return text
    return None


def _windows_file_version(executable: Path) -> str | None:
    """Read a Windows executable's fixed or string version resource."""
    if sys.platform != "win32":
        return None
    try:
        version_dll = ctypes.WinDLL("version.dll", use_last_error=True, winmode=0x00000800)
        get_size = version_dll.GetFileVersionInfoSizeW
        get_info = version_dll.GetFileVersionInfoW
        query_value = version_dll.VerQueryValueW

        get_size.argtypes = [wintypes.LPCWSTR, ctypes.POINTER(wintypes.DWORD)]
        get_size.restype = wintypes.DWORD
        get_info.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD, ctypes.c_void_p]
        get_info.restype = wintypes.BOOL
        query_value.argtypes = [
            ctypes.c_void_p,
            wintypes.LPCWSTR,
            ctypes.POINTER(ctypes.c_void_p),
            ctypes.POINTER(wintypes.UINT),
        ]
        query_value.restype = wintypes.BOOL

        ignored_handle = wintypes.DWORD()
        size = get_size(str(executable), ctypes.byref(ignored_handle))
        if not size:
            return None
        data = ctypes.create_string_buffer(size)
        if not get_info(str(executable), 0, size, data):
            return None

        value = ctypes.c_void_p()
        value_size = wintypes.UINT()
        fixed_version = None
        if query_value(data, "\\", ctypes.byref(value), ctypes.byref(value_size)):
            if value.value and value_size.value >= ctypes.sizeof(_VSFixedFileInfo):
                fixed_info = ctypes.cast(value, ctypes.POINTER(_VSFixedFileInfo)).contents
                if fixed_info.dwSignature == 0xFEEF04BD:
                    if fixed_info.dwProductVersionMS or fixed_info.dwProductVersionLS:
                        fixed_version = _format_fixed_file_version(
                            fixed_info.dwProductVersionMS,
                            fixed_info.dwProductVersionLS,
                        )
                    else:
                        fixed_version = _format_fixed_file_version(
                            fixed_info.dwFileVersionMS,
                            fixed_info.dwFileVersionLS,
                        )
        if fixed_version:
            return fixed_version
        return _read_windows_version_string(data, query_value)
    except (AttributeError, OSError, TypeError, ValueError):
        return None


@dataclass(frozen=True, slots=True)
class StudioProbe:
    executable: Path
    version: str | None
    cli_available: bool
    capabilities: frozenset[str]
    message: str


_REQUIRED_CAPABILITIES = frozenset(
    {
        "machine_profiles",
        "filament_profiles",
        "orientation",
        "arrangement",
        "slicing",
        "export_3mf",
    }
)
_CAPABILITY_PATTERNS = {
    "machine_profiles": (r"--load[-_]settings\b", r"--load[-_]machine\b"),
    "filament_profiles": (r"--load[-_]filaments?\b",),
    "orientation": (r"--orient\b",),
    "rotation_x": (r"--rotate-x\b",),
    "rotation_y": (r"--rotate-y\b",),
    "rotation_z": (r"--rotate(?:\s|$)",),
    "arrangement": (r"--arrange\b",),
    "slicing": (r"--slice\b",),
    "export_3mf": (r"--export-3mf\b", r"--export\s+3mf\b"),
}


def _combined_output(result: subprocess.CompletedProcess[str]) -> str:
    return "\n".join(part for part in (result.stdout, result.stderr) if part).strip()


def _first_line(value: str) -> str | None:
    return next((line.strip() for line in value.splitlines() if line.strip()), None)


def _detect_capabilities(help_text: str) -> frozenset[str]:
    return frozenset(
        name
        for name, patterns in _CAPABILITY_PATTERNS.items()
        if any(re.search(pattern, help_text, flags=re.IGNORECASE) for pattern in patterns)
    )



class _COORD(ctypes.Structure):
    _fields_ = [("X", wintypes.SHORT), ("Y", wintypes.SHORT)]


class _STARTUPINFOW(ctypes.Structure):
    _fields_ = [
        ("cb", wintypes.DWORD),
        ("lpReserved", wintypes.LPWSTR),
        ("lpDesktop", wintypes.LPWSTR),
        ("lpTitle", wintypes.LPWSTR),
        ("dwX", wintypes.DWORD),
        ("dwY", wintypes.DWORD),
        ("dwXSize", wintypes.DWORD),
        ("dwYSize", wintypes.DWORD),
        ("dwXCountChars", wintypes.DWORD),
        ("dwYCountChars", wintypes.DWORD),
        ("dwFillAttribute", wintypes.DWORD),
        ("dwFlags", wintypes.DWORD),
        ("wShowWindow", wintypes.WORD),
        ("cbReserved2", wintypes.WORD),
        ("lpReserved2", ctypes.POINTER(wintypes.BYTE)),
        ("hStdInput", wintypes.HANDLE),
        ("hStdOutput", wintypes.HANDLE),
        ("hStdError", wintypes.HANDLE),
    ]


class _STARTUPINFOEXW(ctypes.Structure):
    _fields_ = [
        ("StartupInfo", _STARTUPINFOW),
        ("lpAttributeList", ctypes.c_void_p),
    ]


class _PROCESS_INFORMATION(ctypes.Structure):
    _fields_ = [
        ("hProcess", wintypes.HANDLE),
        ("hThread", wintypes.HANDLE),
        ("dwProcessId", wintypes.DWORD),
        ("dwThreadId", wintypes.DWORD),
    ]


def _windows_pseudoconsole_run(
    command: list[str],
    *,
    timeout_seconds: int,
    cwd: Path | None = None,
) -> subprocess.CompletedProcess[str]:
    """Run a Windows command attached to a pseudoconsole and capture its output.

    Some console applications write help through console APIs instead of the
    standard handles redirected by subprocess.run. ConPTY captures that output.
    """
    if sys.platform != "win32":
        raise OSError("Windows pseudoconsole capture is only available on Windows.")
    if not command:
        raise ValueError("command must not be empty")
    if timeout_seconds <= 0:
        raise ValueError("timeout_seconds must be greater than zero")

    try:
        kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
        create_pipe = kernel32.CreatePipe
        create_pseudoconsole = kernel32.CreatePseudoConsole
        close_pseudoconsole = kernel32.ClosePseudoConsole
        initialize_attributes = kernel32.InitializeProcThreadAttributeList
        update_attribute = kernel32.UpdateProcThreadAttribute
        delete_attributes = kernel32.DeleteProcThreadAttributeList
        create_process = kernel32.CreateProcessW
        wait_for_single_object = kernel32.WaitForSingleObject
        get_exit_code = kernel32.GetExitCodeProcess
        terminate_process = kernel32.TerminateProcess
        read_file = kernel32.ReadFile
        close_handle = kernel32.CloseHandle
    except AttributeError as exc:
        raise OSError("Windows pseudoconsole APIs are unavailable.") from exc

    create_pipe.argtypes = [
        ctypes.POINTER(wintypes.HANDLE),
        ctypes.POINTER(wintypes.HANDLE),
        ctypes.c_void_p,
        wintypes.DWORD,
    ]
    create_pipe.restype = wintypes.BOOL
    create_pseudoconsole.argtypes = [
        _COORD,
        wintypes.HANDLE,
        wintypes.HANDLE,
        wintypes.DWORD,
        ctypes.POINTER(wintypes.HANDLE),
    ]
    create_pseudoconsole.restype = ctypes.c_long
    close_pseudoconsole.argtypes = [wintypes.HANDLE]
    close_pseudoconsole.restype = None
    initialize_attributes.argtypes = [
        ctypes.c_void_p,
        wintypes.DWORD,
        wintypes.DWORD,
        ctypes.POINTER(ctypes.c_size_t),
    ]
    initialize_attributes.restype = wintypes.BOOL
    update_attribute.argtypes = [
        ctypes.c_void_p,
        wintypes.DWORD,
        ctypes.c_size_t,
        ctypes.c_void_p,
        ctypes.c_size_t,
        ctypes.c_void_p,
        ctypes.POINTER(ctypes.c_size_t),
    ]
    update_attribute.restype = wintypes.BOOL
    delete_attributes.argtypes = [ctypes.c_void_p]
    delete_attributes.restype = None
    create_process.argtypes = [
        wintypes.LPCWSTR,
        wintypes.LPWSTR,
        ctypes.c_void_p,
        ctypes.c_void_p,
        wintypes.BOOL,
        wintypes.DWORD,
        ctypes.c_void_p,
        wintypes.LPCWSTR,
        ctypes.POINTER(_STARTUPINFOEXW),
        ctypes.POINTER(_PROCESS_INFORMATION),
    ]
    create_process.restype = wintypes.BOOL
    wait_for_single_object.argtypes = [wintypes.HANDLE, wintypes.DWORD]
    wait_for_single_object.restype = wintypes.DWORD
    get_exit_code.argtypes = [wintypes.HANDLE, ctypes.POINTER(wintypes.DWORD)]
    get_exit_code.restype = wintypes.BOOL
    terminate_process.argtypes = [wintypes.HANDLE, wintypes.UINT]
    terminate_process.restype = wintypes.BOOL
    read_file.argtypes = [
        wintypes.HANDLE,
        ctypes.c_void_p,
        wintypes.DWORD,
        ctypes.POINTER(wintypes.DWORD),
        ctypes.c_void_p,
    ]
    read_file.restype = wintypes.BOOL
    close_handle.argtypes = [wintypes.HANDLE]
    close_handle.restype = wintypes.BOOL

    def close_if_open(handle: wintypes.HANDLE | None) -> None:
        if handle is not None and handle.value:
            close_handle(handle)

    input_read = wintypes.HANDLE()
    input_write = wintypes.HANDLE()
    output_read = wintypes.HANDLE()
    output_write = wintypes.HANDLE()
    console = wintypes.HANDLE()
    process_info = _PROCESS_INFORMATION()
    attribute_buffer = None
    attributes_initialized = False
    process_started = False
    process_finished = False
    reader = None
    captured: list[bytes] = []

    try:
        if not create_pipe(ctypes.byref(input_read), ctypes.byref(input_write), None, 0):
            raise ctypes.WinError(ctypes.get_last_error())
        if not create_pipe(ctypes.byref(output_read), ctypes.byref(output_write), None, 0):
            raise ctypes.WinError(ctypes.get_last_error())

        result = create_pseudoconsole(
            _COORD(120, 30),
            input_read,
            output_write,
            0,
            ctypes.byref(console),
        )
        if result < 0:
            raise OSError(f"CreatePseudoConsole failed with HRESULT 0x{result & 0xFFFFFFFF:08X}")

        # The pseudoconsole owns its ends of these pipes; the parent keeps only
        # the output reader. Closing input also gives noninteractive commands EOF.
        close_if_open(input_read)
        input_read = wintypes.HANDLE()
        close_if_open(output_write)
        output_write = wintypes.HANDLE()
        close_if_open(input_write)
        input_write = wintypes.HANDLE()

        attribute_size = ctypes.c_size_t()
        initialize_attributes(None, 1, 0, ctypes.byref(attribute_size))
        if not attribute_size.value or attribute_size.value > 65536:
            raise OSError("Windows could not size the pseudoconsole process attributes.")
        attribute_buffer = ctypes.create_string_buffer(attribute_size.value)
        attribute_pointer = ctypes.cast(attribute_buffer, ctypes.c_void_p)
        if not initialize_attributes(attribute_pointer, 1, 0, ctypes.byref(attribute_size)):
            raise ctypes.WinError(ctypes.get_last_error())
        attributes_initialized = True

        # PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE from the Windows SDK.
        if not update_attribute(
            attribute_pointer,
            0,
            0x00020016,
            ctypes.byref(console),
            ctypes.sizeof(console),
            None,
            None,
        ):
            raise ctypes.WinError(ctypes.get_last_error())

        startup = _STARTUPINFOEXW()
        startup.StartupInfo.cb = ctypes.sizeof(_STARTUPINFOEXW)
        startup.lpAttributeList = attribute_pointer
        process_info = _PROCESS_INFORMATION()
        command_line = ctypes.create_unicode_buffer(
            subprocess.list2cmdline([str(argument) for argument in command])
        )
        extended_startup_info_present = 0x00080000
        if not create_process(
            str(command[0]),
            command_line,
            None,
            None,
            False,
            extended_startup_info_present,
            None,
            str(cwd) if cwd is not None else None,
            ctypes.byref(startup),
            ctypes.byref(process_info),
        ):
            raise ctypes.WinError(ctypes.get_last_error())
        process_started = True

        delete_attributes(attribute_pointer)
        attributes_initialized = False
        attribute_buffer = None

        def read_console_output() -> None:
            while True:
                buffer = ctypes.create_string_buffer(4096)
                bytes_read = wintypes.DWORD()
                succeeded = read_file(
                    output_read,
                    buffer,
                    len(buffer),
                    ctypes.byref(bytes_read),
                    None,
                )
                if not succeeded or not bytes_read.value:
                    return
                captured.append(buffer.raw[: bytes_read.value])

        reader = threading.Thread(target=read_console_output, name="bambuprep-console-reader", daemon=True)
        reader.start()

        wait_timeout = min(int(timeout_seconds * 1000), 0xFFFFFFFE)
        wait_result = wait_for_single_object(process_info.hProcess, wait_timeout)
        if wait_result == 0x00000102:  # WAIT_TIMEOUT
            terminate_process(process_info.hProcess, 1)
            wait_for_single_object(process_info.hProcess, 0xFFFFFFFF)
            process_finished = True
            close_pseudoconsole(console)
            console = wintypes.HANDLE()
            reader.join()
            output = b"".join(captured).decode("utf-8", errors="replace")
            raise subprocess.TimeoutExpired(command, timeout_seconds, output=output)
        if wait_result != 0:
            raise ctypes.WinError(ctypes.get_last_error())

        exit_code = wintypes.DWORD()
        if not get_exit_code(process_info.hProcess, ctypes.byref(exit_code)):
            raise ctypes.WinError(ctypes.get_last_error())
        process_finished = True
        close_pseudoconsole(console)
        console = wintypes.HANDLE()
        reader.join()
        output = b"".join(captured).decode("utf-8", errors="replace")
        return subprocess.CompletedProcess(command, exit_code.value, output, "")
    finally:
        if process_started and not process_finished and process_info.hProcess.value:
            terminate_process(process_info.hProcess, 1)
            wait_for_single_object(process_info.hProcess, 0xFFFFFFFF)
        if reader is not None and reader.is_alive():
            reader.join(timeout=2)
        if attributes_initialized and attribute_buffer is not None:
            delete_attributes(ctypes.cast(attribute_buffer, ctypes.c_void_p))
        if console.value:
            close_pseudoconsole(console)
        close_if_open(input_read)
        close_if_open(input_write)
        close_if_open(output_write)
        close_if_open(output_read)
        close_if_open(process_info.hThread)
        close_if_open(process_info.hProcess)

def probe_studio(executable: Path, timeout_seconds: int = 20) -> StudioProbe:
    """Probe version and CLI help without shell expansion or modifying local files.

    Each invocation has its own timeout. Capabilities describe options observed in
    the installed executable's help output; they do not establish slicing support.
    A real Windows proof is still required before enabling any slicing workflow.
    """
    executable = Path(executable)
    if timeout_seconds <= 0:
        raise ValueError("timeout_seconds must be greater than zero")

    if not executable.is_file():
        return StudioProbe(
            executable=executable,
            version=None,
            cli_available=False,
            capabilities=frozenset(),
            message=f"Bambu Studio executable not found: {executable}",
        )

    try:
        # Prefer Windows PE metadata so unsupported CLI switches such as
        # "--version" are not needlessly launched on installed Studio builds.
        version = _windows_file_version(executable)
        version_from_metadata = version is not None
        if version is None:
            version_result = subprocess.run(
                [str(executable), "--version"],
                capture_output=True,
                text=True,
                check=False,
                shell=False,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
                timeout=timeout_seconds,
            )
            version_text = _combined_output(version_result)
            version = _first_line(version_text) if version_result.returncode == 0 else None

        help_result = subprocess.run(
            [str(executable), "--help"],
            capture_output=True,
            text=True,
            check=False,
            shell=False,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            timeout=timeout_seconds,
        )
        if not _combined_output(help_result) and sys.platform == "win32":
            help_result = _windows_pseudoconsole_run(
                [str(executable), "--help"],
                timeout_seconds=timeout_seconds,
                cwd=executable.parent,
            )
    except subprocess.TimeoutExpired:
        version = locals().get("version")
        version_from_metadata = locals().get("version_from_metadata", False)
        if version is None:
            version = _windows_file_version(executable)
            version_from_metadata = version is not None
        return StudioProbe(
            executable=executable,
            version=version,
            cli_available=False,
            capabilities=frozenset(),
            message=f"Bambu Studio CLI timed out after {timeout_seconds} seconds.",
        )
    except OSError as exc:
        version = locals().get("version")
        version_from_metadata = locals().get("version_from_metadata", False)
        if version is None:
            version = _windows_file_version(executable)
            version_from_metadata = version is not None
        return StudioProbe(
            executable=executable,
            version=version,
            cli_available=False,
            capabilities=frozenset(),
            message=f"Could not run Bambu Studio executable ({type(exc).__name__}).",
        )

    version_note = " The version came from Windows executable metadata." if version_from_metadata else ""
    help_text = _combined_output(help_result)
    if not help_text:
        message = (
            f"Bambu Studio CLI returned no response in captured stdout/stderr to --help "
            f"(exit code {help_result.returncode}); it may have written help directly to the console."
            f"{version_note}"
        )
    elif help_result.returncode != 0:
        message = "Bambu Studio CLI returned a non-zero exit code for --help." + version_note
    else:
        message = ""
    if message:
        return StudioProbe(
            executable=executable,
            version=version,
            cli_available=False,
            capabilities=frozenset(),
            message=message,
        )

    capabilities = _detect_capabilities(help_text)
    missing = sorted(_REQUIRED_CAPABILITIES - capabilities)
    if missing:
        message = "Help responded, but required capabilities were not detected: " + ", ".join(missing) + version_note
    else:
        message = "Help responded and the expected CLI options were detected; Windows integration is unverified." + version_note

    return StudioProbe(
        executable=executable,
        version=version,
        cli_available=True,
        capabilities=capabilities,
        message=message,
    )
