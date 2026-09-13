import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { planningFrameSection, resolvePhotoPaths, resolveReanalysisTypes } from "./index.ts";

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

Deno.test("resolvePhotoPaths: sem keep_paths fica tudo; com keep_paths só o que a corrida já tinha", () => {
  assertEquals(resolvePhotoPaths(["u/a.jpg", "u/b.jpg"], undefined), { kept: ["u/a.jpg", "u/b.jpg"], dropped: [] });
  assertEquals(resolvePhotoPaths(["u/a.jpg", "u/b.jpg"], ["u/b.jpg", "u/inventado.jpg"]), { kept: ["u/b.jpg"], dropped: ["u/a.jpg"] });
  assertEquals(resolvePhotoPaths(["u/a.jpg"], []), { kept: [], dropped: ["u/a.jpg"] });
  assertEquals(resolvePhotoPaths(null, ["u/a.jpg"]), { kept: [], dropped: [] });
});

Deno.test("resolveReanalysisTypes: o corpo válido ganha; inválido ou ausente fica o gravado; tipo de outro kind nunca passa", () => {
  const existing = { kind: "treino", training_type: "continuo", details: { race_type: null } };
  assertEquals(resolveReanalysisTypes(existing, {}), { kind: "treino", trainingType: "continuo", raceType: null });
  assertEquals(resolveReanalysisTypes(existing, { training_type: "longo" }), { kind: "treino", trainingType: "longo", raceType: null });
  assertEquals(resolveReanalysisTypes(existing, { training_type: "inventado" }), { kind: "treino", trainingType: "continuo", raceType: null });
  assertEquals(resolveReanalysisTypes(existing, { kind: "competicao", race_type: "10k" }), { kind: "competicao", trainingType: null, raceType: "10k" });
  assertEquals(resolveReanalysisTypes({ kind: "competicao", training_type: null, details: { race_type: "trail" } }, { kind: "lixo" }), { kind: "competicao", trainingType: null, raceType: "trail" });
});
