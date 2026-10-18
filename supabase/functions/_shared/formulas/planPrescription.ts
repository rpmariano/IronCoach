// A prescrição por exercício de um treino de ginásio do plano.
//
// @contexto Registo unificado ligado ao plano (specs/plano-registo-plano-coach.md
// §2.1, decisões 1, 4 e 5). A Carol propõe, por exercício, séries × reps e um
// OBJETIVO ("controlar a descida em 3 s") — nunca kg: o peso vem da última
// execução desse exercício, no registo. No cardio, os campos (tempo, km,
// voltas) dependem do exercício (cardioFields.ts).
//
// Grava-se em coach_plan_items.prescription como { blocks: [...] }.
//
// O schema da tool (propose_training_plan) não pode impor limites aos arrays
// aninhados — é o 400 do Gemini de 2026-09-05 (coach-chat, findNestedBoundedArrays).
// Os limites vivem aqui. Mesma regra de buildMealMacros: um bloco inválido
// anula a prescrição inteira (null), porque uma lista com um exercício a menos
// passaria por completa no registo. O plano grava-se na mesma, com as notes.

import { cardioSpecFor, normalizeCardioFields, type CardioField } from "./cardioFields.ts";

export const MAX_PRESCRIPTION_BLOCKS = 12;
export const MAX_SETS = 10;
export const MAX_REPS = 50;
export const MAX_NAME_LENGTH = 80;
export const MAX_GOAL_LENGTH = 200;

export type StrengthBlock = { type: "forca"; name: string; sets: number; reps: number; goal: string | null };
export type CardioBlock = {
  type: "cardio";
  name: string;
  fields: CardioField[];
  duration_min: number | null;
  distance_km: number | null;
  laps: number | null;
  goal: string | null;
};
export type PrescriptionBlock = StrengthBlock | CardioBlock;
export type Prescription = { blocks: PrescriptionBlock[] };

export type PrescriptionResult = { prescription: Prescription | null; issue: string | null };

// Decisão 5: a Carol não prescreve carga. O schema não tem campo de peso, mas
// o modelo pode escrevê-la no objetivo ("3×10 a 40 kg", "a 80% 1RM"): esse
// objetivo cai, o exercício fica. Nas notes de um treino de ginásio cai só a
// frase que a traz (stripPrescribedLoad).
export const LOAD_RE = /\d\s*(kgs?|quilos?)\b|\d\s*%\s*(d[eo]\s*)?1\s*rm\b|\b1\s*rm\b/i;

/** O texto sem as frases que prescrevem carga (kg ou %1RM). null se nada sobrar.
 *  Sem nada a tirar, devolve o texto tal e qual; a tirar, mantém as quebras de
 *  linha e os espaços das frases que ficam — uma nota em lista continua lista
 *  (revisão pré-deploy, N8). */
export function stripPrescribedLoad(text: string | null | undefined): string | null {
  if (typeof text !== "string" || !text.trim()) return null;
  if (!LOAD_RE.test(text)) return text;
  // Frases e separadores alternados: [frase, sep, frase, sep, …].
  const parts = text.split(/((?<=[.!?;])[ \t]+|\n+)/);
  let out = "";
  for (let i = 0; i < parts.length; i += 2) {
    const sentence = parts[i] ?? "";
    const sep = parts[i + 1] ?? "";
    if (!sentence.trim() || LOAD_RE.test(sentence)) continue;
    out += sentence + sep;
  }
  out = out.trim();
  return out || null;
}

function cleanText(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().replace(/\s+/g, " ");
  return t ? t.slice(0, max) : null;
}

function intIn(v: unknown, min: number, max: number): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const n = Math.round(v);
  return n >= min && n <= max ? n : null;
}

function positiveOrNull(v: unknown, max: number): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0 || v > max) return null;
  return Math.round(v * 100) / 100;
}

/**
 * Valida os blocos que o modelo mandou (prescription_blocks de um item de
 * ginásio) e devolve a prescrição a gravar. Sem blocos → null sem issue
 * (um plano antigo, ou um treino descrito só nas notes).
 */
