import { assert, assertEquals } from "jsr:@std/assert@1";
import { formatWater, waterReminderMessage, windowProgress } from "./message.ts";
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
  // Nas últimas duas horas, já depois das 19h: fala do que falta e de dormir.
  assertEquals(waterReminderMessage({ ...base, totalMl: 1800, hour: 20 }).body, "Faltam 700 ml para a meta e o dia está a acabar. Bebe agora, não tudo antes de dormir.");
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
    waterReminderMessage({ goalMl: 2500, startHour: 8, endHour: 20, totalMl: 1800, hour: 19 }).body,
    "Faltam 700 ml para a meta e o dia está a acabar. Bebe agora, não tudo antes de dormir.",
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
      const { title, body } = waterReminderMessage({ totalMl, goalMl: 2500, hour, startHour: 8, endHour: 22 });
      const text = `${title} ${body}`;
      assertCarolVoice(text);
    }
  }
});
