/* As mensagens que a Carol manda por iniciativa própria — CAROL.md §3 e §7.
   - Segunda (ou terça) → o balanço da semana que acabou, num dia sem mais
     nenhum momento e só se houve registos nessa semana.
   - 3 dias sem qualquer registo → "Estás bem?" no chat, em nome dela (com
     check-ins entretanto, pergunta pelos treinos — P.10).
   - O treino de ontem do plano por registar → pergunta o que aconteceu,
     sem reagendar (P.10); nunca num dia de balanço da semana.
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
import { findEndingBlock, findMissedWorkout, missedWorkoutInReview, weekReviewCandidate, SILENCE_DAYS, RACE_AFTER_DAYS_WITH_RUN, RACE_AFTER_DAYS_WITHOUT_RUN } from '@formulas/proactiveTriggers.ts';
import { addDaysISO } from '../lib/utils';

/** Depois da prova, com a corrida registada, o balanço vale durante uma
 *  semana — depois disso já é história, não é "o balanço". Sem corrida
 *  registada, a Carol só pergunta como correu durante 3 dias. Os valores
 *  vivem em @formulas/proactiveTriggers.ts, os mesmos que o tick do servidor usa. */
export { SILENCE_DAYS, RACE_AFTER_DAYS_WITH_RUN, RACE_AFTER_DAYS_WITHOUT_RUN };
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
export function lastRecordDate(data) {
  const dates = recordDates(data);
  if (dates.length === 0) return null;
  return dates.sort().pop();
}

function daysBetween(fromIso, toIso) {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / DAY_MS);
}

/** Todos os momentos que se aplicam agora, pela ordem de prioridade do
 *  servidor: manhã da prova > véspera > depois da prova > fim de bloco >
 *  silêncio — o dia da prova manda em tudo o resto. O balanço da semana só
 *  aparece num dia sem mais nenhum momento do servidor, incluindo o assunto
 *  por resolver e o conflito de provas, que esta lista não mostra
 *  (weekReviewCandidate). `now` é injetável para os testes. Usada pelo
 *  efeito passivo do Coach (P.9) para saber a que candidato uma
 *  notificação tocada corresponde, mesmo que não seja o primeiro da lista;
 *  `pickProactiveTrigger` continua a ser só o primeiro. */
export function listProactiveTriggers({ runs, meals, gymSessions, bodyAssessments, raceEvents, profile, coachPlans = [], coachPlanItems = [], dailyCheckins = [] }, now = new Date()) {
  const today = isoDay(now);
  const races = (raceEvents || []).filter((r) => r && typeof r.date === 'string');
  const scheduled = races.filter((r) => r.status !== 'concluida');
  const list = [];

  const morning = scheduled.find((r) => r.date.slice(0, 10) === today);
  if (morning) {
    list.push({
      trigger: 'race_morning',
      key: `race_morning:${morning.id}`,
      details: `Prova de hoje: "${morning.name}"${morning.distance_km ? `, ${morning.distance_km} km` : ''}.`,
    });
  }

  const eve = scheduled.find((r) => daysBetween(today, r.date.slice(0, 10)) === 1);
  if (eve) {
    list.push({
      trigger: 'race_eve',
      key: `race_eve:${eve.id}`,
      details: `Prova amanhã: "${eve.name}"${eve.distance_km ? `, ${eve.distance_km} km` : ''}${eve.location ? `, em ${eve.location}` : ''}.`,
    });
  }

  const afterCandidate = pickRaceAfter({ races, runs, profile, today });
  if (afterCandidate) list.push(afterCandidate);

  const trainingPlanIds = trainingPlanIdsOf(coachPlanItems);
  const block = endingBlock({ coachPlans, coachPlanItems }, today);
  if (block) list.push(block.candidate);

  const last = lastRecordDate({ runs, meals, gymSessions, bodyAssessments });
  if (last) {
    const gap = daysBetween(last, today);
    if (gap >= SILENCE_DAYS) {
      /* Com check-ins depois do último registo, ele está por cá: o que falta
         são os treinos (P.10) — o chat pergunta por eles em vez de "Estás
         bem?". Os dias contam desde o último treino, não do último registo. */
      const lastCheckin = latestDate(dailyCheckins);
      const lastTraining = latestDate([...(runs || []), ...(gymSessions || [])]);
      const trainingGap = lastTraining ? `o último treino foi há ${daysBetween(lastTraining, today)} dias` : 'não há treinos registados';
      list.push({
        trigger: 'silence',
        key: `silence:${last}`,
        details: lastCheckin && lastCheckin > last
          ? `Último registo: ${last} (há ${gap} dias). Fez check-in depois disso (último: ${lastCheckin}): está por cá, faltam os treinos — ${trainingGap}.`
          : `Último registo: ${last} (há ${gap} dias).`,
      });
    }
  }

  /* O balanço da semana (2026-09-24): à segunda e à terça, a semana de
     segunda a domingo que acabou — com algum registo dentro dela, e só num
     dia sem mais nenhum momento. A decisão é a do servidor, tal e qual
     (weekReviewCandidate): com as provas, os planos e o assunto por
     resolver do perfil, que esta lista não mostra (vivem no Início) mas que
     também ficam com o dia. Assim a notificação e o chat nunca discordam. As
     contagens vão no Contexto, para ela não as adivinhar. */
  const week = weekReviewCandidate({
    raceEvents: races,
    runs,
    lastRecordDate: last,
    intervention: { status: profile?.coach_intervention_status ?? null, reason: profile?.coach_intervention_reason ?? null },
    plans: (coachPlans || []).map((p) => ({ ...p, hasTraining: trainingPlanIds.has(p.id) })),
    weekRecordDates: recordDates({ runs, meals, gymSessions, bodyAssessments }),
  }, today);
  if (week) {
    list.push({
      trigger: 'week_review',
      key: `week_review:${week.weekStart}`,
      details: describeWeek({ runs, meals, gymSessions, dailyCheckins }, week.weekStart, week.weekEnd),
    });
  }
  /* O treino de ontem por registar (P.10): a régua do servidor
     (findMissedWorkout), para a chave ser a da notificação. Vem por último.
     À segunda, o treino de domingo é da semana revista — assunto do balanço,
     e não entra; à terça, o de segunda já é da semana nova e entra a seguir
     ao balanço (missedWorkoutInReview, a mesma do servidor). */
  const missed = findMissedWorkout({
    plans: coachPlans,
    planItems: coachPlanItems,
    trainingDates: [...(runs || []), ...(gymSessions || [])].map((r) => r?.date ?? null),
    raceEvents: races,
  }, today);
  if (missed && !missedWorkoutInReview(missed.date, week)) {
    list.push({
      trigger: 'missed_workout',
      key: `missed_workout:${missed.date}`,
      details: `Treino de ontem (${missed.date}) por registar: ${missed.items.map(missedItemLabel).join(' + ')}.`,
    });
  }
  return list;
}

