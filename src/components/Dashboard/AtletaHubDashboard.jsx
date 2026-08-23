import React from 'react';
import { useAppStore } from '../../store';
import SmartInsightsBanner from '../BI/SmartInsightsBanner';
import HealthRiskRadar from '../BI/HealthRiskRadar';
import PerformanceCompass from '../BI/PerformanceCompass';

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

  const data = { runs, gymSessions, meals, bodyAssessments, raceEvents, coachPlans, coachPlanItems };

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
      
      {/* <DisciplineMirror data={data} profile={profile} /> */}
    </div>
  );
}
