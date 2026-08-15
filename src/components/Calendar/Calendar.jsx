import React, { useState, useMemo } from 'react';
import { useAppStore } from '../../store';
import { supabase } from '../../lib/supabase';
import { useToast } from '../shared/ToastProvider';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths } from 'date-fns';
import { pt } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';

import RunCard from '../Run/RunCard';
import RaceCard from '../Run/RaceCard';
import GymSessionCard from '../Gym/GymSessionCard';
import MealCard from '../Nutrition/MealCard';
import BodyAssessmentCard from '../Body/BodyAssessmentCard';

import RunRegistration from '../Run/RunRegistration';
import GymRegistration from '../Gym/GymRegistration';
import MealRegistration from '../Nutrition/MealRegistration';
import BodyRegistration from '../Body/BodyRegistration';

export default function Calendar() {
  const { runs, raceEvents, gymSessions, meals, bodyAssessments, setRuns, setRaceEvents, setGymSessions, setMeals, setBodyAssessments, setEditingRaceId } = useAppStore();
  const { showToast } = useToast();

  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => new Date());

  const [editingRunId, setEditingRunId] = useState(null);
  const [editingGymId, setEditingGymId] = useState(null);
  const [editingMealId, setEditingMealId] = useState(null);
  const [editingBodyId, setEditingBodyId] = useState(null);
  const [racePrefillActive, setRacePrefillActive] = useState(false);

  const daysInMonth = useMemo(() => {
    return eachDayOfInterval({
      start: startOfMonth(currentDate),
      end: endOfMonth(currentDate)
    });
  }, [currentDate]);

  const { runsByDay, racesByDay, gymByDay, mealsByDay, bodyByDay } = useMemo(() => {
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
      racesByDay: groupBy(raceEvents),
      gymByDay: groupBy(gymSessions),
      mealsByDay: groupBy(meals),
      bodyByDay: groupBy(bodyAssessments),
    };
  }, [runs, raceEvents, gymSessions, meals, bodyAssessments]);

  // Delete handlers
  const handleDeleteRun = async (id) => {
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
  // raceEvents toggle status and delete are handled inside RaceCard via optimistic updates, 
  // but to keep it simple, we can pass them down.
  const handleToggleRaceStatus = async (ev) => {
    const newStatus = ev.status === 'concluida' ? 'agendada' : 'concluida';
    setRaceEvents(raceEvents.map(e => e.id === ev.id ? { ...e, status: newStatus } : e));
    try {
      const { error } = await supabase.from('race_events').update({ status: newStatus }).eq('id', ev.id);
      if (error) throw error;
      showToast('Estado da prova atualizado');
    } catch (err) {
      console.error(err);
      setRaceEvents(raceEvents);
    }
  };

  const handleDeleteRace = async (id) => {
    if (!window.confirm("Eliminar prova?")) return;
    const previous = [...raceEvents];
    setRaceEvents(raceEvents.filter(e => e.id !== id));
    try {
      const { error } = await supabase.from('race_events').delete().eq('id', id);
      if (error) throw error;
      showToast('Prova eliminada');
    } catch (err) {
      console.error(err);
      setRaceEvents(previous);
    }
  };

  const handleCompleteRace = (ev) => {
    useAppStore.setState({ planItemPrefill: {
      kind: 'corrida',
      isRace: true,
      planned_date: ev.date,
      title: ev.name,
      target_distance_km: ev.distance_km,
      target_duration: ev.target_time_seconds,
      elevation_gain_m: ev.elevation_gain_m,
      race_type: ev.race_type
    }});
    setRacePrefillActive(true);
  };

  if (editingRunId) return <RunRegistration onClose={() => setEditingRunId(null)} runIdToEdit={editingRunId} />;
  if (racePrefillActive) return <RunRegistration onClose={() => { setRacePrefillActive(false); useAppStore.setState({ planItemPrefill: null }); }} runIdToEdit={null} />;
  if (editingGymId) return <GymRegistration onClose={() => setEditingGymId(null)} sessionIdToEdit={editingGymId} />;
  if (editingMealId) return <MealRegistration onClose={() => setEditingMealId(null)} mealIdToEdit={editingMealId} />;
  if (editingBodyId) return <BodyRegistration onClose={() => setEditingBodyId(null)} assessmentIdToEdit={editingBodyId} />;

  const firstWeekday = (startOfMonth(currentDate).getDay() + 6) % 7;
  const selectedDayStr = format(selectedDate, 'yyyy-MM-dd');

  const selectedRuns = runsByDay.get(selectedDayStr) || [];
  const selectedRaces = racesByDay.get(selectedDayStr) || [];
  const selectedGym = gymByDay.get(selectedDayStr) || [];
  const selectedMeals = mealsByDay.get(selectedDayStr) || [];
  const selectedBody = bodyByDay.get(selectedDayStr) || [];

  const hasRecords = selectedRuns.length > 0 || selectedRaces.length > 0 || selectedGym.length > 0 || selectedMeals.length > 0 || selectedBody.length > 0;

  return (
    <div className="space-y-4 fade-in pb-8">
      
      {/* Calendar Card styled with Homepage aesthetic (Glassmorphism Light) */}
      <div className="rounded-[28px] p-5 bg-white/40 backdrop-blur-[20px] border border-white/80 shadow-[0_10px_40px_rgba(0,0,0,0.05),inset_0_2px_10px_rgba(255,255,255,0.6)]">
        <div className="flex items-center justify-between mb-5">
          <button onClick={() => setCurrentDate(subMonths(currentDate, 1))} className="tap-44 flex items-center justify-center text-slate-400 hover:text-slate-800 transition">
            <ChevronLeft size={16} />
          </button>
          <span className="text-[15px] font-bold capitalize text-slate-900 tracking-tight">{format(currentDate, 'MMMM yyyy', { locale: pt })}</span>
          <button onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="tap-44 flex items-center justify-center text-slate-400 hover:text-slate-800 transition">
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-y-3 gap-x-1 text-center mb-4">
          {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((d, i) => (
            <span className="text-[10px] font-extrabold text-slate-700 uppercase tracking-wide" key={i}>{d}</span>
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
            const dayRaces = racesByDay.get(dayStr) || [];
            const dayGym = gymByDay.get(dayStr) || [];
            const dayMeals = mealsByDay.get(dayStr) || [];
            const dayBody = bodyByDay.get(dayStr) || [];

            return (
              <div className="flex justify-center items-center" key={dayStr}>
                <button
                  onClick={() => setSelectedDate(date)}
                  className={`w-[42px] h-[46px] rounded-xl flex flex-col items-center justify-between py-1.5 border-[1.5px] transition cursor-pointer outline-none ${
                    isSelected 
                      ? 'bg-white border-orange-500 text-slate-900 shadow-[0_4px_15px_rgba(0,0,0,0.08)] scale-[1.05] font-black' 
                      : dayRaces.length > 0
                        ? 'bg-[var(--mod-coach-to)] border-transparent text-white shadow-[0_2px_8px_rgba(6,182,212,0.3)] hover:opacity-90'
                        : 'bg-white border-transparent shadow-[0_2px_8px_rgba(0,0,0,0.04)] text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="text-xs font-bold leading-none mt-[1px]">{dayNum}</span>
                  <div className="flex gap-[3px] justify-center w-full px-1.5 h-1">
                    {dayRaces.length > 0 && <span className="flex-1 rounded-[2px]" style={{ backgroundColor: isSelected ? 'var(--mod-coach-to)' : 'rgba(255,255,255,0.7)' }} />}
                    {dayRuns.length > 0 && <span className="flex-1 rounded-[2px]" style={{ backgroundColor: 'var(--mod-corrida-to, #c026d3)' }} />}
                    {dayGym.length > 0 && <span className="flex-1 rounded-[2px]" style={{ backgroundColor: 'var(--mod-ginasio-to, #facc15)' }} />}
                    {dayMeals.length > 0 && <span className="flex-1 rounded-[2px]" style={{ backgroundColor: 'var(--mod-nutricao-to, #059669)' }} />}
                    {dayBody.length > 0 && <span className="flex-1 rounded-[2px]" style={{ backgroundColor: 'var(--mod-corpo-to, #e11d48)' }} />}
                    
                    {!dayRaces.length && !dayRuns.length && !dayGym.length && !dayMeals.length && !dayBody.length && isSelected && (
                       <span className="flex-[0_0_14px] mx-auto rounded-[2px] bg-slate-300/50" />
                    )}
                  </div>
                </button>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-6 p-3 bg-white/50 rounded-xl border border-white/60 flex flex-wrap items-center justify-center gap-x-6 gap-y-2.5 text-[10px] font-semibold text-slate-600 shadow-sm">
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-1.5 rounded-[2px]" style={{ background: 'var(--mod-coach-to)' }}></span>
            <span>Prova</span>
          </div>
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

        {selectedRaces.map(race => (
          <RaceCard key={race.id} ev={race} onEdit={setEditingRaceId} onToggleStatus={() => handleCompleteRace(race)} onDelete={handleDeleteRace} />
        ))}
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
