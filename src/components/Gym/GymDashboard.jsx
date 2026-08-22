import React, { useState, useMemo } from 'react';
import Card from '../shared/Card';
import { useAppStore } from '../../store';
import { TrendingUp, BarChart3, Dumbbell, Activity, CalendarDays } from 'lucide-react';
import { Bar, Line } from 'react-chartjs-2';
import '../../lib/chartSetup';

import TimeFilterBar from '../BI/TimeFilterBar';
import KPICard from '../BI/KPICard';
import VolumeLoadChart from '../BI/VolumeLoadChart';
import MetricInfo from '../BI/MetricInfo';
import { filterByDateRange, calculateVolumeLoad, calculate1RMProgression, calculateMuscleGroupVolume } from '../../utils/biEngine';

export default function GymDashboard() {
  const { gymSessions } = useAppStore();
  const [timeRange, setTimeRange] = useState('mes');
  const [selectedExercise, setSelectedExercise] = useState('');
  const rangeKey = timeRange;

  const sessionsInRange = useMemo(() => filterByDateRange(gymSessions, rangeKey), [gymSessions, rangeKey]);
  const volumeData = useMemo(() => calculateVolumeLoad(gymSessions, rangeKey), [gymSessions, rangeKey]);
  const muscleVolume = useMemo(() => calculateMuscleGroupVolume(gymSessions, rangeKey), [gymSessions, rangeKey]);

  const { totalSets, volumeByDay, trainedExercises } = useMemo(() => {
    let setsCount = 0;
    const byDay = {};
    const exercisesSet = new Set();
    
    sessionsInRange.forEach(session => {
      const dateStr = session.date;
      let sessionVol = 0;
      const sets = session.workout_session_sets || session.logs || [];
      sets.forEach(set => {
        if (set.reps != null && set.weight != null) {
          sessionVol += set.weight * set.reps;
          setsCount += 1;
          const exName = set.exercise_name || set.muscle_group || 'Exercício';
          exercisesSet.add(exName);
        }
      });
      byDay[dateStr] = (byDay[dateStr] || 0) + sessionVol;
    });
    
    return {
      totalSets: setsCount,
      volumeByDay: byDay,
      trainedExercises: Array.from(exercisesSet).sort()
    };
  }, [sessionsInRange]);

  const volChartData = useMemo(() => {
    const days = Object.keys(volumeByDay).sort();
    return {
      labels: days.map(d => d.slice(8, 10) + '/' + d.slice(5, 7)),
      datasets: [{
        label: 'Volume (kg)',
        data: days.map(d => volumeByDay[d]),
        backgroundColor: 'rgba(217, 119, 6, 0.6)',
        borderRadius: 4
      }]
    };
  }, [volumeByDay]);

  const progression = useMemo(() => {
    if (!selectedExercise) return [];
    return calculate1RMProgression(gymSessions, selectedExercise);
  }, [gymSessions, selectedExercise]);

  const exChartData = useMemo(() => {
    if (!progression.length) return null;
    return {
      labels: progression.map(dp => dp.date.slice(8, 10) + '/' + dp.date.slice(5, 7)),
      datasets: [
        {
          label: '1RM Estimado (kg)',
          data: progression.map(dp => dp.estimated1RM),
          borderColor: '#d97706',
          backgroundColor: 'rgba(217, 119, 6, 0.1)',
          tension: 0.3,
          fill: true
        },
        {
          label: 'Carga Máxima (kg)',
          data: progression.map(dp => dp.maxWeight),
          borderColor: '#94a3b8',
          borderDash: [5, 5],
          tension: 0.3,
          fill: false
        }
      ]
    };
  }, [progression]);

  const muscleChartData = useMemo(() => {
    const groups = Object.keys(muscleVolume).sort((a,b) => muscleVolume[b].sets - muscleVolume[a].sets);
    return {
      labels: groups,
      datasets: [{
        label: 'Séries',
        data: groups.map(g => muscleVolume[g].sets),
        backgroundColor: '#d97706',
        borderRadius: 4
      }]
    };
  }, [muscleVolume]);

  const defaultChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
      x: { grid: { display: false } }
    }
  };

  const muscleChartOptions = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
      y: { grid: { display: false } }
    }
  };

  const exChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { 
      legend: { 
        display: true, 
        position: 'top',
        labels: { boxWidth: 12, usePointStyle: true, font: { size: 10 } }
      } 
    },
    scales: {
      y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
      x: { grid: { display: false } }
    }
  };

  return (
    <div className="space-y-4 fade-in">
      {/* Time Filter Bar */}
      <TimeFilterBar activeRange={timeRange} onChange={setTimeRange} />

      {/* KPI Row */}
      <div className="grid grid-cols-3 gap-3">
        <KPICard 
          label="Treinos" 
          value={sessionsInRange.length} 
          icon={CalendarDays} 
          moduleColor="var(--mod-ginasio)"
        />
        <KPICard 
          label="Vol. Carga" 
          value={Math.round(volumeData.totalVolumeLoad).toLocaleString('pt-PT')} 
          unit="kg"
          icon={TrendingUp} 
          moduleColor="var(--mod-ginasio)"
        />
        <KPICard 
          label="Séries" 
          value={totalSets} 
          icon={Activity} 
          moduleColor="var(--mod-ginasio)"
        />
      </div>

      {sessionsInRange.length === 0 ? (
        <div className="min-h-[30vh] flex flex-col items-center justify-center text-center px-6 py-12 card rounded-3xl">
          <Dumbbell className="w-10 h-10 text-slate-400 mb-3" />
          <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
            Ainda não há treinos neste período. Termina uma sessão de treino para veres a tua evolução aqui.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Weekly Volume Load Chart */}
          {volumeData.weeklyBreakdown.length > 0 && (
            <VolumeLoadChart
              weeklyData={volumeData.weeklyBreakdown}
              acwr={{ ratio: volumeData.acwr, status: volumeData.acwrStatus }}
            />
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Daily Volume Bar Chart */}
            <Card className="rounded-3xl p-4">
              <p className="text-[12px] font-bold text-slate-700 mb-3">Volume Diário (kg)</p>
              <div className="h-52 relative">
                <Bar data={volChartData} options={defaultChartOptions} />
              </div>
            </Card>

            {/* Muscle Group Volume Chart */}
            {Object.keys(muscleVolume).length > 0 && (
              <Card className="rounded-3xl p-4">
                <p className="text-[12px] font-bold text-slate-700 mb-3">Séries por Grupo Muscular</p>
                <div className="h-52 relative">
                  <Bar data={muscleChartData} options={muscleChartOptions} />
                </div>
              </Card>
            )}
          </div>

          {/* 1RM Progression Chart */}
          <Card className="rounded-3xl p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start">
                <p className="text-[12px] font-bold text-slate-700">Evolução do 1RM Estimado</p>
                <MetricInfo text="A tua 1 Repetição Máxima (1RM). Uso as tuas melhores séries para estimar o peso máximo que levantarias numa só repetição usando a fórmula científica de Epley. O objetivo é ver a linha subir ao longo do tempo!" />
              </div>
              <select
                value={selectedExercise}
                onChange={e => setSelectedExercise(e.target.value)}
                className="bg-white/60 border border-slate-200/60 rounded-xl px-3 py-1.5 text-[11px] font-medium text-slate-700 outline-none focus:border-[#d97706] shadow-sm backdrop-blur w-full sm:w-auto min-w-[160px]"
              >
                <option value="">Escolhe um exercício…</option>
                {trainedExercises.map(ex => (
                  <option key={ex} value={ex}>{ex}</option>
                ))}
              </select>
            </div>

            {selectedExercise && progression.length > 0 ? (
              <div className="h-56 relative pt-2">
                <Line data={exChartData} options={exChartOptions} />
              </div>
            ) : (
              <div className="h-56 flex flex-col items-center justify-center border-2 border-dashed border-slate-200/50 rounded-2xl">
                <p className="text-[11px] text-slate-400 text-center px-4">
                  Escolhe um exercício acima para acompanhares a evolução da tua carga máxima.
                </p>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
