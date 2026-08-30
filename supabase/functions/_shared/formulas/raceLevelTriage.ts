// Bloco 8 — Motor de triagem do nível de um atleta PARA UMA PROVA CONCRETA.
//
// @doutrina src/coach-knowledge/08-nivel-por-prova-trail.md
// @contexto specs/nivel-por-prova.md — motiva e desenha este módulo por
// inteiro; ler antes de alterar qualquer limiar aqui.
//
// Dois eixos independentes, cada um bandeado contra a PRÓPRIA prova (não
// contra tabelas absolutas):
//   - Tempo em Pé semanal, como % do tempo previsto da prova.
//   - D+ semanal, como % do D+ da prova (só se aplica a trail).
// O nível final é o MÍNIMO dos dois — mesma regra de desempate do Bloco 0
// #2 ("desce para o critério mais baixo, nunca sobe"), aplicada aos dois
// eixos do trail. Resolve por construção o caso que motivou este módulo:
// um maratonista com motor cardiovascular alto mas D+ semanal quase nulo
// NÃO herda "avançado" para uma prova de trail — o eixo de D+ puxa-o para
// baixo sozinho, sem precisar de uma regra especial.

import type { ExperienceLevel } from "./vocabulary.ts";

// "Abaixo de Iniciante" é um estado próprio, não um erro: é o piso que a
// doutrina #3 marca como Red Flag (equivalente ao ICE < 0,40 proposto nas
// fontes) — sinaliza que o atleta não tem, para ESTA prova, nem a
// infraestrutura de Iniciante.
export type LevelBand = "sub_iniciante" | ExperienceLevel;

const LEVEL_ORDER: LevelBand[] = ["sub_iniciante", "iniciante", "basico", "medio", "avancado"];

function levelIndex(level: LevelBand): number {
  return LEVEL_ORDER.indexOf(level);
}

/** O mais baixo dos dois — a regra de desempate do Bloco 0 #2. */
export function minLevel(a: LevelBand, b: LevelBand): LevelBand {
  return levelIndex(a) <= levelIndex(b) ? a : b;
}

// ─── Bandas — Bloco 8 #3 ────────────────────────────────────────────────
// Pisos DOUTRINÁRIOS (Koop; UESCA Manual; norma CTS — ver
// specs/coach-investigacao.md BLOCO 8 #3): 70/90/-/140% (tempo em pé, falta
// o 90-110% inteiro) e 30/50/-/100% (D+, falta o 70-80%). A EXTENSÃO de
// cada banda até ao piso da seguinte — o que fecha esses buracos — é
// DECISÃO DE PROJETO, não doutrina (ver specs/nivel-por-prova.md,
// "Decisões de projeto sobre estas respostas" #1): deriva do mesmo
// princípio de segurança já aplicado em EXPERIENCE_TIEBREAK_HINT
// (src/utils/experience.js) e em getTaperDays (taper.ts) — na dúvida, o
// resultado mais seguro. Fechadas em baixo, abertas em cima: um valor
// exatamente no piso pertence à banda que esse piso abre, nunca à anterior.
// Exportadas (não só internas a bandFromPct): ExperienceLevelHelp.jsx
// mostra-as ao atleta como tabela de referência para trail — os mesmos
// números que classificam, não uma cópia que possa divergir.
export const TIME_ON_FEET_FLOORS_PCT = { iniciante: 70, basico: 90, medio: 110, avancado: 140 } as const;
export const ELEVATION_FLOORS_PCT = { iniciante: 30, basico: 50, medio: 80, avancado: 100 } as const;

function bandFromPct(pct: number, floors: Record<ExperienceLevel, number>): LevelBand {
  if (pct < floors.iniciante) return "sub_iniciante";
  if (pct < floors.basico) return "iniciante";
  if (pct < floors.medio) return "basico";
  if (pct < floors.avancado) return "medio";
  return "avancado";
}

/**
 * Banda de Tempo em Pé: `weeklySeconds` (a leitura de pico — ver
 * `secondHighestOfLast4Weeks` abaixo) como % de `raceTimeSecondsPrevisto`
 * (a previsão de tempo da PRÓPRIA prova — ver `getRacePrediction` em
 * racePlanning.ts, o único uso sancionado da conversão trail→plano para
 * este fim, Bloco 8 #4).
 */
export function bandTimeOnFeet(
  weeklySeconds: number | null | undefined,
  raceTimeSecondsPrevisto: number | null | undefined,
): LevelBand | null {
  if (weeklySeconds == null || !(Number(raceTimeSecondsPrevisto) > 0)) return null;
  const pct = (Number(weeklySeconds) / Number(raceTimeSecondsPrevisto)) * 100;
  return bandFromPct(pct, TIME_ON_FEET_FLOORS_PCT);
}

/**
 * Banda de D+: `weeklyElevationM` (idem, leitura de pico) como % do D+ da
 * prova. Só se aplica a trail — em estrada `raceElevationM` é 0/null e a
 * função devolve null (ver "Âmbito" em specs/nivel-por-prova.md).
 */
export function bandElevation(
  weeklyElevationM: number | null | undefined,
  raceElevationM: number | null | undefined,
): LevelBand | null {
  if (weeklyElevationM == null || !(Number(raceElevationM) > 0)) return null;
  const pct = (Number(weeklyElevationM) / Number(raceElevationM)) * 100;
  return bandFromPct(pct, ELEVATION_FLOORS_PCT);
}