// deno-lint-ignore no-explicit-any
export function buildPrescription(rawBlocks: any): PrescriptionResult {
  if (rawBlocks == null) return { prescription: null, issue: null };
  if (!Array.isArray(rawBlocks)) return { prescription: null, issue: "prescription_blocks não é uma lista" };
  if (rawBlocks.length === 0) return { prescription: null, issue: null };
  if (rawBlocks.length > MAX_PRESCRIPTION_BLOCKS) {
    return { prescription: null, issue: `mais de ${MAX_PRESCRIPTION_BLOCKS} exercícios` };
  }

  const blocks: PrescriptionBlock[] = [];
  for (const [i, b] of rawBlocks.entries()) {
    const n = i + 1;
    if (!b || typeof b !== "object") return { prescription: null, issue: `exercício ${n} sem forma de objeto` };
    const name = cleanText(b.name, MAX_NAME_LENGTH);
    if (!name) return { prescription: null, issue: `exercício ${n} sem nome` };
    let goal = cleanText(b.goal, MAX_GOAL_LENGTH);
    if (goal && LOAD_RE.test(goal)) goal = null;

    if (b.type === "forca") {
      const sets = intIn(b.sets, 1, MAX_SETS);
      const reps = intIn(b.reps, 1, MAX_REPS);
      if (sets == null || reps == null) {
        return { prescription: null, issue: `"${name}": séries (1-${MAX_SETS}) e reps (1-${MAX_REPS}) são obrigatórias na força` };
      }
      blocks.push({ type: "forca", name, sets, reps, goal });
    } else if (b.type === "cardio") {
      const duration_min = positiveOrNull(b.duration_min, 300);
      const distance_km = positiveOrNull(b.distance_km, 100);
      const laps = intIn(b.laps, 1, 500);
      // Os campos: os que o modelo disse, senão os do catálogo, senão tempo.
      // Um alvo dado acrescenta o seu campo — não se mostra um alvo sem campo.
      let fields = normalizeCardioFields(b.fields);
      if (fields.length === 0) fields = cardioSpecFor(name)?.fields ?? ["duration"];
      const wanted = new Set<CardioField>(fields);
      if (duration_min != null) wanted.add("duration");
      if (distance_km != null) wanted.add("distance");
      if (laps != null) wanted.add("laps");
      fields = normalizeCardioFields([...wanted]);
      blocks.push({ type: "cardio", name, fields, duration_min, distance_km, laps, goal });
    } else {
      return { prescription: null, issue: `"${name}": type tem de ser "forca" ou "cardio"` };
    }
  }
  return { prescription: { blocks }, issue: null };
}

/**
 * Uma linha legível da prescrição, para o contexto do chat:
 * "Extensões de pernas 3×12 (chegar às 12 sem falhar); Bicicleta 20 min (Z2)".
 * null sem blocos. Lê o que está gravado, sem confiar na forma.
 */
// deno-lint-ignore no-explicit-any
export function describePrescription(prescription: any): string | null {
  const blocks = Array.isArray(prescription?.blocks) ? prescription.blocks : [];
  const parts: string[] = [];
  for (const b of blocks) {
    if (!b || typeof b.name !== "string" || !b.name.trim()) continue;
    let alvo = "";
    if (b.type === "forca" && b.sets && b.reps) alvo = ` ${b.sets}×${b.reps}`;
    else if (b.type === "cardio") {
      alvo = [b.duration_min ? `${b.duration_min} min` : null, b.distance_km ? `${b.distance_km} km` : null, b.laps ? `${b.laps} voltas` : null]
        .filter(Boolean).map((s) => ` ${s}`).join("");
    }
    parts.push(`${b.name.trim()}${alvo}${typeof b.goal === "string" && b.goal.trim() ? ` (${b.goal.trim()})` : ""}`);
  }
  return parts.length ? parts.join("; ") : null;
}
