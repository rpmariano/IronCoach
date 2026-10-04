import React, { useRef } from 'react';
import { Check, ArrowDown, ArrowUp } from 'lucide-react';
import VerdictLine from '../VerdictLine';
import DeltaVsPrevious, { hasDelta } from './DeltaVsPrevious';
import { STATUS_COLOR, STATUS_WORD, avgHeader, toneOf } from './periodText';

/**
 * PeriodSummary — o cartão "Resumo do período" do mock-up aprovado
 * (2026-10-04, R2–R6), comum aos quatro separadores:
 *
 *   ┌ ‹  setembro 2026 · 28 de 30 dias com registo  › ┐   ← `navigator` (PeriodNav)
 *   │ ▍ Em setembro a média esteve no sítio…           │   ← `verdict`
 *   │ Média por dia registado (28 dias)  Dias no objetivo│   ← cabeçalho das colunas
 *   │ CALORIAS              2 290 / 2 400 kcal          │   ← linhas (radio, ≥48 px)
 *   │ ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬     ✓ Dentro · 95%   19 de 28    │
 *   │ ÁGUA                      — / 2 500 ml            │
 *   │ ▭▭▭▭▭▭▭▭  2 dias, poucos para média                │   ← `missingText`
 *   │──────────────────────────────────────────────────│
 *   │ Calorias e proteína no objetivo em 14 de 28 dias · ▲ agosto: 11 de 29 (38%)
 *   │ setembro: 19 de 28 dias no objetivo · Ver setembro ›   ← `previous`
 *   │ Objetivos aproximados: …                          │   ← `notes`
 *   └──────────────────────────────────────────────────┘
 *
 * Só apresenta: os números chegam já calculados (só dias fechados, R2) e
 * formatados (vírgula decimal, espaço nos milhares) pela vista do separador.
 *
 * Linhas (`rows`), cada uma:
 *   key         identificador (o que `selectedKey`/`onSelect` usam)
 *   label       "Calorias"
 *   value       texto do valor ("2 290"); null → "—" (sem média)
 *   goal        texto do objetivo com unidade ("2 400 kcal") — opcional
 *   status      'ok' | 'below' | 'above' | null (sem estado: sem objetivo, ou poucos dados)
 *   pct         % do objetivo (número) → "Dentro · 95%" e largura da barra
 *   barPct      largura da barra quando não é o pct (0–100)
 *   statusText  substitui "Dentro · 95%" (ex.: outro vocabulário no Corpo)
 *   count       "19 de 28" (R4) — usa countOf(k, n)
 *   missingText texto no lugar do estado quando não há média
 *               ("2 dias, poucos para média", "ainda sem dias fechados")
 *   color       cor da barra e do contorno da linha escolhida (ex.: 'var(--neon-kcal)');
 *               sem cor usa a do módulo
 *   ariaLabel   leitura por extenso (opcional; há uma por omissão)
 *
 * Rodapé (só aparece se houver algum):
 *   summaryLine  "Calorias e proteína no objetivo em 14 de 28 dias (50%)"
 *   delta        props do DeltaVsPrevious ({ current, previous, previousLabel, … })
 *                ou o elemento <DeltaVsPrevious/>; junta-se à summaryLine com " · ".
 *                Sem anterior não aparece nada (nem o " · ").
 *   previous     { text, actionLabel, onAction } — "setembro: 19 de 28 … · Ver setembro ›"
 *   notes        string[] — linhas cinzentas (APPROX_GOALS_NOTE, firstPeriodNote(kind))
 *
 * Com `onSelect` as linhas são um radiogroup (setas ↑↓/←→, Home, End): tocar
 * numa linha escolhe o que os gráficos mostram. Sem `onSelect`, é uma lista.
 */
const ICON = { ok: Check, below: ArrowDown, above: ArrowUp };

const mix = (color, pct) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;

function rowAria(r, countLabel) {
  if (r.ariaLabel) return r.ariaLabel;
  const parts = [r.label];
  if (r.value == null || r.missingText) {
    parts.push(r.missingText || 'sem dados');
    if (r.goal) parts.push(`objetivo ${r.goal}`);
    return parts.join(': ');
  }
  let main = r.value;
  if (r.goal) main += ` de ${r.goal}`;
  const bits = [main];
  const st = statusTextOf(r);
  if (st) bits.push(st);
  if (r.count) bits.push(`${countLabel.toLowerCase()}: ${r.count}`);
  return `${r.label}: ${bits.join(', ')}`;
}

