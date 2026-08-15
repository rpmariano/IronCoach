import React, { useState, useMemo } from 'react';
import { useAppStore } from '../../store';
import { Activity, LayoutDashboard } from 'lucide-react';
import TimeFilterBar from '../BI/TimeFilterBar';
import KPICard from '../BI/KPICard';
import CrossMetricsChart from '../BI/CrossMetricsChart';
import { calculateCrossMetrics, calculateACWR } from '../../utils/biEngine';

export default function CrossAnalyticsDashboard() {
  const { runs, gymSessions, meals, bodyAssessments } = useAppStore();
  const [activeRange, setActiveRange] = useState('mes');

  const crossData = useMemo(() => {
    return calculateCrossMetrics(runs, gymSessions, meals, bodyAssessments, activeRange);
  }, [runs, gymSessions, meals, bodyAssessments, activeRange]);

  const acwrStatusInfo = useMemo(() => {
    const acwr = calculateACWR(runs);
    return acwr;
  }, [runs]);

  return (
    <div className="space-y-4 fade-in pb-8">
      {/* Header Evolução */}
      <div className="flex items-center gap-2">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm"
          style={{ background: 'linear-gradient(135deg, var(--green-dark), var(--green-glow))' }}
        >
          <LayoutDashboard className="w-5 h-5" style={{ color: '#fff' }} />
        </div>
        <div>
          <h2 className="text-sm font-bold text-slate-800 leading-none">Análise Holística</h2>
          <p className="text-[11px] text-slate-500 mt-1">Cruzamento de dados</p>
        </div>
      </div>

      <TimeFilterBar activeRange={activeRange} onChange={setActiveRange} />

      <div className="grid grid-cols-2 gap-2">
        <KPICard
          label="ACWR Combinado"
          value={crossData.combinedACWR > 0 ? crossData.combinedACWR.toFixed(2) : '-'}
          status={crossData.combinedACWR > 1.5 ? 'danger' : crossData.combinedACWR > 1.3 ? 'caution' : 'safe'}
          icon={Activity}
          moduleColor="var(--accent)"
        />
        <KPICard
          label="Status de Corrida"
          value={acwrStatusInfo.status === 'safe' ? 'Seguro' : acwrStatusInfo.status === 'danger' ? 'Alerta' : 'Atenção'}
          status={acwrStatusInfo.status}
          icon={Activity}
          moduleColor="var(--mod-corrida)"
        />
      </div>

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
        <div className="card rounded-2xl p-6 text-center">
          <p className="text-xs text-slate-500">Registe avaliações corporais e corridas para ver a relação de Peso vs Pace.</p>
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
        <div className="card rounded-2xl p-6 text-center">
          <p className="text-xs text-slate-500">Registe treinos de ginásio e corridas para analisar a interferência.</p>
        </div>
      )}
    </div>
  );
}
