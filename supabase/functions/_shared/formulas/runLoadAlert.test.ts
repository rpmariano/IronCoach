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
  const comPlano = runLoadInterventionReason({ ratio: 2.4, acuteKm: 30, chronicWeeklyKm: 12.5, prescribedKm: 16, planFrom: "2026-09-18", kmOnPlanDays: 30, hasPlan: true, historyWeeks: 4, enoughHistory: true, followsPlan: false, alert: true }, TODAY);
  assert(comPlano.startsWith(RUN_LOAD_INTERVENTION_TAG));
  assert(comPlano.includes("30 km nos últimos 7 dias"));
  assert(comPlano.includes("12,5 km/semana"));
  assert(comPlano.includes("ACWR 2,4"));
  assertEquals(runLoadInterventionKind(comPlano), "acima_do_plano");

  const semPlano = runLoadInterventionReason({ ratio: 2.4, acuteKm: 30, chronicWeeklyKm: 12.5, prescribedKm: null, planFrom: "2026-09-18", kmOnPlanDays: 30, hasPlan: true, historyWeeks: 4, enoughHistory: true, followsPlan: false, alert: true }, TODAY);
  assertEquals(runLoadInterventionKind(semPlano), "sem_plano");

  assertEquals(isRunLoadIntervention("Check-in de hoje: dor 7"), false);
  assertEquals(runLoadInterventionKind(null), null);
});

// ── Plano que começou a meio da semana ──────────────────────────────────────
Deno.test("plano novo a meio da janela: as corridas de antes dele não são 'acima do plano'", () => {
  // 22 km antes do plano (dia 18) e depois exatamente o que o plano pediu.
  const r = runLoadReading({
    runs: [...steady, run("2026-09-18", 22), run("2026-09-22", 8), run("2026-09-24", 8)],
    planItems: [item("2026-09-21", null, { kind: "descanso" }), item("2026-09-22", 8), item("2026-09-24", 8)],
    today: TODAY,
  });
  assert(r.ratio !== null && r.ratio > 1.5);
  assertEquals(r.followsPlan, true);
  assertEquals(r.hasPlan, true);
  assertEquals(r.alert, false);
});

// ── Quando se abre o assunto ────────────────────────────────────────────────
const at = (date: string, km: number, created = `${date}T10:00:00.123456+00:00`) => ({ ...run(date, km), created_at: created });
// 4 semanas a ~10 km; o plano desta quinzena pede 2 × 5 km por semana.
const base = [at("2026-08-29", 10), at("2026-09-05", 10), at("2026-09-12", 10)];
const lightPlan = ["2026-09-11", "2026-09-14", "2026-09-17", "2026-09-20", "2026-09-22", "2026-09-24"].map((d) => item(d, 5));

Deno.test("abre na passagem para alerta, pela corrida registada depois do último resumo", () => {
  const r = runLoadInterventionToOpen({
    runs: [...base, at("2026-09-20", 15), at("2026-09-24", 15, "2026-09-24T15:36:19.771533+00:00")],
    planItems: lightPlan, today: TODAY, previousSummaryAt: "2026-09-23T23:33:58.407+00:00", interventionStatus: "none",
  });
  assert(r !== null && r.alert);
  assertEquals(runLoadInterventionKind(runLoadInterventionReason(r, TODAY)), "acima_do_plano");
});

Deno.test("não reabre no mesmo dia: o resumo anterior já via o alerta", () => {
  const r = runLoadInterventionToOpen({
    // Os microssegundos do Postgres têm de ser lidos: um NaN aqui fazia de
    // todas as corridas "novas" e o assunto reabria em cada resumo.
    runs: [...base, at("2026-09-20", 15), at("2026-09-24", 15, "2026-09-24T15:36:19.771533+00:00")],
    planItems: lightPlan, today: TODAY, previousSummaryAt: "2026-09-24T15:40:00.12+00:00", interventionStatus: "resolved",
  });
  assertEquals(r, null);
});

Deno.test("não reabre nos dias seguintes enquanto a carga continua alta, mesmo com a janela a avançar", () => {
  // O cenário da revisão pré-deploy: plano leve, o atleta corre sempre a
  // mais. Um resumo por dia, depois de cada corrida; resolve sempre no chat.
  const runs = [...base];
  const opened: string[] = [];
  for (let d = 15; d <= 30; d++) {
    const day = `2026-09-${String(d).padStart(2, "0")}`;
    if (d % 2 === 0) runs.push(at(day, 9, `${day}T18:00:00+00:00`));
    const plan = Array.from({ length: 20 }, (_, k) => item(`2026-09-${String(11 + k).padStart(2, "0")}`, k % 2 ? 0 : 4));
    const r = runLoadInterventionToOpen({ runs, planItems: plan, today: day, previousSummaryAt: `${day}T08:00:00Z`, interventionStatus: "resolved" });
    if (r) opened.push(day);
  }
  assertEquals(opened.length, 1, `abriu em ${opened.join(", ")}`);
});

