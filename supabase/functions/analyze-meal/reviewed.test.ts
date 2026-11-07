// #106 nas refeições (pedido do Rui, 2026-11-07): com fotos, primeiro «Ler e
// preencher» (mode "preview", sem gravar) e só depois «Gravar e analisar»
// (reviewed: true, com os alimentos revistos e as respostas). Sem a rede: o
// Gemini é injetado (MealDeps) e o Supabase é o FakeFoodsDb.
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  mealReplayBody, parseReviewedMealItems, parseReviewedMealQuestions, previewMealItem, readMealPhotos, saveReviewedMeal,
  type MealDeps, type ReviewedMealInput,
} from "./index.ts";
import { EMPTY_PANTRY, type CarolQuestion } from "./pantry.ts";
import { emptyUsage } from "../_shared/geminiUsage.ts";
import { FakeFoodsDb } from "./foodsTestkit.ts";

const USER = "u1";
const per100 = (kcal: number, p: number, c: number, f: number) => ({
  calories_per_100g: kcal, protein_per_100g: p, carbs_per_100g: c, fat_per_100g: f,
  fiber_per_100g: 1, sugar_per_100g: 1, sodium_per_100g: 100,
  iron_mg_per_100g: null, calcium_mg_per_100g: null, vitamin_c_mg_per_100g: null, potassium_mg_per_100g: null,
});
const TOSTA = { name: "Tosta mista", quantity_grams: 120, from_label: false, ...per100(260, 14, 28, 10) };
const IOGURTE = { name: "Iogurte grego", quantity_grams: 125, from_label: true, ...per100(97, 9, 4, 5) };
// O que o modelo pergunta (a forma crua do RESPONSE_SCHEMA).
const RAW_QUESTIONS = [{
  kind: "quantidade", topic: "fiambre", item_name: "Tosta mista", question: "Quanto fiambre levou a tosta?",
  options: ["1 fatia (~20 g)", "2 fatias (~40 g)", "3 fatias (~60 g)"], assumed: "1 fatia (~20 g)", impact_kcal: 40, impact_protein_g: 4,
}];

function fakeDeps(seen: { photos?: unknown[]; comments?: unknown[]; estimates?: unknown[] } = {}): MealDeps {
  return {
    analyzePhotos: (images, mime, written, notes, knowledge) => {
      (seen.photos ??= []).push({ images, mime, written, notes, knowledge });
      const items = written.length ? [TOSTA, { ...IOGURTE, name: written[0].name, quantity_grams: written[0].grams ?? 125 }] : [TOSTA, IOGURTE];
      return Promise.resolve({ items, usage: emptyUsage(), facts: [{ topic: "pão", value: "de forma" }], questions: RAW_QUESTIONS });
    },
    estimateManual: (written, notes, knowledge) => {
      (seen.estimates ??= []).push({ written, notes, knowledge });
      return Promise.resolve({ items: written.map((w) => ({ ...TOSTA, name: w.name, quantity_grams: w.grams ?? 100 })), usage: emptyUsage() });
    },
    attachComment: (meal, ctx) => {
      (seen.comments ??= []).push({ meal, ctx });
      return Promise.resolve(null);
    },
  };
}

Deno.test("preview com fotos: os alimentos e as perguntas, sem gravar nada", async () => {
  const seen: { photos?: unknown[] } = {};
  const read = await readMealPhotos({ images: ["AAAA"], mime: "image/jpeg", written: [], notes: null, pantry: EMPTY_PANTRY }, fakeDeps(seen));
  assertEquals(read.items.map((i) => i.name), ["Tosta mista", "Iogurte grego"]);
  // A do modelo (quanto fiambre) e a da manteiga no pão, que o servidor junta (bug #109).
  const fiambre = read.questions.find((q) => q.kind === "quantidade")!;
  assertEquals([fiambre.item_name, fiambre.assumed], ["Tosta mista", "1 fatia (~20 g)"]);
  assert(read.questions.some((q) => /manteiga/i.test(q.question)), JSON.stringify(read.questions));
  assertEquals(read.facts, [{ topic: "pão", value: "de forma" }]);
  // O que vai ao cliente: as colunas que se gravam e o from_label.
  const out = previewMealItem(read.items[1]);
  assertEquals([out.name, out.quantity_grams, out.calories_per_100g, out.from_label, out.iron_mg_per_100g], ["Iogurte grego", 125, 97, true, null]);
  // preview_grams: as gramas da leitura, que o cliente devolve tal e qual no gravar.
  assertEquals(out.preview_grams, 125);
  assertEquals("source_index" in out, false);
});

