import React from 'react';

/* O seletor plano do Design v2 (direção C, .seg): dois a quatro segmentos num painel, o ativo com o
   fundo do filete. Sem pílula animada, sem vidro, sem a cor do módulo. A mesma interface do SubNav
   (items, activeIndex, onChange) e o mesmo aria-current, para trocar um pelo outro. */
export default function SegmentedV2({ items, activeIndex, onChange, label, testId = 'subnav' }) {
  return (
    <div className="v2-seg" role="group" aria-label={label} data-testid={testId}>
      {items.map((item, i) => {
        const active = i === activeIndex;
        return (
          <button
            key={item.key ?? i}
            type="button"
            className={active ? 'is-on' : undefined}
            aria-current={active ? 'page' : undefined}
            onClick={() => onChange?.(i, item)}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
