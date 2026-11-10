import { assert, assertEquals } from "jsr:@std/assert@1";
import { governingRace, loadProfileChosen, loadProfileRedFlag, loadVolumeState, raceLoadProfile } from "./loadProfile.ts";
import { acuteLimitKm, planLoadViolations, runLoadReading } from "./runLoadAlert.ts";

// O perfil de carga por prova (pedido do Rui, 2026-11-09). A Patty recebeu no
// mesmo dia «estás a esforçar-te demasiado» (ACWR 1,31, zona de cautela) e
// «fazes poucos km para a meia» (19 km/semana contra 35).

const R = (date: string, km: number, training_type: string | null, kind = "treino", rpe: number | null = 5) =>
  ({ date, distance_km: km, training_type, kind, effort_rpe: rpe, duration_seconds: Math.round(km * 340) });
// As corridas da Patty de 13-10 a 08-11 (BD, 2026-11-09).
const PATTY_RUNS = [
  R("2026-10-13", 5.01, "continuo"), R("2026-10-16", 6.04, "continuo"), R("2026-10-17", 18.38, "caminhada", "treino", 6),
  R("2026-10-20", 5.02, "continuo"), R("2026-10-23", 4, "recuperacao"), R("2026-10-25", 10.12, null, "competicao", 8),
  R("2026-10-27", 4.03, "recuperacao", "treino", null), R("2026-10-30", 5.04, "continuo"), R("2026-11-01", 8.01, "longo"),
  R("2026-11-03", 8.01, "longo"), R("2026-11-05", 5.18, "continuo", "treino", 6), R("2026-11-08", 9.95, null, "competicao", 7),
];
const I = (planned_date: string, km: number | null, training_type: string | null, kind = "corrida", status = "pendente") =>
  ({ plan_id: "p2", planned_date, kind, training_type, status, target_distance_km: km });
const PATTY_PLAN = [
  I("2026-11-03", 8, "longo", "corrida", "concluido"), I("2026-11-05", 5, "continuo", "corrida", "concluido"), I("2026-11-08", 10, "prova", "corrida", "concluido"),
  I("2026-11-10", 6, "continuo"), I("2026-11-11", null, null, "ginasio"), I("2026-11-12", 6, "continuo"), I("2026-11-13", 4, "ativacao"),
  I("2026-11-15", 10, "prova"), I("2026-11-22", 3, "prova"), I("2026-11-29", 21.0975, "prova"),
];
const TRAIL = { id: "trail", name: "Atlantic Cliff Adventure", date: "2026-11-15", distance_km: 10, race_priority: "b", status: "agendada", experience_level: "basico" };
const MEIA = { id: "meia", name: "Meia dos Descobrimentos", date: "2026-11-29", distance_km: 21.0975, race_priority: "a", status: "agendada", experience_level: "basico" };

Deno.test("governingRace: a próxima principal (sem prioridade conta como A); sem principal, a próxima", () => {
  assertEquals(governingRace([TRAIL, MEIA], "2026-11-09")?.id, "meia");
  assertEquals(governingRace([TRAIL, { ...MEIA, race_priority: "c" }], "2026-11-09")?.id, "trail");
  assertEquals(governingRace([{ ...TRAIL, race_priority: null }, MEIA], "2026-11-09")?.id, "trail");
  assertEquals(governingRace([{ ...MEIA, status: "concluida" }], "2026-11-09"), null);
  assertEquals(governingRace([MEIA], "2026-11-30"), null);
  assertEquals([raceLoadProfile(MEIA), raceLoadProfile({ ...MEIA, load_profile: "mais_volume" }), raceLoadProfile(null)], ["prudente", "mais_volume", "prudente"]);
  assertEquals([loadProfileChosen(MEIA), loadProfileChosen({ ...MEIA, load_profile_at: "2026-11-09T10:00:00Z" })], [false, true]);
});

Deno.test("acuteLimitKm: Mais volume sobe +15 km com base baixa; com base normal, o ACWR 1,50 nos dois", () => {
  // 8 km/semana nas 3 semanas antes: Prudente 8 + 10 = 18, Mais volume 8 + 15 = 23.
  assertEquals(acuteLimitKm(24).limitKm, 18);
  assertEquals(acuteLimitKm(24, "mais_volume"), { limitKm: 23, lowBase: true });
  // 25 km/semana: o ACWR (0,6 × 75 = 45) nos dois perfis.
  assertEquals(acuteLimitKm(75).limitKm, acuteLimitKm(75, "mais_volume").limitKm);
});

Deno.test("guarda do plano e alerta do dia-a-dia com Mais volume: abaixo do limite dele, nada", () => {
  const base8 = [0, 7, 14, 21].map((d) => R(new Date(Date.parse("2026-10-08T00:00:00Z") + d * 86400000).toISOString().slice(0, 10), 8, "continuo"));
  const proposal = [I("2026-11-09", 10, "continuo"), I("2026-11-11", 10, "continuo")];
  const [prud] = planLoadViolations({ runs: base8, fixedItems: [], proposedItems: proposal, today: "2026-11-06" });
  assert(prud !== undefined);
  assertEquals(prud.limitKm, 18);
  assertEquals(planLoadViolations({ runs: base8, fixedItems: [], proposedItems: proposal, today: "2026-11-06", profile: "mais_volume" }), []);
  // O dia-a-dia: 20 km corridos sem plano em cima de 8 km/semana.
  const ran = [...base8, R("2026-11-02", 10, "continuo"), R("2026-11-04", 10, "continuo")];
  assertEquals(runLoadReading({ runs: ran, planItems: [], today: "2026-11-05" }).alert, true);
  const more = runLoadReading({ runs: ran, planItems: [], today: "2026-11-05", profile: "mais_volume" });
  assertEquals([more.alert, more.limitKm, more.lowBase], [false, 23, true]);
});

