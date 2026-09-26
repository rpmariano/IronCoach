/* O resultado de uma prova, lido de uma vez só (specs/gamificacao-provas.md,
   "A Carol no balanço"). Três perguntas, sempre pela mesma régua:

   1. Face ao OBJETIVO da prova (race_events.target_time_seconds): superado,
      perto (até NEAR_TARGET_RATIO acima) ou aquém.
   2. Face ao que o TREINO perspetivava — a previsão de Riegel calculada só
      com as corridas ANTERIORES à prova (getRacePrediction, o mesmo ponto
      único do hub e do Dashboard): acima, dentro ou abaixo.
   3. Face ao MELHOR ANTERIOR à mesma distância (±SAME_DISTANCE_RATIO) e no
      mesmo terreno: recorde pessoal ou não.

   É daqui que saem o veredicto que a Carol recebe no `race_after`, a
   conquista "objetivo batido"/"recorde pessoal" (utils/achievements.js) e o
   balanço curto do hub. Uma régua, três leitores — para o hub nunca dizer
   "objetivo cumprido" e a Carol "ficaste aquém" sobre a mesma prova. */

import { getRacePrediction } from '@formulas/racePlanning.ts';
import { categorizeDistance } from '@formulas/vocabulary.ts';
import { findRaceRun, formatDuration, formatPace, parseDurationToSeconds, RACE_DISTANCE_OPTIONS } from './run';
import { formatDistanceKm } from './paceMath';

/** Até 3% acima do objetivo ainda é "perto": numa meia a 1:52 são 3:22, num
 *  10 km a 50 min são 1:30 — o que uma treinadora chamaria "foi por pouco". */
export const NEAR_TARGET_RATIO = 0.03;
/** ±2% em torno da previsão é "dentro do que o treino perspetivava"; abaixo
 *  disso o atleta correu acima do treino, acima disso correu abaixo dele. */
export const TRAINING_BAND_RATIO = 0.02;
/** ±2% na distância é "a mesma prova" para o recorde: a meia de 21,1 km
 *  contra outra de 21,4 conta; um 15 km contra uma meia não, embora a
 *  categoria ("meia", 11,1 a 22,5 km) seja a mesma (revisão das frases da
 *  Carol, 2026-09-26). */
export const SAME_DISTANCE_RATIO = 0.02;

export const RACE_VERDICTS = ['sem_registo', 'concluida', 'superado', 'perto', 'aquem'];

const CATEGORY_LABELS = { '5k': '5 km', '10k': '10 km', meia: 'meia', maratona: 'maratona', ultra: 'ultra' };
export function raceCategoryLabel(category) {
  return CATEGORY_LABELS[category] || category || 'distância';
}

