// Progressão por exercício — melhor 1RM estimado de cada exercício num período
// contra o período anterior equivalente (Ginásio da Evolução, 2026-10-04).
//
// @contexto specs/evolucao-2026-10/plano.md §3 "Ginásio" e D5: o KPI "Vol. Carga"
// e o gráfico "Volume diário" somavam kg de exercícios diferentes (agachamento
// + curl) e não diziam nada sobre progresso. O que se pode comparar sem somar
// maçãs com laranjas é UM exercício contra si próprio: a melhor série (aqui
// medida pelo 1RM estimado, que torna 80 kg × 8 e 85 kg × 5 comparáveis).
//
// FUNÇÕES NOVAS, ao lado das existentes: volumeLoad.ts e muscleGroupVolume.ts
// (que a Carol lê) não são tocadas. Esta fórmula só usa estimate1RM (Epley).
//
// Puro: só strings ISO "YYYY-MM-DD" e números. As janelas chegam já calculadas
// (dias FECHADOS do período — R2, hoje fica de fora), e comparam-se por texto.
//
// Regras (todas para não mostrar uma seta sem base — R5/R6):
//  - só entram séries com carga E repetições (> 0): exercícios de peso do corpo
//    não têm kg para comparar;
//  - o 1RM de uma série é SEMPRE o Epley de weight × reps (1–12 repetições), com
//    uma repetição a valer o próprio peso. `one_rep_max_est` guardado NÃO é usado
//    (2026-10-04, revisão): o analyze-gym grava-o nas séries vindas de fotos
//    (valor que o Gemini lê da coluna 1RM do JEFIT) e no registo manual, mas não
//    nas outras; misturar o guardado com o Epley entre dois períodos dava "▲ 2 kg"
//    só por mudar de régua (80 kg × 8 com 99 guardado em setembro e sem nada em
//    outubro). Os dois lados têm de usar a mesma fórmula. Acima de 12 repetições
//    o Epley deixa de ser fiável e a série fica de fora (não há "melhor série"
//    inventada);
//  - um exercício aparece com pelo menos `minSessions` (2) sessões no período E
//    pelo menos uma sessão válida na janela anterior — sem anterior não há
//    comparação e o exercício só se conta em `withoutPrevious`;
//  - o nome é texto livre (`exercise_name`): compara-se sem maiúsculas, acentos
//    nem espaços a mais ("Supino  reto" = "supino reto").

import { estimate1RM } from "./epley.ts";

export interface ProgressionSet {
  exercise_name?: string | null;
  reps?: number | null;
  weight?: number | null;
  /** Guardado pelo analyze-gym, mas NÃO usado aqui (ver o cabeçalho). */
  one_rep_max_est?: number | null;
}

export interface ProgressionSession {
  date: string;
  kind?: string | null;
  workout_session_sets?: ProgressionSet[] | null;
}

/** Janela de dias, ISO, inclusiva nos dois lados. */
export interface DayWindow {
  from: string;
  to: string;
}

export interface BestSet {
  weight: number;
  reps: number;
}

export interface ExerciseWindowStats {
  /** Sessões da janela com pelo menos uma série válida deste exercício. */
  sessions: number;
  /** Melhor 1RM estimado (kg) da janela. */
  oneRm: number;
  /** A série que deu esse 1RM. */
  bestSet: BestSet;
}

export interface ExerciseProgression {
  key: string;
  name: string;
  current: ExerciseWindowStats;
  previous: ExerciseWindowStats;
  /** current.oneRm − previous.oneRm, em kg (não arredondado). */
  diffKg: number;
}

export interface StrengthProgression {
  rows: ExerciseProgression[];
  /** Exercícios com `minSessions`+ sessões no período mas sem nada válido na
   *  janela anterior: não são comparáveis e não aparecem em `rows`. */
  withoutPrevious: number;
}

