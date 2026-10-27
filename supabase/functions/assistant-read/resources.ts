// assistant-read — o que cada `resource` devolve
// (specs/assistente-leitura-contrato.md, tabela "resource").
//
// Regra de cada leitura: .eq("user_id", ctx.userId) SEMPRE, também nas
// tabelas filhas (séries, itens) — ver o cabeçalho de handler.ts. Unidades
// nos nomes (distance_km, duration_s, weight_kg); datas como estão na BD
// (colunas date, já no dia do atleta) e timestamps convertidos para
// Europe/Lisbon.

import type { Db } from "./handler.ts";
import { prescriptionBlockTexts } from "../_shared/formulas/planPrescription.ts";

export const RESOURCES = ["summary", "workouts", "runs", "meals", "checkins", "body", "races", "goals", "plan"] as const;
export type Resource = typeof RESOURCES[number];

export interface ReadCtx {
  db: Db;
  userId: string;
  from: string;
  to: string;
  today: string;
}

type Row = Record<string, unknown>;

// O max_rows do PostgREST é 1000: lê por páginas até a última vir curta.
export const PAGE = 1000;
// Ids por .in(): o pedido vai num GET, e 100 uuids ficam bem abaixo do limite do URL.
const IN_CHUNK = 100;

// O `id` vai SEMPRE como última chave de ordenação. As chaves de cada
// leitura (date, start_time, set_index, …) repetem-se, e entre linhas
// empatadas o Postgres não garante a mesma ordem de um pedido para o
// seguinte: sem desempate único, a página 2 podia repetir linhas da 1 e
// saltar outras. Todas as tabelas lidas por aqui têm `id`.
// deno-lint-ignore no-explicit-any
async function all(build: () => any): Promise<Row[]> {
  const out: Row[] = [];
  for (let start = 0;; start += PAGE) {
    const { data, error } = await build().order("id", { ascending: true }).range(start, start + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

async function byIds(
  ctx: ReadCtx,
  table: string,
  cols: string,
  fk: string,
  ids: string[],
  order: string[],
  // deno-lint-ignore no-explicit-any
  extra: (q: any) => any = (q) => q,
): Promise<Row[]> {
  const out: Row[] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const chunk = ids.slice(i, i + IN_CHUNK);
    out.push(...await all(() => {
      let q = extra(ctx.db.from(table).select(cols).eq("user_id", ctx.userId).in(fk, chunk));
      for (const c of order) q = q.order(c, { ascending: true });
      return q;
    }));
  }
  return out;
}

/** As linhas do atleta com `date` dentro do período, ordenadas. */
function inRange(ctx: ReadCtx, table: string, cols: string, order: string[] = ["date"]) {
  return all(() => {
    let q = ctx.db.from(table).select(cols).eq("user_id", ctx.userId).gte("date", ctx.from).lte("date", ctx.to);
    for (const c of order) q = q.order(c, { ascending: true, nullsFirst: false });
    return q;
  });
}

const num = (v: unknown): number | null => (v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
const round = (v: number | null, d = 1): number | null => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);
const obj = (v: unknown): Row => (v && typeof v === "object" && !Array.isArray(v) ? v as Row : {});

/** Um timestamptz em hora de Lisboa, "YYYY-MM-DDTHH:mm:ss". */
export function lisbonDateTime(ts: unknown): string | null {
  if (typeof ts !== "string") return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).formatToParts(d).map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}

// ─── Objetivos (perfil) ───────────────────────────────────────────────────

const PROFILE_COLS =
  "display_name, calorie_goal, protein_goal, carbs_goal, fat_goal, water_goal_ml, goal_weight_kg, goal_body_fat_pct, goal_muscle_mass_kg, goal_lean_body_mass_kg, goals_target_date";

async function readProfile(ctx: ReadCtx): Promise<Row | null> {
  const { data, error } = await ctx.db.from("profiles").select(PROFILE_COLS).eq("id", ctx.userId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

function currentGoals(p: Row | null) {
  return {
    calories_kcal: num(p?.calorie_goal),
    protein_g: num(p?.protein_goal),
    carbs_g: num(p?.carbs_goal),
    fat_g: num(p?.fat_goal),
    water_ml: num(p?.water_goal_ml),
    weight_kg: num(p?.goal_weight_kg),
    body_fat_pct: num(p?.goal_body_fat_pct),
    muscle_mass_kg: num(p?.goal_muscle_mass_kg),
    lean_body_mass_kg: num(p?.goal_lean_body_mass_kg),
    target_date: (p?.goals_target_date as string | null) ?? null,
  };
}

// ─── Leitores ─────────────────────────────────────────────────────────────

const RUN_COLS =
  "id, date, start_time, name, kind, training_type, distance_km, duration_seconds, effort_rpe, notes, race_id, details";

function shapeRun(r: Row) {
  const d = obj(r.details);
  const km = num(r.distance_km), s = num(r.duration_seconds);
  return {
    id: r.id,
    date: r.date,
    start_time: r.start_time ?? null,
    name: r.name ?? null,
    kind: r.kind ?? null,
    training_type: r.training_type ?? null,
    distance_km: km,
    duration_s: s,
    pace_s_per_km: km && s ? Math.round(s / km) : null,
    avg_hr_bpm: num(d.avg_heart_rate_bpm),
    max_hr_bpm: num(d.max_heart_rate_bpm),
    elevation_gain_m: num(d.elevation_gain_m),
    calories_kcal: num(d.calories_kcal),
    cadence_spm: num(d.cadence_spm),
    effort_rpe: num(r.effort_rpe),
    race_id: r.race_id ?? null,
    notes: r.notes ?? null,
  };
}

async function readRuns(ctx: ReadCtx) {
  return (await inRange(ctx, "runs", RUN_COLS, ["date", "start_time"])).map(shapeRun);
}

async function readWorkouts(ctx: ReadCtx) {
  const sessions = await inRange(
    ctx,
    "workout_sessions",
    "id, date, start_time, name, kind, status, categories, class_types, duration_seconds, calories_kcal, avg_hr, max_hr, exertion, volume_kg, notes",
    ["date", "start_time"],
  );
  const sets = await byIds(
    ctx,
    "workout_session_sets",
    "session_id, exercise_name, set_index, reps, weight, duration_seconds, distance_km, laps",
    "session_id",
    sessions.map((s) => s.id as string),
    ["set_index", "created_at"],
  );
  const bySession = new Map<string, Map<string, Row[]>>();
  for (const st of sets) {
    const ex = bySession.get(st.session_id as string) ?? new Map<string, Row[]>();
    bySession.set(st.session_id as string, ex);
    const name = (st.exercise_name as string | null) ?? "";
    ex.set(name, [...(ex.get(name) ?? []), st]);
  }
  return sessions.map((s) => ({
    id: s.id,
    date: s.date,
    start_time: s.start_time ?? null,
    name: s.name ?? null,
    kind: s.kind ?? null,
    status: s.status ?? null,
    categories: s.categories ?? [],
    class_types: s.class_types ?? [],
    duration_s: num(s.duration_seconds),
    calories_kcal: num(s.calories_kcal),
    avg_hr_bpm: num(s.avg_hr),
    max_hr_bpm: num(s.max_hr),
    exertion: num(s.exertion),
    volume_kg: num(s.volume_kg),
    notes: s.notes ?? null,
    exercises: [...(bySession.get(s.id as string) ?? new Map<string, Row[]>()).entries()].map(([name, rows]) => ({
      name: name || null,
      sets: rows.map((r) => ({
        set_index: num(r.set_index),
        reps: num(r.reps),
        weight_kg: num(r.weight),
        duration_s: num(r.duration_seconds),
        distance_km: num(r.distance_km),
        laps: num(r.laps),
      })),
    })),
  }));
}

const MACROS = [
  ["calories_kcal", "calories_per_100g"],
  ["protein_g", "protein_per_100g"],
  ["carbs_g", "carbs_per_100g"],
  ["fat_g", "fat_per_100g"],
  ["fiber_g", "fiber_per_100g"],
] as const;

async function readMeals(ctx: ReadCtx) {
  const meals = await inRange(ctx, "meals", "id, date, meal_time, meal_type, status, notes", ["date", "meal_time"]);
  const items = await byIds(
    ctx,
    "meal_items",
    "meal_id, name, quantity_grams, calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, fiber_per_100g",
    "meal_id",
    meals.map((m) => m.id as string),
    ["created_at"],
  );
  const byMeal = new Map<string, Row[]>();
  for (const it of items) byMeal.set(it.meal_id as string, [...(byMeal.get(it.meal_id as string) ?? []), it]);

  return meals.map((m) => {
    const totals = Object.fromEntries(MACROS.map(([k]) => [k, 0])) as Record<string, number>;
    const shaped = (byMeal.get(m.id as string) ?? []).map((it) => {
      const g = num(it.quantity_grams);
      const out: Row = { name: it.name ?? null, quantity_g: g };
      for (const [k, per100] of MACROS) {
        const v = g == null || num(it[per100]) == null ? null : (g * num(it[per100])!) / 100;
        out[k] = round(v);
        if (v != null) totals[k] += v;
      }
      return out;
    });
    return {
      id: m.id,
      date: m.date,
      meal_time: m.meal_time ?? null,
      meal_type: m.meal_type ?? null,
      status: m.status ?? null,
      notes: m.notes ?? null,
      items: shaped,
      totals: Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, round(v)])),
    };
  });
}

