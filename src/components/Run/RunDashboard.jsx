import React, { useState, useMemo } from 'react';
import { useAppStore } from '../../store';
import { TrendingUp, BarChart3, Mountain, Activity, Target, Zap, Timer, HeartPulse } from 'lucide-react';
import { Bar } from 'react-chartjs-2';
import { format, subDays, startOfWeek, startOfMonth, parseISO, eachDayOfInterval } from 'date-fns';
import '../../lib/chartSetup';
import TimeFilterBar from '../BI/TimeFilterBar';
import KPICard from '../BI/KPICard';
import ACWRChart from '../BI/ACWRChart';
import IntensityDonut from '../BI/IntensityDonut';
import ScatterTrendChart from '../BI/ScatterTrendChart';
import RacePredictionChart from '../BI/RacePredictionChart';
import { filterByDateRange, calculateACWR, calculateTrainingDistribution, calculatePaceVsHR, calculateWeeklyVolume, getVDOTTrend, predictRaceTime, calculateACWRHistory } from '../../utils/biEngine';

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
  const { runs, profile, raceEvents = [] } = useAppStore();
  const [activeRange, setActiveRange] = useState('mes');

  const experienceLevel = profile?.experience_level || 'beginner';

  // BI Data processing
  const periodRuns = useMemo(() => 
    filterByDateRange(runs, activeRange), 
  [runs, activeRange]);

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

  // BI - ACWR
  const acwrData = useMemo(() => calculateACWR(runs), [runs]);
  const acwrWeeklyData = useMemo(() => calculateACWRHistory(runs), [runs]);

  // BI - Distribution
  const distribution = useMemo(() => calculateTrainingDistribution(periodRuns), [periodRuns]);

  // BI - Scatter
  const scatterData = useMemo(() => calculatePaceVsHR(periodRuns), [periodRuns]);

  // Evolução do VDOT — sobre TODAS as corridas, não só as do período: a
  // tendência de forma só faz sentido com histórico longo, e é ela que dá
  // contexto à previsão de prova.
  const vdotTrend = useMemo(() => getVDOTTrend(runs), [runs]);

  // Future Races
  const futureRaces = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return raceEvents.filter(r => r.date >= today).sort((a,b) => a.date.localeCompare(b.date));
  }, [raceEvents]);

  // Best pace records across ALL runs
  const b5 = useMemo(() => getBestPaceData(runs, 5), [runs]);
  const b10 = useMemo(() => getBestPaceData(runs, 10), [runs]);
  const b21 = useMemo(() => getBestPaceData(runs, 21), [runs]);

  // Daily Distance Bar Chart Data
  const chartData = useMemo(() => {
    if (periodRuns.length === 0) return null;
    
    // Calcula startObj e endObj com base nos dados reais ou no activeRange
    const now = new Date();
    let startObj = now;
    switch (activeRange) {
      case 'semana': startObj = subDays(now, 7); break;
      case 'mes': startObj = subDays(now, 30); break;
      case 'trimestre': startObj = subDays(now, 90); break;
      case '6meses': startObj = subDays(now, 180); break;
      case 'ano': startObj = subDays(now, 365); break;
    }
    const endObj = now;
    
    if (startObj > endObj) return null;
    
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
          backgroundColor: (context) => {
            const chart = context.chart;
            const { ctx, chartArea } = chart;
            if (!chartArea) return 'rgba(59, 130, 246, 0.6)';
            
            const gradient = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
            gradient.addColorStop(0, 'rgba(59, 130, 246, 0.2)');
            gradient.addColorStop(1, 'rgba(59, 130, 246, 0.8)');
            return gradient;
          },
          borderRadius: 6,
          borderSkipped: false,
        }
      ]
    };
    // startObj/endObj são derivados de activeRange aqui dentro — as antigas
    // startDate/endDate deixaram de existir na reescrita e ficaram nas
    // dependências, o que rebentava o componente ao montar (ReferenceError).
  }, [periodRuns, activeRange]);

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
      {/* 1. TimeFilterBar */}
      <TimeFilterBar
        activeRange={activeRange}
        onChange={setActiveRange}
      />

      {/* Header Evolução */}
      <div className="flex items-center gap-2">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm"
          style={{ background: 'linear-gradient(135deg, var(--mod-corrida), #2563eb)' }}
        >
          <TrendingUp className="w-5 h-5" style={{ color: '#fff' }} />
        </div>
        <div>
          <h2 className="text-sm font-bold text-slate-800 leading-none">Evolução e BI</h2>
          <p className="text-[11px] text-slate-500 mt-1">{periodRuns.length} corrida(s) no período selecionado</p>
        </div>
      </div>

      {/* 2. KPICard row (2x2 grid) */}
      <div className="grid grid-cols-2 gap-3">
        <KPICard 
          label="Total Corridas" 
          value={periodRuns.length} 
          icon={Activity}
          moduleColor="var(--mod-corrida)"
        />
        <KPICard 
          label="Distância Total" 
          value={`${totalDist.toFixed(1)}`} 
          unit="km"
          icon={TrendingUp}
          moduleColor="var(--mod-corrida)"
        />
        <KPICard 
          label="Pace Médio" 
          value={formatPace(avgPaceSec)} 
          icon={Timer}
          moduleColor="var(--mod-corrida)"
        />
        <KPICard 
          label="ACWR Status" 
          value={acwrData?.status === 'safe' ? 'Ideal' : acwrData?.status === 'caution' ? 'Alerta' : 'Perigo'} 
          icon={Zap}
          moduleColor="var(--mod-corrida)"
          status={acwrData?.status || 'neutral'}
        />
      </div>

      {/* 3-6. Gráficos BI.
          Cada componente já traz o seu próprio cartão, título e alturas, por
          isso é montado direto, sem wrapper. Estavam embrulhados num .card
          com <h3> e altura fixa: dava título a dobrar, e o h-44 de fora
          (176px) era menor que o h-64 de dentro (256px + padding + título),
          o que fazia o conteúdo transbordar e sobrepor-se ao cartão
          seguinte. Também não levam className="card" — a classe repete o
          fundo/borda/sombra que o componente já aplica. */}
      <ACWRChart weeklyData={acwrWeeklyData} />

      {/* Ambos dependem de dados que as corridas manuais não trazem (zonas de
          FC, FC média) — sem guarda, o donut fica só com o anel vazio e o
          "0%" a solo, e o scatter fica sem nenhum ponto, os dois sem
          explicação. Mesmo tratamento de vazio que o resto do BI (ver
          CrossAnalyticsDashboard). */}
      {(distribution.lowIntensityPct > 0 || distribution.highIntensityPct > 0) ? (
        <IntensityDonut distribution={distribution} />
      ) : (
        <div className="bg-white/5 backdrop-blur-[20px] border border-white/60 rounded-2xl p-6 text-center shadow-[0_16px_40px_rgba(0,0,0,0.3),inset_0_2px_10px_rgba(255,255,255,0.6)]">
          <Activity className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          <p className="text-xs font-medium text-slate-500">Regista corridas com zonas de frequência cardíaca (relógio/app) para veres a Distribuição de Intensidade.</p>
        </div>
      )}

      {scatterData.length > 0 ? (
        <ScatterTrendChart data={scatterData} />
      ) : (
        <div className="bg-white/5 backdrop-blur-[20px] border border-white/60 rounded-2xl p-6 text-center shadow-[0_16px_40px_rgba(0,0,0,0.3),inset_0_2px_10px_rgba(255,255,255,0.6)]">
          <HeartPulse className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          <p className="text-xs font-medium text-slate-500">Regista corridas com frequência cardíaca média para veres a Eficiência Aeróbica.</p>
        </div>
      )}

      {futureRaces.map((race, i) => (
        <RacePredictionChart
          key={race.id ?? i}
          vdotTrend={vdotTrend}
          prediction={predictRaceTime(runs, race.distance_km, experienceLevel)}
        />
      ))}

      {/* 7. Daily Distance Bar Chart */}
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

      {/* 8. Recordes: Melhor pace de sempre */}
      <div className="card rounded-2xl p-4">
        <h2 className="text-[11px] font-semibold text-slate-700 mb-2">Melhor pace de sempre</h2>
        <div className="space-y-1">
          {renderBucket('5 km+', b5)}
          {renderBucket('10 km+', b10)}
          {renderBucket('21 km+', b21)}
        </div>
      </div>

      {/* 9. Watch Metrics Card (if any data) */}
      {(watchMetrics.totalElevation > 0 || watchMetrics.totalCalories > 0 || watchMetrics.avgCadence !== null) && (
        <div className="card rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[11px] font-semibold text-slate-700 flex items-center gap-1.5">
              <Mountain className="w-3.5 h-3.5 text-slate-500" /> Desnível, calorias e cadência
            </h2>
            <p className="text-[10px] text-slate-400 capitalize">
              {activeRange.replace('mes', 'mês').replace('6meses', '6 Meses')}
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
