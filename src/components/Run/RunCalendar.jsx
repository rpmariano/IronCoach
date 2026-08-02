import React, { useState, useMemo } from 'react';
import { useAppStore } from '../../store';
import { ChevronLeft, ChevronRight } from 'lucide-react';

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
  const { runs } = useAppStore();
  const [currentDate, setCurrentDate] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  
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

  return (
    <div className="space-y-4 fade-in pb-20">
      <button 
        onClick={() => onNewRun(selectedDate)}
        className="w-full text-neutral-950 font-bold text-sm rounded-2xl py-3.5 flex items-center justify-center gap-2 active:scale-[0.98] transition shadow-lg"
        style={{ background: 'var(--accent)' }}
      >
        <span className="text-xl leading-none font-black mb-0.5" style={{ color: '#000' }}>🏃</span>
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
              btnClass += "text-white font-bold";
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
                style={{ background: isSelected ? 'var(--accent)' : undefined }}
              >
                {dayNum}
                <span className={`w-1 h-1 rounded-full mt-1 ${hasRun ? 'bg-emerald-500' : (isSelected ? 'bg-white/30' : 'bg-slate-200')}`}></span>
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
            <div key={run.id} className="card rounded-2xl p-4">
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-bold text-sm text-slate-800">{run.name}</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5 capitalize">{run.kind} {run.training_type ? `· ${run.training_type}` : ''}</p>
                </div>
                {run.distance_km && (
                  <div className="text-right">
                    <p className="font-extrabold text-base text-slate-800 leading-none">{run.distance_km}<span className="text-xs text-slate-500 font-semibold ml-0.5">km</span></p>
                  </div>
                )}
              </div>
            </div>
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
