import React from 'react';

/**
 * ChartFrame — a moldura de qualquer gráfico dos dashboards (ponto 6 do
 * redesenho 6c; auditoria, achado 1: "nos gráficos, tira as etiquetas de
 * dentro do SVG e põe o valor atual como número grande acima do gráfico").
 *
 * A regra é estrutural, não de tamanho: o texto SAI da tela do gráfico.
 * Dentro do <canvas>/<svg> ficam só formas — barras, linhas, pontos,
 * bandas. Tudo o que é palavra ou número vive em HTML à volta:
 *
 *   ┌──────────────────────────────────────────┐
 *   │ ETIQUETA (eyebrow 11px)      ⓘ    pista  │
 *   │ 42,6 km            ▲ +3,4 km             │   ← número grande, 26px/900
 *   │ ┌──────────────────────────────────────┐ │
 *   │ │        só formas, sem texto          │ │
 *   │ └──────────────────────────────────────┘ │
 *   │ mín                                  máx │   ← extremos do eixo, opcional
 *   │ ● série A   ● série B                    │   ← legenda em HTML, 11px
 *   └──────────────────────────────────────────┘
 *
 * O número grande leva `data-count-to` com o valor numérico: é o gancho
 * para a animação de contagem do ponto 9 (1400 ms). Aqui não anima.
 *
 * Props:
 *   label     string — etiqueta uppercase do gráfico
 *   info      nó — normalmente um <MetricInfo />
 *   hint      string — nota curta à direita ("últimos 90 dias")
 *   value     string|number — o valor ATUAL, em número grande
 *   unit      string — unidade a 11px apagada
 *   valueColor string — cor do número (default --text-1)
 *   delta     { text, tone } — variação opcional ao lado do número
 *   legend    Array<{ label, color, shape?: 'dot'|'line'|'dash' }>
 *   axis      { min, max } — extremos do eixo em HTML, nos cantos
 *   height    number — altura da área do gráfico (default 176)
 *   footer    nó — nota livre por baixo
 */

const DELTA_COLOR = {
  ok: 'var(--ok)',
  warn: 'var(--warn)',
  danger: 'var(--danger)',
  neutral: 'var(--text-4)',
};

/** O número de destaque. Separado para o ponto 9 poder animá-lo sozinho. */
export function BigNumber({ value, unit, color = 'var(--text-1)', size = 'var(--text-num)', ...rest }) {
  const numeric = typeof value === 'number'
    ? value
    : Number(String(value ?? '').replace(/\s/g, '').replace(',', '.'));

  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4 }} {...rest}>
      <span
        data-testid="chart-frame-value"
        data-count-to={isFinite(numeric) ? numeric : undefined}
        style={{
          fontSize: size,
          fontWeight: 900,
          lineHeight: 1,
          color,
          fontVariantNumeric: 'tabular-nums',
          fontFeatureSettings: '"tnum"',
        }}
      >
        {value}
      </span>
      {unit && (
        <span
          data-testid="chart-frame-unit"
          style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-4)' }}
        >
          {unit}
        </span>
      )}
    </span>
  );
}

export default function ChartFrame({
  label,
  info,
  hint,
  value,
  unit,
  valueColor = 'var(--text-1)',
  delta,
  legend = [],
  axis,
  height = 176,
  footer,
  children,
  className = '',
  style,
  ...rest
}) {
  return (
    <div
      data-testid="chart-frame"
      className={className}
      style={{
        background: 'var(--surface-glass)',
        backdropFilter: 'blur(var(--blur-card))',
        WebkitBackdropFilter: 'blur(var(--blur-card))',
        border: '1px solid var(--border-glass)',
        borderRadius: 20,
        padding: 16,
        boxShadow: 'var(--shadow-card)',
        ...style,
      }}
      {...rest}
    >
      {(label || info || hint) && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
          {label && (
            <span
              style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 800,
                letterSpacing: '.09em',
                textTransform: 'uppercase',
                color: 'var(--text-3)',
              }}
            >
              {label}
            </span>
          )}
          {info}
          {hint && (
            <span style={{ marginLeft: 'auto', fontSize: 'var(--text-xs)', color: 'var(--text-4)' }}>
              {hint}
            </span>
          )}
        </div>
      )}

      {(value !== undefined && value !== null && value !== '') && (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 9, flexWrap: 'wrap' }}>
          <BigNumber value={value} unit={unit} color={valueColor} />
          {delta?.text && (
            <span
              data-testid="chart-frame-delta"
              style={{
                marginLeft: 'auto',
                fontSize: 'var(--text-xs)',
                fontWeight: 800,
                color: DELTA_COLOR[delta.tone] || DELTA_COLOR.neutral,
              }}
            >
              {delta.text}
            </span>
          )}
        </div>
      )}

      <div
        data-testid="chart-frame-plot"
        style={{ position: 'relative', height, marginTop: 12 }}
      >
        {children}
      </div>

      {axis && (axis.min != null || axis.max != null) && (
        <div
          data-testid="chart-frame-axis"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: 6,
            fontSize: 'var(--text-xs)',
            color: 'var(--text-muted)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          <span>{axis.min}</span>
          <span>{axis.max}</span>
        </div>
      )}

      {legend.length > 0 && (
        <div
          data-testid="chart-frame-legend"
          style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 11 }}
        >
          {legend.map((item) => (
            <span
              key={item.label}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 'var(--text-xs)',
                fontWeight: 700,
                color: 'var(--text-3)',
              }}
            >
              <span
                aria-hidden="true"
                style={
                  item.shape === 'line' || item.shape === 'dash'
                    ? {
                        width: 14,
                        height: 2,
                        borderRadius: 2,
                        background: item.shape === 'dash'
                          ? `repeating-linear-gradient(90deg, ${item.color} 0 4px, transparent 4px 8px)`
                          : item.color,
                        flexShrink: 0,
                      }
                    : { width: 8, height: 8, borderRadius: 99, background: item.color, flexShrink: 0 }
                }
              />
              {item.label}
            </span>
          ))}
        </div>
      )}

      {footer && (
        <div style={{ marginTop: 10, fontSize: 'var(--text-xs)', color: 'var(--text-4)', lineHeight: 1.5 }}>
          {footer}
        </div>
      )}
    </div>
  );
}
