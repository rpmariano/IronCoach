// Testes de strengthProgression.ts (Progressão por exercício, Ginásio da
// Evolução, 2026-10-04). Espelho vitest em src/utils/strengthProgression.spec.js
// — os dois têm de dar o mesmo. Ao mudar um, mudar o outro.
import { assertAlmostEquals, assertEquals } from "jsr:@std/assert@1";
import {
  computeExerciseProgression,
  normalizeExerciseName,
  setOneRepMax,
  type ProgressionSession,
} from "./strengthProgression.ts";

const set = (name: string, weight: number, reps: number, extra: Record<string, number> = {}) =>
  ({ exercise_name: name, weight, reps, ...extra });
const sess = (date: string, sets: ReturnType<typeof set>[], kind = "forca"): ProgressionSession =>
  ({ date, kind, workout_session_sets: sets });

// Semana do mock-up: atual seg 28 set – sáb 3 out (hoje, dom 4, fica de fora);
// a anterior, 21 – 26 set (os mesmos 6 dias).
const CUR = { from: "2026-09-28", to: "2026-10-03" };
const PREV = { from: "2026-09-21", to: "2026-09-26" };

Deno.test("normalizeExerciseName — sem maiúsculas, acentos nem espaços a mais", () => {
  assertEquals(normalizeExerciseName("  Supino  Reto "), "supino reto");
  assertEquals(normalizeExerciseName("Elevação Lateral"), "elevacao lateral");
  assertEquals(normalizeExerciseName(null), "");
});

Deno.test("setOneRepMax — sempre Epley (ignora o guardado), single = peso, sem carga ou >12 reps não serve", () => {
  assertAlmostEquals(setOneRepMax(set("x", 80, 8))!, 80 * (1 + 8 / 30), 1e-9);
  // O 1RM guardado (analyze-gym) não entra: a mesma régua nos dois períodos.
  assertAlmostEquals(setOneRepMax(set("x", 80, 8, { one_rep_max_est: 110 }))!, 80 * (1 + 8 / 30), 1e-9);
  assertEquals(setOneRepMax(set("x", 20, 15, { one_rep_max_est: 40 })), null); // >12 reps: fora, mesmo com guardado
  assertEquals(setOneRepMax(set("x", 100, 1)), 100); // um single vale o peso, não 103
  assertEquals(setOneRepMax(set("x", 0, 10)), null); // peso do corpo
  assertEquals(setOneRepMax(set("x", 40, 0)), null);
  assertEquals(setOneRepMax(set("x", 20, 15)), null); // Epley não é fiável acima de 12
  assertAlmostEquals(setOneRepMax(set("x", 20, 12))!, 20 * 1.4, 1e-9);
  assertEquals(setOneRepMax(null), null);
});

Deno.test("computeExerciseProgression — melhor 1RM do período contra o anterior", () => {
  const sessions = [
    sess("2026-09-29", [set("Supino reto", 80, 8), set("Supino reto", 70, 10)]),
    sess("2026-10-01", [set("supino  reto", 82.5, 6)]),
    sess("2026-09-22", [set("Supino Reto", 75, 8)]),
  ];
  const r = computeExerciseProgression(sessions, CUR, PREV);
  assertEquals(r.withoutPrevious, 0);
  assertEquals(r.rows.length, 1);
  const row = r.rows[0];
  assertEquals(row.name, "Supino reto"); // a grafia mais usada
  assertEquals(row.current.sessions, 2);
  assertEquals(row.previous.sessions, 1);
  assertEquals(row.current.bestSet, { weight: 80, reps: 8 }); // 101,3 > 82,5×6 = 99
  assertEquals(row.previous.bestSet, { weight: 75, reps: 8 });
  assertAlmostEquals(row.diffKg, 80 * (1 + 8 / 30) - 75 * (1 + 8 / 30), 1e-9);
});

Deno.test("computeExerciseProgression — só com 2+ sessões no período e anterior para comparar", () => {
  const sessions = [
    // Agachamento: só 1 sessão no período → fora.
    sess("2026-09-29", [set("Agachamento", 100, 5)]),
    sess("2026-09-23", [set("Agachamento", 95, 5)]),
    // Remada: 2 sessões, nada no anterior → não comparável, conta à parte.
    sess("2026-09-29", [set("Remada", 60, 10)]),
    sess("2026-10-02", [set("Remada", 62.5, 10)]),
    // Prancha (peso do corpo): sem carga, nunca entra.
    sess("2026-09-29", [set("Prancha", 0, 1)]),
    sess("2026-10-02", [set("Prancha", 0, 1)]),
    // Uma aula não é um treino de força.
    sess("2026-09-30", [set("Remada", 99, 5)], "aula"),
  ];
  const r = computeExerciseProgression(sessions, CUR, PREV);
  assertEquals(r.rows.length, 0);
  assertEquals(r.withoutPrevious, 1);
});

Deno.test("computeExerciseProgression — hoje fica fora da janela e o mesmo exercício duas vezes na sessão conta uma vez", () => {
  const sessions = [
    sess("2026-09-29", [set("Press", 40, 8), set("Press", 42.5, 6)]),
    sess("2026-10-04", [set("Press", 60, 5)]), // hoje: fora da janela
    sess("2026-09-22", [set("Press", 40, 8)]),
  ];
  const r = computeExerciseProgression(sessions, CUR, PREV);
  assertEquals(r.rows.length, 0); // só 1 sessão fechada no período
  const wide = computeExerciseProgression(sessions, { from: "2026-09-28", to: "2026-10-04" }, PREV);
  assertEquals(wide.rows[0].current.sessions, 2);
});

Deno.test("computeExerciseProgression — sem janela anterior não há linhas", () => {
  const sessions = [
    sess("2026-09-29", [set("Supino", 80, 8)]),
    sess("2026-10-01", [set("Supino", 80, 8)]),
  ];
  const r = computeExerciseProgression(sessions, CUR, null);
  assertEquals(r, { rows: [], withoutPrevious: 1 });
  assertEquals(computeExerciseProgression(sessions, null, PREV), { rows: [], withoutPrevious: 0 });
});

Deno.test("computeExerciseProgression — ordena por sessões e depois pelo nome", () => {
  const mk = (name: string, w: number) => [
    sess("2026-09-29", [set(name, w, 5)]),
    sess("2026-10-01", [set(name, w, 5)]),
    sess("2026-09-22", [set(name, w - 5, 5)]),
  ];
  const sessions = [
    ...mk("Remada", 60),
    ...mk("Agachamento", 100),
    sess("2026-10-02", [set("Remada", 62.5, 5)]),
  ];
  const r = computeExerciseProgression(sessions, CUR, PREV);
  assertEquals(r.rows.map((x) => x.name), ["Remada", "Agachamento"]);
});

Deno.test("computeExerciseProgression — 1RM guardado num período e não no outro não cria diferença", () => {
  // As mesmas séries de 80 kg × 8; setembro com 99 guardado (vindo de uma foto),
  // outubro sem nada. Com a mesma fórmula nos dois lados a diferença é 0.
  const sessions = [
    sess("2026-09-22", [set("Supino", 80, 8, { one_rep_max_est: 99 })]),
    sess("2026-09-29", [set("Supino", 80, 8)]),
    sess("2026-10-01", [set("Supino", 80, 8)]),
  ];
  const r = computeExerciseProgression(sessions, CUR, PREV);
  assertEquals(r.rows.length, 1);
  assertAlmostEquals(r.rows[0].diffKg, 0, 1e-9);
});
