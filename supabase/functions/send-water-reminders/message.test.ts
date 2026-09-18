import { assert, assertEquals } from "jsr:@std/assert@1";
import { formatWater, waterReminderMessage, windowProgress } from "./message.ts";
import { CAROL_TONE_RULES_SHORT } from "../_shared/carolTone.ts";

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
  assertEquals(waterReminderMessage({ ...base, totalMl: 0, hour: 9 }).body, "Ainda não bebeste água hoje. Um copo agora, antes de mais nada.");
  assertEquals(waterReminderMessage({ ...base, totalMl: 0, hour: 15 }).body, "Nem um copo de água registado hoje, e o dia já vai a meio. Bebe agora.");
  // A meio do dia com 20% da meta: atrás do ritmo.
  assertEquals(waterReminderMessage({ ...base, totalMl: 500, hour: 15 }).body, "Estás atrás na água: 500 ml de 2,5 L. Bebe um copo agora.");
  // A meio do dia com 45%: dentro da margem.
  assertEquals(waterReminderMessage({ ...base, totalMl: 1125, hour: 15 }).body, "Vais em 1,1 L de 2,5 L. Um copo agora mantém-te no ritmo.");
  // Nas últimas duas horas, fala do que falta.
  assertEquals(waterReminderMessage({ ...base, totalMl: 1800, hour: 20 }).body, "Faltam 700 ml para a meta e o dia está a acabar. Bebe agora, não tudo antes de dormir.");
  assertEquals(waterReminderMessage({ ...base, totalMl: 1800, hour: 20 }).title, "Carol");
});

Deno.test("waterReminderMessage: nunca emojis nem pontos de exclamação (carolTone)", () => {
  assert(CAROL_TONE_RULES_SHORT.includes("Nunca emojis"));
  for (const totalMl of [0, 300, 1200, 2400]) {
    for (let hour = 0; hour < 24; hour++) {
      const { title, body } = waterReminderMessage({ totalMl, goalMl: 2500, hour, startHour: 8, endHour: 22 });
      const text = `${title} ${body}`;
      assert(!/\p{Extended_Pictographic}/u.test(text), text);
      assert(!text.includes("!"), text);
    }
  }
});
