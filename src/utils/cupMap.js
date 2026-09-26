/* O mapa da época — o aviso do Início para quem está inscrito numa
   competição por jornadas (specs/trofeu.md §5, "Momentos", Fase 2).
   2026-09-26.

   Sai pelo canal `coachIntent`, sem push: o Início mostra-o no botão
   flutuante da Carol e o "Falar com a Carol" abre o chat com o turno do mapa
   (o guião é do coach-chat, `cup_map`). Aparece em dois momentos:
   - ao inscrever (`first`): o mapa da inscrição, com ou sem calendário, e as
     perguntas da época que ainda faltem (o servidor decide quais);
   - quando sai o calendário (ou muda uma data): só se houver uma jornada
     confirmada por correr ainda por decidir — sem decisão, "não sei", ou
     "vou" sem papel escolhido.

   A `signature` (`cup_map:<edição>:<hash>`) muda com as datas confirmadas do
   calendário. Uma assinatura já tratada não volta a chamar: marcada neste
   dispositivo (localStorage, depois da resposta dela ou de "Dispensar") ou
   noutro (as impressões dos últimos 14 dias — 'moment' quando a conversa
   aconteceu, 'alert' dispensado). A marca 'moment' vai sem título, por isso
   fica fora do prompt da Carol (carolMemory.ts, buildImpressionsContext).

   Nada disto calcula papéis: no Início é só o convite para a conversa. Sem
   inscrição ativa não há candidato nenhum — o Início fica igual (§5). */

import { todayISO } from '../lib/utils';

export const CUP_MAP_TITLE = 'O mapa da época';
const SIGNATURE_PREFIX = 'cup_map:';
const STORAGE_PREFIX = 'ironcoach:mapa-epoca:';
// As assinaturas tratadas que se guardam por conta (as mais recentes).
const MAX_HANDLED = 20;

const dayOf = (v) => (typeof v === 'string' && v.length >= 10 ? v.slice(0, 10) : null);

/** djb2 em 32 bits, em base 36 — curto e estável; não é segurança. */
function djb2(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i += 1) h = (Math.imul(h, 33) + text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** A assinatura do mapa: a edição e as datas confirmadas do calendário
 *  (a ordem das jornadas não conta). '0' sem nenhuma confirmada. */
export function cupMapSignature(view) {
  const editionId = view?.edition?.id;
  if (!editionId) return null;
  const confirmed = (view.rounds || [])
    .filter((r) => r && r.date_status === 'confirmada' && dayOf(r.date))
    .map((r) => `${r.id}@${dayOf(r.date)}`)
    .sort();
  return `${SIGNATURE_PREFIX}${editionId}:${confirmed.length ? djb2(confirmed.join('|')) : '0'}`;
}

const storageKey = (userId) => `${STORAGE_PREFIX}${userId || 'anon'}`;

function readHandled(userId) {
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((s) => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

/** True se esta assinatura já foi levada à Carol (ou dispensada) neste
 *  dispositivo. */
export function wasCupMapHandled(userId, signature) {
  if (!signature) return false;
  return readHandled(userId).includes(signature);
}

export function markCupMapHandled(userId, signature) {
  if (!signature) return;
  try {
    const list = readHandled(userId).filter((s) => s !== signature);
    list.push(signature);
    window.localStorage.setItem(storageKey(userId), JSON.stringify(list.slice(-MAX_HANDLED)));
  } catch {
    // Sem storage: vale a marca do servidor (as impressões), noutra leitura.
  }
}

const asSet = (s) => (s instanceof Set ? s : new Set(s || []));
const someStartsWith = (keys, prefix) => {
  for (const k of keys) if (typeof k === 'string' && k.startsWith(prefix)) return true;
  return false;
};

/* Uma jornada confirmada por correr que ainda pede conversa: sem linha de
   participação, sem decisão (ou "não sei"), ou "vou" sem papel escolhido. */
function isUndecided(round) {
  const p = round.participation;
  if (!p) return true;
  if (p.decision == null || p.decision === 'nao_sei') return true;
  return p.decision === 'vou' && !p.intent;
}

/**
 * O aviso do mapa da época, se for altura dele.
 * `view` é a de useCupForHome (null sem inscrição ativa).
 * @returns {null | { signature: string, first: boolean, editionId: string,
 *   hasCalendar: boolean, title: string, message: string }}
 */
export function cupMapCandidate({ view, userId, impressionShown, impressionDismissed, today = todayISO() } = {}) {
  if (!view?.enrollment || !view.catalogReady) return null;
  const signature = cupMapSignature(view);
  if (!signature) return null;

  const shown = asSet(impressionShown);
  const dismissed = asSet(impressionDismissed);
  const handled = readHandled(userId);
  if (handled.includes(signature) || shown.has(`moment:${signature}`) || dismissed.has(`alert:${signature}`)) return null;

  // O primeiro desta edição: nenhum mapa dela tratado, aqui ou noutro
  // dispositivo (conversa tida ou aviso dispensado).
  const editionPrefix = `${SIGNATURE_PREFIX}${view.edition.id}:`;
  const first = !handled.some((s) => s.startsWith(editionPrefix))
    && !someStartsWith(shown, `moment:${editionPrefix}`)
    && !someStartsWith(dismissed, `alert:${editionPrefix}`);

  const upcoming = (view.rounds || []).filter(
    (r) => r && r.date_status === 'confirmada' && dayOf(r.date) && dayOf(r.date) >= today,
  );
  const hasCalendar = upcoming.length > 0;
  // Depois do primeiro, só quando o calendário traz alguma coisa por decidir.
  if (!first && !upcoming.some(isUndecided)) return null;

  const short = view.competition?.short_name || view.competition?.name || 'A competição';
  const label = String(view.competition?.round_label || 'Jornada').toLowerCase();
  const message = hasCalendar
    ? `${short}: já há datas no calendário. Quero ver contigo o papel de cada ${label} ao lado das tuas provas principais.`
    : `${short}: quero ver contigo como a época encaixa nas tuas provas principais.`;
  return { signature, first, editionId: view.edition.id, hasCalendar, title: CUP_MAP_TITLE, message };
}
