/* O plano aceite — o arranque de um bloco, dito pela Carol.

   Aceitar um plano no chat gravava e dava um "Plano aceite" num aviso. É o
   momento em que semanas de trabalho ficam combinadas; merece uma frase dela
   a marcar o início: quantas semanas são, quando começa, qual é o primeiro
   treino. Aparece no cartão da confirmação (shared/RecordConfirmation,
   `first`) — o mesmo de outros momentos dela.

   Um plano que substitui outro (supersedes_plan_id: a Carol ajustou o bloco)
   não é um arranque: é um ajuste, e diz-se como tal. Puro. */

import { planItemTitle } from './homeModels';

const DAY_MS = 86400000;
const diff = (a, b) => Math.round((Date.parse(`${String(b).slice(0, 10)}T00:00:00Z`) - Date.parse(`${String(a).slice(0, 10)}T00:00:00Z`)) / DAY_MS);
const DIAS = ['no domingo', 'na segunda-feira', 'na terça-feira', 'na quarta-feira', 'na quinta-feira', 'na sexta-feira', 'no sábado'];

function quando(today, dateISO) {
  const d = diff(today, dateISO);
  if (d <= 0) return 'hoje';
  if (d === 1) return 'amanhã';
  if (d < 7) return DIAS[new Date(`${String(dateISO).slice(0, 10)}T00:00:00Z`).getUTCDay()];
  return `daqui a ${d} dias`;
}

const lowerFirst = (s) => (!s || /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ]{2}/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** { title, sub } para o plano acabado de aceitar, ou null. */
export function planStartMoment(plan, items = [], today) {
  if (!plan?.period_start || !plan?.period_end) return null;
  const inicio = String(plan.period_start).slice(0, 10) > today ? String(plan.period_start).slice(0, 10) : today;
  const primeiro = (items || [])
    .filter((i) => i?.plan_id === plan.id && (i.kind === 'corrida' || i.kind === 'ginasio') && i.status === 'pendente' && String(i.planned_date) >= today)
    .sort((a, b) => String(a.planned_date).localeCompare(String(b.planned_date)))[0];
  const primeiroTreino = primeiro
    ? `O primeiro treino é ${lowerFirst(planItemTitle(primeiro))}, ${quando(today, primeiro.planned_date)}.`
    : null;

  if (plan.supersedes_plan_id) {
    return {
      title: 'Plano ajustado.',
      sub: [`${cap(quando(today, inicio))}, é este que conta.`, primeiroTreino, 'O que já fizeste fica feito.'].filter(Boolean).join(' '),
    };
  }

  // Um plano só de refeições não é um bloco de treino a arrancar (revisão de
  // 2026-09-26): dizia «Semana 1 de 4. Começa hoje. Eu vou estar a ver.».
  // Sem refeições nos itens não se sabe o que o plano é, e fica a do bloco.
  const doPlano = (items || []).filter((i) => i?.plan_id === plan.id && i.status !== 'cancelado');
  if (doPlano.some((i) => i.meal_suggestion) && !doPlano.some((i) => i.kind === 'corrida' || i.kind === 'ginasio')) {
    return { title: 'As refeições estão no plano.', sub: 'Vês cada dia em Como estou.' };
  }

  const semanas = Math.max(1, Math.ceil((diff(plan.period_start, plan.period_end) + 1) / 7));
  const titulo = semanas === 1 ? 'Uma semana de plano.' : `Semana 1 de ${semanas}.`;
  return {
    title: `${titulo} Começa ${quando(today, inicio)}.`,
    sub: [primeiroTreino, 'Eu vou estar a ver.'].filter(Boolean).join(' '),
  };
}