Deno.test("subida gradual (risco acrescido → perigo) também abre", () => {
  // Ontem 1,3–1,5 (não é alerta); hoje uma corrida passa os 1,5.
  const runs = [...base, at("2026-09-19", 8), at("2026-09-23", 8), at("2026-09-24", 6, "2026-09-24T12:00:00+00:00")];
  const plan = [item("2026-09-17", null, { kind: "descanso" }), item("2026-09-20", 3), item("2026-09-22", 3), item("2026-09-24", 3)];
  const yesterday = runLoadReading({ runs: runs.slice(0, -1), planItems: plan, today: "2026-09-23" });
  assert(yesterday.ratio !== null && yesterday.ratio > 1.3 && yesterday.ratio <= 1.5, `ontem ${yesterday.ratio}`);
  const r = runLoadInterventionToOpen({ runs, planItems: plan, today: TODAY, previousSummaryAt: "2026-09-24T07:00:00Z", interventionStatus: "none" });
  assert(r !== null, "devia abrir");
});

Deno.test("corrida de há 3 dias registada hoje: os dias de trás não a viam, abre", () => {
  const r = runLoadInterventionToOpen({
    runs: [...base, at("2026-09-20", 15), at("2026-09-21", 15, "2026-09-24T09:00:00+00:00")],
    planItems: lightPlan, today: TODAY, previousSummaryAt: "2026-09-24T07:00:00Z", interventionStatus: "none",
  });
  assert(r !== null);
});

Deno.test("sem plano aceite nesses dias não abre (o chat falaria de um plano que não existe)", () => {
  const r = runLoadInterventionToOpen({
    runs: [...base, at("2026-09-20", 15), at("2026-09-24", 15)],
    planItems: [], today: TODAY, previousSummaryAt: null, interventionStatus: null,
  });
  assertEquals(r, null);
});

Deno.test("plano sem corridas nesses dias (só descanso) e ele correu muito: abre, com o motivo 'sem_plano'", () => {
  // O plano de treino tem corridas antes (e depois) — esta semana é só descanso.
  const rest = [item("2026-09-10", 5), ...["2026-09-18", "2026-09-19", "2026-09-20", "2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24"].map((d) => item(d, null, { kind: "descanso" }))];
  const r = runLoadInterventionToOpen({
    runs: [...base, at("2026-09-20", 15), at("2026-09-24", 15)],
    planItems: rest, today: TODAY, previousSummaryAt: null, interventionStatus: "none",
  });
  assert(r !== null);
  assertEquals(runLoadInterventionKind(runLoadInterventionReason(r, TODAY)), "sem_plano");
});

Deno.test("não abre com outro assunto por resolver", () => {
  for (const status of ["needed", "in_progress"]) {
    const r = runLoadInterventionToOpen({
      runs: [...base, at("2026-09-20", 15), at("2026-09-24", 15)],
      planItems: lightPlan, today: TODAY, previousSummaryAt: "2026-09-23T23:00:00Z", interventionStatus: status,
    });
    assertEquals(r, null, status);
  }
});

Deno.test("sem alerta agora, nunca abre", () => {
  const r = runLoadInterventionToOpen({ runs: base, planItems: lightPlan, today: TODAY, previousSummaryAt: null, interventionStatus: "none" });
  assertEquals(r, null);
});

Deno.test("o plano começa com a carga já alta: abre uma vez, no primeiro dia com plano", () => {
  // Sem plano, 3 semanas a subir (20 → 20 → 30 km): alerta, mas nada a abrir.
  // Depois o plano pede 5 km/dia e ele corre 7. Um resumo de manhã e outro
  // depois de cada corrida; resolve sempre no chat.
  const runs: Array<ReturnType<typeof at>> = [];
  const day0 = "2026-08-20";
  const addDays = (d: string, n: number) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  for (let d = 0; d < 21; d++) {
    const date = addDays(day0, d);
    const dow = d % 7;
    if (d < 14 && [0, 2, 4, 5].includes(dow)) runs.push(at(date, 5, `${date}T18:00:00Z`));
    else if (d >= 14 && dow !== 6 && dow !== 3) runs.push(at(date, 6, `${date}T18:00:00Z`));
  }
  const planStart = addDays(day0, 21);
  const plan = Array.from({ length: 30 }, (_, d) => item(addDays(planStart, d), 5));
  const opened: string[] = [];
  let prev = `${addDays(planStart, -1)}T08:00:00Z`;
  for (let d = 0; d < 14; d++) {
    const today = addDays(planStart, d);
    if (runLoadInterventionToOpen({ runs, planItems: plan, today, previousSummaryAt: prev, interventionStatus: "resolved" })) opened.push(`${today} manhã`);
    prev = `${today}T08:00:10Z`;
    runs.push(at(today, 7, `${today}T18:00:00Z`));
    if (runLoadInterventionToOpen({ runs, planItems: plan, today, previousSummaryAt: prev, interventionStatus: "resolved" })) opened.push(`${today} tarde`);
    prev = `${today}T18:00:10Z`;
  }
  assertEquals(opened, [`${planStart} tarde`]);
});

