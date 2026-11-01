import { useCallback, useRef } from 'react';

/* Idempotência das gravações (2026-11-01, dev-back 214e3a24, specs na nota «backend-nutricao-b-e-
   idempotencia» §2.4). A 31-10 o Rui ficou com o mesmo treino 4 vezes: a resposta não chegou ao
   telemóvel, ele voltou a gravar, e cada tentativa era um pedido novo que o servidor gravava outra
   vez. Agora cada formulário de registo NOVO (ginásio, corrida, corporal, refeição) leva um
   `client_request_id`, o mesmo em todas as tentativas — depois de um erro ou de um timeout também.
   O servidor reconhece-o e devolve o registo que já tinha gravado (`replayed: true`).
   Não vai no preview, nas edições, nas reanálises, no mode 'answer' nem no pantry_food.
   Um id novo só depois de uma gravação com sucesso, ou quando o formulário se limpa. */

export function newClientRequestId() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch { /* sem crypto: o de baixo */ }
  // RFC 4122 v4 com Math.random — só para navegadores antigos sem randomUUID.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : (r % 4) + 8).toString(16);
  });
}

/** O id do formulário: `get()` devolve sempre o mesmo até `renew()`. */
export function useClientRequestId() {
  const ref = useRef(null);
  const get = useCallback(() => {
    if (!ref.current) ref.current = newClientRequestId();
    return ref.current;
  }, []);
  const renew = useCallback(() => { ref.current = newClientRequestId(); }, []);
  return { get, renew };
}

/** O registo na lista do store, pelo id: um `replayed` (ou uma segunda resposta) substitui o que lá
 *  estiver em vez de aparecer duas vezes. Fica à cabeça, como um registo novo. */
export function upsertById(list, row) {
  if (!row?.id) return [row, ...(list || [])];
  return [row, ...(list || []).filter((r) => r?.id !== row.id)];
}

/** A mensagem de uma gravação que falhou: num timeout ou numa falha de rede o registo pode já ter
 *  ficado gravado no servidor — e tentar outra vez já não o repete. */
export const SAVE_RETRY_SAFE_TEXT = 'A ligação falhou ou demorou demasiado. Pode já ter ficado gravado — tentar outra vez não o repete.';
export function saveErrorText(res) {
  if (res?.isTimeout || res?.isNetwork) return SAVE_RETRY_SAFE_TEXT;
  return res?.error || 'Falha a gravar. Tenta novamente.';
}
