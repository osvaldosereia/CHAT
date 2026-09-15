export function normalizeBrazilianPhone(value: string): string {
  const digits = value.replace(/\D/g, '');

  if (/^55\d{10,11}$/.test(digits)) {
    return digits;
  }

  if (/^\d{10,11}$/.test(digits)) {
    return `55${digits}`;
  }

  throw new Error('Invalid Brazilian phone number');
}
