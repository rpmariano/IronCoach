import { describe, it, expect } from 'vitest';
import { buildRacePacingPlan } from '@formulas/racePacing.ts';

/* A régua do plano de prova vive em supabase/functions/_shared/formulas e é
   lida pelo cliente através do alias @formulas do Vite (vite.config.mjs) —
   o mesmo caminho do biEngine. O detalhe da fórmula é coberto pelos testes
   Deno (racePacing.test.ts); o que se garante AQUI é que o alias resolve no
   bundle do browser e que o plano que o hub mostra tem a forma esperada. */

describe('racePacing através do alias @formulas', () => {
  it('a meia com objetivo realista dá os 7 troços do plano', () => {
    const plan = buildRacePacingPlan({
      distanceKm: 21.1,
      raceType: 'estrada',
      targetSeconds: 6720, // 1:52:00
      predictedSeconds: 6810, // 1:53:30 — o objetivo está a menos de 3% dela
      experienceLevel: 'medio',
    });

    expect(plan).not.toBeNull();
    expect(plan.rows).toHaveLength(7);
    expect(plan.basis).toBe('objetivo');
    expect(plan.decisionKm).toBe(15);
    expect(plan.rows[0].fromKm).toBe(0);
    expect(plan.rows[plan.rows.length - 1].toKm).toBe(21.1);
  });

  it('sem objetivo nem previsão não há plano — é o que faz o cartão pedir o objetivo', () => {
    expect(buildRacePacingPlan({ distanceKm: 10 })).toBeNull();
  });
});
