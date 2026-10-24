import { assert, assertEquals } from "jsr:@std/assert@1";
import { addDays, handler, MAX_RANGE_DAYS, RATE_LIMIT_PER_HOUR, resolveRange, sha256Hex } from "./handler.ts";
import { lisbonDateTime, lisbonMidnightUtc, PAGE, RESOURCES } from "./resources.ts";

// ─── Supabase falso ───────────────────────────────────────────────────────
// O subconjunto do PostgREST que a função usa. Regista todas as consultas
// (tabela + filtros) e todas as escritas, para os testes de isolamento e de
// só-leitura.

type Row = Record<string, unknown>;

// Baralhar com semente fixa: os testes falham (ou passam) sempre da mesma maneira.
let seed = 42;
function shuffle<T>(xs: T[]): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31;
    const j = seed % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

type Filter = [op: string, col: string, val: unknown];
interface Query { table: string; op: "select" | "insert" | "update"; filters: Filter[] }

class FakeDb {
  tables: Record<string, Row[]> = {};
  queries: Query[] = [];

  from(table: string) {
    return new Builder(this, table);
  }
}

class Builder {
  private filters: Filter[] = [];
  private op: "select" | "insert" | "update" = "select";
  private cols = "*";
  private head = false;
  private payload: Row | null = null;
  private orders: [string, boolean][] = [];
  private lim: number | null = null;
  private rng: [number, number] | null = null;
  private single = false;

  constructor(private db: FakeDb, private table: string) {}

  select(cols = "*", opts?: { head?: boolean }) {
    this.cols = cols;
    this.head = !!opts?.head;
    return this;
  }
  insert(row: Row) {
    this.op = "insert";
    this.payload = row;
    return this;
  }
  update(row: Row) {
    this.op = "update";
    this.payload = row;
    return this;
  }
  private f(op: string, col: string, val: unknown) {
    this.filters.push([op, col, val]);
    return this;
  }
  eq(c: string, v: unknown) { return this.f("eq", c, v); }
  neq(c: string, v: unknown) { return this.f("neq", c, v); }
  gte(c: string, v: unknown) { return this.f("gte", c, v); }
  lte(c: string, v: unknown) { return this.f("lte", c, v); }
  lt(c: string, v: unknown) { return this.f("lt", c, v); }
  is(c: string, v: unknown) { return this.f("is", c, v); }
  in(c: string, v: unknown[]) { return this.f("in", c, v); }
  order(c: string, o?: { ascending?: boolean }) {
    this.orders.push([c, o?.ascending !== false]);
    return this;
  }
  limit(n: number) {
    this.lim = n;
    return this;
  }
  range(a: number, b: number) {
    this.rng = [a, b];
    return this;
  }
  maybeSingle() {
    this.single = true;
    return this;
  }

  private match(r: Row): boolean {
    return this.filters.every(([op, c, v]) => {
      const x = r[c];
      switch (op) {
        case "eq": return x != null && String(x) === String(v);
        case "neq": return x == null || String(x) !== String(v);
        case "is": return v === null ? x == null : x === v;
        case "in": return (v as unknown[]).map(String).includes(String(x));
        case "gte": return x != null && String(x) >= String(v);
        case "lte": return x != null && String(x) <= String(v);
        case "lt": return x != null && String(x) < String(v);
      }
      throw new Error(`filtro não suportado: ${op}`);
    });
  }

  private run() {
    this.db.queries.push({ table: this.table, op: this.op, filters: this.filters });
    const rows = (this.db.tables[this.table] ??= []);
    if (this.op === "insert") {
      rows.push({ id: crypto.randomUUID(), at: new Date().toISOString(), ...this.payload });
      return { data: null, error: null };
    }
    if (this.op === "update") {
      for (const r of rows.filter((r) => this.match(r))) Object.assign(r, this.payload);
      return { data: null, error: null };
    }
    let out = shuffle(rows.filter((r) => this.match(r)));
    if (this.head) return { data: null, count: out.length, error: null };
    // Ordenação estável sobre linhas baralhadas: como no Postgres, as
    // empatadas em todas as chaves pedidas vêm numa ordem qualquer, diferente
    // de pedido para pedido.
    for (const [c, asc] of [...this.orders].reverse()) {
      out = [...out].sort((a, b) => (String(a[c] ?? "") < String(b[c] ?? "") ? -1 : String(a[c] ?? "") > String(b[c] ?? "") ? 1 : 0) * (asc ? 1 : -1));
    }
    if (this.rng) out = out.slice(this.rng[0], this.rng[1] + 1);
    if (this.lim != null) out = out.slice(0, this.lim);
    const cols = this.cols.split(",").map((c) => c.trim());
    const proj = (r: Row) => (this.cols === "*" ? { ...r } : Object.fromEntries(cols.map((c) => [c, r[c] ?? null])));
    if (this.single) {
      if (out.length > 1) return { data: null, error: { message: "multiple rows" } };
      return { data: out[0] ? proj(out[0]) : null, error: null };
    }
    return { data: out.map(proj), error: null };
  }

