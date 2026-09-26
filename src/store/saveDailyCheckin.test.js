import { describe, it, expect, vi, beforeEach } from 'vitest';

/* Revisão de 2026-09-26: uma dor posta por engano no check-in abre a
   intervenção ("Preciso de falar contigo"); corrigida no mesmo dia, a
   intervenção fecha-se — senão o chat abria sobre uma dor que o atleta
   retirou. Só a desse dia e ainda por falar ('needed'); o update só pega se
   o motivo ainda for o mesmo, como no fecho das metas. */

const db = { updates: [], rowsMatched: 1 };
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (table) => ({
      upsert: (row) => ({ select: () => ({ single: () => Promise.resolve({ data: row, error: null }) }) }),
      update: (row) => {
        const filters = {};
        const chain = {
          eq: (col, val) => { filters[col] = val; return chain; },
          select: () => chain,
          then: (resolve) => {
            db.updates.push({ table, row, filters });
            resolve({ data: Array.from({ length: db.rowsMatched }, () => ({ id: 'u1' })), error: null });
          },
        };
        return chain;
      },
    }),
  },
  invokeEdgeFunctionWithTimeout: vi.fn(),
}));

const { useAppStore } = await import('./index');

const D = '2026-09-26';
const MOTIVO = `Check-in de ${D}: Dor 6/10 (joelho).`;
const dia = (o = {}) => ({ date: D, sleep: 3, energy: 3, stress: 2, pain: 0, pain_location: null, ...o });
const fechos = () => db.updates.filter((u) => u.table === 'profiles' && u.row.coach_intervention_status === 'resolved');

describe('saveDailyCheckin — o check-in corrigido fecha a intervenção que abriu', () => {
  beforeEach(() => {
    db.updates.length = 0;
    db.rowsMatched = 1;
  });

  const cenario = ({ status = 'needed', motivo = MOTIVO, antes = dia({ pain: 6, pain_location: 'joelho' }) } = {}) => {
    useAppStore.setState({
      session: { user: { id: 'u1' } },
      profile: { id: 'u1', gender: 'M', coach_intervention_status: status, coach_intervention_reason: motivo },
      dailyCheckins: [antes],
      loadDailySummary: vi.fn(() => Promise.resolve(null)),
    });
  };

  it('a dor corrigida para 0 no mesmo dia fecha a intervenção como falso positivo', async () => {
    cenario();
    await useAppStore.getState().saveDailyCheckin({ date: D, sleep: 3, energy: 3, stress: 2, pain: 0 });
    expect(fechos()).toHaveLength(1);
    expect(fechos()[0].row.coach_intervention_outcome).toBe('falso_positivo');
    // Só se o motivo no servidor ainda for o que se leu.
    expect(fechos()[0].filters.coach_intervention_reason).toBe(MOTIVO);
    expect(useAppStore.getState().profile).toMatchObject({ coach_intervention_status: 'resolved', coach_intervention_reason: null });
  });

  it('com a conversa já em curso, fica como está', async () => {
    cenario({ status: 'in_progress' });
    await useAppStore.getState().saveDailyCheckin({ date: D, sleep: 3, energy: 3, stress: 2, pain: 0 });
    expect(fechos()).toHaveLength(0);
  });

  it('a intervenção de outro dia não se fecha com o check-in de hoje', async () => {
    cenario({ motivo: 'Check-in de 2026-09-24: Dor 6/10 (joelho).' });
    await useAppStore.getState().saveDailyCheckin({ date: D, sleep: 3, energy: 3, stress: 2, pain: 0 });
    expect(fechos()).toHaveLength(0);
  });

  it('uma dor que continua acima do alarme não é correção', async () => {
    cenario();
    await useAppStore.getState().saveDailyCheckin({ date: D, sleep: 3, energy: 3, stress: 2, pain: 5, pain_location: 'joelho' });
    expect(fechos()).toHaveLength(0);
    expect(useAppStore.getState().profile.coach_intervention_status).toBe('needed');
  });

  it('se o motivo mudou no servidor entretanto, o store não mexe', async () => {
    cenario();
    db.rowsMatched = 0;
    await useAppStore.getState().saveDailyCheckin({ date: D, sleep: 3, energy: 3, stress: 2, pain: 0 });
    expect(useAppStore.getState().profile.coach_intervention_status).toBe('needed');
  });
});

describe('saveDailyCheckin — diz se abriu a conversa', () => {
  beforeEach(() => {
    db.updates.length = 0;
    db.rowsMatched = 1;
  });

  const estado = (profile) => useAppStore.setState({
    session: { user: { id: 'u1' } },
    profile: { id: 'u1', gender: 'M', ...profile },
    dailyCheckins: [],
    loadDailySummary: vi.fn(() => Promise.resolve(null)),
  });

  it('uma dor nova, sem nada pendente, abre a conversa', async () => {
    estado({ coach_intervention_status: null, coach_intervention_reason: null });
    const r = await useAppStore.getState().saveDailyCheckin({ date: D, sleep: 3, energy: 3, stress: 2, pain: 6, pain_location: 'joelho' });
    expect(r).toMatchObject({ ok: true, opened: true });
    expect(r.alarms.length).toBeGreaterThan(0);
  });

  it('com outra conversa em curso, o alarme não abre nada', async () => {
    estado({ coach_intervention_status: 'in_progress', coach_intervention_reason: '[carga] Carga acima do plano.' });
    const r = await useAppStore.getState().saveDailyCheckin({ date: D, sleep: 3, energy: 3, stress: 2, pain: 6, pain_location: 'joelho' });
    expect(r.alarms.length).toBeGreaterThan(0);
    expect(r.opened).toBe(false);
    expect(useAppStore.getState().profile.coach_intervention_status).toBe('in_progress');
  });
});
