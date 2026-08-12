import { describe, it, expect } from 'vitest';
import { buildPlanDays, PLAN_HORIZON_DAYS, computeAcceptedWindow } from './WeeklyPlanCard';

const item = (over = {}) => ({
  id: 'x', plan_id: 'p', kind: 'corrida', status: 'pendente',
  planned_date: '2026-08-11', ...over,
});

// isToday compara com a data real do relógio (necessário para o redesenho —
// o plano pode começar no passado, "from" já não é sempre hoje). Este helper
// dá o "hoje" real ao teste em vez de um valor fixo, que ficaria sempre
// errado assim que o dia mudasse.
function realTodayISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

// Mesma correção de timezone que realTodayISO — para computar "N dias antes
// de hoje" sem o resultado deslizar um dia consoante o fuso da máquina.
function addDaysToISO(iso, n) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

describe('buildPlanDays', () => {
  it('devolve sempre 7 dias, mesmo sem itens nenhuns', () => {
    // O horizonte é fixo de propósito — é o que dá forma estável ao cartão.
    const days = buildPlanDays([], '2026-08-11');
    expect(days).toHaveLength(PLAN_HORIZON_DAYS);
    expect(days.every(d => d.items.length === 0)).toBe(true);
  });

  it('avança um dia de cada vez a partir de "from"', () => {
    const days = buildPlanDays([], '2026-08-11');
    expect(days.map(d => d.dateISO)).toEqual([
      '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14',
      '2026-08-15', '2026-08-16', '2026-08-17',
    ]);
  });

  it('isToday marca o dia que bate com a data real, não o primeiro do array — o plano pode ter começado no passado', () => {
    const today = realTodayISO();
    const days = buildPlanDays([], today);
    expect(days[0].isToday).toBe(true);
    expect(days.slice(1).every(d => d.isToday === false)).toBe(true);

    // Começando 2 dias antes de hoje, isToday cai no terceiro item, não no primeiro.
    const twoDaysAgo = addDaysToISO(today, -2);
    const daysFromPast = buildPlanDays([], twoDaysAgo, 5);
    expect(daysFromPast[0].isToday).toBe(false);
    expect(daysFromPast[1].isToday).toBe(false);
    expect(daysFromPast[2].isToday).toBe(true);
  });

  it('atravessa a fronteira do mês sem saltar dias', () => {
    const days = buildPlanDays([], '2026-08-29');
    expect(days.map(d => d.dateISO)).toEqual([
      '2026-08-29', '2026-08-30', '2026-08-31', '2026-09-01',
      '2026-09-02', '2026-09-03', '2026-09-04',
    ]);
  });

  it('põe cada item no seu dia', () => {
    const days = buildPlanDays(
      [item({ id: 'a', planned_date: '2026-08-11' }), item({ id: 'b', planned_date: '2026-08-14' })],
      '2026-08-11',
    );
    expect(days[0].items.map(i => i.id)).toEqual(['a']);
    expect(days[3].items.map(i => i.id)).toEqual(['b']);
  });

  it('deixa cair itens fora da janela de 7 dias', () => {
    // O cartão é a semana, não o plano inteiro.
    const days = buildPlanDays([item({ planned_date: '2026-08-25' })], '2026-08-11');
    expect(days.every(d => d.items.length === 0)).toBe(true);
  });

  it('nunca mostra itens cancelados', () => {
    const days = buildPlanDays([item({ status: 'cancelado' })], '2026-08-11');
    expect(days[0].items).toHaveLength(0);
  });

  it('põe um item concluído no dia em que aconteceu, não no dia planeado', () => {
    // Mesma regra que planAffectsDay() usa para a nutrição: o que conta é o
    // dia real, senão a semana mostrava o treino no dia errado.
    const days = buildPlanDays(
      [item({ status: 'concluido', planned_date: '2026-08-11', actual_date: '2026-08-13' })],
      '2026-08-11',
    );
    expect(days[0].items).toHaveLength(0);
    expect(days[2].items).toHaveLength(1);
  });

  it('usa planned_date quando o item está concluído sem actual_date', () => {
    const days = buildPlanDays(
      [item({ status: 'concluido', planned_date: '2026-08-11', actual_date: null })],
      '2026-08-11',
    );
    expect(days[0].items).toHaveLength(1);
  });

  it('aceita dias de descanso, que só existem para carregar a refeição', () => {
    const days = buildPlanDays(
      [item({ kind: 'descanso', meal_suggestion: 'Reforça hidratos ao jantar.' })],
      '2026-08-11',
    );
    expect(days[0].items[0].kind).toBe('descanso');
  });

  it('junta no mesmo dia dois treinos diferentes', () => {
    const days = buildPlanDays(
      [item({ id: 'r', kind: 'corrida' }), item({ id: 'g', kind: 'ginasio' })],
      '2026-08-11',
    );
    expect(days[0].items).toHaveLength(2);
  });

  it('aguenta uma lista nula sem rebentar', () => {
    expect(buildPlanDays(null, '2026-08-11')).toHaveLength(PLAN_HORIZON_DAYS);
  });

  it('numera os dias a partir de 1 (dayNumber), não índice zero', () => {
    const days = buildPlanDays([], '2026-08-11', 3);
    expect(days.map(d => d.dayNumber)).toEqual([1, 2, 3]);
  });

  it('marca isOverdue num dia passado com item pendente', () => {
    const days = buildPlanDays(
      [item({ planned_date: '2026-01-01', status: 'pendente' })],
      '2026-01-01',
      1,
    );
    // '2026-01-01' é certamente passado face à data real de execução dos testes.
    expect(days[0].isOverdue).toBe(true);
  });

  it('não marca isOverdue quando o item pendente já está concluído ou cancelado', () => {
    const daysDone = buildPlanDays(
      [item({ planned_date: '2026-01-01', status: 'concluido', actual_date: '2026-01-01' })],
      '2026-01-01',
      1,
    );
    expect(daysDone[0].isOverdue).toBe(false);
  });

  it('não marca isOverdue num dia sem itens', () => {
    const days = buildPlanDays([], '2026-01-01', 1);
    expect(days[0].isOverdue).toBe(false);
  });
});

