import React, { useState, useMemo } from 'react';
import { useAppStore } from '../../store';
import { BODY_METRICS, fmtMetric } from '../../utils/body';
import { ChevronLeft, ChevronRight, ScanLine } from 'lucide-react';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay } from 'date-fns';
import { pt } from 'date-fns/locale';
import BodyAssessmentCard from './BodyAssessmentCard';
import BodyRegistration from './BodyRegistration';
import { CALENDAR_NO_DATA_DOT } from '../../lib/utils';

export default function BodyCalendar() {
  const { bodyAssessments, setOpenCreationMode } = useAppStore();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [editingAssessmentId, setEditingAssessmentId] = useState(null);

  const daysInMonth = useMemo(() => {
    const start = startOfMonth(currentDate);
    const end = endOfMonth(currentDate);
    return eachDayOfInterval({ start, end });
  }, [currentDate]);

  const hasAssessmentOnDay = (date) => {
    const dayStr = format(date, 'yyyy-MM-dd');
    return bodyAssessments.some(a => a.date === dayStr);
  };

  // Assessments for selected day
  const dayAssessments = useMemo(() => {
    const dayStr = format(selectedDate, 'yyyy-MM-dd');
    return bodyAssessments.filter(a => a.date === dayStr);
  }, [bodyAssessments, selectedDate]);

  // Editar ocupa o ecrã todo, como na Nutrição — o calendário volta assim
  // que o formulário fecha.
  if (editingAssessmentId) {
    return (
      <BodyRegistration
        onClose={() => setEditingAssessmentId(null)}
        assessmentIdToEdit={editingAssessmentId}
      />
    );
  }

  return (
    <div className="space-y-4 fade-in pb-8">
      {/* Botão Nova Avaliação */}
      <button
        onClick={() => setOpenCreationMode('assessment')}
        className="w-full bg-[var(--accent)] text-neutral-950 font-bold text-sm rounded-2xl py-3.5 flex items-center justify-center gap-2 active:scale-[0.98] transition shadow-lg"
      >
        <ScanLine size={20} /> Nova Avaliação
      </button>

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
            const hasActivity = hasAssessmentOnDay(date);
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
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Avaliação registada
          </span>
        </div>
      </div>

      {/* Lista de Avaliações do Dia */}
      <div className="mt-6">
        <h3 className="text-[13px] font-semibold text-slate-500 mb-3 uppercase tracking-wide">
          {format(selectedDate, 'dd MMM yyyy', { locale: pt })}
        </h3>
        <div className="space-y-2">
          {dayAssessments.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-6">Sem avaliações registadas neste dia.</p>
          ) : (
            dayAssessments.map(assessment => (
              <BodyAssessmentCard key={assessment.id} assessment={assessment} onEdit={setEditingAssessmentId} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
