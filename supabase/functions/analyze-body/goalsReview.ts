// O juízo "os objetivos deviam ser revistos?" da análise corporal (bug #41,
// 2026-09-22). Fora do index.ts para se poder testar: o index arranca o
// servidor ao ser importado.

import { missingGoalsReason, reviewGoalsReason } from "../_shared/formulas/goalsIntervention.ts";

export const BODY_GOAL_COLUMNS = ["goal_weight_kg", "goal_body_fat_pct", "goal_muscle_mass_kg", "goal_lean_body_mass_kg"];
export const MACRO_GOAL_COLUMNS = ["calorie_goal", "protein_goal", "carbs_goal", "fat_goal"];

/* A Carol diz, na MESMA chamada que comenta a pesagem, se os objetivos do
   atleta deviam ser revistos (bug #41, 2026-09-22) — sem chamada extra. */
export const GOALS_REVIEW_SCHEMA = {
  type: "OBJECT",
  properties: {
    needed: { type: "BOOLEAN" },
    reason: { type: "STRING", nullable: true },
  },
  required: ["needed"],
};

export type GoalsReview = { needed: boolean; reason: string | null } | null;

/** Lê o juízo do modelo. "Rever" sem razão concreta não conta: é a razão que
 *  a Carol leva para a conversa. */
export function parseGoalsReview(raw: unknown): GoalsReview {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { needed?: unknown; reason?: unknown };
  const reason = typeof r.reason === "string" && r.reason.trim() ? r.reason.trim().slice(0, 500) : null;
  return r.needed === true && reason ? { needed: true, reason } : { needed: false, reason: null };
}

const GOAL_LABELS: Record<string, string> = {
  goal_weight_kg: "peso-alvo (kg)",
  goal_body_fat_pct: "gordura corporal alvo (%)",
  goal_muscle_mass_kg: "massa muscular alvo (kg)",
  goal_lean_body_mass_kg: "massa magra alvo (kg)",
  calorie_goal: "calorias (kcal/dia)",
  protein_goal: "proteína (g/dia)",
  carbs_goal: "hidratos (g/dia)",
  fat_goal: "gordura (g/dia)",
};

export type GoalsContext = { goals: Record<string, unknown> | null; level: string | null };

/** Os objetivos atuais e o nível — lidos antes da análise, para a Carol os
 *  poder pôr à prova. Uma falha aqui nunca trava o registo. */
// deno-lint-ignore no-explicit-any
export async function fetchGoalsContext(sb: any, userId: string): Promise<GoalsContext> {
  try {
    const { data } = await sb
      .from("profiles")
      .select([...Object.keys(GOAL_LABELS), "experience_level"].join(", "))
      .eq("id", userId)
      .maybeSingle();
    return { goals: data ?? null, level: typeof data?.experience_level === "string" ? data.experience_level : null };
  } catch {
    return { goals: null, level: null };
  }
}

/** A secção do prompt com os objetivos e o pedido do juízo goals_review. */
export function goalsReviewSection(goals: Record<string, unknown> | null): string {
  const linhas = Object.entries(GOAL_LABELS)
    .filter(([k]) => goals && goals[k] !== null && goals[k] !== undefined && goals[k] !== "")
    .map(([k, label]) => `- ${label}: ${goals![k]}`);
  const atuais = linhas.length
    ? `OBJETIVOS ATUAIS DO ATLETA (definidos por ele, afinados contigo):\n${linhas.join("\n")}\n`
    : "O atleta ainda não tem objetivos definidos.\n";
  return atuais +
    "No campo \"goals_review\" diz se, à luz DESTA avaliação (e da evolução no histórico), os objetivos atuais " +
    "deviam ser revistos. needed=true só com uma razão concreta — ex.: o peso-alvo já foi atingido ou " +
    "ultrapassado; a gordura corporal está perto ou abaixo do limiar de segurança e o objetivo empurra-a para " +
    "baixo; a massa muscular está a cair; um objetivo contradiz o que os números mostram. Em reason, uma frase " +
    "com essa razão e os números que a provam. Sem objetivos definidos, ou sem razão concreta, needed=false. " +
    "Pequenas oscilações de uma pesagem para a outra não são razão.\n";
}

export const MANUAL_SUMMARY_SCHEMA = {
  type: "OBJECT",
  properties: { summary: { type: "STRING" }, goals_review: GOALS_REVIEW_SCHEMA },
  required: ["summary"],
};

/** A resposta do modo manual passou a JSON (summary + goals_review). Se não
 *  vier JSON válido, o texto é o comentário e não há juízo — nunca se perde
 *  o comentário por causa do formato. */
export function parseManualSummary(raw: unknown): { text: string | null; goalsReview: GoalsReview } {
  if (typeof raw !== "string" || !raw.trim()) return { text: null, goalsReview: null };
  try {
    const parsed = JSON.parse(raw);
    const text = typeof parsed?.summary === "string" && parsed.summary.trim() ? parsed.summary.trim() : null;
    return { text, goalsReview: parseGoalsReview(parsed?.goals_review) };
  } catch {
    return { text: raw.trim(), goalsReview: null };
  }
}

/** O motivo da intervenção a levantar depois de uma avaliação, ou null.
 *  - faltam objetivos (uma família inteira em branco) → definir;
 *  - há objetivos e a Carol leu que deviam mudar → rever (bug #41).
 *  Uma intervenção já pendente não se sobrepõe: o motivo que lá está pode
 *  ser mais urgente, e o atleta só vê um de cada vez. 'in_progress' conta
 *  como pendente — é uma conversa JÁ A MEIO, e reescrever o motivo apagava
 *  sem retorno a razão pela qual ela chamou (a coluna não tem histórico). É
 *  a mesma leitura do resto da app (store/index.js, Home/Home.jsx). */
// deno-lint-ignore no-explicit-any
export function goalsInterventionFor(perfil: any, goalsReview: GoalsReview): string | null {
  if (!perfil) return null;
  if (["needed", "in_progress"].includes(perfil.coach_intervention_status)) return null;
  const temAlgum = (cols: string[]) => cols.some((c) => perfil[c] !== null && perfil[c] !== undefined);
  const faltamCorpo = !temAlgum(BODY_GOAL_COLUMNS);
  const faltamMacros = !temAlgum(MACRO_GOAL_COLUMNS);
  if (faltamCorpo || faltamMacros) {
    const emFalta = [faltamCorpo ? "os do corpo" : null, faltamMacros ? "os de macronutrientes" : null]
      .filter(Boolean).join(" e ");
    return missingGoalsReason(emFalta);
  }
  if (goalsReview?.needed && goalsReview.reason) return reviewGoalsReason(goalsReview.reason);
  return null;
}
