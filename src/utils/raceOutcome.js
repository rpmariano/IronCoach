/* O resultado de uma prova, lido de uma vez só (specs/gamificacao-provas.md,
   "A Carol no balanço"). Três perguntas, sempre pela mesma régua:

   1. Face ao OBJETIVO da prova (race_events.target_time_seconds): superado,
      perto (até NEAR_TARGET_RATIO acima) ou aquém.
   2. Face ao que o TREINO perspetivava — a previsão de Riegel calculada só
      com as corridas ANTERIORES à prova (getRacePrediction, o mesmo ponto
      único do hub e do Dashboard): acima, dentro ou abaixo.
   3. Face ao MELHOR ANTERIOR na mesma categoria de distância: recorde
      pessoal ou não.

   É daqui que saem o veredicto que a Carol recebe no `race_after`, a
   conquista "objetivo batido"/"recorde pessoal" (utils/achievements.js) e o
   balanço curto do hub. Uma régua, três leitores — para o hub nunca dizer
   "objetivo cumprido" e a Carol "ficaste aquém" sobre a mesma prova. */

import { getRacePrediction } from '@formulas/racePlanning.ts';
import { categorizeDistance } from '@formulas/vocabulary.ts';
import { findRaceRun, formatDuration, formatPace, parseDurationToSeconds } from './run';

/** Até 3% acima do objetivo ainda é "perto": numa meia a 1:52 são 3:22, num
 *  10 km a 50 min são 1:30 — o que uma treinadora chamaria "foi por pouco". */
export const NEAR_TARGET_RATIO = 0.03;
/** ±2% em torno da previsão é "dentro do que o treino perspetivava"; abaixo
 *  disso o atleta correu acima do treino, acima disso correu abaixo dele. */
export const TRAINING_BAND_RATIO = 0.02;

export const RACE_VERDICTS = ['sem_registo', 'concluida', 'superado', 'perto', 'aquem'];

const CATEGORY_LABELS = { '5k': '5 km', '10k': '10 km', meia: 'meia', maratona: 'maratona', ultra: 'ultra' };
export function raceCategoryLabel(category) {
  return CATEGORY_LABELS[category] || category || 'distância';
}

