import type { ProjectDetailData } from '../components/ProjectDetail';
import type { MugTemplateSettings } from '../components/TemplateForm';

export interface ProjectCoreRow {
  id: string;
  title: string | null;
  status: string;
  creation_mode: 'reference' | 'from_scratch';
  customer_id: string;
  current_briefing_id: string | null;
  current_art_version_id: string | null;
  current_mockup_id: string | null;
}

export interface CustomerSummaryRow {
  name: string | null;
  phone: string | null;
}

export interface BriefingSummaryRow {
  version: number;
  main_theme: string | null;
  mandatory_text: unknown;
  ready_to_generate: boolean;
}

export interface StoredAssetRow {
  version: number;
  storage_bucket: string;
  storage_path: string;
}

export interface ReviewSummaryRow {
  event_type: string;
}

export interface TemplateRow {
  id: string;
  name: string;
  capacity_ml: number | null;
  art_width_mm: number | null;
  art_height_mm: number | null;
  aspect_ratio: number | null;
  output_width_px: number | null;
  output_height_px: number | null;
  dpi: number | null;
}

export interface TemplateUpdate {
  name: string;
  capacity_ml: number | null;
  art_width_mm: number | null;
  art_height_mm: number | null;
  aspect_ratio: number | null;
  output_width_px: number | null;
  output_height_px: number | null;
  dpi: number | null;
}

export interface ProjectDataPort {
  getProject(projectId: string): Promise<ProjectCoreRow | null>;
  getCustomer(customerId: string): Promise<CustomerSummaryRow | null>;
  countProjectMedia(projectId: string): Promise<number>;
  getBriefing(briefingId: string): Promise<BriefingSummaryRow | null>;
  getArtVersion(artVersionId: string): Promise<StoredAssetRow | null>;
  getMockupVersion(mockupId: string): Promise<StoredAssetRow | null>;
  getLatestReview(projectId: string): Promise<ReviewSummaryRow | null>;
  createSignedUrl(bucket: string, path: string): Promise<string>;
  getActiveTemplate(): Promise<TemplateRow | null>;
  updateTemplate(templateId: string, update: TemplateUpdate): Promise<void>;
}

const REVIEW_LABELS: Record<string, string> = {
  sent_for_review: 'Enviado para aprovação',
  approved: 'Aprovado pelo cliente',
  change_requested: 'Cliente solicitou alteração',
  rejected: 'Rejeitado pelo cliente',
  internal_rejected: 'Rejeitado na revisão interna',
};

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

export async function loadProjectDetail(
  port: ProjectDataPort,
  projectId: string,
): Promise<ProjectDetailData | null> {
  const project = await port.getProject(projectId);
  if (!project) return null;

  const [customer, mediaCount, briefing, art, mockup, latestReview] = await Promise.all([
    port.getCustomer(project.customer_id),
    port.countProjectMedia(project.id),
    project.current_briefing_id ? port.getBriefing(project.current_briefing_id) : Promise.resolve(null),
    project.current_art_version_id ? port.getArtVersion(project.current_art_version_id) : Promise.resolve(null),
    project.current_mockup_id ? port.getMockupVersion(project.current_mockup_id) : Promise.resolve(null),
    port.getLatestReview(project.id),
  ]);

  const [artUrl, mockupUrl] = await Promise.all([
    art ? port.createSignedUrl(art.storage_bucket, art.storage_path) : Promise.resolve(null),
    mockup ? port.createSignedUrl(mockup.storage_bucket, mockup.storage_path) : Promise.resolve(null),
  ]);

  return {
    id: project.id,
    title: project.title,
    status: project.status,
    creationMode: project.creation_mode,
    customerName: customer?.name ?? null,
    customerPhone: customer?.phone ?? null,
    briefing: briefing
      ? {
          version: briefing.version,
          mainTheme: briefing.main_theme,
          mandatoryText: toStringList(briefing.mandatory_text),
          readyToGenerate: briefing.ready_to_generate,
        }
      : null,
    mediaCount,
    artVersion: art?.version ?? null,
    artUrl,
    mockupVersion: mockup?.version ?? null,
    mockupUrl,
    latestReview: latestReview
      ? REVIEW_LABELS[latestReview.event_type] ?? latestReview.event_type
      : null,
  };
}

export async function loadTemplateSettings(
  port: ProjectDataPort,
): Promise<MugTemplateSettings> {
  const template = await port.getActiveTemplate();
  if (!template) {
    throw new Error('Nenhum gabarito ativo foi encontrado');
  }

  return {
    id: template.id,
    name: template.name,
    capacityMl: template.capacity_ml,
    artWidthMm: template.art_width_mm,
    artHeightMm: template.art_height_mm,
    aspectRatio: template.aspect_ratio,
    outputWidthPx: template.output_width_px,
    outputHeightPx: template.output_height_px,
    dpi: template.dpi,
  };
}

export async function saveTemplateSettings(
  port: ProjectDataPort,
  template: MugTemplateSettings,
): Promise<void> {
  await port.updateTemplate(template.id, {
    name: template.name,
    capacity_ml: template.capacityMl,
    art_width_mm: template.artWidthMm,
    art_height_mm: template.artHeightMm,
    aspect_ratio: template.aspectRatio,
    output_width_px: template.outputWidthPx,
    output_height_px: template.outputHeightPx,
    dpi: template.dpi,
  });
}
