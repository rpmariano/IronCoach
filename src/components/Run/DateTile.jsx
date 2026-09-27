import React from 'react';
import { format, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';

/* O azulejo da data das listas de provas ("24 / JAN"). Vivia dentro de
   RaceListCard.jsx; saiu para aqui na Fase 3 do Troféu (2026-09-27) para o
   bloco do Troféu (CupListBlock.jsx) o usar sem um import circular com a
   lista. RaceListCard continua a exportá-lo, para quem já o importava de lá.
   O HTML é o mesmo de sempre. */

function dayNumber(dateIso) {
  try { return format(parseISO(dateIso), 'd'); } catch { return ''; }
}

function monthShort(dateIso) {
  try { return format(parseISO(dateIso), 'MMM', { locale: pt }).replace('.', ''); } catch { return ''; }
}

export function DateTile({ date, muted }) {
  return (
    <span
      aria-hidden="true"
      className="flex flex-col items-center justify-center shrink-0"
      style={{
        width: 44, height: 44, borderRadius: 12,
        background: muted ? 'var(--surface-glass)' : 'rgba(255,255,255,.06)',
        border: `1px solid ${muted ? 'var(--border-glass)' : 'var(--border-glass-strong)'}`,
        color: muted ? 'var(--text-3)' : 'var(--text-2)',
      }}
    >
      <span className="text-[15px] font-black leading-none" style={{ fontVariantNumeric: 'tabular-nums' }}>{dayNumber(date)}</span>
      <span className="text-[11px] font-extrabold uppercase leading-none mt-[3px]">{monthShort(date)}</span>
    </span>
  );
}

export default DateTile;
