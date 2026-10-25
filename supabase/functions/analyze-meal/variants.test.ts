import { assert, assertEquals } from "jsr:@std/assert@1";
import { FakeFoodsDb } from "./foodsTestkit.ts";
import { learnFromMeal, MAX_QUESTIONS, type CarolQuestion } from "./pantry.ts";
import {
  buildVariantIndex,
  fetchVariants,
  linkVariants,
  mergeVariantQuestions,
  normalizeVariantLabel,
  renameQuestionItems,
  resolveVariants,
  type VariantFood,
  variantAnswer,
  variantKnowledge,
  variantQuestionText,
} from "./variants.ts";

const NOW = "2026-10-25T12:00:00.000Z";
const U = "u1";

// A despensa do bug #87: o genérico e duas variantes, «com pele» a mais usada.
const food = (over: Partial<VariantFood>): VariantFood => ({
  id: "x", parent_id: null, variant_label: null, name: "x", name_key: "x", portion_grams: null, portion_label: null,
  times_seen: 1, in_pantry: true, source: "refeicao", edited_by_athlete: false,
  calories_per_100g: 0, protein_per_100g: 0, carbs_per_100g: 0, fat_per_100g: 0, ...over,
});
const COXA = food({ id: "g1", name: "Coxa de frango", name_key: "coxa de frango", calories_per_100g: 215, protein_per_100g: 18, fat_per_100g: 15, times_seen: 5 });
const COM_PELE = food({
  id: "v1", parent_id: "g1", variant_label: "com pele", name: "Coxa de frango com pele", name_key: "coxa de frango com pele",
  calories_per_100g: 215, protein_per_100g: 18, fat_per_100g: 15, times_seen: 4,
});
const SEM_PELE = food({
  id: "v2", parent_id: "g1", variant_label: "sem pele", name: "Coxa de frango sem pele", name_key: "coxa de frango sem pele",
  calories_per_100g: 135, protein_per_100g: 20, fat_per_100g: 6, times_seen: 1,
});
const IDX = buildVariantIndex([COXA, COM_PELE, SEM_PELE]);

let n = 0;
const ids = () => `q${++n}`;
// deno-lint-ignore no-explicit-any
const item = (over: Record<string, unknown>): Record<string, any> => ({
  name: "Coxa de frango", quantity_grams: 150, calories_per_100g: 200, protein_per_100g: 19, carbs_per_100g: 0, fat_per_100g: 13, ...over,
});

Deno.test("variantes: o genérico escrito, sem o modelo → a mais usada, com os valores da base de dados e a pergunta", () => {
  n = 0;
  const { items, questions, renames } = resolveVariants([item({})], IDX, ids);
  assertEquals(items[0].name, "Coxa de frango com pele");
  assertEquals([items[0].calories_per_100g, items[0].protein_per_100g], [215, 18]);
  assertEquals([items[0].variant_of, items[0].variant_label], ["Coxa de frango", "com pele"]);
  assertEquals(renames, [["Coxa de frango", "Coxa de frango com pele"]]);
  assertEquals(questions, [{
    id: "q1", kind: "variante", topic: "Coxa de frango", item_name: "Coxa de frango com pele",
    question: "Coxa de frango: com pele ou sem pele?", options: ["com pele", "sem pele"], assumed: "com pele",
    impact_kcal: 120, impact_protein_g: 3, answer: null, answered_at: null,
  }]);
});

Deno.test("variantes: o modelo viu «sem pele» → essa é a assumida e os valores são os dela", () => {
  const { items, questions } = resolveVariants([item({ name: "Coxa de frango sem pele", generic_name: "Coxa de frango", variant: "sem pele" })], IDX, ids);
  assertEquals([items[0].name, items[0].calories_per_100g], ["Coxa de frango sem pele", 135]);
  assertEquals([questions[0].assumed, questions[0].options], ["sem pele", ["com pele", "sem pele"]]);
});

Deno.test("variantes: o nome de uma variante guardada, sem campos do modelo, também pergunta", () => {
  const { items, questions } = resolveVariants([item({ name: "coxa de frango sem pele" })], IDX, ids);
  assertEquals([items[0].name, questions[0].assumed], ["Coxa de frango sem pele", "sem pele"]);
});

