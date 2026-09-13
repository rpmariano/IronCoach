import { useEffect, useRef } from 'react';

/* As fotos de um rascunho de registo sobrevivem a um recarregamento
   (relatado 2026-09-13: registar a prova, juntar fotos, ir a outra app e
   voltar — as fotos desapareciam).

   O rascunho de texto já vivia em localStorage (formDraftPersistence.js),
   mas as fotos ficavam de fora de propósito: em dataUrl estouravam a quota.
   IndexedDB guarda-as tal como estão — dataUrl, base64 e até o File do
   diploma em PDF — sem limite prático para meia dúzia de imagens.

   Cada lista de fotos guarda-se sob `${chaveDoRascunho}::${slot}` (p.ex.
   "ironcoach:corrida-rascunho:nova::racePhotos"), e apagar o rascunho
   (clearPersistedFormDraft) apaga todas as do mesmo rascunho.

   Sem IndexedDB (jsdom dos testes, modo privado antigo) tudo é um no-op: o
   pior caso é o de antes, perder as fotos, nunca rebentar o formulário. */

const DB_NAME = 'ironcoach-drafts';
const STORE = 'media';
const DEBOUNCE_MS = 400;

let dbPromise = null;

function openDb() {
  let available = false;
  try { available = typeof indexedDB !== 'undefined' && indexedDB !== null; } catch { available = false; }
  if (!available) return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      let request;
      try {
        request = indexedDB.open(DB_NAME, 1);
      } catch {
        resolve(null);
        return;
      }
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    });
  }
  return dbPromise;
}

function withStore(mode, action) {
  return openDb().then((db) => {
    if (!db) return undefined;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE, mode);
        const request = action(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(request ? request.result : undefined);
        tx.onerror = () => resolve(undefined);
        tx.onabort = () => resolve(undefined);
      } catch {
        resolve(undefined);
      }
    });
  });
}

/* O adaptador é um objeto (e não funções soltas) para os testes o poderem
   substituir sem IndexedDB. */
export const draftMediaStore = {
  load: (key) => withStore('readonly', (store) => store.get(key)),
  save: (key, value) => withStore('readwrite', (store) => store.put(value, key)),
  remove: (key) => withStore('readwrite', (store) => store.delete(key)),
  removeAllFor: (draftKey) => withStore('readwrite', (store) => store.delete(IDBKeyRange.bound(`${draftKey}::`, `${draftKey}::￿`))),
};

/* Quando cada rascunho foi apagado pela última vez: um save agendado ANTES
   disso não o pode ressuscitar (a mesma corrida que formDraftPersistence
   resolve com os timers pendentes). */
const clearedAt = new Map();

/** Apaga todas as fotos guardadas do rascunho `draftKey`. */
export function clearDraftMedia(draftKey) {
  if (!draftKey) return;
  clearedAt.set(draftKey, Date.now());
  try {
    draftMediaStore.removeAllFor(draftKey)?.catch?.(() => {});
  } catch {
    /* sem IndexedDB não há nada a apagar */
  }
}

const isEmpty = (value) => value == null || (Array.isArray(value) && value.length === 0);

/**
 * Guarda `value` (uma lista de fotos, ou uma foto só) enquanto o formulário
 * está aberto e restaura-o UMA vez ao montar — só se o formulário ainda não
 * tiver fotos nesse momento, para nunca pisar o que o atleta já escolheu.
 *
 * @param draftKey a mesma chave do rascunho de texto do formulário
 * @param slot     nome da lista ("runPhotos", "racePhotos", "diploma"…)
 * @param value    o estado atual
 * @param setValue o setter do estado
 */
export function usePersistedDraftMedia(draftKey, slot, value, setValue) {
  const key = draftKey ? `${draftKey}::${slot}` : null;
  const readyRef = useRef(false);
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    if (!key) return undefined;
    let cancelled = false;
    readyRef.current = false;
    Promise.resolve()
      .then(() => draftMediaStore.load(key))
      .catch(() => undefined)
      .then((saved) => {
        if (cancelled) return;
        readyRef.current = true;
        if (!isEmpty(saved) && isEmpty(valueRef.current)) {
          setValue(saved);
        } else if (!isEmpty(valueRef.current)) {
          // Escolhidas antes de a leitura acabar: guardam-se já.
          Promise.resolve(draftMediaStore.save(key, valueRef.current)).catch(() => {});
        }
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!key || !readyRef.current) return undefined;
    const scheduledAt = Date.now();
    const timer = setTimeout(() => {
      if ((clearedAt.get(draftKey) || 0) >= scheduledAt) return;
      const write = isEmpty(value) ? draftMediaStore.remove(key) : draftMediaStore.save(key, value);
      Promise.resolve(write).catch(() => {});
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [key, draftKey, value]);
}
