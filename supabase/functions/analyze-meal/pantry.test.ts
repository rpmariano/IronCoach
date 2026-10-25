import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { foodKey } from "../_shared/formulas/foodKey.ts";
import {
  applyPantry, type FoodRule, knowledgeSection, learnFromMeal, learnRules, nextFoodRow, nextRuleRow, type PantryFood,
  isPantryComplete, microFromModel, microOrNull, MICRO_COLUMNS, microsTrusted, missingMicros, NUTRIENT_COLUMNS, pantryMicro,
  contextualTopic, optionGrams, parseCookingFacts, parseQuestions, portionFacts, quantityAnswerGrams, quantityTopic, pendingRulesFor, pickMealItem, remapQuestionItems, splitKnownWritten, withPantryValues,
  withWrittenFoods,
} from "./pantry.ts";

// Bugs #48/#52, fase A: a despensa e como ele cozinha.

const NOW = "2026-10-04T12:00:00.000Z";
const iogurte: PantryFood = {
  name: "Iogurte grego 0%", name_key: "iogurte grego 0%", portion_grams: 170, portion_label: null,
  times_seen: 6, in_pantry: true, source: "refeicao", edited_by_athlete: false,
  calories_per_100g: 59, protein_per_100g: 10, carbs_per_100g: 3.6, fat_per_100g: 0.4,
};
// Completo (2026-10-05): os sete micronutrientes dados — os zeros valem
// porque a linha foi escrita pelo código novo (micros_checked_at = updated_at).
const MICROS_IOGURTE = {
  fiber_per_100g: 0, sugar_per_100g: 3.6, sodium_per_100g: 36, iron_mg_per_100g: 0,
  calcium_mg_per_100g: 110, vitamin_c_mg_per_100g: 0, potassium_mg_per_100g: 141,
};
const iogurteCompleto: PantryFood = { ...iogurte, ...MICROS_IOGURTE, micros_checked_at: NOW, updated_at: NOW };
const byKey = new Map([[iogurte.name_key, iogurteCompleto]]);
const estimado = (name: string, kcal: number, extra: Record<string, unknown> = {}) => ({
  name, quantity_grams: 150, calories_per_100g: kcal, protein_per_100g: 5, carbs_per_100g: 10, fat_per_100g: 2, ...extra,
});

Deno.test("foodKey: o mesmo alimento escrito de maneiras diferentes tem a mesma chave", () => {
  assertEquals(foodKey("Iogurte Grego 0 %"), "iogurte grego 0%");
  assertEquals(foodKey("  Pão  de mistura (Lidl) "), "pao de mistura lidl");
  assertEquals(foodKey(null), "");
});

Deno.test("pickMealItem: só as colunas de meal_items chegam à BD", () => {
  const row = pickMealItem({ ...estimado("Arroz", 130), from_label: true, source_index: 2, from_pantry: true });
  assertEquals("from_label" in row || "source_index" in row || "from_pantry" in row, false);
  assertEquals(row.name, "Arroz");
  // D6 (2026-10-05): um micronutriente que não veio grava null, não 0.
  assertEquals(row.potassium_mg_per_100g, null);
});

// ── D6 da Evolução (2026-10-05): micronutrientes por saber ficam null ──────

Deno.test("microOrNull: número ≥ 0 fica; null, vazio, negativo e lixo são 'não sei' (null), nunca 0", () => {
  assertEquals(microOrNull(3.2), 3.2);
  assertEquals(microOrNull(0), 0); // zero dado é zero
  assertEquals(microOrNull("4,5".replace(",", ".")), 4.5);
  assertEquals(microOrNull("12"), 12); // o PostgREST pode devolver numeric como texto
  for (const v of [null, undefined, "", "  ", -1, NaN, Infinity, "abc", {}]) assertEquals(microOrNull(v), null);
});

Deno.test("microFromModel: só um número do modelo é valor; campo ausente ou texto é null", () => {
  assertEquals(microFromModel(2.7), 2.7);
  assertEquals(microFromModel(0), 0);
  assertEquals(microFromModel(undefined), null);
  assertEquals(microFromModel(null), null);
  assertEquals(microFromModel("3"), null); // como o num() de sempre: texto não conta
  assertEquals(microFromModel(-2), null);
});

Deno.test("pickMealItem: micronutrientes em falta ficam null; calorias e macros continuam 0", () => {
  const row = pickMealItem({ name: "Salada", quantity_grams: 80, fiber_per_100g: 2.1, iron_mg_per_100g: 0 });
  assertEquals(row.fiber_per_100g, 2.1);
  assertEquals(row.iron_mg_per_100g, 0); // um 0 dado continua 0
  for (const k of ["sugar_per_100g", "sodium_per_100g", "calcium_mg_per_100g", "vitamin_c_mg_per_100g", "potassium_mg_per_100g"]) {
    assertEquals(row[k], null, k);
  }
  for (const k of ["calories_per_100g", "protein_per_100g", "carbs_per_100g", "fat_per_100g"]) assertEquals(row[k], 0, k);
  // As 11 colunas de nutrientes vão sempre explícitas no insert (o DEFAULT nunca se usa).
  for (const k of NUTRIENT_COLUMNS) assert(k in row, k);
  assertEquals(MICRO_COLUMNS.length, 7);
});

Deno.test("withPantryValues: um 0 de micronutriente da despensa é ambíguo e passa como null; os outros ficam", () => {
  const comMicros: PantryFood = { ...iogurte, fiber_per_100g: 0, sodium_per_100g: 36, calcium_mg_per_100g: 110, iron_mg_per_100g: 0 };
  const it = withPantryValues({ quantity_grams: 170 }, comMicros) as Record<string, unknown>;
  assertEquals(it.calories_per_100g, 59);
  assertEquals(it.fat_per_100g, 0.4);
  assertEquals(it.sodium_per_100g, 36);
  assertEquals(it.calcium_mg_per_100g, 110);
  assertEquals(it.fiber_per_100g, null);
  assertEquals(it.iron_mg_per_100g, null);
  assertEquals(it.potassium_mg_per_100g, null); // nem estava na linha
  // Macros a 0 na despensa são 0 (não mudou).
  const semGordura = withPantryValues({ quantity_grams: 100 }, { ...iogurte, fat_per_100g: 0 }) as Record<string, unknown>;
  assertEquals(semGordura.fat_per_100g, 0);
});