Deno.test("variantes: uma variante nova (só o modelo a conhece) fica com os valores do modelo e entra nas opções", () => {
  const { items, questions } = resolveVariants([item({
    name: "Coxa de frango desossada", generic_name: "Coxa de frango", variant: "Desossada", calories_per_100g: 180,
  })], IDX, ids);
  assertEquals([items[0].name, items[0].calories_per_100g, items[0].variant_label], ["Coxa de frango desossada", 180, "desossada"]);
  assertEquals(questions[0].options, ["com pele", "sem pele", "desossada"]);
  assertEquals(questions[0].assumed, "desossada");
});

Deno.test("variantes: «coxa de frango sem pele» com só «com pele» guardada → reconhece o genérico pelo princípio do nome", () => {
  const soComPele = buildVariantIndex([COXA, COM_PELE]);
  const { items, questions } = resolveVariants([item({ name: "Coxa de frango sem pele", calories_per_100g: 140 })], soComPele, ids);
  assertEquals([items[0].variant_of, items[0].variant_label, items[0].calories_per_100g], ["Coxa de frango", "sem pele", 140]);
  assertEquals(questions[0].options, ["com pele", "sem pele"]);
});

Deno.test("variantes: a primeira vez (nada guardado) pergunta com as opções do modelo; sem opções, não pergunta", () => {
  const first = resolveVariants([item({
    name: "Leite meio-gordo", generic_name: "Leite", variant: "meio-gordo", variant_options: ["gordo", "meio-gordo", "magro"],
  })], buildVariantIndex([]), ids);
  assertEquals([first.items[0].variant_of, first.items[0].variant_label], ["Leite", "meio-gordo"]);
  assertEquals(first.questions[0].options, ["meio-gordo", "gordo", "magro"]);
  // Sem valores de outras variantes, o impacto não se sabe.
  assertEquals([first.questions[0].impact_kcal, first.questions[0].impact_protein_g], [0, 0]);

  const semOpcoes = resolveVariants([item({ name: "Leite meio-gordo", generic_name: "Leite", variant: "meio-gordo" })], buildVariantIndex([]), ids);
  assertEquals(semOpcoes.questions, []);
  assertEquals(semOpcoes.items[0].variant_label, "meio-gordo"); // aprende-se na mesma
});

Deno.test("variantes: um rótulo lido numa foto e um alimento sem variantes ficam como estão", () => {
  const rotulo = item({ name: "Coxa de frango com pele", from_label: true, calories_per_100g: 999 });
  const arroz = item({ name: "Arroz", calories_per_100g: 130 });
  const { items, questions } = resolveVariants([rotulo, arroz], IDX, ids);
  assertEquals(items, [rotulo, arroz]);
  assertEquals(questions, []);
});

Deno.test("variantes: uma pergunta impossível de responder não se faz (regra do #86)", () => {
  const leite = resolveVariants([item({
    name: "Leite 1,5%", generic_name: "Leite", variant: "1,5%", variant_options: ["1,5%", "3,5%"],
  })], buildVariantIndex([]), ids);
  assertEquals(leite.questions, []);
});

Deno.test("variantes: a pergunta faz-se sempre e não conta para as 5 do modelo; a do modelo sobre o mesmo cai", () => {
  const model: CarolQuestion[] = Array.from({ length: MAX_QUESTIONS }, (_, i) => ({
    id: `m${i}`, kind: "preparacao", topic: `t${i}`, item_name: "Arroz", question: "?", options: ["a", "b"], assumed: "a",
    impact_kcal: 50, impact_protein_g: 0,
  }));
  const dup: CarolQuestion = {
    id: "dup", kind: "preparacao", topic: "pele", item_name: "Coxa de frango", question: "Comeste a pele?",
    options: ["com pele", "sem pele"], assumed: "com pele", impact_kcal: 90, impact_protein_g: 0,
  };
  const molho: CarolQuestion = { ...dup, id: "molho", topic: "molho", question: "Levou molho?", options: ["Sim", "Não"], assumed: "Não" };
  const v = resolveVariants([item({})], IDX, ids);
  const all = mergeVariantQuestions([...model, dup, molho], v.questions, v.renames);
  assertEquals(all.length, MAX_QUESTIONS + 2);
  assert(!all.some((q) => q.id === "dup"));
  // A do molho fica, e passa a apontar para o nome novo do alimento.
  assertEquals(all.find((q) => q.id === "molho")!.item_name, "Coxa de frango com pele");
  assertEquals(all.at(-1)!.kind, "variante");
  assertEquals((renameQuestionItems([{ item_name: "coxa de frango" }], v.renames) as { item_name: string }[])[0].item_name, "Coxa de frango com pele");
});

