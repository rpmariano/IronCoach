/* As mensagens que a Carol manda por iniciativa própria — CAROL.md §3 e §7.
   - 3 dias sem qualquer registo → "Estás bem?" no chat, em nome dela.
   - Véspera da prova → o que fazer hoje e amanhã de manhã.
   - Manhã da prova → curta, duas frases, sem dados.
   - Depois da prova → o balanço, com opinião (e com o veredicto calculado
     em utils/raceOutcome.js quando a corrida da prova está registada).
   Este ficheiro só DECIDE qual (se alguma) se aplica agora e devolve a
   chave que a torna única — o texto é escrito pelo modelo no coach-chat
   (proactive_trigger), a partir do contexto real do atleta. A chave evita
   que a mesma mensagem dispare duas vezes: vai no pedido (proactive_key)
   e o servidor regista-a em coach_proactive_log, recusando-a depois em
   qualquer dispositivo. O localStorage (markProactiveSent) fica como
   atalho para não fazer o pedido; o servidor ainda recusa se ela tiver
   falado há menos de 6 horas. */

import { findRaceRun, formatDuration } from './run';
import { classifyRaceOutcome, buildRaceOutcomePayload } from './raceOutcome';
import { achievementsForRace } from './achievements';
import { findEndingBlock } from '@formulas/proactiveTriggers.ts';

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

/** O dia ISO como Date, ao meio-dia LOCAL. Meio-dia e não meia-noite para
 *  que isoDay() devolva sempre o mesmo dia de volta, sem o apanhar do lado
 *  errado numa mudança de hora. Serve para passar o "hoje" desta função a
 *  quem só aceita um Date (evaluateRace). */
function dayAsDate(iso) {
  return new Date(`${iso}T12:00:00`);
}

function daysBetween(fromIso, toIso) {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / DAY_MS);
}

/** Escolhe a mensagem proativa para este momento, ou null. Prioridade: manhã
 *  da prova > véspera > depois da prova > silêncio — o dia da prova manda
 *  em tudo o resto. `now` é injetável para os testes. */
export function pickProactiveTrigger({ runs, meals, gymSessions, bodyAssessments, raceEvents, profile, coachPlans = [], coachPlanItems = [] }, now = new Date()) {
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

  /* O bloco de treino (sem prova) a acabar, sem outro a seguir (P.5). A
     régua é a do servidor (@formulas/proactiveTriggers.ts), para a chave ser
     a mesma da notificação. Um plano só de refeições não é um bloco. */
  const trainingPlanIds = new Set((coachPlanItems || [])
    .filter((i) => i?.kind === 'corrida' || i?.kind === 'ginasio')
    .map((i) => i.plan_id));
  const block = findEndingBlock((coachPlans || []).map((p) => ({ ...p, hasTraining: trainingPlanIds.has(p.id) })), today);
  if (block) {
    const end = String(block.period_end).slice(0, 10);
    const gap = daysBetween(today, end);
    const when = gap <= 0 ? 'hoje' : gap === 1 ? 'amanhã' : `daqui a ${gap} dias`;
    return {
      trigger: 'block_end',
      key: `block_end:${block.id}`,
      details: `O bloco de treino acaba ${when} (${end}) e não há outro a seguir.`,
    };
  }

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
/** O candidato do balanço COM corrida registada — o mesmo objeto quer venha
 *  do chat (pickProactiveTrigger) quer do hub (utils/raceBalance.js), para a
 *  chave, os números e as conquistas serem sempre os mesmos. null sem
 *  corrida ligada. `today` só entra no texto ("hoje", "há 2 dias"). */
export function buildRaceAfterCandidate({ race, run: givenRun, runs = [], raceEvents = [], profile = {}, today = isoDay(new Date()) }) {
  if (!race?.id || !race?.date) return null;
  const run = givenRun || findRaceRun(runs, race);
  if (!run) return null;
  const gap = daysBetween(race.date.slice(0, 10), today);
  const dayLabel = gap <= 0 ? 'hoje' : `há ${gap} dia${gap === 1 ? '' : 's'}`;
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
      // `now` TEM de ir: evaluateRace usa-o para decidir o que é "novo"
      // (a prova ter menos de 7 dias) e, sem ele, essa decisão caía no
      // relógio real enquanto todo o resto desta função corre no `now`
      // injetado. As duas leituras discordavam na hora a seguir à
      // meia-noite local e em qualquer chamada com data simulada — a
      // Carol dava o balanço sem citar a conquista que a prova acabou de
      // dar (apanhado 2026-09-18 por um teste que fixa o relógio).
      achievements_new: achievementsForRace({ raceEvents, runs, profile, now: dayAsDate(today) }, race.id).filter((a) => a.isNew).map((a) => a.key),
    },
    raceId: race.id,
  };
}

