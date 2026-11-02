// O objetivo de um dia passado (bug #51, 2026-10-02): «se quiser saber qual
// era o objetivo de calorias ou outro macro, no dia de ontem, e saber se
// atingi objetivos, não temos como saber».
//
// O histórico vem de profile_goal_history (migração 20261003224956): cada
// linha é um estado dos cinco objetivos e a partir de quando vale. O
// objetivo de um dia é o da última linha que começou até ao fim desse dia,
// em hora de Lisboa — mudar os objetivos às 14h vale para o dia inteiro.
//
// @contexto Movido de src/utils/goalHistory.js a 2026-11-02 (revisão da
// Nutrição B): o cliente julgava se um dia tinha o registo completo com o
// objetivo DESSE dia e o servidor (coach-chat, coach-daily-summary) com o de
// hoje — se o objetivo mudou, o mesmo dia podia ser parcial num lado e
// completo no outro. Agora a regra é uma só, para os dois (@formulas).

/** Os mesmos valores por omissão de macroAdherence.ts. */
export const DAY_GOAL_DEFAULTS = { calorie_goal: 2000, protein_goal: 150, carbs_goal: 200, fat_goal: 70, water_goal_ml: 2000 };
type GoalKey = keyof typeof DAY_GOAL_DEFAULTS;
const GOAL_KEYS = Object.keys(DAY_GOAL_DEFAULTS) as GoalKey[];

export type DayGoalValues = Record<GoalKey, number>;

/** Uma linha de profile_goal_history (as colunas que contam). */
export interface GoalHistoryRow {
  valid_from?: string | null;
  source?: string | null;
  calorie_goal?: number | string | null;
  protein_goal?: number | string | null;
  carbs_goal?: number | string | null;
  fat_goal?: number | string | null;
  water_goal_ml?: number | string | null;
}

/** As colunas a ler de profile_goal_history. */
export const GOAL_HISTORY_SELECT = "valid_from, source, calorie_goal, protein_goal, carbs_goal, fat_goal, water_goal_ml";

const lisbonDate = (ts: string): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" }).format(new Date(ts));

// deno-lint-ignore no-explicit-any
const pick = (src: any): DayGoalValues => Object.fromEntries(GOAL_KEYS.map((k) => {
  const n = Number(src?.[k]);
  return [k, Number.isFinite(n) && n > 0 ? n : DAY_GOAL_DEFAULTS[k]];
})) as DayGoalValues;

/**
 * Os objetivos que valiam em `dayISO`.
 *   { goals, estimated }
 * `estimated` quando o dia cai antes de haver histórico de verdade: na linha
 * 'inicial' (o ponto de partida que a migração estimou com os valores de
 * hoje) ou antes da primeira linha. Sem histórico nenhum (ainda a carregar,
 * ou no modo demo), valem os objetivos atuais do perfil, sem aviso.
 */
export function goalsForDay(
  history: GoalHistoryRow[] | null | undefined,
  dayISO: string,
  profile: unknown,
): { goals: DayGoalValues; estimated: boolean } {
  const rows = [...(history || [])]
    .filter((r) => r?.valid_from)
    .sort((a, b) => String(a.valid_from).localeCompare(String(b.valid_from)));
  if (!rows.length) return { goals: pick(profile), estimated: false };
  let row: GoalHistoryRow | null = null;
  for (const r of rows) {
    if (lisbonDate(r.valid_from as string) <= dayISO) row = r;
    else break;
  }
  if (!row) return { goals: pick(rows[0]), estimated: true };
  return { goals: pick(row), estimated: row.source === "inicial" };
}

/** Primeiro dia em que o histórico de objetivos é de verdade (a migração
 *  20261003224956 correu a 2026-10-03). Antes disso o que há é uma estimativa
 *  — a linha 'inicial' copia os valores de hoje —, por isso qualquer dia
 *  anterior é «aproximado», seja qual for o `source` da linha que o cobre.
 *  Sem esta regra, quem nunca mudou de objetivos ficava com `estimated` para
 *  sempre (a linha 'inicial' é a única que tem) e a Nutrição dizia
 *  «objetivos aproximados» também nos dias posteriores a 3 de outubro
 *  (plano da Evolução, F3, 2026-10-04). */
export const GOAL_HISTORY_SINCE = "2026-10-03";

/**
 * O resolvedor dos objetivos de um dia, para quem precisa de muitos dias de
 * seguida (o resumo semanal/mensal da Nutrição): ordena e converte as datas
 * do histórico UMA vez, e responde por dia.
 *   goalsResolver(history, profile, todayISO) → (dayISO) => { goals, estimated }
 * - Hoje e o futuro valem o perfil de agora: o histórico carregado pode ainda
 *   não ter a última mudança, e é o perfil que manda.
 * - Dias passados: a última linha que começou até ao fim desse dia (Lisboa);
 *   antes da primeira linha, a primeira (estimativa); sem histórico nenhum
 *   (a carregar, modo demo), o perfil.
 * - `estimated` = dia < GOAL_HISTORY_SINCE, independentemente do source.
 */
export function goalsResolver(
  history: GoalHistoryRow[] | null | undefined,
  profile: unknown,
  todayISO: string | null | undefined,
): (dayISO: string) => { goals: DayGoalValues; estimated: boolean } {
  const rows = (history || [])
    .filter((r) => r?.valid_from)
    .map((r) => ({ r, day: lisbonDate(r.valid_from as string) }))
    .sort((a, b) => String(a.r.valid_from).localeCompare(String(b.r.valid_from)));
  const current = pick(profile);
  return (dayISO: string) => {
    const estimated = dayISO < GOAL_HISTORY_SINCE;
    if (todayISO && dayISO >= todayISO) return { goals: current, estimated };
    if (!rows.length) return { goals: current, estimated };
    let row = rows[0].r;
    for (const x of rows) {
      if (x.day <= dayISO) row = x.r;
      else break;
    }
    return { goals: pick(row), estimated };
  };
}

/** Só o objetivo de calorias de cada dia (dayCompleteness, readinessIndex). */
export function calorieGoalResolver(
  history: GoalHistoryRow[] | null | undefined,
  profile: unknown,
  todayISO: string | null | undefined,
): (dayISO: string) => number {
  const r = goalsResolver(history, profile, todayISO);
  return (dayISO: string) => r(dayISO).goals.calorie_goal;
}
