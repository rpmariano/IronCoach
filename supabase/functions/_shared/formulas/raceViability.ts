// Bloco 1 — Objetivo e viabilidade de uma prova.
//
// @doutrina src/coach-knowledge/01-objetivo-viabilidade.md. Fontes: Daniels'
// Running Formula 4th Ed (2021); Faster Road Racing / Advanced Marathoning
// 3rd Ed (Pfitzinger 2014/2019); Hal Higdon Training Programs (2021);
// Training Essentials for Ultrarunning 2nd Ed (Koop, 2021). Confiança: ALTA.
//
// @contexto Migrado de src/utils/raceViability.js (specs/formulas-checklist.md
// Fase E). `MIN_PREP_WEEKS`/`MIN_VOLUME_KM`/`categorizeDistance` já viviam em
// vocabulary.ts (T0) desde a Fase B — usados diretamente daqui.
//
// NOTA — `racePriority` não tem efeito aqui, e ISSO ESTÁ CERTO. O
// comentário original de `assessRaceViability` prometia que
// 'tempo_insuficiente' era "ignorado se tiver base ou B/C race", mas o
// código nunca implementou nenhuma das duas supressões. Ao migrar (Fase F)
// fui à doutrina decidir qual dos dois estava errado, e a resposta é
// inequívoca em ambos os casos — o comentário é que estava mal:
//
//   1. "ignorado se tiver base" — 01-objetivo-viabilidade.md Bloco 1 #1,
//      Condições: "Pressupõe o volume semanal pré-requisito (#2) já
//      cumprido ANTES da primeira semana deste bloco — OS DOIS NÚMEROS
//      SOMAM-SE, NÃO SE SUBSTITUEM." Ter base NÃO dispensa as semanas de
//      preparação; são requisitos independentes e cumulativos.
//   2. "ignorado se B/C race" — a prioridade da prova só tem papel
//      doutrinário no TAPER (02-corrida-prova.md Bloco 2.3 #1: A-race leva
//      taper completo, B/C-race 2-4 dias). Não há nenhuma regra que a faça
//      alterar as semanas mínimas de preparação, e as tabelas
//      MIN_PREP_WEEKS/MIN_VOLUME_KM não têm dimensão de prioridade.
//
// `racePriority` fica na assinatura porque todos os chamadores já o passam
// e removê-lo obrigaria a tocar em cinco sítios sem ganho nenhum — mas não
// é usado, de propósito. A variável local `hasBaseFitness` do original, que
// era calculada e nunca lida, deixou de existir.

import { categorizeDistance, MIN_PREP_WEEKS, MIN_VOLUME_KM } from "./vocabulary.ts";

export interface RunForVolume {
  date: string;
  distance_km?: number | null;
}

/** Volume médio semanal das últimas `weeks` semanas (0 se sem dados). */
export function computeRecentWeeklyVolume(runs: RunForVolume[], todayISO: string, weeks = 4): number {
  if (!Array.isArray(runs) || runs.length === 0) return 0;
  const cutoffMs = new Date(todayISO + "T00:00:00Z").getTime() - weeks * 7 * 86400000;
  const total = runs
    .filter((r) => r.date && new Date(r.date + "T00:00:00Z").getTime() >= cutoffMs)
    .reduce((s, r) => s + (Number(r.distance_km) || 0), 0);
  return Math.round((total / weeks) * 10) / 10;
}

export type ViabilityFlag = "ultra_para_iniciante" | "tempo_insuficiente" | "volume_insuficiente";

export interface RaceViabilityInput {
  distanceKm: number | null;
  experienceLevel: string | null;
  weeksToRace: number;
  weeklyVolumeKm: number | null;
  racePriority?: string;
}

export interface RaceViabilityResult {
  flags: ViabilityFlag[];
  isViable: boolean;
}

export function assessRaceViability(opts: RaceViabilityInput): RaceViabilityResult {
  const { distanceKm, experienceLevel, weeksToRace, weeklyVolumeKm } = opts;
  const flags: ViabilityFlag[] = [];

  // Não avaliar provas já passadas ou de hoje — sem tempo de preparar de qualquer forma.
  if (weeksToRace <= 0) return { flags, isViable: true };

  const cat = categorizeDistance(distanceKm ?? undefined);
  const level = experienceLevel;

  // Sem dados suficientes para avaliar.
  if (!cat || !level || !MIN_PREP_WEEKS[level]) {
    return { flags, isViable: true };
  }

  if (cat === "ultra" && level === "iniciante") {
    flags.push("ultra_para_iniciante");
  }

  const minWeeks = MIN_PREP_WEEKS[level]?.[cat];
  const minVol = MIN_VOLUME_KM[level]?.[cat];

  if (minVol != null && weeklyVolumeKm != null && weeklyVolumeKm < minVol) {
    flags.push("volume_insuficiente");
  }

  if (minWeeks != null && weeksToRace < minWeeks) {
    flags.push("tempo_insuficiente");
  }

  return { flags, isViable: flags.length === 0 };
}
