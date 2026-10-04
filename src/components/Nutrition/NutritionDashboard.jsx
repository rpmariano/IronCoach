import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Utensils } from 'lucide-react';
import { useAppStore } from '../../store';
import { addDaysISO } from '../../lib/utils';
import { usePeriodStore } from '../../store/periodStore';
import { useEvolutionView } from '../../store/evolution/useEvolutionView';
import { NUTRITION_MIN_CLOSED } from '../../store/evolution/views/nutrition';
import { GOAL_KEY, micronutrientAverages } from '@formulas/nutritionPeriod.ts';
import { mondayOf } from '@formulas/calendarPeriod.ts';
import DayNutritionCard, { dayTitle } from './DayNutritionCard';
import { NutritionEnteredContext, useNutritionEntered } from './NutritionChartCard';
import NutritionWeekChart from './NutritionWeekChart';
import NutritionMonthHeatmap from './NutritionMonthHeatmap';
import NutritionQuarterCharts from './NutritionQuarterCharts';
import EatingForTraining from './EatingForTraining';
import MicronutrientsCard from './MicronutrientsCard';
import EmptyModuleState from '../BI/EmptyModuleState';
import VerdictLine from '../BI/VerdictLine';
import { NUTRICAO } from '../BI/TimeFilterBar';
import {
  PeriodHeader, PeriodNav, PeriodSummary, EarlyPeriodState, TodayExcludedNote, MinDataNote,
  countOf, plural, nDays, earlyVerdict, firstPeriodNote, APPROX_GOALS_NOTE, kindText, whereOf,
} from '../BI/period';
import { goalsResolver, dayNutritionSummary, planMacrosForDay } from '../../utils/goalHistory';
import { NUTRIENT_META, NUTRIENT_ORDER } from '../../utils/nutrition';
import { capitalize } from '../../utils/verdicts/shared';
import { useCalendarPeriod } from '../../utils/useCalendarPeriod';
import { useTodayISO } from '../../utils/useTodayISO';
import { fmtInt, rangeText, wherePast } from './nutritionText';

/**
 * Nutrição na Evolução — o mock-up aprovado "Evolução · Nutrição por período"
 * (fase 4, 2026-10-04; plano §3, R1–R10; erros N1, N2, N3, N5, N6, N7).
 *
 *   Dia · Semana · Mês · Trimestre (PeriodHeader)
 *   ┌ Resumo do período ─────────────────────────────┐
 *   │ ‹ Esta semana · 28 set – 4 out · em curso ›     │  PeriodNav
 *   │ ▍ veredicto factual                             │
 *   │ 5 linhas: média por dia registado / objetivo,   │  tocar escolhe o que
 *   │   Dentro · 96%, "4 de 6" dias no objetivo       │  os gráficos mostram
 *   │ Calorias e proteína no objetivo em 2 de 6 dias · ▼ 1 face a 21 – 26 set
 *   └─────────────────────────────────────────────────┘
 *   Semana: barras por dia · Mês: mapa de calor · Trimestre: por semana,
 *   dias no objetivo por semana, por dia da semana
 *   Comer para treinar (ou quando aparece) · Micronutrientes · nota de hoje
 *
 * Os números chegam prontos da vista pré-calculada (views/nutrition.js, F6 —
 * só dias fechados, objetivo de cada dia, régua única); aqui só se formatam.
 * O "Dia" é a vista de sempre (DayNutritionCard, bug #51), intacta.
 */

/** As 5 linhas do resumo (PeriodSummary) a partir da vista. */
export function summaryRowsOf(view, { aComecar = false } = {}) {
  return NUTRIENT_ORDER.map((key) => {
    const meta = NUTRIENT_META[key];
    const s = view.summary.byKey[key];
    const goalVal = s.goal ?? Number(view.goalsToday?.[GOAL_KEY[key]]);
    const base = { key, label: meta.label, goal: goalVal > 0 ? `${fmtInt(goalVal)} ${meta.unit}` : undefined, color: meta.color };
    if (aComecar) return { ...base, value: null, missingText: 'ainda sem dias fechados' };
    if (s.nDays === 0) return { ...base, value: null, missingText: view.period.isCurrent ? 'ainda sem registos' : 'sem registos' };
    if (s.tooFew) return { ...base, value: null, missingText: `${nDays(s.nDays)}, ${plural(s.nDays, 'pouco', 'poucos')} para média` };
    return {
      ...base,
      value: fmtInt(s.avg),
      status: s.status,
      pct: s.pctLabel,
      count: countOf(s.daysInGoal, s.nDays),
    };
  });
}

