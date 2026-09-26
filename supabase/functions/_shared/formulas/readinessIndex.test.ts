import { assertEquals } from "jsr:@std/assert@1";
import { computeReadinessIndex, checkinPillar } from "./readinessIndex.ts";

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
