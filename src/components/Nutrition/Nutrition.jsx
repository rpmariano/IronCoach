import React, { useState, useEffect } from 'react';
import NutritionDashboard from './NutritionDashboard';
import NutritionCalendar from './NutritionCalendar';
import WaterTracker from './WaterTracker';
import MealRegistration from './MealRegistration';
import { LayoutDashboard, CalendarDays, Droplet } from 'lucide-react';
import { useAppStore } from '../../store';

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'calendario', label: 'Calendário', icon: CalendarDays },
  { id: 'agua', label: 'Água', icon: Droplet },
];

export default function Nutrition() {
  const [activeSubTab, setActiveSubTab] = useState('dashboard');
  const { openCreationMode, setOpenCreationMode } = useAppStore();

  useEffect(() => {
    if (openCreationMode === 'meal') {
      setActiveSubTab('registar');
      setOpenCreationMode(null);
    }
  }, [openCreationMode, setOpenCreationMode]);

  const tabIndex = TABS.findIndex(t => t.id === activeSubTab);

  return (
    <div className="flex flex-col fade-in">
      {/* Seg-nav deslizante (fiel ao legado) */}
      {activeSubTab !== 'registar' && (
        <div
          className={`seg-nav at-${Math.max(tabIndex + 1, 1)} relative flex rounded-full p-0.5 mb-5`}
          style={{ background: 'var(--surf-800)', transition: 'opacity 0.2s, height 0.2s, margin 0.2s' }}
        >
          {/* Thumb deslizante */}
          <div
            className="seg-thumb absolute top-0.5 bottom-0.5 rounded-full"
            style={{
              width: `${100 / TABS.length}%`,
              background: 'var(--mod-nutricao-to)',
              left: 0,
            }}
          />
          {TABS.map(tab => {
            const Icon = tab.icon;
            const active = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                data-tab={tab.id}
                onClick={() => setActiveSubTab(tab.id)}
                className={`seg-btn relative z-10 flex-1 flex items-center justify-center gap-1.5 py-2 text-[13px] font-semibold rounded-full transition-colors ${active ? 'active text-white' : 'text-slate-500'}`}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Conteúdo da tab */}
      <div className="flex-1 min-h-0">
        {activeSubTab === 'dashboard' && <NutritionDashboard />}
        {activeSubTab === 'calendario' && <NutritionCalendar onRegisterClick={() => setActiveSubTab('registar')} />}
        {activeSubTab === 'agua' && <WaterTracker />}
        {activeSubTab === 'registar' && <MealRegistration onClose={() => setActiveSubTab('dashboard')} />}
      </div>
    </div>);
}
