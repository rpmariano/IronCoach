// A leitura do volume para uma prova — uma só, para o hub e para a Carol
// (#113/#114, decisão do Rui de 2026-11-06: «a app não pode pedir mais km
// por um lado e proibi-los por outro»).
//
// Antes eram dois avisos que se contradiziam: o hub dizia «Volume de treino
// insuficiente» (assessRaceViability, o volume médio contra o MIN_VOLUME_KM
// do nível), e o plano da Carol, preso à guarda de carga, não podia dar mais
// km. Agora a leitura diz três números — o volume de hoje, o que o nível pede
// para a distância e o que o plano aceite projeta para a semana da prova — e,
// quando o projetado não chega, isso é uma leitura («vai ser para completar,
// não para fazer tempo»), não uma falha do atleta.
//
// Puro (sem relógio, sem store): o chamador dá `todayISO`.

import { categorizeDistance, MIN_VOLUME_KM, type RaceDistanceCategory } from "./vocabulary.ts";
import { isWalkPlanItem, runsOnly } from "./runKinds.ts";
import { computeVdotTrend, type RunForVdot } from "./vdotTrend.ts";

export interface OutlookRun extends RunForVdot {
  date: string;
  distance_km: number | null;
}

export interface OutlookPlanItem {
  planned_date: string;
  kind: string;
  training_type?: string | null;
  status?: string | null;
  target_distance_km?: number | string | null;
  target_duration_min?: number | string | null;
}

export interface OutlookRace {
  date: string;
  distance_km: number | string | null;
  experience_level?: string | null;
  name?: string | null;
}

export type ExperienceLevelKey = "iniciante" | "basico" | "medio" | "avancado";

export interface RaceVolumeOutlook {
  category: RaceDistanceCategory | null;
  level: string | null;
  /** O volume de hoje: a 2.ª semana (7 dias rolantes) mais alta das últimas 4
   *  — a mesma leitura da triagem do nível. null com menos de 3 semanas. */
  currentWeeklyKm: number | null;
  /** O que o nível declarado pede para a distância (MIN_VOLUME_KM). */
  recommendedWeeklyKm: number | null;
  /** A mesma leitura na véspera da prova, com o plano aceite cumprido. null
   *  sem plano para lá de hoje (aí conta o de hoje). */
  projectedWeeklyKm: number | null;
  /** «chega»: o projetado (ou o de hoje) chega ao recomendado; «abaixo»: não
   *  chega — uma leitura, não uma falha; «sem_dados»: sem nível, distância
   *  ou histórico. */
  status: "chega" | "abaixo" | "sem_dados";
  /** Quanto falta, em km/semana (0 quando chega). */
  gapKm: number;
  /** O sinal positivo, só para o texto: o nível que o ritmo já tem (o melhor
   *  VDOT das últimas 12 semanas, doutrina 00-niveis-experiencia). */
  vdot: number | null;
  vdotDate: string | null;
  paceLevel: ExperienceLevelKey | null;
}

/** Os níveis pelo VDOT (src/coach-knowledge/00-niveis-experiencia.md):
 *  <30 Iniciante, 30–38 Básico, 38–50 Médio, >50 Avançado. */
export function levelFromVdot(vdot: number | null | undefined): ExperienceLevelKey | null {
  const v = Number(vdot);
  if (!(v > 0)) return null;
  if (v < 30) return "iniciante";
  if (v < 38) return "basico";
  if (v <= 50) return "medio";
  return "avancado";
}

