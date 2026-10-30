"""Minimal native Qt workflow for local STL analysis and optional consented advice."""

from __future__ import annotations

from concurrent.futures import Future
from pathlib import Path
from typing import Any, Callable

from PySide6.QtCore import QTimer, Qt
from PySide6.QtGui import QPixmap
from PySide6.QtWidgets import (
    QCheckBox,
    QComboBox,
    QFileDialog,
    QFormLayout,
    QHBoxLayout,
    QLabel,
    QMainWindow,
    QMessageBox,
    QPlainTextEdit,
    QPushButton,
    QScrollArea,
    QTabWidget,
    QVBoxLayout,
    QWidget,
)

from bambuprep.bambu.profiles import ProfileCatalog, PrinterProfile
from bambuprep.domain.models import JobRecord, PrinterSelection
from bambuprep.mesh.analyzer import MeshReport
from bambuprep.mesh.loader import load_stl
from bambuprep.mesh.render import render_views
from bambuprep.recommendations.openai_client import CONSENT_NOTICE
from bambuprep.recommendations.schema import Recommendation
from bambuprep.ui.consent import run_consented_action
from bambuprep.ui.settings_dialog import SettingsDialog
from bambuprep.workflow.runner import WorkflowTaskRunner
from bambuprep.workflow.service import WorkflowService


