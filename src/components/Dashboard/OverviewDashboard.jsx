import React, { useMemo } from 'react';
import { Footprints, Dumbbell, Utensils, Scale, ChartNoAxesColumn, Check, ChevronRight } from 'lucide-react';
import { useAppStore } from '../../store';
import SmartInsightsBanner from '../BI/SmartInsightsBanner';
import RaceReadinessCard from '../BI/RaceReadinessCard';
import PillarSummaryCard from '../BI/PillarSummaryCard';
import EmptyModuleState from '../BI/EmptyModuleState';
import SectionLabel from '../shared/SectionLabel';
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

/* Ponto 3 do redesenho ("cor com significado"): os pilares tinham um emoji
   por ícone (🏃 🏋️ 🥗 👤) e os badges traziam bolinhas 🟢🟡🔴⚪ à frente do
   texto. Saem os dois — o ícone passa a lucide na cor do módulo e o estado
   já é dito pela cor do badge (verde dentro do alvo, coral atenção,
   vermelho crítico). O texto das etiquetas não muda. */
const PILLAR_ICONS = {
  corrida: <Footprints size={15} style={{ color: 'var(--run)' }} />,
  ginasio: <Dumbbell size={15} style={{ color: 'var(--gym)' }} />,
  nutricao: <Utensils size={15} style={{ color: 'var(--nutrition)' }} />,
  corpo: <Scale size={15} style={{ color: 'var(--body)' }} />,
};

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
    setOpenCreationMode,
    setActiveTab,
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
    const COLOR = { safe: 'green', caution: 'yellow', danger: 'red', neutral: 'neutral' };
    return { label: label === 'Sem dados' ? label : `ACWR ${label}`, color: COLOR[tone] };
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
    if (zone === 'over') return { label: 'Acima do alvo', color: 'yellow' };
    if (zone === 'ok') return { label: 'Calorias OK', color: 'green' };
    if (zone === 'low') return { label: 'Baixa ingestão', color: 'yellow' };
    if (zone === 'critical') return { label: 'Deficit crítico', color: 'red' };
    return { label: 'Sem dados', color: 'neutral' };
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
    if (!weightTrend?.trend) return { label: 'Sem dados', color: 'neutral' };
    if (weightTrend.trend === 'descendo') return { label: 'Em perda', color: 'blue' };
    if (weightTrend.trend === 'subindo') return { label: 'Em ganho', color: 'yellow' };
    return { label: 'Estável', color: 'green' };
  }, [weightTrend]);
  const weekBodyAssessments = useMemo(() =>
    filterByDateRange(bodyAssessments || [], 'semana'), [bodyAssessments]
  );
  const bodySubtitle = weekBodyAssessments.length > 0
    ? `${weekBodyAssessments.length} avaliação${weekBodyAssessments.length !== 1 ? 'ões' : ''} esta semana`
    : 'Sem avaliações esta semana';

  /* ─────────────── Ponto 7: a Visão Geral sem dados ───────────────
     Mock "Dashboard · sem dados". Sem um único registo, os quatro pilares
     mostravam "—" com badges "Sem dados", a Análise Cruzada abria vazia e a
     Prontidão dava uma percentagem calculada sobre nada — quatro maneiras
     de dizer o mesmo, nenhuma delas a dizer o que fazer a seguir. Passa a
     ser o cartão do mock mais a lista "O que falta para começar", que é a
     única coisa acionável neste estado. O cartão da prova fica, se houver
     prova: "até lá mostro-te o que já tenho".
     Os textos são os do mock, finais. */
  const hasNoRecords =
    (runs?.length || 0) === 0 &&
    (gymSessions?.length || 0) === 0 &&
    (meals?.length || 0) === 0 &&
    (bodyAssessments?.length || 0) === 0;

  // "2 de 7": dias DISTINTOS com refeição registada nos últimos 7 dias — a
  // pergunta do mock é "uma semana de refeições", não "sete refeições".
  const mealDaysLastWeek = useMemo(() => {
    const week = filterByDateRange(meals || [], 'semana');
    return new Set(week.map(m => m.date)).size;
  }, [meals]);

  const checklist = [
    {
      key: 'perfil',
      label: 'Perfil preenchido',
      done: !!(profile?.experience_level && (profile?.weight_kg || profile?.height_cm)),
      onClick: () => setActiveTab('perfil'),
    },
    {
      key: 'prova',
      label: 'Marcar uma prova',
      done: (raceEvents?.length || 0) > 0,
      onClick: () => setOpenCreationMode('race'),
    },
    {
      key: 'corridas',
      label: 'Registar 3 corridas',
      done: (runs?.length || 0) >= 3,
      progress: `${Math.min(runs?.length || 0, 3)} de 3`,
      onClick: () => setOpenCreationMode('run'),
    },
    {
      key: 'refeicoes',
      label: 'Registar 1 semana de refeições',
      done: mealDaysLastWeek >= 7,
      progress: `${Math.min(mealDaysLastWeek, 7)} de 7`,
      onClick: () => setOpenCreationMode('meal'),
    },
  ];

  if (hasNoRecords) {
    return (
      <div className="space-y-3 fade-in pb-8 pt-2" data-testid="overview-empty">
        {(raceEvents?.length || 0) > 0 && (
          <RaceReadinessCard
            runs={runs}
            meals={meals}
            bodyAssessments={bodyAssessments}
            gymSessions={gymSessions}
            raceEvents={raceEvents}
            profile={profile}
            onClickRace={(id) => setEditingRaceId(id)}
          />
        )}

        <EmptyModuleState icon={<ChartNoAxesColumn size={22} />}>
          A prontidão precisa de duas semanas de registos para dizer alguma coisa útil. Até lá mostro-te o que já tenho.
        </EmptyModuleState>

        <SectionLabel style={{ margin: '6px 2px 0' }}>O que falta para começar</SectionLabel>

        <div
          style={{
            borderRadius: 'var(--radius-xl)',
            background: 'var(--surface-glass)',
            border: '1px solid var(--border-glass)',
            padding: '6px 16px',
          }}
        >
          {checklist.map((item, i) => (
            <div
              key={item.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                borderBottom: i < checklist.length - 1 ? '1px solid rgba(255,255,255,.08)' : 'none',
              }}
            >
              <span
                aria-hidden="true"
                style={item.done
                  ? {
                      width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                      background: 'var(--tint-ok-bg)', border: '1px solid var(--tint-ok-bd)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ok)',
                    }
                  : { width: 22, height: 22, borderRadius: '50%', flexShrink: 0, border: '1px dashed rgba(255,255,255,.28)' }}
              >
                {item.done && <Check size={12} />}
              </span>

              {item.done ? (
                <span style={{ flex: 1, fontSize: 'var(--text-sm)', color: 'var(--text-3)', padding: '13px 0' }}>
                  {item.label}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={item.onClick}
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left',
                    minHeight: 'var(--tap)', background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 'var(--text-sm)', color: 'var(--text-3)', padding: 0,
                  }}
                >
                  <span style={{ flex: 1 }}>{item.label}</span>
                  {item.progress
                    ? <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{item.progress}</span>
                    : <ChevronRight size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 fade-in pb-8 pt-2">
      {/* ─── Secção 1: Visão Estratégica ──────────────── */}
      <div className="px-1">
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">Visão Estratégica</p>
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
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">Estado Atual</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <PillarSummaryCard
          title="Corrida"
          icon={PILLAR_ICONS.corrida}
          kpi={weekDist > 0 ? `${weekDist.toFixed(1)}` : '—'}
          kpiUnit={weekDist > 0 ? 'km esta sem.' : ''}
          badge={runBadge}
          subtitle={runSubtitle}
          onClick={() => scrollToTab('corrida')}
        />
        <PillarSummaryCard
          title="Ginásio"
          icon={PILLAR_ICONS.ginasio}
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
          icon={PILLAR_ICONS.nutricao}
          kpi={calPct > 0 ? `${calPct}%` : '—'}
          kpiUnit={calPct > 0 ? 'calorias' : ''}
          badge={nutriBadge}
          subtitle={nutriSubtitle}
          onClick={() => scrollToTab('nutricao')}
        />
        <PillarSummaryCard
          title="Corpo"
          icon={PILLAR_ICONS.corpo}
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
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">Análise Cruzada</p>
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