Deno.test("preview com fotos e alimentos escritos: os escritos vão à leitura e voltam com as gramas dele", async () => {
  const seen: { photos?: { written: unknown; notes: unknown }[] } = {};
  const read = await readMealPhotos(
    { images: ["AAAA", "BBBB"], mime: "image/png", written: [{ name: "Iogurte natural", grams: 150 }], notes: "sem açúcar", pantry: EMPTY_PANTRY },
    fakeDeps(seen as never),
  );
  assertEquals(seen.photos![0].written, [{ name: "Iogurte natural", grams: 150 }]);
  assertEquals(seen.photos![0].notes, "sem açúcar");
  assertEquals(read.items.map((i) => [i.name, i.quantity_grams]), [["Tosta mista", 120], ["Iogurte natural", 150]]);
});

const input = (over: Partial<ReviewedMealInput> = {}): ReviewedMealInput => ({
  date: "2026-11-07", meal_type: "lanche", notes: null, mealTimeField: { meal_time: "16:30" },
  images: ["AAAA"], mime: "image/jpeg",
  items: [previewMealItem(TOSTA), previewMealItem({ ...IOGURTE, quantity_grams: 150 })],
  carol_questions: [], facts: [{ topic: "pão", value: "de forma" }], written: [], clientRequestId: null,
  ...over,
});
const previewQuestion = (answer: string | null): Partial<CarolQuestion> => ({
  id: "q1", kind: "quantidade", topic: "Tosta mista · quantidade", item_name: "Tosta mista", question: "Quanto fiambre levou a tosta?",
  options: ["1 fatia (~20 g)", "2 fatias (~40 g)", "3 fatias (~60 g)"], assumed: "1 fatia (~20 g)", impact_kcal: 40, impact_protein_g: 4, answer,
});

Deno.test("gravar com reviewed e respostas: grava os revistos sem reler as fotos, aplica as respostas e comenta com elas como factos", async () => {
  const db = new FakeFoodsDb();
  const seen: { photos?: unknown[]; comments?: { ctx: { questions: CarolQuestion[] } }[]; estimates?: unknown[] } = {};
  const r = await saveReviewedMeal(db, USER, input({ carol_questions: [previewQuestion("2 fatias (~40 g)")] }), EMPTY_PANTRY, fakeDeps(seen as never));
  assert("ok" in r && r.ok, JSON.stringify(r));
  // Não houve leitura das fotos; subiram para o storage.
  assertEquals(seen.photos, undefined);
  assertEquals(db.uploads.length, 1);
  assertEquals(db.tables.meals[0].photo_paths, db.uploads);
  assertEquals(db.tables.meals[0].meal_time, "16:30");
  // Os alimentos revistos (o iogurte com as gramas que ele editou)…
  const byName = new Map(r.items.map((i) => [i.name, i]));
  assertEquals(byName.get("Iogurte grego")!.quantity_grams, 150);
  // …e a resposta de quantidade aplicada como no modo answer: +20 g na tosta, sem o modelo.
  assertEquals(byName.get("Tosta mista")!.quantity_grams, 140);
  assertEquals(seen.estimates, undefined);
  // A pergunta fica respondida e o comentário sai uma vez, com ela como facto.
  const q = (db.tables.meals[0].carol_questions as CarolQuestion[])[0];
  assertEquals([q.answer, typeof q.answered_at], ["2 fatias (~40 g)", "string"]);
  assertEquals(seen.comments!.length, 1);
  assertEquals(seen.comments![0].ctx.questions[0].answer, "2 fatias (~40 g)");
  assertEquals(r.unapplied_question_ids, []);
  // A despensa aprende: o rótulo lido no preview entra.
  assertEquals(r.pantry_added, ["Iogurte grego"]);
});

