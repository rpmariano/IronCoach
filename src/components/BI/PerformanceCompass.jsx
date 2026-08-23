import React, { useMemo } from 'react';
import { getVDOTTrend, calculateWeightTrend, calculate1RMProgression, calculateWeeklyVolume } from '../../utils/biEngine';
import CrossMetricsChart from './CrossMetricsChart';
import { Compass } from 'lucide-react';
import { Scatter } from 'react-chartjs-2';
import MetricInfo from './MetricInfo';

// Custom Scatter Chart for Hybrid Strength
function HybridStrengthChart({ data, className = '' }) {
  const chartData = {
    datasets: [
      {
        label: 'Sessões',
        data: data.map(d => ({
          x: d.volKm,
          y: d.rm1,
          rawDate: d.date
        })),
        backgroundColor: 'rgba(250, 204, 21, 0.6)', // var(--mod-ginasio-to)
        borderColor: '#eab308',
        pointRadius: 6,
        pointHoverRadius: 8,
      }
    ]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        titleColor: '#f8fafc',
        bodyColor: '#f8fafc',
        borderColor: 'rgba(255,255,255,0.15)',
        borderWidth: 1,
        padding: 10,
        callbacks: {
          label: (context) => {
            const pt = context.raw;
            return ` ${pt.x} km/sem → ${Math.round(pt.y)} kg (1RM)`;
          }
        }
      }
    },
    scales: {
      x: {
        title: { display: true, text: 'Volume Corrida (km/sem)', color: '#64748b' },
        grid: { display: false }
      },
      y: {
        title: { display: true, text: '1RM Estimado (kg)', color: '#64748b' },
        grid: { color: 'rgba(255, 255, 255, 0.05)' }
      }
    }
  };

  return (
    <div className={`bg-white/5 backdrop-blur-[20px] border border-white/60 rounded-2xl p-4 shadow-[0_16px_40px_rgba(0,0,0,0.3),inset_0_2px_10px_rgba(255,255,255,0.6)] ${className}`}>
      <div className="flex items-start mb-3">
        <h3 className="text-[12px] font-bold text-slate-700">Manutenção de Força Híbrida</h3>
        <MetricInfo text="Cruza o volume semanal de corrida com a tua força (1RM) em exercícios compostos no ginásio. Atletas híbridos querem ver a linha reta ou subir, garantindo que a corrida não canibaliza a força." />
      </div>
      <div className="h-64 relative">
        <Scatter data={chartData} options={options} />
      </div>
    </div>
  );
}

export default function PerformanceCompass({ data }) {
  const { runs, bodyAssessments, gymSessions } = data;

  // 1. Eficiência Aeróbica vs Peso Suavizado
  const aeroVsWeightData = useMemo(() => {
    const vdotData = getVDOTTrend(runs || []);
    const weightData = calculateWeightTrend(bodyAssessments || [])?.movingAverage || [];
    
    // We need to synchronize the dates to show them on the same X-axis.
    // Let's create a combined timeline based on VDOT entries, matching with the closest EWMA weight.
    const combined = [];
    vdotData.forEach(v => {
      const closestWeight = weightData.reduce((best, w) => {
        const diff = Math.abs(new Date(w.date) - new Date(v.date));
        return (!best || diff < best.diff) ? { weight: w.weight, diff } : best;
      }, null);
      
      // Apenas cruza dados se a avaliação corporal foi há menos de 7 dias (7 * 86400000 ms)
      if (closestWeight && closestWeight.diff <= 7 * 86400000) {
        combined.push({ date: v.date, vdot: v.vdot, weight: closestWeight.weight });
      }
    });

    return combined;
  }, [runs, bodyAssessments]);

  // 2. Força Híbrida (Agachamento/Base vs Volume Semanal Corrida)
  const hybridStrengthData = useMemo(() => {
    // Pegamos no histórico de um composto base, por ex: Agachamento.
    // O ideal seria que o exercício base viesse do perfil, mas usamos 'Agachamento' como padrão.
    const rmProgression = calculate1RMProgression(gymSessions || [], 'Agachamento');
    const weeklyVol = calculateWeeklyVolume(runs || []);
    
    const combined = [];
    rmProgression.forEach(rm => {
      // Find the week this 1RM was performed in
      const rmDate = new Date(rm.date);
      // We'll just look for a week in weeklyVol that contains this date, or just match by nearest week start.
      // weeklyVol uses 'yyyy-MM-dd' string for the monday of the week.
      const nearestWeek = weeklyVol.reduce((best, w) => {
        const diff = Math.abs(new Date(w.weekLabel) - rmDate);
        return (!best || diff < best.diff) ? { vol: w.distanceKm, diff } : best;
      }, null);

      // Apenas aceita se a semana de corrida for a mesma ou vizinha (até 14 dias de diferença)
      if (nearestWeek && nearestWeek.vol > 0 && nearestWeek.diff <= 14 * 86400000) {
        combined.push({ date: rm.date, rm1: rm.estimated1RM, volKm: nearestWeek.vol });
      }
    });
    
    return combined;
  }, [gymSessions, runs]);

  return (
    <div className="bg-white/40 backdrop-blur-3xl border border-white/60 p-4 rounded-3xl shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
      <div className="flex items-center gap-2 mb-4 px-1">
        <Compass className="w-5 h-5 text-indigo-500" />
        <h3 className="text-base font-black text-slate-800 tracking-tight">Bússola de Desempenho</h3>
      </div>
      
      <div className="space-y-4">
        {aeroVsWeightData.length > 1 ? (
          <CrossMetricsChart
            title="Eficiência Aeróbica vs. Peso Suavizado (EWMA)"
            leftData={{
              label: 'Performance (VDOT)',
              data: aeroVsWeightData.map(d => ({ x: d.date, y: d.vdot })),
              color: 'var(--mod-corrida-to, #c026d3)',
              unit: ''
            }}
            rightData={{
              label: 'Peso EWMA (kg)',
              data: aeroVsWeightData.map(d => ({ x: d.date, y: d.weight })),
              color: 'var(--mod-corpo-to, #6366f1)',
              unit: 'kg'
            }}
          />
        ) : (
          <div className="h-48 flex items-center justify-center bg-white/20 rounded-2xl border border-white/40">
            <p className="text-xs font-medium text-slate-500">Regista avaliações corporais e treinos intervalados para analisar a eficiência aeróbica.</p>
          </div>
        )}

        {hybridStrengthData.length > 0 ? (
          <HybridStrengthChart data={hybridStrengthData} />
        ) : (
          <div className="h-48 flex items-center justify-center bg-white/20 rounded-2xl border border-white/40">
            <p className="text-xs font-medium text-slate-500">Regista treinos de Agachamento e Corridas para veres a força híbrida.</p>
          </div>
        )}
      </div>
    </div>
  );
}
