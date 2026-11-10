import { describe, it, expect } from 'vitest';
import {
  conflictNumbersText,
  conflictOptionTexts,
  filterLoadInsights,
  loadProfileUpdate,
  loadStateFor,
  profileLimitText,
  revertNoteText,
} from './loadProfileState';

/* Perfil de carga por prova (2026-11-09). A Patty recebeu no mesmo dia «estás a esforçar-te
   demasiado» (ACWR 1,31) e «fazes poucos km para a meia» (19 km/semana contra 35). Os dados são os
   dela a 9 nov (src/test/pattyLoad.js). */
import { TODAY, PATTY_RUNS, PATTY_PLAN_ITEMS, PATTY_PLANS, TRAIL, MEIA } from '../test/pattyLoad';

const stateWith = (races, today = TODAY) => loadStateFor({ raceEvents: races, runs: PATTY_RUNS, coachPlans: PATTY_PLANS, coachPlanItems: PATTY_PLAN_ITEMS, profile: null, todayISO: today });

const ACWR = { id: 'acwr_caution', severity: 'warning' };
const VOLUME = { id: 'race_volume', severity: 'warning', raceId: 'meia' };
const OTHER = { id: 'bf_low', severity: 'critical' };

describe('loadStateFor — a Patty a 9 nov', () => {
  it('conflito: um só estado, com os números do cartão', () => {
    const s = stateWith([TRAIL, MEIA]);
    expect(s.state).toBe('conflito');
    expect(s.race).toEqual({ id: 'meia', name: 'Meia dos Descobrimentos', date: '2026-11-29' });
    expect([s.acuteKm, s.ratio, s.currentWeeklyKm, s.recommendedWeeklyKm]).toEqual([23.1, 1.31, 19.1, 35]);
    expect(s.limits).toEqual({ prudente: 28.4, mais_volume: 30.8 });
    expect(conflictNumbersText(s)).toBe('Últimos 7 dias: 23,1 km (1,31× o habitual) · corres 19,1 km/semana; a prova pede 35.');
    expect(conflictOptionTexts(s)).toEqual({
      prudente: 'A semana fica até 28,4 km; a prova é para completar.',
      mais_volume: 'Até 30,8 km, mais perto do que a prova pede, com mais risco. Volta sozinho a Prudente se aparecer dor, RPE 9+ em duas corridas fáceis seguidas ou recuperação crítica.',
    });
  });

  it('só os itens dos planos aceites contam', () => {
    const proposto = loadStateFor({ raceEvents: [MEIA], runs: PATTY_RUNS, coachPlans: [{ id: 'p2', status: 'proposto' }], coachPlanItems: PATTY_PLAN_ITEMS, todayISO: TODAY });
    expect(proposto.projectedWeeklyKm).not.toBe(stateWith([MEIA]).projectedWeeklyKm);
  });

  it('sem a migration (as provas chegam sem load_profile): tudo Prudente, por escolher', () => {
    const s = stateWith([{ ...MEIA }]);
    expect([s.profile, s.chosen, s.safeLimitKm]).toEqual(['prudente', false, 28.4]);
  });

  it('perfil escolhido: sem conflito, só o limite dele', () => {
    const mais = stateWith([TRAIL, { ...MEIA, load_profile: 'mais_volume', load_profile_at: '2026-11-09T12:00:00Z' }]);
    expect([mais.state, mais.profile, mais.safeLimitKm, mais.loadAlert]).toEqual(['perfil', 'mais_volume', 30.8, false]);
    expect(profileLimitText(mais)).toBe('Mais volume · até 30,8 km nestes 7 dias (corridos: 23,1).');
    const prud = stateWith([{ ...MEIA, load_profile: 'prudente', load_profile_at: '2026-11-09T12:00:00Z' }]);
    expect([prud.state, prud.loadAlert]).toEqual(['perfil', true]);
    expect(profileLimitText(prud)).toBe('Prudente · até 28,4 km nestes 7 dias (corridos: 23,1).');
  });

  it('voltou sozinho a Prudente: a nota com a razão nos 7 dias a seguir, depois não', () => {
    const race = { ...MEIA, load_profile: 'prudente', load_profile_at: '2026-11-05T10:00:00Z', load_profile_reverted_at: '2026-11-08T07:00:00Z', load_profile_revert_reason: 'dor' };
    const s = stateWith([race]);
    expect(s.state).toBe('perfil');
    expect(revertNoteText(s, TODAY)).toBe('Voltou sozinho a Prudente em 8 nov (uma dor registada), por segurança. Podes voltar a escolher Mais volume quando o sinal passar.');
    expect(revertNoteText(s, '2026-11-15')).toMatch(/^Voltou sozinho/);
    expect(revertNoteText(s, '2026-11-16')).toBeNull();
    expect(revertNoteText(stateWith([{ ...race, load_profile_revert_reason: null }]), TODAY)).toBe('Voltou sozinho a Prudente em 8 nov, por segurança. Podes voltar a escolher Mais volume quando o sinal passar.');
    // Escolheu Mais volume outra vez: a nota sai.
    expect(revertNoteText({ ...s, profile: 'mais_volume' }, TODAY)).toBeNull();
  });
});