Deno.test("gravar com reviewed sem respostas: comenta com as perguntas por confirmar; a estimativa a falhar não perde as respostas", async () => {
  const db = new FakeFoodsDb();
  const seen: { comments?: { ctx: { questions: CarolQuestion[] } }[] } = {};
  const r = await saveReviewedMeal(db, USER, input({ carol_questions: [previewQuestion(null)] }), EMPTY_PANTRY, fakeDeps(seen as never));
  assert("ok" in r && r.ok);
  assertEquals(seen.comments![0].ctx.questions[0].answer, null);
  // Uma resposta «Outro…» de preparação vai ao modelo; se ele falhar, a resposta fica como facto.
  const db2 = new FakeFoodsDb();
  const failing = { ...fakeDeps(seen as never), estimateManual: () => Promise.reject(new Error("rede")) };
  const prep = { ...previewQuestion("com queijo da serra"), id: "q2", kind: "preparacao", topic: "tosta", options: ["com flamengo", "com queijo da serra"], assumed: "com flamengo" };
  const iogurteQ = { ...previewQuestion("200 g"), id: "q3", topic: "Iogurte grego · quantidade", item_name: "Iogurte grego", options: ["150 g", "200 g"], assumed: "150 g" };
  const r2 = await saveReviewedMeal(db2, USER, input({ carol_questions: [prep, iogurteQ] }), EMPTY_PANTRY, failing);
  assert("ok" in r2 && r2.ok);
  // Revisão do lote 8aaa3eb9: a de preparação cuja reestimativa falhou fica por
  // responder (o modo answer aplica-a depois); a de quantidade aplicou-se.
  const qs = db2.tables.meals[0].carol_questions as CarolQuestion[];
  assertEquals(qs.find((q) => q.id === "q2")!.answer, null);
  assertEquals(qs.find((q) => q.id === "q3")!.answer, "200 g");
  // E o cliente fica a saber qual ficou por aplicar (seguimento de 8a5f2044).
  assertEquals(r2.unapplied_question_ids, ["q2"]);
  // E os alimentos devolvidos são os da BD, já com a quantidade aplicada.
  assertEquals(r2.items.find((i) => i.name === "Iogurte grego")!.quantity_grams, 200);
  assertEquals((db2.tables.meal_items as { name: string; quantity_grams: number }[]).find((i) => i.name === "Iogurte grego")!.quantity_grams, 200);
});

Deno.test("reviewed: gramas editadas por ele + resposta de quantidade — a edição manda, a resposta fica como facto (não se soma duas vezes)", async () => {
  const db = new FakeFoodsDb();
  const seen: { comments?: { ctx: { questions: CarolQuestion[] } }[] } = {};
  // A leitura deu 120 g; ele escreveu 160 e respondeu «2 fatias» (+20 sobre a assumida).
  const edited = { ...previewMealItem(TOSTA), quantity_grams: 160 };
  const r = await saveReviewedMeal(db, USER, input({ items: [edited], carol_questions: [previewQuestion("2 fatias (~40 g)")] }), EMPTY_PANTRY, fakeDeps(seen as never));
  assert("ok" in r && r.ok);
  assertEquals(r.items[0].quantity_grams, 160);
  assertEquals((db.tables.meals[0].carol_questions as CarolQuestion[])[0].answer, "2 fatias (~40 g)");
  assertEquals(seen.comments![0].ctx.questions[0].answer, "2 fatias (~40 g)");
  // Sem preview_grams (cliente antigo) a resposta aplica-se como antes.
  const db2 = new FakeFoodsDb();
  const noPreview = { ...previewMealItem(TOSTA), quantity_grams: 160, preview_grams: undefined };
  const r2 = await saveReviewedMeal(db2, USER, input({ items: [noPreview], carol_questions: [previewQuestion("2 fatias (~40 g)")] }), EMPTY_PANTRY, fakeDeps());
  assert("ok" in r2 && r2.ok);
  assertEquals(r2.items[0].quantity_grams, 180);
});

