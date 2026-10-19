import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { runSavePantryFood } from "./pantryFromChat.ts";

// deno-lint-ignore no-explicit-any
function fakeSb(existing: any, opts: { readErr?: boolean; upErr?: boolean } = {}) {
  // deno-lint-ignore no-explicit-any
  const calls = { upserts: [] as any[], conflict: "" };
  const sb = {
    from: (_t: string) => ({
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve(opts.readErr ? { data: null, error: { message: "rede" } } : { data: existing, error: null }) }) }) }),
      // deno-lint-ignore no-explicit-any
      upsert: (row: any, o: any) => { calls.upserts.push(row); calls.conflict = o?.onConflict; return Promise.resolve({ error: opts.upErr ? { message: "x" } : null }); },
    }),
  };
  return { sb, calls };
}

const ARGS = { name: "Barra Proteica Choco", portion_grams: 60, portion_label: "1 barra", calories_per_100g: 380, protein_per_100g: 33, carbs_per_100g: 35, fat_per_100g: 12, sugar_per_100g: 4.5, sodium_per_100g: 400 };

Deno.test("runSavePantryFood: produto novo entra na Despensa por rótulo, sem contar como refeição", async () => {
  const { sb, calls } = fakeSb(null);
  const r = await runSavePantryFood(sb, "u1", ARGS, "2026-10-19T12:00:00.000Z");
  assertStringIncludes(r, "guardado na Despensa");
  assertEquals(calls.conflict, "user_id,name_key");
  const row = calls.upserts[0];
  assertEquals(row.name_key, "barra proteica choco");
  assertEquals([row.in_pantry, row.source, row.times_seen], [true, "rotulo", 0]);
  assertEquals([row.calories_per_100g, row.protein_per_100g, row.portion_grams, row.portion_label], [380, 33, 60, "1 barra"]);
  assertEquals(row.sugar_per_100g, 4.5);
  assertEquals(row.fiber_per_100g, null); // o que o rótulo não deu fica por confirmar, nunca 0
});

Deno.test("runSavePantryFood: o que o atleta ajustou na Despensa não é reescrito", async () => {
  const { sb, calls } = fakeSb({ name: "Barra Proteica Choco", name_key: "barra proteica choco", in_pantry: true, edited_by_athlete: true, times_seen: 2 });
  const r = await runSavePantryFood(sb, "u1", ARGS);
  assertStringIncludes(r, "ajustado por ele");
  assertEquals(calls.upserts.length, 0);
});

Deno.test("runSavePantryFood: um rótulo já guardado atualiza-se e conserva as vezes vistas", async () => {
  const { sb, calls } = fakeSb({ name: "Barra Proteica Choco", name_key: "barra proteica choco", in_pantry: true, edited_by_athlete: false, times_seen: 3, source: "rotulo", portion_label: "1 barra" });
  const r = await runSavePantryFood(sb, "u1", { ...ARGS, calories_per_100g: 390 });
  assertStringIncludes(r, "atualizado na Despensa");
  assertEquals([calls.upserts[0].calories_per_100g, calls.upserts[0].times_seen], [390, 3]);
});

Deno.test("runSavePantryFood: valores em falta ou incoerentes não se guardam", async () => {
  const { sb, calls } = fakeSb(null);
  assertStringIncludes(await runSavePantryFood(sb, "u1", { name: "X", calories_per_100g: 100 }), "faltam os valores");
  assertStringIncludes(await runSavePantryFood(sb, "u1", { ...ARGS, calories_per_100g: 1500 }), "não batem certo");
  assertStringIncludes(await runSavePantryFood(sb, "u1", { ...ARGS, protein_per_100g: 60, carbs_per_100g: 60 }), "não batem certo");
  assertStringIncludes(await runSavePantryFood(sb, "u1", { ...ARGS, name: "  " }), "falta o nome");
  assertEquals(calls.upserts.length, 0);
});

