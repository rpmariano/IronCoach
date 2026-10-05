import React from 'react';
import { ChevronRight } from 'lucide-react';
import { plural, scopeOf, toneOf } from './periodText';

/**
 * MinDataNote — o lugar de um bloco que ainda não tem dados que o sustentem
 * (R6, 2026-10-04). Em vez de um gráfico com 1–2 pontos ou de um estado a
 * vermelho, o atleta lê quando é que o bloco aparece. Cartão tracejado (é a
 * ausência de conteúdo, não conteúdo), como no mock-up:
 *   "Comer para treinar aparece a partir de 7 dias fechados neste mês."
 *   "Calorias por dia da semana: preciso de pelo menos 4 registos de cada dia
 *    da semana para mostrar este padrão."   (este passa-se em `text`)
 *
 * Props:
 *   text        frase completa (ganha a tudo)
 *   what        nome do bloco ("Comer para treinar")
 *   min         mínimo (número)
 *   one / many  nome da unidade (default "dia fechado" / "dias fechados")
 *   kind        tipo de período → "neste mês"; ou `scope` para outro fim de frase
 *   onAction / actionLabel
 *               (2026-10-05, limiares M4) a saída para o período onde os dados
 *               JÁ estão ("Ver setembro ›", "Ver o ano ›"): sem ela a nota só
 *               dizia o que falta e o atleta achava que o separador estava
 *               vazio quando o Ano já tinha tudo. Botão de ≥44 px na cor do
 *               módulo (`module`), por baixo da nota dentro da nota.
 */
export function minDataText({ what, min, one = 'dia fechado', many = 'dias fechados', kind, scope }) {
  const onde = scope ?? (kind ? scopeOf(kind) : '');
  return `${what} aparece a partir de ${min} ${plural(min, one, many)}${onde ? ` ${onde}` : ''}.`;
}

export default function MinDataNote({
  text, what, min, one, many, kind, scope, onAction, actionLabel, module = 'nutricao', className = '', style,
}) {
  const msg = text || (what && min != null ? minDataText({ what, min, one, many, kind, scope }) : null);
  if (!msg) return null;
  const hasAction = typeof onAction === 'function' && !!actionLabel;
  const tone = toneOf(module);
  const box = {
    margin: 0,
    padding: '12px 14px',
    borderRadius: 'var(--radius-md)',
    border: '1px dashed var(--border-glass-strong)',
    fontSize: 'var(--text-xs)',
    lineHeight: 'var(--leading-normal)',
    color: 'var(--text-4)',
    ...style,
  };
  // Sem ação o DOM é o de sempre: um só <p> tracejado.
  if (!hasAction) {
    return <p data-testid="min-data-note" className={className} style={box}>{msg}</p>;
  }
  return (
    <div data-testid="min-data-note" className={className} style={box}>
      <p style={{ margin: 0 }}>{msg}</p>
      <button
        type="button"
        data-testid="min-data-action"
        onClick={onAction}
        style={{
          marginTop: 8,
          minHeight: 'var(--tap)',
          padding: '0 12px',
          borderRadius: 'var(--radius-sm)',
          background: tone.bg,
          border: `1px solid ${tone.bd}`,
          color: tone.color,
          fontSize: 'var(--text-sm)',
          fontWeight: 800,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          whiteSpace: 'nowrap',
        }}
      >
        {actionLabel}
        <ChevronRight size={14} strokeWidth={2.4} aria-hidden="true" />
      </button>
    </div>
  );
}
