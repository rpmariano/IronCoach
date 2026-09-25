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
const DAY_MS = 86400000;

export interface InterventionRow {
  opened_at: string;
  closed_at?: string | null;
  outcome?: string | null;
  origin?: string | null;
}

const ORIGIN_LABEL: Record<string, string> = {
  run: "das corridas",
  gym: "do ginásio",
  meal: "das refeições",
  body: "das avaliações",
  checkin: "dos check-ins",
  load: "da carga de treino",
};

/** Ignorado: ele disse que não (atleta_ignorou) ou dispensou-o no Início. */
const IGNORED = new Set(["atleta_ignorou", "dispensado"]);

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
  const falsePositives = list.filter((r) => r.outcome === "falso_positivo");
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
