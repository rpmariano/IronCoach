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