function addDaysISO(dateISO: string, days: number): string {
  const d = new Date(dateISO + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

type DayKm = { date: string; km: number };

/** A 2.ª semana mais alta das 4 de 7 dias que acabam em `asOfISO`; null com
 *  menos de 3 semanas com corridas (a regra da triagem e do ACWR). */
export function secondHighestWeeklyKm(days: DayKm[], asOfISO: string): number | null {
  const weeks = [0, 1, 2, 3].map((w) => {
    const end = addDaysISO(asOfISO, -7 * w);
    const start = addDaysISO(end, -6);
    const inWeek = days.filter((d) => d.date >= start && d.date <= end && d.km > 0);
    return { km: inWeek.reduce((s, d) => s + d.km, 0), has: inWeek.length > 0 };
  });
  if (weeks.filter((w) => w.has).length < 3) return null;
  const sorted = weeks.map((w) => w.km).sort((a, b) => b - a);
  return Math.round(sorted[1] * 10) / 10;
}

/** Os km que um item de corrida do plano soma: os indicados, ou pela duração
 *  a 6 min/km. Caminhadas, cancelados e feitos (já estão nas corridas) fora. */
function plannedKm(i: OutlookPlanItem): number {
  if (i.kind !== "corrida" || isWalkPlanItem(i as never) || i.status === "cancelado" || i.status === "feito") return 0;
  const km = Number(i.target_distance_km) || 0;
  const min = Number(i.target_duration_min) || 0;
  return km > 0 ? km : min > 0 ? min / 6 : 0;
}

/**
 * A leitura do volume para `race`. `runs` são as corridas registadas
 * (caminhadas saem); `planItems` os treinos do plano aceite — os de hoje em
 * diante contam como feitos na projeção, as provas antes desta incluídas (a
 * carga é real), a própria prova não (é no dia dela, fora da semana).
 */
export function raceVolumeOutlook(
  { race, runs, planItems, todayISO }: { race: OutlookRace; runs: OutlookRun[] | null | undefined; planItems?: OutlookPlanItem[] | null; todayISO: string },
): RaceVolumeOutlook {
  const km = Number(race?.distance_km);
  const category = km > 0 ? categorizeDistance(km) : null;
  const level = race?.experience_level ?? null;
  const recommended = category && level && MIN_VOLUME_KM[level] ? MIN_VOLUME_KM[level][category] : null;

  const done: DayKm[] = runsOnly(runs || [])
    .filter((r) => typeof r?.date === "string" && r.date.slice(0, 10) <= todayISO)
    .map((r) => ({ date: r.date.slice(0, 10), km: Number(r.distance_km) || 0 }));
  const ranToday = done.some((d) => d.date === todayISO && d.km > 0);
  const current = secondHighestWeeklyKm(done, todayISO);

  const eve = typeof race?.date === "string" ? addDaysISO(race.date.slice(0, 10), -1) : null;
  const future: DayKm[] = (planItems || [])
    .filter((i) => typeof i?.planned_date === "string" && (i.planned_date > todayISO || (i.planned_date === todayISO && !ranToday)))
    .filter((i) => !eve || i.planned_date <= eve)
    .map((i) => ({ date: i.planned_date, km: plannedKm(i) }))
    .filter((d) => d.km > 0);
  const projected = eve && eve > todayISO && future.length ? secondHighestWeeklyKm([...done, ...future], eve) : null;

  // O sinal positivo do ritmo: o melhor VDOT das últimas 12 semanas.
  const since = addDaysISO(todayISO, -84);
  const recent = computeVdotTrend(runs || []).filter((p) => p.date >= since && p.date <= todayISO);
  const best = recent.reduce<{ vdot: number; date: string } | null>((b, p) => (!b || p.vdot > b.vdot ? { vdot: p.vdot, date: p.date } : b), null);

  const reading = projected ?? current;
  const status = recommended == null || reading == null ? "sem_dados" : reading >= recommended ? "chega" : "abaixo";
  return {
    category,
    level,
    currentWeeklyKm: current,
    recommendedWeeklyKm: recommended,
    projectedWeeklyKm: projected,
    status,
    gapKm: status === "abaixo" ? Math.round((recommended! - reading!) * 10) / 10 : 0,
    vdot: best ? Math.round(best.vdot * 10) / 10 : null,
    vdotDate: best?.date ?? null,
    paceLevel: levelFromVdot(best?.vdot),
  };
}
