import React, { useMemo } from 'react';
import { calculateTrainingDistribution, calculateMacroAdherence } from '../../utils/biEngine';
import IntensityDonut from './IntensityDonut';
import MacroComplianceChart from './MacroComplianceChart';
import { ShieldCheck } from 'lucide-react';

export default function DisciplineMirror({ data, profile }) {
  const { runs, meals, bodyAssessments } = data;

  const intensityDist = useMemo(() => {
    return calculateTrainingDistribution(runs || []);
  }, [runs]);

  const nutritionData = useMemo(() => {
    return calculateMacroAdherence(meals || [], profile, bodyAssessments || [], 'semana');
  }, [meals, profile, bodyAssessments]);

  return (
    <div className="bg-white/40 backdrop-blur-3xl border border-white/60 p-4 rounded-3xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] mt-6">
      <div className="flex items-center gap-2 mb-4 px-1">
        <ShieldCheck className="w-5 h-5 text-emerald-500" />
        <h3 className="text-base font-black text-slate-800 tracking-tight">Espelho da Disciplina</h3>
      </div>
      
      <div className="space-y-4">
        {runs && runs.length > 0 ? (
          <IntensityDonut distribution={intensityDist} targetLowPct={80} />
        ) : (
          <div className="h-48 flex items-center justify-center bg-white/20 rounded-2xl border border-white/40">
            <p className="text-xs font-medium text-slate-500">Regista corridas para ver a distribuição de intensidade.</p>
          </div>
        )}

        {nutritionData && nutritionData.dailyBreakdown && nutritionData.dailyBreakdown.length > 0 ? (
          <MacroComplianceChart dailyData={nutritionData.dailyBreakdown} />
        ) : (
          <div className="h-48 flex items-center justify-center bg-white/20 rounded-2xl border border-white/40">
            <p className="text-xs font-medium text-slate-500">Regista refeições para ver a tua adesão nutricional.</p>
          </div>
        )}
      </div>
    </div>
  );
}