Deno.test("nextFoodRow: um micronutriente por saber entra na despensa como null, nunca 0; a linha fica marcada", () => {
  const row = nextFoodRow(null, estimado("Arroz branco", 130, { fiber_per_100g: null, sodium_per_100g: 1, iron_mg_per_100g: 0 }), "u1", NOW)!;
  assertEquals(row.fiber_per_100g, null);
  assertEquals(row.potassium_mg_per_100g, null); // nem veio
  assertEquals(row.sodium_per_100g, 1);
  assertEquals(row.iron_mg_per_100g, 0); // um 0 dado pela análise é dado
  assertEquals([row.micros_checked_at, row.updated_at], [NOW, NOW]);
});

// ── Despensa com micronutrientes (2026-10-05) ──────────────────────────────

Deno.test("withPantryValues: usa os micronutrientes da despensa quando os sabe; senão os da análise; nunca inventa 0", () => {
  const parcial: PantryFood = { ...iogurte, sodium_per_100g: 36, fiber_per_100g: 0, micros_checked_at: NOW, updated_at: NOW };
  const daAnalise = { quantity_grams: 170, sodium_per_100g: 50, fiber_per_100g: 1, calcium_mg_per_100g: 120, iron_mg_per_100g: null };
  const it = withPantryValues(daAnalise, parcial) as Record<string, unknown>;
  assertEquals(it.sodium_per_100g, 36); // a despensa sabe: fica o dela
  assertEquals(it.fiber_per_100g, 0); // 0 dado (linha marcada): fica 0
  assertEquals(it.calcium_mg_per_100g, 120); // a despensa não sabe: o da análise
  assertEquals(it.iron_mg_per_100g, null); // ninguém sabe
  assertEquals(it.calories_per_100g, 59); // macros: os da despensa
  assertEquals(it.from_pantry, true);
  assertEquals("pantry_pending" in it, false);
  assertEquals((withPantryValues({}, parcial, true) as Record<string, unknown>).pantry_pending, true);
});

Deno.test("nextFoodRow: na despensa, os micronutrientes por confirmar (null ou 0 antigo) preenchem-se; os dados ficam", () => {
  // Linha antiga: zeros ambíguos, sem marca.
  const antigo: PantryFood = { ...iogurte, fiber_per_100g: 0, sodium_per_100g: 36, iron_mg_per_100g: 0, potassium_mg_per_100g: null };
  const analise = estimado("Iogurte grego 0%", 90, { fiber_per_100g: 0.2, sodium_per_100g: 60, potassium_mg_per_100g: 150 });
  const row = nextFoodRow(antigo, analise, "u1", NOW)!;
  assertEquals(row.calories_per_100g, 59); // macros da despensa ficam
  assertEquals(row.fiber_per_100g, 0.2); // 0 antigo: por confirmar → preenche
  assertEquals(row.potassium_mg_per_100g, 150); // null → preenche
  assertEquals(row.sodium_per_100g, 36); // dado: não se escreve por cima
  assertEquals(row.iron_mg_per_100g, null); // 0 antigo que ninguém confirmou: diz-se "por confirmar"
  assertEquals(row.micros_checked_at, row.updated_at);
  // Linha nova, com um 0 dado: fica 0 mesmo que a análise diga outra coisa.
  const marcado: PantryFood = { ...iogurteCompleto };
  assertEquals(nextFoodRow(marcado, estimado("Iogurte grego 0%", 90, { vitamin_c_mg_per_100g: 4 }), "u1", NOW)!.vitamin_c_mg_per_100g, 0);
  // Ajustado à mão: os micronutrientes por confirmar também se preenchem (ele só ajusta calorias e macros).
  const ajustado = nextFoodRow({ ...antigo, edited_by_athlete: true }, analise, "u1", NOW)!;
  assertEquals([ajustado.calories_per_100g, ajustado.potassium_mg_per_100g], [59, 150]);
});

Deno.test("nextFoodRow: um rótulo ganha nos micronutrientes que lê; os que não lê ficam os que a despensa sabia", () => {
  const rotulo = estimado("Iogurte grego 0%", 61, { from_label: true, sodium_per_100g: 40, calcium_mg_per_100g: null });
  const row = nextFoodRow(iogurteCompleto, rotulo, "u1", NOW)!;
  assertEquals(row.sodium_per_100g, 40);
  assertEquals(row.calcium_mg_per_100g, 110);
  assertEquals(row.calories_per_100g, 61);
});

Deno.test("applyPantry + parseQuestions: um alimento da despensa só se pergunta com uma regra em aberto sobre ele", () => {
  const ovoDespensa: PantryFood = { ...iogurteCompleto, name: "Ovo estrelado", name_key: "ovo estrelado" };
  const despensa = new Map([[ovoDespensa.name_key, ovoDespensa]]);
  const aberta: FoodRule = { topic: "ovos", topic_key: "ovos", value: "azeite", value_key: "azeite", confirmations: 1, status: "varia", source: "observacao" };
  const q = [{ topic: "gordura dos ovos", item_name: "Ovo estrelado", question: "Em quê?", options: ["Azeite", "Manteiga"], assumed: "Azeite", impact_kcal: 80 }];
  const semRegra = applyPantry([estimado("Ovo estrelado", 196)], despensa);
  assertEquals(parseQuestions(q, semRegra, [], () => "q"), []);
  const comRegra = applyPantry([estimado("Ovo estrelado", 196)], despensa, [aberta]);
  assertEquals((comRegra[0] as Record<string, unknown>).pantry_pending, true);
  assertEquals(parseQuestions(q, comRegra, [aberta], () => "q").length, 1);
  // pantry_pending não é coluna: não chega à BD.
  assertEquals("pantry_pending" in pickMealItem(comRegra[0]), false);
});

Deno.test("knowledgeSection: vazia sem nada; regras confirmadas, as que variam e a lista da despensa", () => {
  assertEquals(knowledgeSection([], []), "");
  const regras: FoodRule[] = [
    { topic: "fritos", topic_key: "fritos", value: "azeite", value_key: "azeite", confirmations: 3, status: "confirmado", source: "observacao" },
    { topic: "batata", topic_key: "batata", value: "cozida", value_key: "cozida", confirmations: 1, status: "varia", source: "observacao" },
  ];
  const s = knowledgeSection([iogurte], regras);
  assertStringIncludes(s, "fritos: azeite");
  // Fase C dos #58/#66: a observação desta refeição ganha ao hábito, dito às claras.
  assertStringIncludes(s, "A OBSERVAÇÃO DESTA REFEIÇÃO TEM PRIORIDADE");
  assertStringIncludes(s, "não assumas o que foi da última vez: batata");
  assertStringIncludes(s, "- Iogurte grego 0% (porção habitual 170 g)");
  assertStringIncludes(s, "usa EXATAMENTE este nome");
});