function statusTextOf(r) {
  if (r.statusText) return r.statusText;
  if (!r.status || !STATUS_WORD[r.status]) return '';
  return r.pct != null && Number.isFinite(Number(r.pct))
    ? `${STATUS_WORD[r.status]} · ${Math.round(Number(r.pct))}%`
    : STATUS_WORD[r.status];
}

function RowBody({ r, color }) {
  const missing = r.value == null || !!r.missingText;
  const st = statusTextOf(r);
  const Icon = ICON[r.status];
  const stColor = STATUS_COLOR[r.status] || STATUS_COLOR.neutral;
  const rawBar = r.barPct ?? r.pct;
  const bar = rawBar == null || !Number.isFinite(Number(rawBar)) ? null : Math.max(0, Math.min(100, Number(rawBar)));

  return (
    <>
      <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <span
          style={{
            fontSize: 'var(--text-xs)',
            fontWeight: 800,
            letterSpacing: '.06em',
            textTransform: 'uppercase',
            color: 'var(--text-3)',
          }}
        >
          {r.label}
        </span>
        <span>
          <span
            className="tabular-nums"
            data-testid="row-value"
            style={{ fontSize: 13, fontWeight: 900, color: missing ? 'var(--text-4)' : 'var(--text-1)' }}
          >
            {missing ? '—' : r.value}
          </span>
          {r.goal && (
            <>
              {' '}
              <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-4)' }}>/ {r.goal}</span>
            </>
          )}
        </span>
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
        <span
          aria-hidden="true"
          style={{
            flex: 1,
            height: 6,
            borderRadius: 99,
            background: 'var(--border-hairline)',
            overflow: 'hidden',
            display: 'block',
          }}
        >
          {!missing && bar != null && (
            <span
              data-testid="row-bar"
              style={{
                display: 'block',
                height: '100%',
                width: `${bar}%`,
                borderRadius: 99,
                background: color,
                boxShadow: `0 0 8px ${color}`,
              }}
            />
          )}
        </span>
        {missing ? (
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-4)', whiteSpace: 'nowrap' }}>
            {r.missingText || ''}
          </span>
        ) : (
          <>
            <span
              data-testid="row-status"
              data-status={r.status || 'none'}
              style={{
                minWidth: 92,
                display: 'inline-flex',
                justifyContent: 'flex-end',
                alignItems: 'center',
                gap: 4,
                fontSize: 'var(--text-xs)',
                fontWeight: 700,
                whiteSpace: 'nowrap',
                color: stColor,
              }}
            >
              {Icon && <Icon size={12} strokeWidth={2.2} aria-hidden="true" />}
              {st}
            </span>
            {r.count != null && (
              <span
                className="tabular-nums"
                style={{
                  minWidth: 44,
                  textAlign: 'right',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 700,
                  color: 'var(--text-3)',
                  whiteSpace: 'nowrap',
                }}
              >
                {r.count}
              </span>
            )}
          </>
        )}
      </span>
    </>
  );
}

const footP = (color = 'var(--text-3)') => ({
  margin: 0,
  fontSize: 'var(--text-xs)',
  lineHeight: 'var(--leading-normal)',
  color,
});

