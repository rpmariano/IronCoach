// O Armário de Exercícios: o que um registo de ginásio muda no catálogo
// pessoal do atleta (athlete_exercises).
//
// @contexto Registo unificado ligado ao plano (specs/plano-registo-plano-coach.md
// §2.5, decisão 7): sem favoritos manuais — um exercício entra à primeira
// vez que é registado, com a última carga, as reps e a afinação. É daqui que
// o registo tira "da última vez: 40 kg × 10" e a pesquisa "+ Adicionar do
// Armário". Quem grava: analyze-gym, depois da sessão e das séries.
//
// Função pura: recebe as séries gravadas, o que já está no Armário para
// esses nomes, e devolve as linhas a fazer upsert (onConflict user_id,name_key).
// Regras:
//   · a chave é foodKey(nome) — "Leg Press" e "leg  press" são o mesmo;
//   · a carga e as reps são as da série MAIS PESADA da sessão (a top set);
//     o recorde só sobe;
//   · um registo de uma data anterior à última execução conhecida não
//     reescreve o "último" — só conta a vez e pode subir o recorde;
//   · `increment=false` (edição, reanálise) não conta outra vez a mesma sessão;
//   · a afinação (machine_settings) e uma categoria já conhecida nunca se
//     perdem — a afinação só muda se o registo a mandar (exercises_meta): vão sempre na linha, porque um upsert em lote põe a null as
//     colunas que faltem a uma das linhas.

import { foodKey } from "./foodKey.ts";
import { normalizeCardioFields, type CardioField } from "./cardioFields.ts";

export type LockerSetRow = {
  exercise_name: string;
  reps?: number | null;
  weight?: number | null;
  duration_seconds?: number | null;
  distance_km?: number | null;
  laps?: number | null;
};

// machine_settings: a afinação que o atleta escreveu neste registo (decisão 10). Ausente
// = não mexeu (fica a que o Armário já tinha); '' = apagou-a.
export type LockerMeta = { name: string; block_type?: string | null; machine_settings?: string | null };

export type LockerExisting = {
  name_key: string;
  name: string;
  category: string | null;
  block_type: string | null;
  cardio_fields: string[] | null;
  machine_settings: string | null;
  last_weight: number | null;
  last_reps: number | null;
  personal_record_weight: number | null;
  times_performed: number | null;
  last_performed_at: string | null;
};

export type LockerUpsert = {
  user_id: string;
  name: string;
  name_key: string;
  category: string;
  block_type: "forca" | "cardio";
  cardio_fields: CardioField[] | null;
  machine_settings: string | null;
  last_weight: number | null;
  last_reps: number | null;
  personal_record_weight: number | null;
  times_performed: number;
  last_performed_at: string;
  updated_at: string;
};

const pos = (n: unknown): number | null => (typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null);

/** O grupo do exercício: o que o Armário já sabe; senão o da sessão, se for
 *  um só; o cardio é "Cardio"; o resto, "Outro". */
function categoryFor(existing: LockerExisting | undefined, sessionCategories: string[], blockType: "forca" | "cardio"): string {
  if (existing?.category && existing.category !== "Outro") return existing.category;
  if (blockType === "cardio") return "Cardio";
  return sessionCategories.length === 1 ? sessionCategories[0] : (existing?.category || "Outro");
}

export function buildLockerUpserts(input: {
  userId: string;
  sessionDate: string; // YYYY-MM-DD
  sessionCategories: string[];
  sets: LockerSetRow[];
  meta?: LockerMeta[] | null;
  existing: LockerExisting[];
  increment: boolean;
  now?: string;
}): LockerUpsert[] {
  const now = input.now ?? new Date().toISOString();
  const performedAt = `${input.sessionDate}T12:00:00.000Z`;
  const existingByKey = new Map(input.existing.map((e) => [e.name_key, e]));
  const metaByKey = new Map((input.meta ?? []).filter((m) => m?.name).map((m) => [foodKey(m.name), m]));

  // Agrupa as séries por exercício, pela ordem em que aparecem.
  const groups = new Map<string, { name: string; sets: LockerSetRow[] }>();
  for (const s of input.sets) {
    const name = typeof s?.exercise_name === "string" ? s.exercise_name.trim().slice(0, 80) : "";
    const key = foodKey(name);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, { name, sets: [] });
    groups.get(key)!.sets.push(s);
  }

  const out: LockerUpsert[] = [];
  for (const [key, { name, sets }] of groups) {
    const prev = existingByKey.get(key);
    const metaItem = metaByKey.get(key);
    const metaType = metaItem?.block_type;
    const hasCardio = sets.some((s) => pos(s.duration_seconds) || pos(s.distance_km) || pos(s.laps));
    const hasLoad = sets.some((s) => pos(s.weight) || pos(s.reps));
    const blockType: "forca" | "cardio" = metaType === "cardio" || metaType === "forca"
      ? metaType
      : hasCardio && !hasLoad ? "cardio" : (prev?.block_type === "cardio" && !hasLoad ? "cardio" : "forca");

    // A série mais pesada; sem carga nenhuma, a de mais reps (peso do corpo).
    let top: LockerSetRow | null = null;
    for (const s of sets) {
      const w = pos(s.weight) ?? 0, r = pos(s.reps) ?? 0;
      if (!w && !r) continue;
      const tw = pos(top?.weight) ?? 0, tr = pos(top?.reps) ?? 0;
      if (!top || w > tw || (w === tw && r > tr)) top = s;
    }
    const topWeight = pos(top?.weight);
    const topReps = pos(top?.reps) != null ? Math.round(top!.reps as number) : null;

    let cardioFields: CardioField[] | null = null;
    if (blockType === "cardio") {
      const seen: string[] = [...(prev?.cardio_fields ?? [])];
      if (sets.some((s) => pos(s.duration_seconds))) seen.push("duration");
      if (sets.some((s) => pos(s.distance_km))) seen.push("distance");
      if (sets.some((s) => pos(s.laps))) seen.push("laps");
      const f = normalizeCardioFields(seen);
      cardioFields = f.length ? f : null;
    }

    // Uma sessão antiga não reescreve o "último" de uma mais recente.
    const isLatest = !prev?.last_performed_at || performedAt >= prev.last_performed_at;
    const prevPr = pos(prev?.personal_record_weight);
    const pr = topWeight != null && (prevPr == null || topWeight > prevPr) ? topWeight : prevPr;

    out.push({
      user_id: input.userId,
      name: prev?.name || name,
      name_key: key,
      category: categoryFor(prev, input.sessionCategories, blockType),
      block_type: blockType,
      cardio_fields: cardioFields,
      // A que ele escreveu agora (ou apagou); senão a que já lá estava.
      machine_settings: typeof metaItem?.machine_settings === "string"
        ? (metaItem.machine_settings.trim().slice(0, 120) || null)
        : (prev?.machine_settings ?? null),
      last_weight: isLatest ? (topWeight ?? (blockType === "cardio" ? null : prev?.last_weight ?? null)) : (prev?.last_weight ?? null),
      last_reps: isLatest ? (topReps ?? prev?.last_reps ?? null) : (prev?.last_reps ?? null),
      personal_record_weight: pr,
      times_performed: prev ? (prev.times_performed ?? 0) + (input.increment ? 1 : 0) : 1,
      last_performed_at: isLatest ? performedAt : (prev?.last_performed_at ?? performedAt),
      updated_at: now,
    });
  }
  return out;
}
