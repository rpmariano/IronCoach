import React from 'react';
import ChartFrame from './ChartFrame';

/**
 * EmptyModuleState — o cartão de "sem dados" dos dashboards (ponto 7 do
 * redesenho 6c; auditoria, achados 9 "nenhum estado vazio" e 10 "nenhum
 * estado de espera ou de erro").
 *
 * Replica o cartão do mock "Dashboard · sem dados": tracejado (não é um
 * cartão de conteúdo — é a ausência dele), ícone do módulo num círculo,
 * título, uma frase que explica o que falta, e o convite a registar. O
 * botão leva a cor do módulo e os 44px do piso de toque (ponto 2).
 *
 * Antes disto, um dashboard sem registos no período mostrava gráficos a
 * zero, cartões partidos (o `IntensityDonut` só com o anel vazio) ou, no
 * Corpo, um `return` antecipado que engolia a frase de veredicto e o
 * filtro de período. Passa a ser sempre a mesma peça.
 *
 * Props:
 *   icon        nó — o ícone lucide do módulo (15–22px)
 *   tone        'run' | 'gym' | 'nutrition' | 'body' | 'race' | 'coach'
 *               — a cor do ícone e do botão; sem tom, fica na cor da marca
 *   title       string — "Ainda não há dados" (o texto do mock)
 *   children    o texto que diz o que falta
 *   actionLabel string — rótulo do botão ("Registar corrida")
 *   onAction    função — normalmente setOpenCreationMode('run'|...)
 */
export default function EmptyModuleState({
  icon,
  tone,
  title = 'Ainda não há dados',
  children,
  actionLabel,
  onAction,
  className = '',
  style,
  ...rest
}) {
  const color = tone ? `var(--${tone})` : 'var(--brand)';

  return (
    <div
      data-testid="empty-module-state"
      data-tone={tone || 'brand'}
      className={`shrink-0 ${className}`}
      style={{
        borderRadius: 'var(--radius-2xl)',
        background: 'rgba(255,255,255,.04)',
        border: '1px dashed rgba(255,255,255,.18)',
        padding: '24px 20px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        ...style,
      }}
      {...rest}
    >
      {icon && (
        <span
          aria-hidden="true"
          style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: 'rgba(255,255,255,.05)',
            border: '1px solid rgba(255,255,255,.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color,
          }}
        >
          {icon}
        </span>
      )}

      <div
        style={{
          fontSize: 'var(--text-lg)',
          fontWeight: 900,
          color: 'var(--text-1)',
          marginTop: icon ? 14 : 0,
          letterSpacing: '-.01em',
        }}
      >
        {title}
      </div>

      {children && (
        <p
          style={{
            margin: '9px 0 0',
            fontSize: 'var(--text-sm)',
            lineHeight: 1.55,
            color: 'var(--text-4)',
            maxWidth: 260,
          }}
        >
          {children}
        </p>
      )}

      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          style={{
            minHeight: 'var(--tap)',
            marginTop: 16,
            padding: '0 18px',
            borderRadius: 'var(--radius-sm)',
            background: tone ? `var(--tint-${tone}-bg)` : 'rgba(255,255,255,.06)',
            border: `1px solid ${tone ? `var(--tint-${tone}-bd)` : 'rgba(255,255,255,.14)'}`,
            color,
            fontSize: 'var(--text-md)',
            fontWeight: 800,
            cursor: 'pointer',
          }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

/**
 * A moldura de um gráfico SEM dados: o mesmo `ChartFrame` de sempre, com o
 * número a "—" e a área do gráfico tracejada — como os anéis tracejados do
 * `StatusCard empty` do Início. Substitui os gráficos a zero, que mentiam
 * (uma barra a zero lê-se como "treinaste zero", não como "não sei").
 */
export function EmptyChartFrame({ label, hint, unit, height = 176, footer, ...rest }) {
  return (
    <ChartFrame
      label={label}
      hint={hint}
      value="—"
      unit={unit}
      valueColor="var(--text-4)"
      height={height}
      footer={footer}
      {...rest}
    >
      <div
        data-testid="empty-plot"
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 'var(--radius-md)',
          border: '1px dashed rgba(255,255,255,.18)',
        }}
      />
    </ChartFrame>
  );
}
