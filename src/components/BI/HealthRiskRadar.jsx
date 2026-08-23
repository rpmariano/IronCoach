import React, { useMemo } from 'react';
import ACWRChart from './ACWRChart';
import EnergyAvailabilityChart from './EnergyAvailabilityChart';
import { calculateACWRHistory, calculateEnergyAvailability } from '../../utils/biEngine';
import { Activity } from 'lucide-react';
import AnalysisAlert from './AnalysisAlert';

function getACWRSeverity(acwr) {
  if (acwr >= 0.8 && acwr <= 1.3) return 'success';
  if (acwr > 1.3 && acwr < 1.5) return 'warning';
  if (acwr >= 1.5) return 'critical';
  return 'info';
}

function getACWRAnalysis(acwrData) {
  if (!acwrData || acwrData.length === 0) return null;
  const last = acwrData[acwrData.length - 1];
  const acwr = last.ratio || 0;
  
  if (acwr >= 0.8 && acwr <= 1.3) {
    return { title: 'Sweet Spot (Ideal)', desc: `O teu rácio é ${acwr.toFixed(2)}. A carga aguda (esta semana) está perfeitamente equilibrada com a carga crónica (últimas 4 semanas). O risco de lesão é mínimo!`, severity: 'success' };
  } else if (acwr > 1.3 && acwr < 1.5) {
    return { title: 'Alerta de Sobrecarga', desc: `O teu rácio é ${acwr.toFixed(2)}. Estás na "Zona de Cuidado". O treino recente aumentou depressa face à tua fundação aeróbica.`, severity: 'warning' };
  } else if (acwr >= 1.5) {
    return { title: 'Risco Elevado de Lesão', desc: `O teu rácio é ${acwr.toFixed(2)}. Ultrapassaste o limite superior (1.5). O risco de lesão aumentou drasticamente nas próximas 4 semanas.`, severity: 'critical' };
  } else {
    return { title: 'Des-treino / Carga Baixa', desc: `O teu rácio é ${acwr.toFixed(2)} (<0.8). Estás a treinar abaixo da tua capacidade recente. Aumenta gradualmente.`, severity: 'info' };
  }
}

export default function HealthRiskRadar({ data }) {
  const { runs, meals, gymSessions, bodyAssessments } = data;

  const acwrData = useMemo(() => {
    return calculateACWRHistory(runs || [], 12);
  }, [runs]);

  const eaData = useMemo(() => {
    return calculateEnergyAvailability(meals || [], bodyAssessments || [], runs || [], gymSessions || [], 'semana');
  }, [meals, bodyAssessments, runs, gymSessions]);

  const renderREDSAlert = () => {
    if (!eaData || eaData.average === 0) return null;

    let severity = 'success';
    let title = 'Energia Adequada';
    let message = `A tua EA média (3 dias) é ${eaData.average} kcal/kg. Excelente para suportar o treino e saúde.`;

    if (eaData.isAtRisk || eaData.average < 30) {
      severity = 'critical';
      title = 'Alerta RED-S';
      message = `A tua EA média (3 dias) é ${eaData.average} kcal/kg. Nível crítico. Aumenta a ingestão de hidratos hoje.`;
    } else if (eaData.average < 45) {
      severity = 'warning';
      title = 'Atenção: Energia Subótima';
      message = `A tua EA média (3 dias) é ${eaData.average} kcal/kg. Pode ser insuficiente se aumentares o volume.`;
    }

    return <AnalysisAlert title={title} desc={message} severity={severity} />;
  };

  const acwrAnalysis = getACWRAnalysis(acwrData);

  return (
    <div className="bg-white/40 backdrop-blur-3xl border border-white/60 p-4 rounded-3xl shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
      <div className="flex items-center gap-2 mb-4 px-1">
        <Activity className="w-5 h-5 text-indigo-500" />
        <h3 className="text-base font-black text-white tracking-tight">Radar de Saúde e Risco</h3>
      </div>
      
      {acwrData.length > 0 ? (
        <>
          <ACWRChart weeklyData={acwrData} />
          {acwrAnalysis && (
            <div className="mb-4">
              <AnalysisAlert title={acwrAnalysis.title} desc={acwrAnalysis.desc} severity={acwrAnalysis.severity} />
            </div>
          )}
        </>
      ) : (
        <div className="h-48 flex items-center justify-center bg-white/20 rounded-2xl border border-white/40 mb-6">
          <p className="text-xs font-medium text-slate-500">Regista mais corridas para analisar a carga de treino.</p>
        </div>
      )}

      {eaData.daily.length > 0 && (
        <div className="mt-4">
          <EnergyAvailabilityChart dailyData={eaData.daily} />
          {renderREDSAlert()}
        </div>
      )}
    </div>
  );
}
