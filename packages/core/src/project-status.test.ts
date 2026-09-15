import { describe, expect, it } from 'vitest';
import { assertTransition, canTransition } from './project-status';

describe('project state machine', () => {
  it('permite iniciar a coleta de referências', () => {
    expect(canTransition('new', 'collecting_references')).toBe(true);
  });

  it('impede voltar a gerar depois da aprovação', () => {
    expect(canTransition('approved', 'generating_art')).toBe(false);
  });

  it('explica quando uma transição é inválida', () => {
    expect(() => assertTransition('approved', 'generating_art')).toThrow(
      /invalid project transition/i,
    );
  });
});
