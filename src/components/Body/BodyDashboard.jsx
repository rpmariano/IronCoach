import React, { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { User } from 'lucide-react';
import { useAppStore } from '../../store';
import { usePeriodStore } from '../../store/periodStore';
import { useEvolutionView } from '../../store/evolution/useEvolutionView';
import '../../store/evolution/views/body';
import { useCalendarPeriod } from '../../utils/useCalendarPeriod';
import { useTodayISO } from '../../utils/useTodayISO';
import { BODY_METRIC_BY_KEY, fmtMetric, fmtSigned, fmtDayShort, GOAL_START_LOOKBACK_DAYS } from '../../utils/body';
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

/**
 * O texto do caminho até ao objetivo numa linha (2026-10-05): "faltam 1,3 kg ·
 * 62%", "objetivo atingido" ou "faltam 1,9 kg · mais longe" (afastou-se desde
 * o ponto de partida — um "0%" escondia o recuo). O "desde quando" vai na nota
 * do resumo (goalStartNote) e no leitor de ecrã: na linha, ao lado da barra e
 * da data, a frase inteira deixava a barra com poucos píxeis num telemóvel.
 */
export function progressText(m, p) {
  if (!p) return null;
  if (p.reached) return 'objetivo atingido';
  /* Sem caminho que se meça (revisão de 2026-10-05): só o facto, sem barra —
     "0,8 kg abaixo do objetivo" quando o peso passou o objetivo a partir de
     uma partida aproximada (não se sabe se o querias passar), "faltam 1,3 kg"
     quando a partida é a própria leitura. */
  if (p.noPath) return p.crossed ? `${fmtMetric(m, p.remaining)} ${p.below ? 'abaixo' : 'acima'} do objetivo` : `faltam ${fmtMetric(m, p.remaining)}`;
  return `faltam ${fmtMetric(m, p.remaining)} · ${p.away ? 'mais longe' : `${p.pct}%`}`;
}

/** O mesmo, por extenso, para o leitor de ecrã: "faltam 1,3 kg, 62% do caminho desde 12 jul". */
function progressSpoken(m, p, todayISO) {
  const desde = `${fmtDayShort(p.start.date, todayISO)}${p.approx ? ', ponto de partida aproximado' : ''}`;
  if (p.reached) return `objetivo atingido (a partir de ${fmtMetric(m, p.start.value)} a ${desde})`;
  if (p.noPath && p.crossed) return `${fmtMetric(m, p.remaining)} ${p.below ? 'abaixo' : 'acima'} do objetivo; passou-o desde ${fmtMetric(m, p.start.value)} a ${desde}`;
  if (p.noPath) return `faltam ${fmtMetric(m, p.remaining)}; sem leitura anterior nos últimos ${GOAL_START_LOOKBACK_DAYS} dias para medir o caminho`;
  if (p.away) return `faltam ${fmtMetric(m, p.remaining)}, mais longe do objetivo do que a ${desde}`;
  return `faltam ${fmtMetric(m, p.remaining)}, ${p.pct}% do caminho desde ${desde}`;
}

/**
 * A nota do resumo que diz de onde partem as barras (2026-10-05): "Barras: o
 * caminho até ao objetivo desde a leitura de 12 jul." — com "ponto de partida
 * aproximado" e o porquê quando não se sabe o dia em que o objetivo foi
 * definido. null sem nenhuma barra.
 */
export function goalStartNote(view, todayISO) {
  const withBar = view.rows.filter((r) => r.progress && !r.progress.noPath);
  if (!withBar.length) return null;
  const byDate = new Map();
  for (const r of withBar) {
    const d = r.progress.start.date;
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d).push(BODY_METRIC_BY_KEY[r.key].label.toLowerCase());
  }
  let desde;
  if (byDate.size === 1) desde = `desde a leitura de ${fmtDayShort(withBar[0].progress.start.date, todayISO)}`;
  else {
    const parts = [...byDate.entries()].map(([d, labels]) => `${fmtDayShort(d, todayISO)} (${labels.join(', ')})`);
    desde = `desde as leituras de ${parts.slice(0, -1).join(', ')} e ${parts.at(-1)}`;
  }
  const approx = withBar.map((r) => r.progress.approx).filter(Boolean);
  let porque = '';
  if (approx.includes('sem_historico')) {
    // Revisão de 2026-10-05: desde a 1.ª leitura dos últimos 90 dias, não de sempre.
    porque = ` Ponto de partida aproximado: a app ainda não guarda o dia em que ${withBar.length === 1 ? 'definiste o objetivo' : 'definiste os objetivos'} do corpo, por isso conto desde a primeira leitura dos últimos ${GOAL_START_LOOKBACK_DAYS} dias.`;
  } else if (approx.includes('antes_do_historico')) {
    porque = ' Ponto de partida aproximado: a app só guarda as mudanças de objetivos desde 3 out.';
  } else if (approx.includes('leitura_depois')) {
    porque = ' Ponto de partida aproximado: não há leitura de antes do dia em que definiste o objetivo, por isso conto desde a primeira depois dele.';
  }
  return `Barras: o caminho até ao objetivo ${desde}.${porque}`;
}

