import { assert, assertEquals } from "jsr:@std/assert@1";
import { levelFromVdot, raceVolumeOutlook, secondHighestWeeklyKm } from "./raceVolumeOutlook.ts";
import { planLoadViolations } from "./runLoadAlert.ts";

// #113/#114 (decisão do Rui de 2026-11-06): uma só leitura do volume para a
// prova — o de hoje, o do nível e o que o plano projeta.

const TODAY = "2026-11-06";
// As corridas do Rui de 16-10 a 01-11 (BD, 2026-11-06).
const RUI_RUNS = [
  { date: "2026-10-09", kind: "treino", training_type: "continuo", distance_km: 5.0, duration_seconds: 1800, effort_rpe: 5 },
  { date: "2026-10-16", kind: "treino", training_type: "continuo", distance_km: 6.04, duration_seconds: 2206, effort_rpe: 5 },
  { date: "2026-10-20", kind: "treino", training_type: "continuo", distance_km: 5.02, duration_seconds: 1837, effort_rpe: 3 },
  { date: "2026-10-23", kind: "treino", training_type: "recuperacao", distance_km: 4.08, duration_seconds: 1591, effort_rpe: 2 },
  { date: "2026-10-25", kind: "competicao", training_type: null, distance_km: 10.12, duration_seconds: 2969, effort_rpe: 9, details: { elevation_gain_m: 14, race_type: "10k" } },
  { date: "2026-10-28", kind: "treino", training_type: "continuo", distance_km: 5.12, duration_seconds: 1660, effort_rpe: 6 },
  { date: "2026-10-30", kind: "treino", training_type: "continuo", distance_km: 6.08, duration_seconds: 2013, effort_rpe: 7 },
  { date: "2026-11-01", kind: "treino", training_type: "trail", distance_km: 15.92, duration_seconds: 6664, effort_rpe: 9, details: { elevation_gain_m: 499 } },
];
// O calendário dele: 10 km a 8-11 (B), meia trail a 15-11, 6 km a 22-11, meia a 29-11 (A).
const CAL = {
  dezKm: { name: "Cascais Oeiras Lisboa", date: "2026-11-08", distance_km: 10, experience_level: "basico" },
  meia29: { name: "Meia dos Descobrimentos", date: "2026-11-29", distance_km: 21.0975, experience_level: "basico" },
};
// Um plano com a doutrina nova: ativação de 3 km, corridas fáceis de 5-6 km entre as provas.
const item = (planned_date: string, km: number, training_type = "continuo") => ({ planned_date, kind: "corrida", training_type, target_distance_km: km, status: "pendente" });
const PLAN = [
  item("2026-11-07", 3, "ativacao"), item("2026-11-08", 10, "prova"),
  item("2026-11-11", 5), item("2026-11-13", 5), item("2026-11-14", 3, "ativacao"), item("2026-11-15", 21.1, "prova"),
  item("2026-11-18", 5), item("2026-11-20", 6), item("2026-11-21", 3, "ativacao"), item("2026-11-22", 6, "prova"),
  item("2026-11-25", 6), item("2026-11-28", 3, "ativacao"),
];

Deno.test("levelFromVdot: as bandas da doutrina (00-niveis-experiencia)", () => {
  assertEquals([levelFromVdot(25), levelFromVdot(30), levelFromVdot(38), levelFromVdot(41.1), levelFromVdot(51), levelFromVdot(null)],
    ["iniciante", "basico", "medio", "medio", "avancado", null]);
});

Deno.test("secondHighestWeeklyKm: a 2.ª semana mais alta das 4; menos de 3 semanas, null", () => {
  const days = RUI_RUNS.map((r) => ({ date: r.date, km: r.distance_km }));
  assertEquals(secondHighestWeeklyKm(days, TODAY), 15.9); // 15,92 · 21,32 · 9,10 · 6,04
  assertEquals(secondHighestWeeklyKm([{ date: TODAY, km: 10 }], TODAY), null);
});

Deno.test("raceVolumeOutlook: o calendário real do Rui — a meia de 29 nov fica abaixo; o ritmo já é de Médio", () => {
  const o = raceVolumeOutlook({ race: CAL.meia29, runs: RUI_RUNS, planItems: PLAN, todayISO: TODAY });
  assertEquals([o.category, o.level, o.currentWeeklyKm, o.recommendedWeeklyKm], ["meia", "basico", 15.9, 35]);
  // Na véspera (28-11), com o plano cumprido: as semanas são 15 · 35,1 · 23 · 18,9 —
  // a 2.ª mais alta é a de 8 a 14 nov (10 + 5 + 5 + 3 = 23 km).
  assertEquals(o.projectedWeeklyKm, 23);
  assertEquals([o.status, o.gapKm], ["abaixo", 12]);
  assertEquals([o.vdot, o.vdotDate, o.paceLevel], [41.1, "2026-10-25", "medio"]);
  // O 10 km de domingo: sem plano para lá de hoje até à véspera, conta o de hoje.
  const d = raceVolumeOutlook({ race: CAL.dezKm, runs: RUI_RUNS, planItems: PLAN, todayISO: TODAY });
  assertEquals([d.projectedWeeklyKm != null, d.status, d.recommendedWeeklyKm], [true, "abaixo", 25]);
  // Sem nível: sem dados.
  assertEquals(raceVolumeOutlook({ race: { ...CAL.meia29, experience_level: null }, runs: RUI_RUNS, todayISO: TODAY }).status, "sem_dados");
});

