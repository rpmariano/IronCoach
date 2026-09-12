import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { buildRacePacingPlan, compareSplitsToPlan, AMBITIOUS_RATIO } from "./racePacing.ts";

// A meia da história: 21.1 km, objetivo 1:52:00 (6720 s → 318 s/km), previsão
// do treino 1:53:30 (realista: o objetivo está a menos de 3% dela).
const MEIA = { distanceKm: 21.1, raceType: "estrada", targetSeconds: 6720, predictedSeconds: 6810, experienceLevel: "medio" };

Deno.test("sem distância, ou sem objetivo nem previsão, não há plano", () => {
  assertEquals(buildRacePacingPlan({ distanceKm: null, targetSeconds: 3000 }), null);
  assertEquals(buildRacePacingPlan({ distanceKm: 10 }), null);
});

Deno.test("meia com objetivo realista: base no objetivo, negative split, ponto de decisão ao km 15", () => {
  const plan = buildRacePacingPlan(MEIA)!;
  assertEquals(plan.basis, "objetivo");
  assertEquals(plan.ambitious, false);
  assertEquals(plan.category, "meia");
  assertEquals(plan.basePaceSecPerKm, 318);
  assertEquals(plan.decisionKm, 15);
  // primeiro km +8 s, últimos −5 s
  assertEquals(plan.firstKmPaceSecPerKm, 326);
  const last = plan.rows[plan.rows.length - 1];
  assertEquals(last.paceSecPerKm, 313);
  assertEquals(last.toKm, 21.1);
  // os rótulos aparecem pela ordem certa
  assertEquals(plan.rows.map((r) => r.label), ["controlar", "controlar", "ritmo", "aguentar", "decidir", "acelerar", "acelerar"]);
  // a chegada planeada anda à volta do objetivo (as diferenças anulam-se)
  assert(Math.abs(plan.plannedFinishSeconds - 6720) < 90, `chegada ${plan.plannedFinishSeconds}`);
  // tempos de passagem crescentes
  for (let i = 1; i < plan.rows.length; i += 1) assert(plan.rows[i].cumulativeSeconds > plan.rows[i - 1].cumulativeSeconds);
  assertEquals(plan.knowsRoute, false);
  assertStringIncludes(plan.notes[0], "Não conheço o percurso");
});

Deno.test("abastecimento na meia: água de 5 em 5 km, hidratos aos ~40 min e depois a cada ~35", () => {
  const plan = buildRacePacingPlan(MEIA)!;
  assertEquals(plan.fuel.filter((f) => f.what === "agua").map((f) => f.km), [5, 10, 15, 20]);
  const gels = plan.fuel.filter((f) => f.what === "hidratos").map((f) => f.km);
  assert(gels.length >= 2, `géis ${gels}`);
  assert(gels[0] >= 7 && gels[0] <= 9, `primeiro gel ao km ${gels[0]}`);
  assert(gels[gels.length - 1] < 21.1 - 1);
});

Deno.test("objetivo ambicioso (>3% abaixo da previsão): o plano monta-se na previsão e diz-o", () => {
  const plan = buildRacePacingPlan({ ...MEIA, targetSeconds: 6300, predictedSeconds: 6810 })!;
  assertEquals(plan.ambitious, true);
  assertEquals(plan.basis, "previsao");
  assertEquals(plan.basePaceSecPerKm, Math.round(6810 / 21.1));
  assertStringIncludes(plan.notes[0], "mais de 3% abaixo");
  assertStringIncludes(plan.rows.find((r) => r.label === "decidir")!.instruction, "vais ao objetivo");
  assertEquals(AMBITIOUS_RATIO, 0.03);
});

Deno.test("sem objetivo usa a previsão; sem previsão usa o objetivo", () => {
  assertEquals(buildRacePacingPlan({ distanceKm: 10, predictedSeconds: 3000 })!.basis, "previsao");
  assertEquals(buildRacePacingPlan({ distanceKm: 10, targetSeconds: 3000 })!.basis, "objetivo");
});

