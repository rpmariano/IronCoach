import { assertEquals } from "jsr:@std/assert@1";
import { findByClientRequestId, insertOnce, isMissingRequestIdColumn, parseClientRequestId, settleReplay, SETTLE_MAX_WAIT_MS } from "./idempotency.ts";
import { mealReplayBody } from "../analyze-meal/index.ts";

// Incidente de 2026-10-31: o mesmo treino gravado 4 vezes com erros de
// comunicação. O client_request_id torna a gravação idempotente.

const ID = "3f2b8c1e-9d4a-4b7e-8f21-0a6c5e9d7b11";

// Um cliente Supabase de mentira: guarda as linhas e simula o índice único.
// deno-lint-ignore no-explicit-any
function makeSb({ withColumn = true }: { withColumn?: boolean } = {}): { sb: any; rows: any[]; inserts: any[] } {
  // deno-lint-ignore no-explicit-any
  const rows: any[] = [];
  // deno-lint-ignore no-explicit-any
  const inserts: any[] = [];
  const sb = {
    from: (_table: string) => {
      // deno-lint-ignore no-explicit-any
      const filters: Record<string, any> = {};
      // deno-lint-ignore no-explicit-any
      let pending: any = null;
      const chain = {
        select: () => chain,
        // deno-lint-ignore no-explicit-any
        eq: (k: string, v: any) => {
          filters[k] = v;
          return chain;
        },
        maybeSingle: () => {
          if (!withColumn && "client_request_id" in filters) {
            return Promise.resolve({ data: null, error: { code: "42703", message: "column runs.client_request_id does not exist" } });
          }
          const found = rows.find((r) => Object.entries(filters).every(([k, v]) => r[k] === v));
          return Promise.resolve({ data: found ?? null, error: null });
        },
        // deno-lint-ignore no-explicit-any
        insert: (row: any) => {
          pending = row;
          inserts.push(row);
          return chain;
        },
        single: () => {
          const row = pending;
          if (!withColumn && "client_request_id" in row) {
            return Promise.resolve({ data: null, error: { code: "PGRST204", message: "Could not find the 'client_request_id' column of 'runs'" } });
          }
          if (row.client_request_id && rows.some((r) => r.user_id === row.user_id && r.client_request_id === row.client_request_id)) {
            return Promise.resolve({ data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } });
          }
          const saved = { id: `r${rows.length + 1}`, ...row };
          rows.push(saved);
          return Promise.resolve({ data: saved, error: null });
        },
      };
      return chain;
    },
  };
  return { sb, rows, inserts };
}

Deno.test("parseClientRequestId: só um uuid; o resto é «cliente antigo»", () => {
  assertEquals(parseClientRequestId(ID), ID);
  assertEquals(parseClientRequestId(` ${ID.toUpperCase()} `), ID);
  assertEquals(parseClientRequestId("abc"), null);
  assertEquals(parseClientRequestId(undefined), null);
  assertEquals(parseClientRequestId(42), null);
});

Deno.test("insertOnce: a primeira grava com o id; a segunda tentativa recebe a mesma linha", async () => {
  const { sb, rows } = makeSb();
  const a = await insertOnce(sb, "runs", "u1", { user_id: "u1", name: "Rodagem" }, ID);
  assertEquals([a.data?.id, a.data?.client_request_id, a.existing], ["r1", ID, undefined]);
  // Duas tentativas em paralelo: a segunda bate no índice único e devolve a primeira.
  const b = await insertOnce(sb, "runs", "u1", { user_id: "u1", name: "Rodagem" }, ID);
  assertEquals([b.data, b.existing?.id], [undefined, "r1"]);
  assertEquals(rows.length, 1);
  // E a próxima tentativa nem chega a gravar: encontra-a antes.
  assertEquals((await findByClientRequestId(sb, "runs", "u1", ID))?.id, "r1");
  // Outro atleta com o mesmo id não a vê.
  assertEquals(await findByClientRequestId(sb, "runs", "u2", ID), null);
});

Deno.test("insertOnce: sem id (cliente antigo) grava como sempre, sempre uma linha nova", async () => {
  const { sb, rows, inserts } = makeSb();
  await insertOnce(sb, "runs", "u1", { user_id: "u1" }, null);
  await insertOnce(sb, "runs", "u1", { user_id: "u1" }, null);
  assertEquals(rows.length, 2);
  assertEquals(inserts.every((r) => !("client_request_id" in r)), true);
  assertEquals(await findByClientRequestId(sb, "runs", "u1", null), null);
});

Deno.test("insertOnce: sem a coluna (migration por aplicar) grava sem ela, nunca parte", async () => {
  const { sb, rows } = makeSb({ withColumn: false });
  const r = await insertOnce(sb, "runs", "u1", { user_id: "u1" }, ID);
  assertEquals([r.data?.id, r.error], ["r1", undefined]);
  assertEquals("client_request_id" in rows[0], false);
  assertEquals(await findByClientRequestId(sb, "runs", "u1", ID), null);
  assertEquals(isMissingRequestIdColumn({ code: "PGRST204", message: "Could not find the 'client_request_id' column" }), true);
  assertEquals(isMissingRequestIdColumn({ code: "PGRST204", message: "Could not find the 'outra' column" }), false);
});

