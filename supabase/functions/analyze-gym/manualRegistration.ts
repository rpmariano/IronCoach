// O que o formulário de ginásio manda já estruturado — séries (força e
// cardio) e o objetivo por exercício — e a atualização do Armário de
// Exercícios. Registo unificado, F1 (specs/plano-registo-plano-coach.md §2.2,
// §2.5). Separado de index.ts para se testar sem o Deno.serve.

import { buildLockerUpserts, type LockerExisting, type LockerMeta, type LockerSetRow } from "../_shared/formulas/exerciseLocker.ts";
import { cardioSpecFor } from "../_shared/formulas/cardioFields.ts";
import { foodKey } from "../_shared/formulas/foodKey.ts";

export const MAX_SETS = 200;
export const MAX_EXERCISES_META = 30;

export type ManualSetRow = {
  exercise_name: string;
  set_index: number;
  reps: number | null;
  weight: number | null;
  one_rep_max_est: number | null;
  duration_seconds: number | null;
  distance_km: number | null;
  laps: number | null;
};

export type ExerciseMeta = {
  name: string;
  goal: string | null;
  block_type: "forca" | "cardio";
  plan_block_index: number | null;
  goal_met: boolean | null;
  // A afinação da máquina escrita neste registo (decisão 10); ausente = não mexeu.
  machine_settings?: string;
};

const finiteOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
// As colunas de cardio têm check > 0: um 0 ou um negativo é um campo vazio.
const positiveOrNull = (v: unknown, max: number): number | null => {
  const n = finiteOrNull(v);
  return n !== null && n > 0 && n <= max ? n : null;
};

/** As séries como o cliente as manda (flattenExercises), validadas. Sem
 *  nome, ou sem nenhum valor (reps, kg, tempo, distância, voltas), a linha cai. */
// deno-lint-ignore no-explicit-any
export function parseManualSets(rawSets: any): ManualSetRow[] {
  const raw = Array.isArray(rawSets) ? rawSets : [];
  const rows: ManualSetRow[] = [];
  raw.forEach((s, i) => {
    const exercise_name = typeof s?.exercise_name === "string" ? s.exercise_name.trim().slice(0, 120) : "";
    if (!exercise_name) return;
    const duration = positiveOrNull(s?.duration_seconds, 86400);
    const laps = positiveOrNull(s?.laps, 10000);
    const row: ManualSetRow = {
      exercise_name,
      set_index: Number.isFinite(Number(s?.set_index)) ? Number(s.set_index) : i,
      reps: finiteOrNull(s?.reps),
      weight: finiteOrNull(s?.weight),
      one_rep_max_est: finiteOrNull(s?.one_rep_max_est),
      duration_seconds: duration !== null && Math.round(duration) > 0 ? Math.round(duration) : null,
      distance_km: positiveOrNull(s?.distance_km, 1000),
      laps: laps !== null && Math.round(laps) > 0 ? Math.round(laps) : null,
    };
    // A edição antiga mandava sempre reps/weight (podia ser 0); só se descarta
    // uma linha que não traga nada — mesmo comportamento de antes para a força.
    if (row.reps === null && row.weight === null && row.duration_seconds === null && row.distance_km === null && row.laps === null) return;
    rows.push(row);
  });
  return rows;
}

/** As séries escritas no formulário e as lidas nos prints, juntas por
 *  exercício (foodKey): num exercício que o atleta escreveu, ganham as dele
 *  (ele viu o print, o modelo só o leu); os exercícios que só vêm do print
 *  acrescentam-se. Antes era tudo-ou-nada — escrever a prancha à mão apagava
 *  os exercícios todos do Hevy (revisão pré-deploy de 2026-10-18). */
export function mergeTypedWithRead<A extends { exercise_name: string }, B extends { exercise_name: string }>(typed: A[], read: B[]): Array<A | B> {
  const typedKeys = new Set(typed.map((r) => foodKey(r.exercise_name)));
  return [...typed, ...read.filter((r) => !typedKeys.has(foodKey(r.exercise_name)))];
}

/** O objetivo e o tipo de cada exercício (workout_sessions.exercises_meta).
 *  Nada válido → null (a coluna fica vazia, como num registo antigo). */
