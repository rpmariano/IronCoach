import React from 'react';
import { Sunrise, Apple, Salad, Cherry, UtensilsCrossed, Coffee, Utensils } from 'lucide-react';
import { Sheet } from '../shared/Sheet';
import { mealsForDay, formatWeekday } from '../../utils/homeModels';

/* A persiana das 6 refeições (mock "Persiana · as 6 refeições"): eyebrow
   "Sugestão alimentar · domingo", total em kcal, lista com ícone por
   refeição — as principais em ciano, os lanches apagados — e o racional
   da Carol no fim. */
const ICON = { 'pequeno-almoco': Sunrise, 'lanche-manha': Apple, almoco: Salad, lanche: Cherry, jantar: UtensilsCrossed, ceia: Coffee };
const MAIN = new Set(['pequeno-almoco', 'almoco', 'jantar']);

export default function MealSheet({ day, onClose }) {
  const model = mealsForDay(day?.items);
  const weekday = formatWeekday(day?.dateISO);
  return (
    <Sheet
      eyebrow={`Sugestão alimentar · ${weekday}`}
      title={model?.kcal ? (
        <span className="flex items-baseline gap-1.5">
          <span className="text-[26px] font-black leading-none" style={{ color: 'var(--text-1)' }}>~{model.kcal}</span>
          <span className="text-[12px] font-bold" style={{ color: 'var(--text-4)' }}>kcal</span>
        </span>
      ) : (
        <span className="text-[14.5px] font-extrabold" style={{ color: 'var(--text-1)' }}>O que a Carol sugere</span>
      )}
      onClose={onClose}
      testId="meal-sheet"
    >
      {!model ? (
        <p className="text-[12.5px] py-3" style={{ color: 'var(--text-4)' }}>Sem sugestão para este dia.</p>
      ) : (
        <>
          {model.meals.map((m, i) => {
            const Icon = ICON[m.tipo] || Utensils;
            const main = MAIN.has(m.tipo);
            const last = i === model.meals.length - 1;
            return (
              <div key={`${m.tipo || m.label}-${i}`} className="flex items-start gap-[11px] py-[11px]" style={{ borderBottom: last ? 'none' : '1px solid rgba(255,255,255,.08)' }}>
                <span className="flex shrink-0 mt-px" style={{ width: 22, color: main ? 'var(--run)' : 'var(--text-muted)' }}><Icon size={18} /></span>
                <div className="flex-1 min-w-0">
                  <div className="text-[12.5px] font-extrabold" style={{ color: 'var(--text-1)' }}>{m.label}</div>
                  <p className="text-[12.5px] leading-[1.5] mt-[3px]" style={{ color: '#b9c3d1' }}>{m.texto}</p>
                </div>
              </div>
            );
          })}
          {model.racional && (
            <div className="mt-2 pl-3" style={{ borderLeft: '2px solid rgba(46,224,255,.4)' }}>
              <div className="text-[11px] font-extrabold uppercase" style={{ color: 'var(--text-muted)', letterSpacing: '.09em' }}>Racional</div>
              <p className="text-[12.5px] leading-[1.5] mt-[5px]" style={{ color: 'var(--text-3)' }}>{model.racional}</p>
            </div>
          )}
          <p className="text-[11px] leading-[1.5] mt-4" style={{ color: 'var(--text-muted)' }}>
            Sugestão, não prescrição. Ajusta ao que te cai bem; em dúvida clínica, fala com um nutricionista.
          </p>
        </>
      )}
    </Sheet>
  );
}