Deno.test("variantAnswer: a variante guardada dá os valores da base de dados; uma nova vai ao modelo", () => {
  const guardada = variantAnswer("Coxa de frango", "Sem pele", IDX);
  assertEquals([guardada.stored?.id, guardada.rename, guardada.label], ["v2", "Coxa de frango sem pele", "sem pele"]);
  const nova = variantAnswer("Coxa de frango", "desossada", IDX);
  assertEquals([nova.stored, nova.rename], [null, "Coxa de frango desossada"]);
});

Deno.test("variantes: textos — rótulo, pergunta e o que vai ao modelo", () => {
  assertEquals(normalizeVariantLabel("  Sem   Pele "), "sem pele");
  assertEquals(normalizeVariantLabel("x".repeat(41)), "");
  assertEquals(variantQuestionText("Leite", ["gordo", "meio-gordo", "magro"]), "Leite: gordo, meio-gordo ou magro?");
  assertEquals(variantKnowledge(IDX).includes("- Coxa de frango: com pele | sem pele"), true);
  assertEquals(variantKnowledge(buildVariantIndex([])), "");
});

// ─── Base de dados ───────────────────────────────────────────────────────

Deno.test("linkVariants: cria o genérico com os valores da variante e liga a variante a ele", async () => {
  const db = new FakeFoodsDb();
  db.tables.athlete_foods.push({ id: "v9", user_id: U, name: "Coxa de frango sem pele", name_key: "coxa de frango sem pele", times_seen: 1, in_pantry: false, parent_id: null, variant_label: null, calories_per_100g: 135 });
  await linkVariants(db, U, [{ ...item({ calories_per_100g: 135 }), name: "Coxa de frango sem pele", variant_of: "Coxa de frango", variant_label: "sem pele" }], NOW);
  const g = db.tables.athlete_foods.find((r) => r.name_key === "coxa de frango")!;
  assertEquals([g.name, g.calories_per_100g, g.times_seen, g.parent_id, g.variant_label], ["Coxa de frango", 135, 1, null, null]);
  const v = db.tables.athlete_foods.find((r) => r.id === "v9")!;
  assertEquals([v.parent_id, v.variant_label], [g.id, "sem pele"]);
});

Deno.test("linkVariants: um genérico que já existe conta mais uma vez (ou não, fora de uma refeição) e não muda de valores", async () => {
  const db = new FakeFoodsDb();
  db.tables.athlete_foods.push(
    { id: "g1", user_id: U, name: "Coxa de frango", name_key: "coxa de frango", times_seen: 1, in_pantry: false, parent_id: null, variant_label: null, calories_per_100g: 215 },
    { id: "v2", user_id: U, name: "Coxa de frango sem pele", name_key: "coxa de frango sem pele", times_seen: 1, parent_id: null, variant_label: null },
  );
  const it = { ...item({}), name: "Coxa de frango sem pele", variant_of: "Coxa de frango", variant_label: "sem pele" };
  await linkVariants(db, U, [it], NOW);
  const g = db.tables.athlete_foods.find((r) => r.id === "g1")!;
  assertEquals([g.times_seen, g.in_pantry, g.calories_per_100g], [2, true, 215]);
  assertEquals(db.tables.athlete_foods.find((r) => r.id === "v2")!.parent_id, "g1");
  await linkVariants(db, U, [it], NOW, { countGeneric: false });
  assertEquals(g.times_seen, 2);
});

