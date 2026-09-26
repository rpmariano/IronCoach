import { assert, assertEquals } from "jsr:@std/assert@1";
import { formatWater, raceDayWaterPhase, waterReminderMessage, windowProgress } from "./message.ts";
import { CAROL_TONE_RULES_SHORT, assertCarolVoice } from "../_shared/carolTone.ts";

Deno.test("formatWater: ml abaixo do litro, litros com vírgula acima", () => {
  assertEquals(formatWater(900), "900 ml");
  assertEquals(formatWater(1500), "1,5 L");
  assertEquals(formatWater(2000), "2 L");
  assertEquals(formatWater(2449), "2,4 L");
  assertEquals(formatWater(-5), "0 ml");
});

Deno.test("windowProgress: janela normal, por omissão e a atravessar a meia-noite", () => {
  assertEquals(windowProgress(15, 8, 22), { fraction: 0.5, hoursLeft: 7 });
  assertEquals(windowProgress(8, null, null), { fraction: 0, hoursLeft: 14 });
  // 22h às 6h: às 2h da manhã já passaram 4 de 8 horas.
  assertEquals(windowProgress(2, 22, 6), { fraction: 0.5, hoursLeft: 4 });
  // Início igual ao fim é uma janela de 24 horas.
  assertEquals(windowProgress(12, 0, 0), { fraction: 0.5, hoursLeft: 12 });
});

Deno.test("waterReminderMessage: cada situação tem a sua frase, com os números dele", () => {
  const base = { goalMl: 2500, startHour: 8, endHour: 22 };
  assertEquals(waterReminderMessage({ ...base, totalMl: 0, hour: 9 }).body, "Ainda não vejo água registada hoje. Um copo agora.");
  assertEquals(waterReminderMessage({ ...base, totalMl: 0, hour: 15 }).body, "Nem um copo de água registado hoje, e já passou metade do dia. Bebe agora.");
  // A meio do dia com 20% da meta: atrás do ritmo.
  assertEquals(waterReminderMessage({ ...base, totalMl: 500, hour: 15 }).body, "Estás atrás na água: 500 ml de 2,5 L. Bebe um copo agora.");
  // A meio do dia com 45%: dentro da margem.
  assertEquals(waterReminderMessage({ ...base, totalMl: 1125, hour: 15 }).body, "Vais em 1,1 L de 2,5 L. Um copo agora mantém-te no ritmo.");
  // Nas últimas duas horas, já depois das 19h: fala do que falta; de dormir
  // só com 1 L ou mais por beber.
  assertEquals(waterReminderMessage({ ...base, totalMl: 1800, hour: 20 }).body, "Faltam 700 ml para a meta e o dia está a acabar. Um copo agora.");
  assertEquals(waterReminderMessage({ ...base, totalMl: 1300, hour: 20 }).body, "Faltam 1,2 L para a meta e o dia está a acabar. Bebe agora, não tudo antes de dormir.");
  assertEquals(waterReminderMessage({ ...base, totalMl: 1800, hour: 20 }).title, "Carol");
});

/* Revisão de 2026-09-26: as últimas duas horas são as da JANELA de
   lembretes, não necessariamente as últimas do dia real — e nada registado
   também tem uma fase "a meio", não só "cedo" e "a acabar". */
Deno.test("waterReminderMessage: nada registado tem cedo, a meio e a acabar, cada um com a sua frase", () => {
  const base = { goalMl: 2500, startHour: 8, endHour: 22 };
  assertEquals(waterReminderMessage({ ...base, totalMl: 0, hour: 9 }).body, "Ainda não vejo água registada hoje. Um copo agora.");
  assertEquals(waterReminderMessage({ ...base, totalMl: 0, hour: 16 }).body, "Nem um copo de água registado hoje, e já passou metade do dia. Bebe agora.");
  assertEquals(waterReminderMessage({ ...base, totalMl: 0, hour: 21 }).body, "Nem um copo de água registado hoje, e o dia está a acabar. Um copo agora e outro ao jantar.");
});

