import { describe, it, expect, vi, beforeEach } from 'vitest';

/* Incidente 2026-09-23: a resposta que chega pela sondagem (handleAsyncFallback)
   já tinha vindo no recarregamento dos dados ao voltar à app — a Carol
   aparecia a dizer a mesma coisa duas vezes. */

vi.mock('../lib/supabase', () => ({ supabase: {}, invokeEdgeFunctionWithTimeout: vi.fn() }));
const { useAppStore, keepTransientCoachMessages } = await import('./index');

describe('addCoachMessage — a mesma mensagem não entra duas vezes', () => {
  beforeEach(() => useAppStore.setState({ coachMessages: [] }));

  it('mesmo id da BD: fica uma só', () => {
    const { addCoachMessage } = useAppStore.getState();
    addCoachMessage({ id: 'bb8f', role: 'model', content: 'Não precisas de uma dieta exótica…' });
    addCoachMessage({ id: 'bb8f', role: 'assistant', content: 'Não precisas de uma dieta exótica…', live: true });
    expect(useAppStore.getState().coachMessages).toHaveLength(1);
  });

  it('ids diferentes entram as duas (a mesma frase dita duas vezes é legítima)', () => {
    const { addCoachMessage } = useAppStore.getState();
    addCoachMessage({ id: 'a', role: 'user', content: 'Ok' });
    addCoachMessage({ id: 'b', role: 'user', content: 'Ok' });
    expect(useAppStore.getState().coachMessages).toHaveLength(2);
  });
});

/* Incidente 2026-10-06: ao voltar à app, o recarregamento das mensagens
   apagava o aviso "estou a pensar nisto…" e a frase de falha, que só existem
   no ecrã — a conversa parecia parada. */
describe('keepTransientCoachMessages', () => {
  const db = [{ id: 'a', role: 'user', content: 'Não preciso de folga' }];
  it('os avisos só do ecrã ficam, no fim; as mensagens gravadas vêm da BD', () => {
    const atual = [
      { id: 'local-1', role: 'user', content: 'Não preciso de folga' },
      { id: 'waiting-1', role: 'assistant', content: 'Rui, estou a pensar nisto, preciso de mais tempo. Respondo-te aqui.', transient: true },
    ];
    expect(keepTransientCoachMessages(db, atual).map((m) => m.id)).toEqual(['a', 'waiting-1']);
  });
  it('sem avisos, a lista é a da BD; um aviso que já está gravado não se repete', () => {
    expect(keepTransientCoachMessages(db, [{ id: 'x', role: 'assistant' }])).toBe(db);
    expect(keepTransientCoachMessages(db, [{ id: 'a', transient: true }])).toBe(db);
  });
});
