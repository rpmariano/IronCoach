// O que o formulário de ginásio manda já estruturado — séries (força e
// cardio) e o objetivo por exercício — e a atualização do Armário de
// Exercícios. Registo unificado, F1 (specs/plano-registo-plano-coach.md §2.2,
// §2.5). Separado de index.ts para se testar sem o Deno.serve.

import { buildLockerUpserts, type LockerExisting, type LockerMeta, type LockerSetRow } from "../_shared/formulas/exerciseLocker.ts";
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
      duration_seconds: duration !== null ? Math.round(duration) : null,
      distance_km: positiveOrNull(s?.distance_km, 1000),
      laps: laps !== null ? Math.round(laps) : null,
    };
    // A edição antiga mandava sempre reps/weight (podia ser 0); só se descarta
    // uma linha que não traga nada — mesmo comportamento de antes para a força.
    if (row.reps === null && row.weight === null && row.duration_seconds === null && row.distance_km === null && row.laps === null) return;
    rows.push(row);
  });
  return rows;
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
    });
  }
  return out.length ? out : null;
}

/** Atualiza o Armário com as séries desta sessão. Best-effort: um erro fica
 *  no log e o registo segue — o Armário é uma conveniência, não o registo. */
export async function updateExerciseLocker(
  // deno-lint-ignore no-explicit-any
  sb: any,
  args: { userId: string; sessionDate: string; sessionCategories: string[]; sets: LockerSetRow[]; meta?: LockerMeta[] | null; increment: boolean },
): Promise<void> {
  try {
    const keys = [...new Set(args.sets.map((s) => foodKey(s?.exercise_name)).filter(Boolean))];
    if (!keys.length) return;
    const { data: existing, error: readErr } = await sb
      .from("athlete_exercises")
      .select("name_key, name, category, block_type, cardio_fields, machine_settings, last_weight, last_reps, personal_record_weight, times_performed, last_performed_at")
      .eq("user_id", args.userId)
      .in("name_key", keys);
    if (readErr) throw readErr;
    const rows = buildLockerUpserts({ ...args, existing: (existing ?? []) as LockerExisting[] });
    if (!rows.length) return;
    const { error: upErr } = await sb.from("athlete_exercises").upsert(rows, { onConflict: "user_id,name_key" });
    if (upErr) throw upErr;
  } catch (e) {
    console.warn("analyze-gym: Armário de Exercícios não atualizado —", e instanceof Error ? e.message : e);
  }
}
