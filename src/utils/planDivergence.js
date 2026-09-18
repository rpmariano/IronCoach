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
                                passaram e não têm registo nenhum, planeadas
                                DEPOIS da última reescrita do plano (ver
                                lastRewriteDay, abaixo).

   Só planos ACEITES com período a cobrir hoje ou o futuro entram: um plano
   que já terminou não se ajusta, revê-se.

   A `signature` é o que impede a Carol de chamar pela mesma coisa todos os
   dias — leva o(s) plano(s) e o motivo com a data a que se refere, por isso
   muda assim que o plano mudar (ou a prova sair, ou a sessão for
   registada), e só então ela volta a falar. Guarda-se em localStorage por
   utilizador, como em coachProactive.js. */

import { todayISO } from '../lib/utils';
import { formatDayMonth, planItemTitle, isRacePlanItem } from './homeModels';
import { PRE_RACE_HARD_RUN_TYPES, PRE_RACE_EASY_DAYS } from '@formulas/vocabulary.ts';

/** Trabalho duro que não tem lugar nos dois dias antes de uma prova — a
 *  MESMA lista que o servidor recusa no runProposeTrainingPlan
 *  (specs/plano-de-prova.md). */
export const HARD_RUN_TYPES = PRE_RACE_HARD_RUN_TYPES;
/** Quantos dias antes da prova é que já só cabe recuperação ou descanso. */
export const RACE_EVE_DAYS = PRE_RACE_EASY_DAYS;
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
export function raceLabel(race) {
  return `${race.name || 'a prova'} (${formatDayMonth(dayOf(race.date))})`;
}

/** O dia em que a Carol reescreveu este plano pela última vez: o dia do item
 *  mais recente (created_at). Ajustar um plano aceite não cria um plano novo
 *  — os itens novos passam para o original (respondToPlan, caso A) e os dias
 *  passados ficam como estavam, "pendente". Sem isto, duas sessões falhadas
 *  antes do ajuste continuavam a chamar pela Carol depois de ela as ter
 *  tido à frente e ajustado o plano por causa delas (relatado 2026-09-13).
 *  null quando os itens não trazem created_at (dados antigos, demo). */
