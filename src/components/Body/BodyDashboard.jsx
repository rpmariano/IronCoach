import React, { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { User } from 'lucide-react';
import { useAppStore } from '../../store';
import { useEvolutionView } from '../../store/evolution/useEvolutionView';
import '../../store/evolution/views/body';
import { useCalendarPeriod } from '../../utils/useCalendarPeriod';
import { useTodayISO } from '../../utils/useTodayISO';
import { BODY_METRIC_BY_KEY, fmtMetric, fmtSigned, fmtDayShort } from '../../utils/body';
import { capitalize } from '../../utils/verdicts/shared';
import StackedAreaChart from '../BI/StackedAreaChart';
import EmptyModuleState from '../BI/EmptyModuleState';
import { CORPO } from '../BI/TimeFilterBar';
import {
  PeriodHeader, PeriodNav, PeriodSummary, EarlyPeriodState, TodayExcludedNote, MinDataNote,
  plural, firstPeriodNote, scopeOf, kindText,
} from '../BI/period';
import BodyAssessmentDay from './BodyAssessmentDay';
import { BodyMetricChart, WeightTrendChart } from './BodyCharts';
import { BODY_DELTA_MIN_SPAN_DAYS } from '../../store/evolution/views/body';

/**
 * Corpo na Evolução por períodos de calendário (2026-10-04, fase 5 — plano §3
 * "Corpo" e decisão D1; erros C1–C5). A forma é a do mock-up aprovado da
 * Nutrição, aplicada às avaliações:
 *
 *   Dia · Semana · Mês · Trimestre · Ano (PeriodHeader, CORPO)
 *   Dia  → UMA avaliação (BodyAssessmentDay): ‹ › entre avaliações, todas as
 *          métricas com a diferença face à anterior e "Comparar com…".
 *   Resto┌ Resumo do período ──────────────────────────────┐
 *        │ ‹ outubro 2026 · em curso · 2 avaliações ›        │  PeriodNav
 *        │ ▍ veredicto do período (peso: ritmo, composição)  │
 *        │ Última leitura (2 avaliações)              Data   │
 *        │ PESO 74,2 kg / 72,0 kg  ✓ −1,1 kg vs set   3 out  │  tocar escolhe
 *        └───────────────────────────────────────────────────┘  o gráfico
 *        Peso → só a tendência (o gráfico "Peso" duplicado saiu, D5);
 *        outra métrica → o gráfico dela; composição (só avaliações válidas).
 *
 * Os números chegam prontos da vista pré-calculada (views/body.js, F6). Aqui
 * hoje CONTA: uma avaliação é um facto fechado no dia em que se faz (plano
 * §3 Corpo, "R2 aplica-se a médias") — por isso a nota do fundo diz isso, e
 * não o "hoje ainda não acabou" dos outros separadores.
 */

const TODAY_COUNTS = 'No Corpo, hoje conta: uma avaliação é um facto fechado assim que a fazes.';

const STATUS_OF_TONE = (cmp) => {
  if (!cmp || cmp.direction === 'flat') return null;
  if (cmp.tone === 'good') return 'ok';
  if (cmp.tone === 'bad') return cmp.direction === 'down' ? 'below' : 'above';
  return null;
};

/** As linhas do PeriodSummary a partir da vista (só as métricas já registadas). */
export function bodySummaryRows(view, todayISO) {
  return view.rows.map((r) => {
    const m = BODY_METRIC_BY_KEY[r.key];
    const base = { key: r.key, label: m.label, goal: r.goal != null ? fmtMetric(m, r.goal) : undefined, color: m.color };
    if (!r.last) {
      const lastTxt = r.lastBefore ? `última a ${fmtDayShort(r.lastBefore.date, todayISO)}` : null;
      return {
        ...base,
        value: null,
        missingText: lastTxt ? `sem leitura · ${lastTxt}` : 'sem leitura',
        ariaLabel: `${m.label}: sem leitura ${view.where}${r.lastBefore ? `; a última é de ${fmtDayShort(r.lastBefore.date, todayISO)}, ${fmtMetric(m, r.lastBefore.value)}` : ''}`,
      };
    }
    const readings = `${r.n} ${plural(r.n, 'leitura', 'leituras')}`;
    let statusText = readings;
    let spoken = readings;
    if (r.cmp && r.cmp.direction !== 'flat') {
      statusText = `${fmtSigned(m, r.cmp.diff)} vs ${view.prevName}`;
      const sentido = r.cmp.tone === 'good' ? ', no bom sentido' : r.cmp.tone === 'bad' ? ', no sentido contrário' : '';
      spoken = `${r.cmp.direction === 'up' ? 'subiu' : 'desceu'} ${fmtMetric(m, Math.abs(r.cmp.diff))} face a ${view.prevName}${sentido}; ${readings}`;
    } else if (r.cmp) {
      statusText = `= igual a ${view.prevName}`;
      spoken = `igual a ${view.prevName}; ${readings}`;
    }
    return {
      ...base,
      value: fmtMetric(m, r.last.value),
      status: STATUS_OF_TONE(r.cmp),
      statusText,
      count: fmtDayShort(r.last.date, todayISO),
      ariaLabel: [
        `${m.label}: ${fmtMetric(m, r.last.value)} a ${fmtDayShort(r.last.date, todayISO)}`,
        r.goal != null ? `objetivo ${fmtMetric(m, r.goal)}` : null,
        spoken,
      ].filter(Boolean).join(', '),
    };
  });
}

/**
 * A linha do anterior no rodapé do resumo, num período em curso com dados
 * (mock-up MesOutubro/TrimestreOutDez, 2026-10-04 revisão): "setembro:
 * última pesagem 76,6 kg a 28 set · 6 avaliações" — o "Ver setembro ›" é o
 * botão do PeriodSummary.
 */
export function bodyPreviousLine(view, todayISO) {
  const ps = view.previousSummary;
  if (!ps) return null;
  const w = ps.lastWeight ? `última pesagem ${fmtMetric(BODY_METRIC_BY_KEY.weight_kg, ps.lastWeight.value)} a ${fmtDayShort(ps.lastWeight.date, todayISO)} · ` : '';
  return `${view.prevName}: ${w}${ps.count} ${plural(ps.count, 'avaliação', 'avaliações')}`;
}

/** "Semana passada (21 – 27 set): última pesagem 74,6 kg a 26 set · 2 avaliações". */
export function bodyPreviousSummary(view, todayISO) {
  const ps = view.previousSummary;
  if (!ps) return null;
  const name = view.kind === 'semana'
    ? `${capitalize(kindText('semana').prevName)} (${ps.range})`
    : `${capitalize(kindText(view.kind).prevName)} (${ps.name})`;
  const w = ps.lastWeight ? `última pesagem ${fmtMetric(BODY_METRIC_BY_KEY.weight_kg, ps.lastWeight.value)} a ${fmtDayShort(ps.lastWeight.date, todayISO)} · ` : '';
  return `${name}: ${w}${ps.count} ${plural(ps.count, 'avaliação', 'avaliações')}`;
}

export default function BodyDashboard() {
  /* Seletor com useShallow em vez de `useAppStore()` inteiro (2026-10-04): sem
     seletor, qualquer alteração ao store — um deslize entre separadores
     mexe em `lastDashboardTab` — redesenhava este separador mesmo escondido. */
  const { profile, setOpenCreationMode } = useAppStore(useShallow((s) => ({
    profile: s.profile, setOpenCreationMode: s.setOpenCreationMode,
  })));
  const today = useTodayISO();
  const view = useEvolutionView('corpo');
  // minClosed 1: no Corpo não há "cedo" por dias fechados (hoje conta) — o
  // mínimo de dados é o das pesagens (weightTrend) e diz-se no veredicto.
  const cal = useCalendarPeriod('corpo', { dataStartISO: view?.dataStartISO, minClosed: 1 });
  const [metricKey, setMetricKey] = useState('weight_kg');

  const isDay = cal.kind === 'dia';
  const v = view && view.kind === cal.kind ? view : null;
  // A cobertura do navegador conta avaliações ("em curso · 2 avaliações"), não dias fechados.
  const calShown = v?.label ? { ...cal, label: v.label } : cal;
  const header = <PeriodHeader tab="corpo" options={CORPO} cal={calShown} navigator="none" />;

  /* Ponto 7 do redesenho: sem avaliações nenhumas, o convite a registar (com
     o botão que funciona — antes "Ir para o Calendário" não fazia nada). */
  if (!v || !v.hasAny) {
    return (
      <div className="space-y-4 fade-in pb-16">
        {header}
        <EmptyModuleState
          tone="body"
          icon={<User size={22} />}
          actionLabel="Registar avaliação"
          onAction={() => setOpenCreationMode('assessment')}
        >
          Ainda não há avaliações. Regista uma avaliação — podes enviar um print da Renpho Health — para veres a tua evolução aqui.
        </EmptyModuleState>
      </div>
    );
  }

  if (isDay) {
    return (
      <div className="space-y-4 fade-in pb-16">
        {header}
        <BodyAssessmentDay assessments={v.assessments} profile={profile} todayISO={today} />
      </div>
    );
  }

  const kind = cal.kind;
  const nav = <PeriodNav cal={calShown} module="corpo" />;
  const rows = bodySummaryRows(v, today);
  const selected = v.metricKeys.includes(metricKey) ? metricKey : v.metricKeys[0];
  const metric = BODY_METRIC_BY_KEY[selected];
  const row = v.rows.find((r) => r.key === selected);
  const averageLabel = `Última leitura (${v.count} ${plural(v.count, 'avaliação', 'avaliações')})`;
  const todayNote = <TodayExcludedNote period={v.period} text={TODAY_COUNTS} />;

  if (v.emptyCurrent) {
    // R8 (ecrã "Semana · segunda-feira" do mock-up): ainda nada neste período
    // — sem gráficos vazios; o que houve no anterior e o caminho para a última.
    return (
      <div className="space-y-4 fade-in pb-16">
        {header}
        <PeriodSummary
          navigator={nav}
          verdict={v.verdict}
          rows={rows}
          averageLabel={averageLabel}
          countLabel="Data"
          module="corpo"
        />
        <EarlyPeriodState
          state="a_comecar"
          kind={kind}
          module="corpo"
          title={v.justStarted ? undefined : `Ainda sem avaliações ${scopeOf(kind)}`}
          text="Uma avaliação conta logo no dia em que a fazes — uma pesagem de hoje já entra."
          onViewToday={() => cal.setKind('dia')}
          todayLabel="Ver a última avaliação"
          onViewPrevious={cal.prev}
          previousSummary={bodyPreviousSummary(v, today)}
        />
        {todayNote}
      </div>
    );
  }

  const notes = [
    // 2026-10-04, revisão: a regra é a maturidade do histórico (leituras a
    // cobrir ≥ 14 dias), uma condição que se cumpre também na semana.
    v.withheldSpan ? `As diferenças face a ${v.prevName} aparecem quando as tuas leituras cobrirem pelo menos ${BODY_DELTA_MIN_SPAN_DAYS} dias — antes disso, a balança diz mais da água do que do corpo.` : null,
    v.anyFlat ? 'Diferenças abaixo do erro da balança contam como iguais.' : null,
    v.firstPeriod ? firstPeriodNote(kind) : null,
  ];
  const empty = v.count === 0;
  // Linha do anterior com atalho, como no mock-up (mês/trimestre/ano em curso).
  const previous = v.period.isCurrent && kind !== 'semana' && v.previousSummary
    ? { text: bodyPreviousLine(v, today), actionLabel: `Ver ${v.prevName}`, onAction: cal.prev }
    : undefined;
  /* Composição (2026-10-04, revisão): num período fechado sem nenhuma
     avaliação com gordura medida, o cartão era só um "—" — sai. A pista diz
     o que conta ("3 avaliações com gordura medida"), não um 2.º contador de
     "avaliações" diferente do do resumo. */
  const compN = v.composition?.dates?.length || 0;
  const showComposition = v.metricKeys.includes('body_fat_pct') && (v.period.isCurrent || compN > 0);
  const compHint = compN > 0 ? `${compN} ${plural(compN, 'avaliação com gordura medida', 'avaliações com gordura medida')}` : undefined;
  const compEmpty = !v.period.isCurrent && compN === 1
    ? `Só houve 1 avaliação com gordura medida ${v.where} — a evolução precisa de 2.`
    : null;

  return (
    <div className="space-y-4 fade-in pb-16">
      {header}
      <PeriodSummary
        navigator={nav}
        verdict={v.verdict}
        rows={rows}
        averageLabel={averageLabel}
        countLabel="Data"
        selectedKey={selected}
        onSelect={setMetricKey}
        radioLabel="Escolher a métrica do gráfico"
        previous={previous}
        notes={notes}
        module="corpo"
      />

      {empty ? (
        <MinDataNote text={v.beforeFirst
          ? `Sem avaliações neste período — a primeira é de ${fmtDayShort(v.dataStartISO, today)}.`
          : 'Sem avaliações neste período.'} />
      ) : (
        <>
          {selected === 'weight_kg' && v.weight
            ? <WeightTrendChart weight={v.weight} period={v.period} todayISO={today} end={v.axisEnd} toToday={v.axisToToday} />
            : <BodyMetricChart metric={metric} row={row} period={v.period} prevName={v.prevName} todayISO={today} end={v.axisEnd} toToday={v.axisToToday} />}
          {showComposition && (
            <StackedAreaChart data={v.composition} start={v.period.start} end={v.axisEnd} hint={compHint} emptyText={compEmpty} />
          )}
        </>
      )}

      {todayNote}
    </div>
  );
}