// deno-lint-ignore no-explicit-any
export function parseExercisesMeta(raw: any): ExerciseMeta[] | null {
  if (!Array.isArray(raw)) return null;
  const out: ExerciseMeta[] = [];
  const seen = new Set<string>();
  for (const m of raw.slice(0, MAX_EXERCISES_META)) {
    const name = typeof m?.name === "string" ? m.name.trim().slice(0, 120) : "";
    const key = foodKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const goal = typeof m?.goal === "string" && m.goal.trim() ? m.goal.trim().slice(0, 200) : null;
    const idx = Number(m?.plan_block_index);
    out.push({
      name,
      goal,
      block_type: m?.block_type === "cardio" ? "cardio" : "forca",
      plan_block_index: m?.plan_block_index != null && Number.isInteger(idx) && idx >= 0 && idx < 50 ? idx : null,
      goal_met: typeof m?.goal_met === "boolean" ? m.goal_met : null,
      ...(typeof m?.machine_settings === "string" ? { machine_settings: m.machine_settings.trim().slice(0, 120) } : {}),
    });
  }
  return out.length ? out : null;
}

/** O recorde de um exercício a partir das séries gravadas: a maior carga
 *  com um destes nomes (as grafias que o atleta usou para ele), ou null. Uma
 *  só linha por pedido — a mais pesada —, filtrada pelos nomes, para não ler
 *  o histórico todo (revisão pré-deploy, N7). */
export async function recordFromSets(
  // deno-lint-ignore no-explicit-any
  sb: any,
  userId: string,
  names: string[],
): Promise<number | null> {
  const variants = [...new Set(names.flatMap((n) => [n, n.trim(), n.toLowerCase()]).filter(Boolean))];
  if (!variants.length) return null;
  const { data, error } = await sb
    .from("workout_session_sets")
    .select("weight")
    .eq("user_id", userId)
    .in("exercise_name", variants)
    .gt("weight", 0)
    .order("weight", { ascending: false })
    .limit(1);
  if (error) throw error;
  const w = Number(data?.[0]?.weight);
  return Number.isFinite(w) && w > 0 ? w : null;
}

/** Atualiza o Armário com as séries desta sessão. Best-effort: um erro fica
 *  no log e o registo segue — o Armário é uma conveniência, não o registo. */
export async function updateExerciseLocker(
  // deno-lint-ignore no-explicit-any
  sb: any,
  args: {
    userId: string; sessionDate: string; sessionCategories: string[]; sets: LockerSetRow[]; meta?: LockerMeta[] | null; increment: boolean;
    // Numa edição: os nomes que a sessão tinha antes. Um exercício que saiu
    // (apagado ou renomeado) também pode ter de baixar o recorde.
    previousNames?: string[];
  },
): Promise<void> {
  try {
    const keys = [...new Set(args.sets.map((s) => foodKey(s?.exercise_name)).filter(Boolean))];
    const removed = [...new Set((args.previousNames ?? []).map((n) => foodKey(n)).filter((k) => k && !keys.includes(k)))];
    if (!keys.length && !removed.length) return;
    const { data: existing, error: readErr } = await sb
      .from("athlete_exercises")
      .select("name_key, name, category, block_type, cardio_fields, machine_settings, last_weight, last_reps, personal_record_weight, times_performed, last_performed_at")
      .eq("user_id", args.userId)
      .in("name_key", [...keys, ...removed]);
    if (readErr) throw readErr;
    const rows = buildLockerUpserts({ ...args, existing: (existing ?? []) as LockerExisting[] });
    // Numa edição ou reanálise (increment=false) o recorde só subia: um 400 kg
    // escrito por engano e corrigido para 40 ficava recorde para sempre
    // (revisão pré-deploy de 2026-10-18). Quando o recorde guardado passa a
    // série mais pesada desta sessão, recalcula-se das séries gravadas — que
    // nesta altura já são as novas (a edição apaga e volta a inserir antes).
    const namesFor = (key: string, lockerName?: string | null) => [
      ...(lockerName ? [lockerName] : []),
      ...args.sets.filter((s) => foodKey(s?.exercise_name) === key).map((s) => s.exercise_name),
      ...(args.previousNames ?? []).filter((n) => foodKey(n) === key),
    ];
    if (!args.increment) {
      await Promise.all(rows.map(async (row) => {
        const sessionTop = Math.max(0, ...args.sets
          .filter((s) => foodKey(s?.exercise_name) === row.name_key)
          .map((s) => (typeof s.weight === "number" && s.weight > 0 ? s.weight : 0)));
        if (row.personal_record_weight == null || row.personal_record_weight <= sessionTop) return;
        const best = await recordFromSets(sb, args.userId, namesFor(row.name_key, row.name));
        row.personal_record_weight = Math.max(best ?? 0, sessionTop) || null;
      }));
    }
    if (rows.length) {
      const { error: upErr } = await sb.from("athlete_exercises").upsert(rows, { onConflict: "user_id,name_key" });
      if (upErr) throw upErr;
    }
    // Os exercícios que saíram da sessão nesta edição: só o recorde se
    // recalcula (pelas séries que ficaram); o resto do Armário fica como está.
    const existingByKey = new Map(((existing ?? []) as LockerExisting[]).map((e) => [e.name_key, e]));
    await Promise.all(removed.map(async (key) => {
      const prev = existingByKey.get(key);
      if (!prev || prev.personal_record_weight == null) return;
      const best = await recordFromSets(sb, args.userId, namesFor(key, prev.name));
      if (best === Number(prev.personal_record_weight)) return;
      await sb.from("athlete_exercises").update({ personal_record_weight: best, updated_at: new Date().toISOString() })
        .eq("user_id", args.userId).eq("name_key", key);
    }));
  } catch (e) {
    console.warn("analyze-gym: Armário de Exercícios não atualizado —", e instanceof Error ? e.message : e);
  }
}