Deno.test("splitKnownWritten: o que está na despensa não vai ao Gemini; sem gramas, usa a porção habitual", () => {
  const { known, unknown } = splitKnownWritten(
    [{ name: "iogurte grego 0%", grams: null }, { name: "Banana", grams: 120 }, { name: "Iogurte Grego 0 %", grams: 200 }],
    byKey,
  );
  assertEquals(unknown.map((u) => u.index), [1]);
  assertEquals(known.get(0)?.quantity_grams, 170);
  assertEquals(known.get(0)?.name, "Iogurte grego 0%");
  assertEquals(known.get(0)?.calories_per_100g, 59);
  assertEquals(known.get(2)?.quantity_grams, 200);
});

Deno.test("splitKnownWritten: da despensa mas com micronutrientes por confirmar vai ao modelo, com o nome e a porção dela", () => {
  const incompleto = new Map([[iogurte.name_key, iogurte]]); // sem micronutrientes
  const { known, unknown } = splitKnownWritten([{ name: "iogurte grego 0 %", grams: null }], incompleto);
  assertEquals(known.size, 0);
  assertEquals(unknown[0].item, { name: "Iogurte grego 0%", grams: 170 });
  assertEquals(unknown[0].food, iogurte);
  assertEquals(unknown[0].pending, false);
  // Zeros antigos (linha sem a marca) também estão por confirmar.
  const antigo = new Map([[iogurte.name_key, { ...iogurte, ...MICROS_IOGURTE }]]);
  assertEquals(splitKnownWritten([{ name: "Iogurte grego 0%", grams: 170 }], antigo).known.size, 0);
  // Só positivos: completo mesmo sem a marca — um valor > 0 nunca foi inventado.
  const positivos = Object.fromEntries(Object.keys(MICROS_IOGURTE).map((k) => [k, 1]));
  const semMarca = new Map([[iogurte.name_key, { ...iogurte, ...positivos }]]);
  assertEquals(splitKnownWritten([{ name: "Iogurte grego 0%", grams: 170 }], semMarca).known.size, 1);
});

Deno.test("splitKnownWritten: refeição só de alimentos da despensa completos, com gramas → nada vai ao modelo", () => {
  const aveia: PantryFood = { ...iogurteCompleto, name: "Aveia em flocos", name_key: "aveia em flocos", portion_grams: 40, calories_per_100g: 372 };
  const despensa = new Map([[iogurteCompleto.name_key, iogurteCompleto], [aveia.name_key, aveia]]);
  const { known, unknown } = splitKnownWritten([{ name: "Iogurte grego 0%", grams: null }, { name: "aveia em flocos", grams: 50 }], despensa, []);
  assertEquals(unknown, []); // index.ts: unknown vazio → nenhuma chamada de estimativa
  assertEquals(known.get(1)?.quantity_grams, 50);
  assertEquals(known.get(1)?.calories_per_100g, 372);
  assertEquals(known.get(0)?.calcium_mg_per_100g, 110);
  assertEquals(known.get(0)?.fiber_per_100g, 0); // 0 dado vai como 0
});

Deno.test("splitKnownWritten: com uma pergunta da Carol em aberto sobre o alimento, chama o modelo", () => {
  const frango: PantryFood = { ...iogurteCompleto, name: "Peito de frango grelhado", name_key: "peito de frango grelhado", portion_grams: 150 };
  const despensa = new Map([[frango.name_key, frango]]);
  const regras: FoodRule[] = [
    { topic: "frango", topic_key: "frango", value: "sem pele", value_key: "sem pele", confirmations: 1, status: "varia", source: "observacao" },
  ];
  const { known, unknown } = splitKnownWritten([{ name: "Peito de frango grelhado", grams: null }], despensa, regras);
  assertEquals(known.size, 0);
  assertEquals(unknown[0].pending, true);
  // Uma regra confirmada não está em aberto: segue sem o modelo.
  const confirmada = [{ ...regras[0], status: "confirmado" as const }];
  assertEquals(splitKnownWritten([{ name: "Peito de frango grelhado", grams: null }], despensa, confirmada).known.size, 1);
});

Deno.test("pendingRulesFor: por confirmar ou varia, com uma palavra do tema no nome (plural e género contam)", () => {
  const r = (topic: string, status: FoodRule["status"]): FoodRule =>
    ({ topic, topic_key: foodKey(topic), value: "x", value_key: "x", confirmations: 1, status, source: "observacao" });
  assertEquals(pendingRulesFor("Batata frita", [r("fritos", "por_confirmar")]).length, 1);
  assertEquals(pendingRulesFor("Ovo estrelado", [r("ovos", "varia")]).length, 1);
  assertEquals(pendingRulesFor("Batatas cozidas", [r("batata", "varia")]).length, 1);
  assertEquals(pendingRulesFor("Iogurte grego 0%", [r("fritos", "varia"), r("batata", "por_confirmar")]), []);
  assertEquals(pendingRulesFor("Batata frita", [r("fritos", "confirmado")]), []);
  assertEquals(pendingRulesFor("", [r("fritos", "varia")]), []);
});

Deno.test("isPantryComplete / pantryMicro / microsTrusted: a regra dos zeros da despensa", () => {
  assert(isPantryComplete(iogurteCompleto));
  assertEquals(isPantryComplete(iogurte), false);
  assertEquals(isPantryComplete(null), false);
  // A marca só vale igual a updated_at: o código antigo mexe em updated_at e não nela.
  const mexidoPeloAntigo = { ...iogurteCompleto, updated_at: "2026-10-05T13:00:00.000Z" };
  assertEquals(microsTrusted(mexidoPeloAntigo), false);
  assertEquals(pantryMicro(mexidoPeloAntigo, "fiber_per_100g"), null);
  assertEquals(pantryMicro(mexidoPeloAntigo, "sodium_per_100g"), 36);
  assertEquals(missingMicros(mexidoPeloAntigo), ["fiber_per_100g", "iron_mg_per_100g", "vitamin_c_mg_per_100g"]);
  // O PostgREST devolve o instante com +00:00 — é o mesmo.
  assert(microsTrusted({ micros_checked_at: "2026-10-04T12:00:00+00:00", updated_at: NOW }));
  assertEquals(microsTrusted({ micros_checked_at: null, updated_at: NOW }), false);
});

