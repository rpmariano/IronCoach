import React, { useMemo } from 'react';
import ACWRChart from './ACWRChart';
import EnergyAvailabilityChart from './EnergyAvailabilityChart';
import { calculateACWRHistory, calculateEnergyAvailability } from '../../utils/biEngine';
import { Activity, Flame, ShieldAlert } from 'lucide-react';

export default function HealthRiskRadar({ data }) {
  const { runs, meals, gymSessions, bodyAssessments } = data;

  // ACWR Data
  const acwrData = useMemo(() => {
    return calculateACWRHistory(runs || [], 12); // Últimas 12 semanas
  }, [runs]);

  // RED-S / Energy Availability Data
  const eaData = useMemo(() => {
    return calculateEnergyAvailability(meals || [], bodyAssessments || [], runs || [], gymSessions || [], 'semana');
  }, [meals, bodyAssessments, runs, gymSessions]);

  // Renderização do Card de Alerta RED-S
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
      <div className={`mt-4 p-4 rounded-2xl border backdrop-blur-md shadow-[0_4px_20px_rgba(0,0,0,0.05)] flex items-start gap-3 ${alertStyle}`}>
        <div className="mt-0.5">
          {eaData.average < 30 ? (
            <ShieldAlert className={`w-5 h-5 ${iconColor}`} />
          ) : (
            <Flame className={`w-5 h-5 ${iconColor}`} />
          )}
        </div>
        <div>
          <h4 className="text-sm font-bold uppercase tracking-tight mb-1">{title}</h4>
          <p className="text-[13px] font-medium leading-snug opacity-90">
            {message}
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white/40 backdrop-blur-3xl border border-white/60 p-4 rounded-3xl shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
      <div className="flex items-center gap-2 mb-4 px-1">
        <Activity className="w-5 h-5 text-indigo-500" />
        <h3 className="text-base font-black text-slate-800 tracking-tight">Radar de Saúde e Risco</h3>
      </div>
      
      {/* ACWR Chart component */}
      {acwrData.length > 0 ? (
        <ACWRChart weeklyData={acwrData} />
      ) : (
        <div className="h-48 flex items-center justify-center bg-white/20 rounded-2xl border border-white/40">
          <p className="text-xs font-medium text-slate-500">Regista mais corridas para analisar a carga de treino.</p>
        </div>
      )}

      {/* Energy Availability Chart */}
      {eaData.daily.length > 0 && (
        <div className="mt-4">
          <EnergyAvailabilityChart dailyData={eaData.daily} />
        </div>
      )}

      {/* Alerta Dinâmico RED-S */}
      {renderREDSAlert()}
    </div>
  );
}
