// Caminhada vs. corrida (2026-10-05) — o helper único (runKinds.ts) e cada
// exclusão importante: a caminhada fica FORA da carga de corrida (ACWR,
// km/semana, VDOT, recordes, previsão, 80/20, pace, viabilidade, guarda dos
// planos) e só cumpre uma caminhada do plano. Deno-nativo; a contrapartida
// Vitest é runKinds.spec.ts.
import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  isWalk, isWalkPlanItem, runMatchesPlanItem, runPlanItemsOnly, runsOnly, walkIntensity, walksLabel, walksOnly, walkTotals,
  WALK_TRAINING_TYPE,
} from "./runKinds.ts";
import { computeRunAcwr } from "./runAcwr.ts";
import { computeCalendarWeeklyVolume } from "./weeklyVolume.ts";
import { computeVdotTrend } from "./vdotTrend.ts";
import { computeBestPace } from "./bestPace.ts";
import { predictRaceTime } from "./racePrediction.ts";
import { computeTrainingDistribution } from "./trainingDistribution.ts";
import { computeRecentWeeklyVolume, knownWeeklyVolume } from "./raceViability.ts";
import { planLoadViolations, runLoadReading } from "./runLoadAlert.ts";
import { runRecordMoment } from "./runRecord.ts";
import { evaluateTrainingItem } from "./prescriptionAdherence.ts";
import { computeCrossMetrics } from "./crossMetrics.ts";
import { distanceCostKcalPerKgKm, RUNNING_COST_KCAL_PER_KG_KM, WALKING_COST_KCAL_PER_KG_KM } from "./tdee.ts";

const TODAY = "2026-10-05";
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const run = (date: string, km: number, over: Record<string, unknown> = {}) =>
  ({ id: `r-${date}-${km}`, date, distance_km: km, duration_seconds: km * 330, kind: "treino", training_type: "continuo", ...over });
const walk = (date: string, km: number, over: Record<string, unknown> = {}) =>
  ({ id: `w-${date}-${km}`, date, distance_km: km, duration_seconds: km * 660, kind: "treino", training_type: WALK_TRAINING_TYPE, ...over });

// Quatro semanas de corrida regular — base crónica para o ACWR.
const BASE = [0, 3, 7, 10, 14, 17, 21, 24].map((d) => run(addDays(TODAY, -d - 1), 8));

Deno.test("isWalk: só training_type 'caminhada', e uma prova nunca é caminhada", () => {
  assert(isWalk(walk(TODAY, 3)));
  assert(!isWalk(run(TODAY, 3)));
  assert(!isWalk({ kind: "competicao", training_type: WALK_TRAINING_TYPE }));
  assert(!isWalk(null));
  assert(!isWalk({}));
});

Deno.test("runsOnly / walksOnly partem a lista sem perder nada", () => {
  const list = [run(TODAY, 5), walk(TODAY, 3), { date: TODAY, distance_km: 2 }];
  assertEquals(runsOnly(list).length, 2);
  assertEquals(walksOnly(list).length, 1);
  assertEquals(runsOnly(null), []);
});

Deno.test("walkTotals: conta, km e minutos no intervalo", () => {
  const list = [walk("2026-10-01", 3.2), walk("2026-10-04", 4), run("2026-10-04", 10), walk("2026-09-20", 5)];
  assertEquals(walkTotals(list, "2026-10-01", "2026-10-05"), { count: 2, km: 7.2, minutes: Math.round((7.2 * 660) / 60) });
  assertEquals(walkTotals(list).count, 3);
  assertEquals(walksLabel(1), "1 caminhada");
  assertEquals(walksLabel(3), "3 caminhadas");
});

Deno.test("plano: caminhada é kind corrida + training_type caminhada; intensidade em categories", () => {
  const item = { kind: "corrida", training_type: WALK_TRAINING_TYPE, categories: ["Moderada"] };
  assert(isWalkPlanItem(item));
  assert(!isWalkPlanItem({ kind: "ginasio", training_type: WALK_TRAINING_TYPE }));
  assertEquals(walkIntensity(item), "moderada");
  assertEquals(walkIntensity({ categories: [] }), null);
  assertEquals(runPlanItemsOnly([item, { kind: "corrida", training_type: "longo" }]).length, 1);
});

