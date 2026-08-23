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
    session,
    profile
  } = useAppStore();

  // MOCK DE DADOS TEMPORÁRIO PARA TESTES
  const processedRuns = useMemo(() => {
    if (session?.user?.email === 'rpmariano@gmail.com') {
      const baseRuns = (runs && runs.length > 0) ? runs : [];
      
      // Se o utilizador não tem corridas nenhumas, vamos criar 3 fictícias
      let finalRuns = [...baseRuns];
      if (finalRuns.length === 0) {
        for (let i = 0; i < 3; i++) {
          finalRuns.push({
            id: `fake-run-${i}`,
            date: new Date(Date.now() - i * 86400000).toISOString(),
            distance_km: 5,
            duration_seconds: 2400,
            details: {}
          });
        }
      }

      return finalRuns.map((r, i) => {
        // Injeta zonas fictícias se não existirem
        if (!r.details?.hr_zones || r.details.hr_zones.length === 0) {
          const isIntense = i % 3 === 0;
          return {
            ...r,
            details: {
              ...r.details,
              hr_zones: isIntense 
                ? [{ zone: 1, minutes: 10 }, { zone: 2, minutes: 15 }, { zone: 3, minutes: 10 }, { zone: 4, minutes: 15 }]
                : [{ zone: 1, minutes: 30 }, { zone: 2, minutes: 20 }]
            }
          };
        }
        return r;
      });
    }
    return runs;
  }, [runs, session]);

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
