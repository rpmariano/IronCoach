import React, { useMemo } from 'react';
import { calculateTrainingDistribution, calculateMacroAdherence } from '../../utils/biEngine';
import IntensityDonut from './IntensityDonut';
import MacroComplianceChart from './MacroComplianceChart';
import { ShieldCheck, Info } from 'lucide-react';

function getIntensityAnalysis(dist) {
  if (!dist || (dist.lowIntensityPct === 0 && dist.highIntensityPct === 0)) return null;
  if (dist.isCompliant) {
    return { title: 'Polarização Excelente', desc: 'Estás a cumprir a regra 80/20 com mestria. Estás a construir base aeróbica sem acumular fadiga extrema!', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' };
  } else if (dist.highIntensityPct > (100 - dist.targetLowPct + 5)) {
    return { title: 'Sobrecarga de Intensidade', desc: `Estás a passar ${dist.highIntensityPct}% do tempo em alta intensidade (alvo: <${100 - dist.targetLowPct}%). Risco elevado de overtraining e quebra de performance.`, color: 'text-rose-700', bg: 'bg-rose-50 border-rose-200' };
  } else {
    return { title: 'Treino Demasiado Leve', desc: `Tens ${dist.lowIntensityPct}% de treino leve. Falta um pouco de estímulo intenso (Zonas 4/5) para evoluir o teu VDOT máximo.`, color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' };
  }
}

function getNutritionAnalysis(nutri) {
  if (!nutri || !nutri.protein) return null;
  const p = nutri.protein.compliance_pct;
  const c = nutri.carbs.compliance_pct;
  
  if (p >= 90 && c >= 90) {
    return { title: 'Nutrição Impecável', desc: 'Estás a bater os teus alvos de Proteína e Hidratos de forma exemplar. A tua recuperação e níveis de energia estão otimizados!', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' };
  } else if (p < 80) {
    return { title: 'Falta de Proteína', desc: `A tua ingestão proteica média está em apenas ${p}% do alvo. Estás a comprometer a reconstrução muscular pós-treino!`, color: 'text-rose-700', bg: 'bg-rose-50 border-rose-200' };
  } else if (c < 80) {
    return { title: 'Falta de Combustível', desc: `Estás a ingerir apenas ${c}% dos hidratos recomendados. Podes vir a "bater na parede" (falta de glicogénio) nos treinos mais longos.`, color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' };
  }
  return { title: 'Consistência Razoável', desc: 'Estás no caminho certo, mas tenta aproximar-te um pouco mais das linhas tracejadas (alvos) todos os dias para máxima evolução.', color: 'text-indigo-700', bg: 'bg-indigo-50 border-indigo-200' };
}

export default function DisciplineMirror({ data, profile }) {
  const { runs, meals, bodyAssessments } = data;

  const intensityDist = useMemo(() => {
    return calculateTrainingDistribution(runs || []);
  }, [runs]);

  const nutritionData = useMemo(() => {
    return calculateMacroAdherence(meals || [], profile, bodyAssessments || [], 'semana');
  }, [meals, profile, bodyAssessments]);

  const intAnalysis = getIntensityAnalysis(intensityDist);
  const nutAnalysis = getNutritionAnalysis(nutritionData);

  return (
    <div className="bg-white/40 backdrop-blur-3xl border border-white/60 p-4 rounded-3xl shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
      <div className="flex items-center gap-2 mb-4 px-1">
        <ShieldCheck className="w-5 h-5 text-emerald-500" />
        <h3 className="text-base font-black text-slate-800 tracking-tight">Espelho da Disciplina</h3>
      </div>
      
      <div className="space-y-4">
        {runs && runs.length > 0 ? (
          <>
            <IntensityDonut distribution={intensityDist} targetLowPct={80} />
            {intAnalysis && (
              <div className={`p-4 rounded-2xl border ${intAnalysis.bg} shadow-sm`}>
                <div className="flex items-center gap-2 mb-1.5">
                  <Info className={`w-4 h-4 ${intAnalysis.color}`} />
                  <span className={`text-sm font-bold ${intAnalysis.color}`}>{intAnalysis.title}</span>
                </div>
                <p className={`text-xs ${intAnalysis.color} opacity-90 leading-relaxed`}>
                  {intAnalysis.desc}
                </p>
              </div>
            )}
          </>
        ) : (
          <div className="h-48 flex items-center justify-center bg-white/20 rounded-2xl border border-white/40">
            <p className="text-xs font-medium text-slate-500">Regista corridas com zonas de FC para ver a distribuição.</p>
          </div>
        )}

        {nutritionData && nutritionData.dailyBreakdown && nutritionData.dailyBreakdown.length > 0 ? (
          <>
            <MacroComplianceChart dailyData={nutritionData.dailyBreakdown} />
            {nutAnalysis && (
              <div className={`p-4 rounded-2xl border ${nutAnalysis.bg} shadow-sm`}>
                <div className="flex items-center gap-2 mb-1.5">
                  <Info className={`w-4 h-4 ${nutAnalysis.color}`} />
                  <span className={`text-sm font-bold ${nutAnalysis.color}`}>{nutAnalysis.title}</span>
                </div>
                <p className={`text-xs ${nutAnalysis.color} opacity-90 leading-relaxed`}>
                  {nutAnalysis.desc}
                </p>
              </div>
            )}
          </>
        ) : (
          <div className="h-48 flex items-center justify-center bg-white/20 rounded-2xl border border-white/40">
            <p className="text-xs font-medium text-slate-500">Regista refeições para ver a tua adesão nutricional.</p>
          </div>
        )}
      </div>
    </div>
  );
}