async function readCheckins(ctx: ReadCtx) {
  // period_today fica de fora: é dado de ciclo, com consentimento próprio
  // (cycle_tracking_consent_at) que não cobre uma app de fora.
  const [checkins, water] = await Promise.all([
    inRange(ctx, "daily_checkins", "date, sleep, energy, stress, pain, pain_location"),
    inRange(ctx, "water_logs", "date, amount_ml"),
  ]);
  const days = new Map<string, Row>();
  const day = (date: string) => {
    const d = days.get(date) ?? {
      date, sleep: null, energy: null, stress: null, pain: null, pain_location: null, water_ml: 0,
    };
    days.set(date, d);
    return d;
  };
  for (const c of checkins) {
    Object.assign(day(c.date as string), {
      sleep: num(c.sleep), energy: num(c.energy), stress: num(c.stress), pain: num(c.pain),
      pain_location: c.pain_location ?? null,
    });
  }
  for (const w of water) {
    const d = day(w.date as string);
    d.water_ml = (d.water_ml as number) + (num(w.amount_ml) ?? 0);
  }
  return [...days.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

const BODY_METRICS = [
  "weight_kg", "bmi", "body_fat_pct", "skeletal_muscle_pct", "muscle_mass_kg", "body_water_pct", "protein_pct",
  "bone_mass_kg", "bmr_kcal", "visceral_fat", "subcutaneous_fat_pct", "metabolic_age", "lean_body_mass_kg",
];

async function readBody(ctx: ReadCtx) {
  const rows = await inRange(ctx, "body_assessments", `id, date, assessment_time, notes, ${BODY_METRICS.join(", ")}`, [
    "date",
    "assessment_time",
  ]);
  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    assessment_time: r.assessment_time ?? null,
    ...Object.fromEntries(BODY_METRICS.map((k) => [k, num(r[k])])),
    notes: r.notes ?? null,
  }));
}