Deno.test("splitKnownWritten: conhecido mas sem gramas nem porção habitual vai ao Gemini", () => {
  const semPorcao = new Map([["aveia", { ...iogurteCompleto, name: "Aveia", name_key: "aveia", portion_grams: null }]]);
  const { known, unknown } = splitKnownWritten([{ name: "Aveia", grams: null }], semPorcao);
  assertEquals(known.size, 0);
  assertEquals(unknown.length, 1);
});

Deno.test("applyPantry: o que ela reconhece fica com os valores da despensa; um rótulo lido agora não", () => {
  const [a, b, c] = applyPantry([
    estimado("Iogurte grego 0%", 80),
    estimado("Arroz", 130),
    estimado("Iogurte grego 0%", 61, { from_label: true }),
  ], byKey);
  assertEquals(a.calories_per_100g, 59);
  assertEquals(a.quantity_grams, 150); // as gramas ficam as da foto
  assertEquals(b.calories_per_100g, 130);
  assertEquals(c.calories_per_100g, 61);
});

Deno.test("nextFoodRow: à 1.ª vez fica de fora; à 2.ª entra na despensa", () => {
  const primeira = nextFoodRow(null, estimado("Arroz branco", 130), "u1", NOW)!;
  assertEquals([primeira.times_seen, primeira.in_pantry, primeira.source], [1, false, "refeicao"]);
  const segunda = nextFoodRow({ ...(primeira as unknown as PantryFood) }, estimado("Arroz branco", 128), "u1", NOW)!;
  assertEquals([segunda.times_seen, segunda.in_pantry], [2, true]);
  // Ainda fora da despensa, a 2.ª estimativa é a que fica.
  assertEquals(segunda.calories_per_100g, 128);
});

Deno.test("nextFoodRow: um rótulo entra logo; na despensa os valores ficam; ajustado à mão, nem o rótulo mexe", () => {
  const rotulo = nextFoodRow(null, estimado("Barra proteica", 350, { from_label: true }), "u1", NOW)!;
  assertEquals([rotulo.in_pantry, rotulo.source, rotulo.times_seen], [true, "rotulo", 1]);

  const naDespensa = nextFoodRow(iogurte, estimado("Iogurte grego 0%", 90), "u1", NOW)!;
  assertEquals(naDespensa.calories_per_100g, 59);
  assertEquals(naDespensa.times_seen, 7);

  const rotuloNovo = nextFoodRow(iogurte, estimado("Iogurte grego 0%", 61, { from_label: true }), "u1", NOW)!;
  assertEquals([rotuloNovo.calories_per_100g, rotuloNovo.source], [61, "rotulo"]);

  const ajustado = nextFoodRow({ ...iogurte, edited_by_athlete: true }, estimado("Iogurte grego 0%", 61, { from_label: true }), "u1", NOW)!;
  assertEquals([ajustado.calories_per_100g, ajustado.source], [59, "refeicao"]);
});

const regra = (over: Partial<FoodRule> = {}): FoodRule => ({
  topic: "fritos", topic_key: "fritos", value: "azeite", value_key: "azeite", confirmations: 1, status: "por_confirmar", source: "observacao", ...over,
});

Deno.test("nextRuleRow: confirma-se à 2.ª vez igual; mudar antes disso só troca o valor", () => {
  assertEquals(nextRuleRow(null, { topic: "fritos", value: "azeite" }, "u1", NOW)?.status, "por_confirmar");
  const conf = nextRuleRow(regra(), { topic: "Fritos", value: "Azeite" }, "u1", NOW)!;
  assertEquals([conf.status, conf.confirmations], ["confirmado", 2]);
  const troca = nextRuleRow(regra(), { topic: "fritos", value: "manteiga" }, "u1", NOW)!;
  assertEquals([troca.status, troca.value, troca.confirmations], ["por_confirmar", "manteiga", 1]);
});

Deno.test("nextRuleRow: confirmada que muda passa a varia; volta a confirmar-se à 3.ª igual; à mão não se toca", () => {
  const varia = nextRuleRow(regra({ status: "confirmado", confirmations: 3 }), { topic: "fritos", value: "manteiga" }, "u1", NOW)!;
  assertEquals([varia.status, varia.value], ["varia", "manteiga"]);
  const ainda = nextRuleRow(regra({ status: "varia", value: "manteiga", value_key: "manteiga" }), { topic: "fritos", value: "manteiga" }, "u1", NOW)!;
  assertEquals(ainda.status, "varia");
  const deNovo = nextRuleRow(regra({ status: "varia", value: "manteiga", value_key: "manteiga", confirmations: 2 }), { topic: "fritos", value: "manteiga" }, "u1", NOW)!;
  assertEquals(deNovo.status, "confirmado");
  assertEquals(nextRuleRow(regra({ source: "manual" }), { topic: "fritos", value: "manteiga" }, "u1", NOW), null);
});

Deno.test("parseCookingFacts: só pares completos e curtos, no máximo 5", () => {
  assertEquals(parseCookingFacts([{ topic: "fritos", value: "azeite" }, { topic: "", value: "x" }, { topic: "salada" }]), [{ topic: "fritos", value: "azeite" }]);
  assertEquals(parseCookingFacts("não é lista"), []);
  assertEquals(parseCookingFacts(Array.from({ length: 8 }, (_, i) => ({ topic: `t${i}`, value: "v" }))).length, 5);
});

// deno-lint-ignore no-explicit-any
function makeSb(foods: any[] = [], rules: any[] = [], failUpsert = false) {
  // deno-lint-ignore no-explicit-any
  const upserts: Record<string, any[]> = { athlete_foods: [], athlete_food_rules: [] };
  const sb = {
    from: (table: string) => {
      const data = table === "athlete_foods" ? foods : rules;
      const chain = {
        select: () => chain,
        eq: () => chain,
        in: () => Promise.resolve({ data, error: null }),
        // deno-lint-ignore no-explicit-any
        upsert: (rows: any[], opts: any) => {
          upserts[table].push({ rows, opts });
          return Promise.resolve({ error: failUpsert ? { message: "falhou" } : null });
        },
      };
      return chain;
    },
  };
  return { sb, upserts };
}

