import { assert, assertEquals } from "jsr:@std/assert@1";
import { ACTIVITY_PERIODS_SCHEMA, combinedDuration, durationBreakdown, parseActivityPeriods, sessionDurationSeconds } from "./sessionDuration.ts";

Deno.test("sessionDurationSeconds (bug #94): bicicleta + máquinas somam-se; um só período fica a leitura", () => {
  const rui = [{ kind: "cardio", start_time: null, duration_seconds: 948 }, { kind: "forca", start_time: null, duration_seconds: 2309 }];
  assertEquals(sessionDurationSeconds(2309, rui), 3257);
  assertEquals(sessionDurationSeconds(2309, [{ kind: "forca", duration_seconds: 2309 }]), 2309);
  assertEquals(sessionDurationSeconds(2309, null), 2309);
  assertEquals(sessionDurationSeconds(null, "lixo"), null);
});

Deno.test("parseActivityPeriods: o mesmo treino em dois prints conta uma vez; lixo e durações absurdas caem", () => {
  const p = parseActivityPeriods([
    { kind: "forca", start_time: "13:00", duration_seconds: 2309 },
    { kind: "forca", start_time: "13:01", duration_seconds: 2300 }, // o mesmo, noutro print
    { kind: "cardio", start_time: "12:40", duration_seconds: 948 },
    { kind: "cardio", duration_seconds: 20 }, null, { kind: "x", duration_seconds: "10" },
  ]);
  assertEquals(p, [{ kind: "forca", start: 46800, duration: 2309 }, { kind: "cardio", start: 45600, duration: 948 }]);
});

Deno.test("combinedDuration: com inícios, a sobreposição não conta duas vezes; sem inícios, soma", () => {
  // 12:40–12:55:48 bicicleta e 12:50–13:28:29 força: sobrepõem-se 5:48.
  assertEquals(combinedDuration([{ kind: "cardio", start: 45600, duration: 948 }, { kind: "forca", start: 46200, duration: 2309 }]), 2909);
  assertEquals(combinedDuration([{ kind: "cardio", start: 45600, duration: 948 }, { kind: "forca", start: 46800, duration: 2309 }]), 3257);
  assertEquals(combinedDuration([{ kind: "cardio", start: null, duration: 948 }, { kind: "forca", start: 46800, duration: 2309 }]), 3257);
  assertEquals(combinedDuration([{ kind: "forca", start: null, duration: 2309 }]), null);
});

Deno.test("durationBreakdown: o cardio à parte, sem tirar a força por subtração; sem duração, null (nunca «0 min»)", () => {
  const sets = [
    { exercise_name: "Cadeira extensora", reps: 12, weight: 40, duration_seconds: null },
    { exercise_name: "Bicicleta estacionária", reps: null, weight: null, duration_seconds: 948 },
  ];
  // Sessão nova (total com o cardio) e sessão antiga (total só das máquinas): o
  // texto não afirma a força em nenhuma — a de 38 min já não vira «23 de força».
  assertEquals(durationBreakdown(3257, sets), "54 min registados, com 16 min de cardio (Bicicleta estacionária) — não deduzas daqui o tempo de força");
  assertEquals(durationBreakdown(2309, sets), "38 min registados, com 16 min de cardio (Bicicleta estacionária) — não deduzas daqui o tempo de força");
  // O cardio passa o total: não estão somados, diz-se cada um.
  assertEquals(durationBreakdown(600, sets), "10 min registados na sessão e 16 min de cardio (Bicicleta estacionária) à parte");
  assertEquals(durationBreakdown(2700, [{ exercise_name: "Supino", reps: 10, weight: 60 }]), "45 min");
  assertEquals(durationBreakdown(948, [{ exercise_name: "Bicicleta", reps: null, weight: null, duration_seconds: 948 }]), "16 min");
  assertEquals(durationBreakdown(0, sets), null);
  assertEquals(durationBreakdown(null, null), null);
});

Deno.test("durationBreakdown: uma série só com tempo que não é cardio (prancha 3×60 s) não é cardio", () => {
  const plank = [1, 2, 3].map(() => ({ exercise_name: "Prancha", reps: null, weight: null, duration_seconds: 60 }));
  assertEquals(durationBreakdown(2700, plank), "45 min");
});

Deno.test("sessionDurationSeconds: contra a dupla contagem — o período-resumo sai; sem horas, uma soma > 1,25× a lida só vale se a lida for a de uma atividade", () => {
  // Um período que é o resumo dos outros dois.
  assertEquals(sessionDurationSeconds(3257, [
    { kind: "cardio", duration_seconds: 948 }, { kind: "forca", duration_seconds: 2309 }, { kind: "outro", duration_seconds: 3257 },
  ]), 3257);
  // A lida já é um total (não bate com nenhum período) e a soma passa 1,25×: fica a lida.
  assertEquals(sessionDurationSeconds(2400, [{ kind: "forca", duration_seconds: 2309 }, { kind: "forca", duration_seconds: 2200 }]), 2400);
  // O caso do Rui: a lida é a das máquinas — a soma vale.
  assertEquals(sessionDurationSeconds(2309, [{ kind: "cardio", duration_seconds: 948 }, { kind: "forca", duration_seconds: 2309 }]), 3257);
});

Deno.test("ACTIVITY_PERIODS_SCHEMA: sem limites nos arrays (o 400 de 2026-09-05)", () => {
  const s = JSON.stringify(ACTIVITY_PERIODS_SCHEMA);
  assert(!s.includes("minItems") && !s.includes("maxItems"));
});