// ─── Leitura de pico das últimas 4 semanas ──────────────────────────────

export interface RunForTriage {
  date: string;
  duration_seconds?: number | null;
  /** Já achatado a partir de runs.details.elevation_gain_m pelo chamador. */
  elevation_gain_m?: number | null;
}

export interface WeeklyBucket {
  startISO: string;
  endISO: string;
  timeOnFeetSeconds: number;
  elevationGainM: number;
  runsCount: number;
}

function addDaysISO(dateISO: string, days: number): string {
  const d = new Date(dateISO + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * 4 janelas ROLANTES de 7 dias terminando em `todayISO` (não semanas de
 * calendário) — mesma convenção de `computeRecentWeeklyVolume`
 * (raceViability.ts), que este motor complementa em vez de substituir.
 * `buckets[0]` é a mais recente.
 */
export function computeLast4WeeklyBuckets(runs: RunForTriage[], todayISO: string): WeeklyBucket[] {
  const list = Array.isArray(runs) ? runs : [];
  const buckets: WeeklyBucket[] = [];
  for (let w = 0; w < 4; w++) {
    const endISO = addDaysISO(todayISO, -7 * w);
    const startISO = addDaysISO(todayISO, -7 * w - 6);
    const inRange = list.filter((r) => r.date && r.date >= startISO && r.date <= endISO);
    buckets.push({
      startISO,
      endISO,
      timeOnFeetSeconds: inRange.reduce((s, r) => s + (Number(r.duration_seconds) || 0), 0),
      elevationGainM: inRange.reduce((s, r) => s + (Number(r.elevation_gain_m) || 0), 0),
      runsCount: inRange.length,
    });
  }
  return buckets;
}

/**
 * "2.ª semana mais alta das últimas 4" — DECISÃO DE PROJETO, não doutrina
 * (specs/nivel-por-prova.md, decisão #2). A doutrina #3 pede o microciclo
 * de PICO; a média das últimas 4 semanas sub-avaliaria sistematicamente
 * face a esse alvo. A 2.ª mais alta mantém a leitura orientada ao pico e
 * exclui por construção uma rajada isolada (nunca pode ser a 2.ª mais
 * alta) sem inventar um limiar de "rajada" que não vem das fontes.
 *
 * Exige pelo menos 3 das 4 semanas COM REGISTO (`runsCount > 0`) — com
 * menos, não há amostra para distinguir pico de rajada; devolve `null`
 * ("não avaliável"), que o chamador trata como piso de segurança.
 */
export function secondHighestOfLast4Weeks(
  buckets: WeeklyBucket[],
  metric: "timeOnFeetSeconds" | "elevationGainM",
): number | null {
  const weeksWithData = buckets.filter((b) => b.runsCount > 0).length;
  if (weeksWithData < 3) return null;
  const sorted = buckets.map((b) => b[metric]).sort((a, b) => b - a);
  return sorted[1];
}

// ─── Composição ──────────────────────────────────────────────────────────

export interface RaceLevelTriageInput {
  runs: RunForTriage[];
  todayISO: string;
  /** Previsão de tempo da prova, em segundos — ver getRacePrediction. */
  raceTimeSecondsPrevisto: number | null;
  /** D+ da prova, em metros. 0/null em estrada — desliga o eixo de D+. */
  raceElevationM: number | null;
}

export interface RaceLevelTriageResult {
  /** Leitura de pico (ver secondHighestOfLast4Weeks) — null se não avaliável. */
  peakTimeOnFeetSeconds: number | null;
  /** Idem, em D+. Calculado independentemente de a prova ter D+ ou não — é
   * só o pico do ATLETA; bandElevation é que decide se se aplica. */
  peakElevationM: number | null;
  timeOnFeetBand: LevelBand | null;
  elevationBand: LevelBand | null;
  /** min(timeOnFeetBand, elevationBand) — null se nenhum eixo for avaliável. */
  level: LevelBand | null;
  weeksWithData: number;
}

/**
 * Nível medido do atleta PARA ESTA PROVA, a partir do histórico de treino
 * — não perguntado, calculado. A auto-declaração do atleta continua a
 * decidir (este resultado é proposta, não veredicto — ver
 * "Interação com a auto-declaração" em specs/nivel-por-prova.md), mas
 * passa a existir uma medição independente para a confirmar ou contradizer.
 */
export function assessRaceLevelTriage(input: RaceLevelTriageInput): RaceLevelTriageResult {
  const buckets = computeLast4WeeklyBuckets(input.runs, input.todayISO);
  const weeksWithData = buckets.filter((b) => b.runsCount > 0).length;

  const peakTimeOnFeet = secondHighestOfLast4Weeks(buckets, "timeOnFeetSeconds");
  const timeOnFeetBand = bandTimeOnFeet(peakTimeOnFeet, input.raceTimeSecondsPrevisto);

  const peakElevation = secondHighestOfLast4Weeks(buckets, "elevationGainM");
  const elevationBand = bandElevation(peakElevation, input.raceElevationM);

  const bands = [timeOnFeetBand, elevationBand].filter((b): b is LevelBand => b != null);
  const level = bands.length > 0 ? bands.reduce(minLevel) : null;

  return {
    peakTimeOnFeetSeconds: peakTimeOnFeet,
    peakElevationM: peakElevation,
    timeOnFeetBand,
    elevationBand,
    level,
    weeksWithData,
  };
}
