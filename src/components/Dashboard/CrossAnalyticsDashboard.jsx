import React, { useState, useMemo } from 'react';
import { useAppStore } from '../../store';
import { Activity, Droplet, Moon, Scale, Zap } from 'lucide-react';
import TimeFilterBar from '../BI/TimeFilterBar';
import CrossMetricsChart from '../BI/CrossMetricsChart';
import { calculateCrossMetrics, calculateWeightTrend } from '../../utils/biEngine';
import { startOfDay, parseISO, isAfter, subDays } from 'date-fns';

function PremiumMetricCard({ title, value, unit, subtitle, icon: Icon, color, gradient, trend }) {
  return (
    <div className="bg-white/60 backdrop-blur-md border border-white/80 rounded-2xl p-4 shadow-[0_8px_20px_rgba(0,0,0,0.03),inset_0_2px_10px_rgba(255,255,255,0.6)] relative overflow-hidden group">
      <div 
        className="absolute inset-0 opacity-[0.04] transition-opacity group-hover:opacity-[0.08]"
        style={{ background: gradient || `linear-gradient(135deg, ${color}, transparent)` }}
      />
      <div className="flex justify-between items-start mb-2 relative z-10">
        <div className="p-2 rounded-xl" style={{ backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)` }}>
          <Icon size={18} style={{ color }} strokeWidth={2.5} />
        </div>
        {trend !== undefined && (
          <div className={`px-2 py-1 rounded-lg text-[10px] font-bold ${trend > 0 ? 'bg-emerald-100 text-emerald-700' : trend < 0 ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>
            {trend > 0 ? '+' : ''}{trend}{typeof trend === 'number' && trend % 1 !== 0 && !title.includes('Hidrata') ? '' : ''}
          </div>
        )}
      </div>
      <div className="relative z-10">
        <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">{title}</h3>
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-black text-slate-800 tracking-tight">{value}</span>
          {unit && <span className="text-xs font-semibold text-slate-500">{unit}</span>}
        </div>
        <p className="text-[10px] text-slate-500 mt-1 font-medium">{subtitle}</p>
      </div>
    </div>
  );
}

