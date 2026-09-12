import React from 'react';
import { AlertTriangle, CheckCircle, AlertOctagon, TrendingUp } from 'lucide-react';

/**
 * Warning — o bloco de aviso do redesenho 2026-09 (ponto 3, "cor com
 * significado"). Portado de
 * specs/design-handoff-2026-09/design-system/components/feedback/Warning.jsx.
 *
 * Nunca âmbar: o âmbar é da prova e só da prova. Um aviso é coral (--warn).
 * Nunca anima nem pulsa — "a cor já faz o trabalho parada".
 *
 * Tons:
 *   warn   coral   — atenção, viabilidade, energia disponível, análise falhada
 *   ok     verde   — dentro do alvo, concluído
 *   danger vermelho— erro e admin
 *   coach  ciano   — a Carol a explicar algo que não é aviso (insight "info").
 *                    Não estava no componente de referência; entra porque os
 *                    dois banners de insights (SmartInsightsBanner,
 *                    AnalysisAlert) têm uma severidade "info" que era azul
 *                    genérico — e o azul genérico não é nenhum dos oito
 *                    significados. Vindo da Carol, é ciano.
 *
 * Props:
 *   tone      'warn' | 'ok' | 'danger' | 'coach'   (default 'warn')
 *   title     string — eyebrow uppercase de 11px na cor do tom
 *   children  o texto do aviso, 12,5px
 *   icon      nó opcional; por omissão o ícone lucide do tom
 *   actions   nós opcionais (botões), cada um com 44px de altura mínima
 */

const TONE_ICON = {
  warn: AlertTriangle,
  ok: CheckCircle,
  danger: AlertOctagon,
  coach: TrendingUp,
};

// Texto do corpo: a variante "soft" da cor quando existe (coral e verde têm
// uma; o vermelho e o ciano usam o texto claro normal / o soft do coach).
const TONE_TEXT = {
  warn: 'var(--warn-soft)',
  ok: 'var(--ok-soft)',
  danger: 'var(--text-2)',
  coach: 'var(--coach-soft)',
};

// role: um aviso de erro interrompe (alert); o resto é estado (status).
const TONE_ROLE = { danger: 'alert', warn: 'status', ok: 'status', coach: 'status' };

export default function Warning({
  title,
  children,
  icon,
  actions,
  tone = 'warn',
  className = '',
  style,
  ...rest
}) {
  const safeTone = TONE_ICON[tone] ? tone : 'warn';
  const color = `var(--${safeTone})`;
  const Icon = TONE_ICON[safeTone];

  return (
    <div
      role={TONE_ROLE[safeTone]}
      className={className}
      style={{
        background: `var(--tint-${safeTone}-bg)`,
        border: `1px solid var(--tint-${safeTone}-bd)`,
        borderRadius: 'var(--radius-md)',
        padding: '13px 14px',
        ...style,
      }}
      {...rest}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color, display: 'flex' }} aria-hidden="true">
          {icon || <Icon size={14} />}
        </span>
        {title && (
          <span
            style={{
              fontSize: 'var(--text-xs)',
              fontWeight: 800,
              letterSpacing: 'var(--tracking-label)',
              textTransform: 'uppercase',
              color,
            }}
          >
            {title}
          </span>
        )}
      </div>
      <p
        style={{
          margin: '8px 0 0',
          fontSize: 'var(--text-sm)',
          lineHeight: 1.5,
          color: TONE_TEXT[safeTone],
        }}
      >
        {children}
      </p>
      {actions && (
        <div
          style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}
          data-testid="warning-actions"
        >
          {actions}
        </div>
      )}
    </div>
  );
}

/**
 * Botão de ação de um Warning — 44px de altura (piso de toque do ponto 2),
 * na cor do tom, sobre a tinta do tom.
 */
export function WarningAction({ tone = 'warn', onClick, children, type = 'button', style, ...rest }) {
  const safeTone = TONE_ICON[tone] ? tone : 'warn';
  return (
    <button
      type={type}
      onClick={onClick}
      // `style` é FUNDIDO, não espalhado com o resto das props: enquanto ia
      // no {...rest}, um chamador que passasse style (ex.: o "Tentar de
      // novo" do AnalysisFailure, a alinhar o ícone) substituía o objeto
      // inteiro e levava com ele o piso de toque — o botão caía a 24px de
      // altura, medido no browser. O piso do ponto 2 não pode depender de
      // quem chama se lembrar dele.
      style={{
        minHeight: 'var(--tap)',
        padding: '0 14px',
        borderRadius: 'var(--radius-sm)',
        background: `var(--tint-${safeTone}-bg)`,
        border: `1px solid var(--tint-${safeTone}-bd)`,
        color: `var(--${safeTone})`,
        fontSize: 'var(--text-xs)',
        fontWeight: 700,
        cursor: 'pointer',
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