// ── Revisão pré-deploy de aa00b8b ───────────────────────────────────────────
Deno.test("descanso sem item à cabeça da janela: o plano já vinha de trás e responde pela janela inteira", () => {
  // Plano ter/qui/sáb/dom (7 km cada) há semanas; na segunda (descanso, sem
  // item) correu 26 km a mais. No domingo a segunda está à cabeça da janela.
  const weeks = ["2026-08-25", "2026-09-01", "2026-09-08", "2026-09-15"];
  const plan = weeks.flatMap((mon) => [1, 3, 5, 6].map((k) => item(addDaysT(mon, k), 7)));
  const runs = plan.filter((i) => i.planned_date < "2026-09-22").map((i) => run(i.planned_date, 7));
  runs.push(run("2026-09-15", 26));
  const r = runLoadReading({ runs, planItems: plan, today: "2026-09-21" });
  assertEquals(r.planFrom, "2026-09-15");
  assertEquals(r.kmOnPlanDays, 54);
  assertEquals(r.followsPlan, false);
  assertEquals(r.alert, r.ratio !== null && r.ratio > 1.5);
});

Deno.test("plano só de refeições não é plano de treino", () => {
  const meals = ["2026-09-18", "2026-09-20", "2026-09-22", "2026-09-24"].map((d) => item(d, null, { kind: "descanso", plan_id: "refeicoes" }));
  const r = runLoadReading({ runs: [...steady, run("2026-09-20", 15), run("2026-09-23", 15)], planItems: meals, today: TODAY });
  assertEquals(r.hasPlan, false);
  assertEquals(r.planFrom, null);
  assertEquals(runLoadInterventionToOpen({ runs: [...base, at("2026-09-20", 15), at("2026-09-24", 15)], planItems: meals, today: TODAY, previousSummaryAt: null, interventionStatus: "none" }), null);
});

Deno.test("episódio novo depois de dias calmos (≤1,30) abre outra vez", () => {
  // Episódio 1 a 13/09 (aberto), depois dias calmos, e um pico novo a 24/09.
  const hist = ["2026-08-16", "2026-08-23", "2026-08-30", "2026-09-06"].map((d) => at(d, 10));
  const plan = Array.from({ length: 20 }, (_, k) => item(addDaysT("2026-09-06", k), k % 3 ? 0 : 3));
  const runs = [...hist, at("2026-09-13", 24)];
  assert(runLoadInterventionToOpen({ runs, planItems: plan, today: "2026-09-13", previousSummaryAt: "2026-09-13T06:00:00Z", interventionStatus: "none" }) !== null, "episódio 1");
  const later = [...runs, at("2026-09-20", 8), at("2026-09-24", 20, "2026-09-24T15:00:00Z"), at("2026-09-23", 12, "2026-09-23T15:00:00Z")];
  const calm = runLoadReading({ runs: later.filter((r) => r.date <= "2026-09-21"), planItems: plan, today: "2026-09-21" });
  assert(calm.ratio !== null && calm.ratio <= 1.3, `dia calmo ${calm.ratio}`);
  const r = runLoadInterventionToOpen({ runs: later, planItems: plan, today: TODAY, previousSummaryAt: "2026-09-24T06:00:00Z", interventionStatus: "resolved" });
  assert(r !== null, "episódio 2 devia abrir");
});

Deno.test("o motivo usa os números da decisão (desde o início do plano)", () => {
  const plan = [item("2026-09-22", 3), item("2026-09-24", 3)];
  const r = runLoadReading({ runs: [...steady, run("2026-09-19", 20), run("2026-09-22", 8), run("2026-09-24", 8)], planItems: plan, today: TODAY });
  assertEquals(r.planFrom, "2026-09-22");
  assertEquals(r.kmOnPlanDays, 16);
  const motivo = runLoadInterventionReason(r, TODAY);
  assert(motivo.includes("16 km desde 2026-09-22"), motivo);
  assert(motivo.includes("o plano previa 6 km"), motivo);
});

function addDaysT(d: string, n: number) {
  const x = new Date(d + "T00:00:00Z");
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}
