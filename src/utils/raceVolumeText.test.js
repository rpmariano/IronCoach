import { describe, it, expect } from 'vitest';
import { outlookForRace, volumeReadingNote, volumeReadingText } from './raceVolumeText';

/* #113/#114 (2026-11-06): o volume até à prova numa leitura única e neutra. */
const base = { category: 'meia', level: 'basico', currentWeeklyKm: 12, recommendedWeeklyKm: 35, projectedWeeklyKm: 23, status: 'abaixo', gapKm: 12, vdot: 41.1, vdotDate: '2026-10-25', paceLevel: 'medio' };

describe('volumeReadingText', () => {
  it('«Corres X · a meia pede Y · com o plano chegas a Z na semana da prova»', () => {
    expect(volumeReadingText(base)).toBe('Corres 12 km/semana · a meia pede 35 · com o plano chegas a 23 na semana da prova.');
  });
  it('sem plano para lá de hoje, sem a parte projetada; sem dados, nada', () => {
    expect(volumeReadingText({ ...base, projectedWeeklyKm: null, category: '10k', recommendedWeeklyKm: 25, currentWeeklyKm: 15.5 }))
      .toBe('Corres 15,5 km/semana · os 10 km pedem 25.');
    expect(volumeReadingText({ ...base, status: 'sem_dados' })).toBeNull();
    expect(volumeReadingText(null)).toBeNull();
  });
});

describe('volumeReadingNote', () => {
  it('abaixo: «para completar, não para fazer tempo», nunca uma falha; e o ritmo acima como coisa boa', () => {
    const n = volumeReadingNote(base);
    expect(n).toContain('para completar, não para fazer tempo');
    expect(n).toContain('O teu ritmo já é de Médio; falta volume.');
    expect(n).not.toMatch(/insuficiente|falh/i);
  });
  it('chega: sem nota; o ritmo igual ao nível: sem a frase do ritmo', () => {
    expect(volumeReadingNote({ ...base, status: 'chega' })).toBeNull();
    expect(volumeReadingNote({ ...base, paceLevel: 'basico' })).not.toContain('ritmo');
  });
});

describe('outlookForRace', () => {
  const TODAY = '2026-11-06';
  const runs = ['2026-10-14', '2026-10-21', '2026-10-28', '2026-11-04'].map((date) => ({ date, distance_km: 12 }));
  const race = { date: '2026-11-29', distance_km: 21.1, experience_level: 'basico' };
  it('só os itens dos planos aceites contam na projeção; o nível cai para o do perfil', () => {
    const items = ['2026-11-16', '2026-11-18', '2026-11-20', '2026-11-22', '2026-11-24', '2026-11-26'].map((d, i) => ({ plan_id: 'p1', planned_date: d, kind: 'corrida', status: 'pendente', target_distance_km: 8 + i }));
    const aceite = outlookForRace({ race, runs, coachPlans: [{ id: 'p1', status: 'aceite' }], coachPlanItems: items, todayISO: TODAY });
    const proposto = outlookForRace({ race, runs, coachPlans: [{ id: 'p1', status: 'proposto' }], coachPlanItems: items, todayISO: TODAY });
    expect(aceite.projectedWeeklyKm).toBeGreaterThan(0);
    expect(proposto.projectedWeeklyKm).toBeNull();
    expect(outlookForRace({ race: { ...race, experience_level: null }, profile: { experience_level: 'medio' }, runs, todayISO: TODAY }).level).toBe('medio');
  });
  it('sem data ou distância, nada', () => {
    expect(outlookForRace({ race: { date: null, distance_km: 10 }, runs, todayISO: TODAY })).toBeNull();
  });
});
