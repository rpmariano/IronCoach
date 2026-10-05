import React, { useEffect, useMemo, useState } from 'react';
import { Check, ChevronRight, X } from 'lucide-react';
import { useAppStore } from '../../store';
import SectionLabel from '../shared/SectionLabel';
import { buildGettingStarted, isGettingStartedComplete } from '../../utils/gettingStarted';
import useTodayISO from '../../utils/useTodayISO';

/* Cartão "O que falta para começar" no Início (2026-10-04). A dispensa é por
   utilizador, no mesmo padrão do onboardingLocalKey (utils/onboarding.js);
   localStorage pode falhar (modo privado), por isso tudo em try/catch. */
export const gettingStartedDismissKey = (userId) => `ironcoach_getting_started_dismissed_${userId || 'anon'}`;
export const gettingStartedCompletedKey = (userId) => `ironcoach_getting_started_completed_${userId || 'anon'}`;

function readFlag(key) {
  try { return localStorage.getItem(key) === '1'; } catch { return false; }
}
function writeFlag(key) {
  try { localStorage.setItem(key, '1'); } catch { /* modo privado: fica só nesta sessão */ }
}

export default function GettingStartedCard({ onAction }) {
  const profile = useAppStore((s) => s.profile);
  const raceEvents = useAppStore((s) => s.raceEvents);
  const runs = useAppStore((s) => s.runs);
  const meals = useAppStore((s) => s.meals);
  // 2026-10-04: enquanto os dados não chegaram, listas vazias não são "nada registado".
  const dataPending = useAppStore((s) => s.dataPending);
  const userId = profile?.id;
  const today = useTodayISO();

  // Dispensa/conclusão em memória por utilizador (nunca partilhada entre contas
  // na mesma montagem); o localStorage é lido a cada render porque o perfil pode
  // chegar depois do 1.º render. Sem userId não se grava (a chave _anon seria
  // partilhada por todas as contas do dispositivo).
  const [session, setSession] = useState({ dismissed: {} });
  const items = useMemo(
    () => buildGettingStarted({ profile, raceEvents, runs, meals, todayISO: today }),
    [profile, raceEvents, runs, meals, today],
  );
  const complete = !dataPending && isGettingStartedComplete(items);

  // As refeições são uma janela móvel de 7 dias, logo "feito" não é monótono:
  // lembra-se a primeira conclusão para o cartão de arranque não voltar como
  // aviso de adesão quando falha um dia.
  useEffect(() => {
    if (!complete || !userId) return;
    writeFlag(gettingStartedCompletedKey(userId));
  }, [complete, userId]);

  if (dataPending) return null;
  const dismissed = !!session.dismissed[userId] || (userId && readFlag(gettingStartedDismissKey(userId)));
  const wasCompleted = complete || (userId && readFlag(gettingStartedCompletedKey(userId)));
  if (dismissed || wasCompleted) return null;

  const doneCount = items.filter((i) => i.done).length;
  const dismiss = () => {
    if (userId) writeFlag(gettingStartedDismissKey(userId));
    setSession((s) => ({ ...s, dismissed: { ...s.dismissed, [userId]: true } }));
  };

  return (
    // SectionLabel não passa `id` ao div, por isso o nome da secção vai por aria-label.
    <section aria-label="O que falta para começar" data-testid="getting-started">
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '4px 2px 6px' }}>
        <SectionLabel style={{ margin: 0 }}>O que falta para começar</SectionLabel>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{doneCount} de {items.length}</span>
      </div>

      <div
        style={{
          borderRadius: 'var(--radius-xl)',
          background: 'var(--surface-glass)',
          border: '1px solid var(--border-glass)',
          padding: '6px 16px',
        }}
      >
        {/* Uma frase a dizer PARA QUE serve, que a lista do Overview não tinha:
            sem ela, "Registar 3 corridas" parece trabalho de casa. */}
        <p style={{ margin: '8px 0 4px', fontSize: 'var(--text-xs)', lineHeight: 1.5, color: 'var(--text-4)' }}>
          Com isto feito, consigo dizer-te como estás e montar o plano até à prova.
        </p>

        {items.map((item, i) => (
          <div
            key={item.key}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              borderBottom: i < items.length - 1 ? '1px solid rgba(255,255,255,.08)' : 'none',
            }}
          >
            <span
              aria-hidden="true"
              style={item.done
                ? {
                    width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                    background: 'var(--tint-ok-bg)', border: '1px solid var(--tint-ok-bd)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ok)',
                  }
                : { width: 22, height: 22, borderRadius: '50%', flexShrink: 0, border: '1px dashed rgba(255,255,255,.28)' }}
            >
              {item.done && <Check size={12} />}
            </span>

            {item.done ? (
              <span style={{ flex: 1, fontSize: 'var(--text-sm)', color: 'var(--text-3)', padding: '13px 0', textDecoration: 'line-through', textDecorationColor: 'rgba(255,255,255,.25)' }}>
                {item.label}
                <span className="sr-only"> (feito)</span>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onAction(item.key)}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left',
                  minHeight: 'var(--tap, 44px)', background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 'var(--text-sm)', color: 'var(--text-2)', padding: 0,
                }}
              >
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.progress
                  ? <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{item.progress}</span>
                  : <ChevronRight size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />}
              </button>
            )}
          </div>
        ))}

        {/* "Dispensar" (era "Agora não", 2026-10-05): a marca é para sempre,
            por utilizador — e na convenção dos botões da Carol "Agora não" é
            só até amanhã. */}
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dispensar este aviso"
          style={{
            display: 'flex', alignItems: 'center', gap: 6, minHeight: 'var(--tap, 44px)',
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            fontSize: 'var(--text-xs)', color: 'var(--text-muted)',
          }}
        >
          <X size={12} aria-hidden="true" /> Dispensar
        </button>
      </div>
    </section>
  );
}

