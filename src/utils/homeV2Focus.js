/* O foco do Início v2 (crítica de design de 2026-11-25, P0: «o Início não tem foco e a Carol
   contradiz-se»). Só o v2 usa isto: o «Para onde vou» da v1 continua com o upcomingRaces.

   1. Uma só prova manda no ecrã (heroRaceOf): a de hoje, senão a de amanhã, senão a prova em foco
      (focusRace de @formulas/mainRace.ts: a próxima principal, senão a próxima) — a mesma regra do
      resumo da Carol, para o herói e a frase dela falarem da mesma prova. Uma prova que já passou e
      está por registar NÃO é o herói: vai para uma linha secundária (pendingRaceOf).
   2. A Carol fala do momento do herói (carolMessagesForMoment): num dia de prova, nada de treino nem
      de véspera de outra prova; na véspera, só a prova de amanhã; num dia normal, tudo. Os avisos de
      segurança do servidor (a dor alta e o dia em baixo do check-in, o RED-S, a perda de peso) nunca
      se filtram: saem da frase do plano para uma mensagem própria (`safety`), sempre a primeira. */

import { diasEntre, DIAS_A_ESPERAR_PELO_REGISTO } from './upcomingRaces';
import { pickRaceOfDay, focusRace } from '@formulas/mainRace.ts';

const day = (e) => String(e?.date || '').slice(0, 10);

/** A prova do herói: hoje → amanhã → a próxima (a A na janela de afinação, se houver). */
export function heroRaceOf({ raceEvents = [], today, isRegistered = () => false, cupFixed = null }) {
  const abertas = (raceEvents || []).filter((e) => e?.date && e.status !== 'concluida' && !isRegistered(e.id));
  /* Duas provas no mesmo dia: a principal, pela mesma regra que a Carol usa (pickRaceOfDay, a do
     servidor e do cartão dela) — senão o herói e a frase dela falavam de provas diferentes. */
  const deHoje = pickRaceOfDay(abertas, today);
  if (deHoje) return deHoje;
  const tomorrow = addDays(today, 1);
  const deAmanha = pickRaceOfDay(abertas.filter((e) => !(cupFixed && cupFixed(e))), tomorrow);
  if (deAmanha) return deAmanha;
  // Depois de amanhã: a prova em foco, como no resumo da Carol (a próxima principal, senão a próxima).
  const futuras = abertas.filter((e) => day(e) > tomorrow && !(cupFixed && cupFixed(e)));
  return focusRace(futuras, today) || null;
}

/** A prova que já passou e falta registar (a mais recente, até 7 dias), para a linha secundária. */
export function pendingRaceOf({ raceEvents = [], today, isRegistered = () => false }) {
  return (raceEvents || [])
    .filter((e) => e?.date && day(e) < today && e.status !== 'concluida' && !isRegistered(e.id)
      && diasEntre(today, day(e)) <= DIAS_A_ESPERAR_PELO_REGISTO)
    .sort((a, b) => day(b).localeCompare(day(a)))[0] || null;
}

/** O momento do Início, pelo herói: 'prova' (hoje), 'vespera' (amanhã) ou 'normal'. */
export function homeMoment(heroRace, today) {
  if (!heroRace) return 'normal';
  const d = day(heroRace);
  if (d === today) return 'prova';
  if (d === addDays(today, 1)) return 'vespera';
  return 'normal';
}

/* As mensagens do dia (useCoachDailyMessages) por momento. As chaves: recap (o resumo de ontem),
   warnings / hoje (o aviso de hoje: no dia da prova, a frase da prova), tomorrow_prep (preparar
   amanhã: na véspera, a prova; senão, o treino de amanhã), meal_suggestion, daily_concept,
   cup_entry:* e cup_week (o Troféu). A ordem dá a mais específica primeiro. */
const POR_MOMENTO = {
  // No dia da prova: a frase da prova, o que comer, e os prazos do Troféu. Nada de treinos (nem o
  // resumo de ontem nem amanhã) nem de lições.
  prova: ['warnings', 'hoje', 'meal_suggestion', 'cup_entry'],
  // Na véspera: a prova de amanhã primeiro; o que comer; os prazos. Nada do treino de hoje.
  vespera: ['tomorrow_prep', 'meal_suggestion', 'cup_entry'],
};

export function carolMessagesForMoment(messages = [], moment = 'normal') {
  // O aviso de segurança à parte: tira-se da mensagem do dia (que fica com o resto da frase) e vai
  // primeiro, em qualquer momento.
  const safety = [];
  const list = [];
  for (const m of (messages || []).filter(Boolean)) {
    if (m.safety) {
      safety.push({ key: 'safety', label: 'Aviso', color: 'var(--warn)', text: m.safety });
      if (m.rest) list.push({ ...m, text: m.rest, safety: null });
    } else {
      list.push(m);
    }
  }
  const keep = POR_MOMENTO[moment];
  if (!keep) return [...safety, ...list];
  const rank = (m) => {
    const k = String(m.key || '').startsWith('cup_entry') ? 'cup_entry' : m.key;
    return keep.indexOf(k);
  };
  return [...safety, ...list.filter((m) => rank(m) >= 0).sort((a, b) => rank(a) - rank(b))];
}

function addDays(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
