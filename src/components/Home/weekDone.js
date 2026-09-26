/* A semana cumprida — CAROL.md §3: "Semana cumprida a 100%: uma frase de
   reconhecimento. Uma."

   A semana é a do plano acordado, a mesma do "semana 6 de 18" do cartão "O
   que faço hoje" (planWeekLabel): contada a partir do arranque do plano, não
   do calendário. Cumprida quer dizer: todos os treinos dessa semana (corrida
   e ginásio, sem os cancelados) estão concluídos, e são pelo menos dois — um
   treino sozinho não faz uma semana.

   Puro, para os testes; a memória de "já vi o momento" vive em localStorage
   (wasWeekCelebrated/markWeekCelebrated) e, para os outros dispositivos, em
   coach_impressions (ação 5.1).

   Cumprida só quando a semana já não pode ganhar treinos (pedido
   2026-09-26). O plano de uma prova vai até ao dia dela, mas os treinos
   entram por tranches de 1 a 2 semanas (coach-chat: "o resto do bloco se
   detalha à medida que chega"). Um plano que começa numa quarta e está
   escrito só até domingo tem a semana 1 de quarta a terça: no domingo, com
   tudo o que havia feito, ela dava a semana por cumprida — e segunda
   chegava a tranche seguinte com dois treinos para essa mesma semana. O
   momento já tinha sido gasto, e quando a semana acabava mesmo não havia
   nada. Por isso a semana só se dá por cumprida quando está toda escrita
   (o plano já decidiu até ao último dia dela, ou até ao fim do bloco, se o
   bloco acaba a meio — a semana da prova acaba na prova).

   O último dia sozinho não chega (revisão de 2026-09-26): na terça, com a
   tranche escrita só até domingo, o cartão de hoje diz «Por planear» — e
   por cima dele a fita dizia «Semana 1 cumprida». Se a tranche seguinte
   chegasse nesse dia com um treino para terça, a fita desaparecia e o
   momento já estava gasto: o mesmo erro, um dia mais tarde. O último dia
   fecha a semana quando está decidido — com a prova, que é o que ele é na
   semana da prova —, ou quando já passou. Uma semana que nunca chegou a
   ficar toda escrita não se celebra: parte dela ficou sem plano.

   A prova do plano (o item com training_type 'prova') não é um treino: não
   entra na conta de «N treinos, N feitos». Mas a semana da prova só está
   cumprida com ela feita, e a frase diz que a prova lá está. */

import { addDaysISO } from '../../lib/utils';
import { isRacePlanItem } from '../../utils/homeModels';
import { isMealOnlyItem } from '@formulas/mealSuggestions.ts';
import { computeAcceptedWindow, diffDaysISO } from './WeeklyPlanCard';

const TRAINING = new Set(['corrida', 'ginasio']);
const EXTENSO = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez'];
const DIA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']; // domingo primeiro, como getUTCDay()

const dateOf = (i) => String(i.status === 'concluido' ? (i.actual_date || i.planned_date) : i.planned_date).slice(0, 10);

const dia = (v) => (v ? String(v).slice(0, 10) : null);

/* Até onde o plano já está escrito, dentro do bloco [inicio, fim] — a mesma
   regra do "Por planear" do ecrã do plano (planeadoAte, WeeklyPlanCard.jsx):
   o último dia com um treino ou um descanso, de qualquer estado (as
   refeições sugeridas sozinhas não decidem o treino de ninguém); um plano
   de treino sem prova escreve-se inteiro de uma vez, e conta como escrito
   até ao fim do período. Um cancelado fora do período do seu plano é o
   sistema a arrumar um bloco antigo, não uma decisão sobre esta semana.
   O dia da prova também não conta: o servidor põe-no no plano logo na
   primeira tranche, dez semanas antes (coach-chat, "Uma prova no período
   sem item nesse dia entra sozinha") — diz quando é a prova, não até onde
   estão escritos os treinos. */
function escritoAte(plans, items, inicio, fim) {
  const aceites = new Map((plans || []).filter((p) => p?.status === 'aceite').map((p) => [p.id, p]));
  let ate = null;
  const empurra = (d) => { if (d && d >= inicio && d <= fim && (!ate || d > ate)) ate = d; };
  const comTreino = new Set();
  for (const it of items || []) {
    const p = it && aceites.get(it.plan_id);
    if (!p || isMealOnlyItem(it) || isRacePlanItem(it)) continue;
    const d = dia(it.planned_date);
    if (it.status === 'cancelado' && (d < dia(p.period_start) || d > dia(p.period_end))) continue;
    empurra(d);
    if (it.status === 'concluido') empurra(dia(it.actual_date));
    if (TRAINING.has(it.kind)) comTreino.add(p.id);
  }
  for (const p of aceites.values()) {
    if (!p.race_id && !p.race_lost_at && comTreino.has(p.id)) empurra(dia(p.period_end));
  }
  return ate;
}

/* A semana está toda escrita quando CADA plano aceite que a cobre já está
   escrito até ao fim da parte dele nela (revisão de 2026-09-26). Um máximo
   sobre todos os planos juntos deixava um plano de recuperação já aceite
   para depois da prova, escrito inteiro de uma vez, "escrever" os dias que
   o plano da prova ainda não escreveu — e a semana 1 cumpria-se ao sábado,
   com sábado e domingo «Por planear» no ecrã do plano. A mesma regra, por
   plano, que o "Por planear" usa (porEscrever, WeeklyPlanCard.jsx). */
