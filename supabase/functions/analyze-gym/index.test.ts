import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
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