class BambuPrepMainWindow(QMainWindow):
    """Run long operations in workers and apply all widget changes on the Qt thread."""

    def __init__(
        self,
        workflow: WorkflowService,
        catalog: ProfileCatalog,
        task_runner: WorkflowTaskRunner,
        key_store: Any = None,
        preferences: Any = None,
    ) -> None:
        super().__init__()
        if not catalog.printers:
            raise ValueError("The installed profile catalog contains no supported A1 mini setup")
        self._workflow = workflow
        self._catalog = catalog
        self._task_runner = task_runner
        self._key_store = key_store
        self._preferences = preferences
        self._job: JobRecord | None = None
        self._report: MeshReport | None = None
        self._recommendation: Recommendation | None = None
        self._busy = False

        self.setWindowTitle("BambuPrep — análise local")
        self.resize(820, 680)
        self.setAcceptDrops(True)
        self._build_widgets()
        self._populate_profiles()
        self._refresh_controls()

    def _build_widgets(self) -> None:
        central = QWidget(self)
        layout = QVBoxLayout(central)

        self.open_button = QPushButton("Selecionar STL…", central)
        self.open_button.clicked.connect(self._choose_stl)
        layout.addWidget(self.open_button)

        utility_buttons = QHBoxLayout()
        self.settings_button = QPushButton("Configurações locais…", central)
        self.settings_button.clicked.connect(self._open_settings)
        utility_buttons.addWidget(self.settings_button)
        self.delete_history_button = QPushButton("Apagar histórico local…", central)
        self.delete_history_button.clicked.connect(self._delete_history)
        utility_buttons.addWidget(self.delete_history_button)
        layout.addLayout(utility_buttons)

        self.file_label = QLabel("Nenhum STL selecionado", central)
        layout.addWidget(self.file_label)

        form = QFormLayout()
        self.profile_combo = QComboBox(central)
        self.profile_combo.currentIndexChanged.connect(self._profile_changed)
        form.addRow("A1 mini e bico", self.profile_combo)

        self.filament_combo = QComboBox(central)
        self.filament_combo.currentIndexChanged.connect(self._configuration_changed)
        form.addRow("Filamento", self.filament_combo)
        self.plate_combo = QComboBox(central)
        self.plate_combo.currentIndexChanged.connect(self._configuration_changed)
        form.addRow("Placa", self.plate_combo)
        layout.addLayout(form)

        self.nozzle_confirm = QCheckBox(
            "Confirmei fisicamente que este é o bico instalado para este trabalho",
            central,
        )
        self.nozzle_confirm.toggled.connect(self._refresh_controls)
        layout.addWidget(self.nozzle_confirm)

        buttons = QHBoxLayout()
        self.analyze_button = QPushButton("Analisar localmente", central)
        self.analyze_button.clicked.connect(self._analyze)
        buttons.addWidget(self.analyze_button)
        self.recommend_button = QPushButton("Pedir recomendação OpenAI…", central)
        self.recommend_button.clicked.connect(self._recommend)
        buttons.addWidget(self.recommend_button)
        layout.addLayout(buttons)

        self.status_label = QLabel("Selecione um STL para começar.", central)
        self.status_label.setWordWrap(True)
        layout.addWidget(self.status_label)

        self.report_view = QPlainTextEdit(central)
        self.report_view.setReadOnly(True)
        self.report_view.setPlaceholderText("As medições e os avisos locais aparecerão aqui.")
        self.tabs = QTabWidget(central)
        report_tab = QWidget(self.tabs)
        report_layout = QVBoxLayout(report_tab)
        report_layout.addWidget(self.report_view)
        self.tabs.addTab(report_tab, "Relatório")
        self._view_labels: dict[str, QLabel] = {}
        for view_id, title in (
            ("front", "Frente"),
            ("side", "Lado"),
            ("top", "Topo"),
            ("risk", "Riscos"),
        ):
            image_label = QLabel("A vista será gerada após a análise local.", self.tabs)
            image_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
            scroll = QScrollArea(self.tabs)
            scroll.setWidgetResizable(True)
            scroll.setWidget(image_label)
            self._view_labels[view_id] = image_label
            self.tabs.addTab(scroll, title)
        layout.addWidget(self.tabs, stretch=1)

        self.setCentralWidget(central)

    def _populate_profiles(self) -> None:
        self.profile_combo.blockSignals(True)
        self.profile_combo.clear()
        for profile in self._catalog.printers:
            label = f"A1 mini · bico {profile.nozzle_mm:g} mm"
            self.profile_combo.addItem(label, profile)
        self.profile_combo.blockSignals(False)
        self._profile_changed(self.profile_combo.currentIndex())

    def _profile_changed(self, _index: int) -> None:
        self._configuration_changed()
        profile = self._selected_profile()
        self.nozzle_confirm.setChecked(False)
        self.filament_combo.clear()
        self.plate_combo.clear()
        if profile is not None:
            self.filament_combo.addItem(profile.generic_pla_profile_id, profile.generic_pla_profile_id)
            self.plate_combo.addItem(profile.plate_id, profile.plate_id)
        self._refresh_controls()

    def _configuration_changed(self, *_args: object) -> None:
        if self._report is not None:
            self._report = None
            self._recommendation = None
            self.report_view.clear()
            self._clear_views()
            self.status_label.setText("A configuração mudou. Analise novamente antes de pedir recomendações.")
            self._refresh_controls()

    def _choose_stl(self) -> None:
        filename, _ = QFileDialog.getOpenFileName(
            self,
            "Selecionar STL local",
            "",
            "Arquivos STL (*.stl)",
        )
        if not filename:
            return
        self._open_stl_path(Path(filename))

    def _open_stl_path(self, path: Path) -> None:
        if self._busy:
            return
        path = Path(path)
        if path.suffix.lower() != ".stl" or not path.is_file():
            QMessageBox.warning(self, "BambuPrep", "Selecione um arquivo STL local existente.")
            return
        self._set_busy(True, "Validando STL local…")
        self._submit(self._workflow.create_job, (path,), self._job_created)

    @staticmethod
    def _dropped_stl_path(mime_data: Any) -> Path | None:
        if not mime_data.hasUrls():
            return None
        urls = mime_data.urls()
        if len(urls) != 1 or not urls[0].isLocalFile():
            return None
        path = Path(urls[0].toLocalFile())
        if path.suffix.lower() != ".stl" or not path.is_file():
            return None
        return path

    def dragEnterEvent(self, event) -> None:
        if not self._busy and self._dropped_stl_path(event.mimeData()) is not None:
            event.acceptProposedAction()
        else:
            event.ignore()

    def dropEvent(self, event) -> None:
        path = self._dropped_stl_path(event.mimeData())
        if self._busy or path is None:
            event.ignore()
            return
        event.acceptProposedAction()
        self._open_stl_path(path)

    def _open_settings(self) -> None:
        dialog = SettingsDialog(self._key_store, self, preferences=self._preferences)
        dialog.exec()

    def _delete_history(self) -> None:
        if self._busy:
            return
        answer = QMessageBox.question(
            self,
            "Apagar histórico local",
            "Remover os registros de trabalhos do BambuPrep? Os STL originais e arquivos escolhidos "
            "pelo usuário não serão apagados.",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
            QMessageBox.StandardButton.No,
        )
        if answer != QMessageBox.StandardButton.Yes:
            return
        try:
            removed = self._workflow.delete_history()
        except Exception as error:
            self._show_error(error)
            return
        self._job = None
        self._report = None
        self._recommendation = None
        self.nozzle_confirm.setChecked(False)
        self.file_label.setText("Nenhum STL selecionado")
        self.report_view.clear()
        self._clear_views()
        self.status_label.setText(f"Histórico local removido ({removed} trabalhos). STL originais preservados.")
        self._refresh_controls()

    def _job_created(self, job: JobRecord) -> None:
        self._job = job
        self._report = None
        self._recommendation = None
        self.nozzle_confirm.setChecked(False)
        self.file_label.setText(job.source_path.name)
        self.report_view.clear()
        self._clear_views()
        self.status_label.setText("STL validado localmente. Confirme o bico antes de analisar.")
        self._refresh_controls()

    def _analyze(self) -> None:
        job = self._job
        profile = self._selected_profile()
        if job is None or profile is None or not self.nozzle_confirm.isChecked():
            return
        selection = PrinterSelection(
            printer_id=profile.printer_id,
            nozzle_mm=profile.nozzle_mm,
            filament_id=str(self.filament_combo.currentData()),
            plate_id=str(self.plate_combo.currentData()),
        )
        self._report = None
        self._recommendation = None
        self.report_view.clear()
        self._clear_views()
        self._set_busy(True, "Análise geométrica local em andamento…")
        self._submit(self._analyze_and_render, (job, selection), self._analysis_finished)

    def _analyze_and_render(
        self,
        job: JobRecord,
        selection: PrinterSelection,
    ) -> tuple[MeshReport, dict[str, bytes]]:
        report = self._workflow.analyze(job.id, selection)
        document = load_stl(job.source_path)
        if document.sha256 != job.source_sha256:
            raise ValueError("O STL mudou após a análise; selecione novamente o arquivo antes de exibir vistas.")
        return report, render_views(document, report)

    def _analysis_finished(self, result: tuple[MeshReport, dict[str, bytes]]) -> None:
        report, views = result
        self._report = report
        self._recommendation = None
        self.status_label.setText("Análise local concluída. Revise as medições e os avisos abaixo.")
        self.report_view.setPlainText(_format_report(report))
        for view_id, image_bytes in views.items():
            image = QPixmap()
            if not image.loadFromData(image_bytes, "PNG"):
                self._clear_views()
                raise ValueError(f"A vista local {view_id} não pôde ser carregada como PNG.")
            self._view_labels[view_id].setPixmap(image)
        self._refresh_controls()

    def _recommend(self) -> None:
        job = self._job
        if job is None or self._report is None or self._busy:
            return

        def prompt() -> bool:
            buttons = QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
            answer = QMessageBox.question(
                self,
                "Consentimento para este trabalho",
                f"{CONSENT_NOTICE}\n\nPermitir este envio agora?",
                buttons,
                QMessageBox.StandardButton.No,
            )
            return answer == QMessageBox.StandardButton.Yes

        run_consented_action(
            prompt=prompt,
            action=lambda consent: self._start_recommendation(job, consent),
        )

    def _start_recommendation(self, job: JobRecord, consent: bool) -> None:
        self._set_busy(True, "Preparando vistas locais e solicitando recomendação consentida…")
        self._submit(self._workflow.recommend, (job.id, consent), self._recommendation_finished)

    def _recommendation_finished(self, recommendation: Recommendation | None) -> None:
        if recommendation is None:
            self.status_label.setText(
                "A recomendação OpenAI está indisponível; a análise local continua disponível."
            )
        else:
            self._recommendation = recommendation
            self.status_label.setText(
                "Recomendação validada. Ela não configura, fatia nem inicia uma impressão."
            )
            self.report_view.appendPlainText("\n" + _format_recommendation(recommendation))
        self._refresh_controls()

    def _submit(
        self,
        operation: Callable[..., Any],
        args: tuple[Any, ...],
        on_success: Callable[[Any], None],
    ) -> None:
        try:
            future: Future[Any] = self._task_runner.submit(operation, *args)
        except Exception as error:
            self._set_busy(False, "Não foi possível iniciar a tarefa local.")
            self._show_error(error)
            return

        timer = QTimer(self)
        timer.setInterval(50)

        def poll_result() -> None:
            if not future.done():
                return
            timer.stop()
            timer.deleteLater()
            try:
                value = future.result()
            except Exception as error:
                self._set_busy(False, "A tarefa local terminou com erro.")
                self._show_error(error)
                return
            self._set_busy(False, "")
            on_success(value)

        timer.timeout.connect(poll_result)
        timer.start()

    def _selected_profile(self) -> PrinterProfile | None:
        profile = self.profile_combo.currentData()
        return profile if isinstance(profile, PrinterProfile) else None

    def _refresh_controls(self, *_args: object) -> None:
        has_job = self._job is not None
        self.open_button.setEnabled(not self._busy)
        self.settings_button.setEnabled(not self._busy)
        self.delete_history_button.setEnabled(has_job and not self._busy)
        self.profile_combo.setEnabled(not self._busy)
        self.filament_combo.setEnabled(not self._busy)
        self.plate_combo.setEnabled(not self._busy)
        self.nozzle_confirm.setEnabled(has_job and not self._busy)
        self.analyze_button.setEnabled(
            has_job and self.nozzle_confirm.isChecked() and not self._busy
        )
        self.recommend_button.setEnabled(
            has_job and self._report is not None and self._recommendation is None and not self._busy
        )

    def _set_busy(self, busy: bool, message: str) -> None:
        self._busy = busy
        if message:
            self.status_label.setText(message)
        self._refresh_controls()

    def _clear_views(self) -> None:
        for label in getattr(self, "_view_labels", {}).values():
            label.clear()

    def _show_error(self, error: Exception) -> None:
        QMessageBox.warning(self, "BambuPrep", str(error))