  then<T>(resolve: (v: ReturnType<Builder["run"]>) => T, reject?: (e: unknown) => T) {
    try {
      return Promise.resolve(resolve(this.run()));
    } catch (e) {
      return reject ? Promise.resolve(reject(e)) : Promise.reject(e);
    }
  }
}

// ─── Cenário: dois atletas, A e B, com dados em todas as tabelas ─────────

const A = "aaaaaaaa-0000-4000-8000-000000000001";
const B = "bbbbbbbb-0000-4000-8000-000000000002";
const TOKEN_A = "ih_" + "A".repeat(43);
const TOKEN_B = "ih_" + "B".repeat(43);
const TOKEN_REVOKED = "ih_" + "R".repeat(43);
const NOW = new Date("2026-10-24T10:00:00Z");
const DAY = "2026-10-22"; // dentro dos 7 dias por omissão
const FUTURE = "2026-12-06";

/** Linhas de um atleta. Tudo o que é de B leva "B-" no id e nos textos. */
function athleteRows(uid: string, tag: "A" | "B"): Record<string, Row[]> {
  const id = (n: string) => `${tag}-${n}`;
  return {
    profiles: [{ id: uid, display_name: `${tag}-nome`, calorie_goal: 2200, protein_goal: 140, water_goal_ml: 2500, goal_weight_kg: 70 }],
    workout_sessions: [{ id: id("ws"), user_id: uid, date: DAY, name: `${tag}-treino`, kind: "forca", status: "concluido", duration_seconds: 3600, notes: `${tag}-nota` }],
    workout_session_sets: [
      { id: id("set1"), session_id: id("ws"), user_id: uid, exercise_name: `${tag}-agachamento`, set_index: 1, reps: 8, weight: 80, created_at: "1" },
      { id: id("set2"), session_id: id("ws"), user_id: uid, exercise_name: `${tag}-agachamento`, set_index: 2, reps: 8, weight: 85, created_at: "2" },
    ],
    runs: [
      { id: id("run"), user_id: uid, date: DAY, name: `${tag}-corrida`, distance_km: 10, duration_seconds: 3000, details: { avg_heart_rate_bpm: 150 }, notes: `${tag}-nota` },
      { id: id("raceRun"), user_id: uid, date: "2026-10-19", distance_km: 21.1, duration_seconds: 6300, race_id: id("racePast"), details: { official_time_seconds: 6290 } },
    ],
    meals: [{ id: id("meal"), user_id: uid, date: DAY, meal_type: "almoco", status: "ready", notes: `${tag}-nota` }],
    meal_items: [
      { id: id("item"), meal_id: id("meal"), user_id: uid, name: `${tag}-arroz`, quantity_grams: 200, calories_per_100g: 130, protein_per_100g: 2.5, carbs_per_100g: 28, fat_per_100g: 0.3, created_at: "1" },
    ],
    daily_checkins: [{ id: id("chk"), user_id: uid, date: DAY, sleep: 4, energy: 3, stress: 2, pain: 1, pain_location: `${tag}-joelho`, period_today: true }],
    water_logs: [
      { id: id("w1"), user_id: uid, date: DAY, amount_ml: 500 },
      { id: id("w2"), user_id: uid, date: DAY, amount_ml: 250 },
    ],
    body_assessments: [{ id: id("body"), user_id: uid, date: DAY, weight_kg: 72.4, body_fat_pct: 15, notes: `${tag}-nota`, ai_summary: `${tag}-resumo` }],
    race_events: [
      { id: id("racePast"), user_id: uid, date: "2026-10-19", name: `${tag}-meia`, status: "concluida", distance_km: 21.1 },
      { id: id("raceNext"), user_id: uid, date: FUTURE, name: `${tag}-maratona`, status: "agendada", distance_km: 42.195, target_time_seconds: 12600 },
    ],
    profile_goal_history: [
      { id: 1, user_id: uid, valid_from: "2026-09-01T09:00:00Z", calorie_goal: 2000, source: "inicial" },
      { id: 2, user_id: uid, valid_from: "2026-10-20T09:00:00Z", calorie_goal: 2200, source: "proposta" },
    ],
    coach_plans: [
      { id: id("plan1"), user_id: uid, status: "aceite", period_start: "2026-10-20", period_end: "2026-10-26", accepted_at: "2026-10-19T20:00:00Z" },
      { id: id("planR"), user_id: uid, status: "recusado", period_start: "2026-10-20", period_end: "2026-10-26", accepted_at: null },
    ],
    coach_plan_items: [
      {
        id: id("pi-run"), plan_id: id("plan1"), user_id: uid, planned_date: DAY, kind: "corrida", training_type: `${tag}-Rodagem`,
        categories: null, target_duration_min: 45, target_distance_km: 8, status: "pendente",
        prescription: { warmup: "SEGREDO-prescricao" }, notes: "SEGREDO-notas", meal_suggestion: "SEGREDO-refeicao",
        meal_status: "pendente", meal_macros: { kcal: 1 }, execution_note: "SEGREDO-execucao",
      },
      { id: id("pi-rest"), plan_id: id("plan1"), user_id: uid, planned_date: "2026-10-23", kind: "descanso", status: "pendente" },
      {
        id: id("pi-gym"), plan_id: id("plan1"), user_id: uid, planned_date: "2026-10-25", kind: "ginasio", training_type: null,
        categories: ["pernas", "core"], target_duration_min: 60, target_distance_km: null, status: "pendente",
      },
      { id: id("pi-recusado"), plan_id: id("planR"), user_id: uid, planned_date: "2026-10-24", kind: "corrida", training_type: `${tag}-recusado`, status: "pendente" },
    ],
  };
}