export default function CrossAnalyticsDashboard() {
  const { runs, gymSessions, meals, bodyAssessments, waterLogs } = useAppStore();
  const [activeRange, setActiveRange] = useState('mes');

  // Existing cross metrics
  const crossData = useMemo(() => {
    return calculateCrossMetrics(runs, gymSessions, meals, bodyAssessments, activeRange);
  }, [runs, gymSessions, meals, bodyAssessments, activeRange]);

  // Weight Data
  const weightTrend = useMemo(() => calculateWeightTrend(bodyAssessments), [bodyAssessments]);
  const currentWeight = weightTrend?.movingAverage?.length > 0 
    ? weightTrend.movingAverage[weightTrend.movingAverage.length - 1].weight 
    : '-';
    
  // Water Data
  const waterMetrics = useMemo(() => {
    if (!waterLogs || waterLogs.length === 0) return { avg: 0, trend: 0 };
    const today = startOfDay(new Date());
    const weekAgo = subDays(today, 7);
    const twoWeeksAgo = subDays(today, 14);
    
    let thisWeekTotal = 0;
    let lastWeekTotal = 0;
    
    waterLogs.forEach(log => {
      const d = parseISO(log.date);
      if (isAfter(d, weekAgo)) thisWeekTotal += (log.amount_ml || 0);
      else if (isAfter(d, twoWeeksAgo) && !isAfter(d, weekAgo)) lastWeekTotal += (log.amount_ml || 0);
    });
    
    const avg = Math.round(thisWeekTotal / 7 / 1000 * 10) / 10; // in Liters
    const lastAvg = Math.round(lastWeekTotal / 7 / 1000 * 10) / 10;
    const trend = lastAvg > 0 ? Math.round(((avg - lastAvg) / lastAvg) * 100) : 0;
    
    return { avg, trend };
  }, [waterLogs]);

  return (
    <div className="space-y-4 fade-in pb-8">
      {/* Header Holística */}
      <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-3xl p-5 text-white shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -translate-y-10 translate-x-10" />
        <div className="relative z-10 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black tracking-tight flex items-center gap-2">
              <Activity className="w-5 h-5 text-amber-200" />
              Visão Holística
            </h2>
            <p className="text-sm text-amber-100/90 font-medium mt-1 max-w-[210px] leading-snug">
              A interligação do teu treino, descanso e nutrição.
            </p>
          </div>
        </div>
      </div>

      <TimeFilterBar activeRange={activeRange} onChange={setActiveRange} />

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 gap-3">
        <PremiumMetricCard
          title="Hidratação"
          value={waterMetrics.avg > 0 ? waterMetrics.avg.toFixed(1) : '-'}
          unit="L/dia"
          subtitle="Média 7 dias"
          icon={Droplet}
          color="#0ea5e9"
          trend={waterMetrics.trend ? `${waterMetrics.trend}%` : undefined}
        />
        <PremiumMetricCard
          title="Peso Real"
          value={currentWeight}
          unit="kg"
          subtitle={weightTrend?.trend === 'descendo' ? 'Em perda' : weightTrend?.trend === 'subindo' ? 'Em ganho' : 'Estável'}
          icon={Scale}
          color="#6366f1"
          trend={weightTrend?.weeklyRate}
        />
        <PremiumMetricCard
          title="Fadiga (ACWR)"
          value={crossData.combinedACWR > 0 ? crossData.combinedACWR.toFixed(2) : '-'}
          subtitle={crossData.combinedACWR > 1.5 ? 'Sobrecarga Alta' : crossData.combinedACWR > 1.3 ? 'Atenção' : 'Treino Seguro'}
          icon={Zap}
          color="#f59e0b"
        />
        <PremiumMetricCard
          title="Qualidade Sono"
          value="-"
          unit="hrs"
          subtitle="Integração em breve"
          icon={Moon}
          color="#8b5cf6"
        />
      </div>

      {/* Cross Analytics Charts */}
      {crossData.weightVsPace.length > 0 ? (
        <CrossMetricsChart
          title="Impacto do Peso no Pace"
          leftData={{
            label: 'Peso (kg)',
            data: crossData.weightVsPace.map(d => ({ x: d.date, y: d.weight })),
            color: 'var(--mod-corpo-to, #6366f1)',
            unit: 'kg'
          }}
          rightData={{
            label: 'Pace (s/km)',
            data: crossData.weightVsPace.map(d => ({ x: d.date, y: d.pace })),
            color: 'var(--mod-corrida-to, #c026d3)',
            unit: 's'
          }}
          className="mb-4"
        />
      ) : (
        <div className="bg-white/50 border border-slate-200/50 rounded-3xl p-6 text-center">
          <p className="text-xs font-medium text-slate-500">Registe avaliações corporais e corridas para ver a relação de Peso vs Pace.</p>
        </div>
      )}

      {crossData.gymLoadVsRunRPE.length > 0 ? (
        <CrossMetricsChart
          title="Impacto do Ginásio na Corrida"
          leftData={{
            label: 'Volume Ginásio (kg)',
            data: crossData.gymLoadVsRunRPE.map(d => ({ x: d.date, y: d.gymVolume })),
            color: 'var(--mod-ginasio-to, #facc15)',
            unit: 'kg'
          }}
          rightData={{
            label: 'Esforço Corrida (RPE)',
            data: crossData.gymLoadVsRunRPE.map(d => ({ x: d.date, y: d.runRPE })),
            color: 'var(--mod-corrida-to, #3b82f6)',
            unit: 'RPE'
          }}
        />
      ) : (
        <div className="bg-white/50 border border-slate-200/50 rounded-3xl p-6 text-center">
          <p className="text-xs font-medium text-slate-500">Registe treinos de ginásio e corridas para analisar a interferência.</p>
        </div>
      )}
    </div>
  );
}