/** "Calorias e proteína no objetivo em 14 de 28 dias (50%)" e o ▲/▼ (R4/R5). */
export function summaryFooterOf(view) {
  const both = view.summary.both;
  const cmp = view.compare;
  const pctMode = !!cmp && !cmp.both.sameN;
  const summaryLine = both.n > 0
    ? `Calorias e proteína no objetivo em ${countOf(both.k, both.n)} ${plural(both.n, 'dia', 'dias')}${pctMode && cmp.both.curPct != null ? ` (${cmp.both.curPct}%)` : ''}`
    : null;
  let delta = null;
  if (cmp) {
    // O mesmo número de dias dos dois lados (a semana em curso contra os
    // mesmos dias da anterior): a diferença de dias. Senão, as % — "▲ agosto:
    // 11 de 29 (38%)".
    delta = cmp.both.sameN
      ? { current: cmp.both.cur.k, previous: cmp.both.prev.k, previousLabel: cmp.label, better: 'up' }
      : {
          current: cmp.both.curPct,
          previous: cmp.both.prevPct,
          previousLabel: cmp.label,
          previousText: `${countOf(cmp.both.prev.k, cmp.both.prev.n)} (${cmp.both.prevPct}%)`,
          better: 'up',
        };
  }
  return { summaryLine, delta };
}

/**
 * O dia de HOJE ainda não acabou (2026-10-04, reparo da verificação no
 * browser): com um pequeno-almoço às 8h o veredicto dizia "Estás a comer abaixo
 * do que gastas… 4 kcal/kg" — num dia em curso não se julga a energia
 * disponível nem o défice, só se diz o que já vai, sem conclusão (mock-up:
 * "até agora … · ainda em curso"). Os dias fechados não têm veredicto aqui.
 * `rows` são as do dia (dayNutritionSummary): calorias e proteína.
 */
// Espaço duro entre o número e a unidade (nunca parte a linha em "2 400 / kcal").
const NB = '\u00a0';

export function todayProgressVerdict(rows) {
  const by = Object.fromEntries((rows || []).map((r) => [r.key, r]));
  const kcal = by.calories;
  const prot = by.protein;
  const recorded = (rows || []).some((r) => r.key !== 'water' && r.status !== 'sem_registo');
  if (!recorded || !kcal) {
    return { text: 'Hoje ainda sem refeições registadas — o dia só conta quando acabar.', tone: 'neutral' };
  }
  const part = (r, unit) => `${fmtInt(r.value)} de ${fmtInt(r.target)}${NB}${unit}`;
  const bits = [part(kcal, 'kcal')];
  if (prot && prot.target > 0) bits.push(`${part(prot, 'g')} de proteína`);
  return {
    // Revisão 2026-10-04: «ainda» repetido; o mock-up diz «— ainda em curso».
    text: `Hoje, até agora: ${bits.join(' e ')} — ainda em curso.`,
    tone: 'neutral',
  };
}

/**
 * O lugar do "Comer para treinar" quando ainda não há dias que cheguem (R6).
 * Período em curso que ainda lá chega: "Comer para treinar aparece a partir
 * de 7 dias fechados neste mês." (mock-up). Período passado, ou em curso que
 * começou tão perto do 1.º registo que nunca lá chega: dizer quantos dias há
 * em vez de prometer no futuro "neste mês" um mês que já fechou (revisão de
 * 2026-10-04): "Comer para treinar precisa de 7 dias fechados — em setembro
 * só houve 3 dias desde o primeiro registo."
 */
