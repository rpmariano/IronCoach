// Espelho vitest de supabase/functions/_shared/formulas/strengthProgression.test.ts
// (Progressão por exercício, Ginásio da Evolução — 2026-10-04). Os mesmos casos
// correm no Deno e aqui (Vite, via alias @formulas), para o ecrã e a Carol
// lerem os mesmos números. Ao mudar um, mudar o outro.
import { describe, it, expect } from 'vitest';
import {
  computeExerciseProgression,
  normalizeExerciseName,
  setOneRepMax,
} from '@formulas/strengthProgression.ts';

const set = (name, weight, reps, extra = {}) => ({ exercise_name: name, weight, reps, ...extra });
const sess = (date, sets, kind = 'forca') => ({ date, kind, workout_session_sets: sets });

// Semana do mock-up: atual seg 28 set – sáb 3 out (hoje, dom 4, fica de fora);
// a anterior, 21 – 26 set (os mesmos 6 dias).
const CUR = { from: '2026-09-28', to: '2026-10-03' };
const PREV = { from: '2026-09-21', to: '2026-09-26' };

describe('strengthProgression', () => {
  it('normalizeExerciseName — sem maiúsculas, acentos nem espaços a mais', () => {
    expect(normalizeExerciseName('  Supino  Reto ')).toBe('supino reto');
    expect(normalizeExerciseName('Elevação Lateral')).toBe('elevacao lateral');
    expect(normalizeExerciseName(null)).toBe('');
  });

  it('setOneRepMax — sempre Epley (ignora o guardado), single = peso, sem carga ou >12 reps não serve', () => {
    expect(setOneRepMax(set('x', 80, 8))).toBeCloseTo(80 * (1 + 8 / 30), 9);
    // O 1RM guardado (analyze-gym) não entra: a mesma régua nos dois períodos.
    expect(setOneRepMax(set('x', 80, 8, { one_rep_max_est: 110 }))).toBeCloseTo(80 * (1 + 8 / 30), 9);
    expect(setOneRepMax(set('x', 20, 15, { one_rep_max_est: 40 }))).toBeNull(); // >12 reps: fora, mesmo com guardado
    expect(setOneRepMax(set('x', 100, 1))).toBe(100); // um single vale o peso, não 103
    expect(setOneRepMax(set('x', 0, 10))).toBeNull(); // peso do corpo
    expect(setOneRepMax(set('x', 40, 0))).toBeNull();
    expect(setOneRepMax(set('x', 20, 15))).toBeNull(); // Epley não é fiável acima de 12
    expect(setOneRepMax(set('x', 20, 12))).toBeCloseTo(20 * 1.4, 9);
    expect(setOneRepMax(null)).toBeNull();
  });

  it('computeExerciseProgression — melhor 1RM do período contra o anterior', () => {
    const sessions = [
      sess('2026-09-29', [set('Supino reto', 80, 8), set('Supino reto', 70, 10)]),
      sess('2026-10-01', [set('supino  reto', 82.5, 6)]),
      sess('2026-09-22', [set('Supino Reto', 75, 8)]),
    ];
    const r = computeExerciseProgression(sessions, CUR, PREV);
    expect(r.withoutPrevious).toBe(0);
    expect(r.rows).toHaveLength(1);
    const row = r.rows[0];
    expect(row.name).toBe('Supino reto'); // a grafia mais usada
    expect(row.current.sessions).toBe(2);
    expect(row.previous.sessions).toBe(1);
    expect(row.current.bestSet).toEqual({ weight: 80, reps: 8 }); // 101,3 > 82,5×6 = 99
    expect(row.previous.bestSet).toEqual({ weight: 75, reps: 8 });
    expect(row.diffKg).toBeCloseTo(80 * (1 + 8 / 30) - 75 * (1 + 8 / 30), 9);
  });

  it('computeExerciseProgression — só com 2+ sessões no período e anterior para comparar', () => {
    const sessions = [
      sess('2026-09-29', [set('Agachamento', 100, 5)]),
      sess('2026-09-23', [set('Agachamento', 95, 5)]),
      sess('2026-09-29', [set('Remada', 60, 10)]),
      sess('2026-10-02', [set('Remada', 62.5, 10)]),
      sess('2026-09-29', [set('Prancha', 0, 1)]),
      sess('2026-10-02', [set('Prancha', 0, 1)]),
      sess('2026-09-30', [set('Remada', 99, 5)], 'aula'),
    ];
    const r = computeExerciseProgression(sessions, CUR, PREV);
    expect(r.rows).toHaveLength(0);
    expect(r.withoutPrevious).toBe(1);
  });

  it('computeExerciseProgression — hoje fica fora da janela e o mesmo exercício duas vezes na sessão conta uma vez', () => {
    const sessions = [
      sess('2026-09-29', [set('Press', 40, 8), set('Press', 42.5, 6)]),
      sess('2026-10-04', [set('Press', 60, 5)]),
      sess('2026-09-22', [set('Press', 40, 8)]),
    ];
    expect(computeExerciseProgression(sessions, CUR, PREV).rows).toHaveLength(0);
    const wide = computeExerciseProgression(sessions, { from: '2026-09-28', to: '2026-10-04' }, PREV);
    expect(wide.rows[0].current.sessions).toBe(2);
  });

  it('computeExerciseProgression — sem janela anterior não há linhas', () => {
    const sessions = [
      sess('2026-09-29', [set('Supino', 80, 8)]),
      sess('2026-10-01', [set('Supino', 80, 8)]),
    ];
    expect(computeExerciseProgression(sessions, CUR, null)).toEqual({ rows: [], withoutPrevious: 1 });
    expect(computeExerciseProgression(sessions, null, PREV)).toEqual({ rows: [], withoutPrevious: 0 });
  });

  it('computeExerciseProgression — ordena por sessões e depois pelo nome', () => {
    const mk = (name, w) => [
      sess('2026-09-29', [set(name, w, 5)]),
      sess('2026-10-01', [set(name, w, 5)]),
      sess('2026-09-22', [set(name, w - 5, 5)]),
    ];
    const sessions = [...mk('Remada', 60), ...mk('Agachamento', 100), sess('2026-10-02', [set('Remada', 62.5, 5)])];
    const r = computeExerciseProgression(sessions, CUR, PREV);
    expect(r.rows.map((x) => x.name)).toEqual(['Remada', 'Agachamento']);
  });

  it('computeExerciseProgression — 1RM guardado num período e não no outro não cria diferença', () => {
    const sessions = [
      sess('2026-09-22', [set('Supino', 80, 8, { one_rep_max_est: 99 })]),
      sess('2026-09-29', [set('Supino', 80, 8)]),
      sess('2026-10-01', [set('Supino', 80, 8)]),
    ];
    const r = computeExerciseProgression(sessions, CUR, PREV);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].diffKg).toBeCloseTo(0, 9);
  });
});
