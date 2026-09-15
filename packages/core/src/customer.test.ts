import { describe, expect, it, vi } from 'vitest';
import { findOrCreateCustomer, type CustomerRecord, type CustomerStore } from './customer';

const existing: CustomerRecord = {
  id: 'customer-1',
  name: 'Cliente',
  phone: '(65) 98449-1018',
  normalizedPhone: '5565984491018',
  whatsappId: '5565984491018',
};

describe('findOrCreateCustomer', () => {
  it('reutiliza cliente existente pelo telefone normalizado', async () => {
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

  it('cria cliente quando o telefone ainda nao existe', async () => {
    const created = { ...existing, id: 'customer-2' };
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
    });
  });
});
