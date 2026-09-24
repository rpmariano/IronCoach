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

import { categorizeDistance, LEVEL_WEEKLY_KM_RANGE, MIN_PREP_WEEKS, MIN_VOLUME_KM } from "./vocabulary.ts";
import { computeRunAcwr } from "./runAcwr.ts";

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

/** O volume semanal que a app conhece de facto: a média das últimas 4
 *  semanas, só com histórico (corridas em 3 das 4 semanas, a regra de
 *  runAcwr.ts). Sem ele, null — "sem dados para julgar" (pedido 2026-09-24:
 *  "se a app não tem dados, não apresenta dados"). Antes, 3 corridas em 4
 *  semanas davam ~5 km/semana e "volume insuficiente" para um 10 km a quem
 *  corre mais do que regista. */
export function knownWeeklyVolume(runs: RunForVolume[], todayISO: string): number | null {
  const list = (runs || []).filter((r) => r && typeof r.date === "string")
    .map((r) => ({ date: r.date.slice(0, 10), distance_km: Number(r.distance_km) || 0 }));
  if (!computeRunAcwr(list, todayISO).hasEnoughData) return null;
  const v = computeRecentWeeklyVolume(list, todayISO, 4);
  return v > 0 ? v : null;
}

/** O volume de referência do nível do perfil, para quando a app não conhece o
 *  volume de facto (pedido 2026-09-24: "ela já conhece o meu nível de
 *  experiência"). Duas coisas diferentes, que a primeira versão confundia
 *  (revisão pré-deploy de 195bb0d):
 *  - `start`: o volume de PARTIDA — o limite inferior do intervalo do nível
 *    (LEVEL_WEEKLY_KM_RANGE, Bloco 0 #1). Um iniciante corre 15-25 km/semana;
 *  - `target`: o volume a ATINGIR até à prova — o pré-requisito da doutrina
 *    para o nível e a distância dela (MIN_VOLUME_KM, Bloco 1 #2). Com uma
 *    maratona, 35 km/semana para um iniciante é onde chegar, não de onde
 *    partir. null sem prova.
 *  null sem nível. */
export function levelReferenceWeeklyKm(
  level: string | null | undefined,
  raceDistanceKm: number | null | undefined,
): { start: number; range: [number, number]; target: number | null; category: string | null } | null {
  if (!level || !LEVEL_WEEKLY_KM_RANGE[level]) return null;
  const range = LEVEL_WEEKLY_KM_RANGE[level];
  const category = raceDistanceKm != null ? categorizeDistance(raceDistanceKm) : null;
  const target = category ? MIN_VOLUME_KM[level]?.[category] ?? null : null;
  return { start: range[0], range, target, category: category ?? null };
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
