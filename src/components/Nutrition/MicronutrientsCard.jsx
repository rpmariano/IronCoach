import React, { useState } from 'react';
import { ChevronDown, FlaskConical } from 'lucide-react';
import { MICROS, microCoverage } from '../../utils/nutrition';
import { fmtNumber } from '../../utils/verdicts/shared';

/**
 * Micronutrientes (fase 4 da Evolução, 2026-10-04 — erro N2). Antes, em
 * Trimestre/6 Meses/Ano, o bloco mostrava a SOMA do mês civil corrente (1–4
 * out) com a chave interna no título ("· 6meses"). Agora, nos períodos: a
 * média por dia com refeições dos dias fechados do período certo, com o
 * período e o número de dias por baixo do título; na vista Dia, o total desse
 * dia.
 *
 * Cobertura (D6, 2026-10-05): desde que a analyze-meal grava null quando o
 * alimento não traz o valor, cada linha diz em quantos alimentos o valor foi
 * dado ("Ferro pelo menos 13 mg/dia · dado em 54% dos alimentos", mock-up
 * MesSetembro) — mas só com `coverageKnown` (todos os alimentos do período
 * gravados depois da mudança, micronutrientAverages). Com algum anterior, os
 * zeros são ambíguos e fica "São mínimos: alimentos sem esta informação
 * contam como zero.", como antes. Enquanto MICROS_NULL_SINCE for null (deploy
 * da analyze-meal por fazer) coverageKnown é sempre false (revisão 2026-10-05).
 */

/* < 10 com uma casa ("3,4 mg"), o resto inteiro com espaço nos milhares. */
const fmtMicro = (v) => fmtNumber(v, Math.abs(v) < 10 && Math.round(v) !== v ? 1 : 0);

export default function MicronutrientsCard({
  title, subtitle, values, perDay = true, emptyText = 'Sem refeições registadas.', coverage = null, coverageKnown = false,
}) {
  const [open, setOpen] = useState(false);
  // A cobertura só se mostra quando é verdadeira (ver acima).
  const cov = coverageKnown && coverage ? coverage : null;
  const anyPartial = !!cov && MICROS.some((m) => microCoverage(cov[m.key])?.atLeast);
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
              {MICROS.map((m) => {
                const c = cov ? microCoverage(cov[m.key]) : null;
                // Number(...) || 0: um null/NaN nunca chega ao ecrã como "NaN".
                const v = Number(values[m.key]) || 0;
                return (
                  <div key={m.key} data-testid={`micro-${m.key}`} style={{ padding: '9px 0', borderBottom: '1px solid var(--border-hairline)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>{m.label}</span>
                      {c?.none ? (
                        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-4)' }}>sem dados</span>
                      ) : (
                        <span className="tabular-nums" style={{ fontSize: 'var(--text-xs)', fontWeight: 800, color: 'var(--text-1)' }}>
                          {/* "pelo menos 0" é verdade mas não diz nada (revisão 2026-10-05):
                              com soma 0 o número fica sozinho e a linha de baixo diz que
                              os alimentos com o valor deram todos 0. */}
                          {c?.atLeast && v !== 0 && <span style={{ fontWeight: 700, color: 'var(--text-4)' }}>pelo menos </span>}
                          {fmtMicro(v)}{' '}
                          <span style={{ fontWeight: 700, color: 'var(--text-4)' }}>{perDay ? `${m.unit}/dia` : m.unit}</span>
                        </span>
                      )}
                    </div>
                    {c && (
                      <div data-testid={`micro-${m.key}-coverage`} style={{ marginTop: 2, fontSize: 'var(--text-xs)', color: 'var(--text-4)' }}>
                        {c.atLeast && v === 0 ? `${c.text}, sempre com 0` : c.text}
                      </div>
                    )}
                    {m.note && <div style={{ marginTop: 4, fontSize: 'var(--text-xs)', lineHeight: 1.5, color: 'var(--text-4)' }}>{m.note}</div>}
                  </div>
                );
              })}
              {!cov && (
                <p style={{ margin: '10px 0 0', fontSize: 'var(--text-xs)', lineHeight: 1.5, color: 'var(--text-4)' }}>
                  São mínimos: alimentos sem esta informação contam como zero.
                </p>
              )}
              {anyPartial && (
                <p style={{ margin: '10px 0 0', fontSize: 'var(--text-xs)', lineHeight: 1.5, color: 'var(--text-4)' }}>
                  «Pelo menos»: os alimentos sem esta informação ficam de fora da soma.
                </p>
              )}
            </>
          ) : (
            <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-4)' }}>{emptyText}</p>
          )}
        </div>
      )}
    </section>
  );
}
