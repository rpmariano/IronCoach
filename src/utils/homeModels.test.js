import { describe, it, expect } from 'vitest';
import {
  formatDayLabel, formatDayMonth, planItemTitle, dayTitle, dayStatus, pendingSession,
  parseMealSuggestion, mealsForDay, previewMeal, buildTrailModel, buildOrbitRings, hasAnyRecord,
  isRacePlanItem, raceForDate, raceNameForDate, liveItems,
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
    // Com vírgula, como se escreve em português (pedido 2026-09-26).
    expect(planItemTitle({ isRace: true, title: 'Meia de Lisboa', target_distance_km: 21.1 })).toBe('Prova · Meia de Lisboa · 21,1 km');
    expect(dayTitle([{ kind: 'descanso' }])).toBe('Descanso');
    expect(dayTitle([{ kind: 'corrida', training_type: 'longo', target_distance_km: 16 }, { kind: 'ginasio', categories: ['core'] }])).toBe('Rodagem longa · 16 km + core');
  });

  /* A distância como se escreve (pedido 2026-09-26): o título imprimia o
     valor da BD — "Prova · Meia da Nazaré · 21.0975 km", "16.5 km" — ao
     lado de chips com "21,1 km". */
  it('a distância leva uma casa decimal no máximo, com vírgula', () => {
    const corrida = (km) => planItemTitle({ kind: 'corrida', training_type: 'longo', target_distance_km: km });
    expect(corrida(16.5)).toBe('Rodagem longa · 16,5 km');
    expect(corrida(16)).toBe('Rodagem longa · 16 km');
    expect(corrida(12.04)).toBe('Rodagem longa · 12 km');
    expect(planItemTitle({ kind: 'corrida', training_type: 'prova', target_distance_km: 21.0975 }, 'Meia da Nazaré'))
      .toBe('Prova · Meia da Nazaré · 21,1 km');
    expect(planItemTitle({ kind: 'corrida', training_type: 'prova', target_distance_km: 42.195 })).toBe('Prova · 42,2 km');
    // A BD às vezes devolve o numérico como texto: formata-se na mesma.
    expect(corrida('16.5')).toBe('Rodagem longa · 16,5 km');
    // As boas-vindas (carolWelcome.js) já mandam o texto formatado: passa como está.
    expect(planItemTitle({ kind: 'corrida', training_type: 'prova', target_distance_km: '21,1' }, 'Meia da Nazaré'))
      .toBe('Prova · Meia da Nazaré · 21,1 km');
    // Sem distância (nula, zero, vazia, ou que arredonda a zero): sem " · km".
    [null, undefined, 0, '', 0.02, -5].forEach((km) => expect(corrida(km)).toBe('Rodagem longa'));
    expect(dayTitle([{ kind: 'corrida', training_type: 'continuo', target_distance_km: 8.25 }])).toBe('Corrida contínua · 8,3 km');
  });

  /* ── O dia vazio (pedido 2026-09-26) ──────────────────────────────────────
     Era sempre "Sem plano" — também a quarta que a Carol deixou livre a meio
     da "semana 3 de 8" do plano aceite. Agora: "Sem treino" (o que é sempre
     verdade num dia vazio), e "Por planear" só quando buildPlanDays sabe que
     o dia está depois do último dia que o plano já decidiu. */
  it('um dia vazio diz "Sem treino"; "Por planear" só quando se sabe que está por escrever', () => {
    expect(dayTitle([])).toBe('Sem treino');
    expect(dayTitle(null)).toBe('Sem treino');
    expect(dayTitle([], null, { porPlanear: false })).toBe('Sem treino');
    expect(dayTitle([], null, { porPlanear: true })).toBe('Por planear');
    // O rodapé do Início põe-no em minúscula a meio da frase: "amanhã: sem treino".
    expect(dayTitle([]).toLowerCase()).not.toContain('sem plano');
    expect(dayStatus({ dateISO: '2026-09-30', items: [] }, '2026-09-26')).toEqual({ label: 'Sem treino', tone: 'neutral' });
    expect(dayStatus({ dateISO: '2026-09-30', items: [], porPlanear: true }, '2026-09-26')).toEqual({ label: 'Por planear', tone: 'neutral' });
    // Um dia com linhas nunca está "por planear", mesmo que alguém o marque.
    expect(dayTitle([{ kind: 'descanso' }], null, { porPlanear: true })).toBe('Descanso');
  });

  /* ── Os itens vivos (pedido 2026-09-26) ───────────────────────────────────
     Um bloco novo aceite a meio do antigo: no mesmo dia, o treino cancelado
     do bloco velho ao lado do treino do novo. */
  it('o cancelado do bloco antigo não entra no título nem no estado do dia', () => {
    const today = '2026-09-26';
    const velho = { id: 'v', plan_id: 'antigo', kind: 'corrida', training_type: 'intervalos', target_distance_km: 8, status: 'cancelado' };
    const novo = { id: 'n', plan_id: 'novo', kind: 'corrida', training_type: 'longo', target_distance_km: 12, status: 'pendente' };
    expect(liveItems([velho, novo])).toEqual([novo]);
    expect(dayTitle([velho, novo])).toBe('Rodagem longa · 12 km');
    expect(dayStatus({ dateISO: today, items: [velho, novo] }, today)).toEqual({ label: 'Plano aceite', tone: 'ok' });
    expect(pendingSession({ dateISO: today, items: [velho, novo] }, today)).toBe(novo);
  });

  it('o treino feito que passou para o bloco novo fecha o dia, mesmo com o redundante cancelado ao lado', () => {
    // planAcceptance.js: o feito passa para o bloco novo e o pendente do mesmo
    // tipo, no novo, é cancelado. O dia estava cumprido e deixava de o dizer.
    const today = '2026-09-26';
    const feito = { id: 'f', kind: 'corrida', training_type: 'continuo', target_distance_km: 8, status: 'concluido' };
    const redundante = { id: 'r', kind: 'corrida', training_type: 'continuo', target_distance_km: 10, status: 'cancelado' };
    expect(dayStatus({ dateISO: today, items: [feito, redundante] }, today)).toEqual({ label: 'Concluído', tone: 'ok' });
    expect(dayTitle([feito, redundante])).toBe('Corrida contínua · 8 km');
  });

  it('um cancelado sozinho é o treino que o atleta cancelou, e diz-se', () => {
    const today = '2026-09-26';
    const cancelado = { kind: 'corrida', training_type: 'intervalos', target_distance_km: 8, status: 'cancelado' };
    expect(liveItems([cancelado])).toEqual([cancelado]);
    expect(dayTitle([cancelado])).toBe('Intervalos · 8 km');
    expect(dayStatus({ dateISO: today, items: [cancelado] }, today)).toEqual({ label: 'Cancelado', tone: 'neutral' });
    // As refeições sugeridas desse dia não o tapam: não dizem o que o dia é.
    const jantar = { kind: 'descanso', categories: ['so-refeicoes'], meal_suggestion: 'Jantar: peixe.', status: 'pendente' };
    expect(dayTitle([cancelado, jantar])).toBe('Intervalos · 8 km');
    expect(dayStatus({ dateISO: today, items: [cancelado, jantar] }, today).label).toBe('Cancelado');
    // Um descanso a sério do bloco novo, sim: o dia passou a ser de descanso.
    const descanso = { kind: 'descanso', status: 'pendente' };
    expect(dayTitle([cancelado, descanso])).toBe('Descanso');
    expect(dayStatus({ dateISO: today, items: [cancelado, descanso] }, today).label).toBe('Descanso');
  });

  /* Refeições (2026-09-23): um dia do plano só com refeições sugeridas não é
     um descanso que alguém decidiu — "Sem treino planeado". */
  it('o dia só com refeições diz "Sem treino planeado", não "Descanso"', () => {
    const soRefeicoes = { kind: 'descanso', categories: ['so-refeicoes'], meal_suggestion: 'Jantar: peixe.' };
    expect(planItemTitle(soRefeicoes)).toBe('Sem treino planeado');
    expect(dayTitle([soRefeicoes])).toBe('Sem treino planeado');
    expect(dayStatus({ dateISO: '2026-09-23', items: [soRefeicoes] }, '2026-09-23').label).toBe('Sem treino');
    // Um descanso a sério continua a ser descanso.
    expect(dayTitle([{ kind: 'descanso', meal_suggestion: 'Dia leve.' }])).toBe('Descanso');
    expect(dayStatus({ dateISO: '2026-09-23', items: [{ kind: 'descanso' }] }, '2026-09-23').label).toBe('Descanso');
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

  it('refeições do dia: com duas sugestões para o mesmo dia, vale a mais recente', () => {
    // O treino feito veio do bloco antigo com a sugestão antiga; o item
    // cancelado do bloco novo traz a sugestão nova.
    const meals = mealsForDay([
      { kind: 'corrida', status: 'concluido', created_at: '2026-09-01T10:00:00Z', meal_macros: { kcal: 1800, items: [{ tipo: 'almoco', texto: 'Antiga' }] } },
      { kind: 'corrida', status: 'cancelado', created_at: '2026-09-17T10:00:00Z', meal_macros: { kcal: 2200, items: [{ tipo: 'almoco', texto: 'Nova' }] } },
    ]);
    expect(meals.kcal).toBe(2200);
    expect(meals.meals[0].texto).toBe('Nova');
  });

  it('refeições do dia: estrutura da Carol primeiro, texto como recurso; o almoço é a pré-visualização', () => {
    const structured = mealsForDay([{ kind: 'corrida', meal_suggestion: 'Almoço: texto', meal_macros: { kcal: 2150.4, items: [{ tipo: 'pequeno-almoco', texto: 'Omelete' }, { tipo: 'almoco', texto: 'Atum ao natural com grão-de-bico' }] }, notes: 'Hidratos altos para os 16 km.' }]);
    expect(structured.kcal).toBe(2150);
    expect(structured.meals).toHaveLength(2);
    expect(structured.meals[1].label).toBe('Almoço');
    // Num dia de corrida a nota é a instrução do treino, não o racional das refeições.
    expect(structured.racional).toBeNull();
    expect(previewMeal(structured).texto).toBe('Atum ao natural com grão-de-bico');
    expect(mealsForDay([{ kind: 'descanso', meal_suggestion: 'Almoço: texto', notes: 'Dia leve: menos hidratos.' }]).racional).toBe('Dia leve: menos hidratos.');

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
