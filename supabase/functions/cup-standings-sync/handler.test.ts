import { assert, assertEquals } from "jsr:@std/assert@1";
import { type HandlerDeps, makeHandler, parseEnsaioBody } from "./handler.ts";
import { Clock, GERAL_URL, httpFor, J1_URL, scenario, siteWith, T1 } from "./testkit.ts";
import { PROPRIA, SINT_EDITION } from "../_shared/formulas/cupResults.fixtures.ts";

/* Autenticação e roteamento do cup-standings-sync (fase 4, C.1 e F.2):
   cron por x-cron-secret (202 e a volta em waitUntil), admin por JWT +
   is_admin, 405 fora do POST, e o ensaio validado antes de qualquer
   pedido ao site. */

const ED = SINT_EDITION.id as string;
const URL_FN = "https://x.supabase.co/functions/v1/cup-standings-sync";

function setup(over: { edition?: Record<string, unknown>; deps?: Partial<HandlerDeps> } = {}) {
  const db = scenario({
    edition: over.edition,
    profiles: [
      { id: "u-admin", is_admin: true },
      { id: PROPRIA.userId, birth_date: PROPRIA.birth_date, gender: "F", is_admin: false },
    ],
  });
  const site = siteWith();
  const clock = new Clock(new Date(T1));
  const deps: HandlerDeps = {
    cronSecret: "segredo-do-cron",
    service: () => db,
    userFromAuth: (a) =>
      Promise.resolve(a === "Bearer admin" ? { id: "u-admin" } : a === "Bearer atleta" ? { id: PROPRIA.userId } : null),
    http: httpFor(site, clock),
    now: () => clock.now,
    ...over.deps,
  };
  const h = makeHandler(deps);
  const post = (headers: Record<string, string>, body?: unknown) =>
    h(new Request(URL_FN, { method: "POST", headers, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) }));
  return { db, site, clock, h, post };
}

async function jsonOf(res: Response): Promise<Record<string, unknown>> {
  return await res.json();
}

Deno.test("handler: sem segredo nem JWT → 401; segredo errado → 401; sem CRON_SECRET configurado → 401", async () => {
  const { post, site } = setup();
  assertEquals((await post({}, {})).status, 401);
  const errado = await post({ "x-cron-secret": "outro" }, {});
  assertEquals([errado.status, (await jsonOf(errado)).error], [401, "Não autorizado"]);
  const semSegredo = setup({ deps: { cronSecret: undefined } });
  assertEquals((await semSegredo.post({ "x-cron-secret": "" }, {})).status, 401);
  assertEquals(site.calls.length, 0);
});

Deno.test("handler: o cron certo → 202 { aceite } e a volta corre em waitUntil (sem ele, é esperada)", async () => {
  const pending: Promise<unknown>[] = [];
  const { post, db } = setup({ edition: { sync_mode: "desligado" }, deps: { waitUntil: (p) => void pending.push(p) } });
  const res = await post({ "x-cron-secret": "segredo-do-cron" });
  assertEquals([res.status, await jsonOf(res)], [202, { aceite: true }]);
  assertEquals(pending.length, 1);
  await Promise.all(pending);
  assertEquals(db.writes, []);
  // Sem waitUntil (testes): espera a volta e responde 202 na mesma.
  const s = setup();
  const r2 = await s.post({ "x-cron-secret": "segredo-do-cron" }, {});
  assertEquals(r2.status, 202);
  await r2.body?.cancel();
  assert(s.db.rows("cup_sync_state").length > 0);
});

