import React, { useState } from 'react';
import { Lightbulb, AlertTriangle, AlertCircle, TrendingUp, Sparkles } from 'lucide-react';
import { useAppStore } from '../../store';
import { Dialog } from '../shared/Sheet';

/* Popup dos insights do Coach (mock "Popup · insights"): um cartão por
   insight, na cor do que é — coral para aviso, vermelho para crítico, verde
   para o que está bem — cada um com o seu "Entendido". Em baixo, "Falar
   com o Coach" e "Ignorar" para o conjunto. */
const TONE = {
  critical: { Icon: AlertTriangle, color: 'var(--danger)', bg: 'var(--tint-danger-bg)', bd: 'var(--tint-danger-bd)', text: '#fecaca', btnBg: 'rgba(248,113,113,.18)', btnColor: 'var(--danger)' },
  warning: { Icon: AlertTriangle, color: 'var(--warn)', bg: 'var(--tint-warn-bg)', bd: 'var(--tint-warn-bd)', text: 'var(--warn-soft)', btnBg: 'rgba(251,191,36,.18)', btnColor: 'var(--race)' },
  info: { Icon: TrendingUp, color: 'var(--ok)', bg: 'rgba(52,211,153,.07)', bd: 'rgba(52,211,153,.26)', text: 'var(--ok-soft)', btnBg: 'rgba(52,211,153,.18)', btnColor: 'var(--ok)' },
};

export default function CoachInsightModal({ insights, onClose }) {
  const { setInsightState, setActiveTab, setCoachIntent } = useAppStore();
  const [handled, setHandled] = useState(() => new Set());

  if (!insights || insights.length === 0) return null;
  const visible = insights.filter((i) => !handled.has(i.id));

  const understood = (insight) => {
    setInsightState(insight.id, 'understood');
    const next = new Set(handled);
    next.add(insight.id);
    setHandled(next);
    if (insights.every((i) => next.has(i.id))) onClose();
  };

  const ignoreAll = () => {
    insights.forEach((i) => setInsightState(i.id, 'ignored'));
    onClose();
  };

  const talk = () => {
    const titles = insights.map((i) => i.title).join(', ');
    insights.forEach((i) => setInsightState(i.id, 'understood'));
    setCoachIntent({ kind: 'proactive_intervention', reason: `O atleta abriu o chat a partir dos Insights do Coach. Aborda proativamente estes temas: ${titles}.` });
    setActiveTab('coach');
    onClose();
  };

  return (
    <Dialog
      onClose={onClose}
      header={(
        <div className="flex items-center gap-[9px]">
          <span className="flex items-center justify-center shrink-0" style={{ width: 30, height: 30, borderRadius: 10, background: 'rgba(34,211,238,.16)', border: '1px solid rgba(34,211,238,.35)', color: 'var(--coach)' }}><Lightbulb size={16} /></span>
          <span className="text-[11px] font-extrabold uppercase" style={{ color: 'var(--coach-soft)', letterSpacing: '.1em' }}>Insights do Coach</span>
        </div>
      )}
      actions={(
        <div className="flex flex-col gap-2 w-full">
          <button type="button" onClick={talk} className="w-full inline-flex items-center justify-center gap-2 min-h-[46px] rounded-[12px] text-[13.5px] font-extrabold" style={{ background: 'var(--grad-coach)', color: 'var(--coach-ink)' }}>
            <Sparkles size={16} /> Falar com o Coach
          </button>
          <button type="button" onClick={ignoreAll} className="w-full min-h-[44px] rounded-[12px] text-[12.5px] font-bold" style={{ background: 'transparent', border: '1px solid var(--border-glass-strong)', color: 'var(--text-3)' }}>
            Ignorar
          </button>
        </div>
      )}
      testId="insights-dialog"
    >
      {visible.map((insight) => {
        const t = TONE[insight.severity] || TONE.info;
        const Icon = insight.severity ? t.Icon : AlertCircle;
        return (
          <div key={insight.id} className="rounded-[14px]" style={{ background: t.bg, border: `1px solid ${t.bd}`, padding: 14 }}>
            <div className="flex items-center gap-2">
              <Icon size={14} style={{ color: t.color }} className="shrink-0" />
              <span className="text-[11px] font-extrabold uppercase" style={{ color: t.color, letterSpacing: '.08em' }}>{insight.title}</span>
            </div>
            <p className="text-[12.5px] leading-[1.5] mt-2" style={{ color: t.text }}>{insight.message}</p>
            <div className="mt-2.5 flex items-center gap-2 flex-wrap">
              <span className="px-2 py-0.5 rounded-[7px] text-[11px] font-extrabold uppercase" style={{ background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.14)', color: 'var(--text-3)', letterSpacing: '.06em' }}>{insight.module}</span>
              {insight.metric && (
                <span className="px-2 py-0.5 rounded-[7px] text-[11px] font-extrabold uppercase" style={{ background: t.btnBg, color: t.color, letterSpacing: '.06em' }}>
                  {insight.metric}: {typeof insight.value === 'number' ? insight.value.toFixed(1) : insight.value}
                </span>
              )}
            </div>
            <button type="button" onClick={() => understood(insight)} className="min-h-[44px] mt-3 px-[13px] rounded-[9px] text-[12px] font-extrabold" style={{ background: t.btnBg, color: t.btnColor }}>
              Entendido
            </button>
          </div>
        );
      })}
    </Dialog>
  );
}
