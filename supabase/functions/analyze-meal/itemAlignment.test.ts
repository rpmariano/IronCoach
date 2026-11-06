import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import { alignItems, alignPhotoAndWritten, combineParts, mismatchMeta } from "./itemAlignment.ts";
import { analyzeManualItems, analyzePhotosWithItems, buildManualItemsPrompt, buildPhotosAndItemsPrompt, mergePhotoAndWrittenItems } from "./index.ts";

// Urgência de 2026-11-04: o Rui não conseguia gravar uma refeição — «A
// estimativa não devolveu todos os alimentos pedidos», 3 vezes seguidas.

const it = (name: string, grams: number, kcal = 100, extra: Record<string, unknown> = {}) =>
  ({ name, quantity_grams: grams, calories_per_100g: kcal, protein_per_100g: 10, fiber_per_100g: 2, ...extra });
const W = (name: string, grams: number | null = null) => ({ name, grams });

Deno.test("alignItems: um item extra «manteiga» descarta-se; os escritos ficam", () => {
  const a = alignItems([it("Torrada", 60), it("Manteiga", 10, 720), it("Café com leite", 200)], [W("torrada"), W("café com leite")]);
  assertEquals(a.items.map((x) => x?.name), ["Torrada", "Café com leite"]);
  assertEquals(a.extras.map((x) => x.name), ["Manteiga"]);
  assertEquals(a.combined, 0);
});

Deno.test("alignItems: «pão com manteiga» partido em dois junta-se num só alimento, pesado pelas gramas", () => {
  const a = alignItems([it("Pão", 60, 250), it("Manteiga", 10, 720, { fiber_per_100g: null }), it("Café", 200, 2)], [W("pão com manteiga"), W("café")]);
  assertEquals(a.items.length, 2);
  const pao = a.items[0]!;
  assertEquals(pao.quantity_grams, 70);
  assertEquals(Math.round(pao.calories_per_100g * 100) / 100, Math.round(((250 * 60 + 720 * 10) / 70) * 100) / 100); // 317,14
  assertEquals(pao.protein_per_100g, 10);
  assertEquals(pao.fiber_per_100g, null); // por saber numa parte: por saber no todo
  assertEquals(a.items[1]!.name, "Café");
  assertEquals([a.combined, a.extras.length], [1, 0]);
  // As duas partes passam o nome às perguntas («Manteiga» → «pão com manteiga»).
  assertEquals(a.pairs, [["Pão", "pão com manteiga"], ["Manteiga", "pão com manteiga"], ["Café", "café"]]);
});

Deno.test("alignItems: um item a menos fica a faltar (null); um nome diferente também — nunca pela ordem", () => {
  const menos = alignItems([it("Arroz", 150), it("Salada", 80)], [W("arroz"), W("frango grelhado"), W("salada")]);
  assertEquals(menos.items.map((x) => x?.name ?? null), ["Arroz", null, "Salada"]);
  // Revisão do 5fd4c502: o que não emparelha pelo nome falta (refaz-se), não fica com o que sobrou.
  const outro = alignItems([it("Pão de trigo e centeio", 60), it("Fiambre de peru", 30), it("Manteiga", 10)], [W("Pão de mistura"), W("fiambre")]);
  assertEquals(outro.items.map((x) => x?.name ?? null), [null, "Fiambre de peru"]);
  assertEquals(outro.extras.map((x) => x.name), ["Pão de trigo e centeio", "Manteiga"]);
  // O mesmo número e cada um no lugar certo: pela ordem, como sempre.
  assertEquals(alignItems([it("X", 1), it("Y", 2)], [W("a"), W("b")]).items.map((x) => x?.name), ["X", "Y"]);
});