Deno.test("handler: sem a M2, o cron faz 0 pedidos ao site e 0 escritas (nem com um corpo de ensaio); o ensaio só com o JWT de admin, e esse corre sem a M2", async () => {
  const s = setup();
  s.db.failures.push({ table: "cup_sync_state", op: "select", code: "42P01" });
  for (const body of [{}, { modo: "ensaio", jornadas: [J1_URL], geral: GERAL_URL }, { modo: "correr", edition_id: ED }]) {
    const r = await s.post({ "x-cron-secret": "segredo-do-cron" }, body);
    assertEquals(r.status, 202, JSON.stringify(body));
    await r.body?.cancel();
  }
  assertEquals([s.site.calls.length, s.db.writes.length], [0, 0]);
  // Um atleta não corre o ensaio (nem pede nada ao site).
  const atleta = await s.post({ Authorization: "Bearer atleta" }, { modo: "ensaio", jornadas: [J1_URL] });
  assertEquals([atleta.status, (await jsonOf(atleta)).error], [403, "Só para administradores."]);
  assertEquals(s.site.calls.length, 0);
  // O admin sim, sem a M2: na BD só a linha agregada em app_logs — nada que um atleta leia.
  const admin = await s.post({ Authorization: "Bearer admin" }, { modo: "ensaio", jornadas: [J1_URL], geral: GERAL_URL });
  assertEquals(admin.status, 200);
  await admin.body?.cancel();
  assertEquals(s.db.writes.map((w) => [w.table, w.op]), [["app_logs", "insert"]]);
  assertEquals(s.site.pageCalls(), 2);
});

Deno.test("handler: JWT sem sessão → 401; não-admin → 403; GET → 405; OPTIONS → CORS", async () => {
  const { post, h } = setup();
  const semSessao = await post({ Authorization: "Bearer lixo" }, { modo: "correr", edition_id: ED });
  assertEquals([semSessao.status, (await jsonOf(semSessao)).error], [401, "Sessão inválida"]);
  const atleta = await post({ Authorization: "Bearer atleta" }, { modo: "correr", edition_id: ED });
  assertEquals([atleta.status, (await jsonOf(atleta)).error], [403, "Só para administradores."]);
  const get = await h(new Request(URL_FN, { method: "GET", headers: { "x-cron-secret": "segredo-do-cron" } }));
  assertEquals(get.status, 405);
  await get.body?.cancel();
  const opt = await h(new Request(URL_FN, { method: "OPTIONS" }));
  assertEquals([opt.status, opt.headers.get("access-control-allow-methods")], [200, "POST, OPTIONS"]);
  await opt.body?.cancel();
});

Deno.test("handler: 'correr' — desligado → 409 com a frase; M2 em falta → 409; a correr → 409; edição inexistente → 404", async () => {
  const off = setup({ edition: { sync_mode: "desligado" } });
  const r = await off.post({ Authorization: "Bearer admin" }, { modo: "correr", edition_id: ED });
  assertEquals([r.status, (await jsonOf(r)).error], [409, "Liga «Observar» ou «Publicar» primeiro."]);
  assertEquals(off.site.calls.length, 0);

  const m2 = setup();
  m2.db.failures.push({ table: "cup_sync_state", op: "select", code: "42P01" });
  const r2 = await m2.post({ Authorization: "Bearer admin" }, { modo: "correr", edition_id: ED });
  assertEquals([r2.status, (await jsonOf(r2)).skipped], [409, "m2_por_aplicar"]);
  assertEquals([m2.site.calls.length, m2.db.writes.length], [0, 0]);

  const busy = setup();
  busy.db.rows("cup_sync_state").push({ edition_id: ED, target: "edicao", running_since: new Date(Date.parse(T1) - 60_000).toISOString() });
  const r3 = await busy.post({ Authorization: "Bearer admin" }, { modo: "correr", edition_id: ED });
  assertEquals([r3.status, (await jsonOf(r3)).skipped], [409, "a_correr"]);

  const none = await setup().post({ Authorization: "Bearer admin" }, { modo: "correr", edition_id: "nao-existe" });
  assertEquals(none.status, 404);
  await none.body?.cancel();
});

Deno.test("handler: 'correr' em publicar → 200 com o resumo agregado", async () => {
  const { post, site } = setup();
  const res = await post({ Authorization: "Bearer admin" }, { modo: "correr", edition_id: ED });
  assertEquals(res.status, 200);
  const body = await jsonOf(res);
  assertEquals([body.pedido, body.edition_id, body.modo, body.robots], ["correr", ED, "publicar", "livre"]);
  assertEquals((body.jornadas as { estado: string }[]).map((j) => j.estado), ["ok"]);
  assertEquals((body.geral as { estado: string }).estado, "ok");
  assertEquals(site.pageCalls(), 2);
});

