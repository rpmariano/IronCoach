import React from 'react';

/**
 * VerdictLine — a frase de veredicto no topo de cada dashboard de módulo
 * (ponto 6 do redesenho 6c). Não é um cartão: é uma frase com um traço ao
 * lado. O dashboard tem de dizer se está bem ou mal ANTES de mostrar
 * números (auditoria, achado 6: "os dashboards de módulo não dizem se está
 * bem ou mal").
 *
 * O texto vem de `src/utils/dashboardVerdicts.js` — este componente não
 * decide nada, só mostra.
 *
 * O traço leva a cor do TOM, não a do módulo. Nos mocks o traço está sempre
 * na cor do módulo (ciano na Corrida, violeta na Nutrição) mesmo quando a
 * frase é má — o que faz a frase má do mock da Nutrição ("é aqui que se
 * perde prontidão") ficar violeta como se fosse boa notícia. O handoff do
 * ponto 6 manda explicitamente o traço na cor do tom
 * (--ok/--warn/--danger/--text-4), e é essa a regra do ponto 3 ("cor com
 * significado"): verde = dentro do alvo, coral = aviso. Fica o tom.
 *
 * Props:
 *   text   string — a frase (já gerada dos dados reais)
 *   tone   'ok' | 'warn' | 'danger' | 'neutral'  (default 'neutral')
 */

const TONE_COLOR = {
  ok: 'var(--ok)',
  warn: 'var(--warn)',
  danger: 'var(--danger)',
  neutral: 'var(--text-4)',
};

export default function VerdictLine({ text, tone = 'neutral', className = '', style, ...rest }) {
  if (!text) return null;
  const safeTone = TONE_COLOR[tone] ? tone : 'neutral';

  return (
    <div
      data-testid="verdict-line"
      data-tone={safeTone}
      role="status"
      className={className}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '0 2px',
        ...style,
      }}
      {...rest}
    >
      <span
        aria-hidden="true"
        data-testid="verdict-dash"
        style={{
          width: 3,
          alignSelf: 'stretch',
          borderRadius: 99,
          background: TONE_COLOR[safeTone],
          flexShrink: 0,
          marginTop: 2,
        }}
      />
      <p
        style={{
          margin: 0,
          fontSize: 'var(--text-md)',
          fontWeight: 700,
          lineHeight: 'var(--leading-normal)',
          color: 'var(--text-1)',
        }}
      >
        {text}
      </p>
    </div>
  );
}
