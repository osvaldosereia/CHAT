import { describe, expect, it, vi } from 'vitest';
import { findOrCreateCustomer, type CustomerRecord, type CustomerStore } from './customer';

const existing: CustomerRecord = {
  id: 'customer-1',
  name: 'Cliente',
  phone: '(65) 98449-1018',
  normalizedPhone: '5565984491018',
  whatsappId: '5565984491018',
  email: null,
  firstContactAt: '2026-09-16T10:00:00.000Z',
  lastInteractionAt: '2026-09-16T10:00:00.000Z',
};

describe('findOrCreateCustomer', () => {
  it('reutiliza cliente existente pelo telefone normalizado preservando perfil', async () => {
    const store: CustomerStore = {
      findByNormalizedPhone: vi.fn().mockResolvedValue(existing),
      create: vi.fn(),
    };

    const result = await findOrCreateCustomer(store, {
      phone: '(65) 98449-1018',
      name: 'Cliente',
      whatsappId: '5565984491018',
    });

    expect(result).toEqual(existing);
    expect(store.findByNormalizedPhone).toHaveBeenCalledWith('5565984491018');
    expect(store.create).not.toHaveBeenCalled();
  });

  it('cria cliente com email nulo quando o contato inicia pelo WhatsApp', async () => {
    const created = { ...existing, id: 'customer-2', name: 'Cliente Nova' };
    const store: CustomerStore = {
      findByNormalizedPhone: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(created),
    };

    const result = await findOrCreateCustomer(store, {
      phone: '65984491018',
      name: 'Cliente Nova',
      whatsappId: '5565984491018',
    });

    expect(result).toEqual(created);
    expect(store.create).toHaveBeenCalledWith({
      name: 'Cliente Nova',
      phone: '65984491018',
      normalizedPhone: '5565984491018',
      whatsappId: '5565984491018',
      email: null,
    });
  });

  it('aceita email quando ele já está disponível no cadastro', async () => {
    const created = { ...existing, id: 'customer-3', email: 'cliente@example.com' };
    const store: CustomerStore = {
      findByNormalizedPhone: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(created),
    };

    await findOrCreateCustomer(store, {
      phone: '65984491018',
      name: 'Cliente',
      whatsappId: '5565984491018',
      email: 'cliente@example.com',
    });

    expect(store.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'cliente@example.com' }),
    );
  });
});
