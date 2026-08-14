import React, { useState, useMemo } from 'react';
import { useAppStore } from '../../store';
import { ChevronLeft, ChevronRight, Dumbbell } from 'lucide-react';
import GymSessionCard from './GymSessionCard';
import GymRegistration from './GymRegistration';
import Button from '../shared/Button';
import { CALENDAR_NO_DATA_DOT } from '../../lib/utils';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay } from 'date-fns';
import { pt } from 'date-fns/locale';

export default function GymCalendar() {
  const { gymSessions, setOpenCreationMode } = useAppStore();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [expandedSessionId, setExpandedSessionId] = useState(null);
  const [editingSessionId, setEditingSessionId] = useState(null);

  const daysInMonth = useMemo(() => {
    const start = startOfMonth(currentDate);
    const end = endOfMonth(currentDate);
    return eachDayOfInterval({ start, end });
  }, [currentDate]);

  const hasSessionOnDay = (date) => {
    const dayStr = format(date, 'yyyy-MM-dd');
    return gymSessions.some(s => s.date === dayStr);
  };

  // Sessions for selected day
  const daySessions = useMemo(() => {
    const dayStr = format(selectedDate, 'yyyy-MM-dd');
    return gymSessions.filter(s => s.date === dayStr);
  }, [gymSessions, selectedDate]);

  if (editingSessionId) {
    return <GymRegistration onClose={() => setEditingSessionId(null)} sessionIdToEdit={editingSessionId} />;
  }

  return (
    <div className="space-y-4 fade-in pb-8">
      {/* Botão Novo Treino */}
      <Button 
        variant="module"
        moduleColor="var(--mod-ginasio-to)"
        onClick={() => setOpenCreationMode('workout')}
        className="w-full text-sm rounded-2xl shadow-lg"
        size="lg"
        icon={<Dumbbell size={20} />}
      >
        Novo Treino
      </Button>

      {/* Cartão do Calendário */}
      <div className="card rounded-2xl p-4">
        {/* Header no interior do cartão */}
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => setCurrentDate(subMonths(currentDate, 1))} className="tap-44 flex items-center justify-center text-slate-400 hover:text-slate-800 transition">
            <ChevronLeft size={16} />
          </button>
          <h2 className="text-[15px] font-semibold text-slate-800 capitalize">
            {format(currentDate, 'MMM yyyy', { locale: pt })}
          </h2>
          <button onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="tap-44 flex items-center justify-center text-slate-400 hover:text-slate-800 transition">
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-y-2 gap-x-1 text-center mb-1">
          {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((d, i) => (
            <div key={i} className="text-[10px] text-slate-500">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-y-2 gap-x-1 text-center">
          {Array.from({ length: (startOfMonth(currentDate).getDay() + 6) % 7 }).map((_, i) => (
            <div key={`empty-${i}`} />
          ))}

          {daysInMonth.map(date => {
            const isSelected = isSameDay(date, selectedDate);
            const isCurrentMonth = isSameMonth(date, currentDate);
            const hasActivity = hasSessionOnDay(date);
            const statusColor = hasActivity ? 'bg-emerald-500' : CALENDAR_NO_DATA_DOT;

            if (!isCurrentMonth) return null;

            return (
              <div key={date.toString()} className="flex justify-center">
                <button
                  onClick={() => setSelectedDate(date)}
                  className={`relative flex flex-col items-center justify-center w-10 h-10 rounded-xl text-xs transition ${
                    isSelected ? 'bg-neutral-900 shadow-md' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                  style={isSelected ? { color: '#0f172a' } : undefined}
                >
                  <span className="mb-1">{format(date, 'd')}</span>
                  <div className={`w-1 h-1 rounded-full ${statusColor}`} />
                </button>
              </div>
            );
          })}
        </div>

        {/* Legenda */}
        <div className="flex items-center gap-4 mt-6 pt-4 border-t border-slate-100 px-1">
          <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Treino registado
          </span>
        </div>
      </div>

      {/* Lista de Treinos do Dia */}
      <div className="mt-6">
        <h3 className="text-[13px] font-semibold text-slate-500 mb-3 uppercase tracking-wide">
          {format(selectedDate, 'dd MMM yyyy', { locale: pt })}
        </h3>
        <div className="space-y-2">
          {daySessions.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-6">Sem treinos registados neste dia.</p>
          ) : (
            daySessions.map(session => (
              <GymSessionCard
                key={session.id}
                session={session}
                isExpanded={expandedSessionId === session.id}
                onToggleExpand={() => setExpandedSessionId(expandedSessionId === session.id ? null : session.id)}
                onEdit={setEditingSessionId}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
