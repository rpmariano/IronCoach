// Corrida vs. caminhada — o critério único (2026-10-05).
//
// @contexto Feature "Caminhada", aprovada pelo dono do produto a 2026-10-05:
// a caminhada serve recuperações físicas (lesão, cirurgia, pós-prova) e quem
// não pode correr. Modelo escolhido: NÃO é uma tabela nova — é um TIPO DE
// TREINO da corrida (runs.kind='treino', runs.training_type='caminhada'),
// registada em "Registar corrida". Assim reaproveita tudo o que a corrida já
// tem (prints do relógio, GPS, FC, análise da Carol, ligação ao plano).
//
// O preço desse modelo é que a caminhada vive na mesma tabela `runs` que
// alimenta TODA a carga de corrida — e não conta para ela: uma hora a andar
// não é uma hora a correr (impacto, custo energético, ritmo). Sem um filtro,
// 5 km de caminhada pós-operatória entravam no ACWR, nos km/semana, no pace
// médio ("6'49/km" passava a "9'30/km"), no VDOT, nos recordes, na previsão
// de prova, na distribuição 80/20 (FC baixa a inflacionar a Z1-Z2)…
//
// Este módulo é o SÍTIO ÚNICO dessa decisão — usado pelas fórmulas partilhadas
// (que filtram à entrada, para nenhum chamador ter de se lembrar), pelo
// frontend e pelas Edge Functions. Quem precisa de "só corridas" chama
// runsOnly(); quem quer mostrar as caminhadas à parte chama walksOnly() /
// walkTotals().
//
// No PLANO a caminhada é um item kind='corrida' com training_type='caminhada'
// (sem mexer no check de coach_plan_items.kind — ver isWalkPlanItem). A
// intensidade (leve/moderada) vai em `categories` — a coluna text[] que nos
// itens de corrida estava sempre vazia (no ginásio são os grupos musculares).

/** O valor de runs.training_type / coach_plan_items.training_type. */
export const WALK_TRAINING_TYPE = "caminhada";

/** Intensidades de uma caminhada no plano (guardadas em `categories`). */
export const WALK_INTENSITIES = ["leve", "moderada"] as const;
export type WalkIntensity = typeof WALK_INTENSITIES[number];

export interface RunKindLike {
  kind?: string | null;
  training_type?: string | null;
}

/** Um registo de `runs` é uma caminhada? (uma prova nunca é.) */
export function isWalk(run: RunKindLike | null | undefined): boolean {
  return !!run && run.training_type === WALK_TRAINING_TYPE && run.kind !== "competicao";
}

/** Só as corridas — a lista para TUDO o que é carga/forma de corrida. */
// `T extends object` (e não RunKindLike): uma linha sem kind/training_type
// ({date, distance_km}) é corrida — e o TypeScript recusava-a como "weak type".
export function runsOnly<T extends object>(runs: T[] | null | undefined): T[] {
  return (runs || []).filter((r) => r && !isWalk(r as RunKindLike));
}

/** Só as caminhadas. */
export function walksOnly<T extends object>(runs: T[] | null | undefined): T[] {
  return (runs || []).filter((r) => isWalk(r as RunKindLike));
}

export interface WalkTotals {
  count: number;
  km: number;
  minutes: number;
}

/** "N caminhadas · X km" num intervalo de datas [from, to] (inclusive).
 *  Sem intervalo, de todas. As datas comparam-se pelos 10 primeiros carateres. */
export function walkTotals(
  runs: Array<RunKindLike & { date?: string | null; distance_km?: number | string | null; duration_seconds?: number | string | null }> | null | undefined,
  from: string | null = null,
  to: string | null = null,
): WalkTotals {
  let count = 0;
  let km = 0;
  let seconds = 0;
  for (const r of walksOnly(runs)) {
    const d = typeof r.date === "string" ? r.date.slice(0, 10) : null;
    if ((from || to) && !d) continue;
    if (from && d! < from) continue;
    if (to && d! > to) continue;
    count++;
    km += Number(r.distance_km) || 0;
    seconds += Number(r.duration_seconds) || 0;
  }
  return { count, km: Math.round(km * 100) / 100, minutes: Math.round(seconds / 60) };
}

/** Um item do plano é uma caminhada? (kind 'corrida' + training_type 'caminhada'). */
export function isWalkPlanItem(item: RunKindLike | null | undefined): boolean {
  return !!item && item.kind === "corrida" && item.training_type === WALK_TRAINING_TYPE;
}

/** Itens de plano que são carga de CORRIDA (sem as caminhadas). */
export function runPlanItemsOnly<T extends object>(items: T[] | null | undefined): T[] {
  return (items || []).filter((i) => i && !isWalkPlanItem(i as RunKindLike));
}

/** A intensidade de uma caminhada do plano (de `categories`), ou null. */
export function walkIntensity(item: { categories?: unknown } | null | undefined): WalkIntensity | null {
  const cats = Array.isArray(item?.categories) ? item!.categories as unknown[] : [];
  for (const c of cats) {
    const v = typeof c === "string" ? c.trim().toLowerCase() : "";
    if ((WALK_INTENSITIES as readonly string[]).includes(v)) return v as WalkIntensity;
  }
  return null;
}

/** Um registo cumpre um item do plano do mesmo dia? Caminhada só cumpre
 *  caminhada e corrida só cumpre corrida (decisão 2026-10-05: andar 5 km não
 *  é ter feito o contínuo de 8 km, e correr não é o que o médico pediu num
 *  dia de caminhada). Itens de ginásio/descanso nunca casam com `runs`. */
export function runMatchesPlanItem(run: RunKindLike | null | undefined, item: RunKindLike | null | undefined): boolean {
  if (!run || !item || item.kind !== "corrida") return false;
  return isWalk(run) === isWalkPlanItem(item);
}

/** "1 caminhada" / "3 caminhadas". */
export function walksLabel(n: number): string {
  return `${n} ${n === 1 ? "caminhada" : "caminhadas"}`;
}
