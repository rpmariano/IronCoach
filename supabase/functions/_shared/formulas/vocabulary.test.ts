// Contrapartida Deno de src/utils/sharedVocabulary.test.js — mesmas
// asserções, mesmo ficheiro fonte (vocabulary.ts), runtime diferente. É a
// garantia barata de que Vite e Deno concordam sobre o vocabulário (ver
// specs/formulas-centralizacao.md §3.6, specs/formulas-checklist.md Fase B).
import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  normalizeGender,
  categorizeDistance,
  isExperienceLevel,
  isRacePriority,
  MIN_PREP_WEEKS,
  MIN_VOLUME_KM,
} from "./vocabulary.ts";

Deno.test("normalizeGender aceita os valores reais gravados em profiles.gender", () => {
  assertEquals(normalizeGender("M"), "M");
  assertEquals(normalizeGender("F"), "F");
});

Deno.test("normalizeGender aceita por extenso e minúsculas por defensividade", () => {
  assertEquals(normalizeGender("masculino"), "M");
  assertEquals(normalizeGender("feminino"), "F");
  assertEquals(normalizeGender("m"), "M");
  assertEquals(normalizeGender("f"), "F");
});

Deno.test("normalizeGender devolve null para valores desconhecidos ou em falta", () => {
  assertEquals(normalizeGender(null), null);
  assertEquals(normalizeGender(undefined), null);
  assertEquals(normalizeGender("outro"), null);
  assertEquals(normalizeGender(""), null);
});

Deno.test("categorizeDistance classifica as fronteiras exatas da doutrina (Bloco 1)", () => {
  assertEquals(categorizeDistance(5.5), "5k");
  assertEquals(categorizeDistance(5.51), "10k");
  assertEquals(categorizeDistance(11.0), "10k");
  assertEquals(categorizeDistance(11.01), "meia");
  assertEquals(categorizeDistance(22.5), "meia");
  assertEquals(categorizeDistance(22.51), "maratona");
  assertEquals(categorizeDistance(50.0), "maratona");
  assertEquals(categorizeDistance(50.01), "ultra");
});

Deno.test("categorizeDistance devolve null para distância em falta", () => {
  assertEquals(categorizeDistance(null), null);
  assertEquals(categorizeDistance(undefined), null);
  assertEquals(categorizeDistance(NaN), null);
});

Deno.test("isExperienceLevel / isRacePriority reconhecem só as chaves válidas", () => {
  assert(isExperienceLevel("iniciante"));
  assert(isExperienceLevel("avancado"));
  assert(!isExperienceLevel("beginner")); // ver P0-8: fallback inglês nunca bateu
  assert(isRacePriority("a"));
  assert(!isRacePriority("z"));
});

Deno.test("MIN_PREP_WEEKS: iniciante × ultra continua desaconselhado (null)", () => {
  assertEquals(MIN_PREP_WEEKS.iniciante.ultra, null);
});

Deno.test("MIN_PREP_WEEKS / MIN_VOLUME_KM: todos os 4 níveis × 5 categorias estão presentes", () => {
  const levels = ["iniciante", "basico", "medio", "avancado"];
  const cats = ["5k", "10k", "meia", "maratona", "ultra"] as const;
  for (const level of levels) {
    for (const cat of cats) {
      assert(cat in MIN_PREP_WEEKS[level]);
      assert(cat in MIN_VOLUME_KM[level]);
    }
  }
});