export function eatingMinNoteProps(view, todayISO) {
  const min = view.eating.minClosed;
  const p = view.period;
  const reachable = view.daysFromDataStart ?? p.totalDays;
  if (p.isCurrent && reachable >= min) return { what: 'Comer para treinar', min, kind: view.kind };
  const k = p.isCurrent ? reachable : view.eating.closedDays;
  const where = p.isCurrent ? whereOf(view.kind, view.label.title, true) : wherePast(view.kind, p.start, todayISO, view.offset);
  const since = view.startsBeforeData ? ' desde o primeiro registo' : '';
  return {
    text: `Comer para treinar precisa de ${min} ${plural(min, 'dia fechado', 'dias fechados')} — ${where} só ${p.isCurrent ? 'há' : 'houve'} ${nDays(k)}${since}.`,
  };
}

/** "Semana passada (28 set – 4 out): 2 300 kcal/dia · calorias e proteína no
 *  objetivo em 2 de 7 dias" (ecrã "Semana a começar"). */
export function previousSummaryText(view, { withKind = false } = {}) {
  const pf = view.previousFull;
  if (!pf) return null;
  // Semana: o intervalo; mês/trimestre: o nome ("Mês passado (setembro)" no
  // cartão "a começar", "setembro" na linha do "cedo", antes de "Ver setembro").
  const name = view.kind === 'semana'
    ? `Semana passada (${pf.range})`
    : withKind ? `${capitalize(kindText(view.kind).prevName)} (${pf.name})` : pf.name;
  const kcal = pf.kcalAvg != null ? `${fmtInt(pf.kcalAvg)} kcal/dia · ` : '';
  return `${name}: ${kcal}calorias e proteína no objetivo em ${countOf(pf.both.k, pf.both.n)} ${plural(pf.both.n, 'dia', 'dias')}`;
}

