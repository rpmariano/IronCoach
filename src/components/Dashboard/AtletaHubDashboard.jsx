import React, { useMemo } from 'react';
import { useAppStore } from '../../store';
import SmartInsightsBanner from '../BI/SmartInsightsBanner';
import HealthRiskRadar from '../BI/HealthRiskRadar';
import PerformanceCompass from '../BI/PerformanceCompass';
import DisciplineMirror from '../BI/DisciplineMirror';

export default function AtletaHubDashboard() {
  const { 
    runs, 
    gymSessions, 
    meals, 
    bodyAssessments, 
    raceEvents, 
    coachPlans, 
    coachPlanItems, 
    profile 
  } = useAppStore();

  // MOCK DE DADOS TEMPORÁRIO PARA TESTES
  const processedRuns = useMemo(() => {
    if (profile?.email === 'rpmariano@gmail.com' && runs) {
      return runs.map((r, i) => {
        // Injeta zonas fictícias se não existirem
        if (!r.details?.hr_zones || r.details.hr_zones.length === 0) {
          // Cria uma proporção 80/20 fake (exemplo: 40 min leve, 10 min intenso)
          const isIntense = i % 3 === 0; // 1 em cada 3 treinos é mais intenso
          return {
            ...r,
            details: {
              ...r.details,
              hr_zones: isIntense 
                ? [{ zone: 1, minutes: 10 }, { zone: 2, minutes: 15 }, { zone: 3, minutes: 10 }, { zone: 4, minutes: 15 }] // 25 min Z1/Z2, 25 min Z3/Z4
                : [{ zone: 1, minutes: 30 }, { zone: 2, minutes: 20 }] // 50 min leve
            }
          };
        }
        return r;
      });
    }
    return runs;
  }, [runs, profile]);

  const data = { runs: processedRuns, gymSessions, meals, bodyAssessments, raceEvents, coachPlans, coachPlanItems };

  return (
    <div className="space-y-6 fade-in pb-8 pt-2">
      <h2 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2 mb-4 px-1">
        Atleta Hub
      </h2>
      
      {/* Smart Insights Dinâmicos */}
      <SmartInsightsBanner data={data} profile={profile} />
      
      {/* 1. Radar de Saúde e Risco */}
      <HealthRiskRadar data={data} />
      
      <PerformanceCompass data={data} />
      
      <DisciplineMirror data={data} profile={profile} />
    </div>
  );
}
