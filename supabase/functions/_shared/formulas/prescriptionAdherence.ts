// O que a Carol prescreveu e o que aconteceu — fórmula pura
// (specs/carol-omnisciencia-omnipresenca.md, Fase 3).
//
// A Carol prescreve em dois sítios estruturados: os treinos do plano
// (coach_plan_items: tipo, distância, duração) e a sugestão de refeições de
// cada dia (meal_macros: kcal e macros). Até aqui só sabia se as sugestões
// de refeição tinham calorias registadas nesse dia; não sabia se o longo de
// 18 km foi de 12, se o descanso foi respeitado, nem se a proteína que
// sugeriu chegou ao prato. Isto cruza cada prescrição dos últimos 14 dias com
// o registo real, e resume.
//
// A correspondência: o item marcado como feito aponta para a corrida ou a
// sessão (completed_run_id / completed_session_id). A maior parte dos atletas
// não marca — por isso, sem ligação, conta o que foi registado nesse dia.

import { isMealOnlyItem } from "./mealSuggestions.ts";

export const ADHERENCE_WINDOW_DAYS = 14;
/** ±15%: dentro disto, o treino foi o prescrito. */
export const ADHERENCE_TOLERANCE = 0.15;
const MAX_TRAINING_LINES = 10;
const MAX_NUTRITION_LINES = 5;
/** Um dia com menos refeições do que isto está meio registado: não entra na
 *  média da proteína (revisão pré-master da Fase 3). */
export const MIN_MEALS_FOR_AVERAGE = 2;
const DAY_MS = 86400000;

export interface PlanItemRow {
  id?: string;
  planned_date: string;
  kind: string;                         // corrida | ginasio | descanso
  training_type?: string | null;
  target_distance_km?: number | string | null;
  target_duration_min?: number | null;
  status?: string | null;
  completed_run_id?: string | null;
  completed_session_id?: string | null;
  meal_macros?: { kcal?: number; protein_g?: number; carbs_g?: number; fat_g?: number } | null;
  actual_date?: string | null;
  plan_id?: string | null;
  // Só para a marca 'so-refeicoes' (mealSuggestions.ts) num descanso.
  categories?: string[] | null;
}

export interface RunRow { id?: string; date: string; distance_km?: number | string | null; duration_seconds?: number | null; effort_rpe?: number | null }
export interface GymRow { id?: string; date: string; duration_seconds?: number | null; exertion?: number | null }
export interface DayMacros { kcal: number; prot: number; carbs: number; fat: number; meals: number }

export type TrainingOutcome = "cumprido" | "a_menos" | "a_mais" | "falhado" | "descanso_respeitado" | "descanso_nao_respeitado";

export interface TrainingResult { date: string; outcome: TrainingOutcome; text: string }

