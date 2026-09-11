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
      {/* Botão Novo treino */}
      <Button 
        variant="module"
        moduleColor="var(--mod-ginasio-to)"
        onClick={() => setOpenCreationMode('workout')}
        className="w-full text-sm rounded-2xl shadow-lg"
        size="lg"
        icon={<Dumbbell size={20} />}
      >
        Novo treino
      </Button>

      {/* Cartão do Calendário */}
      <div className="card rounded-2xl p-4">
        {/* Header no interior do cartão */}
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => setCurrentDate(subMonths(currentDate, 1))} className="tap-44 flex items-center justify-center text-[var(--text-3)] hover:text-[var(--text-1)] transition">
            <ChevronLeft size={16} />
          </button>
          <h2 className="text-[15px] font-semibold text-[var(--text-1)] capitalize">
            {format(currentDate, 'MMM yyyy', { locale: pt })}
          </h2>
          <button onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="tap-44 flex items-center justify-center text-[var(--text-3)] hover:text-[var(--text-1)] transition">
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-y-2 gap-x-1 text-center mb-1">
          {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((d, i) => (
            <div key={i} className="text-[11px] text-[var(--text-3)]">{d}</div>
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
            const statusColor = hasActivity ? 'bg-[var(--ok)]' : CALENDAR_NO_DATA_DOT;

            if (!isCurrentMonth) return null;

            return (
              <div key={date.toString()} className="flex justify-center">
                <button
                  onClick={() => setSelectedDate(date)}
                  className={`relative flex flex-col items-center justify-center w-11 h-11 rounded-xl text-xs transition ${
                    isSelected ? 'bg-[var(--bg-sheet)] shadow-md' : 'text-[var(--text-3)] hover:bg-[var(--surface-glass)]'
                  }`}
                  style={isSelected ? { color: 'var(--text-1)' } : undefined}
                >
                  <span className="mb-1">{format(date, 'd')}</span>
                  <div className={`w-1 h-1 rounded-full ${statusColor}`} />
                </button>
              </div>
            );
          })}
        </div>

        {/* Legenda */}
        <div className="flex items-center gap-4 mt-6 pt-4 border-t border-[var(--border-faint)] px-1">
          <span className="flex items-center gap-1.5 text-[11px] text-[var(--text-3)]">
            <span className="w-2 h-2 rounded-full bg-[var(--ok)]"></span> Treino registado
          </span>
        </div>
      </div>

      {/* Lista de Treinos do Dia */}
      <div className="mt-6">
        <h3 className="text-[13px] font-semibold text-[var(--text-3)] mb-3 uppercase tracking-wide">
          {format(selectedDate, 'dd MMM yyyy', { locale: pt })}
        </h3>
        <div className="space-y-2">
          {daySessions.length === 0 ? (
            <p className="text-xs text-[var(--text-3)] text-center py-6">Sem treinos registados neste dia.</p>
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