const RACE_COLS =
  "id, date, start_time, name, race_type, location, distance_km, elevation_gain_m, status, race_priority, target_time_seconds, target_pace_seconds_per_km";

function shapeRace(r: Row, result: Row | undefined) {
  const d = obj(result?.details);
  return {
    id: r.id,
    date: r.date,
    start_time: r.start_time ?? null,
    name: r.name ?? null,
    race_type: r.race_type ?? null,
    location: r.location ?? null,
    distance_km: num(r.distance_km),
    elevation_gain_m: num(r.elevation_gain_m),
    status: r.status ?? null,
    priority: r.race_priority ?? null,
    target_time_s: num(r.target_time_seconds),
    target_pace_s_per_km: num(r.target_pace_seconds_per_km),
    result: result
      ? {
        run_id: result.id,
        distance_km: num(result.distance_km),
        duration_s: num(result.duration_seconds),
        official_time_s: num(d.official_time_seconds),
      }
      : null,
  };
}

async function readRaces(ctx: ReadCtx) {
  const [inPeriod, upcoming] = await Promise.all([
    inRange(ctx, "race_events", RACE_COLS),
    all(() =>
      ctx.db.from("race_events").select(RACE_COLS).eq("user_id", ctx.userId).gte("date", ctx.today)
        .order("date", { ascending: true })
    ),
  ]);
  const races = [...new Map([...inPeriod, ...upcoming].map((r) => [r.id as string, r])).values()]
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const runs = await byIds(
    ctx,
    "runs",
    "id, date, race_id, distance_km, duration_seconds, details",
    "race_id",
    races.map((r) => r.id as string),
    ["date"],
  );
  const byRace = new Map<string, Row>();
  for (const run of runs) {
    const prev = byRace.get(run.race_id as string);
    if (!prev || isLater(run, prev)) byRace.set(run.race_id as string, run);
  }
  return races.map((r) => shapeRace(r, byRace.get(r.id as string)));
}

