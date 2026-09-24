// As recomendações soltas da Carol — fórmula pura
// (specs/carol-omnisciencia-omnipresenca.md, ação 5.5, push 2).
//
// O plano de treino e as refeições sugeridas já são prescrições
// estruturadas (prescriptionAdherence.ts). O que ela recomenda na conversa,
// fora do plano — "amanhã descansa", "hoje 30 min leves", "hoje chega aos
// 140 g de proteína" — perdia-se no texto: nunca sabia se tinha sido feito.
// O chat devolve essas recomendações num campo à parte da resposta
// (RESPONSE_SCHEMA.recommendations), que o servidor valida aqui e grava em
// coach_recommendations; depois cruzam-se com o registo do dia, e o
// descanso também com o sono e a dor do check-in do dia seguinte.
//
// Fica à parte de evaluatePrescriptions de propósito: essa régua alimenta o
// índice de execução do plano (percentis, badges), e uma recomendação solta
// não é plano.

import { ADHERENCE_TOLERANCE, ADHERENCE_WINDOW_DAYS, MIN_MEALS_FOR_AVERAGE, type DayMacros, type GymRow, type RunRow } from "./prescriptionAdherence.ts";

export const RECOMMENDATION_KINDS = ["descanso", "corrida", "ginasio", "proteina"] as const;
export type RecommendationKind = typeof RECOMMENDATION_KINDS[number];
/** No máximo por resposta — mais do que isto já é um plano, e o plano tem a sua ferramenta. */
export const MAX_RECOMMENDATIONS_PER_REPLY = 5;
/** Até quantos dias à frente uma recomendação conta (de ontem a +14 dias). */
export const RECOMMENDATION_HORIZON_DAYS = 14;
const MAX_CONTEXT_LINES = 8;
const DAY_MS = 86400000;

export interface RecommendationRow {
  date: string;
  kind: RecommendationKind;
  distance_km?: number | null;
  duration_min?: number | null;
  protein_g?: number | null;
}

export interface CheckinRow { date: string; sleep?: number | null; pain?: number | null }

export type RecommendationOutcome = "cumprido" | "a_menos" | "a_mais" | "nao_feito" | "descanso_respeitado" | "descanso_nao_respeitado" | "sem_registo";

export interface RecommendationResult { date: string; kind: RecommendationKind; outcome: RecommendationOutcome; text: string }

