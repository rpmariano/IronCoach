import { assert, assertEquals, assertStringIncludes, assertThrows } from "jsr:@std/assert@1";
import {
  CAROL_LANGUAGE_BY_LEVEL,
  CAROL_TONE_RULES_SHORT,
  assertCarolVoice,
  carolLanguageRule,
  carolRecordAnalysisRules,
  fetchExperienceLevel,
  RECORD_ANALYSIS_LABELS,
  upstreamErrorText,
} from "./carolTone.ts";

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

// Bug #40 (2026-09-22): «Níveis básicos não vão entender estas conversas.»

Deno.test("carolLanguageRule — o básico proíbe siglas e dá a alternativa do dia a dia", () => {
  const r = carolLanguageRule("basico");
  assertStringIncludes(r, "nível básico");
  assertStringIncludes(r, "Sem siglas nem jargão");
  assertStringIncludes(r, "um ritmo em que consegues falar");
});

Deno.test("carolLanguageRule — o iniciante é o básico com menos números", () => {
  const r = carolLanguageRule("iniciante");
  assertStringIncludes(r, "Sem siglas nem jargão");
  assertStringIncludes(r, "o mínimo de números");
});

Deno.test("carolLanguageRule — médio explica os termos, avançado não precisa", () => {
  assertStringIncludes(carolLanguageRule("medio"), "explica cada um");
  assertStringIncludes(carolLanguageRule("avancado"), "sem a explicar");
});

Deno.test("carolLanguageRule — sem nível (ou nível inválido) fala-se como ao básico", () => {
  for (const nivel of [null, undefined, "", "elite"]) {
    const r = carolLanguageRule(nivel as string | null);
    assertStringIncludes(r, "trata-o como básico");
    assertStringIncludes(r, "Sem siglas nem jargão");
  }
});

Deno.test("CAROL_LANGUAGE_BY_LEVEL — as quatro regras, sem depender do atleta", () => {
  for (const rotulo of ["Iniciante:", "Básico:", "Médio:", "Avançado:"]) assertStringIncludes(CAROL_LANGUAGE_BY_LEVEL, rotulo);
});

Deno.test("fetchExperienceLevel — lê o nível e nunca rebenta", async () => {
  // deno-lint-ignore no-explicit-any
  const sb = (data: any, fail = false): any => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => fail ? Promise.reject(new Error("x")) : Promise.resolve({ data }) }) }) }),
  });
  assertEquals(await fetchExperienceLevel(sb({ experience_level: "medio" }), "u"), "medio");
  assertEquals(await fetchExperienceLevel(sb(null), "u"), null);
  assert((await fetchExperienceLevel(sb(null, true), "u")) === null);
});

// Feedback de 2026-09-25: a análise de uma aula de 64 min saiu só com o aviso
// de risco — «é esperado que ela faça também uma análise mais fina ao esforço
// e critique positivamente e negativamente o que ele escreveu».

Deno.test("CAROL_TONE_RULES_SHORT: proíbe o louvor genérico, não o reconhecimento com prova", () => {
  assertStringIncludes(CAROL_TONE_RULES_SHORT, "louvor genérico");
  assertStringIncludes(CAROL_TONE_RULES_SHORT, "reconheces com a prova");
  // Era esta frase que se lia como "não digas nada de bom".
  assertEquals(CAROL_TONE_RULES_SHORT.includes("regista-se em silêncio"), false);
});

Deno.test("carolRecordAnalysisRules: abertura e os quatro blocos, pela ordem, com o rótulo a negrito", () => {
  const r = carolRecordAnalysisRules({ readingLabel: "O esforço", readingHint: "lê o esforço.", focusHint: "Olha para as cargas." });
  const order = ["**O esforço**", `**${RECORD_ANALYSIS_LABELS.good}**`, `**${RECORD_ANALYSIS_LABELS.fix}**`, `**${RECORD_ANALYSIS_LABELS.next}**`]
    .map((l) => r.indexOf(l));
  assert(order.every((i) => i >= 0), "falta um rótulo");
  assert(order.every((i, k) => k === 0 || i > order[k - 1]), "os rótulos não estão pela ordem");
  assertStringIncludes(r, "Abertura: UMA frase");
  assertStringIncludes(r, "lê o esforço.");
  assertStringIncludes(r, "Olha para as cargas.");
  assertStringIncludes(r, "NÃO é elogio automático");
  assertStringIncludes(r, "primeiro reconheces, depois corriges");
  assertStringIncludes(r, "Entre 6 e 10 frases");
});

Deno.test("carolRecordAnalysisRules: rótulo de correção e tamanho próprios (avaliação corporal, refeição)", () => {
  const r = carolRecordAnalysisRules({ readingLabel: "Os números", readingHint: "", focusHint: "", fixLabel: "O que vigiar", sentences: "5 e 8" });
  assertStringIncludes(r, "**O que vigiar**");
  assertEquals(r.includes(`**${RECORD_ANALYSIS_LABELS.fix}**`), false);
  assertStringIncludes(r, "Entre 5 e 8 frases");
});