Deno.test("waterReminderMessage: as últimas duas horas de uma janela que acaba antes das 19h não são \"o dia a acabar\"", () => {
  // Janela 8h–18h: às 16h faltam duas horas PARA A JANELA, mas ainda é meio da tarde.
  assertEquals(
    waterReminderMessage({ goalMl: 2500, startHour: 8, endHour: 18, totalMl: 1800, hour: 16 }).body,
    "Faltam 700 ml para a meta e os lembretes acabam às 18h. Um copo agora.",
  );
  // A partir das 19h, mesmo com outra janela, já é "o dia a acabar".
  assertEquals(
    waterReminderMessage({ goalMl: 2500, startHour: 8, endHour: 20, totalMl: 1400, hour: 19 }).body,
    "Faltam 1,1 L para a meta e o dia está a acabar. Bebe agora, não tudo antes de dormir.",
  );
});

Deno.test("waterReminderMessage: entre a meia-noite e as 6h, só o copo — sem \"dia a acabar\" nem \"antes de dormir\"", () => {
  // Janela 22h–4h: às 2h da manhã já passaram as últimas duas horas dela.
  assertEquals(waterReminderMessage({ goalMl: 2500, startHour: 22, endHour: 4, totalMl: 1800, hour: 2 }).body, "Um copo de água agora.");
  assertEquals(waterReminderMessage({ goalMl: 2500, startHour: 20, endHour: 4, totalMl: 500, hour: 5 }).body, "Um copo de água agora.");
});

Deno.test("waterReminderMessage: nunca emojis nem pontos de exclamação (carolTone)", () => {
  assert(CAROL_TONE_RULES_SHORT.includes("Nunca emojis"));
  for (const totalMl of [0, 300, 1200, 2400]) {
    for (let hour = 0; hour < 24; hour++) {
      for (const afterRace of [false, true]) {
        const { title, body } = waterReminderMessage({ totalMl, goalMl: 2500, hour, startHour: 8, endHour: 22, afterRace });
        const text = `${title} ${body}`;
        assertCarolVoice(text);
      }
    }
  }
});

/* Revisão de 2026-09-26: com lembretes de 24 horas (início igual ao fim), às
   3h o dia de Lisboa já mudou e o total voltou a zero — o push dizia que já
   tinha passado metade do dia. A janela conta-se da meia-noite, e entre a
   meia-noite e as 6h é só o copo, com qualquer total. */
Deno.test("waterReminderMessage: lembretes de 24 horas, de madrugada, só o copo", () => {
  const base = { goalMl: 2500, startHour: 8, endHour: 8 };
  assertEquals(waterReminderMessage({ ...base, totalMl: 0, hour: 3 }).body, "Um copo de água agora.");
  assertEquals(waterReminderMessage({ ...base, totalMl: 400, hour: 5 }).body, "Um copo de água agora.");
  // Às 7h, o dia de Lisboa ainda vai no início: nem "metade" nem "a acabar".
  assertEquals(waterReminderMessage({ ...base, totalMl: 0, hour: 7 }).body, "Ainda não vejo água registada hoje. Um copo agora.");
  assertEquals(windowProgress(7, 8, 8), { fraction: 7 / 24, hoursLeft: 17 });
  assertEquals(windowProgress(13, 8, 8), { fraction: 13 / 24, hoursLeft: 11 });
  for (let hour = 0; hour < 6; hour++) {
    const body = waterReminderMessage({ ...base, totalMl: 0, hour }).body;
    assert(!body.includes("metade") && !body.includes("a meio") && !body.includes("a acabar"), body);
  }
});

/* A app só sabe o que foi registado, e "antes de mais nada" é do primeiro
   lembrete da manhã, não do meio dela. */
Deno.test("waterReminderMessage: sem água registada, \"antes de mais nada\" só na primeira hora", () => {
  const base = { goalMl: 2500, startHour: 8, endHour: 22, totalMl: 0 };
  assertEquals(waterReminderMessage({ ...base, hour: 8 }).body, "Ainda não vejo água registada hoje. Um copo agora, antes de mais nada.");
  assertEquals(waterReminderMessage({ ...base, hour: 10 }).body, "Ainda não vejo água registada hoje. Um copo agora.");
  assertEquals(waterReminderMessage({ ...base, hour: 11 }).body, "Ainda não vejo água registada hoje. Um copo agora.");
  for (let hour = 0; hour < 24; hour++) {
    assert(!waterReminderMessage({ ...base, hour }).body.includes("bebeste"));
  }
});