Deno.test("10 km: primeiro km +6 s, último km −8 s, água aos 5 só acima dos 50 min", () => {
  const fast = buildRacePacingPlan({ distanceKm: 10, targetSeconds: 2700 })!; // 45:00
  assertEquals(fast.firstKmPaceSecPerKm, 276);
  assertEquals(fast.rows[fast.rows.length - 1].paceSecPerKm, 262);
  assertEquals(fast.fuel, []);
  const slow = buildRacePacingPlan({ distanceKm: 10, targetSeconds: 3300 })!; // 55:00
  assertEquals(slow.fuel, [{ km: 5, what: "agua" }]);
});

Deno.test("percurso conhecido: a subida desacelera 8% e cita o troço; a descida deixa correr 4%", () => {
  const plan = buildRacePacingPlan({
    ...MEIA,
    routeSegments: [
      { km_marker: 0, description: "Partida na Praça do Comércio", elevation: "plano" },
      { km_marker: 6.2, description: "subida da Calçada da Ajuda", elevation: "sobe" },
      { km_marker: 9.5, description: "descida para Belém", elevation: "desce" },
      { km_marker: null, description: "Marginal", elevation: "plano" },
    ],
  })!;
  assertEquals(plan.knowsRoute, true);
  const up = plan.rows.find((r) => r.label === "subida")!;
  assertEquals(up.fromKm, 6);
  assertEquals(up.toKm, 7);
  assertEquals(up.paceSecPerKm, Math.round((6720 / 21.1) * 1.08));
  assertStringIncludes(up.instruction, "Calçada da Ajuda");
  const down = plan.rows.find((r) => r.label === "descida")!;
  assertEquals(down.fromKm, 9);
  assertEquals(down.paceSecPerKm, Math.round((6720 / 21.1) * 0.96));
  // o km da partida tem o troço no texto mas mantém o ritmo de arranque
  assertStringIncludes(plan.rows[0].instruction, "Praça do Comércio");
  assertEquals(plan.rows[0].paceSecPerKm, 326);
  assertEquals(plan.notes.some((n) => n.includes("Não conheço")), false);
});

Deno.test("trail é por esforço: subidas +15%, notas a dizê-lo", () => {
  const plan = buildRacePacingPlan({
    distanceKm: 18, raceType: "trail", elevationGainM: 740, predictedSeconds: 8400,
    routeSegments: [{ km_marker: 3, description: "subida do Formosinho", elevation: "sobe" }],
  })!;
  assertEquals(plan.effortMode, true);
  const up = plan.rows.find((r) => r.label === "subida")!;
  assertEquals(up.paceSecPerKm, Math.round((8400 / 18) * 1.15)); // km 4 de 18 já é 'ritmo'
  assertStringIncludes(up.instruction, "a andar");
  assert(plan.notes.some((n) => n.includes("por esforço")));
});

Deno.test("compareSplitsToPlan: parciais acumulados ou por troço, só desvios de 5 s/km ou mais", () => {
  const plan = buildRacePacingPlan({ distanceKm: 10, targetSeconds: 3000 })!; // base 300, km1 306, final 292
  // acumulados: km 1 em 4:50 (arrancou 16 s/km rápido), km 5 em 25:00 (4 km a 302, dentro), km 10 em 51:00 (5 km a 312: aguentou mal)
  const cumul = compareSplitsToPlan(plan, [
    { distance_km: 1, time_seconds: 290 },
    { distance_km: 5, time_seconds: 1208 },
    { distance_km: 10, time_seconds: 1560 },
  ]);
  assertEquals(cumul.map((c) => [c.km, c.deltaSecPerKm]), [[1, -16], [10, 20]]);
  // por troço: 5 + 5
  const perLeg = compareSplitsToPlan(plan, [{ distance_km: 5, time_seconds: 1500 }, { distance_km: 5, time_seconds: 1560 }]);
  assertEquals(perLeg.map((c) => c.km), [10]);
  assertEquals(compareSplitsToPlan(plan, []), []);
  assertEquals(compareSplitsToPlan(null, [{ distance_km: 5, time_seconds: 1500 }]), []);
});
