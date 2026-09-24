import { assert, assertEquals } from "jsr:@std/assert@1";
import { runLoadReading, runLoadInterventionReason, runLoadInterventionToOpen, isRunLoadIntervention, runLoadInterventionKind, RUN_LOAD_INTERVENTION_TAG } from "./runLoadAlert.ts";

const TODAY = "2026-09-24";
const run = (date: string, km: number, min = km * 6) => ({ date, distance_km: km, duration_seconds: min * 60 });
const item = (planned_date: string, km: number | null, over: Record<string, unknown> = {}) =>
  ({ planned_date, kind: "corrida", status: "pendente", target_distance_km: km, ...over });

// O caso que motivou isto (2026-09-24): 3 corridas em 4 semanas, o plano
// previa 17 km nos últimos 7 dias e ele correu 12.
Deno.test("o caso real: ACWR alto, mas pouco histórico e dentro do plano → sem alerta", () => {
  const r = runLoadReading({
    runs: [run("2026-09-13", 10.11), run("2026-09-21", 7.01), run("2026-09-24", 5.03)],
    planItems: [item("2026-09-20", 6), item("2026-09-21", 5, { status: "concluido" }), item("2026-09-22", null, { kind: "descanso" }), item("2026-09-24", 6)],
    today: TODAY,
  });
  assert(r.ratio !== null && r.ratio > 1.5, `rácio ${r.ratio}`);
  assertEquals(r.historyWeeks, 2);
  assertEquals(r.enoughHistory, false);
  assertEquals(r.prescribedKm, 17);
  assertEquals(r.followsPlan, true);
  assertEquals(r.alert, false);
});

// 4 semanas a 10 km, e esta semana 30 — com histórico, é risco a sério.
const steady = [run("2026-08-29", 10), run("2026-09-05", 10), run("2026-09-12", 10)];

Deno.test("com histórico e sem plano de corrida nesses dias → alerta", () => {
  const r = runLoadReading({ runs: [...steady, run("2026-09-20", 15), run("2026-09-23", 15)], planItems: [], today: TODAY });
  assertEquals(r.historyWeeks, 4);
  assertEquals(r.prescribedKm, null);
  assertEquals(r.followsPlan, false);
  assertEquals(r.alert, true);
});

Deno.test("com histórico, mas é o que o plano mandou → sem alerta", () => {
  const r = runLoadReading({
    runs: [...steady, run("2026-09-20", 15), run("2026-09-23", 15)],
    planItems: [item("2026-09-20", 15), item("2026-09-23", 14)],
    today: TODAY,
  });
  assert(r.ratio !== null && r.ratio > 1.5);
  assertEquals(r.followsPlan, true); // 30 ≤ 29 × 1,1
  assertEquals(r.alert, false);
});

Deno.test("correu bem mais do que o plano previa → alerta", () => {
  const r = runLoadReading({
    runs: [...steady, run("2026-09-20", 15), run("2026-09-23", 15)],
    planItems: [item("2026-09-20", 8), item("2026-09-23", 8)],
    today: TODAY,
  });
  assertEquals(r.followsPlan, false);
  assertEquals(r.alert, true);
});

Deno.test("itens cancelados e fora dos 7 dias não contam como prescrito", () => {
  const r = runLoadReading({
    runs: [...steady, run("2026-09-20", 15), run("2026-09-23", 15)],
    planItems: [item("2026-09-20", 15, { status: "cancelado" }), item("2026-09-17", 15), item("2026-09-25", 15)],
    today: TODAY,
  });
  assertEquals(r.prescribedKm, null);
  assertEquals(r.alert, true);
});

Deno.test("item só com minutos: estima os km pelo ritmo do atleta", () => {
  // Ritmo das corridas: 6 min/km → 90 min ≈ 15 km.
  const r = runLoadReading({
    runs: [...steady, run("2026-09-20", 15), run("2026-09-23", 15)],
    planItems: [item("2026-09-20", null, { target_duration_min: 90 }), item("2026-09-23", 15)],
    today: TODAY,
  });
  assertEquals(r.prescribedKm, 30);
  assertEquals(r.alert, false);
});

