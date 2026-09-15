import { describe, expect, it } from 'vitest';
import { normalizeBrazilianPhone } from './phone';

describe('normalizeBrazilianPhone', () => {
  it('normaliza celular local adicionando o DDI 55', () => {
    expect(normalizeBrazilianPhone('(65) 98449-1018')).toBe('5565984491018');
  });

  it('mantem numero que ja chega no formato internacional do WhatsApp', () => {
    expect(normalizeBrazilianPhone('5565984491018')).toBe('5565984491018');
  });

  it('rejeita numero incompleto', () => {
    expect(() => normalizeBrazilianPhone('98449')).toThrow('Invalid Brazilian phone number');
  });
});
