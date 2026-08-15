import React from 'react';
import { useAppStore } from '../../store';
import { Utensils, Dumbbell, User } from 'lucide-react';
import RunIcon from '../shared/RunIcon';

import Run from '../Run/Run';
import Gym from '../Gym/Gym';
import Nutrition from '../Nutrition/Nutrition';
import Body from '../Body/Body';

// NOTA: um separador "Holística" (CrossAnalyticsDashboard + CoachInsight*
// via utils/biEngine) chegou a ser ligado aqui num commit anterior, mas os
// ficheiros de que depende nunca foram adicionados ao git — partiam o build
// de produção (UNRESOLVED_IMPORT). Removido até essa funcionalidade estar
// completa e commitada a sério. Ver git log de src/components/Dashboard/
// Dashboard.jsx à volta de "sliding pill animation" para o histórico.

export default function Dashboard({ activeModule }) {
  const { setActiveTab } = useAppStore();

  const TABS = [
    { key: 'corrida', label: 'Corrida', icon: <RunIcon className="w-3.5 h-3.5" />, color: 'var(--mod-corrida-to, #c026d3)' },
    { key: 'ginasio', label: 'Ginásio', icon: <Dumbbell size={14} />, color: 'var(--mod-ginasio-to, #facc15)' },
    { key: 'nutricao', label: 'Nutrição', icon: <Utensils size={14} />, color: 'var(--mod-nutricao-to, #059669)' },
    { key: 'corpo', label: 'Corpo', icon: <User size={14} />, color: 'var(--mod-corpo-to, #e11d48)' },
  ];

  return (
    <div className="space-y-4 fade-in pb-8">
      {/* Subnav com estética clara da Homepage (Glassmorphism) */}
      <div className="relative flex gap-2 p-1.5 bg-white/40 backdrop-blur-[20px] border border-white/80 rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.05),inset_0_2px_10px_rgba(255,255,255,0.6)] mb-4">
        {/* Sliding indicator */}
        <div 
          className="absolute top-[6px] bottom-[6px] rounded-xl transition-all duration-300 ease-in-out shadow-md"
          style={{
            // Calculado a partir de TABS.length em vez de fixo — um separador
            // a mais/a menos não desalinha o indicador outra vez.
            width: `calc((100% - ${(TABS.length - 1) * 8}px) / ${TABS.length})`,
            transform: `translateX(calc(${TABS.findIndex(t => t.key === activeModule)} * 100% + ${TABS.findIndex(t => t.key === activeModule) * 8}px))`,
            background: TABS.find(t => t.key === activeModule)?.color || 'var(--accent)'
          }}
        />
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`relative z-10 flex-1 flex flex-col items-center justify-center gap-1 py-1.5 text-xs font-semibold rounded-xl transition-colors duration-300 ${
              activeModule === t.key ? 'text-white' : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
            }`}
          >
            {t.icon}
            <span className="text-[10px]">{t.label}</span>
          </button>
        ))}
      </div>

      {/* Renderização do módulo ativo */}
      {activeModule === 'corrida' && <Run />}
      {activeModule === 'ginasio' && <Gym />}
      {activeModule === 'nutricao' && <Nutrition />}
      {activeModule === 'corpo' && <Body />}
    </div>
  );
}