Deno.test("runSavePantryFood: erros da base de dados vêm como Erro e não como sucesso", async () => {
  assertStringIncludes(await runSavePantryFood(fakeSb(null, { readErr: true }).sb, "u1", ARGS), "Erro");
  assertStringIncludes(await runSavePantryFood(fakeSb(null, { upErr: true }).sb, "u1", ARGS), "Erro ao guardar");
});

Deno.test("runSavePantryFood: a energia tem de bater com os macros (kJ lidos como kcal, kcal a zero)", async () => {
  const { sb, calls } = fakeSb(null);
  // 250 kJ (≈ 60 kcal) lidos como kcal num iogurte com macros de 100 g.
  const kj = await runSavePantryFood(sb, "u1", { name: "Iogurte", calories_per_100g: 250, protein_per_100g: 4, carbs_per_100g: 6, fat_per_100g: 1.5 });
  assertStringIncludes(kj, "não batem com os macros");
  assertStringIncludes(await runSavePantryFood(sb, "u1", { ...ARGS, calories_per_100g: 0 }), "não batem com os macros");
  assertEquals(calls.upserts.length, 0);
  // Com fibra/polióis a diferença é normal: 10 % fora ainda passa.
  assertStringIncludes(await runSavePantryFood(sb, "u1", { ...ARGS, calories_per_100g: 345 }), "guardado");
});

import { energyMismatch } from "./pantryFromChat.ts";

Deno.test("energyMismatch: rótulos legítimos passam (fibra, polióis, álcool, líquidos)", () => {
  // Psílio: quase tudo é fibra (78 g de 85 g de hidratos) — 186 kcal contra ≈357 pelos macros.
  assertEquals(energyMismatch(186, 2, 85, 1, { fiber: 78 }), null);
  // Eritritol: 0 kcal, hidratos 100 g, polióis 100 g.
  assertEquals(energyMismatch(0, 0, 100, 0, { polyols: 100 }), null);
  // Cerveja 4,5 %: 43 kcal com 3,6 g de hidratos e 3,5 g de álcool.
  assertEquals(energyMismatch(43, 0.5, 3.6, 0, { alcohol: 3.5 }), null);
  // Vinho tinto: 85 kcal, 2,6 g de hidratos, 9,5 g de álcool.
  assertEquals(energyMismatch(85, 0.1, 2.6, 0, { alcohol: 9.5 }), null);
  // Leite meio-gordo e uma barra proteica, só com os macros.
  assertEquals(energyMismatch(46, 3.3, 4.8, 1.6), null);
  assertEquals(energyMismatch(380, 33, 35, 12), null);
});

Deno.test("energyMismatch: recusa o grosseiro e diz o que fazer", () => {
  // kJ lidos como kcal.
  const kj = energyMismatch(250, 4, 6, 1.5)!;
  assertStringIncludes(kj, "kJ");
  assertStringIncludes(kj, "polyols_per_100g");
  // kcal a zero com macros e sem nada que o explique.
  assertStringIncludes(energyMismatch(0, 33, 35, 12)!, "não batem com os macros");
  // Eritritol sem dizer que são polióis.
  assertStringIncludes(energyMismatch(0, 0, 100, 0)!, "não batem com os macros");
});

Deno.test("runSavePantryFood: o crédito de polióis chega pela ferramenta; um alimento ajustado à mão não se mexe, esteja ou não na despensa", async () => {
  const { sb, calls } = fakeSb(null);
  const ok = await runSavePantryFood(sb, "u1", { name: "Eritritol", calories_per_100g: 0, protein_per_100g: 0, carbs_per_100g: 100, fat_per_100g: 0, polyols_per_100g: 100 });
  assertStringIncludes(ok, "guardado");
  assertEquals(calls.upserts.length, 1);
  const edited = fakeSb({ name: "Barra Proteica Choco", name_key: "barra proteica choco", in_pantry: false, edited_by_athlete: true, times_seen: 1 });
  const msg = await runSavePantryFood(edited.sb, "u1", ARGS);
  assertStringIncludes(msg, "já está registado");
  assertEquals(msg.includes("abre o alimento na Despensa"), false);
  assertEquals(edited.calls.upserts.length, 0);
});