/** Acima disto o Epley sobrestima e a série não entra no 1RM. */
export const PROGRESSION_MAX_REPS = 12;
export const PROGRESSION_MIN_SESSIONS = 2;

/** "Supino  Reto " → "supino reto" (sem acentos, maiúsculas nem espaços a mais). */
export function normalizeExerciseName(name: string | null | undefined): string {
  return String(name ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** 1RM estimado de uma série (sempre Epley, ignora `one_rep_max_est`), ou null
 *  se a série não serve para comparar. Uma repetição vale o próprio peso: o
 *  Epley daria "103 kg" a um single de 100 kg. */
export function setOneRepMax(set: ProgressionSet | null | undefined): number | null {
  const weight = Number(set?.weight);
  const reps = Number(set?.reps);
  if (!(weight > 0) || !(reps > 0)) return null;
  if (reps > PROGRESSION_MAX_REPS) return null;
  if (reps === 1) return weight;
  return estimate1RM(weight, reps);
}

const dayOf = (s: ProgressionSession): string | null =>
  typeof s?.date === "string" && s.date.length >= 10 ? s.date.slice(0, 10) : null;

interface Acc {
  names: Map<string, number>;
  sessions: number;
  oneRm: number;
  bestSet: BestSet;
}

/** Por exercício (chave normalizada), os números de uma janela. Aulas não entram. */
function windowStats(sessions: ProgressionSession[], w: DayWindow): Map<string, Acc> {
  const out = new Map<string, Acc>();
  for (const s of sessions || []) {
    if (!s || s.kind === "aula") continue;
    const d = dayOf(s);
    if (!d || d < w.from || d > w.to) continue;
    const seen = new Set<string>();
    for (const set of s.workout_session_sets || []) {
      const rm = setOneRepMax(set);
      if (rm === null) continue;
      const raw = String(set.exercise_name ?? "").trim();
      const key = normalizeExerciseName(raw);
      if (!key) continue;
      let acc = out.get(key);
      if (!acc) {
        acc = { names: new Map(), sessions: 0, oneRm: 0, bestSet: { weight: 0, reps: 0 } };
        out.set(key, acc);
      }
      acc.names.set(raw, (acc.names.get(raw) || 0) + 1);
      if (!seen.has(key)) {
        seen.add(key);
        acc.sessions += 1;
      }
      if (rm > acc.oneRm) {
        acc.oneRm = rm;
        acc.bestSet = { weight: Number(set.weight), reps: Number(set.reps) };
      }
    }
  }
  return out;
}

function displayName(names: Map<string, number>): string {
  let best = "";
  let bestN = -1;
  for (const [n, c] of names) {
    if (c > bestN) {
      best = n;
      bestN = c;
    }
  }
  return best;
}

export function computeExerciseProgression(
  sessions: ProgressionSession[],
  current: DayWindow | null,
  previous: DayWindow | null,
  { minSessions = PROGRESSION_MIN_SESSIONS }: { minSessions?: number } = {},
): StrengthProgression {
  if (!current || current.from > current.to) return { rows: [], withoutPrevious: 0 };
  const cur = windowStats(sessions, current);
  const prev = previous && previous.from <= previous.to ? windowStats(sessions, previous) : new Map<string, Acc>();

  const rows: ExerciseProgression[] = [];
  let withoutPrevious = 0;
  for (const [key, c] of cur) {
    if (c.sessions < minSessions) continue;
    const p = prev.get(key);
    if (!p || p.sessions < 1) {
      withoutPrevious++;
      continue;
    }
    rows.push({
      key,
      name: displayName(c.names),
      current: { sessions: c.sessions, oneRm: c.oneRm, bestSet: c.bestSet },
      previous: { sessions: p.sessions, oneRm: p.oneRm, bestSet: p.bestSet },
      diffKg: c.oneRm - p.oneRm,
    });
  }
  rows.sort((a, b) => b.current.sessions - a.current.sessions || a.name.localeCompare(b.name));
  return { rows, withoutPrevious };
}