Deno.test("handler: pedidos inválidos → 400 (JSON partido, modo desconhecido, edição em falta)", async () => {
  const { post } = setup();
  for (const body of ["{", { modo: "outro" }, { modo: "correr" }, { modo: "correr", edition_id: ED, round_ids: "x" }, []]) {
    const r = await post({ Authorization: "Bearer admin" }, body);
    assertEquals(r.status, 400, JSON.stringify(body));
    await r.body?.cancel();
  }
});

Deno.test("handler: ensaio com um link inválido → 400 SEM pedidos ao site; válido → 200 só com números", async () => {
  const { post, site } = setup();
  const invalidos: unknown[] = [
    { modo: "ensaio", jornadas: ["https://outro.pt/Resultados/1"] },
    { modo: "ensaio", jornadas: [GERAL_URL] },
    { modo: "ensaio", jornadas: [] },
    { modo: "ensaio", jornadas: Array(13).fill(J1_URL) },
    { modo: "ensaio", jornadas: [J1_URL], geral: J1_URL },
    { modo: "ensaio", jornadas: [J1_URL], points_table: [15, -1] },
    { modo: "ensaio", jornadas: [J1_URL], season_label: "época" },
  ];
  for (const b of invalidos) {
    const r = await post({ Authorization: "Bearer admin" }, b);
    assertEquals(r.status, 400, JSON.stringify(b));
    assert(typeof (await jsonOf(r)).error === "string");
  }
  assertEquals(site.calls.length, 0);
  const ok = await post({ Authorization: "Bearer admin" }, { modo: "ensaio", jornadas: [J1_URL], geral: GERAL_URL });
  assertEquals(ok.status, 200);
  const rep = await jsonOf(ok);
  assertEquals([rep.modo, (rep.cruzamento as unknown[]).length], ["ensaio", 1]);
});

Deno.test("handler: ensaio com o robots.txt a proibir → 409; ilegível → 502", async () => {
  const a = setup();
  a.site.robots = () => new Response("User-agent: *\nDisallow: /", { headers: { "content-type": "text/plain" } });
  const r = await a.post({ Authorization: "Bearer admin" }, { modo: "ensaio", jornadas: [J1_URL] });
  assertEquals(r.status, 409);
  await r.body?.cancel();
  assertEquals(a.site.pageCalls(), 0);
  const b = setup();
  b.site.robots = () => new Response("x", { status: 503, headers: { "content-type": "text/plain" } });
  const r2 = await b.post({ Authorization: "Bearer admin" }, { modo: "ensaio", jornadas: [J1_URL] });
  assertEquals(r2.status, 502);
  await r2.body?.cancel();
});

Deno.test("parseEnsaioBody: normaliza e aceita os opcionais", () => {
  const p = parseEnsaioBody({ jornadas: [` ${J1_URL} `], geral: GERAL_URL, points_table: [3, 2, 1], team_min_athletes: 4, season_label: "2025/26" });
  assertEquals(p, {
    ok: true,
    input: { jornadas: [J1_URL], geral: GERAL_URL, points_table: [3, 2, 1], team_min_athletes: 4, season_label: "2025/26" },
  });
});

Deno.test("handler: uma exceção inesperada → 500 genérico; na consola só o nome do erro", async () => {
  const lines: string[] = [];
  const orig = console.error;
  console.error = (...a: unknown[]) => void lines.push(a.map(String).join(" "));
  try {
    const { post } = setup({
      deps: {
        service: () => {
          throw new Error(`segredo: ${PROPRIA.pageName}`);
        },
      },
    });
    const r = await post({ Authorization: "Bearer admin" }, { modo: "correr", edition_id: ED });
    assertEquals([r.status, (await jsonOf(r)).error], [500, "Erro inesperado no servidor"]);
  } finally {
    console.error = orig;
  }
  assertEquals(lines, ["cup-standings-sync: erro inesperado Error"]);
});