// Uma prova devia ter uma corrida só, mas nada na BD o impede (uma
// importação repetida, uma corrida ligada à mão por cima de outra). Com
// várias, o resultado é a mais recente — por data e, no mesmo dia, pelo
// id — escolhida aqui de forma explícita, para a resposta não depender da
// ordem em que as linhas chegam.
function isLater(a: Row, b: Row): boolean {
  const byDate = String(a.date ?? "").localeCompare(String(b.date ?? ""));
  return byDate !== 0 ? byDate > 0 : String(a.id) > String(b.id);
}

const HISTORY_COLS = "valid_from, calorie_goal, protein_goal, carbs_goal, fat_goal, water_goal_ml, source";

function shapeHistory(h: Row) {
  return {
    valid_from: lisbonDateTime(h.valid_from),
    calories_kcal: num(h.calorie_goal),
    protein_g: num(h.protein_goal),
    carbs_g: num(h.carbs_goal),
    fat_g: num(h.fat_goal),
    water_ml: num(h.water_goal_ml),
    source: h.source ?? null,
  };
}

async function readGoals(ctx: ReadCtx) {
  // O histórico do período mais a versão que já estava em vigor no início
  // dele — sem esta, um período sem alterações vinha vazio.
  // Os limites são em hora de Lisboa: fromStart é a meia-noite local de `from`.
  const fromStart = lisbonMidnightUtc(ctx.from);
  const toEnd = lisbonMidnightUtc(addDaysIso(ctx.to, 1));
  const [profile, before, during] = await Promise.all([
    readProfile(ctx),
    ctx.db.from("profile_goal_history").select(HISTORY_COLS).eq("user_id", ctx.userId).lt("valid_from", fromStart)
      .order("valid_from", { ascending: false }).limit(1),
    all(() =>
      ctx.db.from("profile_goal_history").select(HISTORY_COLS).eq("user_id", ctx.userId).gte("valid_from", fromStart)
        .lt("valid_from", toEnd).order("valid_from", { ascending: true })
    ),
  ]);
  if (before.error) throw new Error(before.error.message);
  return {
    current: currentGoals(profile),
    history: [...(before.data ?? []), ...during].map(shapeHistory),
  };
}