async function scenario(): Promise<FakeDb> {
  const db = new FakeDb();
  const a = athleteRows(A, "A"), b = athleteRows(B, "B");
  for (const t of Object.keys(a)) db.tables[t] = [...b[t], ...a[t]]; // B primeiro: um filtro em falta apanhava-o logo
  db.tables.assistant_tokens = [
    { id: "tok-a", user_id: A, token_hash: await sha256Hex(TOKEN_A), revoked_at: null },
    { id: "tok-b", user_id: B, token_hash: await sha256Hex(TOKEN_B), revoked_at: null },
    { id: "tok-r", user_id: A, token_hash: await sha256Hex(TOKEN_REVOKED), revoked_at: "2026-10-23T10:00:00Z" },
  ];
  db.tables.assistant_access_log = [];
  return db;
}

function call(db: FakeDb, query: string, token: string | null = TOKEN_A, method = "GET", now = NOW) {
  const headers: Record<string, string> = {};
  if (token != null) headers.Authorization = `Bearer ${token}`;
  return handler(new Request(`https://x.supabase.co/functions/v1/assistant-read?${query}`, { method, headers }), {
    db: () => db,
    now: () => now,
  });
}

const DATA_TABLES = [
  "profiles", "workout_sessions", "workout_session_sets", "runs", "meals", "meal_items", "daily_checkins",
  "water_logs", "body_assessments", "race_events", "profile_goal_history", "coach_plans", "coach_plan_items",
];

// ─── Isolamento A/B ───────────────────────────────────────────────────────

