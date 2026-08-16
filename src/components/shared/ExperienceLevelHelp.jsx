import React, { useState, useRef, useEffect } from 'react';
import { HelpCircle, X, Sparkles } from 'lucide-react';
import { EXPERIENCE_LEVELS, EXPERIENCE_TIEBREAK_HINT } from '../../utils/experience';
import PremiumModal from './PremiumModal';

/* Ajuda para escolher o nível de corredor, partilhada pelos dois sítios onde
   o atleta o declara — Perfil (nível geral) e Agenda de Provas (nível para
   aquela prova). Ver src/utils/experience.js para os critérios e a fonte.

   O componente embrulha o campo inteiro (etiqueta + select + descrição) em vez
   de se colar por baixo dele. A razão é de descoberta: o ícone tem de estar
   encostado à etiqueta, senão ninguém repara que a ajuda existe.

   Abre um Bottom Sheet. A escolha é comparativa ("onde é que eu encaixo?"),
   mostrando todos os níveis de uma vez.

   `variant` ajusta a cor da label (o Perfil é escuro, a Agenda é clara).
   O Bottom Sheet propriamente dito será sempre claro para manter a consistência UI. */
export default function ExperienceLevelHelp({ label, variant = 'light', children }) {
  const [isOpen, setIsOpen] = useState(false);
  const dark = variant === 'dark';
  const labelClass = dark
    ? 'text-[11px] text-slate-500' // O perfil dark usa texto slate-500 na label
    : 'text-[10px] text-slate-500';

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <label className={labelClass}>{label}</label>
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-expanded={isOpen}
          aria-label="O que significa cada nível?"
          title="O que significa cada nível?"
          className="inline-flex items-center justify-center rounded-full active:scale-90 transition"
          style={{
            color: 'var(--mod-coach-to)',
            background: 'color-mix(in srgb, var(--mod-coach-to) 15%, transparent)',
            width: 18,
            height: 18,
          }}
        >
          <HelpCircle size={12} />
        </button>
      </div>

      {children}

      <PremiumModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Nível de Corredor"
        subtitle="Onde é que eu encaixo?"
        icon={HelpCircle}
        theme="info"
        variant="bottom-sheet"
      >
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 bg-slate-50/30">
          
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 flex gap-2">
            <Sparkles className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-[11px] leading-relaxed text-amber-800">
              {EXPERIENCE_TIEBREAK_HINT}
            </p>
          </div>

          <div className="space-y-4">
            {EXPERIENCE_LEVELS.map(level => (
              <div key={level.key} className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
                <p className="text-[12px] font-bold text-slate-700 mb-1.5">{level.label}</p>
                <ul className="space-y-1">
                  {level.criteria.map((c, i) => (
                    <li key={i} className="text-[11px] leading-snug flex gap-1.5 text-slate-600">
                      <span aria-hidden="true" className="font-bold text-slate-400">·</span>
                      <span>{c}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <p className="text-[10px] leading-relaxed text-slate-400 text-center pb-2">
            Valores de referência para provas de 10 km a meia maratona. Com objetivo de maratona, o volume semanal sobe. O Coach ajusta.
          </p>
        </div>
      </PremiumModal>
    </div>
  );
}
