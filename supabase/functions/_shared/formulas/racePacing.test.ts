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
  // primeiro km +8 s, últimos −5 s face ao ritmo do plano (que se ajusta uns
  // décimos para a soma dar o objetivo — bug #122)
  const ritmo = plan.rows.find((r) => r.label === "ritmo")!.paceSecPerKm;
  assert(Math.abs(plan.firstKmPaceSecPerKm - (ritmo + 8)) <= 1, `km 1 ${plan.firstKmPaceSecPerKm}, ritmo ${ritmo}`);
  const last = plan.rows[plan.rows.length - 1];
  assert(Math.abs(last.paceSecPerKm - (ritmo - 5)) <= 1, `final ${last.paceSecPerKm}`);
  assertEquals(last.toKm, 21.1);
  // os rótulos aparecem pela ordem certa
  assertEquals(plan.rows.map((r) => r.label).filter((l, i, a) => l !== a[i - 1]), ["controlar", "ritmo", "aguentar", "decidir", "acelerar"]);
  // a chegada planeada É o objetivo, ao segundo (bug #122)
  assert(Math.abs(plan.plannedFinishSeconds - 6720) <= 1, `chegada ${plan.plannedFinishSeconds}`);
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
  assertEquals(up.route, "subida da Calçada da Ajuda");
  assertStringIncludes(up.instruction, "Subida: desacelera");
  assertEquals(up.instruction.includes("Calçada"), false);
  const down = plan.rows.find((r) => r.label === "descida")!;
  assertEquals(down.fromKm, 9);
  assertEquals(down.paceSecPerKm, Math.round((6720 / 21.1) * 0.96));
  // o km da partida leva o troço em `route` e mantém o ritmo de arranque
  assertEquals(plan.rows[0].route, "Partida na Praça do Comércio");
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
  const flat = plan.rows.find((r) => r.label === "ritmo")!.paceSecPerKm; // km 4 de 18 já é 'ritmo'
  assert(Math.abs(up.paceSecPerKm - flat * 1.15) <= 1, `subida ${up.paceSecPerKm}, plano ${flat}`);
  assert(Math.abs(plan.plannedFinishSeconds - 8400) <= 1, `chegada ${plan.plannedFinishSeconds}`);
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

// Bug #122 (2026-11-16): a meia de trail do Rui (a24bf631) — 21,0975 km, 618 D+,
// iniciante, os 15 troços do GPX com |declive| ≥ 3%. A chegada planeada dava
// 2:52:26 contra o objetivo de 2:45:57 (subidas e descidas abrandam no trail e
// nada compensava).
const GPX_RUI = [[2, 3.5], [4, 3.9], [5, 9.9], [6, 9.6], [8, 6], [10, -4.3], [11, -5.1], [12, -6], [13, -4.7], [14, -4.5], [15, -8.7], [16, -3.4], [18, 5.9], [21, 4.2], [22, -4.6]]
  .map(([km, g]) => ({ km_marker: km - 1, description: `GPX: ${g > 0 ? "sobe" : "desce"} (${g}%)`, elevation: g > 0 ? "sobe" : "desce" }));
const TRAIL_RUI = { distanceKm: 21.0975, raceType: "trail", elevationGainM: 618, experienceLevel: "iniciante", routeSegments: GPX_RUI, routeSource: "gpx" as const };

Deno.test("bug #122: com os troços do GPX, a chegada planeada é o objetivo — e as subidas continuam mais lentas do que o plano", () => {
  for (const target of [9957, 8620]) {
    const plan = buildRacePacingPlan({ ...TRAIL_RUI, targetSeconds: target })!;
    assert(Math.abs(plan.plannedFinishSeconds - target) <= 2, `objetivo ${target}: chegada ${plan.plannedFinishSeconds}`);
    const flat = plan.rows.filter((r) => !r.route && r.label === "ritmo").map((r) => r.paceSecPerKm);
    const ups = plan.rows.filter((r) => r.label === "subida").map((r) => r.paceSecPerKm);
    const downs = plan.rows.filter((r) => r.label === "descida").map((r) => r.paceSecPerKm);
    assert(flat.length && ups.length === 7 && downs.length === 8, JSON.stringify({ flat, ups, downs }));
    assert(Math.min(...ups) > Math.max(...flat), `subidas ${ups} vs plano ${flat}`);
    // Os fatores mantêm as proporções (subida × 1,15, descida × 0,97 sobre o
    // ritmo da fase — arranque, controlo, final — em que o troço cai).
    const base = flat[0];
    assert(ups.every((u) => u >= base * 1.12 && u <= base * 1.2), `subidas ${ups}, base ${base}`);
    assert(downs.every((d) => d >= base * 0.93 && d < base), `descidas ${downs}, base ${base}`);
  }
});

Deno.test("bug #122: com a previsão como base (sem objetivo, ou objetivo ambicioso), a chegada é a previsão; a nota compara como antes", () => {
  const noTarget = buildRacePacingPlan({ ...TRAIL_RUI, predictedSeconds: 9957 })!;
  assertEquals(noTarget.basis, "previsao");
  assert(Math.abs(noTarget.plannedFinishSeconds - 9957) <= 2, `chegada ${noTarget.plannedFinishSeconds}`);
  const amb = buildRacePacingPlan({ distanceKm: 21.1, targetSeconds: 6000, predictedSeconds: 6800 })!;
  assertEquals([amb.basis, amb.ambitious], ["previsao", true]);
  assert(Math.abs(amb.plannedFinishSeconds - 6800) <= 1, `chegada ${amb.plannedFinishSeconds}`);
  assertStringIncludes(amb.notes[0], "está mais de 3% abaixo do que o treino perspetiva (1:53:20)");
});

Deno.test("bug #122: sem troços a soma também não fechava (os deltas não somam zero) — agora fecha em todas as distâncias", () => {
  for (const [km, t] of [[3, 900], [5, 1500], [10, 3000], [21.0975, 6720], [42.195, 14400], [50, 21600], [100, 50000]]) {
    const plan = buildRacePacingPlan({ distanceKm: km, targetSeconds: t })!;
    assert(Math.abs(plan.plannedFinishSeconds - t) <= 1, `${km} km: chegada ${plan.plannedFinishSeconds} vs ${t}`);
    for (let i = 1; i < plan.rows.length; i += 1) assert(plan.rows[i].cumulativeSeconds > plan.rows[i - 1].cumulativeSeconds);
  }
});