Deno.test("cumprimento: caminhada só cumpre caminhada, corrida só corrida", () => {
  const walkItem = { kind: "corrida", training_type: WALK_TRAINING_TYPE };
  const runItem = { kind: "corrida", training_type: "continuo" };
  assert(runMatchesPlanItem(walk(TODAY, 3), walkItem));
  assert(!runMatchesPlanItem(run(TODAY, 3), walkItem));
  assert(!runMatchesPlanItem(walk(TODAY, 3), runItem));
  assert(runMatchesPlanItem(run(TODAY, 3), runItem));
  assert(!runMatchesPlanItem(walk(TODAY, 3), { kind: "ginasio" }));
});

Deno.test("ACWR de corrida: as caminhadas não contam (nem para o histórico das 4 semanas)", () => {
  const withWalks = [...BASE, walk(TODAY, 12), walk(addDays(TODAY, -2), 10)];
  assertEquals(computeRunAcwr(withWalks, TODAY), computeRunAcwr(BASE, TODAY));
  // Só caminhadas: não há histórico de corrida nenhum.
  const onlyWalks = computeRunAcwr([walk(TODAY, 5), walk(addDays(TODAY, -8), 5), walk(addDays(TODAY, -15), 5)], TODAY);
  assertEquals(onlyWalks.historyWeeks, 0);
  assertEquals(onlyWalks.hasEnoughData, false);
  assertEquals(onlyWalks.acuteKm, 0);
});

Deno.test("km/semana de corrida (calendário): as caminhadas não somam nem contam", () => {
  const v = computeCalendarWeeklyVolume([run("2026-10-05", 8), walk("2026-10-05", 4), walk("2026-09-30", 6)], TODAY);
  assertEquals(v.currentWeek.km, 8);
  assertEquals(v.currentWeek.count, 1);
  assertEquals(v.previousWeek.count, 0);
});

Deno.test("VDOT: uma caminhada a RPE alto não é time trial", () => {
  assertEquals(computeVdotTrend([walk(TODAY, 6, { effort_rpe: 9 })]), []);
  assertEquals(computeVdotTrend([run(TODAY, 6, { effort_rpe: 9 })]).length, 1);
});

Deno.test("melhor pace: a caminhada não entra nos recordes por escalão", () => {
  // Uma caminhada "rápida" absurda (5 km em 20 min) não pode virar recorde.
  const fakeFastWalk = walk(TODAY, 5, { duration_seconds: 1200 });
  assertEquals(computeBestPace([fakeFastWalk], 5), null);
  const best = computeBestPace([fakeFastWalk, run(TODAY, 5)], 5);
  assertEquals(best?.pace, 330);
});

Deno.test("previsão de prova: com só caminhadas não há previsão", () => {
  assertEquals(predictRaceTime([walk(TODAY, 5)] as never, 10).predictedSeconds, 0);
  const p = predictRaceTime([walk(TODAY, 10, { duration_seconds: 1000 }), run(TODAY, 10)] as never, 10);
  assertEquals(p.basedOn?.time, 3300);
});

Deno.test("80/20: as zonas de uma caminhada não enchem a fatia fácil", () => {
  const hard = run(TODAY, 8, { details: { hr_zones: [{ zone: 4, minutes: 30 }] } });
  const easyWalk = walk(TODAY, 5, { details: { hr_zones: [{ zone: 1, minutes: 60 }] } });
  const d = computeTrainingDistribution([hard, easyWalk]);
  assertEquals(d.highIntensityPct, 100);
  assertEquals(d.z1Minutes, 0);
});

Deno.test("viabilidade da prova (volume semanal): só km de corrida", () => {
  assertEquals(computeRecentWeeklyVolume([walk(TODAY, 20), run(TODAY, 8)], TODAY), 2);
  assertEquals(knownWeeklyVolume([...BASE, walk(TODAY, 40)], TODAY), knownWeeklyVolume(BASE, TODAY));
});

