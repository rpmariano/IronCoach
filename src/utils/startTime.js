/* ── Hora de início (specs/plano-de-prova.md, "A véspera e a hora") ────────
   `start_time` existe em `race_events`, `runs` e `workout_sessions` — coluna
   `time`, hora LOCAL do atleta (a que ele vê no relógio), sempre opcional.

   Há duas grafias da mesma hora e este ficheiro é o único sítio que as
   concilia, para a regra não ficar copiada por cinco formulários e cartões:

   • o PostgREST devolve `time` como 'HH:MM:SS' ('09:00:00');
   • o `<input type="time">` fala 'HH:MM' — e é 'HH:MM' que se grava, porque
     o Postgres completa os segundos sozinho.

   Tudo o que sai daqui é 'HH:MM' ou nada. Um valor que não se perceba
   (texto, hora impossível) vale o mesmo que não haver hora nenhuma: o campo
   é opcional, não vale a pena inventar-lhe um valor nem rebentar por causa
   dele. */

/** 'HH:MM' normalizada, ou null se não houver hora (ou não se perceber). */
export function normalizeStartTime(value) {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  if (!str) return null;
  const match = /^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(str);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${match[2]}`;
}

/** O mesmo, para um `<input type="time">` controlado: '' em vez de null. */
export function startTimeInputValue(value) {
  return normalizeStartTime(value) || '';
}
