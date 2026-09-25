// Testa dietaryRestrictionsPromptBlock — a correção que faz o comentário
// automático de cada refeição (meals.coach_notes) respeitar as restrições
// alimentares do atleta. Ver specs/coach-investigacao.md, Bloco 7 #5.
import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { dietaryRestrictionsPromptBlock, formatMealItemsLine, planningFrameSection } from "./index.ts";

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

Deno.test("planningFrameSection: com plano e com prova deve retornar vazio", () => {
  assertEquals(planningFrameSection(true, true), "");
});

Deno.test("planningFrameSection: com plano e sem prova deve retornar nota de enquadramento de manutencao", () => {
  const bloco = planningFrameSection(true, false);
  assertStringIncludes(bloco, "NOTA DE ENQUADRAMENTO");
  assertStringIncludes(bloco, "NÃO serve nenhuma prova");
});

Deno.test("planningFrameSection: sem plano e com prova deve retornar enquadramento de prova sem plano", () => {
  const bloco = planningFrameSection(false, true);
  assertStringIncludes(bloco, "PROVA AGENDADA, SEM PLANO");
  assertStringIncludes(bloco, "NUNCA digas que este registo está");
});

Deno.test("planningFrameSection: sem plano e sem prova deve retornar enquadramento livre", () => {
  const bloco = planningFrameSection(false, false);
  assertStringIncludes(bloco, "SEM PROVA E SEM PLANO");
  assertStringIncludes(bloco, "quer MANTER os seus hábitos");
});

// Feedback de 2026-09-25: para comentar a refeição pelo nome dos alimentos,
// ela tem de os ver — até aqui só lhe chegavam os totais.
Deno.test("formatMealItemsLine: os alimentos pelo nome, com a quantidade quando a há", () => {
  assertEquals(
    formatMealItemsLine([
      { name: "Arroz", quantity_grams: 150.4 },
      { name: " Frango grelhado ", quantity_grams: 120 },
      { name: "Azeite", quantity_grams: 0 },
      { name: "", quantity_grams: 50 },
    ]),
    "Alimentos: Arroz (150 g), Frango grelhado (120 g), Azeite",
  );
  assertEquals(formatMealItemsLine([]), null);
  assertEquals(formatMealItemsLine(null), null);
});
