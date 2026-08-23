import React, { useMemo } from 'react';
import { getVDOTTrend, calculateWeightTrend } from '../../utils/biEngine';
import CrossMetricsChart from './CrossMetricsChart';
import { Compass, Info } from 'lucide-react';

function getAeroWeightAnalysis(data) {
  if (!data || data.length < 2) return null;
  const first = data[0];
  const last = data[data.length - 1];
  
  const vdotDiff = last.vdot - first.vdot;
  const weightDiff = last.weight - first.weight;
  
  if (vdotDiff >= 0 && weightDiff < 0) {
    return { title: 'Evolução Perfeita', desc: 'A tua performance aeróbica subiu (ou estabilizou) enquanto o peso desceu. O emagrecimento está a traduzir-se em eficácia!', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' };
  }
  if (vdotDiff > 0 && weightDiff >= 0) {
    return { title: 'Motor Forte', desc: 'A tua performance aeróbica evoluiu mesmo sem perda de peso. O treino está a fazer efeito!', color: 'text-indigo-700', bg: 'bg-indigo-50 border-indigo-200' };
  }
  if (vdotDiff < 0 && weightDiff < 0) {
    return { title: 'Atenção ao Défice', desc: 'Estás a perder peso, mas o teu VDOT caiu. Atenção ao défice calórico excessivo (risco de RED-S) ou falta de recuperação muscular.', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' };
  }
  if (vdotDiff < 0 && weightDiff >= 0) {
    return { title: 'Desempenho em Queda', desc: 'A performance caiu e o peso não desceu. O aumento de peso pode estar a prejudicar o teu VDOT, ou há fadiga acumulada. Revê a nutrição e o descanso.', color: 'text-rose-700', bg: 'bg-rose-50 border-rose-200' };
  }
  return null;
}

export default function PerformanceCompass({ data }) {
  const { runs, bodyAssessments } = data;

  // 1. Eficiência Aeróbica vs Peso Suavizado
  const aeroVsWeightData = useMemo(() => {
    const vdotData = getVDOTTrend(runs || []);
    const weightData = calculateWeightTrend(bodyAssessments || [])?.movingAverage || [];
    
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

  const analysis = useMemo(() => getAeroWeightAnalysis(aeroVsWeightData), [aeroVsWeightData]);

  return (
    <div className="bg-white/40 backdrop-blur-3xl border border-white/60 p-4 rounded-3xl shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
      <div className="flex items-center gap-2 mb-4 px-1">
        <Compass className="w-5 h-5 text-indigo-500" />
        <h3 className="text-base font-black text-slate-800 tracking-tight">Bússola de Desempenho</h3>
      </div>
      
      <div className="space-y-4">
        {aeroVsWeightData.length > 1 ? (
          <>
            <CrossMetricsChart
              title="Eficiência Aeróbica vs. Peso Suavizado (EWMA)"
              helpText="Cruza a tua performance aeróbica (VDOT) estimada pelo ritmo e pulsação das corridas, com o teu Peso Real. O peso é suavizado usando uma Média Móvel Exponencial (EWMA) para eliminar o ruído das flutuações diárias de água e glicogénio. O objetivo é veres o VDOT a subir!"
              leftData={{
                label: 'Performance (VDOT)',
                data: aeroVsWeightData.map(d => ({ x: d.date, y: d.vdot })),
                color: '#c026d3', // Magenta
                unit: ''
              }}
              rightData={{
                label: 'Peso EWMA (kg)',
                data: aeroVsWeightData.map(d => ({ x: d.date, y: d.weight })),
                color: '#6366f1', // Indigo
                unit: 'kg'
              }}
            />
            
            {analysis && (
              <div className={`p-4 rounded-2xl border ${analysis.bg} shadow-sm`}>
                <div className="flex items-center gap-2 mb-1.5">
                  <Info className={`w-4 h-4 ${analysis.color}`} />
                  <span className={`text-sm font-bold ${analysis.color}`}>{analysis.title}</span>
                </div>
                <p className={`text-xs ${analysis.color} opacity-90 leading-relaxed`}>
                  {analysis.desc}
                </p>
              </div>
            )}
          </>
        ) : (
          <div className="h-48 flex items-center justify-center bg-white/20 rounded-2xl border border-white/40">
            <p className="text-xs font-medium text-slate-500">Regista avaliações corporais e treinos intervalados para analisar a eficiência aeróbica.</p>
          </div>
        )}
      </div>
    </div>
  );
}
