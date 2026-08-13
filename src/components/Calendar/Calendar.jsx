import React, { useState, useMemo } from 'react';
import { useAppStore } from '../../store';
import { supabase } from '../../lib/supabase';
import { useToast } from '../shared/ToastProvider';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths } from 'date-fns';
import { pt } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';

import RunCard from '../Run/RunCard';
import GymSessionCard from '../Gym/GymSessionCard';
import MealCard from '../Nutrition/MealCard';
import BodyAssessmentCard from '../Body/BodyAssessmentCard';

import RunRegistration from '../Run/RunRegistration';
import GymRegistration from '../Gym/GymRegistration';
import MealRegistration from '../Nutrition/MealRegistration';
import BodyRegistration from '../Body/BodyRegistration';

export default function Calendar() {
  const { runs, gymSessions, meals, bodyAssessments, setRuns, setGymSessions, setMeals, setBodyAssessments } = useAppStore();
  const { showToast } = useToast();

  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => new Date());

  const [editingRunId, setEditingRunId] = useState(null);
  const [editingGymId, setEditingGymId] = useState(null);
  const [editingMealId, setEditingMealId] = useState(null);
  const [editingBodyId, setEditingBodyId] = useState(null);

  const daysInMonth = useMemo(() => {
    return eachDayOfInterval({
      start: startOfMonth(currentDate),
      end: endOfMonth(currentDate)
    });
  }, [currentDate]);

  const { runsByDay, gymByDay, mealsByDay, bodyByDay } = useMemo(() => {
    const groupBy = (rows) => {
      const map = new Map();
      for (const row of rows || []) {
        if (!map.has(row.date)) map.set(row.date, []);
        map.get(row.date).push(row);
      }
      return map;
    };
    return {
      runsByDay: groupBy(runs),
      gymByDay: groupBy(gymSessions),
      mealsByDay: groupBy(meals),
      bodyByDay: groupBy(bodyAssessments),
    };
  }, [runs, gymSessions, meals, bodyAssessments]);

  // Delete handlers
  const handleDeleteRun = async (id) => {
    if (!window.confirm('Eliminar corrida? Não pode ser desfeito.')) return;
    const previous = [...runs];
    setRuns(runs.filter(r => r.id !== id));
    try {
      const { error } = await supabase.from('runs').delete().eq('id', id);
      if (error) throw error;
      showToast('Corrida eliminada');
    } catch (err) {
      showToast('Erro ao eliminar corrida.', 'error');
      setRuns(previous);
    }
  };

  const handleDeleteGym = async (id) => {
    if (!window.confirm('Eliminar treino? Não pode ser desfeito.')) return;
    const previous = [...gymSessions];
    setGymSessions(gymSessions.filter(s => s.id !== id));
    try {
      const { error } = await supabase.from('workout_sessions').delete().eq('id', id);
      if (error) throw error;
      showToast('Treino eliminado');
    } catch (err) {
      showToast('Erro ao eliminar treino.', 'error');
      setGymSessions(previous);
    }
  };

  const handleDeleteMeal = async (id) => {
    if (!window.confirm('Eliminar refeição?')) return;
    const previous = [...meals];
    setMeals(meals.filter(m => m.id !== id));
    try {
      const { error } = await supabase.from('meals').delete().eq('id', id);
      if (error) throw error;
      showToast('Refeição eliminada');
    } catch (err) {
      showToast('Erro ao eliminar refeição.', 'error');
      setMeals(previous);
    }
  };

  const handleDeleteBody = async (id) => {
    if (!window.confirm('Eliminar avaliação corporal?')) return;
    const previous = [...bodyAssessments];
    setBodyAssessments(bodyAssessments.filter(a => a.id !== id));
    try {
      const { error } = await supabase.from('body_assessments').delete().eq('id', id);
      if (error) throw error;
      showToast('Avaliação eliminada');
    } catch (err) {
      showToast('Erro ao eliminar avaliação.', 'error');
      setBodyAssessments(previous);
    }
  };

  if (editingRunId) return <RunRegistration onClose={() => setEditingRunId(null)} runIdToEdit={editingRunId} />;
  if (editingGymId) return <GymRegistration onClose={() => setEditingGymId(null)} sessionIdToEdit={editingGymId} />;
  if (editingMealId) return <MealRegistration onClose={() => setEditingMealId(null)} mealIdToEdit={editingMealId} />;
  if (editingBodyId) return <BodyRegistration onClose={() => setEditingBodyId(null)} assessmentIdToEdit={editingBodyId} />;

  const firstWeekday = (startOfMonth(currentDate).getDay() + 6) % 7;
  const selectedDayStr = format(selectedDate, 'yyyy-MM-dd');

  const selectedRuns = runsByDay.get(selectedDayStr) || [];
  const selectedGym = gymByDay.get(selectedDayStr) || [];
  const selectedMeals = mealsByDay.get(selectedDayStr) || [];
  const selectedBody = bodyByDay.get(selectedDayStr) || [];

  const hasRecords = selectedRuns.length > 0 || selectedGym.length > 0 || selectedMeals.length > 0 || selectedBody.length > 0;

  return (
    <div className="space-y-4 fade-in pb-8">
      
      {/* Calendar Card styled with Homepage aesthetic (Glassmorphism Light) */}
      <div className="rounded-[28px] p-5 bg-white/40 backdrop-blur-[20px] border border-white/80 shadow-[0_10px_40px_rgba(0,0,0,0.05),inset_0_2px_10px_rgba(255,255,255,0.6)]">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => setCurrentDate(subMonths(currentDate, 1))} className="w-9 h-9 flex items-center justify-center rounded-full border border-white/60 bg-white/50 text-slate-500 hover:text-slate-800 hover:bg-white transition shadow-sm">
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-semibold capitalize text-slate-800">{format(currentDate, 'MMMM yyyy', { locale: pt })}</span>
          <button onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="w-9 h-9 flex items-center justify-center rounded-full border border-white/60 bg-white/50 text-slate-500 hover:text-slate-800 hover:bg-white transition shadow-sm">
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-y-3 gap-x-1 text-center mb-3">
          {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((d, i) => (
            <span className="text-[10px] font-bold text-slate-500 uppercase" key={i}>{d}</span>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-y-3 gap-x-1 text-center">
          {Array.from({ length: firstWeekday }).map((_, i) => (
            <div key={`empty-${i}`} className="flex justify-center items-center"></div>
          ))}

          {daysInMonth.map(date => {
            const dayNum = date.getDate();
            const dayStr = format(date, 'yyyy-MM-dd');
            const isSelected = isSameDay(date, selectedDate);
            
            const dayRuns = runsByDay.get(dayStr) || [];
            const dayGym = gymByDay.get(dayStr) || [];
            const dayMeals = mealsByDay.get(dayStr) || [];
            const dayBody = bodyByDay.get(dayStr) || [];

            return (
              <div className="flex justify-center items-center" key={dayStr}>
                <button
                  onClick={() => setSelectedDate(date)}
                  className={`w-[42px] h-[46px] rounded-xl flex flex-col items-center justify-between py-1.5 border transition cursor-pointer outline-none ${
                    isSelected 
                      ? 'bg-white border-slate-200 text-slate-900 shadow-[0_4px_15px_rgba(0,0,0,0.05)] scale-[1.02] font-black' 
                      : 'bg-white/50 border-white/70 text-slate-600 hover:bg-white/80'
                  }`}
                >
                  <span className="text-xs font-bold leading-none mt-[1px]">{dayNum}</span>
                  <div className="flex gap-[3px] justify-center w-full px-1.5 h-1">
                    {dayRuns.length > 0 && <span className="flex-1 rounded-[2px]" style={{ backgroundColor: 'var(--mod-corrida-to, #c026d3)' }} />}
                    {dayGym.length > 0 && <span className="flex-1 rounded-[2px]" style={{ backgroundColor: 'var(--mod-ginasio-to, #facc15)' }} />}
                    {dayMeals.length > 0 && <span className="flex-1 rounded-[2px]" style={{ backgroundColor: 'var(--mod-nutricao-to, #059669)' }} />}
                    {dayBody.length > 0 && <span className="flex-1 rounded-[2px]" style={{ backgroundColor: 'var(--mod-corpo-to, #e11d48)' }} />}
                    
                    {!dayRuns.length && !dayGym.length && !dayMeals.length && !dayBody.length && isSelected && (
                       <span className="flex-[0_0_14px] mx-auto rounded-[2px] bg-slate-300/50" />
                    )}
                  </div>
                </button>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-6 p-3 bg-white/50 rounded-xl border border-white/60 grid grid-cols-2 gap-2 text-[10px] font-semibold text-slate-500 shadow-sm">
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-1.5 rounded-[2px]" style={{ background: 'var(--mod-corrida-to, #c026d3)' }}></span>
            <span>Corrida</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-1.5 rounded-[2px]" style={{ background: 'var(--mod-ginasio-to, #facc15)' }}></span>
            <span>Ginásio</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-1.5 rounded-[2px]" style={{ background: 'var(--mod-nutricao-to, #059669)' }}></span>
            <span>Nutrição</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-1.5 rounded-[2px]" style={{ background: 'var(--mod-corpo-to, #e11d48)' }}></span>
            <span>Corpo</span>
          </div>
        </div>
      </div>

      {/* Selected Date Details */}
      <div className="space-y-3">
        <h3 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-1 pt-2">
          {format(selectedDate, 'dd MMMM yyyy', { locale: pt })}
        </h3>

        {!hasRecords && (
          <div className="rounded-2xl p-6 bg-white/40 border border-white/80 border-dashed flex flex-col items-center justify-center text-slate-500 shadow-[inset_0_2px_10px_rgba(255,255,255,0.6)]">
            <CalendarIcon size={24} className="opacity-40 mb-2" />
            <p className="text-[11px]">Sem registos neste dia</p>
          </div>
        )}

        {selectedRuns.map(run => (
          <RunCard key={run.id} run={run} onEdit={setEditingRunId} onDelete={handleDeleteRun} />
        ))}
        {selectedGym.map(session => (
          <GymSessionCard key={session.id} session={session} onEdit={setEditingGymId} onDelete={handleDeleteGym} />
        ))}
        {selectedMeals.map(meal => (
          <MealCard key={meal.id} meal={meal} onEdit={setEditingMealId} onDelete={handleDeleteMeal} />
        ))}
        {selectedBody.map(assessment => (
          <BodyAssessmentCard key={assessment.id} assessment={assessment} onEdit={setEditingBodyId} onDelete={handleDeleteBody} />
        ))}
      </div>
    </div>
  );
}
