import React, { useState, useMemo } from 'react';
import Card from '../shared/Card';
import { useAppStore } from '../../store';
import { TrendingUp, BarChart3, Dumbbell, Activity, CalendarDays, Users, Clock, Zap } from 'lucide-react';
import { Bar } from 'react-chartjs-2';
import '../../lib/chartSetup';

import TimeFilterBar from '../BI/TimeFilterBar';
import KPICard from '../BI/KPICard';
import VolumeLoadChart from '../BI/VolumeLoadChart';
import MetricInfo from '../BI/MetricInfo';
import { filterByDateRange, calculateVolumeLoad, calculateMuscleGroupVolume } from '../../utils/biEngine';

function formatDurationMinutes(seconds) {
  if (!seconds) return '0 min';
  const mins = Math.round(seconds / 60);
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${mins} min`;
}

export default function GymDashboard() {
  const { gymSessions } = useAppStore();
  const [timeRange, setTimeRange] = useState('mes');
  const rangeKey = timeRange;

  const sessionsInRange = useMemo(() => filterByDateRange(gymSessions, rangeKey), [gymSessions, rangeKey]);
  const volumeData = useMemo(() => calculateVolumeLoad(gymSessions, rangeKey), [gymSessions, rangeKey]);
  const muscleVolume = useMemo(() => calculateMuscleGroupVolume(gymSessions, rangeKey), [gymSessions, rangeKey]);

  const { totalSets, volumeByDay } = useMemo(() => {
    let setsCount = 0;
    const byDay = {};
    
    sessionsInRange.forEach(session => {
      const dateStr = session.date;
      let sessionVol = 0;
      const sets = session.workout_session_sets || session.logs || [];
      sets.forEach(set => {
        if (set.reps != null && set.weight != null) {
          sessionVol += set.weight * set.reps;
          setsCount += 1;
        }
      });
      byDay[dateStr] = (byDay[dateStr] || 0) + sessionVol;
    });
    
    return {
      totalSets: setsCount,
      volumeByDay: byDay
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

  // Analytics de Aulas e Modalidades
  const classAnalytics = useMemo(() => {
    const classSessions = sessionsInRange.filter(s => s.kind === 'aula');
    const classMap = {};
    let totalClassSeconds = 0;
    let rpeSum = 0;
    let rpeCount = 0;

    classSessions.forEach(s => {
      const duration = Number(s.duration_seconds || 0);
      totalClassSeconds += duration;
      if (s.rpe) {
        rpeSum += Number(s.rpe);
        rpeCount++;
      }
      
      const cats = s.categories && s.categories.length > 0 ? s.categories : (s.name ? [s.name] : ['Aula de Grupo']);
      cats.forEach(cat => {
        if (!classMap[cat]) {
          classMap[cat] = { name: cat, count: 0, totalSeconds: 0, rpeSum: 0, rpeCount: 0 };
        }
        classMap[cat].count++;
        classMap[cat].totalSeconds += duration;
        if (s.rpe) {
          classMap[cat].rpeSum += Number(s.rpe);
          classMap[cat].rpeCount++;
        }
      });
    });

    const classList = Object.values(classMap).sort((a, b) => b.count - a.count);
    return {
      totalClasses: classSessions.length,
      totalClassSeconds,
      avgRpe: rpeCount > 0 ? (rpeSum / rpeCount).toFixed(1) : null,
      classList
    };
  }, [sessionsInRange]);

  // Shared scale options
  const darkScalesVertical = {
    y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: 'rgba(255,255,255,0.5)' } },
    x: { grid: { display: false }, ticks: { color: 'rgba(255,255,255,0.5)' } }
  };
  const darkScalesHorizontal = {
    x: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: 'rgba(255,255,255,0.5)' } },
    y: { grid: { display: false }, ticks: { color: 'rgba(255,255,255,0.5)' } }
  };
  const baseChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } }
  };

  return (
    <div className="space-y-4 fade-in">
      <TimeFilterBar activeRange={timeRange} onChange={setTimeRange} />
      
      <div className="grid grid-cols-3 gap-3">
        <KPICard label="Treinos" value={sessionsInRange.length} icon={CalendarDays} moduleColor="var(--mod-ginasio)" />
        <KPICard label="Vol. Carga" value={Math.round(volumeData.totalVolumeLoad).toLocaleString('pt-PT')} unit="kg" icon={TrendingUp} moduleColor="var(--mod-ginasio)" />
        <KPICard label="Séries" value={totalSets} icon={Activity} moduleColor="var(--mod-ginasio)" />
      </div>

      {sessionsInRange.length === 0 ? (
        <div className="min-h-[30vh] flex flex-col items-center justify-center text-center px-6 py-12 rounded-2xl bg-white/5 border border-white/10">
          <Dumbbell className="w-10 h-10 text-slate-500 mb-3" />
          <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
            Ainda não há treinos neste período. Termina uma sessão de treino para veres a tua evolução aqui.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {volumeData.weeklyBreakdown.length > 0 && (
            <VolumeLoadChart weeklyData={volumeData.weeklyBreakdown} acwr={{ ratio: volumeData.acwr, status: volumeData.acwrStatus }} />
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white/5 backdrop-blur-[20px] border border-white/60 rounded-2xl p-4 shadow-[0_16px_40px_rgba(0,0,0,0.3),inset_0_2px_10px_rgba(255,255,255,0.6)]">
              <p className="text-[11px] font-semibold text-slate-200 uppercase tracking-wider mb-3">Volume Diário (kg)</p>
              <div className="h-52 relative">
                <Bar data={volChartData} options={{ ...baseChartOptions, scales: darkScalesVertical }} />
              </div>
            </div>

            {Object.keys(muscleVolume).length > 0 && (
              <div className="bg-white/5 backdrop-blur-[20px] border border-white/60 rounded-2xl p-4 shadow-[0_16px_40px_rgba(0,0,0,0.3),inset_0_2px_10px_rgba(255,255,255,0.6)]">
                <p className="text-[11px] font-semibold text-slate-200 uppercase tracking-wider mb-3">Séries por Músculo</p>
                <div className="h-52 relative">
                  <Bar data={muscleChartData} options={{ ...baseChartOptions, indexAxis: 'y', scales: darkScalesHorizontal }} />
                </div>
              </div>
            )}
          </div>

          {/* Secção de Aulas e Modalidades de Grupo */}
          <div className="bg-white/5 backdrop-blur-[20px] border border-white/60 rounded-2xl p-4 shadow-[0_16px_40px_rgba(0,0,0,0.3),inset_0_2px_10px_rgba(255,255,255,0.6)]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-amber-500" />
                <h3 className="text-[12px] font-bold text-slate-200 uppercase tracking-wider">Aulas & Modalidades</h3>
              </div>
              <MetricInfo text="Registo das tuas aulas de grupo e modalidades (HIIT, Cycling, Pilates, CrossFit, etc.). Monitoriza a frequência semanal, tempo total investido e o nível de esforço percebido (RPE)." />
            </div>

            {classAnalytics.totalClasses > 0 ? (
              <div className="space-y-3">
                {/* Mini KPIs de Aulas */}
                <div className="grid grid-cols-3 gap-2 bg-white/5 rounded-xl p-3 border border-white/10 text-center">
                  <div>
                    <p className="text-base font-extrabold text-white leading-none">{classAnalytics.totalClasses}</p>
                    <p className="text-[10px] text-slate-400 mt-1">Aulas</p>
                  </div>
                  <div>
                    <p className="text-base font-extrabold text-white leading-none">
                      {formatDurationMinutes(classAnalytics.totalClassSeconds)}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-1">Tempo Total</p>
                  </div>
                  <div>
                    <p className="text-base font-extrabold text-amber-400 leading-none">
                      {classAnalytics.avgRpe ? `${classAnalytics.avgRpe} / 10` : '-'}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-1">Esforço Médio (RPE)</p>
                  </div>
                </div>

                {/* Lista de Modalidades */}
                <div className="space-y-1.5 mt-2">
                  {classAnalytics.classList.map(c => {
                    const avgClassRpe = c.rpeCount > 0 ? (c.rpeSum / c.rpeCount).toFixed(1) : null;
                    return (
                      <div key={c.name} className="flex items-center justify-between gap-3 py-2 px-3 rounded-xl bg-white/5 border border-white/5">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                          <div>
                            <p className="text-xs font-semibold text-slate-200">{c.name}</p>
                            <p className="text-[10px] text-slate-400">
                              {c.count} aula{c.count > 1 ? 's' : ''}
                              {c.totalSeconds > 0 ? ` · ${formatDurationMinutes(c.totalSeconds)}` : ''}
                            </p>
                          </div>
                        </div>
                        {avgClassRpe && (
                          <div className="text-right">
                            <span className="text-[11px] font-bold text-slate-300">RPE {avgClassRpe}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="py-6 flex flex-col items-center justify-center text-center">
                <Users className="w-8 h-8 text-slate-500 mb-2 opacity-50" />
                <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
                  Sem aulas registadas neste período. Ao registares aulas (HIIT, Cycling, Pilates, etc.), verás aqui o resumo e o esforço.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