describe('filterLoadInsights — a carga e o volume nunca juntos', () => {
  const all = [ACWR, VOLUME, OTHER];
  it('conflito: nem um nem outro (o cartão diz tudo)', () => {
    expect(filterLoadInsights(all, stateWith([TRAIL, MEIA])).map((i) => i.id)).toEqual(['bf_low']);
  });
  it('perfil Mais volume abaixo do limite: nenhum; Prudente acima: só a carga', () => {
    const mais = stateWith([{ ...MEIA, load_profile: 'mais_volume', load_profile_at: '2026-11-09T12:00:00Z' }]);
    expect(filterLoadInsights(all, mais).map((i) => i.id)).toEqual(['bf_low']);
    const prud = stateWith([{ ...MEIA, load_profile_at: '2026-11-09T12:00:00Z' }]);
    expect(filterLoadInsights(all, prud).map((i) => i.id)).toEqual(['acwr_caution', 'bf_low']);
  });
  it('a 13 nov, sem carga a mais: só o volume', () => {
    const s = stateWith([TRAIL, MEIA], '2026-11-13');
    expect(s.state).toBe('volume');
    expect(filterLoadInsights(all, s).map((i) => i.id)).toEqual(['race_volume', 'bf_low']);
  });
  it('sem prova que mande, nada muda; o volume de outra prova também não', () => {
    expect(filterLoadInsights(all, stateWith([]))).toEqual(all);
    expect(filterLoadInsights([{ ...VOLUME, raceId: 'trail' }], stateWith([TRAIL, MEIA])).map((i) => i.id)).toEqual(['race_volume']);
  });
});

describe('loadProfileUpdate', () => {
  it('o update da secção 3: o perfil, a hora e a volta sozinha limpa', () => {
    expect(loadProfileUpdate('mais_volume', '2026-11-09T12:00:00.000Z')).toEqual({
      load_profile: 'mais_volume', load_profile_at: '2026-11-09T12:00:00.000Z', load_profile_reverted_at: null, load_profile_revert_reason: null,
    });
    expect(loadProfileUpdate('qualquer').load_profile).toBe('prudente');
  });
});

describe('detectCoachInsights com os dados da Patty a 9 nov', () => {
  it('antes eram os dois avisos; em conflito, nenhum — e com Prudente escolhido, só a carga', async () => {
    const { vi } = await import('vitest');
    const { detectCoachInsights } = await import('./biEngine');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(`${TODAY}T12:00:00`));
    try {
      const data = (races) => ({ runs: PATTY_RUNS, raceEvents: races, coachPlans: PATTY_PLANS, coachPlanItems: PATTY_PLAN_ITEMS });
      const ids = (races) => detectCoachInsights(data(races), { experience_level: 'basico' }).map((i) => i.id);
      const conflito = ids([TRAIL, MEIA]);
      expect(conflito.filter((id) => id.startsWith('acwr_') || id === 'race_volume')).toEqual([]);
      const prudente = ids([TRAIL, { ...MEIA, load_profile_at: '2026-11-09T09:00:00Z' }]);
      expect(prudente.some((id) => id.startsWith('acwr_'))).toBe(true);
      expect(prudente).not.toContain('race_volume');
    } finally {
      vi.useRealTimers();
    }
  });
});
