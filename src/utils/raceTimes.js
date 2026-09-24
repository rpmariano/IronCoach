/* Os tempos de uma prova, sempre os mesmos e sempre com ritmo.

   Pedido do utilizador: "dar mais relevância aos tempos que o atleta tem
   como objetivo e qual o tempo esperado com os treinos que tem feito, tanto
   durante a preparação como quando se conclui a prova (...) os objetivos
   devem sempre surgir com o tempo total e o pace".

   Havia três números espalhados e nunca juntos: o OBJETIVO (a coluna da
   prova), a PREVISÃO (Riegel sobre o que ele tem corrido) e o REAL (o tempo
   oficial). Antes da prova viviam em dois cartões separados sem diferença
   nenhuma calculada, e o texto de ajuda pedia ao atleta que comparasse
   sozinho; depois da prova os ritmos do objetivo e da previsão desapareciam
   e só sobrava o real.

   Este módulo é o sítio único: devolve cada número já com o seu ritmo, a
   diferença entre eles e a leitura em palavras. Serve o hub antes da prova,
   o hub depois, e o contexto que vai para a Carol — para os três nunca
   discordarem sobre a mesma prova, que é a regra que raceOutcome.js já
   segue para os veredictos.

   Não calcula nada de novo: a previsão é a do `getRacePrediction` que o hub
   e o Dashboard já usam (com a distância equivalente ITRA no trail), e o
   resto vem do `classifyRaceOutcome`. */

import { getRacePrediction } from '@formulas/racePlanning.ts';
import { formatDuration, formatPace, parseDurationToSeconds, parsePaceToSeconds } from './run';
import { formatDelta, raceCategoryLabel } from './raceOutcome';

/* A margem a partir da qual o objetivo deixa de estar "alinhado" com o que o
   treino aponta — reexportada do motor partilhado, não redeclarada aqui
   (specs/formulas-centralizacao.md). É a mesma que o plano do dia da prova
   usa para chamar "ambicioso" a um objetivo, e agora também a que o
   coach-chat usa: a app tem uma só definição da palavra. */
import { AMBITIOUS_RATIO } from '@formulas/racePacing.ts';

export { AMBITIOUS_RATIO };

/* A ressalva de extrapolação longa — do mesmo sítio que calcula o
   `confidence`, não redeclarada aqui (specs/formulas-centralizacao.md). */
import { LOW_CONFIDENCE } from '@formulas/racePrediction.ts';

export { LOW_CONFIDENCE };

