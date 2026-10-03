// Testa dietaryRestrictionsPromptBlock — a correção que faz o comentário
// automático de cada refeição (meals.coach_notes) respeitar as restrições
// alimentares do atleta. Ver specs/coach-investigacao.md, Bloco 7 #5.
import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { buildManualItemsPrompt, buildPhotosAndItemsPrompt, dietaryRestrictionsPromptBlock, formatMealItemsLine, mergePhotoAndWrittenItems, parseWrittenItems, planningFrameSection } from "./index.ts";

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

// Fase 0 do Troféu (2026-09-26): a prova de referência vai no enquadramento
// "prova agendada, sem plano" — e só lá; sem ela, o texto fica igual.
Deno.test("planningFrameSection: sem plano e com prova, diz qual é a prova de referência", () => {
  const principal = { id: "m1", name: "Maratona de Lisboa", date: "2026-10-11", distance_km: 42.195, race_priority: "a" };
  const bloco = planningFrameSection(false, true, principal);
  assertStringIncludes(bloco, `A prova de referência é "Maratona de Lisboa" (2026-10-11, 42,2 km), a próxima prova principal.`);
  assertEquals(planningFrameSection(false, true, null), planningFrameSection(false, true));
  assertEquals(planningFrameSection(true, true, principal), "");
});

// ─── Bug #47: fotos e alimentos escritos no mesmo registo ──────────────────

const W = (name: string, grams: number | null = null) => ({ name, grams });
const est = (name: string, quantity_grams: number, source_index: number) => ({ name, quantity_grams, calories_per_100g: 100, source_index });

Deno.test("parseWrittenItems: nome aparado, gramas só positivas, sem nome não conta", () => {
  assertEquals(parseWrittenItems([{ name: "  café com açúcar ", grams: "" }, { name: "Arroz", grams: 150 }, { name: "", grams: 20 }, { grams: 5 }]), [
    W("café com açúcar"), W("Arroz", 150),
  ]);
  assertEquals(parseWrittenItems([{ name: "Ovo", grams: 0 }, { name: "Pão", grams: -3 }]), [W("Ovo"), W("Pão")]);
  assertEquals(parseWrittenItems(undefined), []);
  assertEquals(parseWrittenItems("não é lista"), []);
});

Deno.test("mergePhotoAndWrittenItems: os escritos ficam com o nome e as gramas do atleta; os das fotos primeiro", () => {
  const merged = mergePhotoAndWrittenItems(
    [est("Café", 200, 1), est("Bife grelhado", 180, 0), est("arroz branco", 210, 2), est("Salada", 80, 0)],
    [W("café com açúcar"), W("Arroz", 150)],
  )!;
  assertEquals(merged.map((i) => [i.name, i.quantity_grams]), [
    ["Bife grelhado", 180], ["Salada", 80], ["café com açúcar", 200], ["Arroz", 150],
  ]);
  // O source_index não chega à BD (meal_items não tem a coluna).
  assertEquals(merged.some((i) => "source_index" in i), false);
});

Deno.test("mergePhotoAndWrittenItems: um escrito em falta é falha; um índice repetido conta uma vez", () => {
  assertEquals(mergePhotoAndWrittenItems([est("Bife", 180, 0), est("Café", 200, 1)], [W("café"), W("pão")]), null);
  const merged = mergePhotoAndWrittenItems([est("Café", 200, 1), est("Café outra vez", 150, 1)], [W("café")])!;
  assertEquals(merged.map((i) => i.name), ["café"]);
  // Índices fora da lista (ou partidos) são alimentos das fotos.
  const fora = mergePhotoAndWrittenItems([est("Café", 200, 1), est("Pão", 60, 7), est("Fruta", 120, -1)], [W("café")])!;
  assertEquals(fora.map((i) => i.name), ["Pão", "Fruta", "café"]);
});

Deno.test("buildPhotosAndItemsPrompt: a lista numerada, a regra do mesmo alimento e as observações", () => {
  const p = buildPhotosAndItemsPrompt([W("café com açúcar"), W("Arroz", 150)], "frito em azeite");
  assertStringIncludes(p, '1. "café com açúcar" — sem gramas indicadas');
  assertStringIncludes(p, '2. "Arroz" — 150g (valor exato dado pelo utilizador)');
  assertStringIncludes(p, "é o MESMO alimento — devolve-o uma vez só");
  assertStringIncludes(p, "source_index 0");
  assertStringIncludes(p, 'Observação do utilizador: "frito em azeite"');
  assertEquals(buildPhotosAndItemsPrompt([W("Pão")], null).includes("Observação do utilizador"), false);
});

// ─── Bugs #48/#52, fase A: o que ela já sabe entra nos pedidos ─────────────

Deno.test("os pedidos de análise levam a regra dos rótulos, o que ela já sabe e os factos das observações", () => {
  const saber = "\n\nO QUE JÁ SABES DESTE ATLETA (aprendido com ele):\nComo cozinha e tempera — fritos: azeite.";
  const fotos = buildPhotosAndItemsPrompt([{ name: "Café", grams: null }], "bife frito em azeite", saber);
  assertStringIncludes(fotos, "RÓTULOS:");
  assertStringIncludes(fotos, "fritos: azeite");
  assertStringIncludes(fotos, "cooking_facts: só o que a observação");
  const manual = buildManualItemsPrompt([{ name: "Ovos", grams: 100 }], null, saber);
  assertStringIncludes(manual, "fritos: azeite");
  assertStringIncludes(manual, "cooking_facts: lista vazia.");
  assertStringIncludes(manual, "from_label=false");
  // Sem despensa, o pedido não ganha a secção.
  assertEquals(buildManualItemsPrompt([{ name: "Ovos", grams: 100 }], null).includes("O QUE JÁ SABES"), false);
});

Deno.test("fase B: os três pedidos pedem perguntas só quando a preparação muda ≥ 50 kcal", () => {
  for (const p of [
    buildPhotosAndItemsPrompt([{ name: "Café", grams: null }], null),
    buildManualItemsPrompt([{ name: "Ovo estrelado", grams: 100 }], null),
  ]) {
    assertStringIncludes(p, "PERGUNTAS (questions): no máximo 2");
    assertStringIncludes(p, "50 kcal ou mais");
    assertStringIncludes(p, "Na dúvida, não perguntes");
  }
});
