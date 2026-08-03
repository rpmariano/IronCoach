import React, { useState } from 'react';
import GymDashboard from './GymDashboard';
import GymCalendar from './GymCalendar';
import GymRegistration from './GymRegistration';
import { useAppStore } from '../../store';
import { LayoutDashboard, CalendarDays } from 'lucide-react';

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'calendario', label: 'Calendário', icon: CalendarDays },
];

export default function Gym() {
  const [activeSubTab, setActiveSubTab] = useState('dashboard');
  const { openCreationMode, setOpenCreationMode } = useAppStore();
  
  const tabIndex = TABS.findIndex(t => t.id === activeSubTab);

  return (
    <div className="flex flex-col fade-in">
      {/* Seg-nav deslizante */}
      <div
        className={`seg-nav at-${tabIndex + 1} relative flex rounded-full p-0.5 mb-5`}
        style={{ background: 'var(--surf-800)' }}
      >
        <div
          className="seg-thumb absolute top-0.5 bottom-0.5 rounded-full"
          style={{ width: `${100 / TABS.length}%`, background: 'var(--mod-ginasio-to)', left: 0 }}
        />
        {TABS.map(tab => {
          const Icon = tab.icon;
          const active = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              data-tab={tab.id}
              onClick={() => {
                setActiveSubTab(tab.id);
                if (openCreationMode) setOpenCreationMode(null);
              }}
              className={`seg-btn relative z-10 flex-1 flex items-center justify-center gap-1.5 py-2 text-[13px] font-semibold rounded-full transition-colors ${active ? 'active text-white' : 'text-slate-500'}`}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {openCreationMode === 'workout' ? (
        <GymRegistration onClose={() => setOpenCreationMode(null)} />
      ) : activeSubTab === 'dashboard' ? (
        <GymDashboard />
      ) : (
        <GymCalendar />
      )}
    </div>
  );
}
