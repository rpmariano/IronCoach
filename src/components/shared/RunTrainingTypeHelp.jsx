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

// fieldId: id do campo embrulhado, para a etiqueta visual ser tambem
// programatica (auditoria a11y) — quem usa passa o mesmo id ao <select>.
export default function RunTrainingTypeHelp({ label, fieldId, children }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <label className="text-[11px] text-[var(--text-3)]" htmlFor={fieldId}>{label}</label>
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-expanded={isOpen}
          aria-label="O que significa cada tipo de treino?"
          title="O que significa cada tipo de treino?"
          // tap-area-44: o botao continua a desenhar-se com 18px e ganha,
          // por cima, uma area de toque invisivel de 44 (ver globals.css).
          className="tap-area-44 inline-flex items-center justify-center rounded-full active:scale-90 transition"
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
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6 bg-[var(--surface-soft)]">
          {RUN_TRAINING_TYPES_DOCS.map((group, idx) => (
            <div key={idx}>
              <p className="text-xs font-bold text-[var(--text-2)] uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[var(--text-3)]" />
                {group.group}
              </p>
              <div className="space-y-2">
                {group.items.map((item, i) => (
                  <div key={i} className="bg-[var(--surface-faint)] border border-[var(--border-glass)] rounded-xl p-3 shadow-sm flex flex-col gap-1">
                    <span className="text-[13px] font-semibold text-[var(--text-1)]">{item.name}</span>
                    <span className="text-[11px] leading-snug text-[var(--text-3)]">{item.desc}</span>
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
