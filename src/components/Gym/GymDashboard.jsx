import React, { useState, useMemo } from 'react';
import { useAppStore } from '../../store';
import { TrendingUp, BarChart3 } from 'lucide-react';
import { Bar, Line } from 'react-chartjs-2';
import '../../lib/chartSetup';

const RANGES = [
  { k: 'semana', l: 'Esta Semana' },
  { k: 'mes', l: 'Este Mês' },
  { k: 'trimestre', l: '3 Meses' }
];

export default function GymDashboard() {
  const { gymSessions } = useAppStore();
  const [gymRange, setGymRange] = useState('mes');
  const [selectedExercise, setSelectedExercise] = useState('');

  // Filter sessions by selected range
  const sessionsInRange = useMemo(() => {
    const now = new Date();
    let startDate = new Date();
    
    if (gymRange === 'semana') {
      const day = now.getDay() || 7;
      startDate.setDate(now.getDate() - day + 1);
    } else if (gymRange === 'mes') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (gymRange === 'trimestre') {
      startDate.setMonth(now.getMonth() - 3);
    }

    const startStr = startDate.toISOString().slice(0, 10);
    return gymSessions.filter(s => s.date >= startStr);
  }, [gymSessions, gymRange]);

  // Calculate volume & sets
  const { totalVolume, totalSets, trainedExercises, volumeByDay, exerciseProgress } = useMemo(() => {
    let vol = 0;
    let setsCount = 0;
    const exercisesSet = new Set();
    const byDay = {};
    const exMap = {};

    sessionsInRange.forEach(session => {
      const dateStr = session.date;
      let sessionVol = 0;

      const sets = session.workout_session_sets || session.logs || [];
      sets.forEach(set => {
        if (set.reps != null && set.weight != null) {
          const v = set.weight * set.reps;
          vol += v;
          sessionVol += v;
          setsCount += 1;

          const exName = set.exercise_name || set.muscle_group || 'Exercício';
          exercisesSet.add(exName);

          if (!exMap[exName]) exMap[exName] = [];
          exMap[exName].push({ date: dateStr, weight: set.weight, reps: set.reps });
        }
      });

      byDay[dateStr] = (byDay[dateStr] || 0) + sessionVol;
    });

    return {
      totalVolume: vol,
      totalSets: setsCount,
      trainedExercises: Array.from(exercisesSet),
      volumeByDay: byDay,
      exerciseProgress: exMap
    };
  }, [sessionsInRange]);

  // Chart configs
  const volChartData = useMemo(() => {
    const days = Object.keys(volumeByDay).sort();
    return {
      labels: days.map(d => d.slice(8, 10) + '/' + d.slice(5, 7)),
      datasets: [{
        label: 'Volume (kg)',
        data: days.map(d => volumeByDay[d]),
        backgroundColor: 'rgba(96, 165, 250, 0.6)',
        borderRadius: 6
      }]
    };
  }, [volumeByDay]);

  const exChartData = useMemo(() => {
    if (!selectedExercise || !exerciseProgress[selectedExercise]) return null;
    const dataPoints = exerciseProgress[selectedExercise];
    return {
      labels: dataPoints.map(dp => dp.date.slice(8, 10) + '/' + dp.date.slice(5, 7)),
      datasets: [{
        label: 'Carga (kg)',
        data: dataPoints.map(dp => dp.weight),
        borderColor: '#60a5fa',
        backgroundColor: 'rgba(96, 165, 250, 0.1)',
        tension: 0.3,
        fill: true
      }]
    };
  }, [selectedExercise, exerciseProgress]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
      x: { grid: { display: false } }
    }
  };

  return (
    <div className="space-y-4 fade-in pb-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div 
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm"
          style={{ background: 'linear-gradient(135deg, var(--mod-ginasio-from), var(--mod-ginasio-to))' }}
        >
          <TrendingUp className="w-5 h-5" style={{ color: '#fff' }} />
        </div>
        <div>
          <h2 className="text-sm font-bold text-slate-800 leading-none">Evolução</h2>
          <p className="text-[11px] text-slate-500 mt-1">{sessionsInRange.length} treino(s) no período</p>
        </div>
      </div>

      {/* Range Chips */}
      <div className="flex gap-2">
        {RANGES.map(r => (
          <button
            key={r.k}
            onClick={() => setGymRange(r.k)}
            className={`range-chip flex-1 ${gymRange === r.k ? 'active' : ''}`}
          >
            {r.l}
          </button>
        ))}
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-3 gap-2">
        <div className="card rounded-2xl p-3 text-center">
          <p className="text-lg font-bold text-slate-800 leading-none">{sessionsInRange.length}</p>
          <p className="text-[10px] text-slate-500 mt-1.5">Treinos</p>
        </div>
        <div className="card rounded-2xl p-3 text-center">
          <p className="text-lg font-bold text-slate-800 leading-none">{Math.round(totalVolume).toLocaleString('pt-PT')}</p>
          <p className="text-[10px] text-slate-500 mt-1.5">Volume (kg)</p>
        </div>
        <div className="card rounded-2xl p-3 text-center">
          <p className="text-lg font-bold text-slate-800 leading-none">{totalSets}</p>
          <p className="text-[10px] text-slate-500 mt-1.5">Séries</p>
        </div>
      </div>

      {/* Content / Charts */}
      {sessionsInRange.length === 0 ? (
        <div className="min-h-[30vh] flex flex-col items-center justify-center text-center px-6 py-12">
          <BarChart3 className="w-10 h-10 text-slate-400 mb-3" />
          <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
            Ainda não há treinos neste período. Termina uma sessão de treino para veres a tua evolução aqui.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="card rounded-2xl p-4">
            <p className="text-[11px] font-semibold text-slate-700 mb-3">Volume por dia</p>
            <div className="h-44 relative">
              <Bar data={volChartData} options={chartOptions} />
            </div>
          </div>

          <div className="card rounded-2xl p-4 space-y-3">
            <p className="text-[11px] font-semibold text-slate-700">Progressão por exercício</p>
            <select
              value={selectedExercise}
              onChange={e => setSelectedExercise(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 outline-none focus:border-[var(--mod-ginasio-to)]"
            >
              <option value="">Escolhe um exercício…</option>
              {trainedExercises.map(ex => (
                <option key={ex} value={ex}>{ex}</option>
              ))}
            </select>

            {selectedExercise && exChartData ? (
              <div className="h-44 relative pt-2">
                <Line data={exChartData} options={chartOptions} />
              </div>
            ) : (
              <p className="text-[11px] text-slate-400 text-center py-4">
                Escolhe um exercício para veres a evolução da carga.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
