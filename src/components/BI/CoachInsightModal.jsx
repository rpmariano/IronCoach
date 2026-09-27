import React, { useId, useState } from 'react';
import { Lightbulb, Sparkles } from 'lucide-react';
import { useAppStore } from '../../store';
import { fmtNumber } from '../../utils/dashboardVerdicts';
import { todayISO } from '../../lib/utils';
import { Dialog } from '../shared/Sheet';
import { noticeSeverity, noticeTone } from './noticeTones';

/* A janela dos avisos da Carol (mock "Popup · insights"): um cartão por
   aviso, na cor e com o símbolo da gravidade (noticeTones.js).

   Desde 2026-09-27 os avisos em que ela pede para falar e os insights são o
   mesmo cartão, com as ações juntas no fim: "Falar com a Carol" em cima e,
   por baixo, lado a lado, as que o aviso tiver. Antes, o "Entendido" vivia
   no cartão e o "Falar com a Carol" e o "Ignorar" no rodapé, para o
   conjunto (pedido do utilizador).

   Nos insights:
   - "Falar com a Carol" abre o chat com esse insight;
   - "Percebi" (era "Entendido") tira-o de vez, em todos os ecrãs;
   - "Agora não" (era "Ignorar") tira-o até amanhã: volta se ainda se
     aplicar. Fica registado como dispensa (coach_impressions, ação 5.1),
     para a Carol e o outro telemóvel saberem que foi posto de lado.

   Nos avisos em que ela pede para falar não há "Percebi": são uma conversa
   por ter, não um dado a perceber, e saem quando o assunto se resolve. No
   lugar do "Agora não" há "Dispensar" (pedido 2026-09-27), porque aí a
   dispensa é de vez: o balanço e o fim do bloco não voltam; o mapa da época
   só volta se o calendário mudar com jornadas por decidir, e então é outro
   aviso; uma intervenção por resolver ('assuntos') pede confirmação e
   fecha-se. O conflito de provas e o ajuste do plano não se dispensam:
   saem quando se resolvem. Formato de um aviso:
   { id, severity, title, message, onTalk, onDismiss? } */

const PRIMARY_STYLE = { background: 'var(--grad-coach-legible)', color: 'var(--coach-ink)' };
const SECONDARY_STYLE = { background: 'transparent', border: '1px solid var(--border-glass-strong)', color: 'var(--text-3)' };

/* `dismiss` é o botão de pôr de lado — "Agora não" nos insights,
   "Dispensar" nos avisos dela — ou null quando o aviso não se dispensa:
   { text, ariaLabel, testId, onClick }. */
