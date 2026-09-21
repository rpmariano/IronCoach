import { assertEquals, assertStringIncludes, assertThrows } from "jsr:@std/assert@1";
import { CAROL_TONE_RULES_SHORT, assertCarolVoice, upstreamErrorText } from "./carolTone.ts";

Deno.test("upstreamErrorText: nunca nomeia o serviço por trás, e distingue limite/timeout/genérico", () => {
  assertStringIncludes(upstreamErrorText(429), "muitos pedidos");
  assertStringIncludes(upstreamErrorText(null), "Não consegui responder a tempo");
  assertStringIncludes(upstreamErrorText(500), "erro 500");
  for (const status of [429, null, 500, 502, 503]) {
    assertCarolVoice(upstreamErrorText(status));
  }
});

Deno.test("assertCarolVoice: emoji, exclamação e o nome da infraestrutura falham", () => {
  assertThrows(() => assertCarolVoice("Boa corrida! 🎉"), Error, "emoji");
  assertThrows(() => assertCarolVoice("Boa corrida!"), Error, "exclamação");
  assertThrows(() => assertCarolVoice("O Gemini falhou."), Error, "infraestrutura");
  assertThrows(() => assertCarolVoice("Talvez seja melhor descansar."), Error, "suaviza");
  assertThrows(() => assertCarolVoice("Considera descansar amanhã."), Error, "suaviza");
});

Deno.test("assertCarolVoice: não confunde 'consideração' com 'considera' — \\b usa \\w, que não inclui acentos", () => {
  // Sem isto, qualquer frase com "consideração" acendia o aviso por engano.
  assertCarolVoice("Depois de alguma consideração, decidi manter o plano.");
  assertCarolVoice("Foi um treino bem considerado.");
});

Deno.test("assertCarolVoice: texto na voz dela não acende nada", () => {
  assertCarolVoice("Não consegui processar isto agora. Tenta outra vez.");
  assertEquals(CAROL_TONE_RULES_SHORT.includes("Nunca emojis"), true);
});