Deno.test("loadVolumeState: a Patty a 9 nov — um só estado «conflito», com os números para o cartão", () => {
  const s = loadVolumeState({ races: [TRAIL, MEIA], runs: PATTY_RUNS, planItems: PATTY_PLAN, todayISO: "2026-11-09" });
  assertEquals(s.state, "conflito");
  assertEquals(s.race, { id: "meia", name: "Meia dos Descobrimentos", date: "2026-11-29" });
  assertEquals([s.profile, s.chosen, s.acuteKm, s.ratio], ["prudente", false, 23.1, 1.31]);
  assertEquals([s.currentWeeklyKm, s.recommendedWeeklyKm, s.projectedWeeklyKm], [19.1, 35, 21.2]);
  // O limite com cada perfil: com a base dela (~17,6 km/semana) o ACWR já é quase todo o limite.
  assertEquals(s.limits, { prudente: 28.4, mais_volume: 30.8 });
  assertEquals(s.safeLimitKm, 28.4);
});

Deno.test("loadVolumeState: com o perfil escolhido não há conflito — só o limite dele", () => {
  const chosen = { ...MEIA, load_profile: "mais_volume", load_profile_at: "2026-11-09T12:00:00Z" };
  const s = loadVolumeState({ races: [TRAIL, chosen], runs: PATTY_RUNS, planItems: PATTY_PLAN, todayISO: "2026-11-09" });
  assertEquals([s.state, s.profile, s.chosen, s.safeLimitKm], ["perfil", "mais_volume", true, 30.8]);
  // 23,1 km está abaixo do limite do Mais volume: sem aviso de carga.
  assertEquals(s.loadAlert, false);
  const prudente = loadVolumeState({ races: [{ ...MEIA, load_profile_at: "2026-11-09T12:00:00Z" }], runs: PATTY_RUNS, planItems: PATTY_PLAN, todayISO: "2026-11-09" });
  assertEquals([prudente.state, prudente.loadAlert, prudente.volumeBelow], ["perfil", true, true]);
  // A 13 nov, sem carga a mais: só o volume.
  assertEquals(loadVolumeState({ races: [TRAIL, MEIA], runs: PATTY_RUNS, planItems: PATTY_PLAN, todayISO: "2026-11-13" }).state, "volume");
  assertEquals(loadVolumeState({ races: [], runs: PATTY_RUNS, todayISO: "2026-11-09" }).race, null);
});

Deno.test("loadProfileRedFlag: com Mais volume, dor, RPE ≥ 9 em 2 fáceis seguidas ou recuperação em crítico — só desde a escolha", () => {
  const race = { ...MEIA, load_profile: "mais_volume", load_profile_at: "2026-11-09T12:00:00Z" };
  const ok = { date: "2026-11-10", sleep: 4, energy: 4, stress: 2, pain: 0 };
  assertEquals(loadProfileRedFlag({ race, runs: PATTY_RUNS, checkins: [ok] }), null);
  // Prudente: nunca.
  assertEquals(loadProfileRedFlag({ race: MEIA, runs: [], checkins: [{ ...ok, pain: 8 }] }), null);
  // Dor ≥ 4 (o alarme do check-in) depois da escolha; antes dela não conta.
  assertEquals(loadProfileRedFlag({ race, runs: [], checkins: [ok, { ...ok, date: "2026-11-11", pain: 5 }] }), { reason: "dor", date: "2026-11-11" });
  assertEquals(loadProfileRedFlag({ race, runs: [], checkins: [{ ...ok, date: "2026-11-08", pain: 6 }, ok] }), null);
  // RPE 9 em duas corridas fáceis seguidas; um treino forte pelo meio não as separa (só as fáceis contam).
  const hard = [R("2026-11-10", 6, "continuo", "treino", 9), R("2026-11-11", 8, "intervalos", "treino", 9), R("2026-11-12", 6, "recuperacao", "treino", 9)];
  assertEquals(loadProfileRedFlag({ race, runs: hard, checkins: [] }), { reason: "rpe_alto", date: "2026-11-12" });
  assertEquals(loadProfileRedFlag({ race, runs: [R("2026-11-10", 6, "continuo", "treino", 9), R("2026-11-12", 6, "continuo", "treino", 6)], checkins: [] }), null);
  // Recuperação em crítico: o pilar «Como acordaste» do check-in mais recente abaixo de 25.
  assertEquals(loadProfileRedFlag({ race, runs: [], checkins: [ok, { date: "2026-11-12", sleep: 1, energy: 2, stress: 5, pain: 0 }] }), { reason: "recuperacao_critica", date: "2026-11-12" });
  assertEquals(loadProfileRedFlag({ race, runs: [], checkins: [{ date: "2026-11-11", sleep: 1, energy: 1, stress: 5, pain: 0 }, { ...ok, date: "2026-11-12" }] }), null);
});
