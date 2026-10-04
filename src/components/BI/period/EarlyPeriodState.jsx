import React from 'react';
import { ChevronRight } from 'lucide-react';
import VerdictLine from '../VerdictLine';
import { earlyVerdict, kindText, toneOf, viewPreviousLabel } from './periodText';

/**
 * EarlyPeriodState — o período em curso que ainda não tem dados que cheguem
 * (2026-10-04, R6/R8), nas duas formas do mock-up:
 *
 *  · state="a_comecar" (ecrã "Semana · segunda-feira"): nenhum dia fechado.
 *    Cartão com "A semana começou hoje", uma frase ("Os dias contam quando
 *    acabarem — hoje já vais em 640 kcal."), os botões "Ver hoje" / "Ver
 *    semana passada" e o resumo do período anterior numa linha. Em vez de
 *    gráficos vazios ou de médias de 0 dias.
 *  · state="cedo" (mês/trimestre em curso com 3 dias): só a frase neutra
 *    "Só 3 dias fechados em outubro — ainda é cedo para conclusões." (é a
 *    mesma que earlyVerdict(cal) dá para o `verdict` do PeriodSummary).
 *  · state="ok" → nada.
 *
 * O estado vem de periodEarlyState (cal.earlyState de useCalendarPeriod).
 *
 * Props:
 *   state            'a_comecar' | 'cedo' | 'ok'
 *   kind             tipo de período ('semana', 'mes', …) — títulos e botões
 *   module           cor do botão principal
 *   title            substitui "A semana começou hoje"
 *   text             frase do "a começar" (default "Os dias contam quando acabarem.")
 *   onViewToday      "Ver hoje" (só aparece se for passado — Corrida/Ginásio não têm Dia)
 *   todayLabel       default "Ver hoje"
 *   onViewPrevious   "Ver semana passada" (cal.prev)
 *   previousSummary  "Semana passada (28 set – 4 out): 2 300 kcal/dia · …"
 *   cal              para o "cedo": dias fechados e "em outubro" vêm daqui
 *   earlyText        substitui a frase do "cedo"
 */
const btnBase = {
  minHeight: 'var(--tap)',
  padding: '0 12px',
  borderRadius: 'var(--radius-sm)',
  fontSize: 'var(--text-sm)',
  fontWeight: 800,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  whiteSpace: 'nowrap',
};

export default function EarlyPeriodState({
  state,
  kind = 'semana',
  module = 'nutricao',
  title,
  text = 'Os dias contam quando acabarem.',
  onViewToday,
  todayLabel = 'Ver hoje',
  onViewPrevious,
  previousSummary,
  cal,
  earlyText,
  className = '',
  style,
}) {
  if (state === 'cedo') {
    // Sem `cal` não se sabe quantos dias há: nunca escrever "Só 0 dias fechados".
    const msg = earlyText || (cal?.period ? earlyVerdict(cal).text : 'Ainda é cedo para conclusões.');
    return <VerdictLine text={msg} tone="neutral" className={className} style={style} data-testid="early-cedo" />;
  }
  if (state !== 'a_comecar') return null;

  const tone = toneOf(module);
  const heading = title || kindText(kind).started;

  return (
    <section
      aria-label={heading}
      data-testid="early-a-comecar"
      className={className}
      style={{
        borderRadius: 'var(--radius-xl)',
        padding: '22px 16px',
        background: 'var(--surface-dim)',
        border: '1px solid var(--border-glass)',
        textAlign: 'center',
        ...style,
      }}
    >
      <h3 style={{ margin: 0, fontSize: 'var(--text-lg)', fontWeight: 900, color: 'var(--text-1)' }}>{heading}</h3>
      {text && (
        <p
          style={{
            margin: '8px auto 0',
            maxWidth: 280,
            fontSize: 'var(--text-sm)',
            lineHeight: 1.55,
            color: 'var(--text-3)',
          }}
        >
          {text}
        </p>
      )}
      {(onViewToday || onViewPrevious) && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16, flexWrap: 'wrap' }}>
          {onViewToday && (
            <button
              type="button"
              onClick={onViewToday}
              style={{ ...btnBase, background: tone.bg, border: `1px solid ${tone.bd}`, color: tone.color }}
            >
              {todayLabel}
              <ChevronRight size={14} strokeWidth={2.4} aria-hidden="true" />
            </button>
          )}
          {onViewPrevious && (
            <button
              type="button"
              onClick={onViewPrevious}
              style={{
                ...btnBase,
                background: 'transparent',
                border: '1px solid var(--border-glass-strong)',
                color: 'var(--text-2)',
              }}
            >
              {viewPreviousLabel(kind)}
              <ChevronRight size={14} strokeWidth={2.4} aria-hidden="true" />
            </button>
          )}
        </div>
      )}
      {previousSummary && (
        <p
          data-testid="early-previous-summary"
          style={{
            margin: '14px 0 0',
            fontSize: 'var(--text-xs)',
            lineHeight: 'var(--leading-normal)',
            color: 'var(--text-4)',
          }}
        >
          {previousSummary}
        </p>
      )}
    </section>
  );
}
