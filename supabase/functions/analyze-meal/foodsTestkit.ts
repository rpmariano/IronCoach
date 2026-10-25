// Só para os testes das variantes (bug #87): um Supabase falso em memória com
// o subconjunto do PostgREST que variants.ts, learnFromMeal e o
// runSavePantryFood usam sobre athlete_foods/athlete_food_rules. Gera ids,
// respeita o unique (user_id, name_key) nos upserts e regista as escritas.

type Row = Record<string, unknown>;
type Filter = [op: string, col: string, val: unknown];

export class FakeFoodsDb {
  tables: Record<string, Row[]> = { athlete_foods: [], athlete_food_rules: [] };
  writes: { table: string; op: string; payload: unknown }[] = [];
  private seq = 0;
  nextId = () => `id-${++this.seq}`;

  from(table: string) {
    return new FakeQuery(this, table);
  }
}

class FakeQuery {
  private filters: Filter[] = [];
  private op: "select" | "upsert" | "update" | "insert" = "select";
  private payload: Row | Row[] | null = null;
  private single = false;
  private returning = false;

  constructor(private db: FakeFoodsDb, private table: string) {}

  select(_cols?: string) {
    if (this.op !== "select") this.returning = true;
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
  private f(op: string, c: string, v: unknown) {
    this.filters.push([op, c, v]);
    return this;
  }
  eq(c: string, v: unknown) { return this.f("eq", c, v); }
  neq(c: string, v: unknown) { return this.f("neq", c, v); }
  in(c: string, v: unknown[]) { return this.f("in", c, v); }
  not(c: string, _is: string, _v: unknown) { return this.f("notnull", c, null); }
  order() { return this; }
  limit() { return this; }
  maybeSingle() {
    this.single = true;
    return this;
  }

  private match(r: Row) {
    return this.filters.every(([op, c, v]) =>
      op === "eq" ? r[c] === v
        : op === "neq" ? r[c] !== v
        : op === "in" ? (v as unknown[]).includes(r[c])
        : op === "notnull" ? r[c] != null
        : false
    );
  }

  private run() {
    const rows = (this.db.tables[this.table] ??= []);
    if (this.op === "select") {
      const out = rows.filter((r) => this.match(r)).map((r) => ({ ...r }));
      return { data: this.single ? (out[0] ?? null) : out, error: null };
    }
    this.db.writes.push({ table: this.table, op: this.op, payload: this.payload });
    if (this.op === "update") {
      for (const r of rows.filter((r) => this.match(r))) Object.assign(r, this.payload);
      return { data: null, error: null };
    }
    const list = Array.isArray(this.payload) ? this.payload : [this.payload!];
    const saved: Row[] = [];
    for (const p of list) {
      const hit = rows.find((r) => r.user_id === p.user_id && r.name_key === p.name_key);
      if (hit) Object.assign(hit, p);
      else rows.push({ id: this.db.nextId(), parent_id: null, variant_label: null, ...p });
      saved.push({ ...(hit ?? rows.at(-1)!) });
    }
    return { data: this.returning ? saved : null, error: null };
  }

  then<T>(resolve: (v: ReturnType<FakeQuery["run"]>) => T) {
    return Promise.resolve(resolve(this.run()));
  }
}