for (const resource of RESOURCES) {
  Deno.test(`isolamento: o token de A nunca devolve dados de B (${resource})`, async () => {
    const db = await scenario();
    const res = await call(db, `resource=${resource}&from=2026-08-01&to=2026-10-24`);
    assertEquals(res.status, 200);
    const text = await res.text();
    assert(!text.includes("B-"), `${resource} devolveu dados de B: ${text}`);
    assert(text.includes("A-") || resource === "goals", `${resource} não devolveu os dados de A: ${text}`);

    // E ao contrário, o token de B só vê B.
    const resB = await call(db, `resource=${resource}&from=2026-08-01&to=2026-10-24`, TOKEN_B);
    const textB = await resB.text();
    assert(!textB.includes("A-"), `${resource} devolveu dados de A ao token de B: ${textB}`);
  });

  Deno.test(`isolamento: todas as leituras de ${resource} filtram pelo dono do token`, async () => {
    const db = await scenario();
    await call(db, `resource=${resource}&from=2026-08-01&to=2026-10-24`);
    const reads = db.queries.filter((q) => DATA_TABLES.includes(q.table));
    assert(reads.length > 0);
    for (const q of reads) {
      const owner = q.table === "profiles" ? "id" : "user_id";
      assert(
        q.filters.some(([op, c, v]) => op === "eq" && c === owner && v === A),
        `${q.table} lido sem .eq("${owner}", A): ${JSON.stringify(q.filters)}`,
      );
    }
  });
}

Deno.test("isolamento: user_id/email no pedido são ignorados — manda o token", async () => {
  const db = await scenario();
  const res = await call(db, `resource=runs&user_id=${B}&email=b@x.pt&from=2026-08-01&to=2026-10-24`);
  assertEquals(res.status, 200);
  const text = await res.text();
  assert(!text.includes("B-") && text.includes("A-run"));
});

// ─── Só leitura ───────────────────────────────────────────────────────────

Deno.test("só leitura: escreve só no registo de acessos e em last_used_at", async () => {
  const db = await scenario();
  for (const r of RESOURCES) await call(db, `resource=${r}&from=2026-08-01&to=2026-10-24`);
  const writes = db.queries.filter((q) => q.op !== "select");
  assert(writes.length > 0);
  for (const w of writes) {
    assert(
      (w.table === "assistant_access_log" && w.op === "insert") || (w.table === "assistant_tokens" && w.op === "update"),
      `escrita inesperada: ${w.op} ${w.table}`,
    );
  }
  assertEquals(db.tables.assistant_access_log.length, RESOURCES.length);
  assert(db.tables.assistant_access_log.every((l) => l.user_id === A && l.token_id === "tok-a" && l.status === 200));
  assertEquals(db.tables.assistant_tokens.find((t) => t.id === "tok-a")!.last_used_at, NOW.toISOString());
  assertEquals(db.tables.assistant_tokens.find((t) => t.id === "tok-b")!.last_used_at, undefined);
});

// ─── Autenticação ─────────────────────────────────────────────────────────

Deno.test("401: token revogado, inexistente, mal formado ou em falta — sempre a mesma resposta", async () => {
  const db = await scenario();
  const cases: (string | null)[] = [TOKEN_REVOKED, "ih_" + "Z".repeat(43), "ih_curto", "não-é-token", "", null];
  for (const t of cases) {
    const res = await call(db, "resource=summary", t);
    assertEquals(res.status, 401, `token ${t}`);
    assertEquals(await res.json(), { error: "unauthorized" });
  }
  // Sem token válido não há nada para registar nem nenhum dado lido.
  assertEquals(db.tables.assistant_access_log.length, 0);
  assert(!db.queries.some((q) => DATA_TABLES.includes(q.table)));
});

Deno.test("401: um JWT (ou outro esquema) no Authorization não serve", async () => {
  const db = await scenario();
  const res = await handler(
    new Request("https://x/functions/v1/assistant-read?resource=summary", { headers: { Authorization: `Basic ${TOKEN_A}` } }),
    { db: () => db, now: () => NOW },
  );
  assertEquals(res.status, 401);
});

Deno.test("revogar tem efeito no pedido seguinte", async () => {
  const db = await scenario();
  assertEquals((await call(db, "resource=summary")).status, 200);
  db.tables.assistant_tokens.find((t) => t.id === "tok-a")!.revoked_at = NOW.toISOString();
  assertEquals((await call(db, "resource=summary")).status, 401);
});

// ─── Pedido inválido ──────────────────────────────────────────────────────

Deno.test("400: intervalo maior que 92 dias", async () => {
  const db = await scenario();
  const from = "2026-07-01";
  const ok = await call(db, `resource=runs&from=${from}&to=${addDays(from, MAX_RANGE_DAYS - 1)}`);
  assertEquals(ok.status, 200);
  const res = await call(db, `resource=runs&from=${from}&to=${addDays(from, MAX_RANGE_DAYS)}`);
  assertEquals(res.status, 400);
  assertEquals(await res.json(), { error: "bad_request" });
  // Também só com from: o to por omissão é hoje.
  assertEquals((await call(db, "resource=runs&from=2026-01-01")).status, 400);
});

