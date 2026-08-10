import { describe, it, expect } from 'vitest';
import { buildPlanDays, PLAN_HORIZON_DAYS } from './WeeklyPlanCard';

const item = (over = {}) => ({
  id: 'x', plan_id: 'p', kind: 'corrida', status: 'pendente',
  planned_date: '2026-08-11', ...over,
});

describe('buildPlanDays', () => {
  it('devolve sempre 7 dias, mesmo sem itens nenhuns', () => {
    // O horizonte é fixo de propósito — é o que dá forma estável ao cartão.
    const days = buildPlanDays([], '2026-08-11');
    expect(days).toHaveLength(PLAN_HORIZON_DAYS);
    expect(days.every(d => d.items.length === 0)).toBe(true);
  });

  it('começa em hoje e avança um dia de cada vez', () => {
    const days = buildPlanDays([], '2026-08-11');
    expect(days.map(d => d.dateISO)).toEqual([
      '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14',
      '2026-08-15', '2026-08-16', '2026-08-17',
    ]);
    expect(days[0].isToday).toBe(true);
    expect(days.slice(1).every(d => d.isToday === false)).toBe(true);
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
});
