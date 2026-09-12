import React, { useState, useMemo } from 'react';
import { useAppStore } from '../../store';
import { dayNutrientStatus, dayWaterGoalMet } from '../../utils/nutrition';
import { CALENDAR_NO_DATA_DOT } from '../../lib/utils';
import { ChevronLeft, ChevronRight, Camera } from 'lucide-react';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay } from 'date-fns';
import { pt } from 'date-fns/locale';
import MealCard from './MealCard';
import MealRegistration from './MealRegistration';
import Button from '../shared/Button';

export default function NutritionCalendar({ onRegisterClick }) {
  const { meals, waterLogs, profile, coachPlans, coachPlanItems } = useAppStore();

  /* Só treinos de planos ACEITES ajustam os objetivos do dia — uma proposta
     que o atleta ainda não aceitou (ou recusou) não deve mexer no calendário.
     Ver specs/plano-de-treino.md §4-§5.1. */
  const activePlanItems = useMemo(() => {
    const acceptedIds = new Set((coachPlans || []).filter(p => p.status === 'aceite').map(p => p.id));
    return (coachPlanItems || []).filter(i => acceptedIds.has(i.plan_id));
  }, [coachPlans, coachPlanItems]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [editingMealId, setEditingMealId] = useState(null);

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

  /* Um agrupamento por data em vez de varrer meals e waterLogs inteiros uma
     vez por cada dia da grelha (31 varreduras completas por render, cada uma
     a somar os nutrientes de todas as refeições que batessem). */
  const { mealsByDay, waterByDay } = useMemo(() => {
    const groupBy = (rows) => {
      const map = new Map();
      for (const row of rows || []) {
        if (!map.has(row.date)) map.set(row.date, []);
        map.get(row.date).push(row);
      }
      return map;
    };
    // Fora do memo do dayInfo para mudar de mês não reagrupar todo o histórico.
    return { mealsByDay: groupBy(meals), waterByDay: groupBy(waterLogs) };
  }, [meals, waterLogs]);

  const dayInfo = useMemo(() => {
    const info = new Map();
    for (const date of daysInMonth) {
      const dayStr = format(date, 'yyyy-MM-dd');
      info.set(dayStr, {
        status: dayNutrientStatus(mealsByDay.get(dayStr) || [], dayStr, profile, activePlanItems),
        waterMet: dayWaterGoalMet(waterByDay.get(dayStr) || [], dayStr, profile),
      });
    }
    return info;
  }, [daysInMonth, mealsByDay, waterByDay, profile, activePlanItems]);

  if (editingMealId) {
    return <MealRegistration onClose={() => setEditingMealId(null)} mealIdToEdit={editingMealId} />;
  }

  return (
    <div className="space-y-4 fade-in pb-8">
      {/* Botão de Registo */}
      <Button 
        variant="module"
        moduleColor="var(--mod-nutricao)"
        onClick={onRegisterClick}
        className="w-full text-sm rounded-2xl shadow-lg"
        size="lg"
        icon={<Camera size={20} />}
      >
        Registar refeição
      </Button>

      {/* Calendar Grid */}
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
            if (!isCurrentMonth) return null;

            const dayStr = format(date, 'yyyy-MM-dd');
            const { status, waterMet } = dayInfo.get(dayStr) || { status: 'none', waterMet: false };
            const statusColor =
              status === 'ok' ? 'bg-[var(--ok)]' :
              status === 'over' ? 'bg-[var(--danger)]' :
              CALENDAR_NO_DATA_DOT;

            return (
              <div key={date.toString()} className="flex justify-center">
                <button
                  onClick={() => setSelectedDate(date)}
                  className={`relative flex flex-col items-center justify-center w-11 h-11 rounded-xl text-xs transition ${
                    isSelected ? 'bg-[var(--bg-sheet)] shadow-md' :
                    'text-[var(--text-3)] hover:bg-[var(--surface-glass)]'
                  }`}
                  style={isSelected ? { color: 'var(--text-1)' } : undefined}
                >
                  <span className="leading-none">{format(date, 'd')}</span>
                  {/* Altura fixa para os dias sem ponto de água não saltarem. */}
                  <span className="flex flex-col items-center gap-[2px] mt-1 h-2.5">
                    <span className={`w-1 h-1 rounded-full ${statusColor}`} />
                    {waterMet && <span className="w-1 h-1 rounded-full bg-[var(--run)]" />}
                  </span>
                </button>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-6 pt-4 border-t border-[var(--border-faint)] px-1">
          <span className="flex items-center gap-1.5 text-[11px] text-[var(--text-3)]">
            <span className="w-2 h-2 rounded-full bg-[var(--ok)]"></span> Objetivos cumpridos
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-[var(--text-3)]">
            <span className="w-2 h-2 rounded-full bg-[var(--danger)]"></span> Excedeu um macro ou ficou abaixo da proteína
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-[var(--text-3)]">
            <span className="w-2 h-2 rounded-full bg-[var(--run)]"></span> Objetivo de água atingido
          </span>
        </div>
      </div>

      {/* Day Meals */}
      <div className="mt-6">
        <h3 className="text-[13px] font-semibold text-[var(--text-3)] mb-3 uppercase tracking-wide">
          {format(selectedDate, 'dd MMM yyyy', { locale: pt })}
        </h3>
        <div className="space-y-3">
        {dayMeals.length === 0 ? (
          <p className="text-xs text-[var(--text-3)] text-center py-6">Sem refeições registadas neste dia.</p>
        ) : (
          dayMeals.map(meal => (
            <MealCard key={meal.id} meal={meal} onEdit={setEditingMealId} />
          ))
        )}
        </div>
      </div>
    </div>
  );
}
