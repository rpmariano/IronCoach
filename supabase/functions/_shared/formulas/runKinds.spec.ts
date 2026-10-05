// Contrapartida Vitest de runKinds.test.ts (2026-10-05): o mesmo helper e as
// exclusões principais, corridos pelo bundler do frontend (Vite resolve os
// mesmos .ts) — a garantia de que ecrã e Carol tiram as caminhadas da carga
// de corrida da mesma maneira.
import { describe, it, expect } from "vitest";
import { isWalk, isWalkPlanItem, runMatchesPlanItem, runsOnly, walkTotals, walkIntensity, WALK_TRAINING_TYPE } from "./runKinds.ts";
import { computeRunAcwr } from "./runAcwr.ts";
import { computeCalendarWeeklyVolume } from "./weeklyVolume.ts";
import { computeVdotTrend } from "./vdotTrend.ts";
import { computeBestPace } from "./bestPace.ts";
import { predictRaceTime } from "./racePrediction.ts";

const TODAY = "2026-10-05";
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const run = (date: string, km: number, over: Record<string, unknown> = {}) =>
  ({ date, distance_km: km, duration_seconds: km * 330, kind: "treino", training_type: "continuo", ...over });
const walk = (date: string, km: number, over: Record<string, unknown> = {}) =>
  ({ date, distance_km: km, duration_seconds: km * 660, kind: "treino", training_type: WALK_TRAINING_TYPE, ...over });
const BASE = [0, 3, 7, 10, 14, 17, 21, 24].map((d) => run(addDays(TODAY, -d - 1), 8));

describe("runKinds — o critério único", () => {
  it("isWalk / runsOnly / walkTotals", () => {
    expect(isWalk(walk(TODAY, 3))).toBe(true);
    expect(isWalk(run(TODAY, 3))).toBe(false);
    expect(runsOnly([run(TODAY, 5), walk(TODAY, 3)])).toHaveLength(1);
    expect(walkTotals([walk(TODAY, 3), walk(TODAY, 2.5), run(TODAY, 8)], TODAY, TODAY)).toMatchObject({ count: 2, km: 5.5 });
  });

  it("plano: item de caminhada, intensidade e cumprimento só entre iguais", () => {
    const item = { kind: "corrida", training_type: WALK_TRAINING_TYPE, categories: ["leve"] };
    expect(isWalkPlanItem(item)).toBe(true);
    expect(walkIntensity(item)).toBe("leve");
    expect(runMatchesPlanItem(walk(TODAY, 3), item)).toBe(true);
    expect(runMatchesPlanItem(run(TODAY, 3), item)).toBe(false);
    expect(runMatchesPlanItem(walk(TODAY, 3), { kind: "corrida", training_type: "longo" })).toBe(false);
  });
});

describe("exclusões da carga de corrida", () => {
  it("ACWR igual com e sem caminhadas", () => {
    expect(computeRunAcwr([...BASE, walk(TODAY, 15)], TODAY)).toEqual(computeRunAcwr(BASE, TODAY));
  });
  it("km/semana só de corrida", () => {
    expect(computeCalendarWeeklyVolume([run(TODAY, 8), walk(TODAY, 4)], TODAY).currentWeek).toMatchObject({ km: 8, count: 1 });
  });
  it("VDOT, melhor pace e previsão ignoram caminhadas", () => {
    expect(computeVdotTrend([walk(TODAY, 6, { effort_rpe: 9 })])).toEqual([]);
    expect(computeBestPace([walk(TODAY, 5, { duration_seconds: 1200 })], 5)).toBeNull();
    expect(predictRaceTime([walk(TODAY, 5)] as never, 10).predictedSeconds).toBe(0);
  });
});
