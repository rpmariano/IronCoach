import React from 'react';
import { plural, scopeOf } from './periodText';

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
 */
export function minDataText({ what, min, one = 'dia fechado', many = 'dias fechados', kind, scope }) {
  const onde = scope ?? (kind ? scopeOf(kind) : '');
  return `${what} aparece a partir de ${min} ${plural(min, one, many)}${onde ? ` ${onde}` : ''}.`;
}

export default function MinDataNote({ text, what, min, one, many, kind, scope, className = '', style }) {
  const msg = text || (what && min != null ? minDataText({ what, min, one, many, kind, scope }) : null);
  if (!msg) return null;
  return (
    <p
      data-testid="min-data-note"
      className={className}
      style={{
        margin: 0,
        padding: '12px 14px',
        borderRadius: 'var(--radius-md)',
        border: '1px dashed var(--border-glass-strong)',
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