// Os casos da revisão do 5fd4c502 (bloqueante): nunca dar os valores de um
// alimento a outro.
Deno.test("revisão: [pão, ovos, café] ← [Pão, Ovos mexidos, Manteiga, Galão] — o café não fica com a manteiga", () => {
  const a = alignItems([it("Pão", 60), it("Ovos mexidos", 120), it("Manteiga", 200, 720), it("Galão", 250, 50)], [W("pão"), W("ovos"), W("café")]);
  assertEquals(a.items.map((x) => x?.name ?? null), ["Pão", "Ovos mexidos", null]); // o café refaz-se
  assertEquals(a.extras.map((x) => x.name), ["Manteiga", "Galão"]);
});

Deno.test("revisão: [ovo, ovo, pão] ← [Ovo, Ovo, Pão, Manteiga] — os dois ovos emparelham um a um", () => {
  const a = alignItems([it("Ovo", 50), it("Ovo", 55), it("Pão", 60), it("Manteiga", 10, 720)], [W("ovo"), W("ovo"), W("pão")]);
  assertEquals(a.items.map((x) => [x?.name, x?.quantity_grams]), [["Ovo", 50], ["Ovo", 55], ["Pão", 60]]);
  assertEquals(a.extras.map((x) => x.name), ["Manteiga"]);
});

Deno.test("revisão: «tosta mista» devolvida como Pão + Fiambre + Queijo — refaz-se, não fica só com o pão", () => {
  const a = alignItems([it("Pão", 60), it("Fiambre", 30), it("Queijo", 30)], [W("tosta mista")]);
  assertEquals(a.items, [null]);
  assertEquals(a.extras.length, 3);
});

Deno.test("revisão: a Manteiga em 1.º lugar nunca é do primeiro escrito", () => {
  const mais = alignItems([it("Manteiga", 10, 720), it("Pão", 60), it("Café", 200)], [W("pão"), W("café")]);
  assertEquals(mais.items.map((x) => x?.name), ["Pão", "Café"]);
  assertEquals(mais.extras.map((x) => x.name), ["Manteiga"]);
  // O mesmo número, mas a Manteiga no lugar do pão: não vai pela ordem.
  const igual = alignItems([it("Manteiga", 10, 720), it("Café", 200)], [W("pão"), W("café")]);
  assertEquals(igual.items.map((x) => x?.name ?? null), [null, "Café"]);
  // Com o índice do café, nas fotos, também fica de fora.
  const fotos = alignPhotoAndWritten([{ ...it("Manteiga", 200, 720), source_index: 1 }], [W("café")]);
  assertEquals(fotos.items, [null]);
});

Deno.test("combineParts: uma parte só fica igual; gramas a zero não dividem por zero", () => {
  const one = it("Pão", 60);
  assertEquals(combineParts([one]), one);
  assertEquals(combineParts([it("a", 0, 100), it("b", 0, 200)]).calories_per_100g, 0);
});

Deno.test("alignPhotoAndWritten / mergePhotoAndWrittenItems: partes juntas, um sem índice pelo nome, repetido uma vez", () => {
  const raw = [
    { ...it("Bife", 180), source_index: 0 },
    { ...it("Pão", 60, 250), source_index: 1 },
    { ...it("Manteiga", 10, 720), source_index: 1 },
    { ...it("Café", 200), source_index: 0 }, // o escrito «café» sem o índice dele
  ];
  const merged = mergePhotoAndWrittenItems(raw, [W("pão com manteiga"), W("café", 150)])!;
  assertEquals(merged.map((i) => [i.name, i.quantity_grams]), [["Bife", 180], ["pão com manteiga", 70], ["café", 150]]);
  const a = alignPhotoAndWritten(raw, [W("pão com manteiga"), W("café")]);
  assertEquals([a.combined, a.moved], [1, 1]);
  // Repetido (não acrescenta nada do escrito): conta uma vez, como antes.
  assertEquals(mergePhotoAndWrittenItems([{ ...it("Café", 200), source_index: 1 }, { ...it("Café outra vez", 150), source_index: 1 }], [W("café")])!.map((i) => i.quantity_grams), [200]);
  // Ainda a faltar: null (quem chama refá-lo).
  assertEquals(mergePhotoAndWrittenItems([{ ...it("Bife", 180), source_index: 0 }], [W("pão")]), null);
});