const ITEM_KIND_LABEL = { corrida: 'corrida', ginasio: 'ginásio' };

/** "corrida (longo, 16 km)" — o que o plano pedia, para o Contexto do chat. */
function missedItemLabel(item) {
  const km = Number(item?.target_distance_km);
  const parts = [item?.training_type, Number.isFinite(km) && km > 0 ? `${String(km).replace('.', ',')} km` : null].filter(Boolean);
  return `${ITEM_KIND_LABEL[item?.kind] || item?.kind}${parts.length ? ` (${parts.join(', ')})` : ''}`;
}

/** A data mais recente (yyyy-mm-dd) de uma lista de registos, ou null. */
function latestDate(list) {
  const dates = (list || []).map((r) => (typeof r?.date === 'string' ? r.date.slice(0, 10) : null)).filter(Boolean);
  return dates.length ? dates.sort().pop() : null;
}

function trainingPlanIdsOf(coachPlanItems) {
  return new Set((coachPlanItems || [])
    .filter((i) => i?.kind === 'corrida' || i?.kind === 'ginasio')
    .map((i) => i.plan_id));
}

/* O bloco de treino (sem prova) a acabar, sem outro a seguir (P.5). A régua
   é a do servidor (@formulas/proactiveTriggers.ts), para a chave ser a mesma
   da notificação. Um plano só de refeições não é um bloco. Devolve o
   candidato e o "quando" dito por extenso, que o aviso do Início também usa
   (ação P.11); null sem bloco a acabar. */
export function endingBlock({ coachPlans = [], coachPlanItems = [] }, today) {
  const trainingPlanIds = trainingPlanIdsOf(coachPlanItems);
  const block = findEndingBlock((coachPlans || []).map((p) => ({ ...p, hasTraining: trainingPlanIds.has(p.id) })), today);
  if (!block) return null;
  const end = String(block.period_end).slice(0, 10);
  const gap = daysBetween(today, end);
  const when = gap <= 0 ? 'hoje' : gap === 1 ? 'amanhã' : `daqui a ${gap} dias`;
  return {
    when,
    candidate: {
      trigger: 'block_end',
      key: `block_end:${block.id}`,
      details: `O bloco de treino acaba ${when} (${end}) e não há outro a seguir.`,
    },
  };
}

/** O aviso "O bloco está a acabar" do Início (ação P.11): o mesmo candidato
 *  do chat e da notificação, enquanto a conversa não tiver acontecido neste
 *  dispositivo nem o aviso tiver sido dispensado em nenhum. null quando não
 *  há. `now` é injetável para os testes. */
export function pendingBlockEndAlert({ coachPlans, coachPlanItems, profile, impressionDismissed = null }, now = new Date()) {
  const block = endingBlock({ coachPlans, coachPlanItems }, isoDay(now));
  if (!block) return null;
  const { candidate } = block;
  if (wasProactiveSent(profile?.id, candidate) || wasProactiveDismissed(profile?.id, candidate)) return null;
  if (impressionDismissed?.has(`alert:${candidate.key}`)) return null;
  return block;
}

