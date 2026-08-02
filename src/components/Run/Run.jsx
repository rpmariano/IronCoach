import React, { useState } from 'react';
import RunDashboard from './RunDashboard';
import RunCalendar from './RunCalendar';
import RunAgenda from './RunAgenda';
import RunRegistration from './RunRegistration';
import { LayoutDashboard, CalendarDays, Flag, Plus } from 'lucide-react';

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'calendario', label: 'Calendário', icon: CalendarDays },
  { id: 'agenda', label: 'Agenda', icon: Flag },
];

export default function Run() {
  const [activeSubTab, setActiveSubTab] = useState('dashboard');
  const [isFabOpen, setIsFabOpen] = useState(false);
  const [fabDate, setFabDate] = useState(null);
  
  const tabIndex = TABS.findIndex(t => t.id === activeSubTab);

  const handleOpenFab = (date = null) => {
    setFabDate(date);
    setIsFabOpen(true);
  };

  if (isFabOpen) {
    return <RunRegistration onClose={() => setIsFabOpen(false)} initialMode="corrida" dateIso={fabDate} />;
  }

  return (
    <div className="flex flex-col fade-in">
      {/* Seg-nav deslizante — 3 tabs */}
      <div
        className={`seg-nav at-${tabIndex + 1} relative flex rounded-full p-0.5 mb-5`}
        style={{ background: 'var(--surf-800)' }}
      >
        <div
          className="seg-thumb absolute top-0.5 bottom-0.5 rounded-full"
          style={{ width: `${100 / TABS.length}%`, background: 'var(--mod-corrida-to)', left: 0 }}
        />
        {TABS.map(tab => {
          const Icon = tab.icon;
          const active = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              data-tab={tab.id}
              onClick={() => setActiveSubTab(tab.id)}
              className={`seg-btn relative z-10 flex-1 flex items-center justify-center gap-1.5 py-2 text-[13px] font-semibold rounded-full transition-colors ${active ? 'active' : ''}`}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeSubTab === 'dashboard' && <RunDashboard />}
      {activeSubTab === 'calendario' && <RunCalendar onNewRun={handleOpenFab} />}
      {activeSubTab === 'agenda' && <RunAgenda />}

      {/* FAB para Nova Corrida se não estiver na Agenda (Agenda tem o seu botão) */}
      {activeSubTab !== 'agenda' && (
        <button 
          onClick={() => handleOpenFab()}
          className="fixed bottom-24 right-5 w-14 h-14 rounded-full flex items-center justify-center shadow-lg active:scale-95 transition z-40"
          style={{ background: 'var(--mod-corrida-to)', color: 'var(--blue-dark)' }}
        >
          <Plus size={28} />
        </button>
      )}
    </div>
  );
}