/* Menos de um copo em falta não se avisa para "não beber tudo antes de
   dormir"; isso só com 1 L ou mais, e só depois das 19h. */
Deno.test("waterReminderMessage: até 300 ml em falta, um copo e está feito", () => {
  assertEquals(waterReminderMessage({ goalMl: 2500, startHour: 8, endHour: 22, totalMl: 2300, hour: 20 }).body, "Faltam 200 ml para a meta. Um copo e está feito.");
  assertEquals(waterReminderMessage({ goalMl: 2500, startHour: 8, endHour: 22, totalMl: 2200, hour: 21 }).body, "Faltam 300 ml para a meta. Um copo e está feito.");
  assertEquals(waterReminderMessage({ goalMl: 2500, startHour: 8, endHour: 18, totalMl: 2300, hour: 16 }).body, "Faltam 200 ml para a meta. Um copo e está feito.");
  // 1 L ou mais, mas antes das 19h: sem "antes de dormir".
  assertEquals(
    waterReminderMessage({ goalMl: 2500, startHour: 8, endHour: 18, totalMl: 1000, hour: 16 }).body,
    "Faltam 1,5 L para a meta e os lembretes acabam às 18h. Um copo agora.",
  );
  for (const totalMl of [1600, 2000, 2200, 2400]) {
    for (let hour = 0; hour < 24; hour++) {
      assert(!waterReminderMessage({ goalMl: 2500, startHour: 8, endHour: 22, totalMl, hour }).body.includes("antes de dormir"));
    }
  }
});

/* O dia da prova: do corte da água (45 min antes da partida) à chegada
   prevista, nenhum lembrete; nas duas horas a seguir, o da prova acabada. */
Deno.test("raceDayWaterPhase: maratona às 9h com objetivo de 3h30 — calada durante a prova, depois a prova acabada", () => {
  const maratona = { start_time: "09:00:00", target_time_seconds: 12600, distance_km: 42.195 };
  assertEquals(raceDayWaterPhase(maratona, 8 * 60), null);
  assertEquals(raceDayWaterPhase(maratona, 8 * 60 + 14), null);
  assertEquals(raceDayWaterPhase(maratona, 8 * 60 + 15), "silencio");
  assertEquals(raceDayWaterPhase(maratona, 9 * 60), "silencio");
  assertEquals(raceDayWaterPhase(maratona, 12 * 60 + 29), "silencio");
  assertEquals(raceDayWaterPhase(maratona, 12 * 60 + 30), "depois");
  assertEquals(raceDayWaterPhase(maratona, 14 * 60 + 29), "depois");
  assertEquals(raceDayWaterPhase(maratona, 14 * 60 + 30), null);
});

Deno.test("raceDayWaterPhase: sem objetivo, a chegada estima-se a 7 min/km; sem distância, 3 h; sem hora, nada", () => {
  const dezK = { start_time: "10:00", target_time_seconds: null, distance_km: 10 };
  assertEquals(raceDayWaterPhase(dezK, 11 * 60 + 9), "silencio");
  assertEquals(raceDayWaterPhase(dezK, 11 * 60 + 10), "depois");
  assertEquals(raceDayWaterPhase({ start_time: "10:00" }, 12 * 60 + 59), "silencio");
  assertEquals(raceDayWaterPhase({ start_time: "10:00" }, 13 * 60), "depois");
  assertEquals(raceDayWaterPhase({ start_time: null, distance_km: 42.195 }, 10 * 60), null);
  assertEquals(raceDayWaterPhase(null, 10 * 60), null);
});

Deno.test("waterReminderMessage: depois da prova, a frase dela", () => {
  const msg = waterReminderMessage({ goalMl: 2500, startHour: 8, endHour: 22, totalMl: 500, hour: 13, afterRace: true });
  assertEquals(msg.body, "Acabaste a prova. Água agora, aos goles, até ao jantar.");
  assertCarolVoice(msg.body);
});
