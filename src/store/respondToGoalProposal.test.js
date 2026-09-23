import { describe, it, expect, vi, beforeEach } from 'vitest';

/* Bug #41 (2026-09-22): a conversa sobre objetivos que a análise corporal
   abre fecha-se com a decisão do atleta na proposta — aceitar OU recusar.
   As intervenções de desvio ao plano não se tocam: essas fecham-se no chat. */

const calls = { updates: [] };
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (table) => ({
      update: (row) => {
        calls.updates.push({ table, row });
        return { eq: () => Promise.resolve({ error: null }) };
      },
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }),
    }),
  },
  invokeEdgeFunctionWithTimeout: vi.fn(),
}));

const { useAppStore } = await import('./index');

const PROPOSTA = { id: 'gp1', goals: { protein_goal: 150 } };
const resolucoesDoPerfil = () => calls.updates.filter((u) => u.table === 'profiles' && u.row.coach_intervention_status === 'resolved');

describe('respondToGoalProposal — fecha a conversa sobre objetivos', () => {
  beforeEach(() => {
    calls.updates.length = 0;
  });

  const comIntervencao = (reason, status = 'needed') => useAppStore.setState({
    session: null,
    coachGoalProposals: [PROPOSTA],
    profile: { id: 'u1', coach_intervention_status: status, coach_intervention_reason: reason },
  });

  it('recusar a proposta fecha uma intervenção de objetivos', async () => {
    comIntervencao('[objetivos] Ainda não tem objetivos definidos.');
    await useAppStore.getState().respondToGoalProposal('gp1', false);
    expect(resolucoesDoPerfil()).toHaveLength(1);
    expect(useAppStore.getState().profile.coach_intervention_status).toBe('resolved');
    expect(useAppStore.getState().profile.coach_intervention_reason).toBeNull();
  });

  it('aceitar também fecha — e uma conversa já a meio conta', async () => {
    comIntervencao('[objetivos] O peso-alvo já foi atingido.', 'in_progress');
    await useAppStore.getState().respondToGoalProposal('gp1', true);
    expect(resolucoesDoPerfil()).toHaveLength(1);
  });

  it('uma intervenção de desvio ao plano não se toca', async () => {
    comIntervencao('Falhou 3 treinos seguidos.');
    await useAppStore.getState().respondToGoalProposal('gp1', false);
    expect(resolucoesDoPerfil()).toHaveLength(0);
    expect(useAppStore.getState().profile.coach_intervention_status).toBe('needed');
  });

  it('sem intervenção pendente, não escreve nada no perfil', async () => {
    comIntervencao('[objetivos] x', 'resolved');
    await useAppStore.getState().respondToGoalProposal('gp1', false);
    expect(resolucoesDoPerfil()).toHaveLength(0);
  });
});
