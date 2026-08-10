// Testa dietaryRestrictionsPromptBlock — a correção que faz o comentário
// automático de cada refeição (meals.coach_notes) respeitar as restrições
// alimentares do atleta. Ver specs/coach-investigacao.md, Bloco 7 #5.
import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { dietaryRestrictionsPromptBlock } from "./index.ts";

Deno.test("sem restrições nem notas, devolve string vazia", () => {
  assertEquals(dietaryRestrictionsPromptBlock(null, null), "");
  assertEquals(dietaryRestrictionsPromptBlock([], ""), "");
  assertEquals(dietaryRestrictionsPromptBlock(undefined, undefined), "");
});

Deno.test("vegetariano traz a regra e as alternativas", () => {
  const bloco = dietaryRestrictionsPromptBlock(["vegetariano"], null);
  assertStringIncludes(bloco, "Vegetariano");
  assertStringIncludes(bloco, "tofu");
  assertStringIncludes(bloco, "nunca sugiras");
});

Deno.test("vegano nunca sugere lacticínios nem ovos", () => {
  const bloco = dietaryRestrictionsPromptBlock(["vegano"], null);
  assertStringIncludes(bloco, "nem ovos nem lacticínios");
});

Deno.test("combina várias restrições no mesmo bloco", () => {
  const bloco = dietaryRestrictionsPromptBlock(["vegetariano", "sem_lactose"], null);
  assertStringIncludes(bloco, "Vegetariano");
  assertStringIncludes(bloco, "Sem lactose");
});

Deno.test("as notas de alergia entram em bruto e marcadas como absolutas", () => {
  const bloco = dietaryRestrictionsPromptBlock(null, "alergia a frutos secos");
  assertStringIncludes(bloco, "alergia a frutos secos");
  assertStringIncludes(bloco, "restrição absoluta");
});

Deno.test("uma chave desconhecida é ignorada em vez de rebentar", () => {
  // Um valor antigo na BD não deve impedir o comentário de ser gerado.
  const bloco = dietaryRestrictionsPromptBlock(["inventada"], null);
  assertEquals(bloco, "");
});

Deno.test("notas com só espaços contam como ausentes", () => {
  const bloco = dietaryRestrictionsPromptBlock([], "   ");
  assertEquals(bloco, "");
});