Deno.test("raceVolumeOutlook: chega quando o projetado chega ao do nível", () => {
  const o = raceVolumeOutlook({ race: { ...CAL.meia29, experience_level: "iniciante" }, runs: RUI_RUNS, planItems: PLAN, todayISO: TODAY });
  assertEquals([o.recommendedWeeklyKm, o.status, o.gapKm], [25, "abaixo", 2]);
  const ok = raceVolumeOutlook({ race: { ...CAL.dezKm, experience_level: "iniciante" }, runs: RUI_RUNS, planItems: PLAN, todayISO: TODAY });
  assertEquals([ok.recommendedWeeklyKm, ok.status], [15, "chega"]);
});

Deno.test("raceVolumeOutlook: semanas por planear não contam como zero (revisão do lote e3901569)", () => {
  // Só a primeira semana planeada (até 13-11): a meia de 29 nov fica por planear,
  // não «abaixo» — as semanas de 14 a 28 ainda podem somar.
  const week1 = PLAN.filter((i) => i.planned_date <= "2026-11-13");
  const o = raceVolumeOutlook({ race: CAL.meia29, runs: RUI_RUNS, planItems: week1, todayISO: TODAY, plannedUntilISO: "2026-11-13" });
  assertEquals([o.status, o.projectedWeeklyKm, o.gapKm, o.currentWeeklyKm, o.recommendedWeeklyKm], ["por_planear", null, 0, 15.9, 35]);
  // Sem plano nenhum, o mesmo.
  assertEquals(raceVolumeOutlook({ race: CAL.meia29, runs: RUI_RUNS, todayISO: TODAY }).status, "por_planear");
  // O que já se sabe chega: «chega», com esse mínimo como projetado.
  const easy = raceVolumeOutlook({ race: { ...CAL.meia29, distance_km: 5, experience_level: "iniciante" }, runs: RUI_RUNS, planItems: week1, todayISO: TODAY, plannedUntilISO: "2026-11-13" });
  assertEquals([easy.status, easy.recommendedWeeklyKm, easy.projectedWeeklyKm], ["chega", 10, 18.9]);
  // Com o plano até à prova (period_end = dia da prova), a leitura completa.
  assertEquals(raceVolumeOutlook({ race: CAL.meia29, runs: RUI_RUNS, planItems: PLAN, todayISO: TODAY, plannedUntilISO: "2026-11-29" }).status, "abaixo");
});

Deno.test("guarda de carga com base baixa: o plano do Rui com corridas úteis entre provas passa", () => {
  const v = planLoadViolations({ runs: RUI_RUNS, fixedItems: [], proposedItems: PLAN, today: TODAY });
  assertEquals(v, []);
  // E uma semana muito acima (4 × 8 km = 32) é apontada. Com 17,5 km/semana nas 3
  // semanas antes, o ACWR (0,6 × 52,4 = 31,4) já dá mais do que 17,5 + 10: manda ele.
  const muito = [item("2026-11-09", 8), item("2026-11-10", 8), item("2026-11-11", 8), item("2026-11-12", 8)];
  const [w] = planLoadViolations({ runs: RUI_RUNS, fixedItems: [], proposedItems: muito, today: TODAY });
  assert(w !== undefined);
  assertEquals([w.lowBase, w.limitKm], [false, 31.4]);
  // Uma base de 8 km/semana: aí a subida absoluta (8 + 10 = 18) ganha ao ACWR (14,4).
  const base8 = [0, 7, 14, 21].map((d) => ({ date: new Date(Date.parse("2026-10-14T00:00:00Z") + d * 86400000).toISOString().slice(0, 10), kind: "treino", training_type: "continuo", distance_km: 8, duration_seconds: 2880 }));
  const [b] = planLoadViolations({ runs: base8, fixedItems: [], proposedItems: [item("2026-11-09", 10), item("2026-11-11", 10)], today: TODAY });
  assert(b !== undefined);
  assertEquals([b.lowBase, b.limitKm], [true, 18]);
});