Deno.test("400: resource desconhecido ou em falta, datas inválidas, from > to, método errado", async () => {
  const db = await scenario();
  for (
    const q of [
      "resource=coach_messages", "", "resource=runs&from=2026-02-30", "resource=runs&from=24-10-2026",
      "resource=runs&from=2026-10-20&to=2026-10-10",
    ]
  ) {
    const res = await call(db, q);
    assertEquals(res.status, 400, q);
    assertEquals(await res.json(), { error: "bad_request" });
  }
  assertEquals((await call(db, "resource=runs", TOKEN_A, "POST")).status, 400);
  // Os 400 de um token válido ficam registados.
  assertEquals(db.tables.assistant_access_log.filter((l) => l.status === 400).length, 5);
});

Deno.test("período por omissão: os últimos 7 dias, a acabar hoje (Lisboa)", async () => {
  const db = await scenario();
  const body = await (await call(db, "resource=runs")).json();
  assertEquals([body.from, body.to, body.timezone], ["2026-10-18", "2026-10-24", "Europe/Lisbon"]);
  assertEquals(resolveRange(null, "2026-10-10", "2026-10-24"), { from: "2026-10-04", to: "2026-10-10" });
});

// ─── Limite de pedidos ────────────────────────────────────────────────────

function logRows(n: number, at: string, status = 200, token_id = "tok-a"): Row[] {
  return Array.from({ length: n }, (_, i) => ({ id: i, token_id, user_id: A, resource: "summary", status, at }));
}

Deno.test("429: ao fim de 120 pedidos na última hora", async () => {
  const db = await scenario();
  const recent = new Date(NOW.getTime() - 30 * 60_000).toISOString();
  db.tables.assistant_access_log = logRows(RATE_LIMIT_PER_HOUR - 1, recent);
  assertEquals((await call(db, "resource=summary")).status, 200); // o 120.º passa
  const res = await call(db, "resource=summary");
  assertEquals(res.status, 429);
  assertEquals(await res.json(), { error: "rate_limited" });
  assertEquals(db.tables.assistant_access_log.at(-1)!.status, 429);
});

Deno.test("429: o pedido recusado não conta como uso (last_used_at fica no último atendido)", async () => {
  const db = await scenario();
  const tok = db.tables.assistant_tokens.find((t) => t.id === "tok-a")!;
  tok.last_used_at = "2026-10-24T09:00:00.000Z";
  db.tables.assistant_access_log = logRows(RATE_LIMIT_PER_HOUR, new Date(NOW.getTime() - 60_000).toISOString());
  assertEquals((await call(db, "resource=summary")).status, 429);
  assertEquals(tok.last_used_at, "2026-10-24T09:00:00.000Z");
});

Deno.test("429: pedidos de há mais de uma hora, os já recusados e os de outro token não contam", async () => {
  const db = await scenario();
  const old = new Date(NOW.getTime() - 61 * 60_000).toISOString();
  const recent = new Date(NOW.getTime() - 5 * 60_000).toISOString();
  db.tables.assistant_access_log = [
    ...logRows(500, old),
    ...logRows(500, recent, 429),
    ...logRows(500, recent, 200, "tok-b"),
    ...logRows(RATE_LIMIT_PER_HOUR - 1, recent),
  ];
  assertEquals((await call(db, "resource=summary")).status, 200);
  // O de B está muito acima do limite.
  assertEquals((await call(db, "resource=summary", TOKEN_B)).status, 429);
});

// ─── Conteúdo ─────────────────────────────────────────────────────────────

const PERIOD = "from=2026-08-01&to=2026-10-24";

Deno.test("meals: itens com macros pelas gramas e totais da refeição", async () => {
  const db = await scenario();
  const { data } = await (await call(db, `resource=meals&${PERIOD}`)).json();
  assertEquals(data.length, 1);
  assertEquals(data[0].items[0], { name: "A-arroz", quantity_g: 200, calories_kcal: 260, protein_g: 5, carbs_g: 56, fat_g: 0.6, fiber_g: null });
  assertEquals(data[0].totals, { calories_kcal: 260, protein_g: 5, carbs_g: 56, fat_g: 0.6, fiber_g: 0 });
});