const num = (v) => {
  const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Um tempo com o ritmo a que corresponde, ou null se não houver tempo.
 *  `paceSeconds` já vem dado quando o motor o calcula melhor do que uma
 *  divisão (no trail, o ritmo é sobre a distância REAL, não a equivalente). */
export function timeLine(seconds, distanceKm, { paceSeconds = null, ...extra } = {}) {
  const s = num(seconds);
  const km = num(distanceKm);
  if (!s) return null;
  const pace = num(paceSeconds) || (km ? s / km : null);
  return {
    seconds: Math.round(s),
    paceSeconds: pace ? Math.round(pace) : null,
    timeLabel: formatDuration(Math.round(s)),
    paceLabel: pace ? `${formatPace(Math.round(pace))}/km` : null,
    ...extra,
  };
}

/* O objetivo da prova. A coluna numérica manda; o texto livre é o recurso —
   e não é só legado, é o caso NORMAL no hub.

   O único caminho para o hub é a RunAgenda (RunAgenda.jsx:976), que passa o
   `draft` do formulário. Esse draft NUNCA tem target_time_seconds nem
   target_pace_seconds_per_km: a agenda só converte o texto em colunas
   numéricas no payload de gravação. Ler apenas a coluna numérica apagava o
   objetivo do ecrã de toda a gente — e a app pedia ao atleta que marcasse um
   objetivo que ele acabara de escrever (apanhado na revisão pré-deploy; foi
   o defeito que esta entrega introduziu ao corrigir o inverso).

   É a mesma cascata que classifyRaceOutcome já faz para o tempo. */
export function targetLine(race) {
  const seconds = num(race?.target_time_seconds) ?? num(parseDurationToSeconds(race?.target_time));
  if (!seconds) return null;
  const pace = num(race?.target_pace_seconds_per_km) ?? num(parsePaceToSeconds(race?.target_pace));
  return timeLine(seconds, race?.distance_km, { paceSeconds: pace });
}

/* Como o objetivo se compara com o que o treino aponta. Positivo em
   `deltaSeconds` = o objetivo é MAIS LENTO do que a previsão (há margem);
   negativo = o objetivo é mais rápido (é preciso tirar tempo). */
function stanceOf(targetSeconds, predictedSeconds) {
  if (!targetSeconds || !predictedSeconds) return null;
  if (targetSeconds < predictedSeconds * (1 - AMBITIOUS_RATIO)) return 'ambicioso';
  if (targetSeconds > predictedSeconds * (1 + AMBITIOUS_RATIO)) return 'conservador';
  return 'alinhado';
}

/** A frase que o atleta lê. Diz sempre a diferença — é o que ele quer saber
 *  — e só depois a leitura. Sem pontos de exclamação (CAROL.md). */
function forecastLine({ stance, deltaSeconds, target, predicted }) {
  if (!target) return `Pelo que tens treinado, apontas para ${predicted.timeLabel}. Marca um objetivo para teres com que comparar.`;
  const d = formatDelta(deltaSeconds);
  if (stance === 'ambicioso') return `O objetivo está ${d} abaixo do que o treino aponta. É ambicioso — dá para lá chegar, mas não sobra margem.`;
  if (stance === 'conservador') return `O treino já aponta ${d} abaixo do objetivo. Tens margem: se o dia correr bem, podes pedir mais.`;
  return deltaSeconds === 0
    ? 'O objetivo e o treino dizem exatamente o mesmo.'
    : `O objetivo e o treino dizem quase o mesmo — ${d} entre eles.`;
}

/* ANTES da prova: o objetivo, o que o treino aponta, e a leitura.

   Devolve null só quando não há NEM objetivo NEM previsão. Antes bastava
   não haver previsão para o bloco inteiro desaparecer — e quem não tem
   corridas registadas é uma conta acabada de criar, exatamente quem mais
   precisa de ver o alvo que marcou (revisão pré-deploy).

   As corridas vão filtradas pelo mesmo critério do classifyRaceOutcome: o
   fastestRun do motor só exige distance_km > 0, por isso uma corrida com
   distância e sem duração entrava como acumulador do reduce e devolvia NaN,
   o que apagava o bloco todo. */
export function raceForecast({ race, runs = [], profile = {}, prediction: dada = null } = {}) {
  if (!race) return null;
  const utilizaveis = (runs || []).filter((r) => num(r?.distance_km) && num(r?.duration_seconds));
  // Quem já tem a previsão em memória (o hub calcula-a para o plano do dia)
  // passa-a: senão o motor corria duas vezes a cada render.
  const prediction = dada || getRacePrediction(race, profile, utilizaveis);
  const predicted = timeLine(prediction.predictedSeconds, race.distance_km, {
    paceSeconds: prediction.predictedPaceReal,
  });

  const target = targetLine(race);
  if (!predicted && !target) return null;
  if (!predicted) {
    return {
      target,
      predicted: null,
      deltaSeconds: null,
      stance: null,
      lowConfidence: false,
      effectiveDistanceKm: prediction.effectiveDistanceKm,
      realDistanceKm: prediction.realDistanceKm,
      line: `O teu objetivo é ${target.timeLabel}${target.paceLabel ? `, a ${target.paceLabel}` : ''}. Regista corridas e digo-te o que o treino aponta.`,
    };
  }
  const deltaSeconds = target ? target.seconds - predicted.seconds : null;
  const stance = stanceOf(target?.seconds, predicted.seconds);

  return {
    target,
    predicted,
    deltaSeconds,
    stance,
    lowConfidence: (prediction.confidence || 0) < LOW_CONFIDENCE,
    // No trail a previsão corre sobre a distância equivalente (100 m de D+
    // valem 1 km plano) — dizer-lho evita que o número pareça errado.
    effectiveDistanceKm: prediction.effectiveDistanceKm,
    realDistanceKm: prediction.realDistanceKm,
    line: forecastLine({ stance, deltaSeconds, target, predicted }),
  };
}

/** DEPOIS da prova: os quatro números, cada um com o seu ritmo, e a
 *  diferença face ao real. Alimenta-se do `classifyRaceOutcome`, que já os
 *  calculou todos — aqui só ganham ritmo, rótulo e ordem de leitura. */
export function raceTimesBreakdown(outcome, race) {
  if (!outcome || !outcome.officialSeconds) return null;
  const km = num(outcome.distanceKm) || num(race?.distance_km);

  const real = timeLine(outcome.officialSeconds, km);
  const target = timeLine(outcome.targetSeconds, km, {
    paceSeconds: num(race?.target_pace_seconds_per_km),
  });
  const predicted = timeLine(outcome.predictedSeconds, km);
  /* O ritmo do melhor anterior é sobre a distância DELE, não sobre a desta
     prova: a categoria é larga e a divisão errada dava ritmos impossíveis.
     Sem essa distância (registos antigos), fica o tempo sem ritmo — melhor
     um número a menos do que um número falso. */
  const best = timeLine(outcome.previousBestSeconds, num(outcome.previousBestDistanceKm));

  /* `delta` é sempre REAL menos o outro: negativo = o atleta foi mais
     rápido do que aquele número. É a leitura que o atleta faz de cabeça
     ("fiz menos 3:09 do que tinha pedido"). */
  const rows = [
    target && { key: 'objetivo', label: 'Objetivo', ...target, delta: real.seconds - target.seconds },
    predicted && { key: 'previsao', label: 'O treino previa', ...predicted, delta: real.seconds - predicted.seconds },
    best && { key: 'melhor', label: `Melhor ${raceCategoryLabel(outcome.category)} anterior`, ...best, delta: real.seconds - best.seconds },
  ].filter(Boolean);

  return { real, rows };
}

/** "3:09 mais rápido" / "52 s mais lento" / "igual ao segundo". */
export function describeDelta(deltaSeconds) {
  if (deltaSeconds == null) return '';
  if (deltaSeconds === 0) return 'igual ao segundo';
  return `${formatDelta(deltaSeconds)} mais ${deltaSeconds < 0 ? 'rápido' : 'lento'}`;
}
