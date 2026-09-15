import { normalizeBrazilianPhone } from './phone';

export interface CustomerRecord {
  id: string;
  name: string | null;
  phone: string | null;
  normalizedPhone: string;
  whatsappId: string | null;
}

export interface CreateCustomerInput {
  name?: string | null;
  phone: string;
  whatsappId?: string | null;
}

export interface CustomerStore {
  findByNormalizedPhone(normalizedPhone: string): Promise<CustomerRecord | null>;
  create(input: {
    name: string | null;
    phone: string;
    normalizedPhone: string;
    whatsappId: string | null;
  }): Promise<CustomerRecord>;
}

export async function findOrCreateCustomer(
  store: CustomerStore,
  input: CreateCustomerInput,
): Promise<CustomerRecord> {
  const normalizedPhone = normalizeBrazilianPhone(input.phone);
  const existing = await store.findByNormalizedPhone(normalizedPhone);

  if (existing) {
    return existing;
  }

  return store.create({
    name: input.name ?? null,
    phone: input.phone,
    normalizedPhone,
    whatsappId: input.whatsappId ?? null,
  });
}
