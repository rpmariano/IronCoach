import React, { useState, useMemo } from 'react';
import { useAppStore } from '../../store';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import RunCard from './RunCard';
import RunRegistration from './RunRegistration';
import { CALENDAR_NO_DATA_DOT } from '../../lib/utils';

const SneakerIcon = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M14.1 7.9 12.5 10" />
    <path d="M17.4 10.1 16 12" />
    <path d="M2 16a2 2 0 0 0 2 2h13c2.8 0 5-2.2 5-5a2 2 0 0 0-2-2c-.8 0-1.6-.2-2.2-.7l-6.2-4.2c-.4-.3-.9-.2-1.3.1 0 0-.6.8-1.2 1.1a3.5 3.5 0 0 1-4.2.1C4.4 7 3.7 6.3 3.7 6.3A.92.92 0 0 0 2 7Z" />
    <path d="M2 11c0 1.7 1.3 3 3 3h7" />
  </svg>
);

const PT_MONTHS = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
];

function todayISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

export default function RunCalendar({ onNewRun }) {
  const { runs, setRuns } = useAppStore();
  const [currentDate, setCurrentDate] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  
  const [editingRunId, setEditingRunId] = useState(null);
  
  const todayIso = todayISO();
  const [selectedDate, setSelectedDate] = useState(todayIso);

  const monthLabel = `${PT_MONTHS[currentDate.getMonth()]} ${currentDate.getFullYear()}`;

  const cells = useMemo(() => {
    const y = currentDate.getFullYear();
    const m = currentDate.getMonth() + 1;
    const firstOfMonth = new Date(y, m - 1, 1);
    const daysInMonth = new Date(y, m, 0).getDate();
    const firstWeekday = (firstOfMonth.getDay() + 6) % 7;
    
    const arr = Array(firstWeekday).fill(null);
    for (let d = 1; d <= daysInMonth; d++) {
      arr.push(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    }
    return arr;
  }, [currentDate]);

  const changeMonth = (delta) => {
    setCurrentDate(prev => {
      const d = new Date(prev);
      d.setMonth(d.getMonth() + delta);
      return d;
    });
  };

  const runsByDate = useMemo(() => {
    const map = {};
    runs.forEach(r => {
      if (!map[r.date]) map[r.date] = [];
      map[r.date].push(r);
    });
    return map;
  }, [runs]);

  const handleDeleteRun = async (id) => {
    if (!window.confirm('Eliminar corrida? Não pode ser desfeito.')) return;
    const previous = [...runs];
    setRuns(runs.filter(r => r.id !== id));
    try {
      const { error } = await supabase.from('runs').delete().eq('id', id);
      if (error) throw error;
    } catch (err) {
      console.error(err);
      setRuns(previous);
    }
  };

  if (editingRunId) {
    return <RunRegistration onClose={() => setEditingRunId(null)} runIdToEdit={editingRunId} />;
  }

  return (
    <div className="space-y-4 fade-in pb-20">
      <button 
        onClick={() => onNewRun(selectedDate)}
        className="w-full text-neutral-950 font-bold text-sm rounded-2xl py-3.5 flex items-center justify-center gap-2 active:scale-[0.98] transition shadow-lg"
        style={{ background: 'var(--accent)' }}
      >
        <SneakerIcon className="w-5 h-5 mb-0.5" />
        Nova Corrida
      </button>

      <div className="card rounded-2xl p-4">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => changeMonth(-1)} className="tap-44 flex items-center justify-center text-slate-400 hover:text-slate-700">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h2 className="text-sm font-bold text-slate-800 capitalize">{monthLabel}</h2>
          <button onClick={() => changeMonth(1)} className="tap-44 flex items-center justify-center text-slate-400 hover:text-slate-700">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-1">
          {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map(d => (
            <div key={d} className="text-center text-[10px] text-slate-400 font-semibold">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {cells.map((dateIso, i) => {
            if (!dateIso) return <div key={i} />;
            const hasRun = runsByDate[dateIso] && runsByDate[dateIso].length > 0;
            const isToday = dateIso === todayIso;
            const isSelected = dateIso === selectedDate;
            const dayNum = Number(dateIso.slice(8, 10));
            
            let btnClass = "aspect-square flex flex-col items-center justify-center rounded-xl text-xs transition ";
            if (isSelected) {
              btnClass += "font-bold";
            } else if (isToday) {
              btnClass += "text-slate-800 font-bold border border-slate-300";
            } else {
              btnClass += "text-slate-500 hover:bg-slate-100";
            }

            return (
              <button 
                key={dateIso}
                onClick={() => setSelectedDate(dateIso)}
                className={btnClass}
                style={{ background: isSelected ? 'var(--accent)' : undefined, color: isSelected ? '#fff' : undefined }}
              >
                {dayNum}
                {/* Dia selecionado tem fundo Coral, onde o cinzento não lê bem. */}
                <span className={`w-1 h-1 rounded-full mt-1 ${hasRun ? 'bg-emerald-500' : (isSelected ? 'bg-white/30' : CALENDAR_NO_DATA_DOT)}`}></span>
              </button>
            );
          })}
        </div>
      </div>
      
      {/* Selected Date Summary */}
      {runsByDate[selectedDate] && runsByDate[selectedDate].length > 0 ? (
        <div className="space-y-3 mt-4">
          <h3 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-1">Corridas a {selectedDate === todayIso ? 'Hoje' : selectedDate}</h3>
          {runsByDate[selectedDate].map(run => (
            <RunCard 
              key={run.id} 
              run={run} 
              onEdit={setEditingRunId} 
              onDelete={handleDeleteRun} 
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-6">
          <p className="text-xs text-slate-400">Sem corridas neste dia.</p>
        </div>
      )}
    </div>
  );
}
