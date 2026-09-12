/* Quando a realidade se afastou do plano — specs/plano-de-prova.md,
   "O plano tem de saber da prova" (Alerta de ajuste).

   Sem tabela nova e sem servidor: isto é uma leitura do que já está no
   store. Quatro motivos, todos coisas que o atleta vê e a Carol não sabe
   que ela própria devia corrigir:

   1. prova_sem_item          — há uma prova dentro do período de um plano
                                aceite e o plano não tem lá o dia da prova;
   2. treino_no_dia_da_prova  — o plano marcou um treino no dia da prova;
   3. treino_forte_na_vespera — trabalho duro (ou ginásio) a um ou dois dias
                                da prova, quando só cabe recuperação;
   4. sessoes_falhadas        — duas ou mais sessões pendentes que já
                                passaram e não têm registo nenhum.

   Só planos ACEITES com período a cobrir hoje ou o futuro entram: um plano
   que já terminou não se ajusta, revê-se.

   A `signature` é o que impede a Carol de chamar pela mesma coisa todos os
   dias — leva o(s) plano(s) e o motivo com a data a que se refere, por isso
   muda assim que o plano mudar (ou a prova sair, ou a sessão for
   registada), e só então ela volta a falar. Guarda-se em localStorage por
   utilizador, como em coachProactive.js. */

import { todayISO } from '../lib/utils';
import { formatDayMonth, planItemTitle, isRacePlanItem } from './homeModels';

/** Trabalho duro que não tem lugar nos dois dias antes de uma prova
 *  (doutrina do taper — specs/plano-de-prova.md). */
export const HARD_RUN_TYPES = ['longo', 'intervalos', 'tempo', 'sprints', 'fartlek'];
/** Quantos dias antes da prova é que já só cabe recuperação ou descanso. */
export const RACE_EVE_DAYS = 2;
/** A janela das sessões falhadas, e quantas são precisas para valer aviso. */
export const MISSED_LOOKBACK_DAYS = 7;
export const MISSED_MIN = 2;

const STORAGE_PREFIX = 'ironcoach:plano-ajuste:';

const dayOf = (v) => (typeof v === 'string' && v.length >= 10 ? v.slice(0, 10) : null);

function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const EVE_LABEL = { 1: 'na véspera', 2: 'a dois dias' };

/** "Corrida do Tejo (13 set)" — o nome e o dia, como a Carol os diria. */
function raceLabel(race) {
  return `${race.name || 'a prova'} (${formatDayMonth(dayOf(race.date))})`;
}

/**
 * O que se afastou do plano, agora.
 * @returns {{ reasons: {key: string, text: string}[], signature: string|null }}
 */