Deno.test("replay idempotente: a 2.ª tentativa com o mesmo client_request_id devolve a refeição da 1.ª e tira as fotos dela", async () => {
  const db = new FakeFoodsDb();
  const id = "11111111-2222-4333-8444-555555555555";
  const first = await saveReviewedMeal(db, USER, input({ clientRequestId: id }), EMPTY_PANTRY, fakeDeps());
  assert("ok" in first && first.ok);
  const second = await saveReviewedMeal(db, USER, input({ clientRequestId: id }), EMPTY_PANTRY, fakeDeps());
  assert("existing" in second);
  assertEquals(second.existing.id, first.meal.id);
  assertEquals(db.tables.meals.length, 1);
  // As fotos da 2.ª subiram e saíram; as da 1.ª ficam.
  assertEquals(db.uploads.length, 2);
  assertEquals(db.removed, [db.uploads[1]]);
  // A resposta do replay é a do registo direto (meal + items).
  const body = mealReplayBody(second.existing, db.tables.meal_items);
  assertEquals([body.replayed, body.items.length], [true, 2]);
});

Deno.test("reviewed: o que volta do cliente não se confia", () => {
  assertEquals(parseReviewedMealItems([]), null);
  assertEquals(parseReviewedMealItems([{ ...TOSTA, quantity_grams: 0 }]), null);
  assertEquals(parseReviewedMealItems([{ ...TOSTA, calories_per_100g: 2000 }]), null);
  assertEquals(parseReviewedMealItems([{ ...TOSTA, protein_per_100g: null }]), null); // um macro em falta não
  // Coerência: proteína + hidratos + gordura não passam de 100 g por 100 g.
  assertEquals(parseReviewedMealItems([{ ...TOSTA, protein_per_100g: 50, carbs_per_100g: 40, fat_per_100g: 20 }]), null);
  assertEquals(parseReviewedMealItems([{ ...TOSTA, protein_per_100g: 0, carbs_per_100g: 0, fat_per_100g: 100 }])!.length, 1);
  const ok = parseReviewedMealItems([{ ...TOSTA, name: "  Tosta  ", extra: "x" }])!;
  assertEquals([ok[0].name, ok[0].iron_mg_per_100g, "extra" in ok[0]], ["Tosta", null, false]);
  const { questions, answers } = parseReviewedMealQuestions([previewQuestion("2 fatias (~40 g)"), { id: "x", question: "sem opções" }]);
  assertEquals(questions.length, 1);
  assertEquals(questions[0].answer, null);
  // O impacto vem do cliente: limitado.
  const big = parseReviewedMealQuestions([{ ...previewQuestion(null), impact_kcal: 99999, impact_protein_g: -5000 }]).questions[0];
  assertEquals([big.impact_kcal, big.impact_protein_g], [2000, -200]);
  assertEquals(answers, [{ id: "q1", answer: "2 fatias (~40 g)" }]);
});

Deno.test("reviewed: dados inválidos recusam antes de subir as fotos", async () => {
  const db = new FakeFoodsDb();
  const r = await saveReviewedMeal(db, USER, input({ items: [{ name: "x" }] }), EMPTY_PANTRY, fakeDeps());
  assert("ok" in r && !r.ok);
  assertEquals(r.status, 400);
  assertStringIncludes(r.error, "volta a ler as fotos");
  assertEquals(db.uploads.length, 0);
  const noPhotos = await saveReviewedMeal(db, USER, input({ images: [] }), EMPTY_PANTRY, fakeDeps());
  assert("ok" in noPhotos && !noPhotos.ok && noPhotos.status === 400);
});

Deno.test("o handler: preview antes da idempotência, reviewed depois dela, e o caminho direto continua", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  const iPreview = src.indexOf('if (body.mode === "preview")');
  const iIdem = src.indexOf("const alreadySaved = !body.meal_id");
  const iReviewed = src.indexOf("if (body.reviewed === true && !body.mode && !body.meal_id)");
  const iDirect = src.indexOf("// ── Modo normal: nova refeição a partir de fotos");
  assert(iPreview > 0 && iPreview < iIdem && iIdem < iReviewed && iReviewed < iDirect);
  assertStringIncludes(src, "({ items, usage, facts, questions } = await readMealPhotos(");
  assertStringIncludes(src, "const r = await applyMealAnswers(sb, userId, meal, body.answers, await pantryPromise, mealDeps);");
  assertStringIncludes(src, "unapplied_question_ids: r.unapplied_question_ids,");
});
