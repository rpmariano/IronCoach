import { describe, it, expect, vi, beforeEach } from 'vitest';

/* Incidente 2026-09-23: a resposta que chega pela sondagem (handleAsyncFallback)
   já tinha vindo no recarregamento dos dados ao voltar à app — a Carol
   aparecia a dizer a mesma coisa duas vezes. */

vi.mock('../lib/supabase', () => ({ supabase: {}, invokeEdgeFunctionWithTimeout: vi.fn() }));
const { useAppStore } = await import('./index');

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
