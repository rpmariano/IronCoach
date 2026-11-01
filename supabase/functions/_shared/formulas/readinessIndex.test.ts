import { assertEquals } from "jsr:@std/assert@1";
import { computeReadinessIndex, checkinPillar, readinessMealsStartISO } from "./readinessIndex.ts";

const golden = JSON.parse(await Deno.readTextFile(new URL("./readinessIndex.golden.json", import.meta.url)));

for (const { name, input, expect } of golden) {
  Deno.test(`computeReadinessIndex — ${name}`, () => {
    const result = computeReadinessIndex(
      input.runs,
      input.meals,
      input.bodyAssessments,
      input.gymSessions,
      input.profile,
      input.todayISO,
      input.nextRace,
    );
    assertEquals(result, expect);
  });
}

/* Pedido 2026-09-26: o pilar "Como acordaste" com o contexto do dia, e a
   viabilidade tática sem inventar dados que a app não tem. Espelha
   src/utils/readinessIndex.spec.js (a mesma fórmula, do lado do cliente). */
Deno.test("checkinPillar: sem contexto, o texto genérico de sempre", () => {
  assertEquals(checkinPillar({ sleep: 1, energy: 5, stress: 1, pain: 0 })!.desc, "Dormiste mal. Hoje o treino é mais leve.");
  assertEquals(checkinPillar({ sleep: 3, energy: 3, stress: 3, pain: 0 })!.desc, "Dia normal. Treina, com atenção a como te sentes.");
});

Deno.test("checkinPillar: dia de descanso não fala de um treino", () => {
  const ctx = { trainingToday: false };
  assertEquals(checkinPillar({ sleep: 1, energy: 5, stress: 1, pain: 0 }, ctx)!.desc, "Dormiste mal. Hoje é descanso: recupera o sono.");
  assertEquals(checkinPillar({ sleep: 5, energy: 5, stress: 1, pain: 0 }, ctx)!.desc, "Acordaste bem. Hoje é descanso; guarda isso para o próximo treino.");
  assertEquals(checkinPillar({ sleep: 3, energy: 3, stress: 3, pain: 0 }, ctx)!.desc, "Dia normal. Hoje é descanso.");
  assertEquals(checkinPillar({ sleep: 3, energy: 3, stress: 5, pain: 0 }, ctx)!.desc, "Hoje estás em baixo. Ainda bem que é dia de descanso.");
});

Deno.test("checkinPillar: na véspera ou no dia da prova, dormir mal não mexe na prova", () => {
  assertEquals(
    checkinPillar({ sleep: 1, energy: 5, stress: 1, pain: 0 }, { raceTodayOrTomorrow: true })!.desc,
    "Dormiste mal. Perto de uma prova é normal; não mexe na prova.",
  );
});

Deno.test("computeReadinessIndex: maratona marcada a 8 semanas — tempo insuficiente, não 'adequado'", () => {
  const perfil = { experience_level: "iniciante", weight_kg: 70 };
  const nextRace = { date: "2026-11-21", distance_km: 42.195, race_priority: "a", created_at: "2026-09-20T00:00:00Z" };
  const r = computeReadinessIndex([], [], [], [], perfil, "2026-09-26", nextRace, null);
  const tactic = r.pillars.find((p) => p.key === "tactic")!;
  assertEquals(tactic.desc, "Tempo de calendário insuficiente para preparar a prova.");
  assertEquals(tactic.score, 30);
});

Deno.test("computeReadinessIndex: sem nenhuma corrida registada, não pontua 90 nem diz 'adequado'", () => {
  const perfil = { experience_level: "iniciante", weight_kg: 70 };
  const nextRace = { date: "2027-03-01", distance_km: 42.195, race_priority: "a", created_at: "2026-09-01T00:00:00Z" };
  const r = computeReadinessIndex([], [], [], [], perfil, "2026-09-26", nextRace, null);
  const tactic = r.pillars.find((p) => p.key === "tactic")!;
  assertEquals(tactic.desc, "Ainda não tenho corridas para saber se o volume chega.");
});

/* Revisão pré-deploy de 2026-09-26: perto da prova, o pilar não diz "hoje é
   descanso" — sem plano aceite, trainingToday vinha false no dia da prova. */