Deno.test("linkVariants: um «genérico» que já é variante de outro não ganha filhas (um nível só)", async () => {
  const db = new FakeFoodsDb();
  db.tables.athlete_foods.push(
    { id: "a", user_id: U, name: "Leite", name_key: "leite", parent_id: "z", variant_label: "x" },
    { id: "b", user_id: U, name: "Leite magro", name_key: "leite magro", parent_id: null, variant_label: null },
  );
  await linkVariants(db, U, [{ name: "Leite magro", variant_of: "Leite", variant_label: "magro" }], NOW);
  assertEquals(db.tables.athlete_foods.find((r) => r.id === "b")!.parent_id, null);
});

Deno.test("learnFromMeal: a refeição aprende a variante — linha completa, genérico e ligação (bug #87)", async () => {
  const db = new FakeFoodsDb();
  const { items } = resolveVariants([item({ name: "Coxa de frango sem pele", generic_name: "Coxa de frango", variant: "sem pele", calories_per_100g: 140 })], buildVariantIndex([]), ids);
  await learnFromMeal(db, U, items, [], NOW);
  const rows = db.tables.athlete_foods;
  const v = rows.find((r) => r.name_key === "coxa de frango sem pele")!;
  const g = rows.find((r) => r.name_key === "coxa de frango")!;
  assertEquals([v.calories_per_100g, v.parent_id, v.variant_label], [140, g.id, "sem pele"]);
  assertEquals([g.parent_id, g.calories_per_100g], [null, 140]);
});

Deno.test("fetchVariants: lê as variantes e os genéricos delas; sem variantes, vazio; uma falha não rejeita", async () => {
  const db = new FakeFoodsDb();
  db.tables.athlete_foods.push(
    { ...COXA, user_id: U }, { ...COM_PELE, user_id: U }, { ...SEM_PELE, user_id: U },
    { ...SEM_PELE, id: "outro", user_id: "u2", parent_id: "g1" }, // de outro atleta: não entra
  );
  const idx = await fetchVariants(db, U);
  assertEquals(idx.byGeneric.get("coxa de frango")!.variants.map((v) => v.variant_label), ["com pele", "sem pele"]);
  assertEquals((await fetchVariants(new FakeFoodsDb(), U)).byGeneric.size, 0);
  assertEquals((await fetchVariants({ from: () => { throw new Error("rede"); } }, U)).byGeneric.size, 0);
});

Deno.test("linkVariants: com o genérico na despensa, as variantes dele também entram (decisão a do #87)", async () => {
  const db = new FakeFoodsDb();
  db.tables.athlete_foods.push(
    { id: "g1", user_id: U, name: "Coxa de frango", name_key: "coxa de frango", times_seen: 1, in_pantry: false, parent_id: null, variant_label: null },
    { id: "v1", user_id: U, name: "Coxa de frango com pele", name_key: "coxa de frango com pele", times_seen: 1, in_pantry: false, parent_id: "g1", variant_label: "com pele" },
    { id: "v2", user_id: U, name: "Coxa de frango sem pele", name_key: "coxa de frango sem pele", times_seen: 1, in_pantry: false, parent_id: null, variant_label: null },
    { id: "x", user_id: "u2", name: "Coxa de frango sem pele", name_key: "coxa de frango sem pele", times_seen: 1, in_pantry: false, parent_id: null, variant_label: null },
  );
  // 2.ª vez do genérico: entra na despensa, e com ele as duas variantes (a antiga e a nova).
  await linkVariants(db, U, [{ ...item({}), name: "Coxa de frango sem pele", variant_of: "Coxa de frango", variant_label: "sem pele" }], NOW);
  const byId = (id: string) => db.tables.athlete_foods.find((r) => r.id === id)!;
  assertEquals([byId("g1").in_pantry, byId("v1").in_pantry, byId("v2").in_pantry], [true, true, true]);
  assertEquals(byId("x").in_pantry, false); // de outro atleta

  // Genérico fora da despensa (visto uma vez): a variante fica fora também.
  const db2 = new FakeFoodsDb();
  await linkVariants(db2, U, [{ ...item({}), name: "Leite magro", variant_of: "Leite", variant_label: "magro" }], NOW);
  assertEquals(db2.tables.athlete_foods.every((r) => r.in_pantry === false), true);
});

// ─── Revisão do lote (2026-10-25) ─────────────────────────────────────────

