import React, { useMemo } from 'react';
import { calculateTrainingDistribution, calculateMacroAdherence } from '../../utils/biEngine';
import IntensityDonut from './IntensityDonut';
import MacroComplianceChart from './MacroComplianceChart';
import { ShieldCheck } from 'lucide-react';
import AnalysisAlert from './AnalysisAlert';

function getIntensityAnalysis(dist) {
  if (!dist || (dist.lowIntensityPct === 0 && dist.highIntensityPct === 0)) return null;
  if (dist.isCompliant) {
    return { title: 'Polarização Excelente', desc: 'Estás a cumprir a regra 80/20 com mestria. Estás a construir base aeróbica sem acumular fadiga extrema!', severity: 'success' };
  } else if (dist.highIntensityPct > (100 - dist.targetLowPct + 5)) {
    return { title: 'Sobrecarga de Intensidade', desc: `Estás a passar ${dist.highIntensityPct}% do tempo em alta intensidade (alvo: <${100 - dist.targetLowPct}%). Risco elevado de overtraining e quebra de performance.`, severity: 'critical' };
  } else {
    return { title: 'Treino Demasiado Leve', desc: `Tens ${dist.lowIntensityPct}% de treino leve. Falta um pouco de estímulo intenso (Zonas 4/5) para evoluir o teu VDOT máximo.`, severity: 'warning' };
  }
}

function getNutritionAnalysis(nutri) {
  if (!nutri || !nutri.protein) return null;
  const p = nutri.protein.compliance_pct;
  const c = nutri.carbs.compliance_pct;
  
  if (p >= 90 && c >= 90) {
    return { title: 'Nutrição Impecável', desc: 'Estás a bater os teus alvos de Proteína e Hidratos de forma exemplar. A tua recuperação e níveis de energia estão otimizados!', severity: 'success' };
  } else if (p < 80) {
    return { title: 'Falta de Proteína', desc: `A tua ingestão proteica média está em apenas ${p}% do alvo. Estás a comprometer a reconstrução muscular pós-treino!`, severity: 'critical' };
  } else if (c < 80) {
    return { title: 'Falta de Combustível', desc: `Estás a ingerir apenas ${c}% dos hidratos recomendados. Podes vir a "bater na parede" (falta de glicogénio) nos treinos mais longos.`, severity: 'warning' };
  }
  return { title: 'Consistência Razoável', desc: 'Estás no caminho certo, mas tenta aproximar-te um pouco mais das linhas tracejadas (alvos) todos os dias para máxima evolução.', severity: 'info' };
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
        <h3 className="text-base font-black text-white tracking-tight">Espelho da Disciplina</h3>
      </div>

      <div className="space-y-4">
        {runs && runs.length > 0 ? (
          <>
            <IntensityDonut distribution={intensityDist} targetLowPct={80} />
            {intAnalysis && (
              <AnalysisAlert title={intAnalysis.title} desc={intAnalysis.desc} severity={intAnalysis.severity} />
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
              <AnalysisAlert title={nutAnalysis.title} desc={nutAnalysis.desc} severity={nutAnalysis.severity} />
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
