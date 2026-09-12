/* As mensagens que a Carol manda por iniciativa própria — CAROL.md §3 e §7.
   - 3 dias sem qualquer registo → "Estás bem?" no chat, em nome dela.
   - Véspera da prova → o que fazer hoje e amanhã de manhã.
   - Manhã da prova → curta, duas frases, sem dados.
   - Depois da prova → o balanço, com opinião (e com o veredicto calculado
     em utils/raceOutcome.js quando a corrida da prova está registada).
   Este ficheiro só DECIDE qual (se alguma) se aplica agora e devolve a
   chave que a torna única — o texto é escrito pelo modelo no coach-chat
   (proactive_trigger), a partir do contexto real do atleta. A chave evita
   que a mesma mensagem dispare duas vezes: guarda-se em localStorage por
   utilizador (ver markProactiveSent) e o servidor ainda recusa se ela tiver
   falado há menos de 6 horas. */

import { findRaceRun, formatDuration } from './run';
import { classifyRaceOutcome, buildRaceOutcomePayload } from './raceOutcome';
import { achievementsForRace } from './achievements';

export const SILENCE_DAYS = 3;
/** Depois da prova, com a corrida registada, o balanço vale durante uma
 *  semana — depois disso já é história, não é "o balanço". Sem corrida
 *  registada, a Carol só pergunta como correu durante 3 dias. */
export const RACE_AFTER_DAYS_WITH_RUN = 7;
export const RACE_AFTER_DAYS_WITHOUT_RUN = 3;
const STORAGE_PREFIX = 'ironcoach:carol-proativa:';
const DAY_MS = 86400000;

// Dia LOCAL (yyyy-mm-dd), como o todayISO() do resto da app — em UTC, entre
// as 00:00 e a 01:00 de verão "hoje" ainda era ontem e a manhã da prova
// ficava calada nessa hora.
function isoDay(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Data (yyyy-mm-dd) do registo mais recente entre corridas, refeições,
 *  ginásio e avaliações — ou null se nunca houve registo nenhum. */
export function lastRecordDate({ runs, meals, gymSessions, bodyAssessments }) {
  const dates = [];
  for (const list of [runs, meals, gymSessions, bodyAssessments]) {
    for (const r of list || []) {
      const d = r?.date || r?.assessed_at;
      if (typeof d === 'string' && d.length >= 10) dates.push(d.slice(0, 10));
    }
  }
  if (dates.length === 0) return null;
  return dates.sort().pop();
}

function daysBetween(fromIso, toIso) {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / DAY_MS);
}

/** Escolhe a mensagem proativa para este momento, ou null. Prioridade: manhã
 *  da prova > véspera > depois da prova > silêncio — o dia da prova manda
 *  em tudo o resto. `now` é injetável para os testes. */
export function pickProactiveTrigger({ runs, meals, gymSessions, bodyAssessments, raceEvents, profile }, now = new Date()) {
  const today = isoDay(now);
  const races = (raceEvents || []).filter((r) => r && typeof r.date === 'string');
  const scheduled = races.filter((r) => r.status !== 'concluida');

  const morning = scheduled.find((r) => r.date.slice(0, 10) === today);
  if (morning) {
    return {
      trigger: 'race_morning',
      key: `race_morning:${morning.id}`,
      details: `Prova de hoje: "${morning.name}"${morning.distance_km ? `, ${morning.distance_km} km` : ''}.`,
    };
  }

  const eve = scheduled.find((r) => daysBetween(today, r.date.slice(0, 10)) === 1);
  if (eve) {
    return {
      trigger: 'race_eve',
      key: `race_eve:${eve.id}`,
      details: `Prova amanhã: "${eve.name}"${eve.distance_km ? `, ${eve.distance_km} km` : ''}${eve.location ? `, em ${eve.location}` : ''}.`,
    };
  }

  const afterCandidate = pickRaceAfter({ races, runs, profile, today });
  if (afterCandidate) return afterCandidate;

  const last = lastRecordDate({ runs, meals, gymSessions, bodyAssessments });
  if (last) {
    const gap = daysBetween(last, today);
    if (gap >= SILENCE_DAYS) {
      return {
        trigger: 'silence',
        key: `silence:${last}`,
        details: `Último registo: ${last} (há ${gap} dias).`,
      };
    }
  }
  return null;
}

