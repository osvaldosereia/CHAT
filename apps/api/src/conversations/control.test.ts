import { describe, expect, it, vi } from 'vitest';
import {
  markConversationAttention,
  setConversationAutomationMode,
  type ConversationControlStore,
} from './control';

describe('conversation control service', () => {
  it('changes ownership to human without discarding project context', async () => {
    const store: ConversationControlStore = {
      updateAutomationMode: vi.fn().mockResolvedValue({
        id: 'conversation-1',
        activeProjectId: 'project-1',
        automationMode: 'human',
        needsAttention: false,
        attentionReason: null,
      }),
      updateAttention: vi.fn(),
    };

    const result = await setConversationAutomationMode(
      store,
      'conversation-1',
      'human',
    );

    expect(store.updateAutomationMode).toHaveBeenCalledWith(
      'conversation-1',
      'human',
    );
    expect(result).toMatchObject({
      activeProjectId: 'project-1',
      automationMode: 'human',
    });
  });

  it('marks a conversation as needing attention with an operational reason', async () => {
    const store: ConversationControlStore = {
      updateAutomationMode: vi.fn(),
      updateAttention: vi.fn().mockResolvedValue({
        id: 'conversation-1',
        activeProjectId: 'project-1',
        automationMode: 'ai',
        needsAttention: true,
        attentionReason: 'Não entendeu após tentativas',
      }),
    };

    const result = await markConversationAttention(
      store,
      'conversation-1',
      'Não entendeu após tentativas',
    );

    expect(store.updateAttention).toHaveBeenCalledWith(
      'conversation-1',
      true,
      'Não entendeu após tentativas',
    );
    expect(result.needsAttention).toBe(true);
  });

  it('clears attention without changing automation ownership', async () => {
    const store: ConversationControlStore = {
      updateAutomationMode: vi.fn(),
      updateAttention: vi.fn().mockResolvedValue({
        id: 'conversation-1',
        activeProjectId: 'project-1',
        automationMode: 'human',
        needsAttention: false,
        attentionReason: null,
      }),
    };

    const result = await markConversationAttention(store, 'conversation-1', null);

    expect(store.updateAttention).toHaveBeenCalledWith(
      'conversation-1',
      false,
      null,
    );
    expect(result).toMatchObject({
      automationMode: 'human',
      needsAttention: false,
    });
  });
});