export function detectPlanDivergence({
  coachPlans = [], coachPlanItems = [], raceEvents = [], runs = [], gymSessions = [], today = todayISO(),
} = {}) {
  const empty = { reasons: [], signature: null };

  const plans = (coachPlans || []).filter(
    (p) => p && p.status === 'aceite' && dayOf(p.period_start) && dayOf(p.period_end) && dayOf(p.period_end) >= today,
  );
  if (plans.length === 0) return empty;

  const planIds = new Set(plans.map((p) => p.id));
  const items = (coachPlanItems || []).filter(
    (i) => i && planIds.has(i.plan_id) && i.status !== 'cancelado' && dayOf(i.planned_date),
  );
  const inPlanPeriod = (dateISO) => plans.some((p) => dateISO >= dayOf(p.period_start) && dateISO <= dayOf(p.period_end));

  // As provas por correr que caem dentro do período de um plano aceite. Uma
  // prova já concluída não se planeia; uma prova fora do período do plano é
  // assunto do próximo plano, não deste.
  const races = (raceEvents || [])
    .filter((r) => r && r.status !== 'concluida' && dayOf(r.date) && inPlanPeriod(dayOf(r.date)))
    .sort((a, b) => dayOf(a.date).localeCompare(dayOf(b.date)));

  const reasons = [];
  const parts = [];
  const push = (key, ref, text) => {
    reasons.push({ key, text });
    parts.push(`${key}:${ref}`);
  };

  for (const race of races) {
    const date = dayOf(race.date);
    const onDay = items.filter((i) => dayOf(i.planned_date) === date);

    // 1. A prova não está no plano.
    if (!onDay.some(isRacePlanItem)) {
      push('prova_sem_item', `${race.id}:${date}`, `A ${raceLabel(race)} não está no plano.`);
    }

    // 2. E o que lá está no dia dela é um treino.
    for (const item of onDay) {
      if (isRacePlanItem(item) || item.kind === 'descanso') continue;
      push(
        'treino_no_dia_da_prova',
        `${race.id}:${item.id}`,
        `${raceLabel(race)}: o plano tem ${planItemTitle(item)} no dia da prova.`,
      );
    }

    // 3. Trabalho duro na véspera e na antevéspera.
    for (let gap = 1; gap <= RACE_EVE_DAYS; gap += 1) {
      const eve = addDays(date, -gap);
      for (const item of items.filter((i) => dayOf(i.planned_date) === eve)) {
        const hardRun = item.kind === 'corrida' && HARD_RUN_TYPES.includes(item.training_type);
        if (!hardRun && item.kind !== 'ginasio') continue;
        push(
          'treino_forte_na_vespera',
          `${race.id}:${item.id}`,
          `${raceLabel(race)}: ${planItemTitle(item)} a ${formatDayMonth(eve)}, ${EVE_LABEL[gap]} da prova.`,
        );
      }
    }
  }

  // 4. Sessões que passaram e não têm registo nenhum. A data conta pelo
  //    calendário: um treino de terça registado à quarta não é o de terça.
  const from = addDays(today, -MISSED_LOOKBACK_DAYS);
  const doneDays = new Set([
    ...(runs || []).map((r) => dayOf(r?.date)),
    ...(gymSessions || []).map((g) => dayOf(g?.date)),
  ].filter(Boolean));
  const missed = items
    .filter((i) => (i.kind === 'corrida' || i.kind === 'ginasio') && i.status === 'pendente')
    .filter((i) => {
      const d = dayOf(i.planned_date);
      return d >= from && d < today && !doneDays.has(d);
    })
    .sort((a, b) => dayOf(a.planned_date).localeCompare(dayOf(b.planned_date)));

  if (missed.length >= MISSED_MIN) {
    const dates = missed.map((i) => dayOf(i.planned_date));
    push(
      'sessoes_falhadas',
      dates.join('+'),
      `${missed.length} sessões do plano ficaram por registar nos últimos ${MISSED_LOOKBACK_DAYS} dias (${dates.map(formatDayMonth).join(', ')}).`,
    );
  }

  if (reasons.length === 0) return empty;
  const ids = [...planIds].map(String).sort().join('+');
  return { reasons, signature: `${ids}|${[...parts].sort().join(',')}` };
}

function storageKey(userId) {
  return `${STORAGE_PREFIX}${userId || 'anon'}`;
}

/** True se esta mesma divergência já foi levada à Carol neste dispositivo.
 *  Guarda-se só a última: mal o plano (ou a realidade) mude, a assinatura
 *  muda e ela volta a poder falar. */
export function wasDivergenceHandled(userId, signature) {
  if (!signature) return false;
  try {
    return window.localStorage.getItem(storageKey(userId)) === signature;
  } catch {
    return false;
  }
}

export function markDivergenceHandled(userId, signature) {
  if (!signature) return;
  try {
    window.localStorage.setItem(storageKey(userId), signature);
  } catch {
    // sem storage (modo privado, quota) — o pior caso é ela voltar a propor
    // o mesmo ajuste amanhã, não é perder nada.
  }
}

/** O que vai no body do check-in: no máximo 6 textos, que é o que o
 *  coach-chat aceita em `plan_divergence`. */
export const MAX_DIVERGENCE_TEXTS = 6;