export type ReadSet = {
  reps: number | null;
  weight: number | null;
  one_rep_max_est: number | null;
  duration_seconds: number | null;
  distance_km: number | null;
  laps: number | null;
};
export type ReadExercise = { name: string; sets: ReadSet[] };

/** Bug #80 (2026-10-21): os exercícios lidos nos prints ao gravar. Antes cada
 *  série só tinha reps e kg — a bicicleta estacionária de 45 min e 15 km
 *  ficava "Série 1" vazia, e a distância ia só para os logs (extra_fields).
 *  Agora o cardio traz tempo, distância e voltas; uma série sem nada cai.
 *  Um exercício de cardio sem números, quando é o ÚNICO da sessão, fica com a
 *  duração da sessão (é dela que se trata); senão cai, como na leitura das
 *  observações (preview.ts). */
// deno-lint-ignore no-explicit-any
export function normalizeReadExercises(raw: any, sessionDurationSeconds: number | null = null): ReadExercise[] {
  const nonNeg = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
  const list = Array.isArray(raw) ? raw : [];
  const out: ReadExercise[] = [];
  for (const ex of list) {
    const name = String(ex?.name ?? "").trim().slice(0, 120) || "Exercício";
    const sets: ReadSet[] = [];
    for (const s of Array.isArray(ex?.sets) ? ex.sets : []) {
      const duration = positiveOrNull(s?.duration_seconds, 86400);
      const laps = positiveOrNull(s?.laps, 10000);
      const row: ReadSet = {
        reps: nonNeg(s?.reps),
        weight: nonNeg(s?.weight),
        one_rep_max_est: nonNeg(s?.one_rep_max_est),
        duration_seconds: duration !== null && Math.round(duration) > 0 ? Math.round(duration) : null,
        distance_km: positiveOrNull(s?.distance_km, 1000),
        laps: laps !== null && Math.round(laps) > 0 ? Math.round(laps) : null,
      };
      if (Object.values(row).every((v) => v === null)) continue;
      sets.push(row);
    }
    if (sets.length) out.push({ name, sets });
    else if (list.length === 1 && cardioSpecFor(name) && sessionDurationSeconds) {
      out.push({ name, sets: [{ reps: null, weight: null, one_rep_max_est: null, duration_seconds: sessionDurationSeconds, distance_km: null, laps: null }] });
    }
  }
  return out;
}