Deno.test("as quatro funções gravam por insertOnce e procuram antes de qualquer trabalho", async () => {
  const read = (f: string) => Deno.readTextFile(new URL(`../${f}/index.ts`, import.meta.url));
  const casos: [string, string, number][] = [
    ["analyze-gym", "workout_sessions", 2],
    ["analyze-run", "runs", 2],
    ["analyze-body", "body_assessments", 3],
    ["analyze-meal", "meals", 2],
  ];
  for (const [f, table, n] of casos) {
    const src = await read(f);
    assertEquals(src.split(`insertOnce(sb, "${table}"`).length - 1, n, f);
    assertEquals(src.includes(`findByClientRequestId(sb, "${table}", userId, clientRequestId)`), true, f);
    // Nenhum insert direto de um registo novo ficou de fora.
    assertEquals(new RegExp(`from\\("${table}"\\)\\s*\\.insert\\(`).test(src), false, f);
  }
});

// Revisão de 2026-11-01: uma tentativa B pode encontrar a linha de A antes de
// as séries ou os alimentos estarem gravados — ou depois de A a desfazer.
// deno-lint-ignore no-explicit-any
function settleSb(state: { row: any | null; children: any[] }) {
  return {
    from: (table: string) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: () => Promise.resolve({ data: state.row, error: null }),
        then: (resolve: (v: unknown) => void) => resolve({ data: table === "children" ? state.children : [], error: null }),
      };
      return chain;
    },
  };
}

Deno.test("settleReplay: com filhas devolve logo; recente e sem filhas espera por elas; desfeita é gone", async () => {
  const NOW = Date.parse("2026-11-01T20:00:00Z");
  let t = NOW;
  const clock = { nowMs: () => t, sleep: (ms: number) => Promise.resolve((t += ms)) };
  const recente = { id: "s1", created_at: new Date(NOW - 3000).toISOString() };

  // Já com séries: devolve sem esperar.
  const a = await settleReplay(settleSb({ row: recente, children: [{ id: "x" }] }), "t", "s1", "children", "fk", clock);
  assertEquals(["gone" in a, t], [false, NOW]);

  // Recente e sem séries: relê; ao 2.º segundo aparecem.
  const st = { row: recente, children: [] as unknown[] };
  const sleepAndFill = (ms: number) => {
    t += ms;
    if (t - NOW >= 2000) st.children = [{ id: "y" }];
    return Promise.resolve();
  };
  const b = await settleReplay(settleSb(st), "t", "s1", "children", "fk", { nowMs: () => t, sleep: sleepAndFill });
  assertEquals("gone" in b ? null : b.children.length, 1);

  // A desfez a linha entretanto: gone.
  t = NOW;
  const st2 = { row: recente as unknown, children: [] as unknown[] };
  const c = await settleReplay(settleSb(st2), "t", "s1", "children", "fk", {
    nowMs: () => t,
    sleep: (ms: number) => { t += ms; st2.row = null; return Promise.resolve(); },
  });
  assertEquals("gone" in c, true);

  // Recente e sempre sem filhas (uma aula sem séries): ao fim da espera devolve-a.
  t = NOW;
  const d = await settleReplay(settleSb({ row: recente, children: [] }), "t", "s1", "children", "fk", clock);
  assertEquals(["gone" in d, t - NOW >= SETTLE_MAX_WAIT_MS], [false, true]);

  // Antiga e sem filhas: não espera.
  t = NOW;
  const antiga = { id: "s2", created_at: new Date(NOW - 10 * 60_000).toISOString() };
  const e = await settleReplay(settleSb({ row: antiga, children: [] }), "t", "s2", "children", "fk", clock);
  assertEquals(["gone" in e, t], [false, NOW]);
});

Deno.test("mealReplayBody: a mesma forma das duas respostas de registo — meal.meal_items (manual) e items (fotos)", () => {
  const items = [{ id: "i1", quantity_grams: 100, calories_per_100g: 250 }];
  const body = mealReplayBody({ id: "m1", date: "2026-11-01" }, items);
  assertEquals(body.items, items); // MealRegistration.jsx lê data.items no caminho das fotos
  assertEquals(body.meal.meal_items, items); // e data.meal.meal_items no manual
  assertEquals(body.replayed, true);
  assertEquals(mealReplayBody({ id: "m2" }, null).items, []);
});

Deno.test("ginásio e refeição: a resposta repetida espera pelas filhas e grava de novo uma linha desfeita", async () => {
  for (const f of ["analyze-gym", "analyze-meal"]) {
    const src = await Deno.readTextFile(new URL(`../${f}/index.ts`, import.meta.url));
    assertEquals(src.includes("await settleReplay(sb, "), true, f);
    assertEquals(src.includes("const alreadyReply = alreadySaved ? await settled(alreadySaved) : null;"), true, f);
    assertEquals(src.includes("STILL_SAVING_MESSAGE, retry: true }, 409)"), true, f);
  }
});
