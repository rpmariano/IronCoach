import React, { useState, useMemo } from 'react';
import { useAppStore } from '../../store';
import { mealNutrients, mealTypeLabel } from '../../utils/nutrition';
import { ChevronLeft, ChevronRight, Flame, Camera } from 'lucide-react';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay } from 'date-fns';
import { pt } from 'date-fns/locale';
import MealCard from './MealCard';

export default function NutritionCalendar({ onRegisterClick }) {
  const { meals } = useAppStore();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());

  const daysInMonth = useMemo(() => {
    const start = startOfMonth(currentDate);
    const end = endOfMonth(currentDate);
    return eachDayOfInterval({ start, end });
  }, [currentDate]);

  // Meals for the selected day
  const dayMeals = useMemo(() => {
    const dayStr = format(selectedDate, 'yyyy-MM-dd');
    return meals.filter(m => m.date === dayStr);
  }, [meals, selectedDate]);

  const hasMealsOnDay = (date) => {
    const dayStr = format(date, 'yyyy-MM-dd');
    return meals.some(m => m.date === dayStr);
  };

  return (
    <div className="space-y-4 fade-in pb-8">
      {/* Botão de Registo */}
      <button 
        onClick={onRegisterClick}
        className="w-full bg-[var(--accent)] text-neutral-950 font-bold text-sm rounded-2xl py-3.5 flex items-center justify-center gap-2 active:scale-[0.98] transition shadow-lg"
      >
        <Camera size={20} /> Registar Refeição
      </button>

      {/* Calendar Grid */}
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
            const hasActivity = hasMealsOnDay(date);
            const statusColor = hasActivity ? 'bg-[var(--mod-nutricao-to)]' : 'bg-slate-200';

            if (!isCurrentMonth) return null;

            return (
              <div key={date.toString()} className="flex justify-center">
                <button
                  onClick={() => setSelectedDate(date)}
                  className={`relative flex flex-col items-center justify-center w-10 h-10 rounded-xl text-xs transition ${
                    isSelected ? 'bg-neutral-900 text-white shadow-md' :
                    'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <span className="mb-1">{format(date, 'd')}</span>
                  <div className={`w-1 h-1 rounded-full ${isSelected && hasActivity ? 'bg-white' : isSelected && !hasActivity ? 'bg-neutral-600' : statusColor}`} />
                </button>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-6 pt-4 border-t border-slate-100 px-1">
          <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <span className="w-2 h-2 rounded-full bg-[var(--mod-nutricao-to)]"></span> Refeição registada
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <span className="w-2 h-2 rounded-full bg-slate-200"></span> Sem registos
          </span>
        </div>
      </div>

      {/* Day Meals */}
      <div className="mt-6">
        <h3 className="text-[13px] font-semibold text-slate-500 mb-3 uppercase tracking-wide">
          {format(selectedDate, 'dd MMM yyyy', { locale: pt })}
        </h3>
        <div className="space-y-3">
        {dayMeals.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-6">Sem refeições registadas neste dia.</p>
        ) : (
          dayMeals.map(meal => (
            <MealCard key={meal.id} meal={meal} />
          ))
        )}
        </div>
      </div>
    </div>
  );
}
