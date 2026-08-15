import React, { useState } from 'react';
import { HelpCircle, X } from 'lucide-react';

const RUN_TRAINING_TYPES_DOCS = [
  {
    group: 'Corrida solta (Base)',
    items: [
      { name: 'Contínuo', desc: 'A clássica corrida leve de base (Easy Run).' },
      { name: 'Longo', desc: 'Foco na adaptação e resistência para provas maiores.' },
      { name: 'Recuperação', desc: 'Curto e lento, para circulação sanguínea após treinos duros.' }
    ]
  },
  {
    group: 'Estruturado (Qualidade)',
    items: [
      { name: 'Ritmo (Tempo)', desc: 'Treino no limiar anaeróbico (T-Pace). Rápido mas sustentável.' },
      { name: 'Fartlek', desc: 'Variações de velocidade instintivas (brincar com o ritmo).' },
      { name: 'Intervalos', desc: 'Séries curtas e intensas (VO2 Max) com pausas para recuperar.' }
    ]
  },
  {
    group: 'Trilho',
    items: [
      { name: 'Subidas', desc: 'Repetições em subida para força pura e tolerância láctica.' },
      { name: 'Trail', desc: 'Corrida contínua na montanha/trilho (Endurance base).' },
      { name: 'Técnico', desc: 'Foco na agilidade, footwork e leitura do terreno acidentado.' }
    ]
  }
];

export default function RunTrainingTypeHelp({ label, children }) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <label className="text-[12px] text-slate-500 block">{label}</label>
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          aria-label={open ? 'Fechar ajuda sobre tipos de treino' : 'O que significa cada tipo de treino?'}
          title="O que significa cada tipo de treino?"
          className="inline-flex items-center justify-center rounded-full active:scale-90 transition"
          style={{
            color: 'var(--mod-corrida-to)',
            background: 'color-mix(in srgb, var(--mod-corrida-to) 15%, transparent)',
            width: 18,
            height: 18,
          }}
        >
          <HelpCircle size={12} />
        </button>
      </div>

      {children}

      {open && (
        <div className="rounded-xl p-3 mt-2 space-y-3" style={{ background: 'rgba(248,250,252,0.9)', border: '1px solid var(--brd-800)' }}>
          <div className="flex items-start justify-between gap-2">
            <p className="text-[10px] leading-relaxed text-slate-600 mb-1 font-medium">
              Tipologia baseada na fisiologia do desporto (Fórmula Jack Daniels / Regra 80/20):
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fechar ajuda"
              className="tap-44 shrink-0 -mt-2 -mr-1 flex items-center justify-center text-slate-400"
            >
              <X size={14} />
            </button>
          </div>

          {RUN_TRAINING_TYPES_DOCS.map((group, idx) => (
            <div key={idx}>
              <p className="text-[11px] font-bold text-slate-700">{group.group}</p>
              <ul className="mt-0.5 space-y-1">
                {group.items.map((item, i) => (
                  <li key={i} className="text-[10px] leading-snug flex gap-1.5 text-slate-600">
                    <span aria-hidden="true" className="font-bold text-slate-400">·</span>
                    <span><strong className="font-semibold text-slate-700">{item.name}:</strong> {item.desc}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
