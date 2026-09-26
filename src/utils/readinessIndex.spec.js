import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { computeReadinessIndex, checkinPillar } from '@formulas/readinessIndex.ts';

const goldenPath = path.resolve(__dirname, '../../supabase/functions/_shared/formulas/readinessIndex.golden.json');
const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));

describe('computeReadinessIndex — vetor dourado', () => {
  for (const { name, input, expect: exp } of golden) {
    it(name, () => {
      const result = computeReadinessIndex(
        input.runs,
        input.meals,
        input.bodyAssessments,
        input.gymSessions,
        input.profile,
        input.todayISO,
        input.nextRace,
      );
      expect(result).toEqual(exp);
    });
  }
});

// Pilar "Como acordaste" (2026-09-23): o check-in de hoje entra no índice.
describe('computeReadinessIndex — check-in de hoje', () => {
  const base = (checkin) => computeReadinessIndex([], [], [], [], {}, '2026-09-23', null, checkin);

  it('sem check-in não há pilar — o índice fica igual ao de sempre', () => {
    expect(base(null).pillars.map((p) => p.key)).not.toContain('checkin');
    expect(base(null)).toEqual(computeReadinessIndex([], [], [], [], {}, '2026-09-23', null));
  });

  it('dormiu e acordou bem, calmo: pilar a 100', () => {
    const p = checkinPillar({ sleep: 5, energy: 5, stress: 1, pain: 0 });
    expect(p.score).toBe(100);
    expect(base({ sleep: 5, energy: 5, stress: 1, pain: 0 }).pillars.at(-1).key).toBe('checkin');
  });

  it('dormiu mal e sem energia: o índice desce', () => {
    const bem = base({ sleep: 5, energy: 5, stress: 1, pain: 0 }).score;
    const mal = base({ sleep: 1, energy: 2, stress: 4, pain: 0 }).score;
    expect(mal).toBeLessThan(bem);
    expect(checkinPillar({ sleep: 1, energy: 2, stress: 4, pain: 0 }).desc).toMatch(/mais leve/);
  });

  it('dor ≥4 fica no máximo em 20, mesmo com o resto ótimo', () => {
    const p = checkinPillar({ sleep: 5, energy: 5, stress: 1, pain: 4 });
    expect(p.score).toBe(20);
    expect(p.desc).toMatch(/Dor de 4\/10: hoje nada de impacto/);
  });

  it('dor ligeira tira 5 pontos por ponto', () => {
    expect(checkinPillar({ sleep: 5, energy: 5, stress: 1, pain: 2 }).score).toBe(90);
  });

  it('sono ≤2 nunca é "acordaste bem", mesmo com a média alta (o mesmo corte do resumo)', () => {
    const p = checkinPillar({ sleep: 2, energy: 5, stress: 1, pain: 0 });
    expect(p.score).toBe(75);
    expect(p.desc).toMatch(/Dormiste mal/);
  });

  it('check-in incompleto não conta', () => {
    expect(checkinPillar({ sleep: 4, energy: null, stress: 2 })).toBeNull();
  });
});

/* Pedido 2026-09-26: o pilar "Como acordaste" não fala de um treino que não
   existe (descanso), e sabe quando a prova é hoje ou amanhã. */
describe('checkinPillar — o contexto do dia (revisão de 2026-09-26)', () => {
  it('sem contexto, mantém o texto genérico de sempre', () => {
    expect(checkinPillar({ sleep: 1, energy: 5, stress: 1, pain: 0 }).desc).toBe('Dormiste mal. Hoje o treino é mais leve.');
    expect(checkinPillar({ sleep: 5, energy: 5, stress: 1, pain: 0 }).desc).toBe('Acordaste bem: sono, energia e cabeça a favor do treino de hoje.');
    expect(checkinPillar({ sleep: 3, energy: 3, stress: 3, pain: 0 }).desc).toBe('Dia normal. Treina, com atenção a como te sentes.');
  });

  it('dia de descanso: nunca fala de um treino', () => {
    const ctx = { trainingToday: false };
    expect(checkinPillar({ sleep: 1, energy: 5, stress: 1, pain: 0 }, ctx).desc).toBe('Dormiste mal. Hoje é descanso: recupera o sono.');
    expect(checkinPillar({ sleep: 5, energy: 5, stress: 1, pain: 0 }, ctx).desc).toBe('Acordaste bem. Hoje é descanso; guarda isso para o próximo treino.');
    expect(checkinPillar({ sleep: 3, energy: 3, stress: 3, pain: 0 }, ctx).desc).toBe('Dia normal. Hoje é descanso.');
    expect(checkinPillar({ sleep: 3, energy: 3, stress: 5, pain: 0 }, ctx).desc).toBe('Hoje estás em baixo. Ainda bem que é dia de descanso.');
  });

  it('na véspera ou no dia da prova, dormir mal não mexe na prova', () => {
    const ctx = { raceTodayOrTomorrow: true };
    expect(checkinPillar({ sleep: 1, energy: 5, stress: 1, pain: 0 }, ctx).desc).toBe('Dormiste mal. Perto de uma prova é normal; não mexe na prova.');
  });

  it('nenhum adjetivo com género no texto do dia normal', () => {
    const t = checkinPillar({ sleep: 3, energy: 3, stress: 3, pain: 0 }).desc;
    expect(t).not.toMatch(/atento/);
  });
});

