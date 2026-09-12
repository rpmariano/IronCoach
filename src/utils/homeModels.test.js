import { describe, it, expect } from 'vitest';
import {
  formatDayLabel, formatDayMonth, planItemTitle, dayTitle, dayStatus, pendingSession,
  parseMealSuggestion, mealsForDay, previewMeal, buildTrailModel, buildOrbitRings, hasAnyRecord,
  isRacePlanItem, raceForDate, raceNameForDate,
} from './homeModels';

describe('homeModels — o que o Início mostra (ponto 5)', () => {
  it('datas curtas em minúsculas, dia da semana em maiúscula inicial', () => {
    expect(formatDayLabel('2026-09-06')).toBe('Domingo · 6 set');
    expect(formatDayMonth('2026-07-28')).toBe('28 jul');
  });

  it('título do item como o mock: "Rodagem longa · 16 km"', () => {
    expect(planItemTitle({ kind: 'corrida', training_type: 'longo', target_distance_km: 16 })).toBe('Rodagem longa · 16 km');
    expect(planItemTitle({ kind: 'corrida', training_type: 'intervalos' })).toBe('Intervalos');
    expect(planItemTitle({ kind: 'ginasio', categories: ['pernas', 'core'], target_duration_min: 45 })).toBe('pernas/core · 45 min');
    expect(planItemTitle({ kind: 'descanso' })).toBe('Descanso');
    expect(planItemTitle({ isRace: true, title: 'Meia de Lisboa', target_distance_km: 21.1 })).toBe('Prova · Meia de Lisboa · 21.1 km');
    expect(dayTitle([{ kind: 'descanso' }])).toBe('Descanso');
    expect(dayTitle([{ kind: 'corrida', training_type: 'longo', target_distance_km: 16 }, { kind: 'ginasio', categories: ['core'] }])).toBe('Rodagem longa · 16 km + core');
  });

  /* ── O dia da prova no plano (specs/plano-de-prova.md) ─────────────────── */
  it('o item de prova é a corrida com training_type "prova" (e a grafia antiga)', () => {
    expect(isRacePlanItem({ kind: 'corrida', training_type: 'prova' })).toBe(true);
    expect(isRacePlanItem({ kind: 'corrida', training_type: 'competicao' })).toBe(true);
    expect(isRacePlanItem({ kind: 'corrida', training_type: 'longo' })).toBe(false);
    expect(isRacePlanItem({ kind: 'ginasio', training_type: 'prova' })).toBe(false);
    expect(isRacePlanItem(null)).toBe(false);
  });

  it('a prova do dia vem da agenda, mesmo já concluída', () => {
    const races = [{ id: 'r1', date: '2026-09-13', name: 'Corrida do Tejo', status: 'concluida' }];
    expect(raceForDate(races, '2026-09-13')?.id).toBe('r1');
    expect(raceNameForDate(races, '2026-09-13')).toBe('Corrida do Tejo');
    expect(raceNameForDate(races, '2026-09-14')).toBeNull();
    expect(raceNameForDate(races, null)).toBeNull();
  });

  it('o item de prova mostra "Prova" e o nome da prova desse dia', () => {
    const item = { kind: 'corrida', training_type: 'prova', target_distance_km: 10 };
    expect(planItemTitle(item, 'Corrida do Tejo')).toBe('Prova · Corrida do Tejo · 10 km');
    // Sem prova na agenda para esse dia, o rótulo ainda diz o que é.
    expect(planItemTitle(item)).toBe('Prova · 10 km');
    expect(dayTitle([item, { kind: 'ginasio', categories: ['core'] }], 'Corrida do Tejo'))
      .toBe('Prova · Corrida do Tejo · 10 km + core');
  });

  it('o dia da prova leva o badge âmbar e não oferece "Registar sessão"', () => {
    const today = '2026-09-13';
    const item = { kind: 'corrida', training_type: 'prova', status: 'pendente' };
    expect(dayStatus({ dateISO: today, items: [item] }, today)).toEqual({ label: 'Prova', tone: 'race' });
    expect(pendingSession({ dateISO: today, items: [item] }, today)).toBeNull();
    // Já concluído volta ao badge normal.
    expect(dayStatus({ dateISO: today, items: [{ ...item, status: 'concluido' }] }, today)).toEqual({ label: 'Concluído', tone: 'ok' });
  });

  it('estado do dia: aceite, concluído, em atraso, descanso, prova', () => {
    const today = '2026-09-06';
    const run = (status, extra = {}) => ({ kind: 'corrida', training_type: 'longo', status, ...extra });
    expect(dayStatus({ dateISO: today, items: [run('pendente')] }, today)).toEqual({ label: 'Plano aceite', tone: 'ok' });
    expect(dayStatus({ dateISO: today, items: [run('concluido')] }, today)).toEqual({ label: 'Concluído', tone: 'ok' });
    expect(dayStatus({ dateISO: '2026-09-04', items: [run('pendente')] }, today)).toEqual({ label: 'Em atraso', tone: 'warn' });
    expect(dayStatus({ dateISO: today, items: [{ kind: 'descanso' }] }, today)).toEqual({ label: 'Descanso', tone: 'neutral' });
    expect(dayStatus({ dateISO: today, items: [run('pendente', { isRace: true })] }, today)).toEqual({ label: 'Prova', tone: 'race' });
  });

  it('"Registar sessão" só para treinos pendentes de hoje ou atrasados, nunca no futuro nem para provas', () => {
    const today = '2026-09-06';
    const item = { kind: 'corrida', status: 'pendente' };
    expect(pendingSession({ dateISO: today, items: [item] }, today)).toBe(item);
    expect(pendingSession({ dateISO: '2026-09-05', items: [item] }, today)).toBe(item);
    expect(pendingSession({ dateISO: '2026-09-07', items: [item] }, today)).toBeNull();
    expect(pendingSession({ dateISO: today, items: [{ ...item, isRace: true }] }, today)).toBeNull();
    expect(pendingSession({ dateISO: today, items: [{ ...item, status: 'concluido' }] }, today)).toBeNull();
  });

  it('divide uma sugestão em texto corrido pelas refeições', () => {
    const parts = parseMealSuggestion('Pequeno-almoço: omelete de 2 ovos. Almoço: atum com grão. Ceia: chá de tília.');
    expect(parts.map((p) => p.label)).toEqual(['Pequeno-almoço', 'Almoço', 'Ceia']);
    expect(parts[1].texto).toBe('atum com grão.');
    expect(parts[1].tipo).toBe('almoco');
    expect(parseMealSuggestion('Come mais fibra hoje.')).toEqual([{ tipo: null, label: 'Sugestão', texto: 'Come mais fibra hoje.' }]);
    expect(parseMealSuggestion('')).toEqual([]);
  });

  it('refeições do dia: estrutura da Carol primeiro, texto como recurso; o almoço é a pré-visualização', () => {
    const structured = mealsForDay([{ kind: 'corrida', meal_suggestion: 'Almoço: texto', meal_macros: { kcal: 2150.4, items: [{ tipo: 'pequeno-almoco', texto: 'Omelete' }, { tipo: 'almoco', texto: 'Atum ao natural com grão-de-bico' }] }, notes: 'Hidratos altos para os 16 km.' }]);
    expect(structured.kcal).toBe(2150);
    expect(structured.meals).toHaveLength(2);
    expect(structured.meals[1].label).toBe('Almoço');
    expect(structured.racional).toBe('Hidratos altos para os 16 km.');
    expect(previewMeal(structured).texto).toBe('Atum ao natural com grão-de-bico');

    const text = mealsForDay([{ kind: 'descanso', meal_suggestion: 'Jantar: sopa e peixe.' }]);
    expect(text.kcal).toBeNull();
    expect(text.meals[0].label).toBe('Jantar');
    expect(previewMeal(text).label).toBe('Jantar');
    expect(mealsForDay([{ kind: 'corrida' }])).toBeNull();
  });

  it('trilho da prova: três fases, semana atual, pontas com as datas', () => {
    const plan = {
      totalWeeks: 18, currentWeek: 6, trainingStatus: 'in_progress', daysToRace: 183,
      planStartDate: '2026-07-28', effectiveStartDate: '2026-07-28', raceDate: '2027-03-08',
      currentPhase: { name: 'Base Aeróbica' },
      phases: [{ id: 'base', weeksCount: 8 }, { id: 'build', weeksCount: 4 }, { id: 'peak', weeksCount: 2 }, { id: 'taper', weeksCount: 4 }, { id: 'race_recovery', weeksCount: 1 }],
    };
    const m = buildTrailModel(plan);
    expect(m.weeks).toBe(18);
    expect(m.current).toBe(6);
    expect(m.phases).toEqual([{ label: 'BASE', to: 8 }, { label: 'ESPECÍFICA', to: 14 }, { label: 'TAPER', to: 18 }]);
    expect(m.startLabel).toBe('28 jul');
    expect(m.endLabel).toBe('8 mar');
    expect(m.phaseName).toBe('Base Aeróbica');
    expect(m.weekLabel).toBe('semana 6 de 18');
    expect(m.days).toBe(183);
  });

  it('trilho: antes do arranque, dia da prova e concluída', () => {
    const base = { totalWeeks: 10, phases: [], raceDate: '2026-12-01', planStartDate: '2026-09-22' };
    expect(buildTrailModel({ ...base, trainingStatus: 'not_started', currentWeek: 0, daysToStart: 5 }).weekLabel).toBe('começa em 5 dias');
    expect(buildTrailModel({ ...base, trainingStatus: 'not_started', currentWeek: 0, daysToStart: 1 }).weekLabel).toBe('começa amanhã');
    expect(buildTrailModel({ ...base, trainingStatus: 'race_day', currentWeek: 10, daysToRace: 0 }).phaseName).toBe('Dia da prova');
    expect(buildTrailModel({ ...base, trainingStatus: 'completed', currentWeek: 10, daysToRace: -2 }).days).toBe(0);
  });

  it('anéis: totais de hoje contra as metas do perfil, água em litros com vírgula', () => {
    const today = '2026-09-06';
    const meals = [
      { date: today, meal_items: [{ quantity_grams: 100, calories_per_100g: 500, protein_per_100g: 30, carbs_per_100g: 0, fat_per_100g: 0 }] },
      { date: '2026-09-05', meal_items: [{ quantity_grams: 100, calories_per_100g: 900, protein_per_100g: 90, carbs_per_100g: 0, fat_per_100g: 0 }] },
    ];
    const rings = buildOrbitRings({ meals, waterLogs: [{ date: today, amount_ml: 1600 }, { date: '2026-09-05', amount_ml: 900 }], profile: { calorie_goal: 2400, protein_goal: 160, water_goal_ml: 2500 }, today });
    expect(rings[0]).toMatchObject({ label: 'Calorias', value: 500, target: 2400, color: 'var(--nutrition)' });
    expect(rings[1]).toMatchObject({ label: 'Proteína', value: 30, target: 160, unit: 'g', color: 'var(--body)' });
    expect(rings[2]).toMatchObject({ label: 'Água', display: '1,6', targetDisplay: '2,5', unit: 'L', color: 'var(--run)' });
    expect(rings[2].value).toBeCloseTo(1.6);
    // sem metas no perfil cai nos defaults da app, não em 0 (divisão por zero nos anéis)
    expect(buildOrbitRings({ today })[0].target).toBe(2000);
  });

  it('hasAnyRecord: qualquer módulo conta; nada é o primeiro dia', () => {
    expect(hasAnyRecord({ runs: [], meals: [], gymSessions: [], bodyAssessments: [] })).toBe(false);
    expect(hasAnyRecord({ runs: [], meals: [{ id: 1 }] })).toBe(true);
    expect(hasAnyRecord({})).toBe(false);
  });
});
