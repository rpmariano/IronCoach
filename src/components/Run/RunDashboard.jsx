import React, { useState, useMemo } from 'react';
import { useAppStore } from '../../store';
import { TrendingUp, BarChart3, Mountain } from 'lucide-react';
import { Bar } from 'react-chartjs-2';
import { format, subDays, startOfWeek, startOfMonth, parseISO, eachDayOfInterval } from 'date-fns';
import '../../lib/chartSetup';

function formatPace(secPerKm) {
  if (!isFinite(secPerKm) || secPerKm <= 0) return '—';
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')}/km`;
}

function formatDatePT(dateStr) {
  if (!dateStr) return '';
  const d = parseISO(dateStr);
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function getBestPaceData(allRuns, minKm) {
  const qualifying = allRuns.filter(r => Number(r.distance_km || 0) >= minKm);
  if (qualifying.length === 0) return null;

  const entries = qualifying
    .map(r => {
      let secPerKm = null;
      if (r.duration_seconds && r.distance_km) {
        secPerKm = Number(r.duration_seconds) / Number(r.distance_km);
      } else if (r.pace) {
        const parts = r.pace.replace('/km', '').split(':').map(Number);
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
          secPerKm = parts[0] * 60 + parts[1];
        }
      }
      return { run: r, pace: secPerKm };
    })
    .filter(e => e.pace !== null && e.pace > 0)
    .sort((a, b) => a.pace - b.pace);

  if (entries.length === 0) return null;

  return {
    pace: entries[0].pace,
    date: entries[0].run.date,
    count: entries.length
  };
}