Deno.test("checkinPillar: no dia ou na véspera da prova, nunca 'descanso'", () => {
  const ctx = { trainingToday: false, raceTodayOrTomorrow: true };
  const bem = checkinPillar({ sleep: 5, energy: 5, stress: 1, pain: 0 }, ctx)!.desc;
  const normal = checkinPillar({ sleep: 3, energy: 3, stress: 3, pain: 0 }, ctx)!.desc;
  const baixo = checkinPillar({ sleep: 3, energy: 3, stress: 5, pain: 0 }, ctx)!.desc;
  assertEquals(bem, "Acordaste bem. Com a prova tão perto, é isto que se quer.");
  assertEquals(normal, "Dia normal. Com a prova tão perto, não mudes nada.");
  assertEquals(baixo, "Hoje estás em baixo. Perto de uma prova é normal; não mexe na prova.");
  for (const d of [bem, normal, baixo]) assertEquals(/descanso/.test(d), false);
});

Deno.test("checkinPillar: energia em baixo com o sono bom não é 'Dormiste mal'", () => {
  const c = { sleep: 4, energy: 2, stress: 2, pain: 0 };
  assertEquals(checkinPillar(c, { raceTodayOrTomorrow: true })!.desc, "Estás sem energia. Perto de uma prova é normal; não mexe na prova.");
  assertEquals(checkinPillar(c, { trainingToday: false })!.desc, "Estás sem energia. Ainda bem que hoje é descanso.");
  assertEquals(checkinPillar(c, {})!.desc, "Estás sem energia. Hoje o treino é mais leve.");
});

/* Auditoria de onboarding (2026-09-27): pilares sem dados não entram na
   média; sem nenhum de treino/nutrição/prova, "a calibrar". Espelha
   src/utils/readinessIndex.spec.js. */
Deno.test("computeReadinessIndex: só corridas — um pilar sozinho não dá número", () => {
  const runs = [
    { date: "2026-08-10", distance_km: 8, duration_seconds: 2400, kind: "competicao", training_type: null, effort_rpe: 8 },
    { date: "2026-08-24", distance_km: 8, duration_seconds: 2280, kind: "competicao", training_type: null, effort_rpe: 8 },
  ];
  const r = computeReadinessIndex(runs, [], [], [], {}, "2026-08-25", null, null);
  assertEquals(r.pillars.find((p) => p.key === "vdot")!.hasData, true);
  assertEquals(r.pillars.find((p) => p.key === "ea")!.hasData, false);
  assertEquals(r.calibrating, true);
});

Deno.test("computeReadinessIndex: só o check-in, ou prova sem corridas — a calibrar", () => {
  assertEquals(computeReadinessIndex([], [], [], [], {}, "2026-08-25", null, { sleep: 5, energy: 5, stress: 1, pain: 0 }).calibrating, true);
  const nextRace = { date: "2027-03-01", distance_km: 10, race_priority: "a", created_at: "2026-08-01T00:00:00Z" };
  assertEquals(computeReadinessIndex([], [], [], [], { experience_level: "intermedio" }, "2026-08-25", nextRace, null).calibrating, true);
});

/* Desde 2026-11-01 (opção B do Rui, dayCompleteness.ts) só contam os dias
   com o registo COMPLETO: um dia «cheio» são as 3 refeições principais. */
const diaCheio = (date: string, kcal = 2400) => ["pequeno-almoco", "almoco", "jantar"].map((meal_type) => ({
  date, meal_type, calories: kcal / 3, protein_g: 40, carbs_g: 100, fat_g: 23,
}));

/* Revisão pré-deploy de 2026-10-04: com refeições registadas, uma EA média
   ≤ 0 é o pior caso de RED-S — conta como crítico (score 0) e puxa o índice
   para baixo, nunca "sem dados". Desde 2026-11-01 vale num dia COMPLETO
   (3 principais, ≥ 50% do objetivo sem histórico); o dia da tirada longa só
   com o pequeno-almoço é parcial e fica de fora — o preço da opção B, dito
   ao Coordenador. Espelhado em src/utils/readinessIndex.spec.js. */