function addDaysIso(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** O instante UTC da meia-noite de `date` em Lisboa (ISO). */
export function lisbonMidnightUtc(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  // Lisboa é UTC+0 ou UTC+1: experimenta as duas e fica com a que dá 00:00 local.
  for (const offsetH of [0, 1]) {
    const t = new Date(Date.UTC(y, m - 1, d) - offsetH * 3_600_000);
    if (lisbonDateTime(t.toISOString()) === `${date}T00:00:00`) return t.toISOString();
  }
  return new Date(Date.UTC(y, m - 1, d)).toISOString();
}

async function readSummary(ctx: ReadCtx) {
  const [profile, workouts, runs, meals, checkins, next] = await Promise.all([
    readProfile(ctx),
    inRange(ctx, "workout_sessions", "id"),
    inRange(ctx, "runs", "distance_km, duration_seconds"),
    inRange(ctx, "meals", "id"),
    inRange(ctx, "daily_checkins", "sleep, energy, stress, pain"),
    ctx.db.from("race_events").select(RACE_COLS).eq("user_id", ctx.userId).gte("date", ctx.today)
      .eq("status", "agendada").order("date", { ascending: true }).limit(1),
  ]);
  if (next.error) throw new Error(next.error.message);
  const avg = (k: string) => {
    const vs = checkins.map((c) => num(c[k])).filter((v): v is number => v != null);
    return vs.length ? round(vs.reduce((a, b) => a + b, 0) / vs.length) : null;
  };
  const nextRace = (next.data ?? [])[0];
  return {
    profile: { display_name: profile?.display_name ?? null, goals: currentGoals(profile) },
    totals: {
      workouts: workouts.length,
      runs: runs.length,
      run_distance_km: round(runs.reduce((a, r) => a + (num(r.distance_km) ?? 0), 0), 2),
      run_duration_s: runs.reduce((a, r) => a + (num(r.duration_seconds) ?? 0), 0),
      meals_logged: meals.length,
      checkins: checkins.length,
      checkin_avg: { sleep: avg("sleep"), energy: avg("energy"), stress: avg("stress"), pain: avg("pain") },
    },
    next_race: nextRace ? shapeRace(nextRace, undefined) : null,
  };
}

// ─── Plano (treinos planeados pela Carol Coach) ───────────────────────────
//
// Só planos 'aceite' (um 'proposto' ou 'recusado' não é o que o atleta vai
// fazer). Quando dois planos aceites cobrem a mesma data, ganha o aceite mais
// recente (accepted_at, depois id) — e ganha a data INTEIRA: se o mais
// recente diz descanso ou não tem nada nesse dia, o treino do plano antigo
// também não sai. Um plano "cobre" uma data se ela está no seu período ou se
// ele tem um item nesse dia (um item fora do período não fica órfão).
// Fora, sempre: a prescription em bruto, meal_*, execution_note (contrato);
// as notes saem como coach_notes e a prescrição só como texto (blocks).

// O resumo de um treino do plano: «Rodagem longa · 18 km», «Pernas/Glúteos · 50 min».
const RUN_LABEL: Record<string, string> = {
  continuo: "Corrida contínua", longo: "Rodagem longa", recuperacao: "Corrida de recuperação", tempo: "Treino de ritmo",
  fartlek: "Fartlek", intervalos: "Treino intervalado", subidas: "Treino de subidas", trail: "Corrida em trilho",
  tecnico: "Trilho técnico", caminhada: "Caminhada", ativacao: "Ativação pré-prova", prova: "Prova",
};
const MAX_COACH_NOTES = 600;
const kmText = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");

function planItemDescription(it: Row, cats: string[]): string {
  const label = it.kind === "ginasio"
    ? (cats.length ? cats.join("/") : "Ginásio")
    : (RUN_LABEL[String(it.training_type ?? "")] ?? "Corrida");
  const km = num(it.target_distance_km), min = num(it.target_duration_min);
  const size = km ? ` · ${kmText(km)} km` : min ? ` · ${Math.round(min)} min` : "";
  return `${label}${size}`;
}

/* O alvo de ritmo e/ou de zona, tirado do que a Carol escreveu (não há coluna
   própria): o ritmo e a zona das notes ou dos objetivos dos blocos —
   «~6:00-6:15/km», «Z2», «zona 2», «Z1-Z2». Num intervalo de zonas o segundo
   valor também tem de trazer Z/zona: «Z2 a 5:30/km», «Z2/4 séries» ou «zona 2
   a 3 vezes» são só Z2. Sem nenhum, os campos não vão. */
const PACE_RE = /(?<!\d)(\d{1,2}[:'’]\d{2})(?:\s*(?:-|–|a)\s*(\d{1,2}[:'’]\d{2}))?\s*(?:min\s*)?\/\s*km/i;
const ZONE_RE = /\b(?:Z|zona\s*)([1-5])(?:\s*(?:-|–|a|\/)\s*(?:Z|zona\s*)([1-5]))?\b/i;
export function trainingTarget(notes: string | null, blockTexts: string[]): { pace?: string; zone?: string } {
  const out: { pace?: string; zone?: string } = {};
  for (const t of [notes ?? "", ...blockTexts]) {
    const pace = PACE_RE.exec(t);
    if (pace) {
      out.pace = `${pace[1].replace(/['’]/, ":")}${pace[2] ? `-${pace[2].replace(/['’]/, ":")}` : ""}/km`;
      break;
    }
  }
  for (const t of [notes ?? "", ...blockTexts]) {
    const z = ZONE_RE.exec(t);
    if (z) {
      out.zone = z[2] && z[2] !== z[1] ? `Z${z[1]}-Z${z[2]}` : `Z${z[1]}`;
      break;
    }
  }
  return out;
}

async function readPlan(ctx: ReadCtx) {
  const plans = await all(() =>
    ctx.db.from("coach_plans").select("id, period_start, period_end, accepted_at").eq("user_id", ctx.userId)
      .eq("status", "aceite").lte("period_start", ctx.to).gte("period_end", ctx.from)
      .order("accepted_at", { ascending: true })
  );
  const items = await byIds(
    ctx,
    "coach_plan_items",
    "id, plan_id, planned_date, kind, training_type, categories, target_duration_min, target_distance_km, status, notes, prescription",
    "plan_id",
    plans.map((p) => p.id as string),
    ["planned_date"],
    (q) => q.gte("planned_date", ctx.from).lte("planned_date", ctx.to),
  );

  const itemDates = new Map<string, Set<string>>();
  for (const it of items) {
    const s = itemDates.get(it.plan_id as string) ?? new Set<string>();
    s.add(it.planned_date as string);
    itemDates.set(it.plan_id as string, s);
  }
  const covers = (p: Row, date: string) =>
    (String(p.period_start) <= date && date <= String(p.period_end)) || !!itemDates.get(p.id as string)?.has(date);
  const newer = (a: Row, b: Row) => {
    const c = String(a.accepted_at ?? "").localeCompare(String(b.accepted_at ?? ""));
    return c !== 0 ? c > 0 : String(a.id) > String(b.id);
  };
  const winnerOf = new Map<string, string>();
  const winner = (date: string) => {
    if (!winnerOf.has(date)) {
      let best: Row | null = null;
      for (const p of plans) if (covers(p, date) && (!best || newer(p, best))) best = p;
      winnerOf.set(date, best?.id as string);
    }
    return winnerOf.get(date);
  };

  return items
    .filter((it) => it.kind !== "descanso" && winner(it.planned_date as string) === it.plan_id)
    .sort((a, b) => String(a.planned_date).localeCompare(String(b.planned_date)) || String(a.id).localeCompare(String(b.id)))
    .map((it) => {
      const cats = Array.isArray(it.categories) ? (it.categories as unknown[]).filter(Boolean).map(String) : [];
      const notes = typeof it.notes === "string" && it.notes.trim() ? it.notes.trim().slice(0, MAX_COACH_NOTES) : null;
      const blocks = prescriptionBlockTexts(it.prescription).map((text) => ({ text }));
      const target = trainingTarget(notes, blocks.map((b) => b.text));
      return {
        id: it.id,
        date: it.planned_date,
        kind: it.kind,
        title: (it.training_type as string | null) || (cats.length ? cats.join(", ") : null),
        duration_min: num(it.target_duration_min),
        distance_km: num(it.target_distance_km),
        status: it.status ?? null,
        // Os detalhes do treino (2026-10-27, pedido do CoP): o resumo, os
        // blocos da prescrição, o alvo de ritmo/zona (só se houver) e as notas
        // dela para o treino. Nunca meal_*, execution_note nem medições.
        description: planItemDescription(it, cats),
        blocks,
        ...target,
        coach_notes: notes,
      };
    });
}

const READERS: Record<Resource, (ctx: ReadCtx) => Promise<unknown>> = {
  plan: readPlan,
  summary: readSummary,
  workouts: readWorkouts,
  runs: readRuns,
  meals: readMeals,
  checkins: readCheckins,
  body: readBody,
  races: readRaces,
  goals: readGoals,
};

export function readResource(resource: Resource, ctx: ReadCtx): Promise<unknown> {
  return READERS[resource](ctx);
}
