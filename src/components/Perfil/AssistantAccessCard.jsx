import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { UserCheck, Copy, Check, KeyRound, Trash2 } from 'lucide-react';
import { useAppStore } from '../../store';
import Button from '../shared/Button';
import ConfirmDeleteModal from '../shared/ConfirmDeleteModal';
import {
  listAssistantTokens, createAssistantToken, revokeAssistantToken, MAX_ASSISTANT_TOKENS,
} from '../../lib/assistantTokens';

/* Perfil › Assistente executiva (specs/assistente-leitura-contrato.md, "App").
   Gera e revoga o acesso só de leitura da assistente. O token mostra-se UMA
   vez, na criação: fica em memória só enquanto o aviso está aberto e não
   volta a ser lido de lado nenhum. */

export const ASSISTANT_TEXTO = 'A tua assistente executiva pode consultar os teus treinos, corridas, refeições, check-ins, avaliações corporais, provas e objetivos. Só lê: não escreve nada. Não vê as mensagens do coach nem a memória da Carol. Podes retirar o acesso aqui, quando quiseres.';
export const ASSISTANT_MSG_MAX = `Já tens ${MAX_ASSISTANT_TOKENS} acessos ativos. Revoga um para gerares outro.`;
export const ASSISTANT_MSG_ERRO = 'Não consegui gerar o acesso. Tenta outra vez.';
export const ASSISTANT_MSG_LISTA = 'Não consegui ver os acessos ativos. Tenta outra vez.';
export const ASSISTANT_MSG_REVOGAR = 'Não consegui revogar o acesso. Tenta outra vez.';

const fmt = (iso) => {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat('pt-PT', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Lisbon' }).format(new Date(iso));
  } catch { return null; }
};