Deno.test("mismatchMeta: só contagens e nomes de alimentos", () => {
  const raw = [it("Torrada", 60), it("Manteiga", 10)];
  const a = alignItems(raw, [W("torrada")]);
  assertEquals(mismatchMeta("manual", 1, raw, a, "emparelhado"), {
    mode: "manual", requested: 1, returned: 2, returned_names: ["Torrada", "Manteiga"], extras: ["Manteiga"],
    combined: 0, moved: 0, missing: 0, outcome: "emparelhado",
  });
});

Deno.test("prompt: um item por alimento, os ingredientes opcionais são perguntas, nunca itens", () => {
  const manual = buildManualItemsPrompt([W("pão com manteiga")], null);
  assert(manual.includes("nem mais nem menos"));
  assert(manual.includes("nunca acrescentes como item"));
  assert(manual.includes("NUNCA como um item à parte"));
  assert(buildPhotosAndItemsPrompt([W("pão com manteiga")], null).includes("nunca partas um alimento escrito em vários itens"));
});

// ── O caminho completo, com o Gemini simulado ───────────────────────────────
function geminiReply(items: Record<string, unknown>[]) {
  const text = JSON.stringify({ items, cooking_facts: [], questions: [] });
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } }), {
    status: 200, headers: { "content-type": "application/json" },
  });
}
const g = (name: string, grams: number, kcal: number, extra: Record<string, unknown> = {}) =>
  ({ name, estimated_quantity_grams: grams, calories_per_100g: kcal, protein_per_100g: 5, carbs_per_100g: 20, fat_per_100g: 3, ...extra });

async function withGemini<T>(replies: Response[], fn: (calls: string[]) => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = ((_url: string | URL | Request, init?: RequestInit) => {
    calls.push(String(init?.body ?? ""));
    const r = replies.shift();
    return Promise.resolve(r ?? new Response("{}", { status: 500 }));
  }) as typeof fetch;
  try {
    return await fn(calls);
  } finally {
    globalThis.fetch = original;
  }
}

Deno.test("analyzeManualItems: um extra e um composto partido gravam-se; o desencontro regista-se", async () => {
  const logs: Record<string, unknown>[] = [];
  const r = await withGemini([geminiReply([g("Pão", 60, 250), g("Manteiga", 10, 720), g("Café", 200, 2), g("Azeite", 5, 900)])], () =>
    analyzeManualItems([W("pão com manteiga"), W("café", 150)], null, "k", Number.POSITIVE_INFINITY, "", (m) => logs.push(m)));
  assertEquals(r.items.map((x) => [x.name, x.quantity_grams]), [["pão com manteiga", 70], ["café", 150]]);
  assertEquals(logs.length, 1);
  assertEquals([logs[0].requested, logs[0].returned, logs[0].combined, logs[0].outcome], [2, 4, 1, "emparelhado"]);
  assertEquals(logs[0].extras, ["Azeite"]);
});

Deno.test("analyzeManualItems: um item a menos refaz-se numa chamada curta só com esse", async () => {
  const logs: Record<string, unknown>[] = [];
  const r = await withGemini([geminiReply([g("Arroz", 150, 130), g("Salada", 80, 20)]), geminiReply([g("Frango grelhado", 160, 165)])], async (calls) => {
    const out = await analyzeManualItems([W("arroz"), W("frango grelhado"), W("salada")], null, "k", Number.POSITIVE_INFINITY, "", (m) => logs.push(m));
    assertEquals(calls.length, 2);
    assert(calls[1].includes("frango grelhado") && !calls[1].includes('\\"arroz\\"'), "a segunda chamada só pede o que falta");
    return out;
  });
  assertEquals(r.items.map((x) => x.name), ["arroz", "frango grelhado", "salada"]);
  assertEquals(r.items[1].calories_per_100g, 165);
  assertEquals(logs[0].outcome, "refeitos");
});