/* A viabilidade tática e a carga no polimento: o mesmo effectiveWeeksAvailable
   do hub, e nunca "adequado" sem corridas nenhumas. */
describe('computeReadinessIndex — viabilidade e carga (revisão de 2026-09-26)', () => {
  const perfil = { experience_level: 'iniciante', weight_kg: 70 };
  it('maratona marcada a 8 semanas (created_at recente): tempo insuficiente, não "adequado"', () => {
    const today = '2026-09-26';
    const nextRace = { date: '2026-11-21', distance_km: 42.195, race_priority: 'a', created_at: '2026-09-20T00:00:00Z' };
    const r = computeReadinessIndex([], [], [], [], perfil, today, nextRace, null);
    const tactic = r.pillars.find((p) => p.key === 'tactic');
    expect(tactic.desc).toBe('Tempo de calendário insuficiente para preparar a prova.');
    expect(tactic.score).toBe(30);
  });

  it('sem nenhuma corrida registada, não pontua 90 nem diz "adequado"', () => {
    const today = '2026-09-26';
    const nextRace = { date: '2027-03-01', distance_km: 42.195, race_priority: 'a', created_at: '2026-09-01T00:00:00Z' };
    const r = computeReadinessIndex([], [], [], [], perfil, today, nextRace, null);
    const tactic = r.pillars.find((p) => p.key === 'tactic');
    expect(tactic.desc).toBe('Ainda não tenho corridas para saber se o volume chega.');
    expect(tactic.score).not.toBe(90);
  });

  it('no polimento de uma prova A, a carga baixa é o plano, não um alerta', () => {
    const today = '2026-09-26';
    // Maratona a 10 dias: taper de 14 dias para iniciante — está no polimento.
    const nextRace = { date: '2026-10-06', distance_km: 42.195, race_priority: 'a', created_at: '2026-01-01T00:00:00Z' };
    const runs = Array.from({ length: 12 }, (_, i) => ({ date: `2026-0${6 + Math.floor(i / 4)}-${String(1 + (i % 4) * 7).padStart(2, '0')}`, distance_km: 6, duration_seconds: 2000 }));
    const r = computeReadinessIndex(runs, [], [], [], perfil, today, nextRace, null);
    const acwr = r.pillars.find((p) => p.key === 'acwr');
    if (acwr && acwr.score < 60) expect(acwr.desc).toMatch(/como deve ser no polimento/);
  });

  it('a carga usa sempre vírgula decimal', () => {
    const runs = [
      { date: '2026-08-01', distance_km: 10, duration_seconds: 3000 }, { date: '2026-08-08', distance_km: 10, duration_seconds: 3000 },
      { date: '2026-08-15', distance_km: 10, duration_seconds: 3000 }, { date: '2026-08-22', distance_km: 10, duration_seconds: 3000 },
      { date: '2026-09-19', distance_km: 20, duration_seconds: 6000 }, { date: '2026-09-22', distance_km: 20, duration_seconds: 6000 },
    ];
    const r = computeReadinessIndex(runs, [], [], [], perfil, '2026-09-26', null, null);
    const acwr = r.pillars.find((p) => p.key === 'acwr');
    if (acwr) { expect(acwr.desc).not.toMatch(/\d\.\d/); expect(acwr.desc).toMatch(/\d,\d/); }
  });
});

describe('checkinPillar — perto da prova, nunca "descanso" (revisão pré-deploy 2026-09-26)', () => {
  it('no dia ou na véspera, mesmo com trainingToday false', () => {
    const ctx = { trainingToday: false, raceTodayOrTomorrow: true };
    for (const c of [{ sleep: 5, energy: 5, stress: 1 }, { sleep: 3, energy: 3, stress: 3 }, { sleep: 3, energy: 3, stress: 5 }]) {
      expect(checkinPillar({ ...c, pain: 0 }, ctx).desc).not.toMatch(/descanso/);
    }
  });
});
