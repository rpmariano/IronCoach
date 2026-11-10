import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  activityFacts,
  buildGymHistoryBlock,
  canonicalMuscleGroup,
  formatExerciseLines,
  pickMuscleGroups,
  planningFrameSection,
  splitLegacyAulaCategories,
} from "./index.ts";

Deno.test("planningFrameSection: com plano e com prova deve retornar vazio", () => {
  assertEquals(planningFrameSection(true, true), "");
});

Deno.test("planningFrameSection: com plano e sem prova deve retornar nota de enquadramento de manutencao", () => {
  const bloco = planningFrameSection(true, false);
  assertStringIncludes(bloco, "NOTA DE ENQUADRAMENTO");
  assertStringIncludes(bloco, "NÃO serve nenhuma prova");
});

Deno.test("planningFrameSection: sem plano e com prova deve retornar enquadramento de prova sem plano", () => {
  const bloco = planningFrameSection(false, true);
  assertStringIncludes(bloco, "PROVA AGENDADA, SEM PLANO");
  assertStringIncludes(bloco, "NUNCA digas que este registo está");
});

Deno.test("planningFrameSection: sem plano e sem prova deve retornar enquadramento livre", () => {
  const bloco = planningFrameSection(false, false);
  assertStringIncludes(bloco, "SEM PROVA E SEM PLANO");
  assertStringIncludes(bloco, "quer MANTER os seus hábitos");
});

// ── Grupos musculares vs modalidade (migration 20260925162654) ─────────────

Deno.test("pickMuscleGroups só aceita nomes do vocabulário, com a grafia dele", () => {
  assertEquals(
    pickMuscleGroups(["pernas inferiores", "Ombros", "CrossFit", "Ombros", 3, "  costas "]),
    ["Pernas Inferiores", "Ombros", "Costas"],
  );
});

Deno.test("pickMuscleGroups devolve vazio para o que não é lista", () => {
  assertEquals(pickMuscleGroups(null), []);
  assertEquals(pickMuscleGroups("Peito"), []);
});

Deno.test("splitLegacyAulaCategories separa a modalidade dos grupos musculares (cliente antigo)", () => {
  assertEquals(
    splitLegacyAulaCategories(["Treino Funcional", "crossfit", "Pernas Inferiores"]),
    { classTypes: ["Treino Funcional", "crossfit"], categories: ["Pernas Inferiores"] },
  );
});

Deno.test("canonicalMuscleGroup dá a grafia do vocabulário, com ou sem acento", () => {
  assertEquals(canonicalMuscleGroup("Biceps"), "Bíceps");
  assertEquals(canonicalMuscleGroup("triceps"), "Tríceps");
  assertEquals(canonicalMuscleGroup("Gluteos"), "Glúteos");
  assertEquals(canonicalMuscleGroup("Membros Superiores"), "Membros Superiores");
});

Deno.test("pickMuscleGroups aceita o nome sem acento", () => {
  assertEquals(pickMuscleGroups(["Biceps", "Bíceps", "Triceps"]), ["Bíceps", "Tríceps"]);
});

// ── O que a Carol lê para comentar os exercícios (feedback de 2026-09-25) ──

Deno.test("formatExerciseLines: uma linha por exercício, pela ordem das séries, com as cargas", () => {
  assertEquals(
    formatExerciseLines([
      { exercise_name: "Peso morto", set_index: 1, reps: 10, weight: 20 },
      { exercise_name: "Shoulder press", set_index: 0, reps: 8, weight: 20 },
      { exercise_name: "Peso morto", set_index: 0, reps: 10, weight: 20 },
      { exercise_name: "Peso morto", set_index: 2, reps: 8, weight: 20 },
    ]),
    ["Peso morto — 3 séries de 10/10/8 reps a 20 kg", "Shoulder press — 1 série de 8 reps a 20 kg"],
  );
});

Deno.test("formatExerciseLines: cargas diferentes série a série; sem carga (0 ou vazia) não afirma nada", () => {
  assertEquals(
    formatExerciseLines([
      { exercise_name: "Agachamento", set_index: 0, reps: 12, weight: 10 },
      { exercise_name: "Agachamento", set_index: 1, reps: 10, weight: 12.5 },
      { exercise_name: "Flexões", set_index: 0, reps: 15, weight: 0 },
      { exercise_name: "Prancha", set_index: 0, reps: null, weight: null },
      // A edição grava Number(null) = 0 nas reps por preencher.
      { exercise_name: "Remo", set_index: 0, reps: 0, weight: 20 },
      { exercise_name: "  ", set_index: 0, reps: 5, weight: 5 },
    ]),
    [
      "Agachamento — 2 séries: 12 reps a 10 kg, 10 reps a 12,5 kg",
      "Flexões — 1 série de 15 reps",
      "Prancha — 1 série de ? reps",
      "Remo — 1 série de ? reps a 20 kg",
    ],
  );
  assertEquals(formatExerciseLines(null), []);
});

