import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { createSupabaseProjectDataPort } from './supabase-projects';

describe('createSupabaseProjectDataPort', () => {
  it('le detalhe, arquivos privados e gabarito do Supabase', async () => {
    const rows: Record<string, unknown> = {
      mug_projects: {
        id: 'project-1',
        title: 'Caneca Ana',
        status: 'waiting_approval',
        creation_mode: 'reference',
        customer_id: 'customer-1',
        current_briefing_id: 'briefing-1',
        current_art_version_id: 'art-1',
        current_mockup_id: 'mockup-1',
      },
      customers: { name: 'Ana', phone: '65999999999' },
      briefings: {
        version: 1,
        main_theme: 'Aniversário',
        mandatory_text: ['Ana'],
        ready_to_generate: true,
      },
      art_versions: {
        version: 1,
        storage_bucket: 'artwork-master',
        storage_path: 'project-1/art.png',
      },
      mockup_versions: {
        version: 1,
        storage_bucket: 'mockups',
        storage_path: 'project-1/mockup.png',
      },
      review_events: { event_type: 'sent_for_review' },
      mug_templates: {
        id: 'template-1',
        name: 'Caneca Tradicional Branca 350 ml',
        capacity_ml: 350,
        art_width_mm: null,
        art_height_mm: null,
        aspect_ratio: null,
        output_width_px: null,
        output_height_px: null,
        dpi: 300,
      },
    };

    const updates: unknown[] = [];
    const from = vi.fn((table: string) => {
      if (table === 'project_media') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ count: 3, error: null }),
          }),
        };
      }

      if (table === 'review_events' || table === 'mug_templates') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: rows[table], error: null }),
                }),
              }),
            }),
          }),
          update: vi.fn((payload: unknown) => {
            updates.push(payload);
            return { eq: vi.fn().mockResolvedValue({ error: null }) };
          }),
        };
      }

      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: rows[table], error: null }),
          }),
        }),
      };
    });

    const createSignedUrl = vi.fn().mockResolvedValue({
      data: { signedUrl: 'https://signed.example/file' },
      error: null,
    });
    const storageFrom = vi.fn().mockReturnValue({ createSignedUrl });
    const client = { from, storage: { from: storageFrom } } as unknown as SupabaseClient;

    const port = createSupabaseProjectDataPort(client);

    await expect(port.getProject('project-1')).resolves.toMatchObject({ id: 'project-1' });
    await expect(port.getCustomer('customer-1')).resolves.toEqual(rows.customers);
    await expect(port.countProjectMedia('project-1')).resolves.toBe(3);
    await expect(port.getBriefing('briefing-1')).resolves.toEqual(rows.briefings);
    await expect(port.getArtVersion('art-1')).resolves.toEqual(rows.art_versions);
    await expect(port.getMockupVersion('mockup-1')).resolves.toEqual(rows.mockup_versions);
    await expect(port.getLatestReview('project-1')).resolves.toEqual(rows.review_events);
    await expect(port.createSignedUrl('mockups', 'project-1/mockup.png')).resolves.toBe(
      'https://signed.example/file',
    );
    await expect(port.getActiveTemplate()).resolves.toEqual(rows.mug_templates);
    await expect(
      port.updateTemplate('template-1', {
        name: 'Caneca Tradicional Branca 350 ml',
        capacity_ml: 350,
        art_width_mm: null,
        art_height_mm: null,
        aspect_ratio: null,
        output_width_px: null,
        output_height_px: null,
        dpi: 300,
      }),
    ).resolves.toBeUndefined();

    expect(storageFrom).toHaveBeenCalledWith('mockups');
    expect(createSignedUrl).toHaveBeenCalledWith('project-1/mockup.png', 3600);
    expect(updates).toHaveLength(1);
  });
});
