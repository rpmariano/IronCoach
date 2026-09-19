import { describe, it, expect } from 'vitest';
import { planStartMoment } from './planStart';

/* O plano aceite: o arranque do bloco dito por ela; um ajuste diz-se como tal. */

const TODAY = '2026-09-19'; // sábado
const plan = { id: 'p1', period_start: '2026-09-21', period_end: '2026-12-13' };
const item = (planned_date, o = {}) => ({ id: planned_date, plan_id: 'p1', planned_date, kind: 'corrida', training_type: 'rodagem', target_distance_km: 8, status: 'pendente', ...o });

describe('planStartMoment', () => {
  it('um bloco novo: semanas, quando começa, e o primeiro treino', () => {
    const m = planStartMoment(plan, [item('2026-09-22'), item('2026-09-21', { kind: 'descanso' })], TODAY);
    expect(m.title).toBe('Semana 1 de 12. Começa na segunda-feira.');
    expect(m.sub).toBe('O primeiro treino é rodagem · 8 km, na terça-feira. Eu vou estar a ver.');
  });

  it('a começar hoje ou amanhã diz-se assim', () => {
    expect(planStartMoment({ ...plan, period_start: TODAY }, [], TODAY).title).toMatch(/Começa hoje\.$/);
    expect(planStartMoment({ ...plan, period_start: '2026-09-20' }, [], TODAY).title).toMatch(/Começa amanhã\.$/);
    expect(planStartMoment({ ...plan, period_start: '2026-09-01' }, [], TODAY).title).toMatch(/Começa hoje\.$/);
  });

  it('uma semana só', () => {
    expect(planStartMoment({ id: 'p1', period_start: TODAY, period_end: '2026-09-25' }, [], TODAY).title).toBe('Uma semana de plano. Começa hoje.');
  });

  it('um plano que substitui outro é um ajuste, não um arranque', () => {
    const m = planStartMoment({ ...plan, supersedes_plan_id: 'p0' }, [item('2026-09-22')], TODAY);
    expect(m.title).toBe('Plano ajustado.');
    expect(m.sub).toMatch(/O que já fizeste fica feito\.$/);
  });

  it('sem plano, nada; e nunca exclamações', () => {
    expect(planStartMoment(null, [], TODAY)).toBeNull();
    const m = planStartMoment(plan, [item('2026-09-22')], TODAY);
    expect(`${m.title} ${m.sub}`).not.toMatch(/!/);
  });
});
