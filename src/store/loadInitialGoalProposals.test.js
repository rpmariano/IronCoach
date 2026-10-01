import { describe, it, expect, vi } from 'vitest';

/* Relatado a 2026-10-01: o atleta saiu da app com a Carol a pensar; ao
   voltar, a recarga trouxe a mensagem dela ("enviei uma proposta de
   objetivos…") mas não a proposta, e o "Objetivos por rever" não aparecia.
   O carregamento inicial passa a ler as propostas pendentes. */
const PROPOSTA = { id: 'g1', status: 'proposto', goals: { calorie_goal: 1950 } };
const reads = [];
function builder(table) {
  reads.push(table);
  const answer = table === 'coach_goal_proposals' ? { data: [PROPOSTA], error: null }
    : table === 'profiles' ? { data: { id: 'u1' }, error: null }
    : { data: [], error: null };
  const b = new Proxy({}, {
    get: (_, prop) => (prop === 'then'
      ? (res, rej) => Promise.resolve(answer).then(res, rej)
      : () => b),
  });
  return b;
}
vi.mock('../lib/supabase', () => ({
  supabase: { from: (t) => builder(t), rpc: () => builder('rpc') },
  invokeEdgeFunctionWithTimeout: vi.fn(),
}));

const { useAppStore } = await import('./index');

describe('loadInitialData — propostas de objetivos', () => {
  it('traz as propostas pendentes junto com as mensagens', async () => {
    useAppStore.setState({ session: { user: { id: 'u1' } }, coachGoalProposals: [] });
    await useAppStore.getState().loadInitialData('u1');
    await vi.waitFor(() => expect(useAppStore.getState().coachGoalProposals).toEqual([PROPOSTA]));
    expect(reads).toContain('coach_messages');
  });
});
