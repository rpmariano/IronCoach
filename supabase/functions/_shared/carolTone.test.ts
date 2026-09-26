import { assert, assertEquals, assertStringIncludes, assertThrows } from "jsr:@std/assert@1";
import {
  CAROL_LANGUAGE_BY_LEVEL,
  CAROL_TONE_RULES_SHORT,
  assertCarolVoice,
  carolLanguageRule,
  carolRecordAnalysisRules,
  fetchExperienceLevel,
  INTERVENTION_INVITE,
  RECORD_ANALYSIS_LABELS,
  upstreamErrorText,
} from "./carolTone.ts";

Deno.test("upstreamErrorText: nunca nomeia o serviço por trás, e distingue limite/timeout/genérico", () => {
  assertEquals(upstreamErrorText(429), "Não consegui responder agora. Tenta daqui a uns minutos.");
  assertStringIncludes(upstreamErrorText(null), "Não consegui responder a tempo");
  assertEquals(upstreamErrorText(500), "Não consegui ler isto agora. Tenta outra vez daqui a pouco.");
  for (const status of [429, null, 500, 502, 503]) {
    assertCarolVoice(upstreamErrorText(status));
  }
});

// Revisão de 2026-09-26: "Não consegui processar isto agora (erro 500)" —
// o código HTTP e "processar" são linguagem de sistema; o código fica no log.
Deno.test("upstreamErrorText: sem código HTTP nem 'processar' na frase", () => {
  for (const status of [400, 429, 500, 502, 503]) {
    const t = upstreamErrorText(status);
    assertEquals(t.includes(String(status)), false, t);
    assertEquals(/erro|processar/i.test(t), false, t);
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
  assertCarolVoice("Não consegui ler isto agora. Tenta outra vez daqui a pouco.");
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
  assertStringIncludes(r, "Entre 6 e 9 frases");
  // Sem plano, o enquadramento proíbe falar de plano — a regra não o pode exigir.
  assertStringIncludes(r, "só se ele tiver plano");
  assertEquals(r.includes("intervention_needed"), false);
});

/* Revisão de 2026-09-26: o prompt ditava "carrega no botão 'Falar com a
   Coach'" — um botão que não existe (é «Falar com a Carol») e ela a falar de
   si como de outra pessoa. O convite é para falarem os dois sobre o plano,
   sem nomear botão; "adaptar o plano" à letra, que é o que os cartões
   procuram para mostrar o «Falar com a Carol». */
Deno.test("carolRecordAnalysisRules: com intervenção, o bloco final é o convite para falarem sobre o plano, sem nomear o botão", () => {
  const r = carolRecordAnalysisRules({ readingLabel: "O esforço", readingHint: "", focusHint: "", interventionInvite: true });
  assertStringIncludes(r, "Se marcaste intervention_needed=true");
  assertStringIncludes(r, INTERVENTION_INVITE);
  assertEquals(r.includes("Falar com a Coach"), false);
  assertEquals(/carrega(r)? no botão/i.test(r), false);
  assertStringIncludes(r, "Não nomeies nenhum botão");
});

Deno.test("INTERVENTION_INVITE: primeira pessoa, sem botão, e com o que faz o cartão mostrar o «Falar com a Carol»", () => {
  // A mesma regex de RunCard, GymSessionCard e MealCard.
  const mostraBotao = /adaptar o plano|falar com a coach|ajustarmos o teu plano|botão vermelho/i;
  const exemplo = /"([^"]+\.)"/.exec(INTERVENTION_INVITE)?.[1] ?? "";
  assertEquals(exemplo, "Fala comigo e vemos como adaptar o plano a esta semana.");
  assertEquals(mostraBotao.test(exemplo), true);
  assertCarolVoice(exemplo);
  assertEquals(INTERVENTION_INVITE.includes("Falar com a"), false);
});

Deno.test("carolRecordAnalysisRules: rótulo de correção e tamanho próprios (avaliação corporal, refeição)", () => {
  const r = carolRecordAnalysisRules({ readingLabel: "Os números", readingHint: "", focusHint: "", fixLabel: "O que vigiar", sentences: "5 e 8" });
  assertStringIncludes(r, "**O que vigiar**");
  assertEquals(r.includes(`**${RECORD_ANALYSIS_LABELS.fix}**`), false);
  assertStringIncludes(r, "Entre 5 e 8 frases");
});