describe('computeAcceptedWindow', () => {
  const plan = (over = {}) => ({
    id: 'p1', status: 'aceite', period_start: '2026-08-10', period_end: '2026-08-16', ...over,
  });

  it('sem planos aceites, devolve null', () => {
    expect(computeAcceptedWindow([], [], '2026-08-11')).toBeNull();
    expect(computeAcceptedWindow([plan({ status: 'proposto' })], [], '2026-08-11')).toBeNull();
  });

  it('usa o período do plano aceite quando ainda decorre', () => {
    const w = computeAcceptedWindow([plan()], [], '2026-08-11');
    expect(w).toEqual({ start: '2026-08-10', days: 7 });
  });

  it('plano de 14 dias dá janela de 14 dias', () => {
    const w = computeAcceptedWindow(
      [plan({ period_start: '2026-08-01', period_end: '2026-08-14' })],
      [],
      '2026-08-05',
    );
    expect(w.days).toBe(14);
  });

  it('plano terminado sem itens pendentes desaparece (devolve null)', () => {
    const w = computeAcceptedWindow(
      [plan({ period_start: '2026-08-01', period_end: '2026-08-05' })],
      [{ plan_id: 'p1', status: 'concluido' }],
      '2026-08-11',
    );
    expect(w).toBeNull();
  });

  it('plano terminado mas com item pendente continua visível (atraso)', () => {
    const w = computeAcceptedWindow(
      [plan({ period_start: '2026-08-01', period_end: '2026-08-05' })],
      [{ plan_id: 'p1', status: 'pendente' }],
      '2026-08-11',
    );
    expect(w).toEqual({ start: '2026-08-01', days: 5 });
  });

  it('une os períodos de dois planos aceites (treino + refeições) numa só janela', () => {
    const w = computeAcceptedWindow(
      [
        plan({ id: 'treino', period_start: '2026-08-10', period_end: '2026-08-16' }),
        plan({ id: 'refeicoes', period_start: '2026-08-12', period_end: '2026-08-20' }),
      ],
      [],
      '2026-08-11',
    );
    expect(w).toEqual({ start: '2026-08-10', days: 11 }); // 08-10 .. 08-20
  });
});
