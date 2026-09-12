/* O Palmarés — as conquistas das provas (specs/gamificacao-provas.md).

   Cinco conquistas, sempre pela mesma ordem, calculadas dos dados que já
   existem: nenhuma tabela nova, nenhuma data de desbloqueio guardada. Se um
   dia houver conquistas que não se recalculem (ex.: "10 provas seguidas com
   objetivo batido"), aí sim uma tabela — não agora.

   A régua do resultado é uma só, `utils/raceOutcome.js`: "objetivo batido" é
   `verdict === 'superado' && basis === 'objetivo'`, "recorde pessoal" é
   `isPersonalRecord`. Este ficheiro não decide nada sobre tempos — só conta,
   ordena e escreve a frase. É por isso que o hub, o Início, o Perfil e a
   confirmação do registo nunca podem discordar sobre a mesma prova.

   Uma prova conta como concluída quando está `status = 'concluida'` E tem
   corrida ligada (findRaceRun): marcar "concluída" na agenda sem registar
   nada não dá conquista nenhuma — não há números para as sustentar. */

import { Flag, Target, Zap, Mountain, Repeat } from 'lucide-react';
import { findRaceRun, formatDuration } from './run';
import { classifyRaceOutcome, formatDelta, raceCategoryLabel } from './raceOutcome';

/** Uma conquista é "nova" enquanto a prova que a deu tiver menos de 7 dias —
 *  é a janela do dia a seguir à prova (a mesma do cartão do Início e do
 *  balanço da Carol). */
export const NOVA_ATE_DIAS = 7;

/** A ordem é fixa: o Palmarés é sempre a mesma linha, desbloqueada ou não. */
export const ACHIEVEMENT_KEYS = ['prova_concluida', 'objetivo_batido', 'recorde_pessoal', 'primeira_trail', 'sequencia'];

const DAY_MS = 86400000;

function isoDay(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dayOf(value) {
  return typeof value === 'string' && value.length >= 10 ? value.slice(0, 10) : null;
}

function daysBetween(fromIso, toIso) {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / DAY_MS);
}

/** "3.ª prova" — o ordinal feminino, que é como se lê em português. */
function ordinalFem(n) {
  return `${n}.ª`;
}

function capitalize(text) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

/* As provas que contam para o palmarés: concluídas E com corrida ligada, da
   mais recente para a mais antiga, cada uma já com o seu veredicto. É a
   lista que o Palmarés do Perfil mostra por baixo das conquistas. */
export function completedRaces({ raceEvents = [], runs = [], profile = {} } = {}) {
  return (raceEvents || [])
    .filter((race) => race && dayOf(race.date) && race.status === 'concluida')
    .map((race) => ({ race, run: findRaceRun(runs, race) }))
    .filter(({ run }) => !!run)
    .map(({ race, run }) => ({ race, run, outcome: classifyRaceOutcome({ race, run, runs, profile }) }))
    .sort((a, b) => dayOf(b.race.date).localeCompare(dayOf(a.race.date)));
}

/* A sequência: quantas provas SEGUIDAS, contando da mais recente para trás,
   ficaram registadas. Uma prova que já passou e não tem corrida ligada corta
   a sequência — é exatamente isso que a conquista mede, não "quantas
   registei ao todo". Provas ainda por correr não entram (nem cortam). */
function currentStreak(raceEvents, runs, today) {
  const past = (raceEvents || [])
    .filter((race) => race && dayOf(race.date) && dayOf(race.date) <= today)
    .sort((a, b) => dayOf(a.date).localeCompare(dayOf(b.date)));
  const streak = [];
  for (let i = past.length - 1; i >= 0; i -= 1) {
    const race = past[i];
    if (race.status !== 'concluida' || !findRaceRun(runs, race)) break;
    streak.unshift(race);
  }
  return streak;
}

/* Cada conquista devolve o mesmo formato:
   { key, name, short, unlocked, date, raceId, raceName, detail, isNew, tone, Icon }
   - `detail` desbloqueada = o que aconteceu; bloqueada = o que falta.
   - `date`/`raceId`/`raceName` = a prova que a desbloqueou (a mais recente
     que serve, para o "isNew" apanhar a que acabou de ser registada).
   - `isNew` = essa prova tem menos de 7 dias. */
