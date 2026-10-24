import { supabase } from './supabase';

/* Acesso só de leitura da assistente executiva (specs/assistente-leitura-contrato.md).
   O token em claro só existe na resposta de create_assistant_token: nunca se
   lê de volta. A lista pede só as colunas públicas — nunca token_hash.
   No modo demo (utilizador 'demo-user') não se chama o Supabase. */

export const ASSISTANT_LABEL = 'Assistente executiva';
export const MAX_ASSISTANT_TOKENS = 3;
const COLUNAS = 'id, token_prefix, label, created_at, last_used_at';

export const isDemoUser = (userId) => userId === 'demo-user';

// Mock em memória do modo demo: sobrevive enquanto a página não recarrega.
let demoTokens = [];
let demoSeq = 0;
export function __resetAssistantDemo() { demoTokens = []; demoSeq = 0; }

export async function listAssistantTokens(userId) {
  if (isDemoUser(userId)) return { ok: true, tokens: [...demoTokens] };
  try {
    const { data, error } = await supabase
      .from('assistant_tokens')
      .select(COLUNAS)
      .is('revoked_at', null)
      .order('created_at', { ascending: false });
    if (error) return { ok: false, tokens: [] };
    return { ok: true, tokens: data || [] };
  } catch {
    return { ok: false, tokens: [] };
  }
}

/* → { ok: true, token, row } | { ok: false, reason: 'max_tokens' | 'error' } */
export async function createAssistantToken(userId) {
  if (isDemoUser(userId)) {
    if (demoTokens.length >= MAX_ASSISTANT_TOKENS) return { ok: false, reason: 'max_tokens' };
    demoSeq += 1;
    const token = `ih_demo${String(demoSeq).padStart(2, '0')}_nao-e-um-token-real`;
    const row = { id: `demo-token-${demoSeq}`, token_prefix: token.slice(0, 8), label: ASSISTANT_LABEL, created_at: new Date().toISOString(), last_used_at: null };
    demoTokens = [row, ...demoTokens];
    return { ok: true, token, row };
  }
  const { data, error } = await supabase.rpc('create_assistant_token', { p_label: ASSISTANT_LABEL });
  if (error) {
    const texto = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`;
    return { ok: false, reason: /max_tokens/.test(texto) ? 'max_tokens' : 'error' };
  }
  const r = Array.isArray(data) ? data[0] : data;
  if (!r?.token) return { ok: false, reason: 'error' };
  return { ok: true, token: r.token, row: { id: r.id, token_prefix: r.token_prefix, label: ASSISTANT_LABEL, created_at: r.created_at, last_used_at: null } };
}

export async function revokeAssistantToken(userId, id) {
  if (isDemoUser(userId)) { demoTokens = demoTokens.filter((t) => t.id !== id); return { ok: true }; }
  const { error } = await supabase.rpc('revoke_assistant_token', { p_id: id });
  return { ok: !error };
}
