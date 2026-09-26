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
                                lastRewriteDay, abaixo). A frase diz também
                                as corridas (ou o ginásio) que viu a um ou
                                dois dias delas, e pergunta se trocou os dias.

   Só planos ACEITES com período a cobrir hoje ou o futuro entram: um plano
   que já terminou não se ajusta, revê-se.

   A `signature` é o que impede a Carol de chamar pela mesma coisa todos os
   dias — leva o(s) plano(s) e o motivo com a data a que se refere, por isso
   muda assim que o plano mudar (ou a prova sair, ou a sessão for
   registada), e só então ela volta a falar. Guarda-se em localStorage por
   utilizador, como em coachProactive.js. */

import { todayISO } from '../lib/utils';
import { formatDayMonth, isRacePlanItem } from './homeModels';
import { treinoFalado } from '../components/Home/carolCardLines';
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

const EVE_LABEL = { 1: 'Na véspera', 2: 'A dois dias' };

/* Mobilidade, alongamentos, ioga ou pilates não pesam nas pernas da prova —
   a doutrina tira a mobilidade leve da interferência (03-ginasio.md #4).
   20 minutos de mobilidade a dois dias da prova contavam como treino duro
   (revisão de 2026-09-26). Sem categorias, ou com outra qualquer, não se
   sabe se é leve e conta como antes. */
const GINASIO_LEVE = /mobilidade|alongament|yoga|ioga|pilates/i;
const ginasioLeve = (item) => {
  const cats = (item.categories || []).map((c) => String(c).trim()).filter(Boolean);
  return cats.length > 0 && cats.every((c) => GINASIO_LEVE.test(c));
};

/** A quantos dias de uma sessão falhada um registo do mesmo tipo pode ser
 *  essa sessão feita noutro dia. */
export const SWAP_WINDOW_DAYS = 2;