function addDays(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function km(v: number): string {
  return `${String(Math.round(v * 10) / 10).replace(".", ",")} km`;
}

function ratioOutcome(ratio: number): TrainingOutcome {
  if (ratio < 1 - ADHERENCE_TOLERANCE) return "a_menos";
  if (ratio > 1 + ADHERENCE_TOLERANCE) return "a_mais";
  return "cumprido";
}

const OUTCOME_LABEL: Record<TrainingOutcome, string> = {
  cumprido: "cumprido",
  a_menos: "a menos",
  a_mais: "a mais",
  falhado: "não feito",
  descanso_respeitado: "descanso respeitado",
  descanso_nao_respeitado: "descanso NÃO respeitado",
};

function describePrescription(item: PlanItemRow): string {
  if (item.kind === "descanso") return "Descanso";
  const dist = num(item.target_distance_km);
  const dur = num(item.target_duration_min);
  const target = [dist > 0 ? km(dist) : null, dur > 0 ? `${dur} min` : null].filter(Boolean).join(", ");
  const name = item.kind === "corrida" ? `Corrida${item.training_type ? ` ${item.training_type}` : ""}` : "Ginásio";
  return target ? `${name} (${target})` : name;
}

/** Um item de treino já vivido, cruzado com o que ficou registado.
 *  `takenRunIds`/`takenGymIds`: registos já ligados a OUTROS itens — não
 *  servem de recurso por data a este (terça ligada à corrida de quarta não
 *  pode fazer a quarta parecer feita). */
export function evaluateTrainingItem(
  item: PlanItemRow,
  runs: RunRow[],
  gym: GymRow[],
  takenRunIds: Set<string> = new Set(),
  takenGymIds: Set<string> = new Set(),
): TrainingResult {
  const date = item.planned_date.slice(0, 10);
  // Onde procurar sem ligação: o dia em que foi feito, se estiver marcado.
  const matchDate = (item.actual_date || item.planned_date).slice(0, 10);
  const linkedRun = item.completed_run_id ? runs.find((r) => r.id === item.completed_run_id) : undefined;
  const linkedGym = item.completed_session_id ? gym.find((g) => g.id === item.completed_session_id) : undefined;
  const dayRuns = linkedRun ? [linkedRun] : runs.filter((r) => r.date === matchDate && !(r.id && takenRunIds.has(r.id)));
  const dayGym = linkedGym ? [linkedGym] : gym.filter((g) => g.date === matchDate && !(g.id && takenGymIds.has(g.id)));
  const prescription = describePrescription(item);
  // Marcado como feito, mas o registo ligado não está na janela (ou nem há
  // ligação, como na prova marcada à mão): é feito, sem números.
  const markedDone = item.status === "concluido";

  if (item.kind === "descanso") {
    const trained = runs.some((r) => r.date === date) || gym.some((g) => g.date === date);
    return {
      date,
      outcome: trained ? "descanso_nao_respeitado" : "descanso_respeitado",
      text: `${date} · Descanso → ${trained ? "treinou nesse dia" : "respeitado"}`,
    };
  }

  if (item.kind === "corrida") {
    if (!dayRuns.length) {
      return markedDone
        ? { date, outcome: "cumprido", text: `${date} · ${prescription} → marcado como feito` }
        : { date, outcome: "falhado", text: `${date} · ${prescription} → não feito` };
    }
    const dist = dayRuns.reduce((s, r) => s + num(r.distance_km), 0);
    const durMin = dayRuns.reduce((s, r) => s + num(r.duration_seconds), 0) / 60;
    const rpe = Math.max(0, ...dayRuns.map((r) => num(r.effort_rpe)));
    const targetDist = num(item.target_distance_km);
    const targetDur = num(item.target_duration_min);
    let outcome: TrainingOutcome = "cumprido";
    let got = dist > 0 ? `fez ${km(dist)}` : `fez ${Math.round(durMin)} min`;
    if (targetDist > 0 && dist > 0) {
      outcome = ratioOutcome(dist / targetDist);
      got += ` (${Math.round((dist / targetDist) * 100)}%)`;
    } else if (targetDur > 0 && durMin > 0) {
      outcome = ratioOutcome(durMin / targetDur);
      got = `fez ${Math.round(durMin)} min (${Math.round((durMin / targetDur) * 100)}%)`;
    }
    return { date, outcome, text: `${date} · ${prescription} → ${got}${rpe > 0 ? `, RPE ${rpe}` : ""} · ${OUTCOME_LABEL[outcome]}` };
  }

  // Ginásio (e qualquer outro tipo de treino).
  if (!dayGym.length) {
    return markedDone
      ? { date, outcome: "cumprido", text: `${date} · ${prescription} → marcado como feito` }
      : { date, outcome: "falhado", text: `${date} · ${prescription} → não feito` };
  }
  const durMin = dayGym.reduce((s, g) => s + num(g.duration_seconds), 0) / 60;
  const targetDur = num(item.target_duration_min);
  let outcome: TrainingOutcome = "cumprido";
  let got = durMin > 0 ? `fez ${Math.round(durMin)} min` : "fez a sessão";
  if (targetDur > 0 && durMin > 0) {
    outcome = ratioOutcome(durMin / targetDur);
    got += ` (${Math.round((durMin / targetDur) * 100)}%)`;
  }
  return { date, outcome, text: `${date} · ${prescription} → ${got} · ${OUTCOME_LABEL[outcome]}` };
}

export interface AdherenceSummary {
  training: TrainingResult[];
  counts: Record<TrainingOutcome, number>;
  /** 0-100, ou null quando não houve nada prescrito na janela — ver executionScore. */
  executionScore: number | null;
  nutrition: Array<{ date: string; text: string; proteinPct: number | null; kcalPct: number | null }>;
}

/* ── O índice de execução do plano ──────────────────────────────────────────
   Um número de 0 a 100 a partir dos MESMOS `counts` que o texto do prompt já
   resume. Serve a comparação por percentil (gamificação, Fase 5): é a métrica
   'plan_execution' de percentile_snapshots.

   Nada disto muda o que a Carol lê — o texto continua exatamente igual;
   isto é só uma segunda leitura dos mesmos números.

   A ponderação:
     cumprido              1     fez o que estava prescrito
     a_menos / a_mais     0,5    apareceu, mas não foi aquilo (os dois valem o
                                 mesmo de propósito: 22 km num longo de 18 não
                                 é melhor do que 14 — é outra coisa)
     falhado               0
     descanso              meio peso, respeitado ou não. O descanso conta —
                           saltá-lo é desviar-se do plano — mas um plano de 14
                           dias tem mais dias de descanso do que de treino, e
                           a peso inteiro um atleta que não treinou nada mas
                           esteve quieto ficava à frente de quem correu tudo. */
export const EXECUTION_WEIGHTS: Record<TrainingOutcome, number> = {
  cumprido: 1,
  a_menos: 0.5,
  a_mais: 0.5,
  falhado: 0,
  descanso_respeitado: 0.5,
  descanso_nao_respeitado: 0,
};
/** O peso de um dia de descanso no denominador — metade de um dia de treino. */
export const EXECUTION_REST_WEIGHT = 0.5;

/** O denominador ponderado: quanto plano houve para cumprir. 0 = nada
 *  prescrito na janela, e nesse caso não há índice nenhum a calcular. */
export function executionBase(counts: Record<TrainingOutcome, number>): number {
  const workouts = (counts.cumprido || 0) + (counts.a_menos || 0) + (counts.a_mais || 0) + (counts.falhado || 0);
  const rests = (counts.descanso_respeitado || 0) + (counts.descanso_nao_respeitado || 0);
  return workouts + rests * EXECUTION_REST_WEIGHT;
}

/** 0-100 com uma casa decimal. Sem nada prescrito devolve 0 — quem precisa de
 *  distinguir "cumpriu zero" de "não havia nada" pergunta a executionBase()
 *  primeiro (é o que a agregação dos percentis faz). */
export function executionScore(counts: Record<TrainingOutcome, number>): number {
  const base = executionBase(counts);
  if (base <= 0) return 0;
  let earned = 0;
  for (const [outcome, weight] of Object.entries(EXECUTION_WEIGHTS) as Array<[TrainingOutcome, number]>) {
    earned += (counts[outcome] || 0) * weight;
  }
  const score = (earned / base) * 100;
  // Nunca fora de 0-100: os pesos garantem-no, mas o clamp é barato e este
  // número vai parar a uma distribuição pública.
  return Math.round(Math.min(100, Math.max(0, score)) * 10) / 10;
}

/** Os itens dos últimos 14 dias (sem hoje), só os que contam: nem cancelados
 *  nem de propostas recusadas — isso decide quem chama. */
export function evaluatePrescriptions(
  input: { items: PlanItemRow[] | null | undefined; runs: RunRow[] | null | undefined; gym: GymRow[] | null | undefined; mealsByDate: Record<string, DayMacros> | null | undefined },
  todayISO: string,
  days = ADHERENCE_WINDOW_DAYS,
): AdherenceSummary {
  const from = addDays(todayISO, -days);
  const items = (input.items || [])
    .filter((i) => i && typeof i.planned_date === "string" && i.planned_date >= from && i.planned_date < todayISO)
    .filter((i) => i.status !== "cancelado")
    .sort((a, b) => a.planned_date.localeCompare(b.planned_date));
  const runs = input.runs || [];
  const gym = input.gym || [];

  const counts: Record<TrainingOutcome, number> = {
    cumprido: 0, a_menos: 0, a_mais: 0, falhado: 0, descanso_respeitado: 0, descanso_nao_respeitado: 0,
  };
  /* As sugestões de refeição avulsas também são gravadas como itens
     "descanso" (runSaveMealSuggestions), em planos só de refeições. Esses
     dias não são descanso prescrito: só contam os descansos de planos que
     têm treinos (revisão pré-master). Sem plan_id, conta como antes. */
  const trainingPlans = new Set(items.filter((i) => i.kind === "corrida" || i.kind === "ginasio").map((i) => i.plan_id ?? "sem-plano"));
  const takenRunIds = new Set(items.map((i) => i.completed_run_id).filter((x): x is string => !!x));
  const takenGymIds = new Set(items.map((i) => i.completed_session_id).filter((x): x is string => !!x));
  // Um dia "só refeições" dentro de um plano de treino também não é descanso
  // prescrito — é um dia sem treino planeado (marca 'so-refeicoes').
  const training = items
    .filter((i) => i.kind === "corrida" || i.kind === "ginasio" || (i.kind === "descanso" && !isMealOnlyItem(i) && trainingPlans.has(i.plan_id ?? "sem-plano")))
    .map((i) => {
      // O registo ligado a ESTE item não conta como "tomado" para ele.
      const ownRuns = new Set([...takenRunIds].filter((id) => id !== i.completed_run_id));
      const ownGym = new Set([...takenGymIds].filter((id) => id !== i.completed_session_id));
      return evaluateTrainingItem(i, runs, gym, ownRuns, ownGym);
    });
  for (const t of training) counts[t.outcome]++;

  const meals = input.mealsByDate || {};
  const nutrition = items
    .filter((i) => i.meal_macros && num(i.meal_macros.kcal) > 0)
    .map((i) => {
      const m = i.meal_macros!;
      const day = meals[i.planned_date.slice(0, 10)];
      const suggested = `${Math.round(num(m.kcal))} kcal / ${Math.round(num(m.protein_g))} g proteína`;
      if (!day || day.meals === 0) {
        return { date: i.planned_date, text: `${i.planned_date} · sugeriste ${suggested} → sem refeições registadas`, proteinPct: null, kcalPct: null };
      }
      const kcalPct = Math.round((day.kcal / num(m.kcal)) * 100);
      const proteinPct = num(m.protein_g) > 0 ? Math.round((day.prot / num(m.protein_g)) * 100) : null;
      const partial = day.meals < MIN_MEALS_FOR_AVERAGE;
      return {
        date: i.planned_date,
        text: `${i.planned_date} · sugeriste ${suggested} → comeu ${Math.round(day.kcal)} kcal (${kcalPct}%) / ${Math.round(day.prot)} g proteína${proteinPct !== null ? ` (${proteinPct}%)` : ""}` +
          ` em ${day.meals} ${day.meals === 1 ? "refeição" : "refeições"}${partial ? " — dia meio registado, fora da média" : ""}`,
        // Um dia meio registado não entra na média: puxava-a para baixo.
        proteinPct: partial ? null : proteinPct,
        kcalPct: partial ? null : kcalPct,
      };
    });

  return { training, counts, executionScore: training.length ? executionScore(counts) : null, nutrition };
}

/** A linha de contas dos treinos ("N treinos prescritos: …; descanso …") —
 *  a mesma no bloco de 14 dias e no plano da semana do balanço. */
export function trainingSummaryLine(counts: Record<TrainingOutcome, number>): string {
  const workouts = counts.cumprido + counts.a_menos + counts.a_mais + counts.falhado;
  const rests = counts.descanso_respeitado + counts.descanso_nao_respeitado;
  return [
    workouts ? `${workouts} treinos prescritos: ${counts.cumprido} cumpridos, ${counts.a_menos} a menos, ${counts.a_mais} a mais, ${counts.falhado} não feitos` : null,
    rests ? `descanso respeitado em ${counts.descanso_respeitado} de ${rests} dias` : null,
  ].filter(Boolean).join("; ");
}

/** O bloco do prompt. null se não houve nada prescrito nos últimos 14 dias. */
export function buildPrescriptionAdherenceContext(summary: AdherenceSummary): string | null {
  const { training, counts, nutrition } = summary;
  if (!training.length && !nutrition.length) return null;
  const parts: string[] = [];

  if (training.length) {
    const summaryLine = trainingSummaryLine(counts);
    parts.push(`Treinos (±${Math.round(ADHERENCE_TOLERANCE * 100)}% conta como cumprido) — ${summaryLine}:\n` +
      training.slice(-MAX_TRAINING_LINES).map((t) => `- ${t.text}`).join("\n"));
  }

  if (nutrition.length) {
    const withProtein = nutrition.filter((n) => n.proteinPct !== null);
    const avgProtein = withProtein.length
      ? Math.round(withProtein.reduce((s, n) => s + (n.proteinPct ?? 0), 0) / withProtein.length)
      : null;
    const head = avgProtein !== null
      ? `Refeições sugeridas — nos dias com registo, a proteína ficou em média em ${avgProtein}% do que sugeriste`
      : "Refeições sugeridas — sem registos nos dias em que sugeriste";
    parts.push(`${head}:\n` + nutrition.slice(-MAX_NUTRITION_LINES).map((n) => `- ${n.text}`).join("\n"));
  }

  return `O QUE PRESCREVESTE vs O QUE ACONTECEU (últimos ${ADHERENCE_WINDOW_DAYS} dias):\n${parts.join("\n\n")}\n` +
    `Usa isto para calibrar, não para cobrar: um padrão (os longos ficam sempre a meio, o descanso nunca é ` +
    `respeitado, a proteína fica sempre abaixo) pede uma prescrição diferente, não a mesma repetida. Um dia isolado ` +
    `não é um padrão. Um treino "não feito" pode ter sido registado noutro dia — pergunta antes de concluir.`;
}

/** Somas por dia a partir das refeições com meal_items (valores por 100 g). */
export function mealTotalsByDate(meals: Array<{ date: string; meal_items?: Array<Record<string, unknown>> | null }> | null | undefined): Record<string, DayMacros> {
  const out: Record<string, DayMacros> = {};
  for (const meal of meals || []) {
    if (!meal?.date) continue;
    const d = (out[meal.date] ||= { kcal: 0, prot: 0, carbs: 0, fat: 0, meals: 0 });
    d.meals += 1;
    for (const it of meal.meal_items || []) {
      const f = num(it.quantity_grams) / 100;
      d.kcal += num(it.calories_per_100g) * f;
      d.prot += num(it.protein_per_100g) * f;
      d.carbs += num(it.carbs_per_100g) * f;
      d.fat += num(it.fat_per_100g) * f;
    }
  }
  return out;
}