export function computeAchievements({ raceEvents = [], runs = [], profile = {}, now = new Date() } = {}) {
  const today = isoDay(now);
  const completed = completedRaces({ raceEvents, runs, profile });

  const novaEm = (race) => {
    const day = dayOf(race?.date);
    if (!day) return false;
    return daysBetween(day, today) < NOVA_ATE_DIAS;
  };

  const build = (key, name, short, tone, Icon, unlockedBy, detail, lockedDetail) => ({
    key,
    name,
    short,
    tone,
    Icon,
    unlocked: !!unlockedBy,
    date: unlockedBy ? dayOf(unlockedBy.date) : null,
    raceId: unlockedBy?.id ?? null,
    raceName: unlockedBy?.name ?? null,
    detail: unlockedBy ? detail : lockedDetail,
    isNew: unlockedBy ? novaEm(unlockedBy) : false,
  });

  // 1. Prova concluída — a contagem. Quem a desbloqueia é sempre a última.
  const maisRecente = completed[0]?.race || null;
  const provaConcluida = build(
    'prova_concluida', 'Prova concluída', 'Prova', 'race', Flag,
    maisRecente,
    `${ordinalFem(completed.length)} prova`,
    'Regista a tua primeira prova',
  );

  // 2. Objetivo batido — a régua é o raceOutcome, não uma comparação nova.
  const comObjetivoBatido = completed.find(({ outcome }) => outcome?.verdict === 'superado' && outcome?.basis === 'objetivo');
  const ultimaComObjetivo = completed.find(({ outcome }) => !!outcome?.targetSeconds && !!outcome?.officialSeconds);
  let objetivoLocked = 'Marca um objetivo e bate-o';
  if (ultimaComObjetivo) {
    objetivoLocked = `Ficaste a ${formatDelta(ultimaComObjetivo.outcome.deltaTargetSeconds)} na ${ultimaComObjetivo.race.name}`;
  }
  const objetivoBatido = build(
    'objetivo_batido', 'Objetivo batido', 'Objetivo', 'ok', Target,
    comObjetivoBatido?.race || null,
    comObjetivoBatido
      ? `${comObjetivoBatido.race.name}, ${formatDuration(comObjetivoBatido.outcome.officialSeconds)} (objetivo ${formatDuration(comObjetivoBatido.outcome.targetSeconds)})`
      : null,
    objetivoLocked,
  );

  // 3. Recorde pessoal — precisa de duas provas na mesma categoria.
  const comRecorde = completed.find(({ outcome }) => outcome?.isPersonalRecord);
  const recordePessoal = build(
    'recorde_pessoal', 'Recorde pessoal', 'Recorde', 'run', Zap,
    comRecorde?.race || null,
    comRecorde
      ? `${capitalize(raceCategoryLabel(comRecorde.outcome.category))}: ${formatDuration(comRecorde.outcome.officialSeconds)}, ${formatDelta(comRecorde.outcome.deltaBestSeconds)} abaixo do anterior`
      : null,
    'Precisa de duas provas na mesma distância',
  );

  // 4. Primeira de trail — a PRIMEIRA, por data, não a mais recente.
  const trails = completed.filter(({ race }) => race.race_type === 'trail');
  const primeiroTrail = trails.length ? trails[trails.length - 1] : null;
  const primeiraTrail = build(
    'primeira_trail', 'Primeira de trail', 'Trail', 'race', Mountain,
    primeiroTrail?.race || null,
    primeiroTrail
      ? [primeiroTrail.race.name, primeiroTrail.outcome?.officialSeconds ? formatDuration(primeiroTrail.outcome.officialSeconds) : null].filter(Boolean).join(', ')
      : null,
    'Ainda sem trail concluído',
  );

  // 5. Sequência — provas seguidas, sem nenhuma por registar pelo meio.
  const streak = currentStreak(raceEvents, runs, today);
  const temSequencia = streak.length >= 2;
  const sequencia = build(
    'sequencia', 'Sequência de provas', 'Sequência', 'race', Repeat,
    temSequencia ? streak[streak.length - 1] : null,
    `${streak.length} provas seguidas`,
    'Duas provas seguidas registadas',
  );

  return [provaConcluida, objetivoBatido, recordePessoal, primeiraTrail, sequencia];
}

/** As conquistas desbloqueadas POR esta prova — o que o hub e o cartão do
 *  Início mostram no dia a seguir. */
export function achievementsForRace(list, raceId) {
  if (!raceId) return [];
  return (list || []).filter((a) => a.unlocked && a.raceId === raceId);
}

/** As que ficaram por desbloquear e que esta prova ainda podia ter dado —
 *  só objetivo e recorde: "primeira de trail" ou "sequência" não são
 *  falhas de quem correu. */
export const PERDIDAS_NA_PROVA = ['objetivo_batido', 'recorde_pessoal'];

export function missedInRace(list, raceId) {
  if (!raceId) return [];
  return (list || []).filter((a) => !a.unlocked && PERDIDAS_NA_PROVA.includes(a.key));
}
