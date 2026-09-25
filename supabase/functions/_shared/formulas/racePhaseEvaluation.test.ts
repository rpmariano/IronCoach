import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { computePhaseEvaluation } from "./racePhaseEvaluation.ts";
import { assertCarolVoice } from "../carolTone.ts";

const golden = JSON.parse(await Deno.readTextFile(new URL("./racePhaseEvaluation.golden.json", import.meta.url)));

for (const { name, input, expect } of golden) {
  Deno.test(`computePhaseEvaluation — ${name}`, () => {
    assertEquals(computePhaseEvaluation(input), expect);
  });
}

// Terceira revisão pré-deploy (2026-09-25): "fáceis" é o que a app consegue
// classificar. Com o esforço por registar, não se manda abrandar — pede-se o
// esforço, e só se manda abrandar quando as intensas estão registadas.
const base = {
  phaseId: "base", phaseWeeks: 1, startDateStr: "2026-09-01", endDateStr: "2026-09-07",
  distanceKm: 10, experienceLevel: "medio", viabilityFlags: [],
};
// deno-lint-ignore no-explicit-any
const corrida = (over: Record<string, any> = {}) => ({ date: "2026-09-02", distance_km: 12, duration_seconds: 3600, ...over });

Deno.test("resumo da base: com o esforço por registar, pede-o em vez de mandar abrandar", () => {
  const runs = [corrida({ training_type: "continuo" }), corrida({ training_type: "continuo" }), corrida({ training_type: "trail" })];
  const ativa = computePhaseEvaluation({ ...base, phaseState: "active", runs }).summary;
  assertStringIncludes(ativa, "3 corridas desta fase sem o esforço registado");
  assertEquals(ativa.includes("Abranda"), false);
  assertCarolVoice(ativa);
  const feita = computePhaseEvaluation({ ...base, phaseState: "completed", runs }).summary;
  assertEquals(feita, "Na base ficaram 3 corridas sem o esforço registado, por isso não sei se foram fáceis.");
});

Deno.test("resumo da base: com as intensas registadas como tal, manda abrandar — e pede o esforço só às que não o têm", () => {
  const intensas = [corrida({ training_type: "intervalos" }), corrida({ training_type: "continuo", effort_rpe: 7 }), corrida({ training_type: "fartlek" })];
  const s1 = computePhaseEvaluation({ ...base, phaseState: "active", runs: intensas }).summary;
  assertStringIncludes(s1, "Abranda os treinos fáceis.");
  assertEquals(s1.includes("esforço"), false);
  const mistas = [corrida({ training_type: "intervalos" }), corrida({ training_type: "fartlek" }), corrida({ training_type: "continuo" }), corrida({ training_type: "recuperacao" })];
  const s2 = computePhaseEvaluation({ ...base, phaseState: "active", runs: mistas }).summary;
  assertStringIncludes(s2, "Só 25% das tuas corridas desta fase contam como fáceis");
  assertStringIncludes(s2, "Abranda os treinos fáceis, e regista o esforço das corridas que não o têm.");
});
