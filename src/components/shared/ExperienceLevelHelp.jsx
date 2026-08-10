import React, { useState } from 'react';
import { HelpCircle, X } from 'lucide-react';
import { EXPERIENCE_LEVELS, EXPERIENCE_TIEBREAK_HINT } from '../../utils/experience';

/* Ajuda para escolher o nível de corredor, partilhada pelos dois sítios onde
   o atleta o declara — Perfil (nível geral) e Agenda de Provas (nível para
   aquela prova). Ver src/utils/experience.js para os critérios e a fonte.

   O componente embrulha o campo inteiro (etiqueta + select + descrição) em vez
   de se colar por baixo dele. A razão é de descoberta: o ícone tem de estar
   encostado à etiqueta, senão ninguém repara que a ajuda existe — foi
   exatamente o que aconteceu com a primeira versão, que era só um link de
   texto por baixo da descrição.

   Abre um painel em vez de um tooltip de hover: isto é uma PWA, usada
   sobretudo em telemóvel, onde hover não existe. O painel mostra os QUATRO
   níveis ao mesmo tempo, de propósito — a escolha é comparativa ("onde é que
   eu encaixo?"), não uma consulta isolada.

   `variant` só ajusta as cores ao ecrã onde vive: o Perfil é escuro
   (neutral-900), a Agenda é clara. */
export default function ExperienceLevelHelp({ label, variant = 'light', children }) {
  const [open, setOpen] = useState(false);
  const dark = variant === 'dark';

  const panelStyle = dark
    ? { background: 'var(--surf-950)', border: '1px solid var(--brd-800)' }
    : { background: 'rgba(248,250,252,0.9)', border: '1px solid var(--brd-800)' };
  const titleColor = dark ? '#fff' : 'var(--text-main)';
  const bodyColor = dark ? 'var(--brd-700)' : 'var(--green)';
  const labelClass = dark
    ? 'text-[11px] text-slate-500'
    : 'text-[10px] text-slate-500';

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <label className={labelClass}>{label}</label>
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          aria-label={open ? 'Fechar ajuda sobre os níveis' : 'O que significa cada nível?'}
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

      {open && (
        <div className="rounded-xl p-3 mt-2 space-y-2.5" style={panelStyle}>
          <div className="flex items-start justify-between gap-2">
            <p className="text-[10px] leading-relaxed" style={{ color: bodyColor }}>
              {EXPERIENCE_TIEBREAK_HINT}
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fechar ajuda sobre os níveis"
              className="tap-44 shrink-0 -mt-2 -mr-1 flex items-center justify-center"
              style={{ color: bodyColor }}
            >
              <X size={14} />
            </button>
          </div>

          {EXPERIENCE_LEVELS.map(level => (
            <div key={level.key}>
              <p className="text-[11px] font-bold" style={{ color: titleColor }}>{level.label}</p>
              <ul className="mt-0.5 space-y-0.5">
                {level.criteria.map((c, i) => (
                  <li key={i} className="text-[10px] leading-snug flex gap-1.5" style={{ color: bodyColor }}>
                    <span aria-hidden="true">·</span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <p className="text-[9px] leading-relaxed pt-1" style={{ color: bodyColor, opacity: 0.75 }}>
            Valores de referência para provas de 10 km a meia maratona. Com objetivo
            de maratona, o volume semanal sobe. O Coach ajusta.
          </p>
        </div>
      )}
    </div>
  );
}
