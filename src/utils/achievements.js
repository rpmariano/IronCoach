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

  // "Nova" conta pela data do REGISTO (created_at da corrida ligada), não
  // pela data da prova: quem registar dez dias depois vê o cartão de
  // conquista na mesma (apanhado na revisão pré-deploy). Sem created_at
  // (registos antigos, demo), vale a data da prova.
  const novaEm = (race) => {
    const entry = completed.find((c) => c.race.id === race?.id);
    const day = dayOf(entry?.run?.created_at) || dayOf(race?.date);
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

/* As conquistas de UMA prova avaliam-se NA PRÓPRIA prova, não por "foi a
   mais recente a cumprir a condição": com duas provas com objetivo batido,
   as duas o bateram — e o hub da mais antiga, a lista do Palmarés e o cartão
   do Início têm de o dizer. (Antes filtrava-se o palmarés global pelo raceId
   da última que cumpria, e a mais antiga aparecia sem conquistas e com um
   "fica para a próxima" errado — apanhado na revisão pré-deploy.)
   Devolve { earned, missed }: o que ela deu, e o que ainda podia ter dado —
   só objetivo e recorde, porque "primeira de trail" ou "sequência" não são
   falhas de quem correu. */
export const PERDIDAS_NA_PROVA = ['objetivo_batido', 'recorde_pessoal'];

const LOCKED_SHAPE = {
  objetivo_batido: { name: 'Objetivo batido', short: 'Objetivo', tone: 'ok', Icon: Target },
  recorde_pessoal: { name: 'Recorde pessoal', short: 'Recorde', tone: 'run', Icon: Zap },
};

export function evaluateRace({ raceEvents = [], runs = [], profile = {}, now = new Date() } = {}, raceId) {
  const none = { earned: [], missed: [] };
  if (!raceId) return none;
  const today = isoDay(now);
  const completed = completedRaces({ raceEvents, runs, profile });
  const idx = completed.findIndex(({ race }) => race.id === raceId);
  if (idx < 0) return none;
  const { race, run, outcome } = completed[idx];
  // Pela data do registo, como em computeAchievements (ver novaEm).
  const isNew = daysBetween(dayOf(run?.created_at) || dayOf(race.date), today) < NOVA_ATE_DIAS;
  const item = (key, name, short, tone, Icon, detail) => ({
    key, name, short, tone, Icon, unlocked: true, date: dayOf(race.date), raceId: race.id, raceName: race.name ?? null, detail, isNew,
  });
  const locked = (key) => ({ key, ...LOCKED_SHAPE[key], unlocked: false, raceId: race.id });
  const earned = [];
  const missed = [];

  // A lista vem da mais recente para a mais antiga: a ordem desta prova é
  // quantas há dela (inclusive) para trás.
  earned.push(item('prova_concluida', 'Prova concluída', 'Prova', 'race', Flag, `${ordinalFem(completed.length - idx)} prova`));

  if (outcome?.verdict === 'superado' && outcome?.basis === 'objetivo') {
    earned.push(item('objetivo_batido', 'Objetivo batido', 'Objetivo', 'ok', Target,
      `${race.name}, ${formatDuration(outcome.officialSeconds)} (objetivo ${formatDuration(outcome.targetSeconds)})`));
  } else {
    missed.push(locked('objetivo_batido'));
  }

  if (outcome?.isPersonalRecord) {
    earned.push(item('recorde_pessoal', 'Recorde pessoal', 'Recorde', 'run', Zap,
      `${capitalize(raceCategoryLabel(outcome.category))}: ${formatDuration(outcome.officialSeconds)}, ${formatDelta(outcome.deltaBestSeconds)} abaixo do anterior`));
  } else {
    missed.push(locked('recorde_pessoal'));
  }

  const trails = completed.filter(({ race: r }) => r.race_type === 'trail');
  if (trails.length && trails[trails.length - 1].race.id === race.id) {
    earned.push(item('primeira_trail', 'Primeira de trail', 'Trail', 'race', Mountain,
      [race.name, outcome?.officialSeconds ? formatDuration(outcome.officialSeconds) : null].filter(Boolean).join(', ')));
  }

  // A sequência conta-se a partir da 2.ª prova seguida: a posição desta na
  // sequência atual é o número que ela mostra ("2 provas seguidas").
  const pos = currentStreak(raceEvents, runs, today).findIndex((r) => r.id === race.id);
  if (pos >= 1) earned.push(item('sequencia', 'Sequência de provas', 'Sequência', 'race', Repeat, `${pos + 1} provas seguidas`));

  return { earned, missed };
}

/** As conquistas desbloqueadas POR esta prova — o que o hub, o cartão do
 *  Início e a confirmação do registo mostram. */
export function achievementsForRace(data, raceId) {
  return evaluateRace(data, raceId).earned;
}

/** As que esta prova ainda podia ter dado (objetivo, recorde). */
export function missedInRace(data, raceId) {
  return evaluateRace(data, raceId).missed;
}

/** A linha discreta do hub: o que esta prova não deu, com o número de quanto
 *  faltou — nunca uma repreensão, é o que a treinadora diria a seguir. */
export function describeMissedInRace(achievement, outcome) {
  if (!achievement) return '';
  if (achievement.key === 'objetivo_batido') {
    if (outcome?.targetSeconds && outcome?.deltaTargetSeconds > 0) {
      return `Objetivo batido fica para a próxima: ficaste a ${formatDelta(outcome.deltaTargetSeconds)}`;
    }
    return 'Objetivo batido fica para a próxima: esta prova não tinha objetivo marcado';
  }
  if (achievement.key === 'recorde_pessoal') {
    if (outcome?.previousBestSeconds && outcome?.deltaBestSeconds > 0) {
      return `Recorde pessoal fica para a próxima: ${formatDelta(outcome.deltaBestSeconds)} acima do teu melhor na ${raceCategoryLabel(outcome.category)}`;
    }
    return 'Recorde pessoal fica para a próxima: precisa de duas provas na mesma distância';
  }
  return `${achievement.name} fica para a próxima`;
}