Deno.test("sem corridas nenhumas → sem rácio e sem alerta", () => {
  const r = runLoadReading({ runs: [], planItems: [], today: TODAY });
  assertEquals(r.ratio, null);
  assertEquals(r.alert, false);
});

Deno.test("corridas com data no futuro não entram", () => {
  const r = runLoadReading({ runs: [...steady, run("2026-09-25", 40)], planItems: [], today: TODAY });
  assertEquals(r.acuteKm, 0);
  assertEquals(r.alert, false);
});

Deno.test("o motivo leva a etiqueta, os números e o tipo certo", () => {
  const comPlano = runLoadInterventionReason({ ratio: 2.4, acuteKm: 30, chronicWeeklyKm: 12.5, prescribedKm: 16, historyWeeks: 4, enoughHistory: true, followsPlan: false, alert: true });
  assert(comPlano.startsWith(RUN_LOAD_INTERVENTION_TAG));
  assert(comPlano.includes("30 km nos últimos 7 dias"));
  assert(comPlano.includes("12,5 km/semana"));
  assert(comPlano.includes("ACWR 2,4"));
  assertEquals(runLoadInterventionKind(comPlano), "acima_do_plano");

  const semPlano = runLoadInterventionReason({ ratio: 2.4, acuteKm: 30, chronicWeeklyKm: 12.5, prescribedKm: null, historyWeeks: 4, enoughHistory: true, followsPlan: false, alert: true });
  assertEquals(runLoadInterventionKind(semPlano), "sem_plano");

  assertEquals(isRunLoadIntervention("Check-in de hoje: dor 7"), false);
  assertEquals(runLoadInterventionKind(null), null);
});

// ── Quando se abre o assunto ────────────────────────────────────────────────
const at = (date: string, km: number, created: string) => ({ ...run(date, km), created_at: created });
const spikeRuns = [
  at("2026-08-29", 10, "2026-08-29T10:00:00.123456+00:00"),
  at("2026-09-05", 10, "2026-09-05T10:00:00+00:00"),
  at("2026-09-12", 10, "2026-09-12T10:00:00+00:00"),
  at("2026-09-20", 15, "2026-09-20T10:00:00+00:00"),
];

Deno.test("abre quando é a corrida registada depois do último resumo que leva ao alerta", () => {
  const r = runLoadInterventionToOpen({
    runs: [...spikeRuns, at("2026-09-24", 15, "2026-09-24T15:36:19.771533+00:00")],
    planItems: [], today: TODAY, previousSummaryAt: "2026-09-23T23:33:58.407+00:00", interventionStatus: "none",
  });
  assert(r !== null && r.alert);
});

Deno.test("não reabre num resumo seguinte sem corridas novas (já estava em alerta)", () => {
  const r = runLoadInterventionToOpen({
    // Os microssegundos do Postgres têm de ser lidos: um NaN aqui fazia de
    // todas as corridas "novas" e o assunto reabria em cada resumo.
    runs: [...spikeRuns, at("2026-09-24", 15, "2026-09-24T15:36:19.771533+00:00")],
    planItems: [], today: TODAY, previousSummaryAt: "2026-09-24T15:40:00.12+00:00", interventionStatus: "resolved",
  });
  assertEquals(r, null);
});

Deno.test("não abre com outro assunto por resolver", () => {
  for (const status of ["needed", "in_progress"]) {
    const r = runLoadInterventionToOpen({
      runs: [...spikeRuns, at("2026-09-24", 15, "2026-09-24T15:36:19+00:00")],
      planItems: [], today: TODAY, previousSummaryAt: "2026-09-23T23:00:00Z", interventionStatus: status,
    });
    assertEquals(r, null, status);
  }
});

Deno.test("sem resumo anterior, todas as corridas são novas", () => {
  const r = runLoadInterventionToOpen({
    runs: [...spikeRuns, at("2026-09-24", 15, "2026-09-24T15:36:19+00:00")],
    planItems: [], today: TODAY, previousSummaryAt: null, interventionStatus: null,
  });
  assert(r !== null);
});

Deno.test("sem alerta agora, nunca abre", () => {
  const r = runLoadInterventionToOpen({ runs: spikeRuns.slice(0, 3), planItems: [], today: TODAY, previousSummaryAt: null, interventionStatus: "none" });
  assertEquals(r, null);
});
