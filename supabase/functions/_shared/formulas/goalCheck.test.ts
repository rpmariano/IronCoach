import { assertEquals } from "jsr:@std/assert@1";
import { inferGoalMet, isMeasurableGoal, parseGoalTarget } from "./goalCheck.ts";
import { computePlanExecution } from "./planExecution.ts";

Deno.test("parseGoalTarget: reps, minutos, km, metros e ritmo", () => {
  assertEquals(parseGoalTarget("chegar às 12 reps"), { kind: "reps", value: 12 });
  assertEquals(parseGoalTarget("Chegar às 12"), { kind: "reps", value: 12 });
  assertEquals(parseGoalTarget("10-12 repetições"), { kind: "reps", value: 10 });
  assertEquals(parseGoalTarget("20 min"), { kind: "minutos", value: 20 });
  assertEquals(parseGoalTarget("pelo menos 8 km"), { kind: "km", value: 8 });
  assertEquals(parseGoalTarget("2000 m"), { kind: "metros", value: 2000 });
  assertEquals(parseGoalTarget("2000 metros"), { kind: "metros", value: 2000 });
  assertEquals(parseGoalTarget("5:30/km"), { kind: "ritmo", value: 330 });
});

Deno.test("parseGoalTarget: o qualitativo e o misto não são mensuráveis", () => {
  for (const g of ["chegar a 3 séries", "20m", "descida em 3 s", "RPE 8", "12 reps com RIR 2", "8 km em 45 min", "controlar a subida", "", "  ", null, 12]) {
    assertEquals(parseGoalTarget(g), null, String(g));
    assertEquals(isMeasurableGoal(g), false);
  }
});

Deno.test("inferGoalMet: força — todas as séries têm de chegar às reps", () => {
  assertEquals(inferGoalMet("chegar às 12", [{ reps: 12 }, { reps: 12 }]), true);
  assertEquals(inferGoalMet("chegar às 12", [{ reps: 12 }, { reps: 10 }]), false);
  assertEquals(inferGoalMet("chegar às 12", [{ reps: null }]), null);
  assertEquals(inferGoalMet("chegar às 12", []), null);
});

Deno.test("inferGoalMet: cardio — tempo, distância e ritmo", () => {
  assertEquals(inferGoalMet("20 min", [{ duration_seconds: 1200 }]), true);
  assertEquals(inferGoalMet("20 min", [{ duration_seconds: 1140 }]), false);
  assertEquals(inferGoalMet("8 km", [{ distance_km: 8.2 }]), true);
  assertEquals(inferGoalMet("2000 m", [{ distance_km: 1.8 }]), false);
  assertEquals(inferGoalMet("5:30/km", [{ duration_seconds: 1600, distance_km: 5 }]), true); // 5:20/km
  assertEquals(inferGoalMet("5:30/km", [{ duration_seconds: 1800, distance_km: 5 }]), false); // 6:00/km
  assertEquals(inferGoalMet("5:30/km", [{ duration_seconds: 1800 }]), null);
  assertEquals(inferGoalMet("descida em 3 s", [{ reps: 10 }]), null);
});

Deno.test("computePlanExecution: o mensurável julga-se sozinho; o confirmado pelo atleta ganha", () => {
  const prescription = { blocks: [
    { type: "forca", name: "Prensa", sets: 2, reps: 12, goal: "chegar às 12" },
    { type: "forca", name: "Supino", sets: 1, reps: 8, goal: "descida em 3 s" },
  ] };
  const sets = [
    { exercise_name: "Prensa", set_index: 0, reps: 12, weight: 100 },
    { exercise_name: "Prensa", set_index: 1, reps: 10, weight: 100 },
    { exercise_name: "Supino", set_index: 0, reps: 8, weight: 50 },
  ];
  const base = { prescription, sessionDate: "2026-10-19", sets };
  const sem = computePlanExecution(base)!;
  assertEquals(sem.blocks.map((b) => b.goalMet), [false, null]);
  const com = computePlanExecution({ ...base, exercisesMeta: [
    { name: "Prensa", goal_met: true }, { name: "Supino", goal_met: true },
  ] })!;
  assertEquals(com.blocks.map((b) => b.goalMet), [true, true]);
  assertEquals(sem.goalsFailed, ["Prensa"]);
});

Deno.test("computePlanExecution: uma série de descarga a mais não deixa um bloco cumprido com objetivo por cumprir", () => {
  const r = computePlanExecution({
    prescription: { blocks: [{ type: "forca", name: "Prensa", sets: 3, reps: 12, goal: "chegar às 12" }] },
    sessionDate: "2026-10-19",
    sets: [12, 12, 12, 8].map((reps, i) => ({ exercise_name: "Prensa", set_index: i, reps, weight: 100 })),
  })!;
  assertEquals(r.blocks[0].status, "cumprido");
  assertEquals(r.blocks[0].goalMet, true);
  assertEquals(r.goalsFailed, []);
});
