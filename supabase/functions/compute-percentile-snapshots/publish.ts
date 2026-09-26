// A publicação de uma janela — o miolo puro da compute-percentile-snapshots.
//
// Separado do handler (2026-09-25) para se poder testar com uma população
// sintética: com dois atletas em beta, nenhum segmento chega aos 20 e o
// caminho que publica nunca correu a sério. Os testes (publish.test.ts)
// passam por aqui 60 atletas inventados, com planos e treinos, pelo mesmo
// cálculo que a produção usa — sem tocar na base de dados de ninguém.

import {
  evaluatePrescriptions,
  executionBase,
  executionScore,
  type GymRow,
  type PlanItemRow,
  type RunRow,
} from "../_shared/formulas/prescriptionAdherence.ts";
import {
  MIN_SEGMENT_SIZE,
  nBand,
  segmentKey,
  terrainForAthlete,
  ventileBoundaries,
  type Window,
  WINDOW_DAYS,
} from "../_shared/formulas/percentileSegments.ts";

export const METRIC = "plan_execution";

/** Quantos atletas tem cada tabela com nomes. */
export const LEADERBOARD_SIZE = 10;

/** Um atleta do universo, JÁ sem data de nascimento: só o escalão derivado. */
export interface Athlete {
  id: string;
  ageBand: string;
  gender: "F" | "M";
  /** Aceitou aparecer nas tabelas com o nome abreviado. */
  leaderboard: boolean;
}

export interface AthleteData {
  items: PlanItemRow[];
  runs: RunRow[];
  gym: GymRow[];
  races: Array<{ id?: string | null; date: string; race_type: string | null; race_priority?: string | null }>;
}

export interface ScoredAthlete extends Athlete {
  terrain: "estrada" | "trail";
  score: number;
}

/* 4) e 5) — o índice de cada um e a modalidade onde ele conta. Fica de fora
   quem não prepara prova nenhuma (sem modalidade) e quem não teve plano na
   janela: um 0 aí dizia "cumpriu nada" e puxava a distribuição para baixo
   com quem nem plano tinha. */
export function scoreAthletes(
  athletes: Athlete[],
  dataOf: (id: string) => AthleteData,
  window: Window,
): ScoredAthlete[] {
  const out: ScoredAthlete[] = [];
  for (const a of athletes) {
    const d = dataOf(a.id);
    const terrain = terrainForAthlete(d.races, window.end);
    if (!terrain) continue;
    const resumo = evaluatePrescriptions({ items: d.items, runs: d.runs, gym: d.gym, mealsByDate: {} }, window.end, WINDOW_DAYS);
    if (executionBase(resumo.counts) <= 0) continue;
    out.push({ ...a, terrain, score: executionScore(resumo.counts) });
  }
  return out;
}

export interface SnapshotInsert {
  metric: string;
  age_band: string;
  gender: string;
  terrain: string;
  window_start: string;
  window_end: string;
  n_band: string;
  n: number;
  boundaries: number[];
}

export interface EntryInsert {
  metric: string;
  window_start: string;
  window_end: string;
  age_band: string;
  gender: string;
  terrain: string;
  user_id: string;
  rank: number;
  score: number;
}

/* 6) Só os segmentos com pelo menos k pessoas — e as tabelas só desses.
   A tabela de um segmento é o top 10 de quem aceitou aparecer, pelo índice;
   empates desempatam pelo id (estável, e não diz nada sobre ninguém). */
export function buildPublication(scored: ScoredAthlete[], window: Window): {
  snapshots: SnapshotInsert[];
  entries: EntryInsert[];
  belowK: number;
} {
  const segments = new Map<string, ScoredAthlete[]>();
  for (const a of scored) {
    const k = segmentKey({ ageBand: a.ageBand, gender: a.gender, terrain: a.terrain });
    segments.set(k, [...(segments.get(k) || []), a]);
  }

  const snapshots: SnapshotInsert[] = [];
  const entries: EntryInsert[] = [];
  let belowK = 0;
  for (const members of segments.values()) {
    if (members.length < MIN_SEGMENT_SIZE) { belowK++; continue; }
    const { ageBand, gender, terrain } = members[0];
    snapshots.push({
      metric: METRIC,
      age_band: ageBand,
      gender,
      terrain,
      window_start: window.start,
      window_end: window.end,
      n_band: nBand(members.length),
      n: members.length,
      boundaries: ventileBoundaries(members.map((m) => m.score)),
    });
    members
      .filter((m) => m.leaderboard)
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
      .slice(0, LEADERBOARD_SIZE)
      .forEach((m, i) => entries.push({
        metric: METRIC,
        window_start: window.start,
        window_end: window.end,
        age_band: ageBand,
        gender,
        terrain,
        user_id: m.id,
        rank: i + 1,
        score: Math.round(m.score * 10) / 10,
      }));
  }
  return { snapshots, entries, belowK };
}