function lastRewriteDay(items) {
  let last = null;
  for (const i of items) {
    if (!i?.created_at) continue;
    const d = new Date(i.created_at);
    if (Number.isNaN(d.getTime())) continue;
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!last || day > last) last = day;
  }
  return last;
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
  // Só provas por correr (hoje ou depois): uma prova de ontem por marcar
  // como concluída já não se ajusta — é para registar, não para planear.
  // Provas cujo conflito com o plano o atleta já decidiu ficam de fora de
  // tudo: a Carol tentou, ele decidiu, não se insiste
  // (specs/plano-vinculado-a-prova.md §2.5). A decisão vive na prova, na BD,
  // e não no localStorage das divergências — muda de dispositivo com ele.
  const races = (raceEvents || [])
    .filter((r) => r && r.status !== 'concluida' && !r.conflict_acknowledged_at
      && dayOf(r.date) && dayOf(r.date) >= today && inPlanPeriod(dayOf(r.date)))
    .sort((a, b) => dayOf(a.date).localeCompare(dayOf(b.date)));
  // Uma principal a meio de um plano para outra prova não é uma divergência
  // dispensável — é um conflito que exige decisão, e sai pelo canal da
  // intervenção (detectRaceConflict, abaixo). Aqui ignora-se para o atleta
  // não receber o mesmo assunto duas vezes, em dois tons diferentes.
  const conflicting = new Set(
    (detectRaceConflict({ coachPlans, raceEvents, today })?.races || []).map((r) => r.id),
  );
  // Para os motivos ligados à prova só contam itens pendentes e por
  // acontecer: os intervalos feitos anteontem já não se mudam.
  const upcoming = items.filter((i) => i.status === 'pendente' && dayOf(i.planned_date) >= today);

  const reasons = [];
  const parts = [];
  const push = (key, ref, text) => {
    reasons.push({ key, text });
    parts.push(`${key}:${ref}`);
  };

  // 0. O plano perdeu a prova-objetivo — foi apagada, ou passou para antes do
  //    início do plano. Lê-se de race_lost_at e não da ausência da prova: a
  //    FK é `on delete set null`, por isso depois de apagar a prova o race_id
  //    já é null, que é o mesmo estado de um plano de base que nunca teve
  //    prova. A versão anterior procurava um race_id sem prova na agenda, um
  //    estado que a base de dados não consegue produzir — o aviso nunca
  //    disparava (achado M1 da revisão pré-deploy de 2026-09-18). O
  //    race_lost_at é gravado por trigger no momento em que acontece
  //    (migration 20260918074705).
  for (const plan of plans) {
    if (plan.race_id || !plan.race_lost_at) continue;
    push('plano_sem_prova', `${plan.id}:${String(plan.race_lost_at).slice(0, 10)}`, 'O plano ficou sem a prova que preparava.');
  }

  for (const race of races) {
    if (conflicting.has(race.id)) continue;
    const date = dayOf(race.date);
    const onDay = upcoming.filter((i) => dayOf(i.planned_date) === date);

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
      for (const item of upcoming.filter((i) => dayOf(i.planned_date) === eve)) {
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
  //    Só contam as planeadas desde a última reescrita do plano: as de antes
  //    a Carol já as viu quando o ajustou.
  const from = addDays(today, -MISSED_LOOKBACK_DAYS);
  const rewriteByPlan = new Map(
    [...planIds].map((id) => [id, lastRewriteDay(items.filter((i) => i.plan_id === id))]),
  );
  const doneDays = new Set([
    ...(runs || []).map((r) => dayOf(r?.date)),
    ...(gymSessions || []).map((g) => dayOf(g?.date)),
  ].filter(Boolean));
  const missed = items
    .filter((i) => (i.kind === 'corrida' || i.kind === 'ginasio') && i.status === 'pendente')
    .filter((i) => {
      const d = dayOf(i.planned_date);
      const rewrite = rewriteByPlan.get(i.plan_id);
      return d >= from && d < today && !doneDays.has(d) && (!rewrite || d >= rewrite);
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

/**
 * Uma prova PRINCIPAL a meio de um plano que prepara outra prova — o conflito
 * que obriga a decidir (specs/plano-vinculado-a-prova.md §2.4).
 *
 * Porque é que isto não é uma divergência como as outras: o taper de uma prova
 * principal são 10-21 dias de polimento. Duas seguidas dentro do mesmo bloco
 * pedem dois polimentos incompatíveis — treinar para uma é sabotar a outra.
 * Não há plano correto enquanto as duas forem principais, por isso o aviso não
 * se dispensa: sai pelo canal da intervenção ("A Carol precisa de falar
 * contigo"), sem botão de dispensar, até o atleta decidir. A decisão dele —
 * qualquer uma das três, incluindo "fica como está" — grava-se na prova
 * (conflict_acknowledged_at) e cala isto para sempre nessa prova.
 *
 * @returns {{ plan: object, target: object|null, races: object[] }|null}
 */
export function detectRaceConflict({ coachPlans = [], raceEvents = [], today = todayISO() } = {}) {
  const plans = (coachPlans || []).filter(
    (p) => p && p.status === 'aceite' && p.race_id
      && dayOf(p.period_start) && dayOf(p.period_end) && dayOf(p.period_end) >= today,
  );
  if (plans.length === 0) return null;

  for (const plan of plans) {
    const start = dayOf(plan.period_start);
    const end = dayOf(plan.period_end);
    const races = (raceEvents || []).filter((r) => {
      if (!r || r.id === plan.race_id) return false;
      if (r.status === 'concluida' || r.conflict_acknowledged_at) return false;
      const d = dayOf(r.date);
      // A partir de hoje: uma principal que já passou sem ser registada é
      // assunto de registo, não de planeamento. O intervalo é FECHADO nos
      // dois extremos, como no servidor (racesInPeriod em
      // runProposeTrainingPlan): uma segunda principal no próprio dia do
      // objetivo também é conflito. Com `d < end` o servidor recusava o
      // plano e o cliente não avisava de nada (achado M5 da revisão
      // pré-deploy de 2026-09-18).
      return d && d >= today && d >= start && d <= end && (r.race_priority || 'a') === 'a';
    }).sort((a, b) => dayOf(a.date).localeCompare(dayOf(b.date)));
    if (races.length > 0) {
      return { plan, target: (raceEvents || []).find((r) => r && r.id === plan.race_id) || null, races };
    }
  }
  return null;
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
