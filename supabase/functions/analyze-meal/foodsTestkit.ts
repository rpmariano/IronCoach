// Só para os testes das variantes (bug #87): um Supabase falso em memória com
// o subconjunto do PostgREST que variants.ts, learnFromMeal e o
// runSavePantryFood usam sobre athlete_foods/athlete_food_rules. Gera ids,
// respeita o unique (user_id, name_key) nos upserts e regista as escritas.
// Também as refeições do registo revisto (#106, 2026-11-07): insert com
// .single(), delete, o unique (user_id, client_request_id) e o storage.

type Row = Record<string, unknown>;
type Filter = [op: string, col: string, val: unknown];

export class FakeFoodsDb {
  tables: Record<string, Row[]> = { athlete_foods: [], athlete_food_rules: [] };
  writes: { table: string; op: string; payload: unknown }[] = [];
  /** Como o trigger da migração: devolve a mensagem de erro para recusar um update. */
  updateError: ((row: Row, patch: Row) => string | null) | null = null;
  private seq = 0;
  nextId = () => `id-${++this.seq}`;
  /** O storage: os caminhos que subiram e os que saíram. */
  uploads: string[] = [];
  removed: string[] = [];
  storage = {
    from: (_bucket: string) => ({
      upload: (path: string, _bytes: unknown, _o?: unknown) => {
        this.uploads.push(path);
        return Promise.resolve({ error: null });
      },
      remove: (paths: string[]) => {
        this.removed.push(...paths);
        return Promise.resolve({ error: null });
      },
    }),
  };

  from(table: string) {
    return new FakeQuery(this, table);
  }
}

class FakeQuery {
  private filters: Filter[] = [];
  private op: "select" | "upsert" | "update" | "insert" | "delete" = "select";
  private payload: Row | Row[] | null = null;
  private one = false;
  private returning = false;
  private orders: [string, boolean][] = [];
  private lim: number | null = null;
  // Embutidos (ex.: "coach_plan_items(kind)"): a tabela filha e a chave para o pai.
  private embeds: { table: string; fk: string }[] = [];

  constructor(private db: FakeFoodsDb, private table: string) {}

  select(cols?: string) {
    if (this.op !== "select") this.returning = true;
    for (const m of (cols || "").matchAll(/(\w+)\(/g)) {
      this.embeds.push({ table: m[1], fk: m[1] === "coach_plan_items" ? "plan_id" : `${this.table.replace(/s$/, "")}_id` });
    }
    return this;
  }
  upsert(rows: Row | Row[], _o?: unknown) {
    this.op = "upsert";
    this.payload = rows;
    return this;
  }
  insert(rows: Row | Row[]) {
    this.op = "insert";
    this.payload = rows;
    return this;
  }
  update(patch: Row) {
    this.op = "update";
    this.payload = patch;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  private f(op: string, c: string, v: unknown) {
    this.filters.push([op, c, v]);
    return this;
  }
  eq(c: string, v: unknown) { return this.f("eq", c, v); }
  neq(c: string, v: unknown) { return this.f("neq", c, v); }
  in(c: string, v: unknown[]) { return this.f("in", c, v); }
  not(c: string, _is: string, _v: unknown) { return this.f("notnull", c, null); }
  gt(c: string, v: unknown) { return this.f("gt", c, v); }
  gte(c: string, v: unknown) { return this.f("gte", c, v); }
  lt(c: string, v: unknown) { return this.f("lt", c, v); }
  lte(c: string, v: unknown) { return this.f("lte", c, v); }
  like(c: string, v: string) { return this.f("like", c, v); }
  order(c?: string, o?: { ascending?: boolean }) {
    if (c) this.orders.push([c, o?.ascending !== false]);
    return this;
  }
  limit(n?: number) {
    this.lim = typeof n === "number" ? n : null;
    return this;
  }
  maybeSingle() {
    this.one = true;
    return this;
  }
  single() {
    this.one = true;
    return this;
  }

  private match(r: Row) {
    return this.filters.every(([op, c, v]) =>
      op === "eq" ? r[c] === v
        : op === "neq" ? r[c] !== v
        : op === "in" ? (v as unknown[]).includes(r[c])
        : op === "notnull" ? r[c] != null
        : op === "gt" ? r[c] != null && String(r[c]) > String(v)
        : op === "gte" ? r[c] != null && String(r[c]) >= String(v)
        : op === "lt" ? r[c] != null && String(r[c]) < String(v)
        : op === "lte" ? r[c] != null && String(r[c]) <= String(v)
        : op === "like" ? new RegExp(`^${String(v).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*")}$`).test(String(r[c] ?? ""))
        : false
    );
  }

  private run() {
    const rows = (this.db.tables[this.table] ??= []);
    if (this.op === "select") {
      let out = rows.filter((r) => this.match(r)).map((r) => ({ ...r }));
      for (const [c, asc] of [...this.orders].reverse()) {
        out = [...out].sort((a, b) => (String(a[c] ?? "") < String(b[c] ?? "") ? -1 : String(a[c] ?? "") > String(b[c] ?? "") ? 1 : 0) * (asc ? 1 : -1));
      }
      if (this.lim != null) out = out.slice(0, this.lim);
      for (const e of this.embeds) {
        const kids = this.db.tables[e.table] ?? [];
        out = out.map((r) => ({ ...r, [e.table]: kids.filter((k) => k[e.fk] === r.id).map((k) => ({ ...k })) }));
      }
      return { data: this.one ? (out[0] ?? null) : out, error: null };
    }
    this.db.writes.push({ table: this.table, op: this.op, payload: this.payload });
    if (this.op === "delete") {
      this.db.tables[this.table] = rows.filter((r) => !this.match(r));
      return { data: null, error: null };
    }
    if (this.op === "update") {
      const hits = rows.filter((r) => this.match(r));
      for (const r of hits) {
        const refused = this.db.updateError?.(r, this.payload as Row);
        if (refused) return { data: null, error: { message: refused } };
      }
      for (const r of hits) Object.assign(r, this.payload);
      return { data: null, error: null };
    }
    const list = Array.isArray(this.payload) ? this.payload : [this.payload!];
    const saved: Row[] = [];
    for (const p of list) {
      // O unique de client_request_id (idempotência): a 2.ª tentativa bate nele.
      if (this.op === "insert" && p.client_request_id != null &&
        rows.some((r) => r.user_id === p.user_id && r.client_request_id === p.client_request_id)) {
        return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
      }
      // O unique (user_id, name_key) é só dos alimentos da despensa.
      const hit = p.name_key !== undefined ? rows.find((r) => r.user_id === p.user_id && r.name_key === p.name_key) : undefined;
      if (hit) Object.assign(hit, p);
      else rows.push({ id: this.db.nextId(), parent_id: null, variant_label: null, created_at: new Date().toISOString(), ...p });
      saved.push({ ...(hit ?? rows.at(-1)!) });
    }
    return { data: this.returning ? (this.one ? (saved[0] ?? null) : saved) : null, error: null };
  }

  then<T>(resolve: (v: ReturnType<FakeQuery["run"]>) => T) {
    return Promise.resolve(resolve(this.run()));
  }
}