Deno.test("computeReadinessIndex: refeições com EA negativa contam como crítico, não 'sem dados'", () => {
  const runs = [{ date: "2026-08-24", distance_km: 30, duration_seconds: 10800, kind: "treino", training_type: null, effort_rpe: 6 }];
  const meals = diaCheio("2026-08-24", 1200);
  const body = [{ date: "2026-08-01", weight_kg: 70, body_fat_pct: 15 }];
  const profile = { calorie_goal: 2400 };
  const r = computeReadinessIndex(runs, meals, body, [], profile, "2026-08-25", null, null);
  const ea = r.pillars.find((p) => p.key === "ea")!;
  assertEquals(ea.hasData, true);
  assertEquals(ea.score, 0);
  assertEquals(/^EA de -\d/.test(ea.desc), true);
  assertEquals(/Crítico/.test(ea.desc), true);
  const withData = r.pillars.filter((p) => p.hasData);
  assertEquals(r.score, Math.round(withData.reduce((s, p) => s + p.score, 0) / withData.length));
  // Sem refeições nenhumas, o pilar continua fora da média.
  const semRefeicoes = computeReadinessIndex(runs, [], body, [], profile, "2026-08-25", null, null);
  assertEquals(semRefeicoes.pillars.find((p) => p.key === "ea")!.hasData, false);
  assertEquals(semRefeicoes.pillars.find((p) => p.key === "ea")!.desc, "Sem dados nutricionais suficientes.");
  // Só o pequeno-almoço nesse dia: parcial — fora, sem penalização.
  const parcial = computeReadinessIndex(runs, [{ date: "2026-08-24", meal_type: "pequeno-almoco", calories: 300 }], body, [], profile, "2026-08-25", null, null);
  assertEquals(parcial.pillars.find((p) => p.key === "ea")!.hasData, false);
  assertEquals(parcial.pillars.find((p) => p.key === "ea")!.desc, "0 de 7 dias com o registo completo: poucos para avaliar.");
});

/* 2026-10-05: EA e Nutrição só olham para dias FECHADOS (os 7 dias até
   ontem). Um hoje parcial (pequeno-almoço + corrida de manhã) não mexe nos
   pilares; ontem conta; e o que é de hoje não entra mesmo que o chamador o
   passe. Espelhado em src/utils/readinessIndex.spec.js. */
Deno.test("computeReadinessIndex: hoje parcial não mexe em EA nem Nutrição; ontem conta", () => {
  const body = [{ date: "2026-08-01", weight_kg: 70, body_fat_pct: 15 }];
  const profile = { calorie_goal: 2400 };
  const mealOntem = diaCheio("2026-08-24");
  const manha = { date: "2026-08-25", meal_type: "pequeno-almoco", calories: 300, protein_g: 15, carbs_g: 50, fat_g: 5 };
  const corridaHoje = { date: "2026-08-25", distance_km: 15, duration_seconds: 5400, kind: "treino", training_type: null, effort_rpe: 6 };
  const pil = (r: ReturnType<typeof computeReadinessIndex>, k: string) => r.pillars.find((p) => p.key === k)!;

  const semHoje = computeReadinessIndex([], mealOntem, body, [], profile, "2026-08-25", null, null);
  const comHoje = computeReadinessIndex([corridaHoje], [...mealOntem, manha], body, [], profile, "2026-08-25", null, null);
  assertEquals(pil(comHoje, "ea"), pil(semHoje, "ea"));
  assertEquals(pil(comHoje, "calories"), pil(semHoje, "calories"));
  assertEquals(pil(comHoje, "ea").hasData, true);
  assertEquals(/Crítico/.test(pil(comHoje, "ea").desc), false);
  assertEquals(/no único dia com registo completo dos últimos 7/.test(pil(comHoje, "ea").desc), true);
  assertEquals(/no único dia com registo completo dos últimos 7/.test(pil(comHoje, "calories").desc), true);

  // Só hoje registado (nada fechado): os dois pilares ficam sem dados.
  const soHoje = computeReadinessIndex([corridaHoje], [manha], body, [], profile, "2026-08-25", null, null);
  assertEquals(pil(soHoje, "ea").hasData, false);
  assertEquals(pil(soHoje, "calories").hasData, false);
  // ...e dizem porquê: o registo de hoje não se perdeu, só conta a partir de amanhã.
  assertEquals(pil(soHoje, "ea").desc, "Os registos de hoje só contam a partir de amanhã.");
  assertEquals(pil(soHoje, "calories").desc, "Os registos de hoje só contam a partir de amanhã.");
  // Sem nenhuma refeição, o texto genérico de sempre.
  const nada = computeReadinessIndex([corridaHoje], [], body, [], profile, "2026-08-25", null, null);
  assertEquals(pil(nada, "ea").desc, "Sem dados nutricionais suficientes.");
  assertEquals(pil(nada, "calories").desc, "Sem dados de nutrição suficientes.");

  // Ontem conta: a mesma tirada longa, ontem, num dia completo de pouca comida, é crítica.
  const corridaOntem = { ...corridaHoje, date: "2026-08-24" };
  const ontem = computeReadinessIndex([corridaOntem], diaCheio("2026-08-24", 1200), body, [], profile, "2026-08-25", null, null);
  assertEquals(pil(ontem, "ea").hasData, true);
  assertEquals(/Crítico/.test(pil(ontem, "ea").desc), true);
  assertEquals(pil(ontem, "calories").hasData, true);

  // A janela são 7 dias fechados: o dia 17 já saiu, o 18 ainda entra
  // (dias cheios seguidos: o perfil é de quem regista tudo).
  const dias = (de: number, ate: number) => Array.from({ length: ate - de + 1 }, (_, i) => diaCheio(`2026-08-${de + i}`)).flat();
  const de18a24 = computeReadinessIndex([], dias(18, 24), body, [], profile, "2026-08-25", null, null);
  const de17a23 = computeReadinessIndex([], dias(17, 23), body, [], profile, "2026-08-25", null, null);
  assertEquals(/nos 7 dias com registo completo/.test(pil(de18a24, "ea").desc), true);
  assertEquals(/nos 6 dias com registo completo/.test(pil(de17a23, "ea").desc), true);
});

