import React, { useState } from 'react';
import { ChevronDown, FlaskConical } from 'lucide-react';
import { MICROS } from '../../utils/nutrition';
import { fmtNumber } from '../../utils/verdicts/shared';

/**
 * Micronutrientes (fase 4 da Evolução, 2026-10-04 — erro N2). Antes, em
 * Trimestre/6 Meses/Ano, o bloco mostrava a SOMA do mês civil corrente (1–4
 * out) com a chave interna no título ("· 6meses"). Agora, nos períodos: a
 * média por dia com refeições dos dias fechados do período certo, com o
 * período e o número de dias por baixo do título; na vista Dia, o total desse
 * dia. "São mínimos": a análise grava 0 quando o alimento não traz o valor
 * (a cobertura "dado em X% dos alimentos" fica para quando gravar null — D6).
 */

/* < 10 com uma casa ("3,4 mg"), o resto inteiro com espaço nos milhares. */
const fmtMicro = (v) => fmtNumber(v, Math.abs(v) < 10 && Math.round(v) !== v ? 1 : 0);

export default function MicronutrientsCard({ title, subtitle, values, perDay = true, emptyText = 'Sem refeições registadas.' }) {
  const [open, setOpen] = useState(false);
  return (
    <section
      data-testid="micros-card"
      style={{
        borderRadius: 20,
        background: 'var(--surface-glass)',
        border: '1px solid var(--border-glass)',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%', minHeight: 'var(--tap)', padding: '14px 16px', border: 0, background: 'transparent',
          display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', color: 'inherit',
        }}
      >
        <FlaskConical size={14} color="var(--nutrition)" aria-hidden="true" />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span data-testid="micros-title" style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-2)' }}>
            {title}
          </span>
          {subtitle && (
            <span data-testid="micros-subtitle" style={{ display: 'block', marginTop: 2, fontSize: 'var(--text-xs)', color: 'var(--text-4)' }}>
              {subtitle}
            </span>
          )}
        </span>
        <ChevronDown size={16} color="var(--text-3)" aria-hidden="true" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform var(--dur-tap) var(--ease-out)' }} />
      </button>
      {open && (
        <div style={{ padding: '0 16px 16px' }}>
          {values ? (
            <>
              {MICROS.map((m) => (
                <div key={m.key} data-testid={`micro-${m.key}`} style={{ padding: '9px 0', borderBottom: '1px solid var(--border-hairline)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>{m.label}</span>
                    <span className="tabular-nums" style={{ fontSize: 'var(--text-xs)', fontWeight: 800, color: 'var(--text-1)' }}>
                      {fmtMicro(values[m.key] || 0)}{' '}
                      <span style={{ fontWeight: 700, color: 'var(--text-4)' }}>{perDay ? `${m.unit}/dia` : m.unit}</span>
                    </span>
                  </div>
                  {m.note && <div style={{ marginTop: 4, fontSize: 'var(--text-xs)', lineHeight: 1.5, color: 'var(--text-4)' }}>{m.note}</div>}
                </div>
              ))}
              <p style={{ margin: '10px 0 0', fontSize: 'var(--text-xs)', lineHeight: 1.5, color: 'var(--text-4)' }}>
                São mínimos: alimentos sem esta informação contam como zero.
              </p>
            </>
          ) : (
            <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-4)' }}>{emptyText}</p>
          )}
        </div>
      )}
    </section>
  );
}
