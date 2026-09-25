// O desfecho dos avisos da Carol — fórmula pura
// (specs/carol-omnisciencia-omnipresenca.md, ação 5.5, push 1).
//
// Cada "Preciso de falar contigo" fica em coach_interventions (o trigger
// track_coach_intervention, em profiles): quando abriu, de onde veio e como
// fechou. Isto resume os últimos 60 dias numa linha para a Carol: quantos
// avisos abriu, quantos ele ignorou (disse que não, ou dispensou no Início)
// e quantos eram falsos alarmes.
//
// Serve para CALIBRAR — muitos ignorados ou falsos pedem mais exigência
// antes de abrir outro — e nunca como assunto de conversa: "já te chamei 5
// vezes" é cobrar, e o CAROL.md não cobra.

export const INTERVENTION_WINDOW_DAYS = 60;

/* O vocabulário dos avisos — de onde abrem e como fecham —, num sítio só:
   o cliente, o coach-chat e as análises escreviam-no à mão (terceira
   revisão pré-deploy, 2026-09-25). É o dos checks da migration
   20260924233658_coach_interventions; o SQL não importa isto, por isso um
   teste lê a migration e compara (interventionOutcomes.test.ts). */
export const INTERVENTION_ORIGIN = {
  RUN: "run",
  GYM: "gym",
  MEAL: "meal",
  BODY: "body",
  CHECKIN: "checkin",
  LOAD: "load",
} as const;

export const INTERVENTION_OUTCOME = {
  PLANO_AJUSTADO: "plano_ajustado",
  ATLETA_IGNOROU: "atleta_ignorou",
  FALSO_POSITIVO: "falso_positivo",
  // O atleta dispensou o aviso no Início.
  DISPENSADO: "dispensado",
  // Aceitou ou recusou a proposta de objetivos.
  OBJETIVOS_DECIDIDOS: "objetivos_decididos",
  // Só o trigger escreve estes dois: outro aviso abriu por cima, ou fechou sem desfecho.
  SUBSTITUIDO: "substituido",
  RESOLVIDO: "resolvido",
} as const;

/** Os desfechos que a Carol pode dar no chat (resolve_intervention). */
export const CHAT_RESOLVE_OUTCOMES: readonly string[] = [
  INTERVENTION_OUTCOME.PLANO_AJUSTADO,
  INTERVENTION_OUTCOME.ATLETA_IGNOROU,
  INTERVENTION_OUTCOME.FALSO_POSITIVO,
];
const DAY_MS = 86400000;

export interface InterventionRow {
  opened_at: string;
  closed_at?: string | null;
  outcome?: string | null;
  origin?: string | null;
}

const ORIGIN_LABEL: Record<string, string> = {
  [INTERVENTION_ORIGIN.RUN]: "das corridas",
  [INTERVENTION_ORIGIN.GYM]: "do ginásio",
  [INTERVENTION_ORIGIN.MEAL]: "das refeições",
  [INTERVENTION_ORIGIN.BODY]: "das avaliações",
  [INTERVENTION_ORIGIN.CHECKIN]: "dos check-ins",
  [INTERVENTION_ORIGIN.LOAD]: "da carga de treino",
};

/** Ignorado: ele disse que não (atleta_ignorou) ou dispensou-o no Início. */
const IGNORED = new Set<string>([INTERVENTION_OUTCOME.ATLETA_IGNOROU, INTERVENTION_OUTCOME.DISPENSADO]);

function addDays(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** A linha para o prompt, ou null sem avisos nos últimos 60 dias. */
export function interventionOutcomesLine(rows: InterventionRow[] | null | undefined, todayISO: string): string | null {
  const from = addDays(todayISO, -INTERVENTION_WINDOW_DAYS);
  const list = (rows || []).filter((r) => typeof r?.opened_at === "string" && r.opened_at.slice(0, 10) >= from);
  if (!list.length) return null;
  const ignored = list.filter((r) => IGNORED.has(r.outcome ?? ""));
  const falsePositives = list.filter((r) => r.outcome === INTERVENTION_OUTCOME.FALSO_POSITIVO);
  const parts = [
    plural(list.length, "aberto", "abertos"),
    plural(ignored.length, "ignorado", "ignorados"),
    plural(falsePositives.length, "falso alarme", "falsos alarmes"),
  ];
  /* De onde vêm os que não deram em nada, quando se concentram num sítio —
     é aí que o detetor precisa de mais exigência. */
  const byOrigin = new Map<string, number>();
  for (const r of [...ignored, ...falsePositives]) {
    if (r.origin && ORIGIN_LABEL[r.origin]) byOrigin.set(r.origin, (byOrigin.get(r.origin) ?? 0) + 1);
  }
  const [topOrigin, topCount] = [...byOrigin.entries()].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
  const where = topOrigin && topCount >= 2 ? ` Os que não deram em nada vêm sobretudo ${ORIGIN_LABEL[topOrigin]}.` : "";
  return `OS TEUS AVISOS "Preciso de falar contigo" (últimos ${INTERVENTION_WINDOW_DAYS} dias): ${parts.join(", ")}.${where} ` +
    `Serve para calibrares quando chamas por ele — muitos ignorados ou falsos alarmes pedem mais certeza antes de abrir ` +
    `outro. Nunca é assunto de conversa: não lhe digas quantas vezes o chamaste.`;
}
