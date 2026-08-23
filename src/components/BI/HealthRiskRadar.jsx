import React, { useMemo } from 'react';
import ACWRChart from './ACWRChart';
import EnergyAvailabilityChart from './EnergyAvailabilityChart';
import { calculateACWRHistory, calculateEnergyAvailability } from '../../utils/biEngine';
import { Activity, Flame, ShieldAlert, Info } from 'lucide-react';

function getACWRAnalysis(acwrData) {
  if (!acwrData || acwrData.length === 0) return null;
  const last = acwrData[acwrData.length - 1];
  const acwr = last.ratio || 0;
  
  if (acwr >= 0.8 && acwr <= 1.3) {
    return { title: 'Sweet Spot (Ideal)', desc: `O teu rácio é ${acwr.toFixed(2)}. A carga aguda (esta semana) está perfeitamente equilibrada com a carga crónica (últimas 4 semanas). O risco de lesão é mínimo!`, color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' };
  } else if (acwr > 1.3 && acwr <= 1.5) {
    return { title: 'Alerta de Sobrecarga', desc: `O teu rácio é ${acwr.toFixed(2)}. Estás na "Zona de Cuidado". O treino recente aumentou depressa face à tua fundação aeróbica.`, color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' };
  } else if (acwr > 1.5) {
    return { title: 'Risco Elevado de Lesão', desc: `O teu rácio é ${acwr.toFixed(2)}. Ultrapassaste o limite superior (1.5). O risco de lesão aumentou drasticamente nas próximas 4 semanas.`, color: 'text-rose-700', bg: 'bg-rose-50 border-rose-200' };
  } else {
    return { title: 'Des-treino / Carga Baixa', desc: `O teu rácio é ${acwr.toFixed(2)} (<0.8). Estás a treinar abaixo da tua capacidade recente. Aumenta gradualmente.`, color: 'text-indigo-700', bg: 'bg-indigo-50 border-indigo-200' };
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

    let alertStyle = "bg-emerald-50 border-emerald-200 text-emerald-800";
    let iconColor = "text-emerald-500";
    let title = "Energia Adequada";
    let message = `A tua EA média (3 dias) é ${eaData.average} kcal/kg. Excelente para suportar o treino e saúde.`;

    if (eaData.isAtRisk || eaData.average < 30) {
      alertStyle = "bg-rose-50 border-rose-200 text-rose-800";
      iconColor = "text-rose-500";
      title = "ALERTA RED-S";
      message = `A tua EA média (3 dias) é ${eaData.average} kcal/kg. Nível crítico. Aumenta a ingestão de hidratos hoje.`;
    } else if (eaData.average < 45) {
      alertStyle = "bg-amber-50 border-amber-200 text-amber-800";
      iconColor = "text-amber-500";
      title = "Atenção: Energia Subótima";
      message = `A tua EA média (3 dias) é ${eaData.average} kcal/kg. Pode ser insuficiente se aumentares o volume.`;
    }

    return (
      <div className={`mt-2 p-4 rounded-2xl border shadow-sm flex items-start gap-3 ${alertStyle}`}>
        <div className="mt-0.5">
          {eaData.average < 30 ? (
            <ShieldAlert className={`w-5 h-5 ${iconColor}`} />
          ) : (
            <Flame className={`w-5 h-5 ${iconColor}`} />
          )}
        </div>
        <div>
          <h4 className="text-sm font-bold uppercase tracking-tight mb-1">{title}</h4>
          <p className="text-[13px] font-medium leading-snug opacity-90">{message}</p>
        </div>
      </div>
    );
  };

  const acwrAnalysis = getACWRAnalysis(acwrData);

  return (
    <div className="bg-white/40 backdrop-blur-3xl border border-white/60 p-4 rounded-3xl shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
      <div className="flex items-center gap-2 mb-4 px-1">
        <Activity className="w-5 h-5 text-indigo-500" />
        <h3 className="text-base font-black text-slate-800 tracking-tight">Radar de Saúde e Risco</h3>
      </div>
      
      {acwrData.length > 0 ? (
        <>
          <ACWRChart weeklyData={acwrData} />
          {acwrAnalysis && (
            <div className={`mt-2 mb-6 p-4 rounded-2xl border ${acwrAnalysis.bg} shadow-sm`}>
              <div className="flex items-center gap-2 mb-1.5">
                <Info className={`w-4 h-4 ${acwrAnalysis.color}`} />
                <span className={`text-sm font-bold ${acwrAnalysis.color}`}>{acwrAnalysis.title}</span>
              </div>
              <p className={`text-xs ${acwrAnalysis.color} opacity-90 leading-relaxed`}>
                {acwrAnalysis.desc}
              </p>
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