Deno.test("learnFromMeal: conta cada alimento uma vez por refeição e diz o que entrou por rótulo", async () => {
  const { sb, upserts } = makeSb([iogurte]);
  const { fromLabel } = await learnFromMeal(sb, "u1", [
    estimado("Iogurte grego 0%", 59), estimado("iogurte grego 0 %", 59), estimado("Barra proteica", 350, { from_label: true }),
  ], [{ topic: "fritos", value: "azeite" }], NOW);
  const rows = upserts.athlete_foods[0].rows;
  assertEquals(rows.length, 2);
  assertEquals(upserts.athlete_foods[0].opts, { onConflict: "user_id,name_key" });
  assertEquals(rows.find((r: { name_key: string }) => r.name_key === "iogurte grego 0%").times_seen, 7);
  assertEquals(fromLabel, ["Barra proteica"]);
  assertEquals(upserts.athlete_food_rules[0].rows[0].status, "por_confirmar");
});

Deno.test("learnFromMeal: uma falha não rebenta o registo", async () => {
  const { sb } = makeSb([], [], true);
  const r = await learnFromMeal(sb, "u1", [estimado("Arroz", 130)], [], NOW);
  assert(Array.isArray(r.fromLabel));
});

// ─── Fase B: as perguntas da Carol ─────────────────────────────────────────

const ovo = estimado("Ovo estrelado", 196);
const salada = estimado("Salada mista", 20);
const pergunta = (over: Record<string, unknown> = {}) => ({
  topic: "fritos", item_name: "Ovo estrelado", question: "Os ovos foram estrelados em quê?",
  options: ["Azeite", "Manteiga", "Óleo", "Sem gordura"], assumed: "Azeite", impact_kcal: 90, ...over,
});
let n = 0;
const ids = () => `q${++n}`;

Deno.test("parseQuestions: a pergunta fica presa ao alimento da refeição, com a opção assumida entre as opções", () => {
  n = 0;
  const [q] = parseQuestions([pergunta()], [ovo, salada], [], ids);
  assertEquals(q, {
    id: "q1", kind: "preparacao", topic: "fritos", item_name: "Ovo estrelado", question: "Os ovos foram estrelados em quê?",
    options: ["Azeite", "Manteiga", "Óleo", "Sem gordura"], assumed: "Azeite", impact_kcal: 90, impact_protein_g: 0, answer: null, answered_at: null,
  });
});

Deno.test("parseQuestions: as regras da casa — ≥ 40 kcal ou ≥ 4 g de proteína, sem temas confirmados nem alimentos da despensa", () => {
  const confirmada = regra({ topic: "salada", topic_key: "salada", status: "confirmado" });
  const qs = parseQuestions([
    pergunta({ impact_kcal: 30 }),                                    // pouco impacto
    pergunta({ topic: "salada", item_name: "Salada mista" }),         // tema já confirmado
    pergunta({ item_name: "Bife" }),                                  // não está na refeição
    pergunta({ assumed: "Banha" }),                                   // assumida fora das opções
    pergunta({ options: ["Azeite"] }),                                // uma opção só
    pergunta(),                                                       // esta passa
    pergunta(),                                                       // tema repetido
    pergunta({ topic: "molho", item_name: "Salada mista", assumed: "Sem molho", options: ["Com molho", "Sem molho"] }),
  ], [ovo, salada], [confirmada], ids);
  // "molho" é genérico: vai com o alimento (bug #74).
  assertEquals(qs.map((q) => q.topic), ["fritos", "molho (Salada mista)"]);
  // Um alimento que já veio da despensa não se pergunta.
  assertEquals(parseQuestions([pergunta()], [{ ...ovo, from_pantry: true }], [], ids), []);
  assertEquals(parseQuestions("nada", [ovo], [], ids), []);
});

Deno.test("nextRuleRow: uma resposta conta como uma observação, marcada como resposta", () => {
  const primeira = nextRuleRow(null, { topic: "fritos", value: "manteiga" }, "u1", NOW, "resposta")!;
  assertEquals([primeira.status, primeira.source], ["por_confirmar", "resposta"]);
  const segunda = nextRuleRow(regra({ value: "manteiga", value_key: "manteiga", source: "resposta" }), { topic: "fritos", value: "Manteiga" }, "u1", NOW, "resposta")!;
  assertEquals([segunda.status, segunda.confirmations], ["confirmado", 2]);
});

Deno.test("learnRules: devolve como cada regra ficou; uma falha devolve vazio", async () => {
  const { sb, upserts } = makeSb([], [regra({ value: "azeite", value_key: "azeite" })]);
  const ficou = await learnRules(sb, "u1", [{ topic: "fritos", value: "azeite" }, { topic: "Fritos", value: "manteiga" }, { topic: "salada", value: "azeite e vinagre" }], "resposta", NOW);
  assertEquals(ficou, [
    { topic: "fritos", value: "azeite", status: "confirmado" },
    { topic: "salada", value: "azeite e vinagre", status: "por_confirmar" },
  ]);
  assertEquals(upserts.athlete_food_rules[0].opts, { onConflict: "user_id,topic_key" });
  const { sb: falha } = makeSb([], [], true);
  assertEquals(await learnRules(falha, "u1", [{ topic: "fritos", value: "azeite" }], "resposta", NOW), []);
});