export default function NutritionDashboard() {
  /* Seletor com useShallow em vez de `useAppStore()` inteiro (2026-10-04): sem
     seletor, qualquer alteração ao store — um deslize entre separadores
     mexe em `lastDashboardTab` — redesenhava este separador mesmo escondido. */
  const {
    profile, meals, setOpenCreationMode, waterLogs,
    coachPlans, coachPlanItems, nutritionDayFocus, goalHistory,
  } = useAppStore(useShallow((s) => ({
    profile: s.profile, meals: s.meals,
    setOpenCreationMode: s.setOpenCreationMode, waterLogs: s.waterLogs, coachPlans: s.coachPlans,
    coachPlanItems: s.coachPlanItems, nutritionDayFocus: s.nutritionDayFocus, goalHistory: s.goalHistory,
  })));

  const today = useTodayISO();
  // Os gráficos que montam depois de o separador assentar à vista (trocar
  // Semana → Mês, um período sem refeições → um com) não repetem a entrada (D4).
  const entered = useNutritionEntered();
  // A vista do período (cache da Evolução, pronta antes de entrar — R10) e o
  // período do separador (o mesmo store pequeno: as setas não redesenham a App).
  const view = useEvolutionView('nutricao');
  const cal = useCalendarPeriod('nutricao', {
    daysWithData: view?.daysWithData,
    dataStartISO: view?.dataStartISO,
    minClosed: NUTRITION_MIN_CLOSED,
  });
  const { setKind } = cal;
  const isDay = cal.kind === 'dia';

  /* A vista "Dia" anda de dia em dia (bug #51): o comido contra o objetivo
     DESSE dia, do histórico (profile_goal_history, no store desde F3). */
  const [selectedDay, setSelectedDay] = useState(today);
  const [metric, setMetric] = useState('calories');

  // "Ver dias anteriores" no Início: abre aqui, na vista Dia, nesse dia.
  useEffect(() => {
    if (!nutritionDayFocus) return;
    setKind('dia');
    setSelectedDay(nutritionDayFocus);
    useAppStore.getState().setNutritionDayFocus(null);
  }, [nutritionDayFocus, setKind]);

  // "Ver dia" (gráficos, dias de treino com pouca energia) e "Ver hoje".
  const openDay = useCallback((dayISO) => {
    setSelectedDay(dayISO);
    setKind('dia');
  }, [setKind]);
  // "Ver semana" (trimestre): a semana de calendário que começa nessa segunda.
  const openWeek = useCallback((weekStart) => {
    const weeks = Math.round((Date.parse(`${mondayOf(weekStart)}T12:00:00Z`) - Date.parse(`${mondayOf(today)}T12:00:00Z`)) / (7 * 86400000));
    usePeriodStore.getState().setPeriod('nutricao', 'semana', Math.min(0, weeks));
  }, [today]);

  const dayView = useMemo(() => {
    if (!isDay) return null;
    // Hoje (e o futuro) vale o perfil de agora — o resolvedor já trata disso.
    const { goals, estimated } = goalsResolver(goalHistory, profile, today)(selectedDay);
    return {
      rows: dayNutritionSummary({ meals, waterLogs, dayISO: selectedDay, goals }),
      estimated,
      plan: planMacrosForDay({ coachPlans, coachPlanItems, dayISO: selectedDay }),
      micros: micronutrientAverages(meals, [selectedDay]),
    };
  }, [isDay, selectedDay, today, goalHistory, profile, meals, waterLogs, coachPlans, coachPlanItems]);

  /* O veredicto da vista Dia só existe em hoje (como antes) e, como o dia ainda
     não acabou, só diz o que já vai — sem julgar a energia nem o défice
     (todayProgressVerdict). Os dias fechados não levam veredicto. */
  const dayVerdict = useMemo(() => {
    if (!dayView || selectedDay < today) return null;
    return todayProgressVerdict(dayView.rows);
  }, [dayView, selectedDay, today]);

  const header = <PeriodHeader tab="nutricao" options={NUTRICAO} cal={cal} navigator="none" />;

  if (isDay && dayView) {
    return (
      <div className="space-y-4 fade-in pb-20">
        {dayVerdict && <VerdictLine text={dayVerdict.text} tone={dayVerdict.tone} />}
        {header}
        <DayNutritionCard
          dayISO={selectedDay}
          todayISO={today}
          rows={dayView.rows}
          estimated={dayView.estimated}
          plan={dayView.plan}
          onPrev={() => setSelectedDay((d) => addDaysISO(d, -1))}
          onNext={() => setSelectedDay((d) => (d < today ? addDaysISO(d, 1) : d))}
        />
        <MicronutrientsCard
          title="Micronutrientes · total do dia"
          subtitle={dayTitle(selectedDay, today)}
          values={dayView.micros.avg}
          coverage={dayView.micros.coverage}
          coverageKnown={dayView.micros.coverageKnown}
          perDay={false}
          emptyText="Sem refeições registadas neste dia."
        />
      </div>
    );
  }

  const v = view && view.kind !== 'dia' ? view : null;

  /* Sem refeições nenhumas (nem água): o convite a registar, em vez de cinco
     linhas a "—" e gráficos vazios (ponto 7 do redesenho). */
  if (!v || (!v.hasAnyMeals && !(waterLogs || []).length)) {
    return (
      <div className="space-y-4 fade-in pb-20">
        {header}
        <EmptyModuleState
          tone="nutrition"
          icon={<Utensils size={22} />}
          actionLabel="Registar refeição"
          onAction={() => setOpenCreationMode('meal')}
        >
          Ainda não há refeições registadas. Regista uma refeição para veres a tua evolução aqui.
        </EmptyModuleState>
      </div>
    );
  }

  const kind = cal.kind;
  // O estado vem da vista, não do cal: conta os dias fechados desde o 1.º
  // registo quando o período em curso começa antes dele (revisão de
  // 2026-10-04 — nutritionEarlyState).
  const aComecar = v.earlyState === 'a_comecar';
  const cedo = v.earlyState === 'cedo';
  const desde = v.startsBeforeData ? rangeText(v.dataStartISO, v.dataStartISO, today) : null;
  const nav = <PeriodNav cal={cal} module="nutricao" closedDays={v.closedDays.length} dataStartISO={v.dataStartISO} />;
  const rows = summaryRowsOf(v, { aComecar });

  if (aComecar) {
    // R8 (ecrã "Semana · segunda-feira"): nada fechado ainda — o resumo a "—",
    // o que já se comeu hoje (sem contar) e o período anterior.
    const kcalToday = v.todayRow?.hasMeals ? v.todayRow.values.calories : null;
    return (
      <div className="space-y-4 fade-in pb-20">
        {header}
        <PeriodSummary navigator={nav} rows={rows} days={0} module="nutricao" />
        <EarlyPeriodState
          state="a_comecar"
          kind={kind}
          module="nutricao"
          // O período começou antes, mas o 1.º registo é hoje: "A semana
          // começou hoje" não seria verdade.
          title={v.dataStartISO === today && v.period.start < today ? 'Os teus registos começaram hoje' : undefined}
          text={kcalToday != null
            ? `Os dias contam quando acabarem — hoje já vais em ${fmtInt(kcalToday)} kcal.`
            : 'Os dias contam quando acabarem.'}
          onViewToday={() => openDay(today)}
          // Sem registos antes deste período, "Ver semana passada" abria uma
          // semana vazia.
          onViewPrevious={v.firstPeriod ? undefined : cal.prev}
          previousSummary={previousSummaryText(v, { withKind: true })}
        />
        <TodayExcludedNote period={v.period} hasDayView />
      </div>
    );
  }

  const { summaryLine, delta } = summaryFooterOf(v);
  const pf = v.previousFull;
  const previous = cedo && pf
    ? { text: previousSummaryText(v), actionLabel: kind === 'semana' ? 'Ver semana passada' : `Ver ${pf.name}`, onAction: cal.prev }
    : null;
  const notes = [
    v.firstPeriod && !cedo && v.summary.nDays > 0 ? firstPeriodNote(kind) : null,
    v.summary.approxGoals ? APPROX_GOALS_NOTE : null,
  ];
  const pastEmpty = !v.period.isCurrent && v.summary.nDays === 0;
  const where = kind === 'semana' ? v.label.range : v.label.title;

  return (
    <NutritionEnteredContext.Provider value={entered}>
      <div className="space-y-4 fade-in pb-20">
        {header}
        <PeriodSummary
          navigator={nav}
          // "Só 3 dias fechados em outubro" — ou, com o 1.º registo a meio do
          // período, "Só 2 dias fechados desde 30 set" (os de antes não contam).
          verdict={cedo ? earlyVerdict(cal, { count: v.closedDays.length, where: desde ? `desde ${desde}` : undefined }) : v.verdict}
          rows={rows}
          days={v.summary.nDays}
          selectedKey={metric}
          onSelect={setMetric}
          summaryLine={summaryLine}
          delta={delta}
          previous={previous}
          notes={notes}
          module="nutricao"
        />

        {pastEmpty ? (
          <MinDataNote text="Sem refeições registadas neste período." />
        ) : (
          <>
            {/* Sem `key` por período (D4, bloqueio da revisão de 2026-10-04): ‹ ›
                mantém a mesma instância — as barras mudam de altura em 300 ms e
                nada volta a entrar (transparente, da base, número do 0). O dia/
                semana escolhido volta ao de omissão sozinho (usePeriodPick). */}
            {kind === 'semana' && (
              <NutritionWeekChart view={v} metric={metric} onViewDay={openDay} todayISO={today} />
            )}
            {kind === 'mes' && (
              <NutritionMonthHeatmap view={v} metric={metric} onViewDay={openDay} todayISO={today} />
            )}
            {(kind === 'trimestre' || kind === 'ano') && (
              <NutritionQuarterCharts view={v} metric={metric} onViewWeek={openWeek} todayISO={today} />
            )}
            {v.eating.enough
              ? <EatingForTraining view={v} onViewDay={openDay} />
              : <MinDataNote {...eatingMinNoteProps(v, today)} />}
            <MicronutrientsCard
              title="Micronutrientes · média por dia"
              subtitle={`${where} · ${nDays(v.micros.nDays)}`}
              values={v.micros.avg}
              coverage={v.micros.coverage}
              coverageKnown={v.micros.coverageKnown}
              emptyText="Sem refeições registadas nos dias fechados deste período."
            />
          </>
        )}

        <TodayExcludedNote period={v.period} hasDayView />
      </div>
    </NutritionEnteredContext.Provider>
  );
}
