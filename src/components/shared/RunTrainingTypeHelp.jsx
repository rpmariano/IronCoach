import React, { useState, useRef, useEffect } from 'react';
import { HelpCircle, X, Sparkles } from 'lucide-react';
import PremiumModal from './PremiumModal';

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
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <label className="text-[11px] text-slate-500">{label}</label>
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-expanded={isOpen}
          aria-label="O que significa cada tipo de treino?"
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

      <PremiumModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Tipos de Treino"
        subtitle="Doutrina Fisiológica (Regra 80/20)"
        icon={HelpCircle}
        theme="run"
        variant="bottom-sheet"
      >
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6 bg-slate-50/30">
          {RUN_TRAINING_TYPES_DOCS.map((group, idx) => (
            <div key={idx}>
              <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-slate-400" />
                {group.group}
              </p>
              <div className="space-y-2">
                {group.items.map((item, i) => (
                  <div key={i} className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm flex flex-col gap-1">
                    <span className="text-[13px] font-semibold text-slate-800">{item.name}</span>
                    <span className="text-[11px] leading-snug text-slate-500">{item.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </PremiumModal>
    </div>
  );
}
