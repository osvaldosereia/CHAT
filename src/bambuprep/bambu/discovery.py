"""Read-only discovery for a locally installed Bambu Studio executable."""

from __future__ import annotations

import ctypes
import re
import subprocess
import sys
import threading
import time
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

def _windows_pseudoconsole_run(
    command: list[str],
    *,
    timeout_seconds: int,
    cwd: Path | None = None,
) -> subprocess.CompletedProcess[str]:
    """Capture a console application's screen output through Windows ConPTY."""
    if sys.platform != "win32":
        raise NotImplementedError("Windows pseudoconsole is available only on Windows")
    if not command or timeout_seconds <= 0:
        raise ValueError("command and a positive timeout are required")

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

    try:
        kernel32 = ctypes.WinDLL("kernel32", use_last_error=True, winmode=0x00000800)
        create_pseudo_console = kernel32.CreatePseudoConsole
        close_pseudo_console = kernel32.ClosePseudoConsole
    except (AttributeError, OSError) as exc:
        raise NotImplementedError("Windows pseudoconsole API is unavailable") from exc

    HANDLE = wintypes.HANDLE
    DWORD = wintypes.DWORD
    BOOL = wintypes.BOOL
    SIZE_T = ctypes.c_size_t
    kernel32.CreatePipe.argtypes = [ctypes.POINTER(HANDLE), ctypes.POINTER(HANDLE), ctypes.c_void_p, DWORD]
    kernel32.CreatePipe.restype = BOOL
    create_pseudo_console.argtypes = [_COORD, HANDLE, HANDLE, DWORD, ctypes.POINTER(HANDLE)]
    create_pseudo_console.restype = ctypes.c_long
    close_pseudo_console.argtypes = [HANDLE]
    close_pseudo_console.restype = None
    kernel32.InitializeProcThreadAttributeList.argtypes = [
        ctypes.c_void_p, DWORD, DWORD, ctypes.POINTER(SIZE_T)
    ]
    kernel32.InitializeProcThreadAttributeList.restype = BOOL
    kernel32.UpdateProcThreadAttribute.argtypes = [
        ctypes.c_void_p, DWORD, SIZE_T, ctypes.c_void_p, SIZE_T, ctypes.c_void_p,
        ctypes.POINTER(SIZE_T)
    ]
    kernel32.UpdateProcThreadAttribute.restype = BOOL
    kernel32.DeleteProcThreadAttributeList.argtypes = [ctypes.c_void_p]
    kernel32.DeleteProcThreadAttributeList.restype = None
    kernel32.CreateProcessW.argtypes = [
        wintypes.LPCWSTR, wintypes.LPWSTR, ctypes.c_void_p, ctypes.c_void_p, BOOL,
        DWORD, ctypes.c_void_p, wintypes.LPCWSTR, ctypes.POINTER(_STARTUPINFOEXW),
        ctypes.POINTER(_PROCESS_INFORMATION)
    ]
    kernel32.CreateProcessW.restype = BOOL
    kernel32.ReadFile.argtypes = [HANDLE, ctypes.c_void_p, DWORD, ctypes.POINTER(DWORD), ctypes.c_void_p]
    kernel32.ReadFile.restype = BOOL
    kernel32.WaitForSingleObject.argtypes = [HANDLE, DWORD]
    kernel32.WaitForSingleObject.restype = DWORD
    kernel32.GetExitCodeProcess.argtypes = [HANDLE, ctypes.POINTER(DWORD)]
    kernel32.GetExitCodeProcess.restype = BOOL
    kernel32.TerminateProcess.argtypes = [HANDLE, wintypes.UINT]
    kernel32.TerminateProcess.restype = BOOL
    kernel32.CloseHandle.argtypes = [HANDLE]
    kernel32.CloseHandle.restype = BOOL

    def _raise_last_error(operation: str) -> OSError:
        return OSError(ctypes.get_last_error(), f"Windows {operation} failed")

    def _handle_value(handle: HANDLE | int | None) -> int | None:
        if isinstance(handle, int):
            return handle
        return handle.value if handle is not None else None

    def _close(handle: HANDLE | int | None) -> None:
        value = _handle_value(handle)
        if value:
            kernel32.CloseHandle(HANDLE(value))
            if not isinstance(handle, int):
                handle.value = None

    input_read = HANDLE()
    input_write = HANDLE()
    output_read = HANDLE()
    output_write = HANDLE()
    pseudo_console = HANDLE()
    process_info = _PROCESS_INFORMATION()
    attribute_list = None
    attribute_list_ptr = None
    attributes_initialized = False
    reader = None
    output = bytearray()
    output_overflow = threading.Event()
    reader_errors: list[int] = []
    process_finished = False
    timed_out = False
    MAX_OUTPUT_BYTES = 2 * 1024 * 1024
    WAIT_OBJECT_0 = 0
    WAIT_TIMEOUT = 0x00000102
    WAIT_FAILED = 0xFFFFFFFF
    ERROR_BUFFER_OVERFLOW = 111

    try:
        if not kernel32.CreatePipe(ctypes.byref(input_read), ctypes.byref(input_write), None, 0):
            raise _raise_last_error("input pipe creation")
        if not kernel32.CreatePipe(ctypes.byref(output_read), ctypes.byref(output_write), None, 0):
            raise _raise_last_error("output pipe creation")
        result = create_pseudo_console(
            _COORD(160, 1000), input_read, output_write, 0, ctypes.byref(pseudo_console)
        )
        if result < 0:
            raise OSError(result & 0xFFFFFFFF, "Windows pseudoconsole creation failed")
        _close(input_read)
        _close(output_write)

        attribute_size = SIZE_T()
        kernel32.InitializeProcThreadAttributeList(None, 1, 0, ctypes.byref(attribute_size))
        if not attribute_size.value or attribute_size.value > 1024 * 1024:
            raise _raise_last_error("process attribute sizing")
        attribute_list = ctypes.create_string_buffer(attribute_size.value)
        attribute_list_ptr = ctypes.cast(attribute_list, ctypes.c_void_p)
        if not kernel32.InitializeProcThreadAttributeList(
            attribute_list_ptr, 1, 0, ctypes.byref(attribute_size)
        ):
            raise _raise_last_error("process attribute initialization")
        attributes_initialized = True
        if not kernel32.UpdateProcThreadAttribute(
            attribute_list_ptr,
            0,
            0x00020016,
            ctypes.byref(pseudo_console),
            ctypes.sizeof(pseudo_console),
            None,
            None,
        ):
            raise _raise_last_error("pseudoconsole process attribute setup")

        arguments = [str(part) for part in command]
        if any("\x00" in part for part in arguments):
            raise ValueError("command arguments cannot contain NUL")
        command_line = ctypes.create_unicode_buffer(subprocess.list2cmdline(arguments))
        startup = _STARTUPINFOEXW()
        startup.StartupInfo.cb = ctypes.sizeof(startup)
        startup.lpAttributeList = attribute_list_ptr
        if not kernel32.CreateProcessW(
            arguments[0], command_line, None, None, False, 0x00080000, None,
            str(cwd) if cwd is not None else None, ctypes.byref(startup),
            ctypes.byref(process_info)
        ):
            raise _raise_last_error("console process creation")
        _close(input_write)

        def _read_console_output() -> None:
            try:
                while True:
                    buffer = ctypes.create_string_buffer(8192)
                    bytes_read = DWORD()
                    if not kernel32.ReadFile(
                        output_read, buffer, len(buffer), ctypes.byref(bytes_read), None
                    ):
                        error_code = ctypes.get_last_error()
                        if error_code not in {6, 38, 109, 232, 995}:
                            reader_errors.append(error_code)
                        return
                    if not bytes_read.value:
                        return
                    remaining = MAX_OUTPUT_BYTES - len(output)
                    if bytes_read.value > remaining:
                        if remaining > 0:
                            output.extend(buffer.raw[:remaining])
                        output_overflow.set()
                        return
                    output.extend(buffer.raw[: bytes_read.value])
            except (OSError, ValueError) as exc:
                reader_errors.append(getattr(exc, "winerror", None) or 1)

        reader = threading.Thread(target=_read_console_output, name="bambuprep-conpty-reader", daemon=True)
        reader.start()
        deadline = time.monotonic() + timeout_seconds
        while True:
            if output_overflow.is_set():
                kernel32.TerminateProcess(process_info.hProcess, ERROR_BUFFER_OVERFLOW)
                kernel32.WaitForSingleObject(process_info.hProcess, 5000)
                process_finished = True
                break
            wait_result = kernel32.WaitForSingleObject(process_info.hProcess, 50)
            if wait_result == WAIT_OBJECT_0:
                process_finished = True
                break
            if wait_result == WAIT_FAILED:
                raise _raise_last_error("process wait")
            if wait_result != WAIT_TIMEOUT:
                raise OSError(int(wait_result), "Windows process wait returned an unexpected status")
            if time.monotonic() >= deadline:
                timed_out = True
                kernel32.TerminateProcess(process_info.hProcess, 124)
                kernel32.WaitForSingleObject(process_info.hProcess, 5000)
                process_finished = True
                break

        close_pseudo_console(pseudo_console)
        pseudo_console.value = None
        reader.join(timeout=5)
        if reader.is_alive():
            _close(output_read)
            reader.join(timeout=1)
        if reader_errors:
            raise OSError(reader_errors[0], "Windows pseudoconsole output read failed")
        decoded_output = bytes(output).decode("utf-8", errors="replace")
        if timed_out:
            raise subprocess.TimeoutExpired(arguments, timeout_seconds, output=decoded_output, stderr="")
        exit_code = DWORD()
        if not kernel32.GetExitCodeProcess(process_info.hProcess, ctypes.byref(exit_code)):
            raise _raise_last_error("process exit-code query")
        return subprocess.CompletedProcess(
            arguments,
            ERROR_BUFFER_OVERFLOW if output_overflow.is_set() else exit_code.value,
            decoded_output,
            "",
        )
    finally:
        if _handle_value(process_info.hProcess) and not process_finished:
            kernel32.TerminateProcess(process_info.hProcess, 1)
            kernel32.WaitForSingleObject(process_info.hProcess, 1000)
        if pseudo_console and pseudo_console.value:
            close_pseudo_console(pseudo_console)
            pseudo_console.value = None
        if reader is not None and reader.is_alive():
            reader.join(timeout=1)
        if attributes_initialized and attribute_list_ptr is not None:
            kernel32.DeleteProcThreadAttributeList(attribute_list_ptr)
        _close(input_read)
        _close(input_write)
        _close(output_write)
        _close(output_read)
        _close(process_info.hThread)
        _close(process_info.hProcess)

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

        help_command = [str(executable), "--help"]
        if sys.platform == "win32":
            try:
                help_result = _windows_pseudoconsole_run(
                    help_command,
                    timeout_seconds=timeout_seconds,
                    cwd=executable.parent,
                )
            except (NotImplementedError, OSError):
                help_result = subprocess.run(
                    help_command,
                    capture_output=True,
                    text=True,
                    check=False,
                    shell=False,
                    creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
                    timeout=timeout_seconds,
                )
        else:
            help_result = subprocess.run(
                help_command,
                capture_output=True,
                text=True,
                check=False,
                shell=False,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
                timeout=timeout_seconds,
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