Deno.test("computeReadinessIndex: a EA escreve sempre uma casa decimal, com vírgula", () => {
  const body = [{ date: "2026-08-01", weight_kg: 70, body_fat_pct: 15 }];
  const r = computeReadinessIndex([], diaCheio("2026-08-24"), body, [], { calorie_goal: 2400 }, "2026-08-25", null, null);
  const desc = r.pillars.find((p) => p.key === "ea")!.desc;
  // "NN,N kcal/kg" — nunca "31 kcal/kg" nem "31.0".
  assertEquals(/EA de \d+,\d kcal\/kg/.test(desc), true);
});

Deno.test("readinessMealsStartISO: hoje-28 — o perfil de registo precisa dos 28 dias fechados (2026-11-01)", () => {
  assertEquals(readinessMealsStartISO("2026-10-05"), "2026-09-07");
  assertEquals(readinessMealsStartISO("2026-03-03"), "2026-02-03");
  // O histórico muda o juízo de ontem: com dias cheios a 2400 kcal (desde 15,
  // antes dos 7 dias), ontem só com almoço e jantar a 1000 kcal é parcial
  // (< 50% da mediana); sem eles, a regra fixa (objetivo 1500) dá-o como completo.
  const body = [{ date: "2026-08-01", weight_kg: 70, body_fat_pct: 15 }];
  const historia = Array.from({ length: 9 }, (_, i) => diaCheio(`2026-08-${15 + i}`, 2400)).flat();
  const ontem = [{ date: "2026-08-24", meal_type: "almoco", calories: 600 }, { date: "2026-08-24", meal_type: "jantar", calories: 400 }];
  const ea = (meals: unknown[]) => computeReadinessIndex([], meals as never, body, [], { calorie_goal: 1500 }, "2026-08-25", null, null).pillars.find((p) => p.key === "ea")!;
  assertEquals(/no único dia com registo completo/.test(ea(ontem).desc), true);
  assertEquals(/nos 6 dias com registo completo/.test(ea([...historia, ...ontem]).desc), true);
});

/* Decisão do Rui (2026-11-01, RED-S): um dia com as 3 principais registadas é
   sempre completo — um dia de treino com pequeno-almoço, almoço e jantar a 40%
   da mediana entra e dá EA crítica. O da tirada longa só com o pequeno-almoço
   continua parcial (o teste da EA negativa, acima). Espelhado em
   src/utils/readinessIndex.spec.js. */
Deno.test("computeReadinessIndex: tirada longa num dia com as 3 principais a 40% da mediana — EA crítica (RED-S)", () => {
  const body = [{ date: "2026-08-01", weight_kg: 70, body_fat_pct: 15 }];
  // Regista tudo (01 a 17, todos os dias a 2400): mediana 2400, perfil completo.
  const historia = Array.from({ length: 17 }, (_, i) => diaCheio(`2026-08-${String(1 + i).padStart(2, "0")}`, 2400)).flat();
  const ontem = diaCheio("2026-08-24", 960); // 40% da mediana
  const corrida = [{ date: "2026-08-24", distance_km: 25, duration_seconds: 9000, kind: "treino", training_type: null, effort_rpe: 6 }];
  const r = computeReadinessIndex(corrida, [...historia, ...ontem], body, [], { calorie_goal: 2400 }, "2026-08-25", null, null);
  const ea = r.pillars.find((p) => p.key === "ea")!;
  assertEquals(ea.hasData, true);
  assertEquals(ea.score, 0);
  assertEquals(/no único dia com registo completo dos últimos 7\. Crítico/.test(ea.desc), true);
  // O mesmo dia só com o pequeno-almoço: parcial, fora (sem penalização).
  const soPA = computeReadinessIndex(corrida, [...historia, { date: "2026-08-24", meal_type: "pequeno-almoco", calories: 400 }], body, [], { calorie_goal: 2400 }, "2026-08-25", null, null);
  assertEquals(soPA.pillars.find((p) => p.key === "ea")!.hasData, false);
});
