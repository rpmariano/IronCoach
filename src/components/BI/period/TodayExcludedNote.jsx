import React from 'react';

/**
 * TodayExcludedNote — a nota do fundo dos ecrãs de período em curso (R2,
 * 2026-10-04; erros N1, N3, O1): hoje ainda está a meio, por isso não entra
 * nas médias nem nos totais. Sem esta frase, um atleta que almoçou e abre a
 * semana veria médias que "não batem" com o que comeu hoje.
 *
 * Texto do mock-up: "Hoje ainda não acabou, por isso não entra nas contas.
 * Para veres o dia de hoje, toca em Dia." Os separadores sem "Dia" (Corrida,
 * Ginásio) passam `hasDayView={false}` e fica só a 1.ª frase; o Corpo, onde
 * uma pesagem de hoje é um facto fechado, passa o seu `text`.
 *
 * Props:
 *   period      opcional — o CalendarPeriod; num período passado não há "hoje"
 *               e a nota não aparece (no mock-up, setembro fechado não a tem)
 *   hasDayView  default true
 *   text        substitui o texto todo
 */
export const TODAY_EXCLUDED = 'Hoje ainda não acabou, por isso não entra nas contas.';
export const TODAY_SEE_DAY = 'Para veres o dia de hoje, toca em Dia.';

export default function TodayExcludedNote({ period, hasDayView = true, text, className = '', style }) {
  if (period && !period.isCurrent) return null;
  const msg = text || (hasDayView ? `${TODAY_EXCLUDED} ${TODAY_SEE_DAY}` : TODAY_EXCLUDED);
  return (
    <p
      data-testid="today-excluded-note"
      className={className}
      style={{
        margin: 0,
        padding: '0 12px',
        textAlign: 'center',
        fontSize: 'var(--text-xs)',
        lineHeight: 'var(--leading-normal)',
        color: 'var(--text-4)',
        ...style,
      }}
    >
      {msg}
    </p>
  );
}
