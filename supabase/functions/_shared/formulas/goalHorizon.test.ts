import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  addDaysISO,
  DEFICIT_STOP_DAYS_BEFORE_TAPER,
  earliestFeasibleDate,
  evaluateGoalHorizon,
  noDeficitWindows,
} from "./goalHorizon.ts";

const TODAY = "2026-10-03";
const NOW = { weight_kg: 80, body_fat_pct: 20, muscle_mass_kg: 35, lean_body_mass_kg: 64 };

Deno.test("perder 4 kg em 16 semanas sem provas: 0,25 kg/sem, dentro do limite do nível médio", () => {
  const r = evaluateGoalHorizon({ today: TODAY, targetDate: addDaysISO(TODAY, 112), now: NOW, goals: { goal_weight_kg: 76 }, level: "medio" });
  assertEquals(r.weeks, 16);
  assertEquals(r.deficitWeeks, 16);
  const [c] = r.checks;
  assertEquals([c.direction, c.amountKg, c.perWeekKg, c.pctPerWeek, c.limitPct], ["perder", 4, 0.25, 0.31, 0.5]);
  assertEquals(c.limitPerWeekKg, 0.4); // 0,5% de 80 kg
  assert(r.ok);
});

Deno.test("a mesma perda em 6 semanas é demasiado rápida para o médio (0,83%/sem > 0,5%)", () => {
  const r = evaluateGoalHorizon({ today: TODAY, targetDate: addDaysISO(TODAY, 42), now: NOW, goals: { goal_weight_kg: 76 }, level: "medio" });
  assertEquals(r.checks[0].ok, false);
  assertEquals(r.ok, false);
  // Um iniciante tem mais folga (0,7%), mas 0,83% continua acima.
  assertEquals(evaluateGoalHorizon({ today: TODAY, targetDate: addDaysISO(TODAY, 42), now: NOW, goals: { goal_weight_kg: 76 }, level: "iniciante" }).ok, false);
});

Deno.test("uma prova A no meio tira as semanas sem défice: taper + 28 dias até à prova", () => {
  // Meia (14 dias de taper no médio) a 70 dias: sem défice dos dias 28 a 70.
  const race = { name: "Meia de Lisboa", date: addDaysISO(TODAY, 70), distance_km: 21.1, race_priority: "a" };
  const [w] = noDeficitWindows(TODAY, addDaysISO(TODAY, 112), [race], "medio");
  assertEquals(w.from, addDaysISO(TODAY, 70 - 14 - DEFICIT_STOP_DAYS_BEFORE_TAPER));
  assertEquals(w.to, race.date);
  const r = evaluateGoalHorizon({ today: TODAY, targetDate: addDaysISO(TODAY, 112), now: NOW, goals: { goal_weight_kg: 76 }, level: "medio", races: [race] });
  // 112 dias − 43 dias da janela (28..70, inclusive) = 69 dias de défice.
  assertEquals(r.deficitWeeks, Math.round((69 / 7) * 100) / 100);
  assertEquals(r.windows.length, 1);
  assertEquals(r.checks[0].weeks, r.deficitWeeks);
});

Deno.test("uma janela inteira dentro de outra não se repete", () => {
  const races = [
    { name: "Corrida do Tejo", date: addDaysISO(TODAY, 28), distance_km: 10, race_priority: "a" },
    { name: "Noturna", date: addDaysISO(TODAY, 1), distance_km: 5, race_priority: "a" },
  ];
  const ws = noDeficitWindows(TODAY, addDaysISO(TODAY, 60), races, "medio");
  assertEquals(ws.map((w) => w.race), ["Corrida do Tejo"]);
});

Deno.test("provas B/C e provas já passadas não fecham janela nenhuma", () => {
  const races = [
    { date: addDaysISO(TODAY, 40), distance_km: 10, race_priority: "b" },
    { date: addDaysISO(TODAY, 50), distance_km: 5, race_priority: "c" },
    { date: addDaysISO(TODAY, -3), distance_km: 42.2, race_priority: "a" },
  ];
  assertEquals(noDeficitWindows(TODAY, addDaysISO(TODAY, 120), races, "medio"), []);
});

Deno.test("uma prova A depois da data-alvo, mas cuja janela começa antes, também conta", () => {
  const race = { date: addDaysISO(TODAY, 80), distance_km: 42.2, race_priority: "a" }; // maratona: 21 dias de taper
  const r = evaluateGoalHorizon({ today: TODAY, targetDate: addDaysISO(TODAY, 60), now: NOW, goals: { goal_weight_kg: 78 }, level: "medio", races: [race] });
  // Janela a partir do dia 31: só 30 dias de défice até ao dia 60.
  assertEquals(r.windows[0].from, addDaysISO(TODAY, 31));
  assertEquals(r.deficitWeeks, Math.round((30 / 7) * 100) / 100);
});