Deno.test("analyzeManualItems: se a chamada curta também falhar, ou não houver tempo, falha como antes — e regista «falhou»", async () => {
  const logs: Record<string, unknown>[] = [];
  const report = (m: Record<string, unknown>) => logs.push(m);
  // A chamada curta volta com nomes sem nada em comum: não se emparelham pela ordem.
  await withGemini([geminiReply([g("Arroz", 150, 130)]), geminiReply([g("Outra coisa", 10, 10), g("Mais outra", 10, 10)])], async () => {
    await assertRejects(() => analyzeManualItems([W("arroz"), W("frango")], null, "k", Number.POSITIVE_INFINITY, "", report));
  });
  await withGemini([geminiReply([g("Arroz", 150, 130)]), new Response("{}", { status: 400 })], async () => {
    await assertRejects(() => analyzeManualItems([W("arroz"), W("frango")], null, "k", Number.POSITIVE_INFINITY, "", report));
  });
  assertEquals(logs.map((m) => m.outcome), ["falhou", "falhou"]);
  // Sem tempo para a chamada curta: nem se tenta.
  await withGemini([geminiReply([g("Arroz", 150, 130)])], async (calls) => {
    const deadline = Date.now() + 2000; // abaixo da margem de hasTimeFor
    await assertRejects(() => analyzeManualItems([W("arroz"), W("frango")], null, "k", deadline), Error, "não devolveu todos os alimentos");
    assertEquals(calls.length, 1);
  });
});

Deno.test("analyzePhotosWithItems: um escrito em falta refaz-se só de texto, sem refazer as fotos", async () => {
  const logs: Record<string, unknown>[] = [];
  const r = await withGemini([
    geminiReply([g("Bife", 180, 200, { source_index: 0 }), g("Café", 200, 2, { source_index: 1 })]),
    geminiReply([g("Pão", 60, 260)]),
  ], async (calls) => {
    const out = await analyzePhotosWithItems(["aGk="], "image/jpeg", [W("café"), W("pão")], null, "k", Number.POSITIVE_INFINITY, "", (m) => logs.push(m));
    assertEquals(calls.length, 2);
    assert(!calls[1].includes("inline_data"), "a chamada curta não leva as fotos");
    return out;
  });
  assertEquals(r.items.map((x) => x.name), ["Bife", "café", "pão"]);
  assertEquals(logs[0].outcome, "refeitos");
});

Deno.test("analyzePhotosWithItems: se a recuperação falhar, regista «falhou»", async () => {
  const logs: Record<string, unknown>[] = [];
  await withGemini([geminiReply([g("Bife", 180, 200, { source_index: 0 })]), new Response("{}", { status: 400 })], async () => {
    await assertRejects(() =>
      analyzePhotosWithItems(["aGk="], "image/jpeg", [W("pão")], null, "k", Number.POSITIVE_INFINITY, "", (m) => logs.push(m)));
  });
  assertEquals(logs.map((m) => m.outcome), ["falhou"]);
});

