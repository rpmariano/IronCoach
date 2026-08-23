import React, { useState, useMemo } from 'react';
import { ChevronDown, BarChart2 } from 'lucide-react';
import CrossMetricsChart from './CrossMetricsChart';
import AnalysisAlert from './AnalysisAlert';
import { calculateCrossMetrics, getVDOTTrend, calculateWeightTrend } from '../../utils/biEngine';

export default function CrossAnalysisSection({ runs, gymSessions, meals, bodyAssessments }) {
  const [open, setOpen] = useState(false);

  const crossData = useMemo(() =>
    calculateCrossMetrics(runs || [], gymSessions || [], meals || [], bodyAssessments || [], 'mes'),
    [runs, gymSessions, meals, bodyAssessments]
  );

  const vdotTrend = useMemo(() => getVDOTTrend(runs || []), [runs]);
  const weightTrend = useMemo(() => calculateWeightTrend(bodyAssessments || []), [bodyAssessments]);

  // Build VDOT vs Weight data for PerformanceCompass chart
  const vdotVsWeightData = useMemo(() => {
    if (!vdotTrend?.length || !weightTrend?.movingAverage?.length) return [];
    return vdotTrend.map(v => {
      const closestW = weightTrend.movingAverage.reduce((prev, cur) =>
        Math.abs(cur.date?.localeCompare?.(v.date) || 0) < Math.abs(prev.date?.localeCompare?.(v.date) || 0) ? cur : prev
      , weightTrend.movingAverage[0]);
      return { date: v.date, left: closestW?.weight || null, right: v.vdot };
    }).filter(d => d.left && d.right);
  }, [vdotTrend, weightTrend]);

  // Auto-analysis for Gym vs Run
  const gymRunAnalysis = useMemo(() => {
    if (!crossData.gymLoadVsRunRPE?.length) return null;
    const recent = crossData.gymLoadVsRunRPE.slice(-4);
    const avgGym = recent.reduce((s, d) => s + (d.gymVolume || 0), 0) / recent.length;
    const avgRPE = recent.reduce((s, d) => s + (d.runRPE || 0), 0) / recent.length;
    if (avgGym > 5000 && avgRPE > 7) {
      return { title: 'Interferência Ginásio → Corrida', desc: 'O volume de ginásio elevado das últimas semanas coincide com um esforço percebido alto nas corridas. Considera reduzir o volume de força antes de sessões de corrida de qualidade.', severity: 'warning' };
    } else if (avgGym > 0 && avgRPE < 6) {
      return { title: 'Boa Gestão da Carga Cruzada', desc: 'O teu volume de ginásio e o esforço nas corridas estão bem equilibrados. Continua assim!', severity: 'success' };
    }
    return null;
  }, [crossData]);

  return (
    <div className="bg-white/5 backdrop-blur-[20px] border border-white/60 rounded-2xl shadow-[0_8px_20px_rgba(0,0,0,0.2)] overflow-hidden">
      {/* Toggle button */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition"
      >
        <div className="flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-indigo-400" />
          <span className="text-sm font-bold text-white">Análise Cruzada</span>
          <span className="text-[10px] text-slate-400 font-medium ml-1">Interações entre pilares</span>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Expandable content */}
      <div className={`grid transition-all duration-300 ease-in-out ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="overflow-hidden">
          <div className="px-4 pb-4 space-y-4 pt-2 border-t border-white/10">

            {/* Weight vs VDOT */}
            {vdotVsWeightData.length > 0 ? (
              <>
                <CrossMetricsChart
                  title="Eficiência Aeróbica vs. Peso"
                  helpText="Mostra se perder peso está a melhorar o teu VDOT (capacidade aeróbica). Uma descida de peso com VDOT a subir é o sinal ideal de recomposição corporal eficaz para o corredor."
                  leftData={{
                    label: 'Peso (kg)',
                    data: vdotVsWeightData.map(d => ({ x: d.date, y: d.left })),
                    color: '#6366f1',
                    unit: 'kg'
                  }}
                  rightData={{
                    label: 'VDOT',
                    data: vdotVsWeightData.map(d => ({ x: d.date, y: d.right })),
                    color: '#c026d3',
                    unit: ''
                  }}
                />
              </>
            ) : (
              <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-center">
                <p className="text-xs text-slate-400">Regista avaliações corporais e corridas com tempo para ver a relação Peso vs VDOT.</p>
              </div>
            )}

            {/* Gym vs Run RPE */}
            {crossData.gymLoadVsRunRPE?.length > 0 ? (
              <>
                <CrossMetricsChart
                  title="Impacto do Ginásio na Corrida"
                  helpText="Cruza o volume de ginásio (kg levantados) com o esforço percebido (RPE) nas corridas seguintes. Um RPE alto nas semanas de muito ginásio pode indicar fadiga central acumulada."
                  leftData={{
                    label: 'Volume Ginásio (kg)',
                    data: crossData.gymLoadVsRunRPE.map(d => ({ x: d.date, y: d.gymVolume })),
                    color: '#facc15',
                    unit: 'kg'
                  }}
                  rightData={{
                    label: 'Esforço Corrida (RPE)',
                    data: crossData.gymLoadVsRunRPE.map(d => ({ x: d.date, y: d.runRPE })),
                    color: '#3b82f6',
                    unit: 'RPE'
                  }}
                />
                {gymRunAnalysis && (
                  <AnalysisAlert title={gymRunAnalysis.title} desc={gymRunAnalysis.desc} severity={gymRunAnalysis.severity} />
                )}
              </>
            ) : (
              <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-center">
                <p className="text-xs text-slate-400">Regista treinos de ginásio e corridas com RPE para analisar a interferência entre modalidades.</p>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