export default function PeriodSummary({
  navigator,
  verdict,
  rows = [],
  days,
  averageLabel,
  countLabel = 'Dias no objetivo',
  selectedKey,
  onSelect,
  radioLabel = 'Escolher o que os gráficos mostram',
  summaryLine,
  delta,
  previous,
  notes = [],
  module = 'nutricao',
  ariaLabel = 'Resumo do período',
  children,
  className = '',
  style,
}) {
  const tone = toneOf(module);
  const btnRefs = useRef([]);
  const interactive = typeof onSelect === 'function';
  const leftHeader = averageLabel ?? (days != null ? avgHeader(days) : null);
  const selIndex = Math.max(0, rows.findIndex((r) => r.key === selectedKey));

  const onKey = (e, i) => {
    const n = rows.length;
    let j = null;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') j = (i + 1) % n;
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') j = (i - 1 + n) % n;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = n - 1;
    if (j == null) return;
    e.preventDefault();
    onSelect(rows[j].key);
    btnRefs.current[j]?.focus();
  };

  const noteList = (Array.isArray(notes) ? notes : [notes]).filter(Boolean);
  // `delta` aceita as props do DeltaVsPrevious (objeto) ou o elemento já feito.
  // Em ambos os casos sabe-se se há seta, para não ficar "… dias · " sem nada.
  let deltaNode = null;
  if (React.isValidElement(delta)) {
    deltaNode = delta.type === DeltaVsPrevious && !hasDelta(delta.props) ? null : delta;
  } else if (delta && typeof delta === 'object') {
    deltaNode = hasDelta(delta) ? <DeltaVsPrevious {...delta} /> : null;
  }
  const hasPrev = previous && (previous.text || (previous.actionLabel && previous.onAction));
  const hasFooter = summaryLine || deltaNode || hasPrev || noteList.length > 0;

  return (
    <section
      aria-label={ariaLabel}
      data-testid="period-summary"
      className={className}
      style={{
        borderRadius: 'var(--radius-2xl)',
        padding: '14px 16px',
        background: 'var(--surface-glass)',
        border: '1px solid var(--border-glass)',
        boxShadow: 'var(--shadow-card)',
        ...style,
      }}
    >
      {navigator}
      {verdict?.text && <VerdictLine text={verdict.text} tone={verdict.tone} style={{ marginTop: 12 }} />}

      {rows.length > 0 && (
        <>
          {(leftHeader || countLabel) && (
            <div
              data-testid="summary-columns"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 8,
                marginTop: 14,
                padding: '0 10px',
                fontSize: 'var(--text-xs)',
                color: 'var(--text-4)',
              }}
            >
              <span>{leftHeader}</span>
              <span>{countLabel}</span>
            </div>
          )}
          <div
            role={interactive ? 'radiogroup' : 'list'}
            aria-label={interactive ? radioLabel : undefined}
            style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}
          >
            {rows.map((r, i) => {
              const color = r.color || tone.color;
              const checked = interactive && i === selIndex;
              const rowStyle = {
                width: '100%',
                textAlign: 'left',
                minHeight: 48,
                borderRadius: 12,
                padding: '8px 10px',
                display: 'block',
                border: `1px solid ${checked ? mix(color, 45) : 'transparent'}`,
                background: checked ? 'var(--surface-raised)' : 'transparent',
              };
              const aria = rowAria(r, countLabel);
              if (!interactive) {
                return (
                  <div key={r.key} role="listitem" aria-label={aria} style={rowStyle} data-testid="summary-row">
                    <RowBody r={r} color={color} />
                  </div>
                );
              }
              return (
                <button
                  key={r.key}
                  ref={(el) => {
                    btnRefs.current[i] = el;
                  }}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  aria-label={aria}
                  tabIndex={checked ? 0 : -1}
                  onClick={() => onSelect(r.key)}
                  onKeyDown={(e) => onKey(e, i)}
                  data-testid="summary-row"
                  style={rowStyle}
                >
                  <RowBody r={r} color={color} />
                </button>
              );
            })}
          </div>
        </>
      )}

      {children}

      {hasFooter && (
        <div
          data-testid="summary-footer"
          style={{
            marginTop: 12,
            paddingTop: 12,
            borderTop: '1px solid var(--border-hairline)',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          {(summaryLine || deltaNode) && (
            <p style={footP()}>
              {summaryLine}
              {summaryLine && deltaNode ? ' · ' : null}
              {deltaNode}
            </p>
          )}
          {hasPrev && (
            <p style={footP('var(--text-4)')}>
              {previous.text}
              {previous.text && previous.actionLabel && previous.onAction ? ' · ' : null}
              {previous.actionLabel && previous.onAction && (
                /* "Ver setembro ›": botão de 44 px dentro de uma linha de 11 px —
                   a margem negativa mantém a linha do tamanho do mock-up. */
                <button
                  type="button"
                  onClick={previous.onAction}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    minHeight: 'var(--tap)',
                    margin: '-14px 0',
                    padding: 0,
                    border: 0,
                    background: 'transparent',
                    color: tone.color,
                    fontSize: 'inherit',
                    fontWeight: 700,
                  }}
                >
                  {previous.actionLabel}
                  <span aria-hidden="true">&nbsp;›</span>
                </button>
              )}
            </p>
          )}
          {noteList.map((n, i) => (
            <p key={i} style={footP('var(--text-4)')}>
              {n}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
