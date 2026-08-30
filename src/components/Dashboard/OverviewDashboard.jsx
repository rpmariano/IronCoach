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
  acwrStatusLabel,
} from '../../utils/biEngine';
import { classifyCalorieCompliance } from '@formulas/nutritionCompliance.ts';

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
  const runSubtitle = weekRuns.length > 0
    ? `${weekRuns.length} corrida${weekRuns.length !== 1 ? 's' : ''} esta semana`
    : 'Sem corridas esta semana';
  // 'undertrained' (carga baixa) e sem dados não são a mesma coisa que
  // "sem dados" genérico — ver acwrStatusLabel. Antes disto qualquer rácio
  // abaixo de 0.8 (incl. carga baixa real, com dados) caía em "Sem dados".
  const runBadge = useMemo(() => {
    const { label, tone } = acwrStatusLabel(acwr.status, acwr.hasEnoughData);
    const EMOJI = { safe: '🟢', caution: '🟡', danger: '🔴', neutral: '⚪' };
    const COLOR = { safe: 'green', caution: 'yellow', danger: 'red', neutral: 'neutral' };
    return { label: `${EMOJI[tone]} ${label === 'Sem dados' ? label : `ACWR ${label}`}`, color: COLOR[tone] };
  }, [acwr]);

  // ── Ginásio ───────────────────────────────────────────
  const gymStats = useMemo(() => calculateVolumeLoad(gymSessions || [], 'semana'), [gymSessions]);
  // A pílula "N sessões" já conta força e aulas juntas (weekGymSessions não
  // filtra por `kind`) — o que faltava era a frase de baixo distinguir os
  // dois: uma aula (yoga, spinning, CrossFit) legitimamente não tem séries
  // com peso, não é um registo em falta. Sem esta distinção, "1 sessão" +
  // "Sem séries com peso registadas" lia-se como uma contradição.
  const weekGymSessions = useMemo(() =>
    filterByDateRange(gymSessions || [], 'semana'), [gymSessions]
  );
  const weekSessions = weekGymSessions.length;
  const weekClasses = weekGymSessions.filter(s => s.kind === 'aula').length;
  const weekStrengthSessions = weekSessions - weekClasses;
  // Uma série fica gravada mesmo sem peso preenchido (flattenExercises só
  // ignora a linha se reps E peso vierem os dois vazios — ver
  // GymRegistration.jsx) — é o caso normal de exercícios de peso do corpo
  // (flexões, dominadas, prancha). "Sem séries com peso registadas" nesse
  // caso soava a esquecimento quando o atleta registou mesmo o treino.
  const weekStrengthHasSets = weekGymSessions.some(
    s => s.kind !== 'aula' && (s.workout_session_sets || []).length > 0
  );
  const gymSubtitle = gymStats?.totalVolumeLoad > 0
    ? `${Math.round(gymStats.totalVolumeLoad / weekSessions).toLocaleString('pt-PT')} kg/sessão em média`
    : weekStrengthHasSets
      ? 'Treino sem carga externa (peso do corpo)'
      : weekStrengthSessions > 0
        ? 'Sem séries com peso registadas'
        : weekClasses > 0
          ? `${weekClasses} aula${weekClasses !== 1 ? 's' : ''} de ginásio esta semana`
          : 'Sem treinos esta semana';

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
  // Classificação delega em @formulas/nutritionCompliance.ts (T1) — esta
  // era a escala escolhida como única entre as 3 que existiam
  // (NutritionDashboard, biEngine.js e esta), por decisão explícita do
  // utilizador (specs/formulas-checklist.md).
  const nutriBadge = useMemo(() => {
    const zone = classifyCalorieCompliance(calPct);
    if (zone === 'over') return { label: '🟡 Acima do alvo', color: 'yellow' };
    if (zone === 'ok') return { label: '🟢 Calorias OK', color: 'green' };
    if (zone === 'low') return { label: '🟡 Baixa ingestão', color: 'yellow' };
    if (zone === 'critical') return { label: '🔴 Deficit crítico', color: 'red' };
    return { label: '⚪ Sem dados', color: 'neutral' };
  }, [calPct]);
  const eaAvg = eaData?.average ?? 0;
  const nutriSubtitle = eaAvg > 0 ? `EA: ${eaAvg} kcal/kg` : 'Regista refeições';

  // ── Corpo ─────────────────────────────────────────────
  const weightTrend = useMemo(() => calculateWeightTrend(bodyAssessments || []), [bodyAssessments]);
  const currentWeight = weightTrend?.movingAverage?.length > 0
    ? weightTrend.movingAverage[weightTrend.movingAverage.length - 1].weight?.toFixed(1)
    : '—';
  const bodyDelta = weightTrend?.weeklyRate != null
    ? `${weightTrend.weeklyRate > 0 ? '+' : ''}${weightTrend.weeklyRate} kg/sem`
    : null;
  const bodyBadge = useMemo(() => {
    if (!weightTrend?.trend) return { label: '⚪ Sem dados', color: 'neutral' };
    if (weightTrend.trend === 'descendo') return { label: '📉 Em perda', color: 'blue' };
    if (weightTrend.trend === 'subindo') return { label: '📈 Em ganho', color: 'yellow' };
    return { label: '➡️ Estável', color: 'green' };
  }, [weightTrend]);
  const weekBodyAssessments = useMemo(() =>
    filterByDateRange(bodyAssessments || [], 'semana'), [bodyAssessments]
  );
  const bodySubtitle = weekBodyAssessments.length > 0
    ? `${weekBodyAssessments.length} avaliação${weekBodyAssessments.length !== 1 ? 'ões' : ''} esta semana`
    : 'Sem avaliações esta semana';

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
          subtitle={runSubtitle}
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
          subtitle={gymSubtitle}
          onClick={() => scrollToTab('ginasio')}
        />
        <PillarSummaryCard
          title="Nutrição"
          icon="🥗"
          kpi={calPct > 0 ? `${calPct}%` : '—'}
          kpiUnit={calPct > 0 ? 'calorias' : ''}
          badge={nutriBadge}
          subtitle={nutriSubtitle}
          onClick={() => scrollToTab('nutricao')}
        />
        <PillarSummaryCard
          title="Corpo"
          icon="👤"
          kpi={currentWeight}
          kpiUnit={currentWeight !== '—' ? 'kg' : ''}
          badge={bodyBadge}
          delta={bodyDelta}
          subtitle={bodySubtitle}
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
