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

/** Uma prova A marcada — fecha a janela sem défice antes dela (bug #46). */
export type GoalsRace = { name: string | null; date: string };

export type GoalsContext = {
  goals: Record<string, unknown> | null;
  level: string | null;
  /** Data-alvo dos objetivos corporais (profiles.goals_target_date, bug #46). */
  targetDate?: string | null;
  /** As próximas provas A (status agendada). */
  races?: GoalsRace[];
};

/** Os objetivos atuais, a data-alvo, o nível e as próximas provas A — lidos
 *  antes da análise, para a Carol os poder pôr à prova. Uma falha aqui nunca
 *  trava o registo (as provas falham à parte: sem elas, o resto vale). */
// deno-lint-ignore no-explicit-any
export async function fetchGoalsContext(sb: any, userId: string, today: string = new Date().toISOString().slice(0, 10)): Promise<GoalsContext> {
  try {
    const [{ data }, racesRes] = await Promise.all([
      sb
        .from("profiles")
        .select([...Object.keys(GOAL_LABELS), "goals_target_date", "experience_level"].join(", "))
        .eq("id", userId)
        .maybeSingle(),
      Promise.resolve(
        sb.from("race_events")
          .select("name, date, race_priority")
          .eq("user_id", userId)
          .eq("status", "agendada")
          .gt("date", today)
          .order("date", { ascending: true })
          .limit(5),
      ).catch(() => null),
    ]);
    // deno-lint-ignore no-explicit-any
    const races: GoalsRace[] = ((racesRes?.data ?? []) as any[])
      .filter((r) => r?.date && r.race_priority !== "b" && r.race_priority !== "c")
      .map((r) => ({ name: r.name ?? null, date: String(r.date).slice(0, 10) }));
    return {
      goals: data ?? null,
      level: typeof data?.experience_level === "string" ? data.experience_level : null,
      targetDate: typeof data?.goals_target_date === "string" ? data.goals_target_date.slice(0, 10) : null,
      races,
    };
  } catch {
    return { goals: null, level: null };
  }
}

/** A secção do prompt com os objetivos e o pedido do juízo goals_review.
 *  Com a data-alvo e as provas A (bug #46): um objetivo corporal só é bom
 *  com o tempo que tem até lá, e sem défice antes de uma prova A. */
export function goalsReviewSection(
  goals: Record<string, unknown> | null,
  horizon: { targetDate?: string | null; races?: GoalsRace[] } = {},
): string {
  const linhas = Object.entries(GOAL_LABELS)
    .filter(([k]) => goals && goals[k] !== null && goals[k] !== undefined && goals[k] !== "")
    .map(([k, label]) => `- ${label}: ${goals![k]}`);
  const temCorporais = BODY_GOAL_COLUMNS.some((k) => goals && goals[k] !== null && goals[k] !== undefined && goals[k] !== "");
  const data = temCorporais
    ? (horizon.targetDate ? `- data-alvo dos objetivos corporais: ${horizon.targetDate}\n` : "- objetivos corporais sem data-alvo\n")
    : "";
  const provas = horizon.races?.length
    ? `PROVAS A MARCADAS: ${horizon.races.map((r) => `${r.name ?? "prova"} (${r.date})`).join(", ")} — a partir de 28 dias antes do início do taper de cada uma e até à prova não há défice calórico.\n`
    : "";
  const atuais = linhas.length
    ? `OBJETIVOS ATUAIS DO ATLETA (definidos por ele, afinados contigo):\n${linhas.join("\n")}\n${data}`
    : "O atleta ainda não tem objetivos definidos.\n";
  return atuais + provas +
    "No campo \"goals_review\" diz se, à luz DESTA avaliação (e da evolução no histórico), os objetivos atuais " +
    "deviam ser revistos. needed=true só com uma razão concreta — ex.: o peso-alvo já foi atingido ou " +
    "ultrapassado; a gordura corporal está perto ou abaixo do limiar de segurança e o objetivo empurra-a para " +
    "baixo; a massa muscular está a cair; um objetivo contradiz o que os números mostram; a data-alvo já passou, " +
    "ou o que falta já não cabe até lá sem passar o ritmo seguro (perder no máximo 0,5-0,7% do peso por semana), " +
    "ou obriga a perder peso nas semanas sem défice antes de uma prova A; há objetivos corporais sem data-alvo. Em reason, uma frase " +
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
    const trimmed = raw.trim();
    // JSON cortado (ex.: limite de tokens): tenta salvar o summary; nunca
    // mostra "{"summary":…" ao atleta.
    if (trimmed.startsWith("{")) {
      const m = trimmed.match(/"summary"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      if (!m) return { text: null, goalsReview: null };
      try {
        const text = JSON.parse(`"${m[1]}"`).trim();
        return { text: text || null, goalsReview: null };
      } catch {
        return { text: null, goalsReview: null };
      }
    }
    return { text: trimmed, goalsReview: null };
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
/** Dias sem voltar a pedir revisão depois de uma proposta de objetivos
 *  (aceite, recusada ou por decidir): sem isto, quem recusasse "o peso-alvo
 *  já foi atingido" era chamado outra vez em cada pesagem seguinte. */
export const GOALS_REVIEW_COOLDOWN_DAYS = 14;

/** O convite a DEFINIR objetivos (quando faltam) volta no máximo a cada 7
 *  dias depois de uma proposta ou de um "agora não" (decidido a
 *  2026-09-23): insiste, mas não a cada pesagem. */
export const GOALS_MISSING_COOLDOWN_DAYS = 7;

/** `reviewAllowed` e `missingAllowed` vêm de quem chama: só a pesagem mais
 *  recente e recente (≤ 7 dias) pode pedir revisão, e nenhum dos dois
 *  convites volta dentro do seu período de espera depois de uma proposta. */
// deno-lint-ignore no-explicit-any
export function goalsInterventionFor(
  perfil: any,
  goalsReview: GoalsReview,
  { reviewAllowed = true, missingAllowed = true }: { reviewAllowed?: boolean; missingAllowed?: boolean } = {},
): string | null {
  if (!perfil) return null;
  if (["needed", "in_progress"].includes(perfil.coach_intervention_status)) return null;
  const temAlgum = (cols: string[]) => cols.some((c) => perfil[c] !== null && perfil[c] !== undefined);
  const faltamCorpo = !temAlgum(BODY_GOAL_COLUMNS);
  const faltamMacros = !temAlgum(MACRO_GOAL_COLUMNS);
  if (faltamCorpo || faltamMacros) {
    if (!missingAllowed) return null;
    const emFalta = [faltamCorpo ? "os do corpo" : null, faltamMacros ? "os de macronutrientes" : null]
      .filter(Boolean).join(" e ");
    return missingGoalsReason(emFalta);
  }
  if (reviewAllowed && goalsReview?.needed && goalsReview.reason) return reviewGoalsReason(goalsReview.reason);
  return null;
}
