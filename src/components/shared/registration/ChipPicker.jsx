import React, { useState } from 'react';
import Chip from '../Chip';

const VISIBLE_BY_DEFAULT = 6;

/* Um grupo de chips de escolha múltipla, com "+N mais" quando a lista é
   longa. Mostra sempre os escolhidos, mesmo os que não estão na lista (texto
   livre vindo da Carol ou de um registo antigo). Extraído de
   Gym/GymRegistration.jsx (registo unificado, F1-pré) para os outros
   módulos o poderem usar. */
export default function ChipPicker({ id, label, hint, options, selected, onToggle, variant = 'gym' }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? options : options.filter((c, i) => i < VISIBLE_BY_DEFAULT || selected.includes(c));
  const hiddenCount = options.length - visible.length;
  return (
    <div className="mb-4">
      <p id={`${id}-label`} className="text-[11px] text-[var(--text-3)] mb-1.5">{label}</p>
      <div
        role="group"
        aria-labelledby={`${id}-label`}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="flex flex-wrap gap-1.5 mb-2"
      >
        {visible.map(c => (
          <Chip key={c} active={selected.includes(c)} aria-pressed={selected.includes(c)} variant={variant} onClick={() => onToggle(c)} type="button">
            {c}
          </Chip>
        ))}
        {hiddenCount > 0 && !expanded && (
          <button
            onClick={() => setExpanded(true)}
            type="button"
            className="tap-h-44 rounded-full px-3.5 py-1.5 text-[11px] font-medium border border-dashed border-[var(--border-glass-strong)] text-[var(--text-3)]"
          >
            +{hiddenCount} mais
          </button>
        )}
        {expanded && options.length > VISIBLE_BY_DEFAULT && (
          <button
            onClick={() => setExpanded(false)}
            type="button"
            className="tap-h-44 rounded-full px-3.5 py-1.5 text-[11px] font-medium border border-dashed border-[var(--border-glass-strong)] text-[var(--text-3)]"
          >
            Mostrar menos
          </button>
        )}
        {selected.filter(c => !options.includes(c)).map(c => (
          <Chip key={c} active aria-pressed variant={variant} onClick={() => onToggle(c)} type="button">
            {c}
          </Chip>
        ))}
      </div>
      {hint && <p id={`${id}-hint`} className="text-[11px] text-[var(--text-muted)] -mt-1">{hint}</p>}
    </div>
  );
}
