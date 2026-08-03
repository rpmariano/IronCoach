import React, { useState } from 'react';
import RunDashboard from './RunDashboard';
import RunCalendar from './RunCalendar';
import RunAgenda from './RunAgenda';
import RunRegistration from './RunRegistration';
import { LayoutDashboard, CalendarDays, Flag, Plus } from 'lucide-react';
import { useAppStore } from '../../store';

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'calendario', label: 'Calendário', icon: CalendarDays },
  { id: 'agenda', label: 'Agenda', icon: Flag },
];

export default function Run() {
  const [activeSubTab, setActiveSubTab] = useState('dashboard');
  const [fabDate, setFabDate] = useState(null);
  const { openCreationMode, setOpenCreationMode } = useAppStore();
  
  const tabIndex = TABS.findIndex(t => t.id === activeSubTab);

  const handleOpenFab = (date = null) => {
    setFabDate(date);
    setOpenCreationMode('run');
  };

  return (
    <div className="flex flex-col fade-in">
      {/* Seg-nav deslizante — 3 tabs */}
      <div
        className={`seg-nav at-${tabIndex + 1} relative flex bg-transparent border border-slate-200 shadow-sm rounded-full p-1 mb-5`}
      >
        <div
          className="seg-thumb absolute top-1 bottom-1 rounded-full"
          style={{ width: `calc(${100 / TABS.length}% - 4px)`, left: '2px', background: 'var(--mod-corrida-to)' }}
        />
        {TABS.map(tab => {
          const Icon = tab.icon;
          const active = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              data-tab={tab.id}
              onClick={() => {
                setOpenCreationMode(null); // Close registration if switching tabs
                setActiveSubTab(tab.id);
              }}
              className={`seg-btn relative z-10 flex-1 flex items-center justify-center gap-1.5 py-2 text-[13px] font-bold rounded-full transition-colors ${active ? 'active' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {openCreationMode === 'run' ? (
        <RunRegistration onClose={() => setOpenCreationMode(null)} initialMode="corrida" dateIso={fabDate} />
      ) : (
        <>
          {activeSubTab === 'dashboard' && <RunDashboard />}
          {activeSubTab === 'calendario' && <RunCalendar onNewRun={handleOpenFab} />}
          {activeSubTab === 'agenda' && <RunAgenda />}
        </>
      )}
    </div>
  );
}
