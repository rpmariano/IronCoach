// O objetivo de um exercício do plano ("chegar às 12 reps", "20 min", "8 km",
// "5:30/km") julgado contra o que foi feito — decisão 9 de
// specs/plano-registo-plano-coach.md §6: a Carol infere o que se mede, o
// atleta confirma o que é qualitativo ("descida em 3 s").
//
// Conservador de propósito: só há veredicto quando o objetivo INTEIRO é uma
// medida que conhecemos. Se sobra qualquer palavra ou número fora dela ("12
// reps com RIR 2", "8 km em 45 min"), é qualitativo ou misto e quem o decide
// é o atleta — melhor perguntar do que dar um "cumprido" que ninguém viu.
// Puro e partilhado: o servidor usa-o ao ler a execução e o cliente para saber
// se mostra o "Cumpriste?".

export type GoalKind = "reps" | "minutos" | "km" | "metros" | "ritmo";

export interface GoalTarget {
  kind: GoalKind;
  /** reps | minutos | km | metros; no ritmo, segundos por km. */
  value: number;
}

export interface GoalSet {
  reps?: number | null;
  duration_seconds?: number | null;
  distance_km?: number | null;
}

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

// Palavras de enchimento que não mudam o sentido da medida.
const FILLER = new Set([
  "chegar", "as", "a", "ate", "em", "todas", "todos", "cada", "serie", "series", "de", "minimo",
  "pelo", "menos", "fazer", "completar", "conseguir", "aos", "no", "na", "o", "e", "total",
]);

const num = (s: string) => Number(s.replace(",", "."));

const PATTERNS: Array<{ kind: GoalKind; re: RegExp; value: (m: RegExpExecArray) => number }> = [
  { kind: "ritmo", re: /(\d{1,2}):(\d{2})\s*(?:\/|por\s*)\s*km\b/, value: (m) => Number(m[1]) * 60 + Number(m[2]) },
  { kind: "km", re: /(\d+(?:[.,]\d+)?)\s*km\b/, value: (m) => num(m[1]) },
  { kind: "metros", re: /(\d{3,5})\s*m(?:etros?)?\b/, value: (m) => Number(m[1]) },
  { kind: "minutos", re: /(\d+(?:[.,]\d+)?)\s*(?:min|minutos?)\b/, value: (m) => num(m[1]) },
  // "10-12 reps" exige o mínimo do intervalo; "chegar às 12" sozinho também conta.
  { kind: "reps", re: /(\d{1,3})(?:\s*(?:-|a)\s*\d{1,3})?\s*(?:reps?|repeticoes)\b/, value: (m) => Number(m[1]) },
  { kind: "reps", re: /chegar\s+(?:as|a)\s+(\d{1,3})\b(?!\s*series?\b)/, value: (m) => Number(m[1]) },
];

/** A medida do objetivo, ou null se for qualitativo/misto/vazio. */
export function parseGoalTarget(goal: unknown): GoalTarget | null {
  if (typeof goal !== "string") return null;
  const t = norm(goal);
  if (!t) return null;
  for (const p of PATTERNS) {
    const m = p.re.exec(t);
    if (!m) continue;
    const value = p.value(m);
    if (!Number.isFinite(value) || value <= 0) return null;
    const rest = (t.slice(0, m.index) + " " + t.slice(m.index + m[0].length))
      .replace(/[^a-z0-9]+/g, " ").split(" ").filter((w) => w && !FILLER.has(w));
    return rest.length ? null : { kind: p.kind, value };
  }
  return null;
}

/** O objetivo mede-se pelos números do registo? */
export function isMeasurableGoal(goal: unknown): boolean {
  return parseGoalTarget(goal) !== null;
}

const pos = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);

/** true / false quando o objetivo é mensurável e há números para o julgar;
 *  null quando é qualitativo ou o registo não tem o que a medida pede. */
export function inferGoalMet(goal: unknown, sets: GoalSet[] | null | undefined): boolean | null {
  const target = parseGoalTarget(goal);
  if (!target || !Array.isArray(sets)) return null;
  const seconds = sets.reduce((a, s) => a + pos(s?.duration_seconds), 0);
  const km = sets.reduce((a, s) => a + pos(s?.distance_km), 0);
  switch (target.kind) {
    case "reps": {
      const reps = sets.map((s) => pos(s?.reps)).filter((r) => r > 0);
      return reps.length ? reps.every((r) => r >= target.value) : null;
    }
    case "minutos":
      return seconds > 0 ? seconds >= target.value * 60 : null;
    case "km":
      return km > 0 ? km >= target.value : null;
    case "metros":
      return km > 0 ? km * 1000 >= target.value : null;
    case "ritmo":
      return seconds > 0 && km > 0 ? seconds / km <= target.value : null;
  }
}