// Revisão do 8783bc20: com o mesmo número de itens, a ordem não vale quando
// um item é, pelo nome, de outro escrito.
Deno.test("alignItems: [pão, ovos] ← [Ovos, Pão] — pelo nome, não pela ordem", () => {
  const a = alignItems([it("Ovos mexidos", 120, 150), it("Pão", 60, 250)], [W("pão"), W("ovos")]);
  assertEquals(a.items.map((x) => x?.name), ["Pão", "Ovos mexidos"]);
  assertEquals(a.pairs, [["Pão", "pão"], ["Ovos mexidos", "ovos"]]);
  // Os nomes iguais pela ordem certa, ou sem nada em comum com ninguém: a ordem fica.
  assertEquals(alignItems([it("Pão", 60), it("Ovos", 120)], [W("pão"), W("ovos")]).items.map((x) => x?.name), ["Pão", "Ovos"]);
  assertEquals(alignItems([it("Pão de trigo", 60), it("Galão", 200)], [W("pão"), W("café")]).items.map((x) => x?.name), ["Pão de trigo", "Galão"]);
  // Repetidos no lugar deles: «ovo», «ovo».
  assertEquals(alignItems([it("Ovo", 50), it("Ovo", 55)], [W("ovo"), W("ovo")]).items.map((x) => x?.quantity_grams), [50, 55]);
});

Deno.test("alignPhotoAndWritten: um alimento com o source_index de outro escrito vai para o dele", () => {
  const raw = [{ ...it("Ovos mexidos", 120, 150), source_index: 1 }, { ...it("Pão", 60, 250), source_index: 2 }];
  const merged = mergePhotoAndWrittenItems(raw, [W("pão"), W("ovos")])!;
  assertEquals(merged.map((x) => [x.name, x.calories_per_100g]), [["pão", 250], ["ovos", 150]]);
  // Sem nada em comum com nenhum escrito, fica no índice que trouxe.
  assertEquals(mergePhotoAndWrittenItems([{ ...it("Galão", 200, 50), source_index: 1 }], [W("café")])!.map((x) => x.calories_per_100g), [50]);
});

// Revisão do 9583d6c3 (bloqueante): só se sai da ordem numa troca real, e no
// emparelhamento por nome o mesmo nome (ou o do seu lugar) vem primeiro.
Deno.test("revisão 9583d6c3: [hambúrguer, batatas] ← [Burger com batatas, Batatas fritas] fica pela ordem", () => {
  const a = alignItems([it("Burger com batatas", 350, 260), it("Batatas fritas", 150, 310)], [W("hambúrguer"), W("batatas")]);
  assertEquals(a.items.map((x) => x?.name), ["Burger com batatas", "Batatas fritas"]);
  const b = alignItems([it("Bife com arroz", 300, 180), it("Arroz branco", 150, 130)], [W("bitoque"), W("arroz")]);
  assertEquals(b.items.map((x) => x?.name), ["Bife com arroz", "Arroz branco"]);
  // Com um item a mais, as batatas são as do lugar delas; o hambúrguer refaz-se.
  const c = alignItems([it("Burger com batatas", 350, 260), it("Batatas fritas", 150, 310), it("Ketchup", 15, 100)], [W("hambúrguer"), W("batatas")]);
  assertEquals(c.items.map((x) => x?.name ?? null), [null, "Batatas fritas"]);
});

Deno.test("revisão 9583d6c3: [pão, pão de queijo] ← [Pão de queijo, Pão] — o mesmo nome ganha ao contido", () => {
  const a = alignItems([it("Pão de queijo", 80, 330), it("Pão", 60, 250)], [W("pão"), W("pão de queijo")]);
  assertEquals(a.items.map((x) => x?.name), ["Pão", "Pão de queijo"]);
  // Também com um item a mais.
  const b = alignItems([it("Pão de queijo", 80, 330), it("Manteiga", 10, 720), it("Pão", 60, 250)], [W("pão"), W("pão de queijo")]);
  assertEquals(b.items.map((x) => x?.name), ["Pão", "Pão de queijo"]);
  assertEquals(b.extras.map((x) => x.name), ["Manteiga"]);
});