function semanaEscrita(plans, items, desde, ultimoDia) {
  const cobrem = (plans || []).filter((p) => p?.status === 'aceite' && dia(p.period_start) <= ultimoDia && dia(p.period_end) >= desde);
  return cobrem.length > 0 && cobrem.every((p) => {
    const ini = dia(p.period_start);
    const fimP = dia(p.period_end);
    const ate = escritoAte([p], (items || []).filter((i) => i?.plan_id === p.id), ini, fimP);
    return ate != null && ate >= (fimP < ultimoDia ? fimP : ultimoDia);
  });
}

/**
 * { week, count, prova, weekStart, days: [{ dateISO, initial, state: 'done'|'rest', isToday }] }
 * quando a semana do plano em que hoje cai está toda cumprida; null nos outros.
 * `count` são os treinos, sem a prova; `prova` é 'fim' (nada de treino
 * depois dela nessa semana), 'meio', ou null (semana sem prova).
 */
export function weekDone({ plans = [], planItems = [], today }) {
  const win = computeAcceptedWindow(plans, planItems, today);
  if (!win) return null;
  const elapsed = diffDaysISO(win.start, today);
  if (elapsed < 0) return null;
  const week = Math.floor(elapsed / 7) + 1;
  const weekStart = addDaysISO(win.start, (week - 1) * 7);
  const weekEnd = addDaysISO(weekStart, 6);
  const blockEnd = addDaysISO(win.start, win.days - 1);

  const aceites = new Set((plans || []).filter((p) => p.status === 'aceite').map((p) => p.id));
  const daSemana = (planItems || []).filter((i) => i && aceites.has(i.plan_id) && TRAINING.has(i.kind)
    && i.status !== 'cancelado' && dateOf(i) >= weekStart && dateOf(i) <= weekEnd);
  const provas = daSemana.filter(isRacePlanItem);
  const treinos = daSemana.filter((i) => !isRacePlanItem(i));

  // A semana ainda pode ganhar treinos? Não, se o plano já está escrito até
  // ao último dia dela (os dias vazios pelo meio são descanso decidido), ou
  // se esse último dia já passou. Com o bloco a acabar a meio da semana, o
  // último dia dela é o fim do bloco — a semana da prova acaba na prova, e
  // no dia dela o item da prova decide o dia (escritoAte não o conta, por
  // vir logo na primeira tranche). Um último dia ainda «Por planear» não
  // fecha nada: a tranche seguinte ainda lhe pode pôr um treino.
  const ultimoDia = blockEnd < weekEnd ? blockEnd : weekEnd;
  const provaNoUltimoDia = (planItems || []).some((i) => i && aceites.has(i.plan_id) && isRacePlanItem(i)
    && i.status !== 'cancelado' && dia(i.planned_date) === ultimoDia);
  const fechada = semanaEscrita(plans, planItems, weekStart, ultimoDia) || today > ultimoDia
    || (today === ultimoDia && provaNoUltimoDia);
  if (!fechada) return null;
  // Um treino sozinho não faz uma semana; a prova com um treino, sim.
  if (treinos.length + provas.length < 2 || !daSemana.every((i) => i.status === 'concluido')) return null;

  const ultimaProva = provas.map(dateOf).sort().pop() || null;
  const prova = !ultimaProva ? null : (treinos.some((i) => dateOf(i) > ultimaProva) ? 'meio' : 'fim');

  const feitos = new Set(daSemana.map(dateOf));
  const days = Array.from({ length: 7 }, (_, k) => {
    const dateISO = addDaysISO(weekStart, k);
    return {
      dateISO,
      initial: DIA[new Date(`${dateISO}T00:00:00Z`).getUTCDay()],
      state: feitos.has(dateISO) ? 'done' : 'rest',
      isToday: dateISO === today,
    };
  });
  return { week, count: treinos.length, prova, weekStart, days };
}

/** A frase dela. Uma, sem exclamação: o número por extenso até dez. Na
 *  semana da prova, a prova é o que se diz — contar-lhe os treinos ao lado
 *  dela era tratá-la como mais um. */
export function weekDoneLine({ week, count, prova = null }) {
  if (prova === 'fim') return `Semana ${week} cumprida, com a prova no fim.`;
  if (prova === 'meio') return `Semana ${week} cumprida, com a prova pelo meio.`;
  const n = count <= 10 ? EXTENSO[count] : String(count);
  const N = n.charAt(0).toUpperCase() + n.slice(1);
  return `Semana ${week} cumprida. ${N} treinos, ${n} feitos.`;
}

const markKey = (userId, weekStart) => `ironcoach_week_done_${userId || 'anon'}_${weekStart}`;

/** A chave deste momento em coach_impressions (kind 'moment', ação 5.1) — a
 *  mesma na escrita (WeekDoneRibbon) e na leitura (wasWeekCelebrated). */
export const weekDoneMomentKey = (weekStart) => `weekdone:${weekStart}`;

/* Visto neste telemóvel (localStorage) ou em qualquer outro: `shown` é o
   impressionShown do store (chaves `kind:key`), opcional. */
export function wasWeekCelebrated(userId, weekStart, shown = null, storage = globalThis.localStorage) {
  if (shown?.has(`moment:${weekDoneMomentKey(weekStart)}`)) return true;
  try { return storage?.getItem(markKey(userId, weekStart)) === '1'; } catch { return true; }
}

export function markWeekCelebrated(userId, weekStart, storage = globalThis.localStorage) {
  try { storage?.setItem(markKey(userId, weekStart), '1'); } catch { /* sem storage */ }
}
