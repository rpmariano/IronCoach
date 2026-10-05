import React, { useId, useState } from 'react';
import { Lightbulb } from 'lucide-react';
import { fmtNumber } from '../../utils/dashboardVerdicts';
import { Dialog } from '../shared/Sheet';
import CarolActions from '../shared/CarolActions';
import { noticeSeverity, noticeTone } from './noticeTones';
import useInsightActions from './useInsightActions';

/* A janela dos avisos da Carol (mock "Popup · insights"): um cartão por
   aviso, na cor e com o símbolo da gravidade (noticeTones.js).

   Os avisos em que ela pede para falar e os insights são o mesmo cartão,
   com as ações juntas no fim (desde 2026-09-27). Desde 2026-10-05 as ações
   são o componente partilhado da convenção única dos botões da Carol
   (shared/CarolActions.jsx) — saiu daqui —, com o balão MessageCircle no
   "Falar com a Carol" (era a faísca Sparkles, só aqui):

   Nos insights (as funções vivem em useInsightActions.js, as mesmas do
   banner da Evolução · Geral):
   - "Falar com a Carol" abre o chat com esse insight; só o dá por tratado
     se o separador mudar de facto;
   - "Percebi" tira-o de vez, em todos os ecrãs;
   - "Agora não" tira-o só até amanhã: volta se ainda se aplicar. Fica
     registado como dispensa (coach_impressions, ação 5.1).

   Nos avisos em que ela pede para falar não há "Percebi" nem "Agora não":
   são uma conversa por ter, não um dado a perceber, e saem quando o assunto
   se resolve — "Falar com a Carol" não os dispensa. Os que se podem pôr de
   lado têm "Dispensar", de vez: o balanço e o fim do bloco não voltam; o
   mapa da época só volta se o calendário mudar com jornadas por decidir, e
   então é outro aviso; e a intervenção dentro de "Preciso de falar contigo"
   ('assuntos') pede confirmação (grava no servidor) — é um assunto, por isso
   esse botão diz "Dispensar este assunto" ao leitor de ecrã. Noutro
   dispositivo, a dispensa da intervenção chega pelo perfil
   (coach_intervention_status); a do balanço, do fim do bloco e do mapa,
   pelas impressões dos últimos 14 dias (store/index.js).

   Sem dispensa ficam: o conflito de provas (sai quando o atleta decide), o
   ajuste do plano (sai quando é levado à Carol, markDivergenceHandled) e um
   'assuntos' só com planos ou objetivos propostos (sai quando os aceita ou
   recusa). Formato de um aviso:
   { id, severity, title, message, onTalk, onDismiss?, dismissLabel? } */

/* O cartão de um aviso. `talk`, `understood` e `snooze`/`dismiss` são os
   papéis de CarolActions ({ testId, onClick, ariaLabel? }), null quando o
   aviso não os tem. */
function NoticeCard({ testId, severity, title, message, children, talk, understood, snooze, dismiss }) {
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
      <CarolActions labelledBy={titleId} severity={severity} talk={talk} understood={understood} snooze={snooze} dismiss={dismiss} />
    </div>
  );
}

export default function CoachInsightModal({ insights = [], alerts = [], onClose }) {
  const actions = useInsightActions();
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

  const markUnderstood = (insight) => {
    actions.understand(insight);
    settle(insight);
  };

  const notNow = (insight) => {
    actions.snooze(insight);
    settle(insight);
  };

  const talkAbout = (insight) => {
    actions.talk(insight);
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
          talk={{ testId: `carol-alert-talk-${alert.id}`, onClick: () => { alert.onTalk?.(); onClose(); } }}
          dismiss={alert.onDismiss ? {
            ariaLabel: alert.dismissLabel || 'Dispensar este aviso',
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
            talk={{ testId: `insight-talk-${insight.id}`, onClick: () => talkAbout(insight) }}
            understood={{ testId: `insight-understood-${insight.id}`, onClick: () => markUnderstood(insight) }}
            snooze={{ testId: `insight-snooze-${insight.id}`, onClick: () => notNow(insight) }}
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
