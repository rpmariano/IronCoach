// Volume-carga (kg) de ginásio ao longo de um período, com quebra semanal e
// ACWR de ginásio (rácio agudo:crónico sobre volume-carga em kg — a mesma
// classificação do ACWR de corrida, mas com "carga" a significar kg em vez
// de km).
//
// @contexto Migrado de src/utils/biEngine.js calculateVolumeLoad
// (specs/formulas-checklist.md Fase E). O ACWR usa sempre TODAS as sessões
// (não só as do período selecionado no dashboard) — compara sempre as
// últimas 4 semanas a contar de hoje, independentemente do que o atleta
// esteja a ver no ecrã; só o total/quebra semanal respeitam `range`.

import { classifyAcwrZone } from "./acwr.ts";
import { computeSessionVolumeKg, type SessionForVolume } from "./sessionVolumeKg.ts";
import { filterByRelativeDateRange, type RelativeDateRange } from "./relativeDateRange.ts";

export interface SessionForVolumeLoad extends SessionForVolume {
  date: string;
}

export interface WeekVolumeLoad {
  weekLabel: string; // segunda-feira da semana, YYYY-MM-DD
  volumeLoad: number;
}

export interface GymVolumeLoad {
  totalVolumeLoad: number;
  weeklyBreakdown: WeekVolumeLoad[];
  acwr: number;
  acwrStatus: ReturnType<typeof classifyAcwrZone>;
  acwrHasEnoughData: boolean;
}

// Mesma janela do ACWR de corrida (_shared/formulas/acwr.ts): 7 dias agudo,
// 28 dias (4 semanas) crónico.
const ACUTE_WINDOW_DAYS = 7;
const CHRONIC_WINDOW_DAYS = 28;

function mondayOfWeek(dateISO: string): string {
  const d = new Date(dateISO + "T00:00:00Z");
  const dow = d.getUTCDay();
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + diffToMonday);
  return d.toISOString().slice(0, 10);
}

function subDaysISO(dateISO: string, days: number): string {
  const d = new Date(dateISO + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export function computeGymVolumeLoad(
  sessions: SessionForVolumeLoad[],
  todayISO: string,
  range: string,
): GymVolumeLoad {
  const filtered = filterByRelativeDateRange(sessions, todayISO, range as RelativeDateRange);

  let totalVolumeLoad = 0;
  const weeks: Record<string, WeekVolumeLoad> = {};
  for (const s of filtered) {
    const vl = computeSessionVolumeKg(s);
    totalVolumeLoad += vl;
    const weekStart = mondayOfWeek(s.date);
    if (!weeks[weekStart]) weeks[weekStart] = { weekLabel: weekStart, volumeLoad: 0 };
    weeks[weekStart].volumeLoad += vl;
  }
  const weeklyBreakdown = Object.values(weeks).sort((a, b) => a.weekLabel.localeCompare(b.weekLabel));

  const acuteCutoff = subDaysISO(todayISO, ACUTE_WINDOW_DAYS);
  const chronicCutoff = subDaysISO(todayISO, CHRONIC_WINDOW_DAYS);
  let acuteLoad = 0;
  let chronicLoad = 0;
  for (const s of sessions) {
    if (!(s.date > chronicCutoff)) continue;
    const vl = computeSessionVolumeKg(s);
    chronicLoad += vl;
    if (s.date > acuteCutoff) acuteLoad += vl;
  }
  // "Dados suficientes" = existe pelo menos uma sessão com 7+ dias (fora da
  // janela aguda) em TODO o histórico — não confundir com "há sessões
  // recentes". Sem isto, um atleta que só começou a treinar esta semana
  // teria um ACWR "calculável" mas sem nenhuma base crónica real por trás.
  const hasEnoughData = sessions.some((s) => !(s.date > acuteCutoff));
  const chronicAvg = chronicLoad / 4;
  const ratio = chronicAvg > 0 ? acuteLoad / chronicAvg : 0;

  return {
    totalVolumeLoad,
    weeklyBreakdown,
    acwr: ratio,
    acwrStatus: classifyAcwrZone(ratio),
    acwrHasEnoughData: hasEnoughData,
  };
}