Deno.test("revisão 9583d6c3, fotos: o índice só muda numa troca real; prefere um escrito livre", () => {
  // «Burger com batatas» com o índice do hambúrguer fica no hambúrguer.
  const burger = mergePhotoAndWrittenItems(
    [{ ...it("Burger com batatas", 350, 260), source_index: 1 }, { ...it("Batatas fritas", 150, 310), source_index: 2 }],
    [W("hambúrguer"), W("batatas")],
  )!;
  assertEquals(burger.map((x) => [x.name, x.calories_per_100g]), [["hambúrguer", 260], ["batatas", 310]]);
  // Trocados: cada um vai para o seu.
  const queijo = mergePhotoAndWrittenItems(
    [{ ...it("Pão de queijo", 80, 330), source_index: 1 }, { ...it("Pão", 60, 250), source_index: 2 }],
    [W("pão"), W("pão de queijo")],
  )!;
  assertEquals(queijo.map((x) => [x.name, x.calories_per_100g]), [["pão", 250], ["pão de queijo", 330]]);
  // Dois escritos com o mesmo nome: o item com o índice errado vai para o livre.
  const ovos = alignPhotoAndWritten(
    [{ ...it("Ovo", 50, 150), source_index: 1 }, { ...it("Ovo", 55, 150), source_index: 3 }],
    [W("ovo"), W("ovo"), W("pão")],
  );
  assertEquals(ovos.items.map((x) => x?.quantity_grams ?? null), [50, 55, null]);
  // A manteiga com o índice do «pão com manteiga» junta-se a ele.
  const pm = mergePhotoAndWrittenItems(
    [{ ...it("Pão", 60, 250), source_index: 1 }, { ...it("Manteiga", 10, 720), source_index: 1 }],
    [W("pão com manteiga")],
  )!;
  assertEquals(pm.map((x) => x.quantity_grams), [70]);
});

// Revisão do 23684d82: nas fotos, um item sem nada em comum com o escrito do
// seu índice e que é, pelo nome, de outro escrito já servido, fica de fora.
Deno.test("revisão 23684d82, fotos: [ovo, pão, ovo] ← Ovo@1, Ovo@2, Ovo@3 — o pão não fica com o ovo, refaz-se", () => {
  const a = alignPhotoAndWritten(
    [{ ...it("Ovo", 50, 150), source_index: 1 }, { ...it("Ovo", 52, 150), source_index: 2 }, { ...it("Ovo", 55, 150), source_index: 3 }],
    [W("ovo"), W("pão"), W("ovo")],
  );
  assertEquals(a.items.map((x) => x?.quantity_grams ?? null), [50, null, 55]);
  assertEquals(mergePhotoAndWrittenItems(
    [{ ...it("Ovo", 50, 150), source_index: 1 }, { ...it("Ovo", 52, 150), source_index: 2 }, { ...it("Ovo", 55, 150), source_index: 3 }],
    [W("ovo"), W("pão"), W("ovo")],
  ), null);
});

Deno.test("revisão 23684d82, fotos: só o mesmo nome tira um item do seu índice; uma palavra em comum, não", () => {
  // «Burger com batatas» no índice do hambúrguer fica (o caso aprovado no 23684d82).
  const a = alignPhotoAndWritten(
    [{ ...it("Burger com batatas", 350, 260), source_index: 1 }, { ...it("Batatas fritas", 150, 310), source_index: 2 }],
    [W("hambúrguer"), W("batatas")],
  );
  assertEquals(a.items.map((x) => x?.name), ["Burger com batatas", "Batatas fritas"]);
  // Sem nada em comum com ninguém, fica no índice que trouxe (como antes).
  assertEquals(alignPhotoAndWritten([{ ...it("Galão", 200, 50), source_index: 1 }], [W("café")]).items[0]?.name, "Galão");
  // O mesmo nome de outro escrito já servido: fora.
  const cafe = alignPhotoAndWritten([{ ...it("Café", 200, 2), source_index: 2 }, { ...it("Café", 210, 2), source_index: 1 }], [W("tosta"), W("café")]);
  assertEquals(cafe.items.map((x) => x?.quantity_grams ?? null), [null, 200]);
});