/** As linhas do PeriodSummary a partir da vista (só as métricas já registadas).
 *  2026-10-05: só as linhas com objetivo têm barra — o PROGRESSO real desde o
 *  ponto de partida (r.progress); sem objetivo, valor, leituras e data. */
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
    const p = r.progress;
    return {
      ...base,
      value: fmtMetric(m, r.last.value),
      // Com objetivo, a linha fala do caminho (a diferença face ao anterior
      // continua no leitor de ecrã e no gráfico da métrica).
      status: p ? (p.reached ? 'ok' : null) : STATUS_OF_TONE(r.cmp),
      statusText: p ? progressText(m, p) : statusText,
      // Sem caminho que se meça, sem barra (nem calha).
      barPct: p && !p.noPath ? p.pct : undefined,
      count: fmtDayShort(r.last.date, todayISO),
      ariaLabel: [
        `${m.label}: ${fmtMetric(m, r.last.value)} a ${fmtDayShort(r.last.date, todayISO)}`,
        r.goal != null ? `objetivo ${fmtMetric(m, r.goal)}` : null,
        p ? progressSpoken(m, p, todayISO) : null,
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

/**
 * A frase do período em curso ainda sem avaliações (C1, 2026-10-05, auditoria
 * dos limiares): diz onde está a última, em vez de só "conta no dia em que a
 * fazes" — quem se pesa de 10 em 10 dias abria o trimestre a 4 out sem
 * gráfico nenhum e sem saber que os dados estavam no anterior.
 */
export function emptyCurrentText(view, todayISO) {
  const base = 'Uma avaliação conta logo no dia em que a fazes — uma pesagem de hoje já entra.';
  const last = view.lastBeforeISO;
  if (!last) return base;
  const noAnterior = view.previous && last >= view.previous.start && last <= view.previous.end;
  return `${base} A última foi a ${fmtDayShort(last, todayISO)}${noAnterior ? `, ${view.kind === 'semana' ? 'na' : 'no'} ${kindText(view.kind).prevName}` : ''}.`;
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
          text={emptyCurrentText(v, today)}
          onViewToday={() => cal.setKind('dia')}
          todayLabel="Ver a última avaliação"
          /* Só com avaliações no anterior: o botão levava a um período vazio (C1, 2026-10-05). */
          onViewPrevious={v.previousSummary ? cal.prev : undefined}
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
    goalStartNote(v, today),
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
  const wider = v.compositionWider;
  /* C4 (2026-10-05): um período fechado sem nenhuma avaliação com gordura
     continua sem cartão — a não ser que haja num período maior: aí o cartão
     diz onde e leva lá. */
  const showComposition = v.metricKeys.includes('body_fat_pct') && (v.period.isCurrent || compN > 0 || !!wider);
  const compHint = compN > 0 ? `${compN} ${plural(compN, 'avaliação com gordura medida', 'avaliações com gordura medida')}` : undefined;
  let compEmpty = null;
  if (compN < 2) {
    const aqui = compN === 1
      ? `${v.period.isCurrent ? 'Só há' : 'Só houve'} 1 avaliação com gordura medida ${v.where} — a evolução precisa de 2.`
      : `${v.period.isCurrent ? 'Ainda sem' : 'Sem'} avaliações com gordura medida ${v.where} — a evolução precisa de 2.`;
    compEmpty = wider ? `${aqui} ${capitalize(wider.where)} há ${wider.n}:` : aqui;
  }
  const WIDER_WORD = { mes: 'mês', trimestre: 'trimestre', ano: 'ano' };
  const compAction = wider
    ? { label: `Ver ${WIDER_WORD[wider.kind] || wider.kind}`, onClick: () => usePeriodStore.getState().setPeriod('corpo', wider.kind, wider.offset) }
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
        /* C6 (2026-10-05): um período vazio diz onde está a avaliação mais
           perto — a primeira (se o período é anterior) ou a anterior. */
        <MinDataNote text={v.beforeFirst
          ? `Sem avaliações neste período — a primeira é de ${fmtDayShort(v.dataStartISO, today)}.`
          : v.lastBeforeISO
            ? `Sem avaliações ${v.where} — a anterior é de ${fmtDayShort(v.lastBeforeISO, today)}.`
            : 'Sem avaliações neste período.'} />
      ) : (
        <>
          {selected === 'weight_kg' && v.weight
            ? <WeightTrendChart weight={v.weight} period={v.period} todayISO={today} end={v.axisEnd} toToday={v.axisToToday} />
            : <BodyMetricChart metric={metric} row={row} period={v.period} prevName={v.prevName} todayISO={today} end={v.axisEnd} toToday={v.axisToToday} />}
          {showComposition && (
            <StackedAreaChart data={v.composition} start={v.period.start} end={v.axisEnd} hint={compHint} emptyText={compEmpty} emptyAction={compAction} />
          )}
        </>
      )}

      {todayNote}
    </div>
  );
}
