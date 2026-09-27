/* Para onde leva o toque numa notificação do Troféu (specs/trofeu.md §8,
   Fase 5). 2026-09-27.

   O tick (coach-proactive-tick) manda os avisos da competição com a chave do
   aviso e um separador que o service worker já conhece (`home` ou `coach` —
   sw.js não muda). O destino fino decide-se aqui, pela chave:

   - `cup_calendar:<editionId>` → o ecrã do Troféu (Provas + requestCupScreen);
   - `cup_date_change:<roundId>:<data>` e `cup_entry_deadline:<roundId>` → fica
     no Início, onde a linha da jornada e o cartão do dia já dizem a mudança e
     o prazo;
   - `cup_results:<roundId>` → a conversa da classificação, no chat.

   Tudo o resto (os momentos de sempre, e uma chave cup_* mal formada) dá
   null: segue o caminho de hoje. O id da jornada é sempre o 2.º segmento. As
   chaves são o contrato com o servidor (_shared/formulas/cupNotices.ts) —
   escritas à mão dos dois lados e testadas com os mesmos literais. Pura. */

const segmentos = (key) => String(key).split(':');

/** O destino do toque numa notificação do Troféu, ou null (não é do Troféu). */
export function cupPushRoute(key) {
  if (typeof key !== 'string' || !key.startsWith('cup_')) return null;
  const [tipo, id] = segmentos(key);
  if (!id) return null;
  if (tipo === 'cup_calendar') return { kind: 'trofeu' };
  if (tipo === 'cup_date_change' || tipo === 'cup_entry_deadline') return { kind: 'inicio' };
  if (tipo === 'cup_results') return { kind: 'chat', roundId: id };
  return null;
}

/** A chave com que o tick trata uma mudança de data como vista na app
 *  (coach_impressions 'moment', 7 dias): a jornada e a NOVA data. null sem
 *  as duas. */
export function cupDateChangeKey(roundId, dateISO) {
  const day = typeof dateISO === 'string' ? dateISO.slice(0, 10) : '';
  if (!roundId || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  return `cup_date_change:${roundId}:${day}`;
}