function num(v) {
  const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const sameDistance = (a, b) => !!a && !!b && Math.abs(a - b) <= b * SAME_DISTANCE_RATIO;

/** "nos 10 km", "na meia maratona", "nos 12,5 km" — o recorde diz-se pela
 *  distância corrida, não pela categoria arredondada: "na meia" sobre uma
 *  prova de 15 km era falso. */
export function raceDistancePhrase(km) {
  const d = num(km);
  if (!d) return 'nesta distância';
  const option = RACE_DISTANCE_OPTIONS.find((o) => sameDistance(d, o.km));
  if (option && !option.label.endsWith(' km')) return `na ${option.label.toLowerCase()}`;
  return `nos ${formatDistanceKm(option ? option.km : Math.round(d * 10) / 10)}`;
}

/* O terreno pela mesma regra de `terrenoDe` (utils/premios.js): só 'trail' é
   trail, tudo o resto é estrada. Numa corrida anterior lê-se do registo
   (runs.details.race_type), que é o que ela traz consigo. */
const terrainOf = (raceType) => (raceType === 'trail' ? 'trail' : 'estrada');

/** O tempo da prova é o do cronómetro da organização (details.official_time_seconds)
 *  quando existe; senão a duração registada. */
export function raceResultSeconds(run) {
  if (!run) return null;
  return num(run?.details?.official_time_seconds) ?? num(run?.duration_seconds);
}

/* 2026-09-26: a categoria (categorizeDistance) é larga de propósito para o
 * taper e o volume ("10k" vai de 5,5 a 11 km) — mas usada aqui dava "recorde
 * pessoal" a comparar um 8 km com uma prova de 10 km só porque caíam na mesma
 * categoria (Fase 0 do Troféu, specs/trofeu.md). O que faz sentido para
 * "recorde pessoal" é a mesma distância, não a mesma categoria larga — por
 * isso a comparação passa a ser por PROXIMIDADE da distância
 * (±DISTANCE_MATCH_RATIO). */
export const DISTANCE_MATCH_RATIO = 0.02;
/* 2026-09-26 (revisão da Fase 0): o ±2% só é justo entre distâncias
 * OFICIAIS. O distance_km de uma linha em runs é o do GPS/relógio, e numa
 * prova de 10 km o relógio mede 10,2-10,4 km (5,1-5,2 km num 5 km) — por
 * tangentes mal cortadas e desvios, quase sempre PARA CIMA. Com ±2% essas
 * provas anteriores deixavam de contar e o recorde pessoal desaparecia (e com
 * ele prémios e conquistas, retroativamente). Por isso: numa corrida ligada a
 * uma prova (race_id) compara-se a distância oficial dessa prova; só numa
 * competição sem prova ligada se usa a do GPS, com folga assimétrica — -2%
 * para baixo, +GPS_OVERSHOOT_RATIO para cima. */
export const GPS_OVERSHOOT_RATIO = 0.05;

function isEquivalentDistance(a, b, upRatio = DISTANCE_MATCH_RATIO) {
  if (!a || !b) return false;
  return a >= b * (1 - DISTANCE_MATCH_RATIO) && a <= b * (1 + upRatio);
}

/** A distância medida pelo GPS (`gpsKm`) é a de uma prova oficial de
 *  `officialKm`? -2% para baixo, +GPS_OVERSHOOT_RATIO para cima — a mesma
 *  folga do recorde pessoal. Também serve ao registo para reconhecer a prova
 *  agendada do dia (RunRegistration). */
export function gpsMatchesOfficialDistance(gpsKm, officialKm) {
  return isEquivalentDistance(num(gpsKm), num(officialKm), GPS_OVERSHOOT_RATIO);
}

/** A distância com que uma competição anterior entra na comparação: a
 *  OFICIAL da prova a que está ligada, quando a conhecemos; senão a do GPS,
 *  marcada como tal para levar a folga assimétrica. */
function comparableDistance(r, racesById) {
  const linked = r.race_id != null ? racesById.get(r.race_id) : null;
  const official = num(linked?.distance_km);
  if (official) return { km: official, gps: isMeasuredRace(linked) };
  return { km: num(r.distance_km), gps: true };
}

/* Revisão pré-deploy de 2026-09-26: as provas criadas pelo registo de uma
 * competição fora da agenda (RunRegistration.autoCreateRaceForCompetition)
 * gravam como distance_km a distância do GPS — e deixam o local vazio, que é
 * a marca delas. Tratá-las como oficiais (±2%) fazia desaparecer o recorde
 * entre uma dessas (10,3 km) e uma prova da agenda de 10 km, nos dois
 * sentidos. Uma prova assim leva a folga do GPS, como uma corrida sem prova.
 * Só conta o local vazio de facto: a coluna é NOT NULL, por isso um local em
 * falta num objeto parcial (rascunho, teste) não é essa marca. */
function isMeasuredRace(race) {
  return !!race && typeof race.location === 'string' && race.location.trim() === '';
}

/** As duas distâncias são a mesma prova? Entre oficiais, ±2%; se um dos lados
 *  foi medido pelo GPS, esse lado pode passar até +GPS_OVERSHOOT_RATIO. */
function sameRaceDistance(prevKm, prevGps, curKm, curGps) {
  if (prevGps && isEquivalentDistance(prevKm, curKm, GPS_OVERSHOOT_RATIO)) return true;
  if (curGps && isEquivalentDistance(curKm, prevKm, GPS_OVERSHOOT_RATIO)) return true;
  return isEquivalentDistance(prevKm, curKm);
}

/** Melhor tempo ANTERIOR do atleta na mesma distância e no mesmo terreno
 *  (um trail de 25 km não é recorde contra uma maratona de estrada), entre
 *  corridas de competição (kind = 'competicao') anteriores ao dia da prova e
 *  que não sejam a própria corrida. `races` (race_events) dá a distância oficial das
 *  corridas ligadas a uma prova; sem ela usa-se a do GPS com folga
 *  (GPS_OVERSHOOT_RATIO). null sem histórico comparável. */
export function previousBestSeconds(runs, race, run, races = []) {
  const raceDistanceKm = num(race?.distance_km);
  const category = categorizeDistance(raceDistanceKm);
  if (!category || !raceDistanceKm || !race?.date) return null;
  const racesById = new Map((races || []).filter((x) => x?.id != null).map((x) => [x.id, x]));
  const terrain = terrainOf(race.race_type ?? run?.details?.race_type);
  let best = null;
  for (const r of runs || []) {
    if (!r || r === run || (run?.id && r.id === run.id)) continue;
    if (r.kind !== 'competicao') continue;
    if (typeof r.date !== 'string' || r.date.slice(0, 10) >= race.date.slice(0, 10)) continue;
    const { km: rDistanceKm, gps } = comparableDistance(r, racesById);
    if (!sameRaceDistance(rDistanceKm, gps, raceDistanceKm, isMeasuredRace(race))) continue;
    if (terrainOf(racesById.get(r.race_id)?.race_type ?? r.details?.race_type) !== terrain) continue;
    const seconds = raceResultSeconds(r);
    if (!seconds) continue;
    if (!best || seconds < best.seconds) best = { seconds, date: r.date.slice(0, 10), distanceKm: rDistanceKm };
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
 * experiência à previsão; `races` (race_events) dá a distância oficial às
 * provas anteriores no recorde pessoal. Devolve null sem prova.
 */
export function classifyRaceOutcome({ race, run: givenRun, runs = [], profile = {}, races = [] } = {}) {
  if (!race) return null;
  const run = givenRun === undefined ? findRaceRun(runs, race) : givenRun;
  const distanceKm = num(race.distance_km) ?? num(run?.distance_km);
  const category = categorizeDistance(distanceKm);
  const officialSeconds = raceResultSeconds(run);
  // O objetivo computável (target_time_seconds) manda; o texto que o atleta
  // escreveu (target_time, "47" / "1:52:00") é o recurso — é o que o hub
  // recebe no rascunho da agenda, que só converte ao gravar, e o que existe
  // nas provas anteriores às colunas numéricas.
  const statedTarget = num(race.target_time_seconds) ?? num(parseDurationToSeconds(race.target_time));
  // A prova criada sozinha para uma competição fora da agenda
  // (autoCreateRaceForCompetition, RunRegistration.jsx) grava como objetivo a
  // duração da própria corrida, porque a coluna não admite "sem meta". Esse
  // objetivo nunca existiu: lido como tal, dava "objetivo cumprido" — ou
  // "batido por 0:08", o oficial contra o relógio — e o prémio "objetivo
  // batido" a quem não marcou meta nenhuma (revisão das frases da Carol,
  // 2026-09-26). Conta como sem objetivo.
  const recordedSeconds = num(run?.duration_seconds);
  const syntheticTarget = !!statedTarget && !!recordedSeconds && Math.round(statedTarget) === Math.round(recordedSeconds);
  const targetSeconds = syntheticTarget ? null : statedTarget;

  const base = {
    raceId: race.id ?? null,
    runId: run?.id ?? null,
    distanceKm,
    category,
    officialSeconds,
    targetSeconds,
    predictedSeconds: null,
    previousBestSeconds: null,
    previousBestDistanceKm: null,
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

  const best = previousBestSeconds(runs, race, run, races);

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
    /* A distância a que esse melhor foi feito. `previousBestSeconds` já a
       calculava e o outcome deitava-a fora — e as categorias são largas
       ("meia" vai de 11,1 a 22,5 km). Sem ela, quem quisesse mostrar o ritmo
       desse tempo dividia-o pela distância da prova ATUAL e escrevia um
       número impossível: 1:00:00 feitos em 12 km apareciam como 2:51/km numa
       meia (apanhado na revisão pré-deploy). */
    previousBestDistanceKm: best?.distanceKm ?? null,
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
  if (outcome.verdict === 'sem_registo') {
    // Corrida ligada mas gravada sem tempo ("Prosseguir sem estas métricas"):
    // pedir para a registar era pedir o que já está feito.
    if (outcome.runId) return 'Falta o tempo oficial desta prova. Põe-no na corrida e eu faço as contas.';
    return `${name} ainda não tem a corrida registada. Regista-a para fecharmos o ciclo com números reais.`;
  }
  const time = formatDuration(outcome.officialSeconds);
  const pace = outcome.distanceKm ? ` (${formatPace(outcome.officialSeconds / outcome.distanceKm)}/km)` : '';
  const parts = [`${time}${pace}.`];
  if (outcome.basis === 'objetivo') {
    const d = formatDelta(outcome.deltaTargetSeconds);
    if (outcome.verdict === 'superado') parts.push(outcome.deltaTargetSeconds === 0 ? 'Objetivo cumprido ao segundo.' : `Objetivo batido por ${d}.`);
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
  if (outcome.isPersonalRecord) parts.push(`Recorde pessoal ${raceDistancePhrase(outcome.distanceKm)}, por ${formatDelta(outcome.deltaBestSeconds)}.`);
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
    previous_best_distance_km: outcome.previousBestDistanceKm,
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