Deno.test("massa gorda: os kg de gordura a perder, com a massa magra constante", () => {
  // 80 kg a 20% = 16 kg de gordura; 15% com 64 kg magros → 75,29 kg, 11,29 kg de gordura.
  const r = evaluateGoalHorizon({ today: TODAY, targetDate: addDaysISO(TODAY, 140), now: NOW, goals: { goal_body_fat_pct: 15 }, level: "iniciante" });
  assertEquals(r.checks[0].goal, "goal_body_fat_pct");
  assertEquals(r.checks[0].amountKg, 4.71);
  assert(r.ok);
});

Deno.test("ganho muscular: teto por nível e género (kg/mês → kg/semana)", () => {
  const goals = { goal_muscle_mass_kg: 37 }; // +2 kg
  const em12sem = addDaysISO(TODAY, 84);
  // Médio, homem: 0,5 kg/mês ≈ 0,115 kg/sem; 2 kg em 12 sem = 0,17 → acima.
  assertEquals(evaluateGoalHorizon({ today: TODAY, targetDate: em12sem, now: NOW, goals, level: "medio", gender: "M" }).ok, false);
  // Iniciante, homem: 1,5 kg/mês ≈ 0,35 kg/sem → dentro.
  assert(evaluateGoalHorizon({ today: TODAY, targetDate: em12sem, now: NOW, goals, level: "iniciante", gender: "M" }).ok);
  // Iniciante, mulher: 0,75 kg/mês ≈ 0,173 kg/sem; 2 kg em 12 sem = 0,167 → cabe, por pouco.
  assert(evaluateGoalHorizon({ today: TODAY, targetDate: em12sem, now: NOW, goals, level: "iniciante", gender: "F" }).ok);
  // Médio, mulher: 0,25 kg/mês ≈ 0,058 kg/sem → acima.
  assertEquals(evaluateGoalHorizon({ today: TODAY, targetDate: em12sem, now: NOW, goals, level: "medio", gender: "F" }).ok, false);
});

Deno.test("sem medição atual, o objetivo não se verifica (e não reprova)", () => {
  const r = evaluateGoalHorizon({ today: TODAY, targetDate: addDaysISO(TODAY, 30), now: null, goals: { goal_weight_kg: 70, goal_muscle_mass_kg: 40 }, level: "medio" });
  assertEquals(r.unchecked, ["goal_weight_kg", "goal_muscle_mass_kg"]);
  assertEquals(r.checks, []);
  assert(r.ok);
});

Deno.test("subir de peso ou baixar músculo não tem teto na doutrina", () => {
  const r = evaluateGoalHorizon({ today: TODAY, targetDate: addDaysISO(TODAY, 20), now: NOW, goals: { goal_weight_kg: 85, goal_muscle_mass_kg: 30 }, level: "avancado" });
  assertEquals(r.checks, []);
  assert(r.ok);
});

Deno.test("datas fora de [14 dias, 2 anos] não servem", () => {
  assertEquals(evaluateGoalHorizon({ today: TODAY, targetDate: addDaysISO(TODAY, 10), now: NOW, goals: {}, level: "medio" }).outOfRange, true);
  assertEquals(evaluateGoalHorizon({ today: TODAY, targetDate: addDaysISO(TODAY, 800), now: NOW, goals: {}, level: "medio" }).ok, false);
  assert(evaluateGoalHorizon({ today: TODAY, targetDate: addDaysISO(TODAY, 14), now: NOW, goals: {}, level: "medio" }).ok);
});

Deno.test("earliestFeasibleDate: a primeira data em que o ritmo fica dentro do limite", () => {
  // 4 kg a ≤0,4 kg/sem (0,5% de 80) → 10 semanas = 70 dias.
  assertEquals(earliestFeasibleDate({ today: TODAY, now: NOW, goals: { goal_weight_kg: 76 }, level: "medio" }), addDaysISO(TODAY, 70));
  // Com uma prova A no caminho, a janela empurra-a para depois.
  const race = { date: addDaysISO(TODAY, 50), distance_km: 10, race_priority: "a" }; // 10 dias de taper → janela 12..50
  const d = earliestFeasibleDate({ today: TODAY, now: NOW, goals: { goal_weight_kg: 76 }, level: "medio", races: [race] })!;
  assertEquals(d, addDaysISO(TODAY, 70 + 39)); // 11 dias antes + 59 depois da prova = 70 de défice
  // Impossível em dois anos → null.
  assertEquals(earliestFeasibleDate({ today: TODAY, now: NOW, goals: { goal_weight_kg: 40 }, level: "avancado" }), null);
});