def _format_report(report: MeshReport) -> str:
    dimensions = " × ".join(f"{value:.2f}" for value in report.dimensions_mm)
    lines = [
        f"Dimensões interpretadas como mm: {dimensions}",
        f"Triângulos: {report.triangle_count}",
        f"Componentes: {report.component_count}",
        f"Malha fechada (watertight): {'sim' if report.watertight else 'não'}",
        f"Faces degeneradas: {report.degenerate_faces}",
        f"Faces duplicadas: {report.duplicate_faces}",
        f"Área estimada de balanço: {report.overhang_area_ratio:.1%}",
        f"Área estimada de contato: {report.contact_area_estimate:.2f} mm²",
    ]
    if report.volume_mm3 is not None:
        lines.append(f"Volume válido: {report.volume_mm3:.2f} mm³")
    if report.scale_warning:
        lines.append(f"Revisar escala: {report.scale_warning}")
    if report.warnings:
        lines.append("\nAvisos:")
        lines.extend(f"• {warning}" for warning in report.warnings)
    lines.append("\nAs orientações são heurísticas e não garantem uma impressão bem-sucedida.")
    return "\n".join(lines)


def _format_recommendation(recommendation: Recommendation) -> str:
    lines = [
        "Recomendação OpenAI validada contra medições e opções locais:",
        f"Orientação: {recommendation.orientation_id}",
        f"Suportes: {'sim' if recommendation.support_enabled else 'não'}",
    ]
    if recommendation.support_option:
        lines.append(f"Opção de suporte: {recommendation.support_option}")
    lines.append(f"Aderência: {recommendation.adhesion_option}")
    lines.append(f"Confiança informada: {recommendation.confidence:.0%}")
    lines.extend(f"• {reason}" for reason in recommendation.rationale)
    return "\n".join(lines)