// Revisão pré-master (2026-10-04): as perguntas seguem o nome final.
Deno.test("remapQuestionItems: uma pergunta presa ao nome do Gemini passa para o nome que o atleta escreveu", () => {
  const raw = [pergunta({ item_name: "Ovos estrelados" }), pergunta({ topic: "molho", item_name: "Bife" })];
  const remapped = remapQuestionItems(raw, [["Ovos estrelados", "2 ovos estrelados"]]) as Array<{ item_name: string }>;
  assertEquals(remapped.map((q) => q.item_name), ["2 ovos estrelados", "Bife"]);
  // E assim parseQuestions já a encontra.
  assertEquals(parseQuestions(remapped, [estimado("2 ovos estrelados", 196)], [], ids).length, 1);
  assertEquals(remapQuestionItems("nada", []), "nada");
  // Uma pergunta que já aponta para um alimento da refeição não muda.
  const ovos = [pergunta({ item_name: "2 ovos estrelados" })];
  assertEquals(remapQuestionItems(ovos, [["2 Ovos estrelados", "2 ovos estrelados"]], ["2 ovos estrelados"]), ovos);
  // Ambígua — "Arroz" da foto e também o nome que o Gemini deu ao "arroz
  // basmati" escrito: cai, em vez de ajustar um deles às cegas.
  const arroz = [pergunta({ topic: "arroz", item_name: "Arroz" }), pergunta({ topic: "molho", item_name: "Bife" })];
  const ficam = remapQuestionItems(arroz, [["Arroz", "arroz basmati"]], ["Arroz", "arroz basmati", "Bife"]) as Array<{ item_name: string }>;
  assertEquals(ficam.map((q) => q.item_name), ["Bife"]);
});

// Revisão pré-master: o pedido leva só os 80 mais usados, mas um escrito
// fora deles que está na despensa também é conhecido.
Deno.test("withWrittenFoods: vai buscar à despensa os escritos que não vieram nos 80", async () => {
  const aveia: PantryFood = { ...iogurteCompleto, name: "Aveia em flocos", name_key: "aveia em flocos", times_seen: 1, calories_per_100g: 372 };
  // 80 no pedido: pode haver mais na despensa.
  const outros = Array.from({ length: 79 }, (_, i) => ({ ...iogurte, name: `Outro ${i}`, name_key: `outro ${i}` }));
  const foods = [iogurte, ...outros];
  const pantry = { foods, rules: [], byKey: new Map(foods.map((f) => [f.name_key, f])) };
  const { sb } = makeSb([aveia]);
  const mais = await withWrittenFoods(sb, "u1", pantry, ["Aveia em Flocos", "Iogurte grego 0%"]);
  assert(mais.byKey.has("aveia em flocos"));
  assertEquals(mais.byKey.size, 81);
  assertEquals(mais.foods, foods); // o que vai no pedido não muda
  assertEquals(splitKnownWritten([{ name: "Aveia em Flocos", grams: 40 }], mais.byKey).known.size, 1);
  // Todos já no mapa: nem pergunta à base de dados.
  const semPedido = { from: () => { throw new Error("não devia perguntar"); } };
  assertEquals(await withWrittenFoods(semPedido, "u1", pantry, ["Iogurte grego 0%"]), pantry);
  // Uma falha devolve a despensa como estava.
  assertEquals(await withWrittenFoods(semPedido, "u1", pantry, ["Banana"]), pantry);
  // Menos de 80: o mapa já tem a despensa toda — nem pergunta.
  const pequena = { foods: [iogurte], rules: [], byKey: new Map(byKey) };
  assertEquals(await withWrittenFoods(semPedido, "u1", pequena, ["Banana"]), pequena);
});

Deno.test("parseQuestions: pouca energia mas muita proteína pergunta-se (o fiambre do bug #58)", () => {
  const fiambre = estimado("Fiambre de peru", 40);
  const q = (over: Record<string, unknown>) => pergunta({
    topic: "fiambre", item_name: "Fiambre de peru", question: "As fatias eram de que espessura?",
    options: ["Finíssimas", "Finas", "Médias"], assumed: "Médias", ...over,
  });
  assertEquals(parseQuestions([q({ impact_kcal: 17, impact_protein_g: 3.5 })], [fiambre], [], ids), []);
  const [passa] = parseQuestions([q({ impact_kcal: 17, impact_protein_g: 4.24 })], [fiambre], [], ids);
  assertEquals([passa.impact_kcal, passa.impact_protein_g], [17, 4.2]);
  // Sem impact_kcal mas com proteína que chegue também passa.
  assertEquals(parseQuestions([q({ impact_kcal: undefined, impact_protein_g: 6 })], [fiambre], [], ids).length, 1);
});

Deno.test("parseQuestions: até 5 perguntas (bug #66), as de mais impacto primeiro", () => {
  const itens = ["a", "b", "c", "d", "e", "f"].map((k) => estimado(`Alimento ${k}`, 100));
  const qs = parseQuestions([
    pergunta({ topic: "t1", item_name: "Alimento a", impact_kcal: 45 }),
    pergunta({ topic: "t2", item_name: "Alimento b", impact_kcal: 200 }),
    pergunta({ topic: "t3", item_name: "Alimento c", impact_kcal: 10, impact_protein_g: 12 }), // 3× o limiar da proteína
    pergunta({ topic: "t4", item_name: "Alimento d", impact_kcal: 60 }),
    pergunta({ topic: "t5", item_name: "Alimento e", impact_kcal: 41 }),
    pergunta({ topic: "t6", item_name: "Alimento f", impact_kcal: 80 }),
  ], itens, [], ids);
  assertEquals(qs.map((q) => q.topic), ["t2", "t3", "t6", "t4", "t1"]);
});

// ─── Fase B dos #58/#66 (2026-10-17): perguntas de quantidade ───────────────

Deno.test("optionGrams: as gramas de uma opção ou resposta de quantidade", () => {
  assertEquals(optionGrams("3 fatias finas (~35 g)"), 35);
  assertEquals(optionGrams("Camada fina, um lado (≈5g)"), 5);
  assertEquals(optionGrams("20 g"), 20);
  assertEquals(optionGrams("1 ovo (~50 g)"), 50);
  assertEquals(optionGrams("12,5 gramas"), 12.5);
  assertEquals(optionGrams("Sem manteiga (0 g)"), 0);
  assertEquals(optionGrams("duas fatias grossas"), null);
  assertEquals(optionGrams("3 fatias gordas"), null);
  // "2 fatias de 20 g" são 40 g (revisão pré-master de 2026-10-17).
  assertEquals(optionGrams("2 fatias de 20 g"), 40);
  assertEquals(optionGrams("3 fatias finas de 12,5 g"), 37.5);
  assertEquals(optionGrams(null), null);
});