export default function RunDashboard() {
  const { runs } = useAppStore();
  const [activeRange, setActiveRange] = useState('mes');

  // Compute date bounds based on activeRange
  const { startStr, endStr } = useMemo(() => {
    const today = new Date();
    const todayStr = format(today, 'yyyy-MM-dd');
    if (activeRange === 'semana') {
      const s = startOfWeek(today, { weekStartsOn: 1 });
      return { startStr: format(s, 'yyyy-MM-dd'), endStr: todayStr };
    }
    if (activeRange === 'mes') {
      const s = startOfMonth(today);
      return { startStr: format(s, 'yyyy-MM-dd'), endStr: todayStr };
    }
    // 'trimestre' (90 days)
    const s = subDays(today, 89);
    return { startStr: format(s, 'yyyy-MM-dd'), endStr: todayStr };
  }, [activeRange]);

  // Filter runs in range
  const periodRuns = useMemo(() => {
    return runs.filter(r => r.date >= startStr && r.date <= endStr);
  }, [runs, startStr, endStr]);

  const totalDist = useMemo(() => {
    return periodRuns.reduce((sum, r) => sum + Number(r.distance_km || 0), 0);
  }, [periodRuns]);

  const avgPaceSec = useMemo(() => {
    if (totalDist <= 0) return 0;
    const totalDuration = periodRuns.reduce((sum, r) => {
      if (r.duration_seconds) return sum + Number(r.duration_seconds);
      if (r.pace && r.distance_km) {
        const parts = r.pace.replace('/km', '').split(':').map(Number);
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
          return sum + (parts[0] * 60 + parts[1]) * Number(r.distance_km);
        }
      }
      return sum;
    }, 0);
    return totalDuration / totalDist;
  }, [periodRuns, totalDist]);

  // Best pace records across ALL runs
  const b5 = useMemo(() => getBestPaceData(runs, 5), [runs]);
  const b10 = useMemo(() => getBestPaceData(runs, 10), [runs]);
  const b21 = useMemo(() => getBestPaceData(runs, 21), [runs]);

  // Chart Data
  const chartData = useMemo(() => {
    if (periodRuns.length === 0) return null;
    const startObj = parseISO(startStr);
    const endObj = parseISO(endStr);
    const days = eachDayOfInterval({ start: startObj, end: endObj });

    const labels = days.map(d => format(d, 'dd/MM'));
    const data = days.map(d => {
      const dayStr = format(d, 'yyyy-MM-dd');
      const dayRuns = periodRuns.filter(r => r.date === dayStr);
      return dayRuns.reduce((sum, r) => sum + Number(r.distance_km || 0), 0);
    });

    return {
      labels,
      datasets: [
        {
          label: 'Distância (km)',
          data,
          backgroundColor: 'rgba(217, 70, 239, 0.6)',
          borderRadius: 4,
        }
      ]
    };
  }, [periodRuns, startStr, endStr]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
      x: { grid: { display: false } }
    }
  };

  // Watch metrics
  const watchMetrics = useMemo(() => {
    let elevation = 0;
    let calories = 0;
    let cadenceSum = 0;
    let cadenceCount = 0;

    periodRuns.forEach(r => {
      if (r.elevation_gain_m) elevation += Number(r.elevation_gain_m);
      if (r.calories_kcal) calories += Number(r.calories_kcal);
      if (r.avg_cadence_spm) {
        cadenceSum += Number(r.avg_cadence_spm);
        cadenceCount++;
      }
    });

    return {
      totalElevation: elevation,
      totalCalories: calories,
      avgCadence: cadenceCount > 0 ? Math.round(cadenceSum / cadenceCount) : null
    };
  }, [periodRuns]);

  const renderBucket = (label, b) => {
    if (!b) {
      return (
        <div className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-100 last:border-0">
          <p className="text-xs text-slate-500 font-medium">{label}</p>
          <p className="text-xs text-slate-400">Sem dados</p>
        </div>
      );
    }
    return (
      <div className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-100 last:border-0">
        <div>
          <p className="text-xs text-slate-500 font-medium">{label}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">
            {formatDatePT(b.date)} · {b.count} corrida{b.count > 1 ? 's' : ''}
          </p>
        </div>
        <p className="text-base font-extrabold text-slate-800">{formatPace(b.pace)}</p>
      </div>
    );
  };

  return (
    <div className="space-y-4 fade-in pb-8">
      {/* Header Evolução */}
      <div className="flex items-center gap-2">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm"
          style={{ background: 'linear-gradient(135deg, var(--mod-corrida-from), var(--mod-corrida-to))' }}
        >
          <TrendingUp className="w-5 h-5" style={{ color: '#fff' }} />
        </div>
        <div>
          <h2 className="text-sm font-bold text-slate-800 leading-none">Evolução</h2>
          <p className="text-[11px] text-slate-500 mt-1">{periodRuns.length} corrida(s) no período</p>
        </div>
      </div>

      {/* Range chips */}
      <div className="flex gap-2">
        {[
          { k: 'semana', l: 'Esta Semana' },
          { k: 'mes', l: 'Este Mês' },
          { k: 'trimestre', l: '3 Meses' }
        ].map(r => (
          <button
            key={r.k}
            onClick={() => setActiveRange(r.k)}
            className={`range-chip flex-1 ${activeRange === r.k ? 'active' : ''}`}
          >
            {r.l}
          </button>
        ))}
      </div>

      {/* Grid summary: 3 columns */}
      <div className="grid grid-cols-3 gap-2">
        <div className="card rounded-2xl p-3 text-center">
          <p className="text-lg font-bold text-slate-800 leading-none">{periodRuns.length}</p>
          <p className="text-[10px] text-slate-500 mt-1.5">Corridas</p>
        </div>
        <div className="card rounded-2xl p-3 text-center">
          <p className="text-lg font-bold text-slate-800 leading-none">{totalDist.toFixed(1)}</p>
          <p className="text-[10px] text-slate-500 mt-1.5">Distância (km)</p>
        </div>
        <div className="card rounded-2xl p-3 text-center">
          <p className="text-lg font-bold text-slate-800 leading-none">{formatPace(avgPaceSec)}</p>
          <p className="text-[10px] text-slate-500 mt-1.5">Pace médio</p>
        </div>
      </div>

      {/* Chart or Empty state */}
      {periodRuns.length === 0 ? (
        <div className="min-h-[25vh] flex flex-col items-center justify-center text-center px-6 py-6">
          <BarChart3 className="w-10 h-10 text-slate-400 mb-3" />
          <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
            Ainda não há corridas neste período. Regista uma corrida para veres a tua evolução aqui.
          </p>
        </div>
      ) : (
        <div className="card rounded-2xl p-4">
          <p className="text-[11px] font-semibold text-slate-700 mb-3">Distância por dia</p>
          <div className="h-44">
            <Bar data={chartData} options={chartOptions} />
          </div>
        </div>
      )}

      {/* Recordes: Melhor pace de sempre */}
      <div className="card rounded-2xl p-4">
        <h2 className="text-[11px] font-semibold text-slate-700 mb-2">Melhor pace de sempre</h2>
        <div className="space-y-1">
          {renderBucket('5 km+', b5)}
          {renderBucket('10 km+', b10)}
          {renderBucket('21 km+', b21)}
        </div>
      </div>

      {/* Watch Metrics Card (if any data) */}
      {(watchMetrics.totalElevation > 0 || watchMetrics.totalCalories > 0 || watchMetrics.avgCadence !== null) && (
        <div className="card rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[11px] font-semibold text-slate-700 flex items-center gap-1.5">
              <Mountain className="w-3.5 h-3.5 text-slate-500" /> Desnível, calorias e cadência
            </h2>
            <p className="text-[10px] text-slate-400">
              {activeRange === 'semana' ? 'Esta Semana' : activeRange === 'mes' ? 'Este Mês' : '3 Meses'}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-base font-extrabold text-slate-800 leading-none">
                {watchMetrics.totalElevation > 0 ? Math.round(watchMetrics.totalElevation) : '-'}
              </p>
              <p className="text-[10px] text-slate-500 mt-1">Desnível (m)</p>
            </div>
            <div>
              <p className="text-base font-extrabold text-slate-800 leading-none">
                {watchMetrics.totalCalories > 0 ? Math.round(watchMetrics.totalCalories) : '-'}
              </p>
              <p className="text-[10px] text-slate-500 mt-1">Calorias</p>
            </div>
            <div>
              <p className="text-base font-extrabold text-slate-800 leading-none">
                {watchMetrics.avgCadence !== null ? watchMetrics.avgCadence : '-'}
              </p>
              <p className="text-[10px] text-slate-500 mt-1">Cadência (spm)</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
