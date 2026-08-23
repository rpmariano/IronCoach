import React, { useMemo } from 'react';
import { useAppStore } from '../../store';
import SmartInsightsBanner from '../BI/SmartInsightsBanner';
import RaceReadinessCard from '../BI/RaceReadinessCard';
import PillarSummaryCard from '../BI/PillarSummaryCard';
import CrossAnalysisSection from '../BI/CrossAnalysisSection';
import {
  calculateACWR,
  calculateVolumeLoad,
  calculateMacroAdherence,
  calculateEnergyAvailability,
  calculateWeightTrend,
  filterByDateRange,
} from '../../utils/biEngine';
import { parseISO, subDays, format } from 'date-fns';

export default function OverviewDashboard({ scrollToTab }) {
  const {
    runs,
    gymSessions,
    meals,
    bodyAssessments,
    raceEvents,
    coachPlans,
    coachPlanItems,
    profile,
    shoes,
    setEditingRaceId,
  } = useAppStore();

  const data = { runs, gymSessions, meals, bodyAssessments, raceEvents, coachPlans, coachPlanItems, shoes };

  // ── Corrida ──────────────────────────────────────────
  const acwr = useMemo(() => calculateACWR(runs || []), [runs]);
  const weekRuns = useMemo(() => filterByDateRange(runs || [], 'semana'), [runs]);
  const weekDist = useMemo(() =>
    weekRuns.reduce((s, r) => s + Number(r.distance_km || 0), 0),
    [weekRuns]
  );
  const runSparkData = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = subDays(new Date(), 6 - i);
      const dayStr = format(d, 'yyyy-MM-dd');
      return (runs || []).filter(r => r.date === dayStr).reduce((s, r) => s + Number(r.distance_km || 0), 0);
    });
    return days;
  }, [runs]);
  const runBadge = useMemo(() => {
    if (acwr.ratio >= 0.8 && acwr.ratio <= 1.3) return { label: '🟢 ACWR Ideal', color: 'green' };
    if (acwr.ratio > 1.3 && acwr.ratio < 1.5) return { label: '🟡 ACWR Atenção', color: 'yellow' };
    if (acwr.ratio >= 1.5) return { label: '🔴 ACWR Perigo', color: 'red' };
    return { label: '⚪ Sem dados', color: 'neutral' };
  }, [acwr]);

  // ── Ginásio ───────────────────────────────────────────
  const gymStats = useMemo(() => calculateVolumeLoad(gymSessions || [], 'semana'), [gymSessions]);
  const gymSparkData = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = subDays(new Date(), 6 - i);
      const dayStr = format(d, 'yyyy-MM-dd');
      return (gymSessions || []).filter(s => s.date === dayStr)
        .reduce((sum, session) => {
          return sum + (session.exercises || []).reduce((es, ex) =>
            es + (ex.sets || []).reduce((ss, set) =>
              ss + (set.reps || 0) * (set.weight_kg || 0), 0), 0);
        }, 0);
    });
    return days;
  }, [gymSessions]);
  const weekSessions = useMemo(() =>
    filterByDateRange(gymSessions || [], 'semana').length, [gymSessions]
  );

  // ── Nutrição ──────────────────────────────────────────
  const adherence = useMemo(() =>
    calculateMacroAdherence(meals || [], profile, bodyAssessments || [], 'semana'),
    [meals, profile, bodyAssessments]
  );
  const eaData = useMemo(() =>
    calculateEnergyAvailability(meals || [], bodyAssessments || [], runs || [], gymSessions || [], 'semana'),
    [meals, bodyAssessments, runs, gymSessions]
  );
  const calPct = adherence?.calories?.compliance_pct ?? 0;
  const nutriBadge = useMemo(() => {
    if (calPct >= 90) return { label: '🟢 Calorias OK', color: 'green' };
    if (calPct >= 70) return { label: '🟡 Baixa ingestão', color: 'yellow' };
    if (calPct > 0) return { label: '🔴 Deficit crítico', color: 'red' };
    return { label: '⚪ Sem dados', color: 'neutral' };
  }, [calPct]);
  const eaAvg = eaData?.average ?? 0;
  const nutriSubtitle = eaAvg > 0 ? `EA: ${eaAvg} kcal/kg` : 'Regista refeições';

  // ── Corpo ─────────────────────────────────────────────
  const weightTrend = useMemo(() => calculateWeightTrend(bodyAssessments || []), [bodyAssessments]);
  const currentWeight = weightTrend?.movingAverage?.length > 0
    ? weightTrend.movingAverage[weightTrend.movingAverage.length - 1].weight?.toFixed(1)
    : '—';
  const bodySparkData = useMemo(() =>
    (weightTrend?.rawPoints || []).slice(-8).map(p => p.weight || 0),
    [weightTrend]
  );
  const bodyDelta = weightTrend?.weeklyRate != null
    ? `${weightTrend.weeklyRate > 0 ? '+' : ''}${weightTrend.weeklyRate} kg/sem`
    : null;
  const bodyBadge = useMemo(() => {
    if (!weightTrend?.trend) return { label: '⚪ Sem dados', color: 'neutral' };
    if (weightTrend.trend === 'descendo') return { label: '📉 Em perda', color: 'blue' };
    if (weightTrend.trend === 'subindo') return { label: '📈 Em ganho', color: 'yellow' };
    return { label: '➡️ Estável', color: 'green' };
  }, [weightTrend]);

  return (
    <div className="space-y-4 fade-in pb-8 pt-2">
      {/* ─── Secção 1: Visão Estratégica ──────────────── */}
      <div className="px-1">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Visão Estratégica</p>
      </div>

      <RaceReadinessCard
        runs={runs}
        meals={meals}
        bodyAssessments={bodyAssessments}
        gymSessions={gymSessions}
        raceEvents={raceEvents}
        profile={profile}
        onClickRace={(id) => setEditingRaceId(id)}
      />

      <SmartInsightsBanner data={data} profile={profile} maxItems={3} />

      {/* ─── Secção 2: Estado Atual dos 4 Pilares ──────── */}
      <div className="px-1 mt-2">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Estado Atual</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <PillarSummaryCard
          title="Corrida"
          icon="🏃"
          kpi={weekDist > 0 ? `${weekDist.toFixed(1)}` : '—'}
          kpiUnit={weekDist > 0 ? 'km esta sem.' : ''}
          badge={runBadge}
          sparkData={runSparkData}
          sparkType="bar"
          sparkColor="#c026d3"
          onClick={() => scrollToTab('corrida')}
        />
        <PillarSummaryCard
          title="Ginásio"
          icon="🏋️"
          kpi={gymStats?.totalVolumeLoad > 0
            ? `${Math.round(gymStats.totalVolumeLoad / 1000) >= 1
                ? (gymStats.totalVolumeLoad / 1000).toFixed(1) + 'k'
                : Math.round(gymStats.totalVolumeLoad)}`
            : '—'}
          kpiUnit={gymStats?.totalVolumeLoad > 0 ? 'kg vol.' : ''}
          badge={{ label: `${weekSessions} sessão${weekSessions !== 1 ? 'ões' : ''}`, color: weekSessions >= 2 ? 'green' : weekSessions === 1 ? 'yellow' : 'neutral' }}
          sparkData={gymSparkData}
          sparkType="bar"
          sparkColor="#facc15"
          onClick={() => scrollToTab('ginasio')}
        />
        <PillarSummaryCard
          title="Nutrição"
          icon="🥗"
          kpi={calPct > 0 ? `${calPct}%` : '—'}
          kpiUnit={calPct > 0 ? 'calorias' : ''}
          badge={nutriBadge}
          subtitle={nutriSubtitle}
          sparkData={[]}
          sparkColor="#059669"
          onClick={() => scrollToTab('nutricao')}
        />
        <PillarSummaryCard
          title="Corpo"
          icon="👤"
          kpi={currentWeight}
          kpiUnit={currentWeight !== '—' ? 'kg' : ''}
          badge={bodyBadge}
          delta={bodyDelta}
          sparkData={bodySparkData}
          sparkType="line"
          sparkColor="#e11d48"
          onClick={() => scrollToTab('corpo')}
        />
      </div>

      {/* ─── Secção 3: Análise Cruzada (colapsada) ───── */}
      <div className="px-1 mt-2">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Análise Cruzada</p>
      </div>

      <CrossAnalysisSection
        runs={runs}
        gymSessions={gymSessions}
        meals={meals}
        bodyAssessments={bodyAssessments}
      />
    </div>
  );
}
