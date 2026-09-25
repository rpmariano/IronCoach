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

Deno.test("uma fase a decorrer mede-se pelas semanas que já passaram (com todayISO)", () => {
  // Base de 4 semanas, na primeira: 3 corridas fáceis de 12 km (36 km) contra
  // os 35 km de uma semana — não os 140 da fase inteira.
  const quatro = { ...base, phaseWeeks: 4, endDateStr: "2026-09-28" };
  const runs = [corrida({ training_type: "longo" }), corrida({ training_type: "recuperacao" }), corrida({ training_type: "longo" })];
  // Ao sétimo dia (2026-09-07): a primeira semana inteira, 36 km contra 35.
  const hoje = computePhaseEvaluation({ ...quatro, phaseState: "active", runs, todayISO: "2026-09-07" });
  assertEquals(hoje.summary.includes("a esta altura queria"), false);
  assertEquals((hoje.score ?? 0) >= 80, true);
  // No início da segunda semana, ao dia: não cai de repente.
  const oitavo = computePhaseEvaluation({ ...quatro, phaseState: "active", runs: [...runs, corrida({ date: "2026-09-08", training_type: "recuperacao" })], todayISO: "2026-09-08" });
  assertEquals((oitavo.score ?? 0) >= 80, true);
  // Na primeira semana não se julga: sem nota (a pílula não aparece).
  const segundo = computePhaseEvaluation({ ...quatro, phaseState: "active", runs: [runs[0]], todayISO: "2026-09-02" });
  assertEquals(segundo.score, null);
  assertEquals(segundo.summary, "Esta fase começou ontem: avalio-a ao fim da primeira semana.");
  // Sem todayISO, como antes: a fase inteira (e "Acrescenta quilómetros").
  const antes = computePhaseEvaluation({ ...quatro, phaseState: "active", runs });
  assertStringIncludes(antes.summary, "a esta altura queria 140");
});

Deno.test("o ultra do iniciante não se avalia: a doutrina desaconselha-o", () => {
  const ev = computePhaseEvaluation({ ...base, distanceKm: 60, experienceLevel: "iniciante", phaseState: "completed", runs: [corrida()] });
  assertEquals(ev.score, null);
  assertEquals(ev.summary, "Não avalio esta fase: um ultra é desaconselhado no teu nível.");
});

Deno.test("resumo da base: com o esforço por registar, pede-o em vez de mandar abrandar", () => {
  const runs = [corrida({ training_type: "continuo" }), corrida({ training_type: "continuo" }), corrida({ training_type: "trail" })];
  const ativa = computePhaseEvaluation({ ...base, phaseState: "active", runs }).summary;
  assertStringIncludes(ativa, "3 corridas desta fase sem o esforço registado");
  assertEquals(ativa.includes("Abranda"), false);
  assertCarolVoice(ativa);
  const feita = computePhaseEvaluation({ ...base, phaseState: "completed", runs }).summary;
  assertEquals(feita, "Na base ficaram 3 corridas sem o esforço registado, por isso não sei se foram fáceis.");
  // Com uma só, no singular (quarta revisão, 2026-09-25).
  const uma = computePhaseEvaluation({
    ...base, phaseState: "completed",
    runs: [corrida({ training_type: "longo", distance_km: 25 }), corrida({ training_type: "continuo", distance_km: 15 })],
  }).summary;
  assertEquals(uma, "Na base ficou 1 corrida sem o esforço registado, por isso não sei se foi fácil.");
});

Deno.test("resumo da base: com as intensas registadas como tal, manda abrandar — e pede o esforço só às que não o têm", () => {
  const intensas = [corrida({ training_type: "intervalos" }), corrida({ training_type: "continuo", effort_rpe: 7 }), corrida({ training_type: "fartlek" })];
  // Sem nenhuma fácil, não há treinos fáceis para abrandar: falta fazê-los.
  const s1 = computePhaseEvaluation({ ...base, phaseState: "active", runs: intensas }).summary;
  assertStringIncludes(s1, "Faz a maior parte em ritmo fácil, a conversar.");
  assertEquals(s1.includes("Abranda") || s1.includes("esforço"), false);
  const mistas = [corrida({ training_type: "intervalos" }), corrida({ training_type: "fartlek" }), corrida({ training_type: "continuo" }), corrida({ training_type: "recuperacao" })];
  const s2 = computePhaseEvaluation({ ...base, phaseState: "active", runs: mistas }).summary;
  assertStringIncludes(s2, "Só 25% das tuas corridas desta fase contam como fáceis");
  assertStringIncludes(s2, "Abranda os treinos fáceis, e regista o esforço das corridas que não o têm.");
});