Deno.test("buildGymHistoryBlock: as sessões anteriores com séries e a nota do atleta", () => {
  const block = buildGymHistoryBlock([
    {
      date: "2026-09-17", name: "Treino de Pernas", kind: "forca", categories: ["Pernas Inferiores"],
      notes: "Tudo com banda \"7kg\"\n\nsem dor", workout_session_sets: [{ exercise_name: "Leg press", set_index: 0, reps: 8, weight: 40 }],
    },
    { date: "2026-09-10", name: null, kind: "aula", categories: [], notes: null, workout_session_sets: [] },
  ])!;
  assertStringIncludes(block, "SESSÕES DE GINÁSIO ANTERIORES");
  assertStringIncludes(block, "- 2026-09-17 · Treino de Pernas (força; Pernas Inferiores): Leg press — 1 série de 8 reps a 40 kg");
  // Aspas trocadas por plicas e espaços achatados: a nota vai entre aspas no prompt.
  assertStringIncludes(block, `nota do atleta: "Tudo com banda '7kg' sem dor"`);
  assertStringIncludes(block, "- 2026-09-10 · Treino (aula)");
  assertEquals(buildGymHistoryBlock([]), null);
  assertEquals(buildGymHistoryBlock(null), null);
});

// Fase 0 do Troféu (2026-09-26): a prova de referência vai no enquadramento
// "prova agendada, sem plano" — e só lá; sem ela, o texto fica igual.
Deno.test("planningFrameSection: sem plano e com prova, diz qual é a prova de referência", () => {
  const principal = { id: "m1", name: "Maratona de Lisboa", date: "2026-10-11", distance_km: 42.195, race_priority: "a" };
  const bloco = planningFrameSection(false, true, principal);
  assertStringIncludes(bloco, `A prova de referência é "Maratona de Lisboa" (2026-10-11, 42,2 km), a próxima prova principal.`);
  assertEquals(planningFrameSection(false, true, null), planningFrameSection(false, true));
  assertEquals(planningFrameSection(true, true, principal), "");
});

Deno.test("activityFacts (bug #94): só o que existe — nunca «0m» nem «undefined/10»", () => {
  assertEquals(activityFacts(["8km", null, "esforço 6/10"]), " - 8km, esforço 6/10");
  assertEquals(activityFacts([null, null]), "");
});

// #118 (2026-11-10): o isométrico chega à Carol em segundos por série, não somado como cardio.
Deno.test("formatExerciseLines: um isométrico em segundos por série; o cardio continua somado", () => {
  assertEquals(
    formatExerciseLines([
      { exercise_name: "Hollow hold", set_index: 1, reps: null, weight: null, duration_seconds: 30 },
      { exercise_name: "Hollow hold", set_index: 2, reps: null, weight: null, duration_seconds: 30 },
      { exercise_name: "Prancha", set_index: 1, reps: null, weight: null, duration_seconds: 45 },
      { exercise_name: "Prancha", set_index: 2, reps: null, weight: null, duration_seconds: 40 },
      { exercise_name: "Bicicleta", set_index: 1, reps: null, weight: null, duration_seconds: 1200, distance_km: 8 },
    ] as never),
    ["Hollow hold — 2 séries de 30 s", "Prancha — 2 séries de 45/40 s", "Bicicleta — 20 min, 8 km"],
  );
  // Revisão de 2b51cca7: a prancha com carga em segundos, nunca «? reps».
  assertEquals(
    formatExerciseLines([
      { exercise_name: "Prancha com disco", set_index: 1, reps: null, weight: 10, duration_seconds: 45 },
      { exercise_name: "Prancha com disco", set_index: 2, reps: null, weight: 10, duration_seconds: 40 },
      { exercise_name: "Prancha lateral", set_index: 1, reps: null, weight: 5, duration_seconds: 30 },
      { exercise_name: "Prancha lateral", set_index: 2, reps: null, weight: 7.5, duration_seconds: 30 },
    ] as never),
    ["Prancha com disco — 2 séries de 45/40 s a 10 kg", "Prancha lateral — 2 séries: 30 s a 5 kg, 30 s a 7,5 kg"],
  );
});

// Revisão de 2b51cca7: um cardio fora do catálogo só com tempo continua somado;
// um bloco de força (exercises_meta) só com tempo vai por séries.
Deno.test("formatExerciseLines: cardio fora do catálogo só com tempo — somado, não «1 série de 1200 s»", () => {
  const rows = [
    { exercise_name: "Ski erg", set_index: 1, reps: null, weight: null, duration_seconds: 1200 },
    { exercise_name: "Crosstrainer", set_index: 1, reps: null, weight: null, duration_seconds: 900 },
    { exercise_name: "Bird dog", set_index: 1, reps: null, weight: null, duration_seconds: 20 },
    { exercise_name: "Bird dog", set_index: 2, reps: null, weight: null, duration_seconds: 20 },
  ] as never;
  assertEquals(formatExerciseLines(rows), ["Ski erg — 20 min", "Crosstrainer — 15 min", "Bird dog — 0,7 min"]);
  // O registo disse que o bird dog é força: séries em segundos.
  assertEquals(formatExerciseLines(rows, 15, new Set(["bird dog"]))[2], "Bird dog — 2 séries de 20 s");
});