const juntar = (xs) => (xs.length <= 1 ? (xs[0] || '') : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`);

/** "12 e 14 set", "30 set e 2 out" — os dias como se dizem, com o mês uma
 *  vez por mês e não uma vez por dia. */
export function listaDias(datesISO) {
  const partes = [...new Set(datesISO)].sort().map((d) => formatDayMonth(d).split(' '));
  return juntar(partes.map(([dia, mes], k) => (k === partes.length - 1 || partes[k + 1][1] !== mes ? `${dia} ${mes}` : dia)));
}

const diasEntre = (a, b) => Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000);

/** O que o coach-chat guarda de cada motivo (coach-chat, plan_divergence:
 *  `.slice(0, 200)`). Uma frase maior chega-lhe cortada a meio. */
const MOTIVO_MAX = 200;

/* Os registos e os treinos ditos pelo que são (revisão de 2026-09-26): a
   corrida como corrida, o ginásio como ginásio. «Vi treinos a 9 e 11 set»
   ao lado de «não vi os treinos de 8 e 10 set» dizia duas vezes a mesma
   palavra e nada sobre o que ela viu. */
const REGISTO_DITO = {
  corrida: (n) => (n === 1 ? 'uma corrida' : 'corridas'),
  ginasio: (n) => (n === 1 ? 'uma sessão de ginásio' : 'sessões de ginásio'),
};
const TREINO_DITO = {
  corrida: (n) => (n === 1 ? 'da corrida' : 'das corridas'),
  ginasio: (n) => (n === 1 ? 'do ginásio' : 'das sessões de ginásio'),
};
const porTipo = (xs) => ['corrida', 'ginasio'].map((kind) => xs.filter((x) => x.kind === kind)).filter((g) => g.length);

/* A frase das sessões falhadas (pedido 2026-09-26). Era «2 sessões do plano
   ficaram por registar nos últimos 7 dias (9 set, 11 set).» — a abrir com um
   número, em registo de sistema, e cega ao resto: os treinos de terça e
   quinta feitos na quarta e na sexta, registados pelo separador Corrida,
   apareciam no calendário e o aviso dizia que nada tinha sido registado.
   A data continua a contar pelo calendário (o treino de terça feito à
   quarta não fecha o de terça), mas ela diz o que viu e pergunta, como
   CAROL.md §3 pede antes de reagendar: «Aconteceu alguma coisa?».
   `trocas` são as falhadas com um registo do mesmo tipo por perto;
   `semRegisto`, as outras.

   Um dia com corrida e ginásio no plano pode ter um explicado e o outro
   não (revisão de 2026-09-26): «Não vi o treino de 8 set nesse dia, mas vi
   uma sessão de ginásio a 7 set. (…) E do treino de 8 set não vi registo
   nenhum.» punha o mesmo dia dos dois lados, e lia-se como contradição.
   Quando isso acontece, o resto diz-se pelo tipo: «E da corrida de 8 set
   não vi registo nenhum.» */
function frasesSessoesFalhadas(trocas, semRegisto) {
  const dosTreinos = (n) => (n === 1 ? 'do treino' : 'dos treinos');
  if (trocas.length === 0) {
    return `Não vi registo ${dosTreinos(semRegisto.length)} de ${listaDias(semRegisto.map((m) => m.date))}. Aconteceu alguma coisa?`;
  }
  const n = trocas.length;
  const diasTrocados = new Set(trocas.map((t) => t.date));
  const oQueVi = juntar(porTipo(trocas.map((t) => t.registo))
    .map((g) => `${REGISTO_DITO[g[0].kind](g.length)} a ${listaDias(g.map((r) => r.date))}`));
  const texto = `Não vi ${n === 1 ? 'o treino' : 'os treinos'} de ${listaDias([...diasTrocados])} ${diasTrocados.size === 1 ? 'nesse dia' : 'nesses dias'}, mas vi ${oQueVi}. Trocaste os dias?`;
  if (!semRegisto.length) return texto;
  const partilhaDia = semRegisto.some((m) => diasTrocados.has(m.date));
  const deQue = partilhaDia
    ? juntar(porTipo(semRegisto).map((g) => `${TREINO_DITO[g[0].kind](g.length)} de ${listaDias(g.map((m) => m.date))}`))
    : `${dosTreinos(semRegisto.length)} de ${listaDias(semRegisto.map((m) => m.date))}`;
  const completo = `${texto} E ${deQue} não vi registo nenhum.`;
  // Com muitos dias, os do fim cabem numa palavra: a pergunta que importa
  // (trocaste os dias?) já ficou dita, com as datas.
  return completo.length <= MOTIVO_MAX ? completo : `${texto} E dos outros não vi registo nenhum.`;
}

/** "Corrida do Tejo (13 set)" — o nome e o dia, como a Carol os diria. */
export function raceLabel(race) {
  return `${race.name || 'a prova'} (${formatDayMonth(dayOf(race.date))})`;
}

/* O mesmo a abrir a frase, sem artigo à frente (revisão de 2026-09-26):
   «A Trail do Sico (13 set)» não se diz, e sem nome dava «A a prova». */
function raceLabelAAbrir(race) {
  const s = raceLabel(race);
  return s.charAt(0).toUpperCase() + s.slice(1);
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

  // 0b. A prova-objetivo foi antecipada e o plano encurtou até ela, com
  //     treinos cancelados pelo caminho. Sem isto o atleta via "a prova não
  //     está no plano" (o item de prova do dia antigo também é cancelado) —
  //     o quê, mas não o porquê, nem que perdeu treinos. trimmed_at só é
  //     marcado quando algum treino foi mesmo cancelado (trigger, migration
  //     20260918081148), e limpa-se quando a Carol ajusta o plano. Vem antes
  //     dos motivos por prova porque é a causa deles: é por aqui que a
  //     conversa começa.
  for (const plan of plans) {
    if (!plan.race_id || !plan.trimmed_at) continue;
    const race = (raceEvents || []).find((r) => r && r.id === plan.race_id);
    // «passou para mais cedo» e «até lá» não pedem género: «Trail do Sico
    // foi antecipada» não concordava com o nome.
    push(
      'plano_encurtou',
      `${plan.id}:${String(plan.trimmed_at).slice(0, 10)}`,
      race
        ? `${raceLabelAAbrir(race)} passou para mais cedo e o plano encurtou até lá: os treinos que ficavam depois foram cancelados.`
        : `A prova foi antecipada para ${formatDayMonth(dayOf(plan.period_end))} e o plano encurtou até lá: os treinos que ficavam depois foram cancelados.`,
    );
  }

  for (const race of races) {
    if (conflicting.has(race.id)) continue;
    const date = dayOf(race.date);
    const onDay = upcoming.filter((i) => dayOf(i.planned_date) === date);

    // 1. A prova não está no plano.
    if (!onDay.some(isRacePlanItem)) {
      push('prova_sem_item', `${race.id}:${date}`, `${raceLabelAAbrir(race)} não está no plano.`);
    }

    // 2. E o que lá está no dia dela é um treino. O treino dito numa frase
    //    (treinoFalado), e não o rótulo do chip a meio dela.
    for (const item of onDay) {
      if (isRacePlanItem(item) || item.kind === 'descanso') continue;
      push(
        'treino_no_dia_da_prova',
        `${race.id}:${item.id}`,
        `${raceLabelAAbrir(race)}: no dia da prova o plano ainda tem ${treinoFalado([item], date)}.`,
      );
    }

    // 3. Trabalho duro na véspera e na antevéspera. Não antes de uma prova
    //    de treino (c): entra no plano como treino de qualidade, com taper
    //    curto (02-corrida-prova.md), e não se guarda como uma principal.
    if (race.race_priority === 'c') continue;
    for (let gap = 1; gap <= RACE_EVE_DAYS; gap += 1) {
      const eve = addDays(date, -gap);
      for (const item of upcoming.filter((i) => dayOf(i.planned_date) === eve)) {
        const hardRun = item.kind === 'corrida' && HARD_RUN_TYPES.includes(item.training_type);
        const ginasio = item.kind === 'ginasio' && !ginasioLeve(item);
        if (!hardRun && !ginasio) continue;
        push(
          'treino_forte_na_vespera',
          `${race.id}:${item.id}`,
          `${raceLabelAAbrir(race)}: a ${formatDayMonth(eve)} tens ${treinoFalado([item], eve)}. ${EVE_LABEL[gap]} da prova só cabe corrida leve.`,
        );
      }
    }
  }

  // 4. Sessões que passaram e não têm registo nenhum. A data conta pelo
  //    calendário: um treino de terça registado à quarta não é o de terça.
  //    Só contam as planeadas desde a última reescrita do plano: as de antes
  //    a Carol já as viu quando o ajustou. A prova do plano não é uma
  //    sessão: uma prova passada por registar é para registar (o cartão da
  //    prova pede-o), não para reorganizar — e a frase fala de treinos.
  const from = addDays(today, -MISSED_LOOKBACK_DAYS);
  const rewriteByPlan = new Map(
    [...planIds].map((id) => [id, lastRewriteDay(items.filter((i) => i.plan_id === id))]),
  );
  const doneDays = new Set([
    ...(runs || []).map((r) => dayOf(r?.date)),
    ...(gymSessions || []).map((g) => dayOf(g?.date)),
  ].filter(Boolean));
  const missed = items
    .filter((i) => (i.kind === 'corrida' || i.kind === 'ginasio') && i.status === 'pendente' && !isRacePlanItem(i))
    .filter((i) => {
      const d = dayOf(i.planned_date);
      const rewrite = rewriteByPlan.get(i.plan_id);
      return d >= from && d < today && !doneDays.has(d) && (!rewrite || d >= rewrite);
    })
    .sort((a, b) => dayOf(a.planned_date).localeCompare(dayOf(b.planned_date)));

  if (missed.length >= MISSED_MIN) {
    const dates = missed.map((i) => dayOf(i.planned_date));
    // Os registos que podem ser uma destas sessões feita noutro dia: do
    // mesmo tipo, a um ou dois dias, e num dia que não tinha treino seu no
    // plano — a corrida de quarta num dia com treino marcado é o treino de
    // quarta, não o de terça mudado. Um registo já ligado a um item
    // (completed_run_id, completed_session_id) também é de outro treino.
    // Cada registo explica uma sessão, no máximo: a mais próxima. Os pares
    // escolhem-se do mais perto para o mais longe, e não pela ordem das
    // falhadas (revisão de 2026-09-26): com treinos a 8 e 9 e uma corrida a
    // 10, a de 10 é a de 9 feita um dia depois, não a de 8 feita dois.
    const trainingDays = new Set(items.filter((i) => i.kind === 'corrida' || i.kind === 'ginasio').map((i) => dayOf(i.planned_date)));
    const linked = new Set(items.flatMap((i) => [i.completed_run_id, i.completed_session_id]).filter(Boolean));
    const records = [
      ...(runs || []).map((r) => ({ id: r?.id, date: dayOf(r?.date), kind: 'corrida' })),
      ...(gymSessions || []).map((g) => ({ id: g?.id, date: dayOf(g?.date), kind: 'ginasio' })),
    ].filter((r) => r.date && r.date <= today && !trainingDays.has(r.date) && !(r.id && linked.has(r.id)));
    const pares = [];
    missed.forEach((item, k) => {
      const date = dayOf(item.planned_date);
      records.forEach((r, idx) => {
        const gap = Math.abs(diasEntre(date, r.date));
        if (r.kind === item.kind && gap >= 1 && gap <= SWAP_WINDOW_DAYS) pares.push({ k, idx, gap, date, r });
      });
    });
    pares.sort((a, b) => a.gap - b.gap || a.date.localeCompare(b.date) || a.r.date.localeCompare(b.r.date));
    const explicada = new Map();
    const usados = new Set();
    for (const p of pares) {
      if (explicada.has(p.k) || usados.has(p.idx)) continue;
      explicada.set(p.k, p.r);
      usados.add(p.idx);
    }
    const trocas = [];
    const semRegisto = [];
    missed.forEach((item, k) => {
      const date = dayOf(item.planned_date);
      if (explicada.has(k)) trocas.push({ date, kind: item.kind, registo: explicada.get(k) });
      else semRegisto.push({ date, kind: item.kind });
    });
    push('sessoes_falhadas', dates.join('+'), frasesSessoesFalhadas(trocas, semRegisto));
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
