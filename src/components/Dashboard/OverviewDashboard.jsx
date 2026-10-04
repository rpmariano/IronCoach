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
  acwrMissingWeeks,
  sessionVolumeKg,
} from '../../utils/biEngine';
import { classifyCalorieCompliance } from '@formulas/nutritionCompliance.ts';
import { WEIGHT_TREND_MIN_POINTS, WEIGHT_TREND_MIN_SPAN_DAYS, WEIGHT_TREND_WINDOW_DAYS } from '@formulas/weightTrend.ts';
import { fmtNumber } from '../../utils/dashboardVerdicts';
import { todayISO } from '../../lib/utils';

/* 2026-10-04 (O2): o plural de "sessão"/"avaliação" é "sessões"/"avaliações"
   (troca o "ão"), não "sessão"+"ões" — "2 sessãoões" estava à vista. */
const plural = (n, um, varios) => (n === 1 ? um : varios);

/* Vírgula decimal (pt-PT) com casas fixas: "12,4 km", "74,6 kg" — o
   toFixed(1) dava ponto ("12.4"). */
const dec = (n, casas = 1) => fmtNumber(n, casas);

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/* "há 3 dias" para a última pesagem (O4): o número vale pela data a que
   pertence. Dias de calendário, não horas. Mais de duas semanas: a data. */
