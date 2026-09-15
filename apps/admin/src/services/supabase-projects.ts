import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  BriefingSummaryRow,
  CustomerSummaryRow,
  ProjectCoreRow,
  ProjectDataPort,
  ReviewSummaryRow,
  StoredAssetRow,
  TemplateRow,
  TemplateUpdate,
} from './projects';

function ensureNoError(error: { message?: string } | null, message: string): void {
  if (error) {
    throw new Error(message);
  }
}

export function createSupabaseProjectDataPort(client: SupabaseClient): ProjectDataPort {
  return {
    async getProject(projectId: string): Promise<ProjectCoreRow | null> {
      const { data, error } = await client
        .from('mug_projects')
        .select(
          'id,title,status,creation_mode,customer_id,current_briefing_id,current_art_version_id,current_mockup_id',
        )
        .eq('id', projectId)
        .maybeSingle();
      ensureNoError(error, 'Não foi possível carregar o projeto');
      return data as ProjectCoreRow | null;
    },

    async getCustomer(customerId: string): Promise<CustomerSummaryRow | null> {
      const { data, error } = await client
        .from('customers')
        .select('name,phone')
        .eq('id', customerId)
        .maybeSingle();
      ensureNoError(error, 'Não foi possível carregar o cliente');
      return data as CustomerSummaryRow | null;
    },

    async countProjectMedia(projectId: string): Promise<number> {
      const { count, error } = await client
        .from('project_media')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', projectId);
      ensureNoError(error, 'Não foi possível carregar as referências');
      return count ?? 0;
    },

    async getBriefing(briefingId: string): Promise<BriefingSummaryRow | null> {
      const { data, error } = await client
        .from('briefings')
        .select('version,main_theme,mandatory_text,ready_to_generate')
        .eq('id', briefingId)
        .maybeSingle();
      ensureNoError(error, 'Não foi possível carregar o briefing');
      return data as BriefingSummaryRow | null;
    },

    async getArtVersion(artVersionId: string): Promise<StoredAssetRow | null> {
      const { data, error } = await client
        .from('art_versions')
        .select('version,storage_bucket,storage_path')
        .eq('id', artVersionId)
        .maybeSingle();
      ensureNoError(error, 'Não foi possível carregar a arte');
      return data as StoredAssetRow | null;
    },

    async getMockupVersion(mockupId: string): Promise<StoredAssetRow | null> {
      const { data, error } = await client
        .from('mockup_versions')
        .select('version,storage_bucket,storage_path')
        .eq('id', mockupId)
        .maybeSingle();
      ensureNoError(error, 'Não foi possível carregar o mockup');
      return data as StoredAssetRow | null;
    },

    async getLatestReview(projectId: string): Promise<ReviewSummaryRow | null> {
      const { data, error } = await client
        .from('review_events')
        .select('event_type')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      ensureNoError(error, 'Não foi possível carregar a revisão');
      return data as ReviewSummaryRow | null;
    },

    async createSignedUrl(bucket: string, path: string): Promise<string> {
      const { data, error } = await client.storage.from(bucket).createSignedUrl(path, 3600);
      ensureNoError(error, 'Não foi possível abrir o arquivo privado');
      if (!data?.signedUrl) {
        throw new Error('Não foi possível abrir o arquivo privado');
      }
      return data.signedUrl;
    },

    async getActiveTemplate(): Promise<TemplateRow | null> {
      const { data, error } = await client
        .from('mug_templates')
        .select(
          'id,name,capacity_ml,art_width_mm,art_height_mm,aspect_ratio,output_width_px,output_height_px,dpi',
        )
        .eq('active', true)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      ensureNoError(error, 'Não foi possível carregar o gabarito');
      return data as TemplateRow | null;
    },

    async updateTemplate(templateId: string, update: TemplateUpdate): Promise<void> {
      const { error } = await client.from('mug_templates').update(update).eq('id', templateId);
      ensureNoError(error, 'Não foi possível salvar o gabarito');
    },
  };
}
