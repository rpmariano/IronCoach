import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { CAROL_LANGUAGE_BY_LEVEL, carolLanguageRule, fetchExperienceLevel } from "./carolTone.ts";

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
