import { assertEquals } from "jsr:@std/assert@1";
import { findByClientRequestId, insertOnce, isMissingRequestIdColumn, parseClientRequestId } from "./idempotency.ts";

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