Deno.test("alerta de carga: caminhadas fora dos km feitos e dos previstos", () => {
  const items = [{ plan_id: "p", planned_date: TODAY, kind: "corrida", training_type: WALK_TRAINING_TYPE, target_distance_km: 6, status: "pendente" }];
  const r = runLoadReading({ runs: [...BASE, walk(TODAY, 30)], planItems: items, today: TODAY });
  assertEquals(r.acuteKm, computeRunAcwr(BASE, TODAY).acuteKm);
  // Um plano só com caminhadas não prescreve km de corrida.
  assertEquals(r.prescribedKm, null);
});

Deno.test("guarda dos planos (ACWR>1,5): caminhadas propostas não contam como carga", () => {
  const proposed = [10, 11, 12, 13, 14].map((d, i) => ({
    planned_date: addDays(TODAY, i + 1), kind: "corrida", training_type: WALK_TRAINING_TYPE, target_distance_km: 15, status: "pendente",
  }));
  assertEquals(planLoadViolations({ runs: BASE, fixedItems: [], proposedItems: proposed, today: TODAY }), []);
  // As mesmas distâncias em corrida rebentam o teto.
  const asRuns = proposed.map((p) => ({ ...p, training_type: "continuo" }));
  assert(planLoadViolations({ runs: BASE, fixedItems: [], proposedItems: asRuns, today: TODAY }).length > 0);
});

Deno.test("recorde: uma caminhada nunca é recorde, nem a régua dos recordes", () => {
  const history = [run("2026-09-01", 5), run("2026-09-05", 6), run("2026-09-10", 7)];
  assertEquals(runRecordMoment(walk(TODAY, 30), history), null);
  // Uma caminhada longa no histórico não esconde a corrida mais longa de sempre.
  const m = runRecordMoment(run(TODAY, 9), [...history, walk("2026-09-20", 25)]);
  assertEquals(m?.kind, "distance");
});

Deno.test("adesão: a caminhada do plano cumpre-se com uma caminhada; a corrida não a cumpre", () => {
  const walkItem = { planned_date: TODAY, kind: "corrida", training_type: WALK_TRAINING_TYPE, target_distance_km: 4, status: "pendente" };
  assertEquals(evaluateTrainingItem(walkItem, [run(TODAY, 4)], []).outcome, "falhado");
  const ok = evaluateTrainingItem(walkItem, [walk(TODAY, 4)], []);
  assertEquals(ok.outcome, "cumprido");
  assert(ok.text.includes("Caminhada"));
  const runItem = { planned_date: TODAY, kind: "corrida", training_type: "continuo", target_distance_km: 8, status: "pendente" };
  assertEquals(evaluateTrainingItem(runItem, [walk(TODAY, 8)], []).outcome, "falhado");
});

Deno.test("adesão: uma caminhada num dia de descanso é descanso ativo, não o quebra", () => {
  const rest = { planned_date: TODAY, kind: "descanso", status: "pendente" };
  assertEquals(evaluateTrainingItem(rest, [walk(TODAY, 3)], []).outcome, "descanso_respeitado");
  assertEquals(evaluateTrainingItem(rest, [run(TODAY, 3)], []).outcome, "descanso_nao_respeitado");
});

Deno.test("métricas cruzadas: peso vs. pace só com corridas", () => {
  const body = [{ date: TODAY, weight_kg: 70 }];
  const m = computeCrossMetrics([walk(TODAY, 4), run(TODAY, 8)], [], body, TODAY, "semana");
  assertEquals(m.weightVsPace.length, 1);
  assertEquals(m.weightVsPace[0].pace, 330);
});

Deno.test("gasto energético: caminhada a metade do custo por km da corrida", () => {
  assertEquals(distanceCostKcalPerKgKm(walk(TODAY, 1)), WALKING_COST_KCAL_PER_KG_KM);
  assertEquals(distanceCostKcalPerKgKm(run(TODAY, 1)), RUNNING_COST_KCAL_PER_KG_KM);
  assertEquals(WALKING_COST_KCAL_PER_KG_KM * 2, RUNNING_COST_KCAL_PER_KG_KM);
});
