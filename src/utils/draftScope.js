import { cancelAllPendingFormDrafts } from './formDraftPersistence';
import { clearAllDraftMedia } from './draftMediaPersistence';

/* Auditoria de segurança B2 (2026-11-14): as chaves dos rascunhos eram fixas
   («ironcoach:avaliacao-rascunho:nova»), e as fotos em IndexedDB também. Num telemóvel
   partilhado, o atleta seguinte via o peso e as fotos do anterior. Agora:
   - cada rascunho leva o id da conta: «ironcoach:u:<id>:avaliacao-rascunho:nova» (as fotos
     herdam a chave: «…::runPhotos»);
   - no logout e na troca de conta apagam-se os rascunhos e as fotos de todos;
   - ao entrar, os rascunhos antigos, sem conta na chave, apagam-se (não se sabe de quem são).
   Sem sessão (o modo demo) a chave fica a de sempre. O id vem de useDraftUserId.js (este módulo
   não importa o store: o store importa-o para limpar no logout). */

const PREFIX = 'ironcoach:';
// Um rascunho de formulário: «ironcoach:[u:<id>:]<nome>-rascunho[:…]».
const DRAFT_RE = /^ironcoach:(u:[^:]+:)?[a-z-]+-rascunho(?::|$)/;
const SCOPED_RE = /^ironcoach:u:[^:]+:/;

export function scopedDraftKey(base, userId) {
  if (!userId || typeof base !== 'string' || !base.startsWith(PREFIX)) return base;
  return `${PREFIX}u:${userId}:${base.slice(PREFIX.length)}`;
}

function draftKeysInStorage(filter) {
  const keys = [];
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k && DRAFT_RE.test(k) && filter(k)) keys.push(k);
    }
  } catch { /* sem storage */ }
  return keys;
}

function removeKeys(keys) {
  for (const k of keys) {
    try { localStorage.removeItem(k); } catch { /* sem storage */ }
  }
}

/** Logout e troca de conta: apaga todos os rascunhos (texto e fotos) deste telemóvel. */
export function clearAllDrafts() {
  cancelAllPendingFormDrafts();
  removeKeys(draftKeysInStorage(() => true));
  clearAllDraftMedia();
}

/** Ao entrar numa conta: os rascunhos de antes desta mudança, sem conta na chave, não se sabe
 *  de quem são — saem (as fotos sem conta também, pela mesma razão). */
export function purgeUnscopedDrafts() {
  const legacy = draftKeysInStorage((k) => !SCOPED_RE.test(k));
  if (!legacy.length) return;
  removeKeys(legacy);
  clearAllDraftMedia();
}