function addDays(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Um número dentro de [min, max], arredondado; null fora disso. */
function bounded(v: unknown, min: number, max: number, decimals = 0): number | null {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

function km(v: number): string {
  return `${String(Math.round(v * 10) / 10).replace(".", ",")} km`;
}

function ratioOutcome(ratio: number): RecommendationOutcome {
  if (ratio < 1 - ADHERENCE_TOLERANCE) return "a_menos";
  if (ratio > 1 + ADHERENCE_TOLERANCE) return "a_mais";
  return "cumprido";
}

const OUTCOME_LABEL: Record<RecommendationOutcome, string> = {
  cumprido: "cumprido",
  a_menos: "a menos",
  a_mais: "a mais",
  nao_feito: "não feito",
  descanso_respeitado: "respeitado",
  descanso_nao_respeitado: "treinou nesse dia",
  sem_registo: "sem registo",
};

/**
 * O array que o modelo devolveu, validado. Só entra o que é verificável: uma
 * data de ontem a +14 dias, um tipo conhecido, números plausíveis (fora do
 * intervalo o número cai, a recomendação fica; a proteína sem gramas não
 * serve de nada e cai inteira). O mesmo dia e tipo fica com a última — a
 * Carol corrigiu-se. Nunca rejeita.
 */
export function parseRecommendations(raw: unknown, todayISO: string): RecommendationRow[] {
  if (!Array.isArray(raw)) return [];
  const from = addDays(todayISO, -1);
  const to = addDays(todayISO, RECOMMENDATION_HORIZON_DAYS);
  const byKey = new Map<string, RecommendationRow>();
  for (const r of raw.slice(0, 20)) {
    if (!r || typeof r !== "object") continue;
    // deno-lint-ignore no-explicit-any
    const o = r as any;
    const date = typeof o.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.date.trim()) ? o.date.trim() : null;
    if (!date || date < from || date > to) continue;
    const kind = (RECOMMENDATION_KINDS as readonly string[]).includes(o.kind) ? o.kind as RecommendationKind : null;
    if (!kind) continue;
    const row: RecommendationRow = { date, kind };
    if (kind === "corrida") {
      row.distance_km = bounded(o.distance_km, 0.5, 60, 1);
      row.duration_min = bounded(o.duration_min, 5, 360);
    } else if (kind === "ginasio") {
      row.duration_min = bounded(o.duration_min, 10, 240);
    } else if (kind === "proteina") {
      row.protein_g = bounded(o.protein_g, 20, 400);
      if (!row.protein_g) continue;
    }
    byKey.delete(`${date}|${kind}`);
    byKey.set(`${date}|${kind}`, row);
  }
  return [...byKey.values()].slice(-MAX_RECOMMENDATIONS_PER_REPLY);
}

function describe(r: RecommendationRow): string {
  if (r.kind === "descanso") return "descanso";
  if (r.kind === "proteina") return `${Math.round(num(r.protein_g))} g de proteína`;
  const target = num(r.distance_km) > 0 ? km(num(r.distance_km)) : num(r.duration_min) > 0 ? `${Math.round(num(r.duration_min))} min` : null;
  const name = r.kind === "corrida" ? "corrida" : "ginásio";
  return target ? `${name} (${target})` : name;
}

/** O que o check-in do dia seguinte disse do sono e da dor — só o que existe. */
function nextDayLine(checkins: CheckinRow[], date: string): string | null {
  const next = checkins.find((c) => c?.date === addDays(date, 1));
  if (!next) return null;
  const parts: string[] = [];
  if (num(next.sleep) > 0) parts.push(`sono ${Math.round(num(next.sleep))}/5`);
  if (next.pain !== null && next.pain !== undefined && Number.isFinite(Number(next.pain))) {
    parts.push(Number(next.pain) === 0 ? "sem dor" : `dor ${Number(next.pain)}/10`);
  }
  return parts.length ? `no dia seguinte: ${parts.join(", ")}` : null;
}

/**
 * Cada recomendação já vivida (dos últimos 14 dias, sem hoje), cruzada com o
 * registo desse dia: a corrida e o ginásio com o que foi feito (±15%, a
 * mesma tolerância do plano), a proteína com o que foi comido, o descanso com
 * não ter treinado — e com o sono e a dor do check-in do dia seguinte.
 */
export function evaluateRecommendations(
  input: {
    recommendations: RecommendationRow[] | null | undefined;
    runs: RunRow[] | null | undefined;
    gym: GymRow[] | null | undefined;
    mealsByDate: Record<string, DayMacros> | null | undefined;
    checkins?: CheckinRow[] | null;
  },
  todayISO: string,
  days = ADHERENCE_WINDOW_DAYS,
): RecommendationResult[] {
  const from = addDays(todayISO, -days);
  const runs = input.runs || [];
  const gym = input.gym || [];
  const meals = input.mealsByDate || {};
  const checkins = input.checkins || [];
  return (input.recommendations || [])
    .filter((r) => r && typeof r.date === "string" && r.date >= from && r.date < todayISO)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r): RecommendationResult => {
      const head = `${r.date} · recomendaste ${describe(r)} →`;
      if (r.kind === "descanso") {
        const trained = runs.some((x) => x.date === r.date) || gym.some((x) => x.date === r.date);
        const after = nextDayLine(checkins, r.date);
        const outcome: RecommendationOutcome = trained ? "descanso_nao_respeitado" : "descanso_respeitado";
        return { date: r.date, kind: r.kind, outcome, text: `${head} ${OUTCOME_LABEL[outcome]}${after ? `; ${after}` : ""}` };
      }
      if (r.kind === "proteina") {
        const day = meals[r.date];
        if (!day || day.meals === 0) return { date: r.date, kind: r.kind, outcome: "sem_registo", text: `${head} sem refeições registadas` };
        const outcome = ratioOutcome(day.prot / num(r.protein_g));
        const partial = day.meals < MIN_MEALS_FOR_AVERAGE ? " — dia meio registado" : "";
        return {
          date: r.date, kind: r.kind, outcome,
          text: `${head} comeu ${Math.round(day.prot)} g (${Math.round((day.prot / num(r.protein_g)) * 100)}%) · ${OUTCOME_LABEL[outcome]}${partial}`,
        };
      }
      if (r.kind === "corrida") {
        const dayRuns = runs.filter((x) => x.date === r.date);
        if (!dayRuns.length) return { date: r.date, kind: r.kind, outcome: "nao_feito", text: `${head} ${OUTCOME_LABEL.nao_feito}` };
        const dist = dayRuns.reduce((s, x) => s + num(x.distance_km), 0);
        const dur = dayRuns.reduce((s, x) => s + num(x.duration_seconds), 0) / 60;
        if (num(r.distance_km) > 0 && dist > 0) {
          const outcome = ratioOutcome(dist / num(r.distance_km));
          return { date: r.date, kind: r.kind, outcome, text: `${head} fez ${km(dist)} (${Math.round((dist / num(r.distance_km)) * 100)}%) · ${OUTCOME_LABEL[outcome]}` };
        }
        if (num(r.duration_min) > 0 && dur > 0) {
          const outcome = ratioOutcome(dur / num(r.duration_min));
          return { date: r.date, kind: r.kind, outcome, text: `${head} fez ${Math.round(dur)} min (${Math.round((dur / num(r.duration_min)) * 100)}%) · ${OUTCOME_LABEL[outcome]}` };
        }
        return { date: r.date, kind: r.kind, outcome: "cumprido", text: `${head} correu nesse dia · ${OUTCOME_LABEL.cumprido}` };
      }
      // Ginásio.
      const dayGym = gym.filter((x) => x.date === r.date);
      if (!dayGym.length) return { date: r.date, kind: r.kind, outcome: "nao_feito", text: `${head} ${OUTCOME_LABEL.nao_feito}` };
      const dur = dayGym.reduce((s, x) => s + num(x.duration_seconds), 0) / 60;
      if (num(r.duration_min) > 0 && dur > 0) {
        const outcome = ratioOutcome(dur / num(r.duration_min));
        return { date: r.date, kind: r.kind, outcome, text: `${head} fez ${Math.round(dur)} min (${Math.round((dur / num(r.duration_min)) * 100)}%) · ${OUTCOME_LABEL[outcome]}` };
      }
      return { date: r.date, kind: r.kind, outcome: "cumprido", text: `${head} fez a sessão · ${OUTCOME_LABEL.cumprido}` };
    });
}

/** O bloco do prompt, ou null sem recomendações vividas na janela. */
export function buildRecommendationsContext(results: RecommendationResult[] | null | undefined): string | null {
  const list = results || [];
  if (!list.length) return null;
  return `RECOMENDAÇÕES SOLTAS QUE DESTE NA CONVERSA (fora do plano, últimos ${ADHERENCE_WINDOW_DAYS} dias):\n` +
    list.slice(-MAX_CONTEXT_LINES).map((r) => `- ${r.text}`).join("\n") + "\n" +
    `Lê-as como o plano: para calibrar, não para cobrar. Num dia em que recomendaste descanso por cima do plano, ` +
    `o treino do plano "não feito" não é falha.`;
}