function pickRaceAfter({ races, runs, profile, today }) {
  const past = races
    .map((r) => ({ race: r, gap: daysBetween(r.date.slice(0, 10), today) }))
    .filter(({ gap }) => gap >= 0 && gap <= RACE_AFTER_DAYS_WITH_RUN)
    .sort((a, b) => a.gap - b.gap);
  for (const { race, gap } of past) {
    const run = findRaceRun(runs, race);
    const dayLabel = gap === 0 ? 'hoje' : `há ${gap} dia${gap === 1 ? '' : 's'}`;
    if (run) {
      return buildRaceAfterCandidate({ race, run, runs, raceEvents: races, profile, today });
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

/** O candidato do balanço pendente — mesma regra do Início ("o balanço da
 *  prova") mas devolvendo o candidato completo (details/raceOutcome/key),
 *  não só a prova. É o que o botão "Falar com a Carol" do Início precisa
 *  para pedir o balanço a sério (com `proactive_force`) em vez de só mudar
 *  de separador e esperar que o efeito passivo do Coach o apanhe — esse
 *  efeito não força, e se a Carol tiver falado por qualquer outro motivo há
 *  menos de 6h (PROACTIVE_QUIET_HOURS no coach-chat) o pedido é recusado em
 *  silêncio e o botão não faz nada visível (bug reportado 2026-09-14). */
export function pendingRaceBalanceCandidate({ runs, meals, gymSessions, bodyAssessments, raceEvents, profile }, now = new Date()) {
  const candidate = pickProactiveTrigger({ runs, meals, gymSessions, bodyAssessments, raceEvents, profile }, now);
  if (!candidate || candidate.trigger !== 'race_after' || !candidate.raceOutcome) return null;
  if (wasProactiveSent(profile?.id, candidate)) return null;
  if (wasProactiveDismissed(profile?.id, candidate)) return null;
  // A marca acima é só deste dispositivo e só se grava quando a resposta
  // chega ao ecrã que a pediu. O balanço já feito é a prova de que a
  // conversa aconteceu — venha do hub ou do chat, deste dispositivo ou de
  // outro (bug relatado 2026-09-15: o aviso ficava depois de falar com ela
  // pelos dois sítios).
  const race = (raceEvents || []).find((r) => r?.id === candidate.raceId);
  if (hasRaceBalance(race)) return null;
  return candidate;
}

/** Prefixo da cópia local do balanço da prova (utils/raceBalance.js). Vive
 *  aqui para os dois ficheiros lerem a mesma chave sem se importarem um ao
 *  outro em círculo. */
export const RACE_BALANCE_CACHE_PREFIX = 'ironcoach:balanco:';

/** True se esta prova já tem o balanço da Carol: a coluna no servidor
 *  (race_events.coach_balance, qualquer dispositivo) ou a cópia local. */
export function hasRaceBalance(race) {
  if (!race?.id) return false;
  if (race.coach_balance) return true;
  try {
    const raw = window.localStorage.getItem(`${RACE_BALANCE_CACHE_PREFIX}${race.id}`);
    const parsed = raw ? JSON.parse(raw) : null;
    return !!(parsed && typeof parsed.text === 'string' && parsed.text.trim());
  } catch {
    return false;
  }
}

/** A prova cujo balanço a Carol ainda não fez — para o Início chamar por ele
 *  ("o balanço da prova") enquanto o chat não for aberto. null se não há
 *  balanço pendente, se já foi dito, ou se outro momento (véspera/manhã de
 *  outra prova) tem prioridade. */
export function pendingRaceBalance(data, now = new Date()) {
  const candidate = pendingRaceBalanceCandidate(data, now);
  if (!candidate) return null;
  return (data.raceEvents || []).find((r) => r?.id === candidate.raceId) || null;
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

/* "Dispensar aviso" do balanço (Início) é uma chave PRÓPRIA, separada de
   markProactiveSent — achado 2026-09-15: usar a mesma marca fazia
   `balanceAlreadyGivenInChat` (raceBalance.js, lida pelo hub) e o efeito
   passivo do Coach pensarem que a conversa tinha mesmo acontecido, e
   deixarem de a oferecer. Dispensar o LEMBRETE não é dizer "já falámos" —
   só cala o botão flutuante; o hub e o chat continuam a poder pedir o
   balanço sozinhos da próxima vez. */
const DISMISS_STORAGE_PREFIX = 'ironcoach:carol-dispensada:';

function dismissStorageKey(userId) {
  return `${DISMISS_STORAGE_PREFIX}${userId || 'anon'}`;
}

function wasProactiveDismissed(userId, candidate) {
  if (!candidate) return false;
  try {
    const raw = window.localStorage.getItem(dismissStorageKey(userId));
    const parsed = raw ? JSON.parse(raw) : null;
    return !!parsed && typeof parsed === 'object' && parsed[candidate.trigger] === candidate.key;
  } catch {
    return false;
  }
}

/** Dispensa só o AVISO deste candidato (o botão flutuante do Início) — não
 *  marca a conversa como tida para o resto da app. Ver a nota acima. */
export function dismissProactiveAlert(userId, candidate) {
  if (!candidate) return;
  try {
    const raw = window.localStorage.getItem(dismissStorageKey(userId));
    const parsed = raw ? JSON.parse(raw) : null;
    const dismissed = parsed && typeof parsed === 'object' ? parsed : {};
    dismissed[candidate.trigger] = candidate.key;
    window.localStorage.setItem(dismissStorageKey(userId), JSON.stringify(dismissed));
  } catch {
    // sem storage — o pior caso é o aviso voltar a aparecer.
  }
}