function num(v) {
  const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** O tempo da prova é o do cronómetro da organização (details.official_time_seconds)
 *  quando existe; senão a duração registada. */
export function raceResultSeconds(run) {
  if (!run) return null;
  return num(run?.details?.official_time_seconds) ?? num(run?.duration_seconds);
}

/** Melhor tempo ANTERIOR do atleta na mesma categoria de distância, entre
 *  corridas de competição (kind = 'competicao') anteriores ao dia da prova e
 *  que não sejam a própria corrida. null sem histórico comparável. */
export function previousBestSeconds(runs, race, run) {
  const category = categorizeDistance(num(race?.distance_km));
  if (!category || !race?.date) return null;
  let best = null;
  for (const r of runs || []) {
    if (!r || r === run || (run?.id && r.id === run.id)) continue;
    if (r.kind !== 'competicao') continue;
    if (typeof r.date !== 'string' || r.date.slice(0, 10) >= race.date.slice(0, 10)) continue;
    if (categorizeDistance(num(r.distance_km)) !== category) continue;
    const seconds = raceResultSeconds(r);
    if (!seconds) continue;
    if (!best || seconds < best.seconds) best = { seconds, date: r.date.slice(0, 10), distanceKm: num(r.distance_km) };
  }
  return best;
}

function bandAgainst(reference, actual) {
  if (!reference || !actual) return null;
  if (actual <= reference * (1 - TRAINING_BAND_RATIO)) return 'acima';
  if (actual <= reference * (1 + TRAINING_BAND_RATIO)) return 'dentro';
  return 'abaixo';
}

/**
 * Classifica o resultado de uma prova. `run` é a corrida ligada (por omissão
 * findRaceRun); `runs` é o histórico completo, `profile` dá o nível de
 * experiência à previsão. Devolve null sem prova.
 */
export function classifyRaceOutcome({ race, run: givenRun, runs = [], profile = {} } = {}) {
  if (!race) return null;
  const run = givenRun === undefined ? findRaceRun(runs, race) : givenRun;
  const distanceKm = num(race.distance_km) ?? num(run?.distance_km);
  const category = categorizeDistance(distanceKm);
  const officialSeconds = raceResultSeconds(run);
  // O objetivo computável (target_time_seconds) manda; o texto que o atleta
  // escreveu (target_time, "47" / "1:52:00") é o recurso — é o que o hub
  // recebe no rascunho da agenda, que só converte ao gravar, e o que existe
  // nas provas anteriores às colunas numéricas.
  const targetSeconds = num(race.target_time_seconds) ?? num(parseDurationToSeconds(race.target_time));

  const base = {
    raceId: race.id ?? null,
    runId: run?.id ?? null,
    distanceKm,
    category,
    officialSeconds,
    targetSeconds,
    predictedSeconds: null,
    previousBestSeconds: null,
    previousBestDate: null,
    deltaTargetSeconds: null,
    deltaPredictionSeconds: null,
    deltaBestSeconds: null,
    vsTraining: null,
    isPersonalRecord: false,
    basis: null,
    verdict: 'sem_registo',
  };
  if (!run || !officialSeconds) return base;

  // A previsão é a do TREINO: só corridas anteriores ao dia da prova, e
  // nunca a própria — senão a prova "previa-se" a si mesma.
  const raceDay = typeof race.date === 'string' ? race.date.slice(0, 10) : null;
  const trainingRuns = (runs || []).filter((r) =>
    r && r !== run && !(run.id && r.id === run.id)
    && typeof r.date === 'string' && (!raceDay || r.date.slice(0, 10) < raceDay)
    && num(r.distance_km) && num(r.duration_seconds));
  const prediction = trainingRuns.length ? getRacePrediction(race, profile, trainingRuns) : null;
  const predictedSeconds = prediction && prediction.predictedSeconds > 0 ? Math.round(prediction.predictedSeconds) : null;

  const best = previousBestSeconds(runs, race, run);

  const reference = targetSeconds ?? predictedSeconds;
  let verdict = 'concluida';
  let basis = null;
  if (reference) {
    basis = targetSeconds ? 'objetivo' : 'previsao';
    if (officialSeconds <= reference) verdict = 'superado';
    else if (officialSeconds <= reference * (1 + NEAR_TARGET_RATIO)) verdict = 'perto';
    else verdict = 'aquem';
  }

  return {
    ...base,
    predictedSeconds,
    previousBestSeconds: best?.seconds ?? null,
    previousBestDate: best?.date ?? null,
    deltaTargetSeconds: targetSeconds ? officialSeconds - targetSeconds : null,
    deltaPredictionSeconds: predictedSeconds ? officialSeconds - predictedSeconds : null,
    deltaBestSeconds: best ? officialSeconds - best.seconds : null,
    vsTraining: bandAgainst(predictedSeconds, officialSeconds),
    isPersonalRecord: !!best && officialSeconds < best.seconds,
    basis,
    verdict,
  };
}

/** "1:42" / "0:35" — uma diferença de tempo, sempre positiva, sem sinal. */
export function formatDelta(seconds) {
  return formatDuration(Math.abs(Math.round(seconds || 0)));
}

/** O balanço curto e determinístico (hub, cartão do Início): números e o
 *  veredicto, sem opinião — a opinião é da Carol, no chat. Sem pontos de
 *  exclamação (CAROL.md "O que evitar"). */
export function describeRaceOutcome(outcome, race) {
  if (!outcome) return '';
  const name = race?.name || 'A prova';
  if (outcome.verdict === 'sem_registo') return `${name} ainda não tem a corrida registada. Regista-a para fecharmos o ciclo com números reais.`;
  const time = formatDuration(outcome.officialSeconds);
  const pace = outcome.distanceKm ? ` (${formatPace(outcome.officialSeconds / outcome.distanceKm)}/km)` : '';
  const parts = [`${time}${pace}.`];
  if (outcome.basis === 'objetivo') {
    const d = formatDelta(outcome.deltaTargetSeconds);
    if (outcome.verdict === 'superado') parts.push(outcome.deltaTargetSeconds === 0 ? 'Objetivo cumprido em cima da hora.' : `Objetivo batido por ${d}.`);
    else if (outcome.verdict === 'perto') parts.push(`Ficaste a ${d} do objetivo — foi por pouco.`);
    else parts.push(`Ficaste a ${d} do objetivo.`);
  } else if (outcome.basis === 'previsao') {
    const d = formatDelta(outcome.deltaPredictionSeconds);
    if (outcome.verdict === 'superado') parts.push(`Sem objetivo marcado, mas ${d} abaixo do que o treino previa.`);
    else parts.push(`Sem objetivo marcado; o treino previa ${d} menos.`);
  } else {
    parts.push('Prova concluída.');
  }
  if (outcome.vsTraining === 'acima' && outcome.basis === 'objetivo') parts.push(`Acima do que o treino perspetivava (${formatDelta(outcome.deltaPredictionSeconds)} mais rápido do que a previsão).`);
  else if (outcome.vsTraining === 'dentro' && outcome.basis === 'objetivo') parts.push('Dentro do que o treino perspetivava.');
  if (outcome.isPersonalRecord) parts.push(`Recorde pessoal na ${raceCategoryLabel(outcome.category)}, por ${formatDelta(outcome.deltaBestSeconds)}.`);
  return parts.join(' ');
}

/** O que segue para o coach-chat no `race_after` (body.race_outcome). Só
 *  números e chaves — o servidor valida e escreve o bloco de contexto; o
 *  texto é da Carol. */
export function buildRaceOutcomePayload(outcome, race, run) {
  if (!outcome || !race) return null;
  return {
    race_id: race.id ?? null,
    name: race.name ?? null,
    date: typeof race.date === 'string' ? race.date.slice(0, 10) : null,
    race_type: race.race_type ?? null,
    distance_km: outcome.distanceKm,
    category: outcome.category,
    official_seconds: outcome.officialSeconds,
    target_seconds: outcome.targetSeconds,
    predicted_seconds: outcome.predictedSeconds,
    previous_best_seconds: outcome.previousBestSeconds,
    previous_best_date: outcome.previousBestDate,
    position: num(run?.details?.position) ? Math.round(num(run.details.position)) : null,
    effort_rpe: num(run?.effort_rpe) ?? null,
    verdict: outcome.verdict,
    basis: outcome.basis,
    vs_training: outcome.vsTraining,
    is_personal_record: outcome.isPersonalRecord,
    // Os parciais registados (runs.details.splits), para o servidor comparar
    // com o plano para o dia km a km (specs/plano-de-prova.md §4). Até 60,
    // só com distância e tempo válidos.
    splits: Array.isArray(run?.details?.splits)
      ? run.details.splits
        .map((sp) => ({ distance_km: num(sp?.distance_km), time_seconds: num(sp?.time_seconds) }))
        .filter((sp) => sp.distance_km && sp.time_seconds)
        .slice(0, 60)
      : [],
  };
}