Deno.test("linkVariants: um alimento antigo que estava na despensa leva o genérico com ele (não some do Armário)", async () => {
  const db = new FakeFoodsDb();
  // «Coxa de frango com pele» já estava na despensa, sem genérico.
  db.tables.athlete_foods.push({ id: "v1", user_id: U, name: "Coxa de frango com pele", name_key: "coxa de frango com pele", times_seen: 3, in_pantry: true, parent_id: null, variant_label: null, calories_per_100g: 215 });
  await linkVariants(db, U, [{ ...item({}), name: "Coxa de frango com pele", variant_of: "Coxa de frango", variant_label: "com pele" }], NOW);
  const g = db.tables.athlete_foods.find((r) => r.name_key === "coxa de frango")!;
  assertEquals([g.in_pantry, g.times_seen], [true, 1]);
  assertEquals(db.tables.athlete_foods.find((r) => r.id === "v1")!.parent_id, g.id);

  // Um genérico que já existia fora da despensa também entra.
  const db2 = new FakeFoodsDb();
  db2.tables.athlete_foods.push(
    { id: "g1", user_id: U, name: "Coxa de frango", name_key: "coxa de frango", times_seen: 0, in_pantry: false, parent_id: null, variant_label: null },
    { id: "v1", user_id: U, name: "Coxa de frango com pele", name_key: "coxa de frango com pele", times_seen: 3, in_pantry: true, parent_id: null, variant_label: null },
  );
  await linkVariants(db2, U, [{ ...item({}), name: "Coxa de frango com pele", variant_of: "Coxa de frango", variant_label: "com pele" }], NOW, { countGeneric: false });
  assertEquals(db2.tables.athlete_foods.find((r) => r.id === "g1")!.in_pantry, true);
});

Deno.test("variantes guardadas com % («iogurte 0%») perguntam-se sempre; uma opção só do modelo com % sai das opções", () => {
  const IOG = food({ id: "gi", name: "Iogurte grego", name_key: "iogurte grego" });
  const ZERO = food({ id: "vz", parent_id: "gi", variant_label: "0%", name: "Iogurte grego 0%", name_key: "iogurte grego 0", calories_per_100g: 57, times_seen: 3 });
  const NAT = food({ id: "vn", parent_id: "gi", variant_label: "natural", name: "Iogurte grego natural", name_key: "iogurte grego natural", calories_per_100g: 130, times_seen: 1 });
  const idx = buildVariantIndex([IOG, ZERO, NAT]);
  const { questions } = resolveVariants([item({ name: "Iogurte grego" })], idx, ids);
  assertEquals(questions.length, 1);
  assertEquals([questions[0].options, questions[0].assumed], [["0%", "natural"], "0%"]);

  // Uma opção que só o modelo sugeriu e cai no filtro do #86 sai; a pergunta fica.
  const withModel = resolveVariants([item({ name: "Iogurte grego", generic_name: "Iogurte grego", variant: "0%", variant_options: ["0%", "natural", "2% de gordura"] })], idx, ids);
  assertEquals(withModel.questions[0].options, ["0%", "natural"]);
});

Deno.test("linkVariants: uma ligação recusada pelo trigger não para as outras da mesma refeição", async () => {
  const db = new FakeFoodsDb();
  db.tables.athlete_foods.push(
    { id: "a", user_id: U, name: "Leite magro", name_key: "leite magro", parent_id: null, variant_label: null, in_pantry: false },
    { id: "b", user_id: U, name: "Coxa de frango sem pele", name_key: "coxa de frango sem pele", parent_id: null, variant_label: null, in_pantry: false },
  );
  // «Leite magro» já é genérico de outras: o trigger recusa ligá-lo (variant_nested).
  db.updateError = (row, patch) => (row.id === "a" && patch.parent_id ? "variant_nested" : null);
  await linkVariants(db, U, [
    { name: "Leite magro", variant_of: "Leite", variant_label: "magro" },
    { name: "Coxa de frango sem pele", variant_of: "Coxa de frango", variant_label: "sem pele" },
  ], NOW);
  const coxa = db.tables.athlete_foods.find((r) => r.name_key === "coxa de frango")!;
  assertEquals(db.tables.athlete_foods.find((r) => r.id === "b")!.parent_id, coxa.id);
  assertEquals(db.tables.athlete_foods.find((r) => r.id === "a")!.parent_id, null);
});
