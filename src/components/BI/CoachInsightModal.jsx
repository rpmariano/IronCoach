import React, { useState } from 'react';
import { Lightbulb, AlertTriangle, AlertCircle, TrendingUp, Sparkles, MessageCircle } from 'lucide-react';
import { useAppStore } from '../../store';
import { fmtNumber } from '../../utils/dashboardVerdicts';
import { Dialog } from '../shared/Sheet';

/* Popup dos insights do Coach (mock "Popup · insights"): um cartão por
   insight, na cor do que é — coral para aviso, vermelho para crítico, verde
   para o que está bem — cada um com o seu "Entendido". Em baixo, "Falar
   com o Coach" e "Ignorar" para o conjunto. */
/* btnColor é a tinta CLARA do tom, não a cor cheia: o "Entendido" está em
   cima da tinta a 18% POR CIMA da tinta do cartão, e nessa dupla camada a cor
   cheia dava 4,06:1 (crítico) e 4,37:1 (aviso). Com a tinta clara — a mesma
   que o corpo do insight já usa — são 7,8 e 8,5:1, sem mudar de significado. */
const TONE = {
  critical: { Icon: AlertTriangle, color: 'var(--danger)', bg: 'var(--tint-danger-bg)', bd: 'var(--tint-danger-bd)', text: 'var(--danger-soft)', btnBg: 'rgba(248,113,113,.18)', btnColor: 'var(--danger-soft)' },
  warning: { Icon: AlertTriangle, color: 'var(--warn)', bg: 'var(--tint-warn-bg)', bd: 'var(--tint-warn-bd)', text: 'var(--warn-soft)', btnBg: 'rgba(251,124,77,.18)', btnColor: 'var(--warn-soft)' },
  info: { Icon: TrendingUp, color: 'var(--ok)', bg: 'rgba(52,211,153,.07)', bd: 'rgba(52,211,153,.26)', text: 'var(--ok-soft)', btnBg: 'rgba(52,211,153,.18)', btnColor: 'var(--ok-soft)' },
};

/* Os avisos da Carol (pedido 2026-09-13): "precisa de falar contigo", "o
   plano precisa de um ajuste", "o balanço da prova". Viviam no cabeçalho do
   cartão da Carol e confundiam-se com o resumo do dia; agora vivem aqui,
   à frente dos insights, cada um com o seu "Falar com a Carol" — é uma
   conversa por ter, não um dado a entender, por isso não há "Entendido"
   nem "Ignorar": saem quando o assunto se resolve. Formato:
   { id, title, message, onTalk, onDismiss? } */
function AlertCard({ alert, onClose }) {
  const talk = () => {
    alert.onTalk?.();
    onClose();
  };
  const dismiss = () => {
    alert.onDismiss?.();
    onClose();
  };
  return (
    <div data-testid={`carol-alert-${alert.id}`} className="rounded-[14px]" style={{ background: 'var(--tint-coach-bg)', border: '1px solid var(--tint-coach-bd)', padding: 14 }}>
      <div className="flex items-center gap-2">
        <MessageCircle size={14} style={{ color: 'var(--coach)' }} className="shrink-0" />
        <span className="text-[11px] font-extrabold uppercase" style={{ color: 'var(--coach-soft)', letterSpacing: '.08em' }}>{alert.title}</span>
      </div>
      {alert.message && <p className="text-[12.5px] leading-[1.5] mt-2" style={{ color: 'var(--text-2)' }}>{alert.message}</p>}
      <div className="flex items-center gap-2 mt-3 flex-wrap">
        <button
          type="button"
          data-testid={`carol-alert-talk-${alert.id}`}
          onClick={talk}
          className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-[14px] rounded-[11px] text-[12.5px] font-extrabold"
          style={{ background: 'var(--grad-coach-legible)', color: 'var(--coach-ink)' }}
        >
          <Sparkles size={14} /> Falar agora
        </button>
        {alert.onDismiss && (
          <button
            type="button"
            data-testid={`carol-alert-dismiss-${alert.id}`}
            onClick={dismiss}
            className="min-h-[44px] px-[12px] rounded-[11px] text-[12px] font-bold"
            style={{ background: 'transparent', border: '1px solid var(--border-glass-strong)', color: 'var(--text-3)' }}
          >
            Agora não
          </button>
        )}
      </div>
    </div>
  );
}

