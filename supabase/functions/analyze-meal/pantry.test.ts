import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { foodKey } from "../_shared/formulas/foodKey.ts";
import {
  applyPantry, type FoodRule, knowledgeSection, learnFromMeal, learnRules, nextFoodRow, nextRuleRow, type PantryFood,
  parseCookingFacts, parseQuestions, pickMealItem, remapQuestionItems, splitKnownWritten, withWrittenFoods,
} from "./pantry.ts";

// Bugs #48/#52, fase A: a despensa e como ele cozinha.

const NOW = "2026-10-04T12:00:00.000Z";
const iogurte: PantryFood = {
  name: "Iogurte grego 0%", name_key: "iogurte grego 0%", portion_grams: 170, portion_label: null,
  times_seen: 6, in_pantry: true, source: "refeicao", edited_by_athlete: false,
  calories_per_100g: 59, protein_per_100g: 10, carbs_per_100g: 3.6, fat_per_100g: 0.4,
};
const byKey = new Map([[iogurte.name_key, iogurte]]);
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
  assertEquals(row.potassium_mg_per_100g, 0);
});

Deno.test("knowledgeSection: vazia sem nada; regras confirmadas, as que variam e a lista da despensa", () => {
  assertEquals(knowledgeSection([], []), "");
  const regras: FoodRule[] = [
    { topic: "fritos", topic_key: "fritos", value: "azeite", value_key: "azeite", confirmations: 3, status: "confirmado", source: "observacao" },
    { topic: "batata", topic_key: "batata", value: "cozida", value_key: "cozida", confirmations: 1, status: "varia", source: "observacao" },
  ];
  const s = knowledgeSection([iogurte], regras);
  assertStringIncludes(s, "fritos: azeite");
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

Deno.test("splitKnownWritten: conhecido mas sem gramas nem porção habitual vai ao Gemini", () => {
  const semPorcao = new Map([["aveia", { ...iogurte, name: "Aveia", name_key: "aveia", portion_grams: null }]]);
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
    id: "q1", topic: "fritos", item_name: "Ovo estrelado", question: "Os ovos foram estrelados em quê?",
    options: ["Azeite", "Manteiga", "Óleo", "Sem gordura"], assumed: "Azeite", impact_kcal: 90, answer: null, answered_at: null,
  });
});

Deno.test("parseQuestions: as regras da casa — ≥ 50 kcal, no máximo 2, sem temas confirmados nem alimentos da despensa", () => {
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
    pergunta({ topic: "café", item_name: "Salada mista" }),           // passava do limite de 2
  ], [ovo, salada], [confirmada], ids);
  assertEquals(qs.map((q) => q.topic), ["fritos", "molho"]);
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
  // Uma pergunta que já aponta para um alimento da refeição não muda: o
  // "Arroz" da foto não passa a ser o "arroz basmati" escrito.
  const arroz = [pergunta({ topic: "arroz", item_name: "Arroz" })];
  const fica = remapQuestionItems(arroz, [["Arroz", "arroz basmati"]], ["Arroz", "arroz basmati"]) as Array<{ item_name: string }>;
  assertEquals(fica[0].item_name, "Arroz");
});

// Revisão pré-master: o pedido leva só os 80 mais usados, mas um escrito
// fora deles que está na despensa também é conhecido.
Deno.test("withWrittenFoods: vai buscar à despensa os escritos que não vieram nos 80", async () => {
  const aveia: PantryFood = { ...iogurte, name: "Aveia em flocos", name_key: "aveia em flocos", times_seen: 1, calories_per_100g: 372 };
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
