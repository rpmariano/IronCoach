import React, { useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';
import { useAppStore } from '../../store';
import { FEATURES } from '../../store/featureFlagsSlice';
import { useDesignV2, setDesignV2 } from '../../utils/designV2';

/* Admin · Funcionalidades («v1 lite», aprovado pelo Rui, 2026-11-22). Um interruptor por chave de
   app_feature_flags, com o nome e o que esconde. A mudança grava logo (setFeatureFlag: upsert, a
   RLS só deixa o admin) e diz quando e por quem foi feita. A app dos atletas apanha-a no arranque
   seguinte ou ao voltar ao foco (App.jsx, loadFeatureFlags). Só aparece a admins (Admin.jsx). */

function whenText(iso) {
  try { return format(parseISO(iso), "d MMM yyyy 'às' HH:mm", { locale: pt }); } catch { return null; }
}

export default function FeaturesTab({ users = [] }) {
  const flags = useAppStore((s) => s.featureFlags);
  const rows = useAppStore((s) => s.featureFlagRows);
  const source = useAppStore((s) => s.featureFlagsSource);
  const loadFeatureFlags = useAppStore((s) => s.loadFeatureFlags);
  const setFeatureFlag = useAppStore((s) => s.setFeatureFlag);
  const [busyKey, setBusyKey] = useState(null);
  const [error, setError] = useState(null);

  // Ao abrir, relê do servidor (o que está no store pode ser da cache).
  useEffect(() => { loadFeatureFlags?.(); }, [loadFeatureFlags]);

  const nameOf = (id) => {
    if (!id) return null;
    const u = (users || []).find((x) => x?.id === id);
    return u?.display_name || u?.name || u?.email || 'um admin';
  };

  const toggle = async (key) => {
    if (busyKey) return;
    setBusyKey(key);
    setError(null);
    const res = await setFeatureFlag(key, !flags[key]);
    setBusyKey(null);
    if (!res?.ok) setError(`Não consegui gravar «${FEATURES.find((f) => f.key === key)?.label}». ${res?.message || ''}`.trim());
  };

  return (
    <div className="space-y-3 fade-in" data-testid="admin-features">
      <p className="text-[12px] leading-relaxed text-[var(--text-3)]">
        Ligar ou desligar partes da app para todos os atletas. O código não se apaga: o que está desligado
        só se esconde. Os atletas veem a mudança quando abrem a app ou voltam a ela.
        {source !== 'server' && ' (A mostrar a cópia guardada — a leitura do servidor ainda não chegou.)'}
      </p>
      {error && <p role="alert" className="text-[12px]" style={{ color: 'var(--danger)' }}>{error}</p>}
      <ul className="space-y-2">
        {FEATURES.map((f) => {
          const on = !!flags[f.key];
          const row = (rows || []).find((r) => r.key === f.key);
          const when = row?.updated_at ? whenText(row.updated_at) : null;
          const who = nameOf(row?.updated_by);
          return (
            <li key={f.key} className="rounded-xl p-3 border border-[var(--border-glass)]" style={{ background: 'var(--surface-glass)' }} data-testid={`feature-${f.key}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-bold text-[var(--text-1)]">{f.label}</p>
                  <p className="text-[12px] mt-0.5 leading-relaxed text-[var(--text-3)]">{f.description}</p>
                  <p className="text-[11px] mt-1 text-[var(--text-4)]" data-testid={`feature-${f.key}-meta`}>
                    {when ? `Mudado a ${when}${who ? ` por ${who}` : ''}.` : `Por omissão: ${f.default ? 'ligado' : 'desligado'}.`}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  aria-label={`${f.label}: ${on ? 'ligado' : 'desligado'}`}
                  disabled={!!busyKey}
                  onClick={() => toggle(f.key)}
                  data-testid={`feature-${f.key}-switch`}
                  className={`tap-area-44 w-11 h-6 rounded-full relative shrink-0 transition-colors disabled:opacity-60 ${on ? 'bg-[var(--ok)]' : 'bg-[var(--surface-strong)]'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full transition-transform ${on ? 'translate-x-5' : 'translate-x-0'}`} style={{ backgroundColor: 'var(--text-1)' }} />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <DesignV2Row />
    </div>
  );
}

/* O Design v2 (utils/designV2.js): à parte dos interruptores de cima, porque não é do servidor nem
   dos atletas — grava só neste dispositivo. */
function DesignV2Row() {
  const on = useDesignV2();
  return (
    <section className="rounded-xl p-3 border border-[var(--border-glass)] mt-4" style={{ background: 'var(--surface-glass)' }} data-testid="feature-design-v2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[13px] font-bold text-[var(--text-1)] m-0">Design v2 neste dispositivo</h3>
          <p className="text-[12px] mt-0.5 leading-relaxed text-[var(--text-3)]">
            O ensaio do design novo (Painel). Só muda o aspeto neste telemóvel: não grava nada no servidor e os atletas não veem nada.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Design v2 neste dispositivo"
          onClick={() => setDesignV2(!on)}
          data-testid="feature-design-v2-switch"
          className={`tap-area-44 w-11 h-6 rounded-full relative shrink-0 transition-colors ${on ? 'bg-[var(--coach)]' : 'bg-[var(--surface-strong)]'}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full transition-transform ${on ? 'translate-x-5' : 'translate-x-0'}`} style={{ backgroundColor: 'var(--text-1)' }} />
        </button>
      </div>
    </section>
  );
}