Deno.test("parseQuestions: quantidade — tema \"<alimento> · quantidade\", opções todas com gramas, nunca sobre gramas escritas (bug #58)", () => {
  const manteiga = estimado("Manteiga", 10);
  const quant = (over: Record<string, unknown> = {}) => ({
    kind: "quantidade", topic: "manteiga", item_name: "Manteiga", question: "Quanta manteiga levou o pão?",
    options: ["Camada fina, um lado (~5 g)", "Camada fina, dos dois lados (~10 g)", "Camada grossa (~15 g)"],
    assumed: "Camada fina, dos dois lados (~10 g)", impact_kcal: 72, impact_protein_g: 0, ...over,
  });
  const [q] = parseQuestions([quant()], [manteiga], [], ids);
  assertEquals(q.kind, "quantidade");
  assertEquals(q.topic, "manteiga · quantidade");
  assertEquals(q.options.length, 3);
  // Uma opção sem gramas não dá para aplicar sem o modelo: a pergunta cai.
  assertEquals(parseQuestions([quant({ options: ["Pouca", "Muita (~15 g)"], assumed: "Pouca" })], [manteiga], [], ids), []);
  // As gramas que o atleta escreveu não se perguntam.
  assertEquals(parseQuestions([quant()], [{ ...manteiga, grams_explicit: true }], [], ids), []);
  // Um tema de quantidade já confirmado nas regras não volta a perguntar-se.
  const confirmada = regra({ topic: "manteiga · quantidade", topic_key: "manteiga quantidade", status: "confirmado" });
  assertEquals(parseQuestions([quant()], [manteiga], [confirmada], ids), []);
  // O modelo já pode mandar o tema com "quantidade": não se duplica.
  // Venha como vier, o tema fica "<alimento> · quantidade" — a mesma regra.
  assertEquals(parseQuestions([quant({ topic: "manteiga quantidade" })], [manteiga], [], ids)[0].topic, "manteiga · quantidade");
  assertEquals(parseQuestions([quant({ topic: "quantidade de manteiga" })], [manteiga], [], ids)[0].topic, "manteiga · quantidade");
  assertEquals(parseQuestions([quant({ topic: "quantidade de manteiga" })], [manteiga], [confirmada], ids), []);
  // Sem kind (as gravadas antes, ou o modelo a omiti-lo) é de preparação.
  assertEquals(parseQuestions([pergunta()], [ovo], [], ids)[0].kind, "preparacao");
});

Deno.test("quantityAnswerGrams: soma a diferença à porção, não a troca (o prato composto da revisão pré-master)", () => {
  // "Tosta mista" num só item (120 g), assumidos ~50 g de fiambre, resposta ~35 g: 105 g, não 35 g.
  assertEquals(quantityAnswerGrams(120, "3 fatias finas (~35 g)", "3 fatias médias (~50 g)"), 105);
  // O item é o próprio fiambre (50 g): fica nos 35 g da resposta.
  assertEquals(quantityAnswerGrams(50, "3 fatias finas (~35 g)", "3 fatias médias (~50 g)"), 35);
  // Sem gramas na assumida, ficam as da resposta; nunca abaixo de 0; sem gramas na resposta, null.
  assertEquals(quantityAnswerGrams(80, "20 g", "Normal"), 20);
  assertEquals(quantityAnswerGrams(10, "Sem manteiga (0 g)", "Camada grossa (~15 g)"), 0);
  assertEquals(quantityAnswerGrams(80, "duas fatias grossas", "3 fatias (~35 g)"), null);
});

Deno.test("quantityTopic e parseCookingFacts: uma quantidade das observações tem o tema da pergunta", () => {
  assertEquals(quantityTopic("quantidade de manteiga"), "manteiga · quantidade");
  assertEquals(quantityTopic("Fiambre - quantidade"), "Fiambre · quantidade");
  assertEquals(quantityTopic("quantidade"), "");
  assertEquals(parseCookingFacts([{ topic: "quantidade de manteiga", value: "pouca" }, { topic: "fritos", value: "azeite" }]),
    [{ topic: "manteiga · quantidade", value: "pouca" }, { topic: "fritos", value: "azeite" }]);
});

Deno.test("bug #74: um tema genérico ganha o alimento — \"tempero\" da salada não é o do esparguete", () => {
  assertEquals(contextualTopic("tempero", "Salada mista"), "tempero (Salada mista)");
  assertEquals(contextualTopic("azeite", "Esparguete à bolonhesa"), "azeite (Esparguete à bolonhesa)");
  // Já com o prato, ou o próprio alimento: fica.
  assertEquals(contextualTopic("tempero da salada", "Salada mista"), "tempero da salada");
  assertEquals(contextualTopic("azeite", "Azeite"), "azeite");
  assertEquals(contextualTopic("fritos", "Ovo estrelado"), "fritos");

  const salada = estimado("Salada mista", 60);
  const esparguete = estimado("Esparguete", 350);
  const q = (item: string) => pergunta({ topic: "tempero", item_name: item, question: "Como temperaste?", options: ["Azeite", "Sem tempero"], assumed: "Azeite" });
  const qs = parseQuestions([q("Salada mista"), q("Esparguete")], [salada, esparguete], [], ids);
  // Antes eram o mesmo tema e a segunda caía; agora são dois hábitos, um por prato.
  assertEquals(qs.map((x) => x.topic), ["tempero (Salada mista)", "tempero (Esparguete)"]);
  // Um "tempero" genérico confirmado não cala a pergunta da salada.
  const generico = regra({ topic: "tempero", topic_key: "tempero", status: "confirmado" });
  assertEquals(parseQuestions([q("Salada mista")], [salada], [generico], ids).length, 1);
});

Deno.test("bug #74 (revisão): o prato é cortado sem partir o parêntese; \"quantidade de X\" também ganha o prato", () => {
  // Quantidade: 27 caracteres antes do " · quantidade" — corta-se o prato, com reticências.
  const t = quantityTopic(contextualTopic("azeite", "Esparguete à bolonhesa", 27));
  assertEquals(t, "azeite (Esparguete à bolo…) · quantidade");
  assert(t.length <= 40);
  // Cabe inteiro: sem reticências.
  assertEquals(contextualTopic("molho", "Salada", 27), "molho (Salada)");
  // "quantidade de manteiga" dava "de manteiga" e escapava sem prato.
  assertEquals(quantityTopic(contextualTopic("quantidade de manteiga", "Pão", 27)), "manteiga (Pão) · quantidade");
  assertEquals(quantityTopic(contextualTopic("manteiga quantidade", "Pão", 27)), "manteiga (Pão) · quantidade");
  // Não genérico: fica como vinha.
  assertEquals(quantityTopic(contextualTopic("quantidade de queijo", "Tosta", 27)), "queijo · quantidade");
});