Deno.test("workouts: séries agrupadas por exercício, peso em kg", async () => {
  const db = await scenario();
  const { data } = await (await call(db, `resource=workouts&${PERIOD}`)).json();
  assertEquals(data[0].duration_s, 3600);
  assertEquals(data[0].exercises.length, 1);
  assertEquals(data[0].exercises[0].name, "A-agachamento");
  assertEquals(data[0].exercises[0].sets.map((s: Row) => s.weight_kg), [80, 85]);
});

Deno.test("runs: ritmo calculado e FC média dos detalhes", async () => {
  const db = await scenario();
  const { data } = await (await call(db, `resource=runs&${PERIOD}`)).json();
  const run = data.find((r: Row) => r.id === "A-run");
  assertEquals([run.distance_km, run.duration_s, run.pace_s_per_km, run.avg_hr_bpm], [10, 3000, 300, 150]);
  assert(!("details" in run) && !("coach_notes" in run));
});

Deno.test("checkins: água somada por dia, sem dados de ciclo", async () => {
  const db = await scenario();
  const { data } = await (await call(db, `resource=checkins&${PERIOD}`)).json();
  assertEquals(data, [{ date: DAY, sleep: 4, energy: 3, stress: 2, pain: 1, pain_location: "A-joelho", water_ml: 750 }]);
});

Deno.test("body: sem o resumo gerado pela IA", async () => {
  const db = await scenario();
  const { data } = await (await call(db, `resource=body&${PERIOD}`)).json();
  assertEquals(data[0].weight_kg, 72.4);
  assert(!JSON.stringify(data).includes("resumo"));
});

Deno.test("races: as do período com resultado e as futuras mesmo fora do período", async () => {
  const db = await scenario();
  const { data } = await (await call(db, "resource=races&from=2026-10-18&to=2026-10-24")).json();
  assertEquals(data.map((r: Row) => r.id), ["A-racePast", "A-raceNext"]);
  assertEquals(data[0].result, { run_id: "A-raceRun", distance_km: 21.1, duration_s: 6300, official_time_s: 6290 });
  assertEquals(data[1].result, null);
});

Deno.test("races: com várias corridas na mesma prova, o resultado é a mais recente (data, depois id)", async () => {
  const db = await scenario();
  const extra = (id: string, date: string, s: number) => ({ id, user_id: A, date, distance_km: 21.1, duration_seconds: s, race_id: "A-racePast" });
  db.tables.runs.push(extra("A-raceRun-0", "2026-10-18", 7000), extra("A-raceRun-z", "2026-10-19", 6200));
  for (let i = 0; i < 5; i++) {
    const { data } = await (await call(db, "resource=races&from=2026-10-18&to=2026-10-24")).json();
    // A-raceRun e A-raceRun-z são do mesmo dia: ganha o id maior.
    assertEquals(data[0].result.run_id, "A-raceRun-z");
  }
});

// ─── Paginação ────────────────────────────────────────────────────────────

Deno.test("paginação: mais de 1000 linhas empatadas nas chaves de ordenação, sem repetir nem saltar", async () => {
  const db = await scenario();
  const N = PAGE * 2 + 500;
  // Todas no mesmo dia e sem hora: empatadas em (date, start_time).
  db.tables.runs = Array.from({ length: N }, (_, i) => ({
    id: `A-r${String(i).padStart(5, "0")}`, user_id: A, date: DAY, start_time: null, distance_km: 1, duration_seconds: 300,
  }));
  // Uma refeição com mais de 1000 itens, todos com o mesmo created_at.
  db.tables.meal_items = Array.from({ length: PAGE + 300 }, (_, i) => ({
    id: `A-i${String(i).padStart(5, "0")}`, meal_id: "A-meal", user_id: A, name: `A-item-${i}`, quantity_grams: 1, created_at: "1",
  }));

  const runs = (await (await call(db, `resource=runs&${PERIOD}`)).json()).data;
  assertEquals(runs.length, N);
  assertEquals(new Set(runs.map((r: Row) => r.id)).size, N);

  const meals = (await (await call(db, `resource=meals&${PERIOD}`)).json()).data;
  assertEquals(meals[0].items.length, PAGE + 300);
  assertEquals(new Set(meals[0].items.map((it: Row) => it.name)).size, PAGE + 300);
});