export default function AssistantAccessCard() {
  const userId = useAppStore((s) => s.session?.user?.id);
  const titleId = useId();
  const freshTitleId = useId();
  const [tokens, setTokens] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);       // { tipo: 'erro' | 'info', texto }
  const [fresh, setFresh] = useState(null);   // { token } mostrado uma vez
  const [copied, setCopied] = useState(false);
  const [toRevoke, setToRevoke] = useState(null);
  const [revoking, setRevoking] = useState(false);
  const freshRef = useRef(null);

  const load = useCallback(async () => {
    const r = await listAssistantTokens(userId);
    setTokens(r.tokens);
    setLoaded(true);
    if (!r.ok) setMsg({ tipo: 'erro', texto: ASSISTANT_MSG_LISTA });
  }, [userId]);

  useEffect(() => { if (userId) load(); }, [userId, load]);
  useEffect(() => { if (fresh) freshRef.current?.focus(); }, [fresh]);

  const gerar = async () => {
    if (busy) return;
    setBusy(true); setMsg(null); setCopied(false);
    try {
      const r = await createAssistantToken(userId);
      if (!r.ok) {
        setMsg({ tipo: 'erro', texto: r.reason === 'max_tokens' ? ASSISTANT_MSG_MAX : ASSISTANT_MSG_ERRO });
        return;
      }
      setFresh({ id: r.row.id, token: r.token });
      setTokens((t) => [r.row, ...t.filter((x) => x.id !== r.row.id)]);
    } catch {
      setMsg({ tipo: 'erro', texto: ASSISTANT_MSG_ERRO });
    } finally {
      setBusy(false);
    }
  };

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(fresh.token);
      setCopied(true);
    } catch {
      setMsg({ tipo: 'erro', texto: 'Não consegui copiar. Seleciona o código e copia à mão.' });
    }
  };

  const revogar = async () => {
    if (!toRevoke) return;
    setRevoking(true);
    try {
      const r = await revokeAssistantToken(userId, toRevoke.id);
      if (r.ok) {
        setTokens((t) => t.filter((x) => x.id !== toRevoke.id));
        // O token novo ainda no painel já não vale: o painel vai-se com ele.
        if (fresh?.id === toRevoke.id) { setFresh(null); setCopied(false); }
        setMsg({ tipo: 'info', texto: 'Acesso revogado. A assistente deixa de conseguir ler.' });
      } else {
        setMsg({ tipo: 'erro', texto: ASSISTANT_MSG_REVOGAR });
      }
    } catch {
      setMsg({ tipo: 'erro', texto: ASSISTANT_MSG_REVOGAR });
    } finally {
      setRevoking(false);
      setToRevoke(null);
    }
  };

  if (!userId) return null;

  return (
    <div className="module-card-contrast" data-testid="perfil-assistente" role="group" aria-labelledby={titleId}>
      <div className="flex items-center gap-2 mb-3">
        <UserCheck size={16} className="text-[var(--mod-coach-to)]" aria-hidden="true" />
        <h3 id={titleId} className="text-sm font-semibold">Assistente executiva</h3>
      </div>
      <p className="text-[11px] text-[var(--text-3)] mb-3 leading-relaxed">{ASSISTANT_TEXTO}</p>

      {fresh && (
        <div role="region" aria-labelledby={freshTitleId} data-testid="perfil-assistente-novo" className="rounded-xl px-3 py-3 mb-3"
          style={{ background: 'var(--surface-soft)', border: '1px solid var(--border-glass)' }}>
          <p id={freshTitleId} className="text-[12px] font-bold" style={{ color: 'var(--text-1)' }}>Este código só aparece agora</p>
          <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: 'var(--text-2)' }}>
            Copia-o e entrega-o à assistente. Depois de fechares isto, não o voltas a ver — se o perderes, revoga e gera outro.
          </p>
          <code ref={freshRef} tabIndex={-1} data-testid="perfil-assistente-token"
            className="block mt-2 px-3 py-2 rounded-lg text-[12px] break-all select-all"
            style={{ background: 'var(--surface-strong)', color: 'var(--text-1)' }}>{fresh.token}</code>
          <div className="flex gap-2 mt-3">
            <Button type="button" variant="secondary" size="sm" onClick={copiar}
              icon={copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}>
              {copied ? 'Copiado' : 'Copiar'}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => { setFresh(null); setCopied(false); }}>
              Já guardei
            </Button>
          </div>
        </div>
      )}

      {msg && (
        <p role={msg.tipo === 'erro' ? 'alert' : 'status'} data-testid="perfil-assistente-msg"
          className="text-[11px] leading-relaxed rounded-xl px-3 py-2 mb-3"
          style={{ background: 'var(--surface-soft)', color: 'var(--text-2)' }}>{msg.texto}</p>
      )}

      {loaded && tokens.length > 0 && (
        <ul className="space-y-2 mb-3" aria-label="Acessos ativos" data-testid="perfil-assistente-lista">
          {tokens.map((t) => {
            const criado = fmt(t.created_at);
            const usado = fmt(t.last_used_at);
            return (
              <li key={t.id} className="flex items-center gap-3 rounded-xl px-3 py-2"
                style={{ background: 'var(--surface-soft)', border: '1px solid var(--border-glass)', minHeight: 44 }}>
                <KeyRound size={14} aria-hidden="true" className="shrink-0 text-[var(--text-3)]" />
                <span className="flex-1 min-w-0">
                  <span className="block text-[12.5px] font-bold" style={{ color: 'var(--text-1)' }}>{t.token_prefix}…</span>
                  <span className="block text-[11px]" style={{ color: 'var(--text-3)' }}>
                    {criado ? `Criado a ${criado}` : 'Criado agora'} · {usado ? `usado pela última vez a ${usado}` : 'ainda não usado'}
                  </span>
                </span>
                <Button type="button" variant="danger-ghost" size="sm" onClick={() => setToRevoke(t)}
                  aria-label={`Revogar o acesso ${t.token_prefix}…`} icon={<Trash2 size={14} aria-hidden="true" />}>
                  Revogar
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {loaded && tokens.length === 0 && !fresh && (
        <p className="text-[11px] text-[var(--text-3)] mb-3" data-testid="perfil-assistente-vazio">Sem acessos ativos: a assistente não consegue ler nada.</p>
      )}

      <Button type="button" variant="secondary" onClick={gerar} disabled={busy || !loaded} isLoading={busy}>
        Gerar acesso
      </Button>

      <ConfirmDeleteModal
        isOpen={!!toRevoke}
        onClose={() => { if (!revoking) setToRevoke(null); }}
        onConfirm={revogar}
        isDeleting={revoking}
        title="Revogar acesso"
        confirmLabel="Revogar"
        busyLabel="A revogar…"
        message="A assistente deixa de conseguir ler os teus dados logo no próximo pedido. Podes gerar outro acesso quando quiseres."
      />
    </div>
  );
}