function idadeDaPesagem(dataISO) {
  const dias = Math.round((Date.parse(`${todayISO()}T00:00:00Z`) - Date.parse(`${dataISO}T00:00:00Z`)) / 86400000);
  if (!Number.isFinite(dias)) return null;
  if (dias <= 0) return 'hoje';
  if (dias === 1) return 'ontem';
  if (dias <= 13) return `há ${dias} dias`;
  const [, m, d] = dataISO.split('-').map(Number);
  return `${d} ${MESES_CURTOS[m - 1]}`;
}

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
    ? `${weekRuns.length} ${plural(weekRuns.length, 'corrida', 'corridas')} esta semana`
    : 'Sem corridas esta semana';
  // 'undertrained' (carga baixa) e sem dados não são a mesma coisa que
  // "sem dados" genérico — ver acwrStatusLabel. Antes disto qualquer rácio
  // abaixo de 0.8 (incl. carga baixa real, com dados) caía em "Sem dados".
  const runBadge = useMemo(() => {
    const { label, tone } = acwrStatusLabel(acwr.status, acwr.hasEnoughData);
    const COLOR = { safe: 'green', caution: 'yellow', danger: 'red', neutral: 'neutral' };
    // Sem histórico, quanto falta em vez de "Sem dados" (auditoria de
    // onboarding, 2026-09-27).
    const missing = acwrMissingWeeks(acwr);
    if (missing) return { label: `ACWR: faltam ${missing} sem.`, color: 'neutral' };
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
  // O3 (2026-10-04): a média divide só pelas sessões de FORÇA COM CARGA — antes
  // dividia por todas as sessões da semana, aulas e treinos de peso do corpo
  // incluídos (1 treino de 1000 kg + 1 aula dava "500 kg/sessão"). O
  // denominador diz-se: "(N sessões)".
  const weekLoadedSessions = weekGymSessions.filter(
    s => s.kind !== 'aula' && sessionVolumeKg(s) > 0
  ).length;
  const gymSubtitle = gymStats?.totalVolumeLoad > 0 && weekLoadedSessions > 0
    ? `${dec(Math.round(gymStats.totalVolumeLoad / weekLoadedSessions), 0)} kg/sessão em média (${weekLoadedSessions} ${plural(weekLoadedSessions, 'sessão', 'sessões')})`
    : weekStrengthHasSets
      ? 'Treino sem carga externa (peso do corpo)'
      : weekStrengthSessions > 0
        ? 'Sem séries com peso registadas'
        : weekClasses > 0
          ? `${weekClasses} ${plural(weekClasses, 'aula', 'aulas')} de ginásio esta semana`
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
  const nutriSubtitle = eaAvg > 0 ? `EA: ${dec(eaAvg, 1).replace(/,0$/, '')} kcal/kg` : 'Regista refeições';

  // ── Corpo ─────────────────────────────────────────────
  const weightTrend = useMemo(() => calculateWeightTrend(bodyAssessments || []), [bodyAssessments]);
  // O4 (2026-10-04): o peso do cartão é a ÚLTIMA PESAGEM, com a data a que
  // pertence ("74,6 kg · há 3 dias") — não a média EWMA, que não tem data e
  // pode andar quilos longe do que a balança disse. A tendência (Em perda /
  // Estável / Em ganho, kg/sem) só existe quando o contrato de weightTrend a
  // dá como suficiente (≥3 pesagens em ≥10 dias): com uma pesagem, ou pesagens
  // muito espaçadas, o cartão dizia "Estável · 0 kg/sem" — um facto inventado.
  const lastWeighing = weightTrend?.rawPoints?.length
    ? weightTrend.rawPoints[weightTrend.rawPoints.length - 1]
    : null;
  const currentWeight = lastWeighing?.weight > 0 ? dec(lastWeighing.weight, 1) : '—';
  const weighingAge = lastWeighing ? idadeDaPesagem(lastWeighing.date) : null;
  // Porta de recência (revisão 2026-10-04): o contrato do weightTrend não tem
  // regra de frescura — 3 pesagens de há 100 dias davam "Em perda" no presente.
  // Com a última pesagem a mais de 14 dias não se afirma tendência.
  const weighingDays = lastWeighing
    ? Math.round((Date.parse(`${todayISO()}T00:00:00Z`) - Date.parse(`${lastWeighing.date}T00:00:00Z`)) / 86400000)
    : NaN;
  const weighingStale = Number.isFinite(weighingDays) && weighingDays > WEIGHT_TREND_WINDOW_DAYS;
  const trendKnown = !weighingStale && weightTrend?.sufficient === true && weightTrend?.weeklyRate != null;
  const bodyDelta = trendKnown
    ? (Math.abs(weightTrend.weeklyRate) < 0.05
        ? '0,0 kg/sem'
        : `${weightTrend.weeklyRate > 0 ? '+' : ''}${dec(weightTrend.weeklyRate, 1)} kg/sem`)
    : null;
  const bodyBadge = useMemo(() => {
    if (!lastWeighing) return { label: 'Sem dados', color: 'neutral' };
    if (weighingStale) return { label: 'Desatualizado', color: 'neutral' };
    if (!trendKnown) return { label: 'A calibrar', color: 'neutral' };
    if (weightTrend.trend === 'descendo') return { label: 'Em perda', color: 'blue' };
    if (weightTrend.trend === 'subindo') return { label: 'Em ganho', color: 'yellow' };
    return { label: 'Estável', color: 'green' };
  }, [weightTrend, lastWeighing, trendKnown, weighingStale]);
  const weekBodyAssessments = useMemo(() =>
    filterByDateRange(bodyAssessments || [], 'semana'), [bodyAssessments]
  );
  const weekBodyText = weekBodyAssessments.length > 0
    ? `${weekBodyAssessments.length} ${plural(weekBodyAssessments.length, 'avaliação', 'avaliações')} esta semana`
    : 'Sem avaliações esta semana';
  // Sem tendência, diz-se o que FALTA, não o requisito em abstrato (revisão
  // 2026-10-04: "preciso de 3 pesagens em 10 dias (tenho 9 em 8 dias)" parecia
  // cumprido, e "(tenho 1)" com 2 registos escondia que a contagem é só da
  // janela). Duas faltas distintas, pela ordem do contrato:
  //  1) menos de 3 pesagens na janela de 14 dias até à última;
  //  2) pesagens que não cobrem 10 dias (ex.: 9 pesagens em 8 dias).
  const trendMissing = (() => {
    if (weighingStale) return `A última pesagem tem ${weighingDays} dias; com pesagens recentes volto a calcular a tendência.`;
    const n = weightTrend?.pointsInWindow;
    const span = weightTrend?.spanDays;
    if (!Number.isFinite(n) || !Number.isFinite(span)) {
      return `Para a tendência preciso de pelo menos ${WEIGHT_TREND_MIN_POINTS} pesagens que cubram ${WEIGHT_TREND_MIN_SPAN_DAYS} dias.`;
    }
    if (n < WEIGHT_TREND_MIN_POINTS) {
      return `Para a tendência preciso de ${WEIGHT_TREND_MIN_POINTS} pesagens nos ${WEIGHT_TREND_WINDOW_DAYS} dias até à última (tenho ${n}).`;
    }
    return `Para a tendência as pesagens têm de cobrir pelo menos ${WEIGHT_TREND_MIN_SPAN_DAYS} dias (as tuas cobrem ${span} ${plural(span, 'dia', 'dias')}).`;
  })();
  const bodySubtitle = lastWeighing && !trendKnown
    ? `${weekBodyText}. ${trendMissing}`
    : weekBodyText;

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
            coachPlans={coachPlans}
            coachPlanItems={coachPlanItems}
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
        <p className="text-[11px] font-bold text-[var(--text-3)] uppercase tracking-widest mb-2">Visão Estratégica</p>
      </div>

      <RaceReadinessCard
        runs={runs}
        meals={meals}
        bodyAssessments={bodyAssessments}
        gymSessions={gymSessions}
        raceEvents={raceEvents}
        profile={profile}
        coachPlans={coachPlans}
        coachPlanItems={coachPlanItems}
        onClickRace={(id) => setEditingRaceId(id)}
      />

      <SmartInsightsBanner data={data} profile={profile} maxItems={3} />

      {/* ─── Secção 2: Estado Atual dos 4 Pilares ──────── */}
      <div className="px-1 mt-2">
        <p className="text-[11px] font-bold text-[var(--text-3)] uppercase tracking-widest mb-2">Estado Atual</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <PillarSummaryCard
          title="Corrida"
          icon={PILLAR_ICONS.corrida}
          kpi={weekDist > 0 ? dec(weekDist, 1) : '—'}
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
                ? dec(gymStats.totalVolumeLoad / 1000, 1) + 'k'
                : Math.round(gymStats.totalVolumeLoad)}`
            : '—'}
          kpiUnit={gymStats?.totalVolumeLoad > 0 ? 'kg vol.' : ''}
          badge={{ label: `${weekSessions} ${plural(weekSessions, 'sessão', 'sessões')}`, color: weekSessions >= 2 ? 'green' : weekSessions === 1 ? 'yellow' : 'neutral' }}
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
          kpiUnit={currentWeight !== '—' ? `kg${weighingAge ? ` · ${weighingAge}` : ''}` : ''}
          badge={bodyBadge}
          delta={bodyDelta}
          subtitle={bodySubtitle}
          onClick={() => scrollToTab('corpo')}
        />
      </div>

      {/* ─── Secção 3: Análise Cruzada (colapsada) ───── */}
      <div className="px-1 mt-2">
        <p className="text-[11px] font-bold text-[var(--text-3)] uppercase tracking-widest mb-2">Análise Cruzada</p>
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
