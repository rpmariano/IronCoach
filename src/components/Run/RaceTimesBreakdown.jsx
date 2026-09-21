import React from 'react';
import { describeDelta } from '../../utils/raceTimes';

/* "Como correu, ao lado do que pedias" — o bloco do hub depois da prova.

   O que havia eram dois quadrados: o objetivo (só o tempo) e a diferença
   face ao treino. Três problemas, todos relatados ou encontrados a
   confirmar o pedido do utilizador ("no caso de provas concluídas tem de
   ficar bem claro as diferenças de objetivos pessoais, de treino e a
   realidade (...) sempre com o tempo total e o pace"):

   1. O objetivo só aparecia se o campo de TEXTO livre estivesse preenchido.
      Uma prova criada pela Carol, que escreve as colunas numéricas, ficava
      sem objetivo à vista apesar de o ter gravado. Agora manda a coluna.
   2. A diferença face ao objetivo nunca era um número — vivia dentro de
      uma frase do balanço.
   3. Os ritmos do objetivo e da previsão desapareciam depois da prova; só
      sobrevivia o real.

   As linhas vêm prontas de utils/raceTimes.js (raceTimesBreakdown). */

const TOM = (delta) => (delta == null ? 'var(--text-2)' : delta <= 0 ? 'var(--ok)' : 'var(--warn)');

export default function RaceTimesBreakdown({ breakdown }) {
  if (!breakdown?.rows?.length) return null;
  const { real, rows } = breakdown;

  return (
    <div
      data-testid="race-times-breakdown"
      className="mt-4"
      style={{ borderRadius: 16, background: 'rgba(255,255,255,.04)', border: '1px solid var(--border-glass)', padding: '12px 14px 14px' }}
    >
      <div className="text-[11px] font-extrabold uppercase" style={{ color: 'var(--text-4)', letterSpacing: '.06em' }}>
        Ao lado do que pedias
      </div>

      {/* O real primeiro, que é o facto; o resto compara-se com ele. */}
      <div className="flex items-baseline gap-2 mt-2">
        <span className="text-[11px] font-bold" style={{ color: 'var(--text-4)', minWidth: 96 }}>O que fizeste</span>
        <span className="text-[15px] font-black" style={{ color: 'var(--race)' }}>{real.timeLabel}</span>
        {real.paceLabel && <span className="text-[12px] font-bold" style={{ color: 'var(--text-3)' }}>{real.paceLabel}</span>}
      </div>

      <div className="flex flex-col gap-1.5 mt-2.5 pt-2.5" style={{ borderTop: '1px solid var(--border-glass)' }}>
        {rows.map((r) => (
          <div key={r.key} data-testid={`race-times-${r.key}`} className="flex items-baseline gap-2 flex-wrap">
            <span className="text-[11px] font-bold" style={{ color: 'var(--text-4)', minWidth: 96 }}>{r.label}</span>
            <span className="text-[13.5px] font-extrabold" style={{ color: 'var(--text-1)' }}>{r.timeLabel}</span>
            {r.paceLabel && <span className="text-[12px]" style={{ color: 'var(--text-3)' }}>{r.paceLabel}</span>}
            <span className="text-[12px] font-extrabold ml-auto" style={{ color: TOM(r.delta) }}>
              {describeDelta(r.delta)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
