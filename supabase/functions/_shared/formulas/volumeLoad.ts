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
import { RUN_ACWR_MIN_HISTORY_WEEKS } from "./runAcwr.ts";
import { computeSessionVolumeKg, type SessionForVolume } from "./sessionVolumeKg.ts";
import { filterByRelativeDateRange, type RelativeDateRange } from "./relativeDateRange.ts";

export interface SessionForVolumeLoad extends SessionForVolume {
  date: string;
  // 'aula' não é treino de força: não conta como histórico do ACWR de kg.
  kind?: string | null;
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
  /** Quantas das 4 semanas da janela crónica têm treino de força com carga
   *  (G5, 2026-10-04) — o mesmo conceito do `historyWeeks` do ACWR de corrida. */
  historyWeeks: number;
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

function addDaysISO(dateISO: string, days: number): string {
  return subDaysISO(dateISO, -days);
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
  // "Dados suficientes" (G5, 2026-10-04): a MESMA regra do ACWR de corrida
  // (runAcwr.ts, RUN_ACWR_MIN_HISTORY_WEEKS) — treino de força com carga em
  // pelo menos 3 das 4 semanas da janela crónica. Antes bastava UMA sessão
  // com 7+ dias em todo o histórico (mesmo de há meses): 2 sessões davam
  // "Perigo" (2,0-4,0), porque o crónico divide sempre por 4 mesmo com
  // menos de 4 semanas de histórico, e o rácio sobe sozinho. Semanas como
  // em runAcwr: as 4 da janela crónica (hoje−27 .. hoje), da mais antiga à
  // de hoje. Conta só força com volume > 0 (o equivalente a km > 0 na
  // corrida): uma aula, ou uma sessão sem carga, não sustenta um rácio em kg.
  const chronicStart = subDaysISO(todayISO, CHRONIC_WINDOW_DAYS - 1);
  const loaded = sessions.filter(
    (s) => s.kind !== "aula" && s.date && s.date >= chronicStart && s.date <= todayISO && computeSessionVolumeKg(s) > 0,
  );
  let historyWeeks = 0;
  for (let w = 0; w < 4; w++) {
    const from = addDaysISO(chronicStart, w * 7);
    const to = addDaysISO(chronicStart, w * 7 + 6);
    if (loaded.some((s) => s.date >= from && s.date <= to)) historyWeeks++;
  }
  const hasEnoughData = historyWeeks >= RUN_ACWR_MIN_HISTORY_WEEKS;
  const chronicAvg = chronicLoad / 4;
  const ratio = chronicAvg > 0 ? acuteLoad / chronicAvg : 0;

  return {
    totalVolumeLoad,
    weeklyBreakdown,
    acwr: ratio,
    acwrStatus: classifyAcwrZone(ratio),
    acwrHasEnoughData: hasEnoughData,
    historyWeeks,
  };
}