export default function CoachInsightModal({ insights = [], alerts = [], onClose }) {
  const { setInsightState, setActiveTab, setCoachIntent, logImpressionDismissed } = useAppStore();
  const [handled, setHandled] = useState(() => new Set());

  const list = insights || [];
  const carolAlerts = alerts || [];
  if (list.length === 0 && carolAlerts.length === 0) return null;
  const visible = list.filter((i) => !handled.has(i.id));

  const understood = (insight) => {
    setInsightState(insight.id, 'understood');
    const next = new Set(handled);
    next.add(insight.id);
    setHandled(next);
    if (carolAlerts.length === 0 && list.every((i) => next.has(i.id))) onClose();
  };

  // "Ignorar" é a dispensa real, e fica em coach_impressions com dismissed_at
  // (ação 5.1) para a Carol e o outro telemóvel saberem que estes insights
  // foram postos de lado. O "Entendi" não é dispensar, por isso não grava.
  const ignoreAll = () => {
    list.forEach((i) => {
      setInsightState(i.id, 'ignored');
      logImpressionDismissed({ kind: 'insights', key: i.id, title: i.title });
    });
    onClose();
  };

  const talk = () => {
    const titles = list.map((i) => i.title).join(', ');
    list.forEach((i) => setInsightState(i.id, 'understood'));
    setCoachIntent({ kind: 'proactive_intervention', reason: `O atleta abriu o chat a partir dos Insights da Carol. Aborda proativamente estes temas: ${titles}.` });
    setActiveTab('coach');
    onClose();
  };

  // Com avisos da Carol, cada um já traz o seu "Falar com a Carol": o botão
  // do conjunto sai para não haver dois iguais, e "Ignorar" fica só para os
  // insights, que são os únicos que se ignoram.
  const actions = carolAlerts.length ? (
    list.length > 0 ? (
      <button type="button" onClick={ignoreAll} className="w-full min-h-[44px] rounded-[11px] text-[12.5px] font-bold" style={{ background: 'transparent', border: '1px solid var(--border-glass-strong)', color: 'var(--text-3)' }}>
        Ignorar os insights
      </button>
    ) : null
  ) : (
    <div className="flex flex-col gap-2 w-full">
      <button type="button" onClick={talk} className="w-full inline-flex items-center justify-center gap-2 min-h-[46px] rounded-[11px] text-[13.5px] font-extrabold" style={{ background: 'var(--grad-coach-legible)', color: 'var(--coach-ink)' }}>
        <Sparkles size={16} /> Falar com a Carol
      </button>
      <button type="button" onClick={ignoreAll} className="w-full min-h-[44px] rounded-[11px] text-[12.5px] font-bold" style={{ background: 'transparent', border: '1px solid var(--border-glass-strong)', color: 'var(--text-3)' }}>
        Ignorar
      </button>
    </div>
  );

  return (
    <Dialog
      onClose={onClose}
      header={(
        <div className="flex items-center gap-[9px]">
          <span className="flex items-center justify-center shrink-0" style={{ width: 30, height: 30, borderRadius: 10, background: 'rgba(34,211,238,.16)', border: '1px solid rgba(34,211,238,.35)', color: 'var(--coach)' }}><Lightbulb size={16} /></span>
          <span className="text-[11px] font-extrabold uppercase" style={{ color: 'var(--coach-soft)', letterSpacing: '.1em' }}>
            {carolAlerts.length && !list.length ? 'A Carol' : 'Insights da Carol'}
          </span>
        </div>
      )}
      actions={actions}
      testId="insights-dialog"
    >
      {carolAlerts.map((alert) => <AlertCard key={alert.id} alert={alert} onClose={onClose} />)}
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
              {/* Mesma razão do "Entendido": a tinta a 18% por cima da tinta
                  do cartão deixava a cor cheia em 4,36:1. E o valor leva
                  vírgula decimal, como todos os números da app. */}
              {insight.metric && (
                <span className="px-2 py-0.5 rounded-[7px] text-[11px] font-extrabold uppercase" style={{ background: t.btnBg, color: t.text, letterSpacing: '.06em' }}>
                  {insight.metric}: {typeof insight.value === 'number' ? fmtNumber(insight.value) : insight.value}
                </span>
              )}
            </div>
            {/* Largura total, como o "Falar com a Carol" e o "Ignorar" do
                rodapé: encolhido ao conteúdo, lia-se como um botão de outra
                categoria (pedido do utilizador). */}
            <button type="button" onClick={() => understood(insight)} className="w-full min-h-[44px] mt-3 rounded-[11px] text-[12.5px] font-extrabold" style={{ background: t.btnBg, color: t.btnColor }}>
              Entendido
            </button>
          </div>
        );
      })}
    </Dialog>
  );
}
