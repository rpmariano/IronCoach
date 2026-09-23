import { describe, it, expect, vi, beforeEach } from 'vitest';

/* Bug #41 (2026-09-22): a conversa sobre objetivos que a análise corporal
   abre fecha-se com a decisão do atleta na proposta — aceitar OU recusar.
   As intervenções de desvio ao plano não se tocam: essas fecham-se no chat.
   A decisão lê o motivo no servidor, não no store (revisão pré-deploy). */

const db = { profile: null, updates: [] };
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (table) => ({
      update: (row) => {
        const filters = {};
        const chain = {
          eq: (col, val) => { filters[col] = val; return chain; },
          then: (resolve) => { db.updates.push({ table, row, filters }); resolve({ error: null }); },
        };
        return chain;
      },
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: table === 'profiles' ? db.profile : null }) }) }),
    }),
  },
  invokeEdgeFunctionWithTimeout: vi.fn(),
}));

const { useAppStore } = await import('./index');

const PROPOSTA = { id: 'gp1', goals: { protein_goal: 150 } };
const resolucoes = () => db.updates.filter((u) => u.table === 'profiles' && u.row.coach_intervention_status === 'resolved');

describe('respondToGoalProposal — fecha a conversa sobre objetivos', () => {
  beforeEach(() => {
    db.updates.length = 0;
    db.profile = null;
  });

  // `local` é o que o store julga saber; `servidor` é o que está na BD.
  const cenario = ({ local, servidor }) => {
    db.profile = { id: 'u1', ...servidor };
    useAppStore.setState({ session: null, coachGoalProposals: [PROPOSTA], profile: { id: 'u1', ...local } });
  };
  const obj = (status = 'needed') => ({ coach_intervention_status: status, coach_intervention_reason: '[objetivos] Ainda não tem objetivos.' });
  const plano = { coach_intervention_status: 'needed', coach_intervention_reason: 'Falhou 3 treinos seguidos.' };

  it('recusar a proposta fecha a intervenção de objetivos — só se o motivo não mudou entretanto', async () => {
    cenario({ local: obj(), servidor: obj() });
    await useAppStore.getState().respondToGoalProposal('gp1', false);
    expect(resolucoes()).toHaveLength(1);
    expect(resolucoes()[0].filters.coach_intervention_reason).toBe('[objetivos] Ainda não tem objetivos.');
    expect(useAppStore.getState().profile.coach_intervention_status).toBe('resolved');
  });

  it('aceitar também fecha, e uma conversa já a meio conta', async () => {
    cenario({ local: obj('in_progress'), servidor: obj('in_progress') });
    await useAppStore.getState().respondToGoalProposal('gp1', true);
    expect(resolucoes()).toHaveLength(1);
  });

  it('o motivo antigo, sem etiqueta, também é uma conversa sobre objetivos', async () => {
    const antigo = { coach_intervention_status: 'needed', coach_intervention_reason: 'O atleta acabou de registar uma avaliação corporal e ainda não tem objetivos definidos (os do corpo).' };
    cenario({ local: antigo, servidor: antigo });
    await useAppStore.getState().respondToGoalProposal('gp1', false);
    expect(resolucoes()).toHaveLength(1);
  });

  it('uma intervenção de desvio ao plano não se toca', async () => {
    cenario({ local: plano, servidor: plano });
    await useAppStore.getState().respondToGoalProposal('gp1', false);
    expect(resolucoes()).toHaveLength(0);
  });

  it('o store ainda julga que é de objetivos, mas no servidor já é de plano: não fecha, e atualiza o store', async () => {
    cenario({ local: obj(), servidor: plano });
    await useAppStore.getState().respondToGoalProposal('gp1', false);
    expect(resolucoes()).toHaveLength(0);
    expect(useAppStore.getState().profile.coach_intervention_reason).toBe('Falhou 3 treinos seguidos.');
  });
});