/** As datas de todos os registos (corridas, refeições, ginásio, avaliações). */
function recordDates({ runs, meals, gymSessions, bodyAssessments }) {
  const dates = [];
  for (const list of [runs, meals, gymSessions, bodyAssessments]) {
    for (const r of list || []) {
      const d = r?.date || r?.assessed_at;
      if (typeof d === 'string' && d.length >= 10) dates.push(d.slice(0, 10));
    }
  }
  return dates;
}

const inRange = (d, from, to) => typeof d === 'string' && d.slice(0, 10) >= from && d.slice(0, 10) <= to;
// Vírgula decimal em todos os números do Contexto: o modelo copia o formato.
const fmtNum = (n) => (Math.round(n * 10) / 10).toString().replace('.', ',');

function weekCounts({ runs, meals, gymSessions, dailyCheckins }, from, to) {
  const weekRuns = (runs || []).filter((r) => inRange(r?.date, from, to));
  const km = weekRuns.reduce((sum, r) => sum + (Number(r?.distance_km) || 0), 0);
  const gym = (gymSessions || []).filter((g) => inRange(g?.date, from, to)).length;
  const mealDays = new Set((meals || []).filter((m) => inRange(m?.date, from, to)).map((m) => m.date.slice(0, 10))).size;
  const checkins = (dailyCheckins || []).filter((c) => inRange(c?.date, from, to));
  return { runs: weekRuns.length, km, gym, mealDays, checkins };
}

function avg(list, field) {
  const vals = list.map((c) => Number(c?.[field])).filter((v) => Number.isFinite(v) && v > 0);
  return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
}

/** O resumo da semana em números, para o Contexto do balanço. Só factos
 *  contados dos registos: o que o plano previa vem do bloco O QUE
 *  PRESCREVESTE do servidor. */
export function describeWeek(data, weekStart, weekEnd) {
  const w = weekCounts(data, weekStart, weekEnd);
  const prevStart = addDaysISO(weekStart, -7);
  const p = weekCounts(data, prevStart, addDaysISO(weekStart, -1));
  const parts = [
    `Semana de ${weekStart} a ${weekEnd}: ${w.runs} corrida${w.runs === 1 ? '' : 's'} (${fmtNum(w.km)} km)`,
    `${w.gym} sess${w.gym === 1 ? 'ão' : 'ões'} de ginásio`,
    `refeições registadas em ${w.mealDays} de 7 dias`,
    `${w.checkins.length} check-in${w.checkins.length === 1 ? '' : 's'}`,
  ];
  const sleep = avg(w.checkins, 'sleep');
  const energy = avg(w.checkins, 'energy');
  const checkinLine = sleep != null || energy != null
    ? ` Check-ins: sono médio ${sleep != null ? fmtNum(sleep) : '—'}/5, energia média ${energy != null ? fmtNum(energy) : '—'}/5.`
    : '';
  return `${parts.join(', ')}.${checkinLine} Semana anterior: ${p.runs} corrida${p.runs === 1 ? '' : 's'} (${fmtNum(p.km)} km), ${p.gym} de ginásio.`;
}

/** Escolhe a mensagem proativa para este momento, ou null — o primeiro de
 *  listProactiveTriggers. */
export function pickProactiveTrigger(data, now = new Date()) {
  return listProactiveTriggers(data, now)[0] ?? null;
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
      // `today` TEM de ir: evaluateRace usa-o para decidir o que é "novo"
      // (a prova ter menos de 7 dias) e, sem ele, essa decisão caía no
      // relógio real enquanto todo o resto desta função corre no `today`
      // injetado. As duas leituras discordavam na hora a seguir à
      // meia-noite local e em qualquer chamada com data simulada — a
      // Carol dava o balanço sem citar a conquista que a prova acabou de
      // dar (apanhado 2026-09-18 por um teste que fixa o relógio). Desde a
      // fusão dos motores (utils/premios.js) o relógio é OBRIGATÓRIO e já
      // não é um Date: é o dia ISO, o mesmo que corre aqui.
      achievements_new: achievementsForRace({ raceEvents, runs, profile, today }, race.id).filter((a) => a.isNew).map((a) => a.key),
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
export function pendingRaceBalanceCandidate({ runs, meals, gymSessions, bodyAssessments, raceEvents, profile, impressionDismissed = null }, now = new Date()) {
  const candidate = pickProactiveTrigger({ runs, meals, gymSessions, bodyAssessments, raceEvents, profile }, now);
  if (!candidate || candidate.trigger !== 'race_after' || !candidate.raceOutcome) return null;
  if (wasProactiveSent(profile?.id, candidate)) return null;
  if (wasProactiveDismissed(profile?.id, candidate)) return null;
  // Dispensado noutro dispositivo (ação 5.1): a impressão 'alert' com a
  // chave do candidato, que o Início grava ao dispensar e o store lê
  // (impressionDismissed, chaves `kind:key`). dismissProactiveAlert continua
  // a escrever só a marca local.
  if (impressionDismissed?.has(`alert:${candidate.key}`)) return null;
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