function NoticeCard({ testId, severity, title, message, children, onTalk, talkTestId, onUnderstood, understoodTestId, dismiss }) {
  const t = noticeTone(severity);
  const titleId = useId();
  return (
    <div data-testid={testId} data-severity={noticeSeverity(severity)} className="rounded-[14px]" style={{ background: t.bg, border: `1px solid ${t.bd}`, padding: 14 }}>
      <div className="flex items-center gap-2">
        <t.Icon size={14} aria-hidden="true" style={{ color: t.color }} className="shrink-0" />
        <span id={titleId} className="text-[11px] font-extrabold uppercase" style={{ color: t.color, letterSpacing: '.08em' }}>{title}</span>
      </div>
      {message && <p className="text-[12.5px] leading-[1.5] mt-2" style={{ color: t.text }}>{message}</p>}
      {children}
      {/* Os botões de cada cartão são um grupo com o título do aviso: com
          vários cartões, o leitor de ecrã não ouve "Percebi" atrás de
          "Percebi" sem saber de qual. */}
      <div role="group" aria-labelledby={titleId} className="flex flex-col gap-2 mt-3">
        <button
          type="button"
          data-testid={talkTestId}
          onClick={onTalk}
          className="w-full inline-flex items-center justify-center gap-2 min-h-[44px] rounded-[11px] text-[12.5px] font-extrabold"
          style={PRIMARY_STYLE}
        >
          <Sparkles size={14} aria-hidden="true" /> Falar com a Carol
        </button>
        {(onUnderstood || dismiss) && (
          <div className="flex gap-2">
            {onUnderstood && (
              <button
                type="button"
                data-testid={understoodTestId}
                onClick={onUnderstood}
                className="flex-1 min-h-[44px] rounded-[11px] text-[12.5px] font-extrabold"
                style={{ background: t.btnBg, color: t.btnColor }}
              >
                Percebi
              </button>
            )}
            {dismiss && (
              <button
                type="button"
                data-testid={dismiss.testId}
                aria-label={dismiss.ariaLabel}
                onClick={dismiss.onClick}
                className="flex-1 min-h-[44px] rounded-[11px] text-[12.5px] font-bold"
                style={SECONDARY_STYLE}
              >
                {dismiss.text}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function CoachInsightModal({ insights = [], alerts = [], onClose }) {
  const { setInsightState, snoozeInsight, setActiveTab, setCoachIntent, logImpressionDismissed } = useAppStore();
  const [handled, setHandled] = useState(() => new Set());

  const list = insights || [];
  const carolAlerts = alerts || [];
  if (list.length === 0 && carolAlerts.length === 0) return null;
  const visible = list.filter((i) => !handled.has(i.id));

  // Tratado um insight, o cartão sai; sem mais nada à vista, a janela fecha.
  const settle = (insight) => {
    const next = new Set(handled);
    next.add(insight.id);
    setHandled(next);
    if (carolAlerts.length === 0 && list.every((i) => next.has(i.id))) onClose();
  };

  // "Percebi" não é dispensar, por isso não grava dispensa nenhuma.
  const understood = (insight) => {
    setInsightState(insight.id, 'understood');
    settle(insight);
  };

  const notNow = (insight) => {
    setInsightState(insight.id, 'ignored');
    snoozeInsight?.(insight.id, todayISO());
    logImpressionDismissed?.({ kind: 'insights', key: insight.id, title: insight.title });
    settle(insight);
  };

  // setActiveTab devolve false quando um ecrã com alterações por gravar
  // trava a saída (Perfil): aí a conversa ainda não aconteceu, e o insight
  // não se dá por tratado.
  const talkAbout = (insight) => {
    setCoachIntent({ kind: 'proactive_intervention', reason: `O atleta abriu o chat a partir do insight "${insight.title}". Aborda-o proativamente: ${insight.message}` });
    if (setActiveTab('coach') !== false) setInsightState(insight.id, 'understood');
    onClose();
  };

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
      testId="insights-dialog"
    >
      {carolAlerts.map((alert) => (
        <NoticeCard
          key={alert.id}
          testId={`carol-alert-${alert.id}`}
          severity={alert.severity}
          title={alert.title}
          message={alert.message}
          talkTestId={`carol-alert-talk-${alert.id}`}
          onTalk={() => { alert.onTalk?.(); onClose(); }}
          dismiss={alert.onDismiss ? {
            text: 'Dispensar',
            ariaLabel: 'Dispensar este aviso',
            testId: `carol-alert-dismiss-${alert.id}`,
            onClick: () => { alert.onDismiss(); onClose(); },
          } : null}
        />
      ))}
      {visible.map((insight) => {
        const t = noticeTone(insight.severity);
        return (
          <NoticeCard
            key={insight.id}
            testId={`insight-${insight.id}`}
            severity={insight.severity}
            title={insight.title}
            message={insight.message}
            talkTestId={`insight-talk-${insight.id}`}
            onTalk={() => talkAbout(insight)}
            understoodTestId={`insight-understood-${insight.id}`}
            onUnderstood={() => understood(insight)}
            dismiss={{
              text: 'Agora não',
              ariaLabel: 'Agora não — volta amanhã, se ainda se aplicar',
              testId: `insight-snooze-${insight.id}`,
              onClick: () => notNow(insight),
            }}
          >
            <div className="mt-2.5 flex items-center gap-2 flex-wrap">
              <span className="px-2 py-0.5 rounded-[7px] text-[11px] font-extrabold uppercase" style={{ background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.14)', color: 'var(--text-3)', letterSpacing: '.06em' }}>{insight.module}</span>
              {/* A tinta a 18% por cima da tinta do cartão deixava a cor cheia
                  em 4,36:1 — daí a tinta clara. E o valor leva vírgula
                  decimal, como todos os números da app. */}
              {insight.metric && (
                <span className="px-2 py-0.5 rounded-[7px] text-[11px] font-extrabold uppercase" style={{ background: t.btnBg, color: t.text, letterSpacing: '.06em' }}>
                  {insight.metric}: {typeof insight.value === 'number' ? fmtNumber(insight.value) : insight.value}
                </span>
              )}
            </div>
          </NoticeCard>
        );
      })}
    </Dialog>
  );
}