Deno.test("goals: objetivos atuais e histórico do período com a versão em vigor no início", async () => {
  const db = await scenario();
  const { data } = await (await call(db, "resource=goals&from=2026-10-01&to=2026-10-24")).json();
  assertEquals(data.current.calories_kcal, 2200);
  assertEquals(data.history.map((h: Row) => h.valid_from), ["2026-09-01T10:00:00", "2026-10-20T10:00:00"]);
});

Deno.test("summary: nome, objetivos, totais do período e próxima prova", async () => {
  const db = await scenario();
  const { data } = await (await call(db, "resource=summary")).json();
  assertEquals(data.profile.display_name, "A-nome");
  assertEquals(data.totals.workouts, 1);
  assertEquals([data.totals.runs, data.totals.run_distance_km, data.totals.run_duration_s], [2, 31.1, 9300]);
  assertEquals(data.totals.meals_logged, 1);
  assertEquals(data.totals.checkin_avg, { sleep: 4, energy: 3, stress: 2, pain: 1 });
  assertEquals(data.next_race.id, "A-raceNext");
});

// ─── Peças ────────────────────────────────────────────────────────────────

Deno.test("sha256Hex: o mesmo hash que encode(digest(t, 'sha256'), 'hex') no Postgres", async () => {
  assertEquals(await sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

Deno.test("lisbonMidnightUtc / lisbonDateTime: hora de verão e de inverno", () => {
  assertEquals(lisbonMidnightUtc("2026-07-01"), "2026-06-30T23:00:00.000Z");
  assertEquals(lisbonMidnightUtc("2026-12-01"), "2026-12-01T00:00:00.000Z");
  assertEquals(lisbonDateTime("2026-10-25T00:30:00Z"), "2026-10-25T01:30:00");
});

// ─── plan ─────────────────────────────────────────────────────────────────

const PLAN_PERIOD = "from=2026-10-18&to=2026-10-31";

Deno.test("plan: só planos aceites, sem descanso, título pelo training_type ou pelas categorias", async () => {
  const db = await scenario();
  const { data } = await (await call(db, `resource=plan&${PLAN_PERIOD}`)).json();
  assertEquals(data, [
    { id: "A-pi-run", date: DAY, kind: "corrida", title: "A-Rodagem", duration_min: 45, distance_km: 8, status: "pendente" },
    { id: "A-pi-gym", date: "2026-10-25", kind: "ginasio", title: "pernas, core", duration_min: 60, distance_km: null, status: "pendente" },
  ]);
});

Deno.test("plan: nunca saem prescription, notes, meal_* nem execution_note", async () => {
  const db = await scenario();
  const text = await (await call(db, `resource=plan&${PLAN_PERIOD}`)).text();
  for (const k of ["prescription", "notes", "meal_", "execution_note", "plan_id", "SEGREDO"]) {
    assert(!text.includes(k), `saiu ${k}: ${text}`);
  }
  const { data } = JSON.parse(text);
  for (const it of data) assertEquals(Object.keys(it).sort(), ["date", "distance_km", "duration_min", "id", "kind", "status", "title"]);
});

Deno.test("plan: plano recusado (e proposto) excluídos", async () => {
  const db = await scenario();
  db.tables.coach_plans.push({ id: "A-planP", user_id: A, status: "proposto", period_start: "2026-10-20", period_end: "2026-10-26" });
  db.tables.coach_plan_items.push({ id: "A-pi-prop", plan_id: "A-planP", user_id: A, planned_date: "2026-10-24", kind: "corrida", status: "pendente" });
  const { data } = await (await call(db, `resource=plan&${PLAN_PERIOD}`)).json();
  const ids = data.map((it: Row) => it.id);
  assert(!ids.includes("A-pi-recusado") && !ids.includes("A-pi-prop"), JSON.stringify(ids));
});

Deno.test("plan: datas com dois planos aceites — ganha o aceite mais recente, a data inteira", async () => {
  const db = await scenario();
  // plan2, aceite depois, cobre 22–28: no dia 22 o treino dele substitui o do
  // plan1; no 25 não tem nada, por isso o ginásio do plan1 também não sai.
  db.tables.coach_plans.push({ id: "A-plan2", user_id: A, status: "aceite", period_start: "2026-10-22", period_end: "2026-10-28", accepted_at: "2026-10-21T20:00:00Z" });
  db.tables.coach_plan_items.push(
    { id: "A-p2-gym", plan_id: "A-plan2", user_id: A, planned_date: DAY, kind: "ginasio", training_type: "Força", status: "pendente" },
    { id: "A-p2-run", plan_id: "A-plan2", user_id: A, planned_date: "2026-10-27", kind: "corrida", training_type: "Séries", status: "pendente" },
  );
  const { data } = await (await call(db, `resource=plan&${PLAN_PERIOD}`)).json();
  assertEquals(data.map((it: Row) => [it.date, it.id]), [[DAY, "A-p2-gym"], ["2026-10-27", "A-p2-run"]]);
});

Deno.test("plan: mesmo accepted_at — desempate pelo id, sempre igual", async () => {
  const db = await scenario();
  const at = db.tables.coach_plans.find((p) => p.id === "A-plan1")!.accepted_at;
  db.tables.coach_plans.push({ id: "A-plan9", user_id: A, status: "aceite", period_start: "2026-10-22", period_end: "2026-10-22", accepted_at: at });
  db.tables.coach_plan_items.push({ id: "A-p9", plan_id: "A-plan9", user_id: A, planned_date: DAY, kind: "corrida", training_type: "T9", status: "pendente" });
  for (let i = 0; i < 5; i++) {
    const { data } = await (await call(db, `resource=plan&${PLAN_PERIOD}`)).json();
    assertEquals(data.find((it: Row) => it.date === DAY).id, "A-p9"); // "A-plan9" > "A-plan1"
  }
});

Deno.test("plan: por omissão de hoje a hoje + 6, dos dois lados da meia-noite de Lisboa", async () => {
  const db = await scenario();
  const range = async (iso: string, q = "resource=plan") => {
    const b = await (await call(db, q, TOKEN_A, "GET", new Date(iso))).json();
    return [b.from, b.to];
  };
  // 24/10 ainda é hora de verão (UTC+1): 22:59:59Z = 23:59:59 em Lisboa; 23:00Z já é dia 25.
  assertEquals(await range("2026-10-24T22:59:59Z"), ["2026-10-24", "2026-10-30"]);
  assertEquals(await range("2026-10-24T23:00:00Z"), ["2026-10-25", "2026-10-31"]);
  // Inverno (UTC+0).
  assertEquals(await range("2026-12-31T23:59:59Z"), ["2026-12-31", "2027-01-06"]);
  assertEquals(await range("2027-01-01T00:00:00Z"), ["2027-01-01", "2027-01-07"]);
  // Os outros resources continuam para trás.
  assertEquals(await range("2026-10-24T23:00:00Z", "resource=runs"), ["2026-10-19", "2026-10-25"]);
  // Só um dos lados: 7 dias a partir dele.
  assertEquals(await range("2026-10-24T10:00:00Z", "resource=plan&from=2026-11-02"), ["2026-11-02", "2026-11-08"]);
  assertEquals(await range("2026-10-24T10:00:00Z", "resource=plan&to=2026-11-08"), ["2026-11-02", "2026-11-08"]);
});

Deno.test("plan: o item do dia de hoje entra por omissão; máximo de 92 dias", async () => {
  const db = await scenario();
  const { data } = await (await call(db, "resource=plan", TOKEN_A, "GET", new Date("2026-10-22T08:00:00Z"))).json();
  assertEquals(data.map((it: Row) => it.id), ["A-pi-run", "A-pi-gym"]);
  assertEquals((await call(db, `resource=plan&from=2026-10-24&to=${addDays("2026-10-24", MAX_RANGE_DAYS - 1)}`)).status, 200);
  assertEquals((await call(db, `resource=plan&from=2026-10-24&to=${addDays("2026-10-24", MAX_RANGE_DAYS)}`)).status, 400);
});

Deno.test("400 (não 500): data inválida só num dos lados", async () => {
  const db = await scenario();
  for (const q of ["resource=runs&to=2026-02-30", "resource=plan&to=2026-13-01", "resource=plan&from=x"]) {
    assertEquals((await call(db, q)).status, 400, q);
  }
});
