import React from 'react';
import { CalendarCheck } from 'lucide-react';

/* "Do plano" — o treino que a Carol marcou para este dia, no topo do registo
   (registo unificado, F3 — specs/plano-registo-plano-coach.md §3):
     · 0 itens pendentes → não se mostra nada (quem usa não o renderiza);
     · 1 → "Usar o plano" ou "Treino livre";
     · vários → escolhe-se qual;
   Escolhido o plano, fica uma linha com "Mudar"; mudar a data desfaz a escolha. "Treino livre" deixa os
   campos vazios — e, ao gravar, o treino do dia é riscado na mesma, como
   automático. Só apresentação: quem o usa decide o que cada escolha faz.
   `labels` troca os textos (a Refeição fala de sugestões, não de treinos);
   sem ele, ficam os do treino. */
const TRAINING_LABELS = {
  region: 'Treino do plano',
  single: (day) => `Tens este treino marcado para ${day}.`,
  multi: (day) => `Tens estes treinos marcados para ${day} — qual vais registar?`,
  use: 'Usar o plano',
  free: 'Treino livre',
  chosen: 'A usar o plano',
  freeMode: (day, countsAs) => `Treino livre — conto-o como o treino do plano ${day === 'hoje' ? 'de hoje' : `de ${day}`}${countsAs ? ` («${countsAs}»)` : ''}.`,
};

export default function PlanPrefillBanner({ items, describe, chosenId, onUse, onFree, onChange, mode = null, dayLabel = 'hoje', freeCountsAs = null, accent = 'var(--mod-ginasio-to)', labels = null }) {
  const L = { ...TRAINING_LABELS, ...(labels || {}) };
  const chosen = chosenId ? items.find(i => i.id === chosenId) || null : null;
  const tint = `color-mix(in srgb, ${accent} 10%, transparent)`;
  const border = `color-mix(in srgb, ${accent} 40%, transparent)`;
  const btn = 'min-h-[44px] px-3 rounded-xl text-[12px] font-bold border transition active:scale-[0.99]';

  return (
    <div className="mb-4 rounded-xl border p-3" style={{ background: tint, borderColor: border }} role="region" aria-label={L.region}>
      <div className="flex items-center gap-2 mb-2">
        <CalendarCheck size={15} style={{ color: accent }} />
        <p className="text-[12px] font-bold" style={{ color: accent }}>Do plano</p>
      </div>

      {chosen ? (
        <div className="flex items-start justify-between gap-2">
          <p className="text-[12px] text-[var(--text-2)]">{L.chosen}: {describe(chosen)}</p>
          {onChange && (
            <button type="button" onClick={onChange} className="tap-h-44 shrink-0 text-[11px] font-bold underline" style={{ color: accent }}>Mudar</button>
          )}
        </div>
      ) : mode === 'livre' ? (
        <div className="flex items-start justify-between gap-2">
          <p className="text-[12px] text-[var(--text-2)]">{L.freeMode(dayLabel, freeCountsAs)}</p>
          {onChange && <button type="button" onClick={onChange} className="tap-h-44 shrink-0 text-[11px] font-bold underline" style={{ color: accent }}>Mudar</button>}
        </div>
      ) : (
        <>
          <p className="text-[12px] text-[var(--text-2)] mb-2">
            {items.length === 1 ? L.single(dayLabel) : L.multi(dayLabel)}
          </p>
          <ul className="space-y-2">
            {items.map(item => (
              <li key={item.id} className="flex items-center gap-2">
                <span className="flex-1 min-w-0 text-[12px] text-[var(--text-1)]">{describe(item)}</span>
                <button type="button" onClick={() => onUse(item)} aria-label={`${L.use}: ${describe(item)}`} className={`${btn} shrink-0`} style={{ borderColor: border, color: accent, background: tint }}>
                  {L.use}
                </button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={onFree} className={`${btn} mt-2 w-full text-[var(--text-3)] border-[var(--border-glass)]`}>
            {L.free}
          </button>
        </>
      )}
    </div>
  );
}
