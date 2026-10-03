import { describe, it, expect } from 'vitest';
import { formatTargetDate, goalHorizonSummary } from './goalHorizon';

/* Bug #46: o horizonte dos objetivos corporais como a app o mostra — a
   mesma conta do servidor (@formulas/goalHorizon.ts). */

const TODAY = '2026-10-03';
const base = {
  today: TODAY,
  profile: { experience_level: 'medio', gender: 'M' },
  bodyAssessments: [{ date: '2026-09-01', weight_kg: 82 }, { date: '2026-10-01', weight_kg: 80 }],
  raceEvents: [],
};

describe('goalHorizonSummary', () => {
  it('formata a data como "15 jan 2027"', () => {
    expect(formatTargetDate('2027-01-15')).toBe('15 jan 2027');
    expect(formatTargetDate(null)).toBe(null);
  });

  it('sem data-alvo ou sem objetivos corporais, não há resumo', () => {
    expect(goalHorizonSummary({ ...base, targetDate: null, goals: { goal_weight_kg: 76 } })).toBe(null);
    expect(goalHorizonSummary({ ...base, targetDate: '2027-01-23', goals: { calorie_goal: 2200 } })).toBe(null);
  });

  it('usa a última avaliação e diz o ritmo por semana', () => {
    const h = goalHorizonSummary({ ...base, targetDate: '2027-01-23', goals: { goal_weight_kg: 76 } });
    expect(h.weeks).toBe(16);
    expect(h.ok).toBe(true);
    expect(h.lines[0]).toEqual({ ok: true, text: 'Peso: −4 kg · 0,25 kg/semana' });
    expect(h.earliest).toBe(null);
  });

  it('acima do ritmo seguro: avisa e dá a data mais cedo', () => {
    const h = goalHorizonSummary({ ...base, targetDate: '2026-11-14', goals: { goal_weight_kg: 76 } });
    expect(h.ok).toBe(false);
    expect(h.lines[0].text).toMatch(/acima do ritmo seguro \(máx\. 0,4 kg\/semana\)/);
    expect(h.earliest).toBe('2026-12-12');
  });

  it('só conta as provas agendadas, e a prova A abre a janela sem défice', () => {
    const races = [
      { name: 'Meia de Lisboa', date: '2026-12-12', distance_km: 21.1, race_priority: 'a', status: 'agendada' },
      { name: 'Antiga', date: '2026-11-01', distance_km: 10, race_priority: 'a', status: 'concluida' },
    ];
    const h = goalHorizonSummary({ ...base, raceEvents: races, targetDate: '2027-02-20', goals: { goal_weight_kg: 77 } });
    expect(h.windows).toEqual(['Sem défice de 31 out 2026 a 12 dez 2026, antes de Meia de Lisboa']);
  });
});