Deno.test("bug #74 (revisão): hábitos aprendidos sem prato já não vão para o pedido; categorias e manuais ficam", () => {
  const r = (topic: string, source: FoodRule["source"] = "resposta"): FoodRule =>
    ({ topic, topic_key: foodKey(topic), value: "x", value_key: "x", confirmations: 2, status: "confirmado", source });
  const s = knowledgeSection([], [
    r("tempero"), r("manteiga · quantidade"), r("tempero (Salada mista)"), r("fritos"), r("azeite", "manual"),
  ]);
  assert(!s.includes("tempero: x"));
  // Quantidade sem prato é da própria manteiga (item à parte): fica — tirá-la calava a resposta dele.
  assertStringIncludes(s, "manteiga · quantidade: x");
  assertStringIncludes(s, "tempero (Salada mista): x");
  assertStringIncludes(s, "fritos: x");
  // Escrito por ele sem prato: vale para tudo, e o pedido di-lo.
  assertStringIncludes(s, "azeite (em qualquer prato): x");
  // A categoria vale para os pratos dela — "fritos: azeite" serve ao ovo estrelado.
  assertStringIncludes(s, "vale para os pratos dessa categoria");
});

Deno.test("bug #74 (revisão): o plural e a forma antiga \"quantidade de X\" também são quantidade", () => {
  const r = (topic: string): FoodRule =>
    ({ topic, topic_key: foodKey(topic), value: "x", value_key: "x", confirmations: 2, status: "confirmado", source: "resposta" });
  const s = knowledgeSection([], [r("manteiga · quantidades"), r("quantidade de manteiga")]);
  assertStringIncludes(s, "manteiga · quantidades: x");
  assertStringIncludes(s, "quantidade de manteiga: x");
});

Deno.test("bug #74: o conhecimento diz que um hábito só vale para o prato que nomeia", () => {
  const regras: FoodRule[] = [{ topic: "azeite na salada · quantidade", topic_key: "azeite na salada quantidade", value: "um fio", value_key: "um fio", confirmations: 2, status: "confirmado", source: "resposta" }];
  const s = knowledgeSection([], regras);
  assertStringIncludes(s, "Cada hábito vale SÓ para o prato ou alimento que nomeia");
});

Deno.test("bug #75: o peso escrito de um alimento da despensa, se não for a porção, vira hábito de quantidade", () => {
  const arroz = { ...iogurte, name: "Arroz branco cozido", name_key: "arroz branco cozido", portion_grams: 90 } as PantryFood;
  const map = new Map([[arroz.name_key, arroz]]);
  assertEquals(portionFacts([{ name: "arroz branco cozido", grams: 150 }], map), [{ topic: "Arroz branco cozido · quantidade", value: "150 g" }]);
  // A porção de sempre, sem gramas, ou fora da despensa: nada a aprender.
  assertEquals(portionFacts([{ name: "Arroz branco cozido", grams: 90 }], map), []);
  assertEquals(portionFacts([{ name: "Arroz branco cozido", grams: null }], map), []);
  assertEquals(portionFacts([{ name: "Batata", grams: 200 }], map), []);
  // O mesmo alimento duas vezes na refeição conta uma vez.
  assertEquals(portionFacts([{ name: "Arroz branco cozido", grams: 150 }, { name: "Arroz branco cozido", grams: 80 }], map).length, 1);
});

Deno.test("bug #75: um hábito de quantidade com gramas não é pergunta em aberto (o alimento não perde o caminho rápido)", () => {
  const comGramas = regra({ topic: "Arroz branco cozido · quantidade", topic_key: "arroz branco cozido quantidade", value: "150 g", status: "por_confirmar" });
  const semGramas = regra({ topic: "arroz", topic_key: "arroz", value: "basmati", status: "por_confirmar" });
  assertEquals(pendingRulesFor("Arroz branco cozido", [comGramas]), []);
  assertEquals(pendingRulesFor("Arroz branco cozido", [semGramas]).length, 1);
});

Deno.test("bug #75 (revisão): gramas absurdas não ensinam; com hábito, voltar à porção também conta", () => {
  const arroz = { ...iogurte, name: "Arroz branco cozido", name_key: "arroz branco cozido", portion_grams: 90 } as PantryFood;
  const map = new Map([[arroz.name_key, arroz]]);
  assertEquals(portionFacts([{ name: "Arroz branco cozido", grams: 99999 }], map), []);
  const habito = [{ topic: "Arroz branco cozido · quantidade" }];
  assertEquals(portionFacts([{ name: "Arroz branco cozido", grams: 90 }], map, habito), [{ topic: "Arroz branco cozido · quantidade", value: "90 g" }]);
});

Deno.test("parseQuestions: perguntas impossíveis de responder caem — percentagens, teores, kcal, gramas de gordura (bug #86)", () => {
  const impossiveis = [
    pergunta({ question: "Que % de gordura tem a carne?", options: ["5%", "10%", "20%"], assumed: "10%" }),
    pergunta({ question: "Qual a percentagem de gordura da carne?" }),
    pergunta({ question: "Qual o teor de gordura do queijo?" }),
    pergunta({ question: "Quantas kcal tinha o molho?" }),
    pergunta({ question: "O molho era de quê?", options: ["Leve (50 calorias)", "Cremoso"], assumed: "Cremoso" }),
    pergunta({ question: "A carne tinha quantas gramas de gordura?" }),
    pergunta({ question: "Que carne era?", options: ["Magra (5 g de gordura)", "Gorda (20 g de gordura)"], assumed: "Magra (5 g de gordura)" }),
    pergunta({ question: "Sabes o valor nutricional do molho?" }),
  ];
  assertEquals(parseQuestions(impossiveis, [ovo, salada], [], ids), []);
});

Deno.test("parseQuestions: as respondíveis passam, incluindo o (~N g) das de quantidade (bug #86)", () => {
  const qs = parseQuestions([
    pergunta(),
    pergunta({
      kind: "quantidade", topic: "azeite na salada", item_name: "Salada mista", question: "Quanto azeite levou a salada?",
      options: ["Um fio (~5 g)", "1 colher de sopa (~10 g)", "Bem regada (~20 g)"], assumed: "1 colher de sopa (~10 g)",
    }),
  ], [ovo, salada], [], ids);
  assertEquals(qs.length, 2);
});