/* O balanço depois da prova (specs/gamificacao-provas.md, "A Carol no
   balanço"). Duas situações, com chaves diferentes para a segunda não ficar
   calada por causa da primeira:
   - COM a corrida registada e ligada à prova (findRaceRun): do próprio dia da
     prova até 7 dias depois. A chave leva o id da corrida — se a Carol já
     tinha perguntado "como correu?" antes do registo, o balanço a sério
     ainda dispara. Leva o veredicto calculado (raceOutcome) para o servidor
     escrever o balanço com os números certos: superado / perto / aquém, e
     acima ou dentro do que o treino perspetivava.
   - SEM corrida registada: de 1 a 3 dias depois, como antes — ela pergunta
     como correu e pede o registo.
   A prova mais recente ganha. */
function pickRaceAfter({ races, runs, profile, today }) {
  const past = races
    .map((r) => ({ race: r, gap: daysBetween(r.date.slice(0, 10), today) }))
    .filter(({ gap }) => gap >= 0 && gap <= RACE_AFTER_DAYS_WITH_RUN)
    .sort((a, b) => a.gap - b.gap);
  for (const { race, gap } of past) {
    const run = findRaceRun(runs, race);
    const dayLabel = gap === 0 ? 'hoje' : `há ${gap} dia${gap === 1 ? '' : 's'}`;
    if (run) {
      const outcome = classifyRaceOutcome({ race, run, runs, profile });
      const time = outcome.officialSeconds ? formatDuration(outcome.officialSeconds) : null;
      return {
        trigger: 'race_after',
        key: `race_after:${race.id}:${run.id || 'corrida'}`,
        details: `Prova "${race.name}" foi ${dayLabel} (${race.date.slice(0, 10)}). Corrida registada${time ? `: ${time}` : ''}.`,
        raceOutcome: {
          ...buildRaceOutcomePayload(outcome, race, run),
          // As conquistas que esta prova acabou de dar, pela chave — a Carol
          // cita-as no balanço (specs/gamificacao-provas.md §4).
          achievements_new: achievementsForRace({ raceEvents: races, runs, profile }, race.id).filter((a) => a.isNew).map((a) => a.key),
        },
        raceId: race.id,
      };
    }
    if (gap >= 1 && gap <= RACE_AFTER_DAYS_WITHOUT_RUN) {
      return {
        trigger: 'race_after',
        key: `race_after:${race.id}:sem-registo`,
        details: `Prova "${race.name}" foi ${dayLabel} (${race.date.slice(0, 10)}).${race.status === 'concluida' ? ' Está marcada como concluída mas' : ''} Ainda não tem a corrida registada.`,
        raceOutcome: null,
        raceId: race.id,
      };
    }
  }
  return null;
}

/** A prova cujo balanço a Carol ainda não fez — para o Início chamar por ele
 *  ("o balanço da prova") enquanto o chat não for aberto. null se não há
 *  balanço pendente, se já foi dito, ou se outro momento (véspera/manhã de
 *  outra prova) tem prioridade. */
export function pendingRaceBalance({ runs, meals, gymSessions, bodyAssessments, raceEvents, profile }, now = new Date()) {
  const candidate = pickProactiveTrigger({ runs, meals, gymSessions, bodyAssessments, raceEvents, profile }, now);
  if (!candidate || candidate.trigger !== 'race_after' || !candidate.raceOutcome) return null;
  if (wasProactiveSent(profile?.id, candidate)) return null;
  return (raceEvents || []).find((r) => r?.id === candidate.raceId) || null;
}

function storageKey(userId) {
  return `${STORAGE_PREFIX}${userId || 'anon'}`;
}

function readSent(userId) {
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** True se esta chave (trigger + evento) já disparou neste dispositivo. */
export function wasProactiveSent(userId, candidate) {
  if (!candidate) return false;
  return readSent(userId)[candidate.trigger] === candidate.key;
}

export function markProactiveSent(userId, candidate) {
  if (!candidate) return;
  try {
    const sent = readSent(userId);
    sent[candidate.trigger] = candidate.key;
    window.localStorage.setItem(storageKey(userId), JSON.stringify(sent));
  } catch {
    // sem storage (modo privado, quota) — o servidor ainda trava repetições
    // a menos de 6 horas; o pior caso é ela perguntar duas vezes noutro dia.
  }
}
