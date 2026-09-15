import { describe, expect, it, vi } from 'vitest';
import {
  loadProjectDetail,
  loadTemplateSettings,
  saveTemplateSettings,
  type ProjectDataPort,
} from './projects';

describe('project admin services', () => {
  it('reconstroi o detalhe e assina apenas arte e mockup privados', async () => {
    const port: ProjectDataPort = {
      getProject: vi.fn().mockResolvedValue({
        id: 'project-1',
        title: 'Caneca da Ana',
        status: 'waiting_approval',
        creation_mode: 'reference',
        customer_id: 'customer-1',
        current_briefing_id: 'briefing-1',
        current_art_version_id: 'art-1',
        current_mockup_id: 'mockup-1',
      }),
      getCustomer: vi.fn().mockResolvedValue({ name: 'Ana Souza', phone: '65999999999' }),
      countProjectMedia: vi.fn().mockResolvedValue(3),
      getBriefing: vi.fn().mockResolvedValue({
        version: 2,
        main_theme: 'Aniversário',
        mandatory_text: ['Parabéns, Ana!'],
        ready_to_generate: true,
      }),
      getArtVersion: vi.fn().mockResolvedValue({
        version: 2,
        storage_bucket: 'artwork-master',
        storage_path: 'project-1/art-v2.png',
      }),
      getMockupVersion: vi.fn().mockResolvedValue({
        version: 2,
        storage_bucket: 'mockups',
        storage_path: 'project-1/mockup-v2.png',
      }),
      getLatestReview: vi.fn().mockResolvedValue({ event_type: 'sent_for_review' }),
      createSignedUrl: vi
        .fn()
        .mockResolvedValueOnce('https://signed/art')
        .mockResolvedValueOnce('https://signed/mockup'),
      getActiveTemplate: vi.fn(),
      updateTemplate: vi.fn(),
    };

    await expect(loadProjectDetail(port, 'project-1')).resolves.toEqual({
      id: 'project-1',
      title: 'Caneca da Ana',
      status: 'waiting_approval',
      creationMode: 'reference',
      customerName: 'Ana Souza',
      customerPhone: '65999999999',
      briefing: {
        version: 2,
        mainTheme: 'Aniversário',
        mandatoryText: ['Parabéns, Ana!'],
        readyToGenerate: true,
      },
      mediaCount: 3,
      artVersion: 2,
      artUrl: 'https://signed/art',
      mockupVersion: 2,
      mockupUrl: 'https://signed/mockup',
      latestReview: 'Enviado para aprovação',
    });

    expect(port.createSignedUrl).toHaveBeenNthCalledWith(
      1,
      'artwork-master',
      'project-1/art-v2.png',
    );
    expect(port.createSignedUrl).toHaveBeenNthCalledWith(
      2,
      'mockups',
      'project-1/mockup-v2.png',
    );
  });

  it('carrega e salva o gabarito sem inventar medidas vazias', async () => {
    const port: ProjectDataPort = {
      getProject: vi.fn(),
      getCustomer: vi.fn(),
      countProjectMedia: vi.fn(),
      getBriefing: vi.fn(),
      getArtVersion: vi.fn(),
      getMockupVersion: vi.fn(),
      getLatestReview: vi.fn(),
      createSignedUrl: vi.fn(),
      getActiveTemplate: vi.fn().mockResolvedValue({
        id: 'template-1',
        name: 'Caneca Tradicional Branca 350 ml',
        capacity_ml: 350,
        art_width_mm: null,
        art_height_mm: null,
        aspect_ratio: null,
        output_width_px: null,
        output_height_px: null,
        dpi: 300,
      }),
      updateTemplate: vi.fn().mockResolvedValue(undefined),
    };

    const template = await loadTemplateSettings(port);
    expect(template.artWidthMm).toBeNull();
    expect(template.aspectRatio).toBeNull();

    await saveTemplateSettings(port, template);
    expect(port.updateTemplate).toHaveBeenCalledWith('template-1', {
      name: 'Caneca Tradicional Branca 350 ml',
      capacity_ml: 350,
      art_width_mm: null,
      art_height_mm: null,
      aspect_ratio: null,
      output_width_px: null,
      output_height_px: null,
      dpi: 300,
    });
  });
});
