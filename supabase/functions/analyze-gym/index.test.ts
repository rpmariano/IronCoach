import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { canonicalMuscleGroup, pickMuscleGroups, planningFrameSection, splitLegacyAulaCategories } from "./index.ts";

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
