import React, { useMemo } from 'react';
import { useAppStore, sliceReady } from '../../store';
import { useShallow } from 'zustand/react/shallow';
import { Mountain } from 'lucide-react';
import { Bar } from 'react-chartjs-2';
import '../../lib/chartSetup';
import RunIcon from '../shared/RunIcon';
import { CORRIDA } from '../BI/TimeFilterBar';
import ACWRChart, { fmtRatio } from '../BI/ACWRChart';
import { barGrowAnimation } from '../../utils/introAnimations';
import useReducedMotion from '../../utils/useReducedMotion';
import IntensityDonut from '../BI/IntensityDonut';
import ScatterTrendChart from '../BI/ScatterTrendChart';
import RacePredictionChart from '../BI/RacePredictionChart';
import ChartFrame from '../BI/ChartFrame';
import EmptyModuleState, { EmptyChartFrame } from '../BI/EmptyModuleState';
import {
  PeriodHeader, PeriodNav, PeriodSummary, EarlyPeriodState, TodayExcludedNote, DeltaVsPrevious, MinDataNote,
  VerdictLine, countOf, plural, earlyVerdict, firstPeriodNote, TODAY_EXCLUDED,
} from '../BI/period';
import { fmtNumber, fmtDatePt, NO_DATA } from '../../utils/verdicts/shared';
import { formatPace } from '../../utils/run';
import { useCalendarPeriod } from '../../utils/useCalendarPeriod';
import { useOpenInClosedPeriod } from '../../store/periodStore';
import { fallbackAction } from '../BI/period/periodText';
import { useEvolutionView } from '../../store/evolution/useEvolutionView';
import {
  RUN_MIN_CLOSED, MIN_WEEKS_FOR_AVG, MIN_RUNS_FOR_ZONES, MIN_RUNS_FOR_EFFICIENCY, fmtRange,
} from '../../store/evolution/views/run';

const MONTHS_ABBR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
/** "4 out" (de uma data AAAA-MM-DD). */
const dayLabel = (iso) => `${Number(iso.slice(8, 10))} ${MONTHS_ABBR[Number(iso.slice(5, 7)) - 1]}`;

/* Corrida por períodos de calendário (2026-10-04, fase 5 do plano da
   Evolução — R1, R5, R6, R10). A forma é a do mock-up aprovado da Nutrição:
   o seletor (Semana · Mês · Trimestre · Ano) e o navegador ‹ › dentro do
   resumo, só dias FECHADOS (hoje não entra), "X de N", ▲/▼ só contra o
   período anterior equivalente, e um estado "a começar"/"cedo" em vez de
   números sem base. Os números vêm da vista pré-calculada
   (store/evolution/views/run.js); aqui só se apresenta.

   O que NÃO é do período diz-se: a carga (ACWR) é "de hoje · 7 d vs 28 d" e
   o gráfico "últimas 12 semanas"; o VDOT e os recordes são "de sempre". */

// Antes deste ecrã tinha o seu próprio formatPace, com um formato visível
// diferente do resto da app ("5:20/km" em vez de "5.20") — unificado por
// pedido explícito (specs/formulas-checklist.md Fase D). paceLabel() só
// acrescenta o "—" para dados em falta e o "/km", que aqui fazem parte do
// texto (o formatPace canónico devolve só o número).
function paceLabel(secPerKm) {
  if (!isFinite(secPerKm) || secPerKm <= 0) return '—';
  return `${formatPace(secPerKm)}/km`;
}

function formatDatePT(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr || ''));
  if (!m) return '';
  const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${Number(m[3])} ${months[Number(m[2]) - 1]} ${m[1]}`;
}

// R9 (2026-10-04): os escalões não são "pelo menos X km" (o "+" do rótulo
// antigo) mas intervalos fechados — um treino de 4,0 km conta como "5 km" e
// uma corrida de 7 ou de 15 km não conta em nenhum. Os valores espelham
// DISTANCE_RANGES de bestPace.ts (4–6,5 / 8,5–12 / 19–23 km); o teste do
// dashboard prova as fronteiras contra computeBestPace, para os dois não
// divergirem em silêncio.
const BEST_PACE_LEGEND = '≈5 km: corridas e splits de 4 a 6,5 km · ≈10 km: de 8,5 a 12 km · ≈21 km: de 19 a 23 km.';

/* Estado do ACWR de hoje → o vocabulário do PeriodSummary (✓ ↓ ↑). */
const ACWR_ROW_STATUS = { safe: 'ok', caution: 'above', danger: 'above', undertrained: null };

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const corridas = (n) => `${n} ${plural(n, 'corrida', 'corridas')}`;

const GRADIENT = (context) => {
  const { ctx, chartArea } = context.chart;
  if (!chartArea) return 'rgba(46, 224, 255, 0.6)';
  const gradient = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
  gradient.addColorStop(0, 'rgba(46, 224, 255, 0.25)');
  gradient.addColorStop(1, 'rgba(46, 224, 255, 0.9)');
  return gradient;
};

/* O cartão dos recordes e o do relógio são o mesmo cartão dos gráficos
   (ChartFrame: vidro, borda --border-glass, raio 20, padding 16, sombra do
   cartão) e o título/pista a mesma tipografia — antes eram um cartão Tailwind
   à parte (borda branca a 60%, sombra interior) que se via diferente ao lado
   dos outros (2026-10-04, reparo da verificação no browser). */
const cardStyle = {
  background: 'var(--surface-glass)',
  backdropFilter: 'blur(var(--blur-card))',
  WebkitBackdropFilter: 'blur(var(--blur-card))',
  border: '1px solid var(--border-glass)',
  borderRadius: 20,
  padding: 16,
  boxShadow: 'var(--shadow-card)',
};
const cardTitle = {
  margin: 0,
  fontSize: 'var(--text-xs)',
  fontWeight: 800,
  letterSpacing: '.09em',
  textTransform: 'uppercase',
  color: 'var(--text-3)',
};
const cardHint = { fontSize: 'var(--text-xs)', color: 'var(--text-4)', whiteSpace: 'nowrap', flexShrink: 0 };

/* O texto de um bloco que precisa de N corridas com um dado (zonas de FC, FC média).
   Três casos (R2/R3, 2026-10-05): nunca as teve → o convite a registar; já as teve
   mas não neste período → diz a última e onde há; tem algumas, poucas → "tens N".
   O fim ("Em setembro tens 9.") só entra quando há um período que as tem. */
function hrGateText({ what, needs, none, min, have, ever, fb, scope }) {
  if (!ever || ever.count === 0) return none;
  const onde = fb ? ` ${cap(fb.where)} tens ${fb.count}.` : '';
  if (have === 0) {
    return `${what}: ${scope} não há ${needs} — a última foi a ${fmtDatePt(ever.lastDate) || ever.lastDate}.${onde}`;
  }
  return `${what}: preciso de pelo menos ${min} ${needs} ${scope} (tens ${have}).${onde}`;
}

function DeltaLine({ label, children }) {
  return (
    <p style={{ margin: 0, display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
      <span style={{ color: 'var(--text-4)' }}>{label}</span>
      {children}
    </p>
  );
}

export default function RunDashboard() {
  /* Seletor com useShallow em vez de `useAppStore()` inteiro (2026-10-04): sem
     seletor, qualquer alteração ao store — um deslize entre separadores
     mexe em `lastDashboardTab` — redesenhava este separador mesmo escondido,
     que era o jank do deslize. Os dados de que a vista depende vêm do
     useEvolutionView (só redesenha quando uma dessas listas muda). */
  const { setOpenCreationMode } = useAppStore(useShallow((s) => ({ setOpenCreationMode: s.setOpenCreationMode })));
  const view = useEvolutionView('corrida');

  // UM só cal, partilhado pelo seletor, pelo navegador e pelo resumo (forma
  // do mock-up). Sem `daysWithData` de propósito: "9 de 30 dias com registo"
  // leria-se como falhas de registo, e para quem corre os dias de descanso não
  // são buracos — o rótulo diz só "desde …" e os dias fechados.
  const cal = useCalendarPeriod('corrida', { dataStartISO: view?.dataStartISO, minClosed: RUN_MIN_CLOSED });
  const reduced = useReducedMotion();
  const barsReady = useAppStore((s) => sliceReady(s, ['runs']));
  /* 2026-10-05: se o mês por omissão ainda não tem nenhum dia fechado, abre no
     anterior (a seta › leva ao mês a começar). Só decide quando as corridas JÁ
     chegaram (barsReady): useEvolutionView devolve sempre uma vista, mesmo com a
     fatia por carregar, e um null do 1.º render ficava gravado como "nunca
     registou" (revisão). Até lá, undefined = não decidir. */
  useOpenInClosedPeriod('corrida', view && barsReady ? (view.dataStartISO ?? null) : undefined);

  const bars = view?.bars || null;
  const barCount = bars?.values?.length;
  const chartData = useMemo(() => (bars ? {
    labels: bars.labels,
    datasets: [{
      label: 'Distância (km)',
      data: bars.values,
      // Ponto 6, paleta das séries: ciano da corrida (--run #2ee0ff), em tinta.
      backgroundColor: GRADIENT,
      borderRadius: 6,
      borderSkipped: false,
    }],
  } : null), [bars]);

  // Ponto 6: os ticks deixam de escrever dentro da tela. O total do período
  // é o número grande do ChartFrame e os extremos do eixo vão para os
  // cantos, em HTML. Ponto 9, animação 4: as barras crescem da base quando o
  // gráfico aparece no ecrã — a revelação é do ChartFrame; aqui só opções
  // estáveis e reduced-aware.
  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: (items) => bars?.labels?.[items?.[0]?.dataIndex] || '',
          label: (ctx) => ` ${fmtNumber(ctx.raw, 1)} km`,
        },
      },
    },
    animation: barGrowAnimation({ reduced, count: barCount }),
    scales: {
      y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { display: false }, border: { display: false } },
      x: { grid: { display: false }, ticks: { display: false }, border: { display: false } },
    },
  }), [reduced, barCount, bars]);

  if (!view) return null;

  const { cur, kind } = view;
  const period = cal.period;
  const early = view.earlyState;
  const scope = view.scope;
  const closedN = view.closedDays;
  const acwrZone = view.acwr?.status;
  const acwrHas = !!view.acwr?.hasEnoughData;

  /* ── Sem nenhuma corrida registada: o convite, com o seletor à vista. ── */
  if (!view.hasRuns) {
    return (
      <div className="space-y-4 fade-in">
        <VerdictLine text={NO_DATA.text} tone={NO_DATA.tone} />
        <PeriodHeader tab="corrida" options={CORRIDA} cal={cal} navigator="none" />
        <EmptyModuleState
          tone="run"
          icon={<RunIcon className="w-[22px] h-[22px]" />}
          actionLabel="Registar corrida"
          onAction={() => setOpenCreationMode('run')}
        >
          Ainda não há corridas. Regista uma corrida para veres a tua evolução aqui.
        </EmptyModuleState>
        <EmptyChartFrame label="Distância por dia" unit="km no período" />
      </div>
    );
  }

  const noDays = closedN === 0;
  const prevName = view.prevName;
  const prevFull = view.prevFull;

  /* ── As linhas do resumo (todas só de dias fechados) ── */
  const missingNoDays = view.beforeData ? 'antes do 1.º registo' : 'ainda sem dias fechados';
  const rows = [];
  rows.push({
    key: 'corridas',
    label: 'Corridas',
    value: noDays ? null : String(cur.count),
    missingText: noDays ? missingNoDays : undefined,
    count: noDays ? undefined : countOf(cur.daysWithRun, closedN),
  });
  rows.push({
    key: 'distancia',
    label: 'Distância',
    value: noDays ? null : `${fmtNumber(cur.km, 1)} km`,
    missingText: noDays ? missingNoDays : undefined,
  });
  rows.push({
    key: 'pace',
    label: 'Pace médio',
    value: noDays || !cur.paceSec ? null : paceLabel(cur.paceSec),
    // R3/R4: o denominador do ritmo — "N de M com tempo" — só com corridas.
    statusText: !noDays && cur.paceSec ? (cur.withTime < cur.count ? `${cur.withTime} de ${cur.count} com tempo` : `em ${corridas(cur.withTime)}`) : undefined,
    missingText: noDays ? missingNoDays : (!cur.paceSec ? (cur.count === 0 ? 'sem corridas' : 'sem distância e tempo') : undefined),
  });
  if (kind !== 'semana') {
    const w = view.weekly;
    const enough = w.weeks >= MIN_WEEKS_FOR_AVG && w.avgKm != null;
    rows.push({
      key: 'semanal',
      label: 'Média por semana',
      value: !noDays && enough ? `${fmtNumber(w.avgKm, 1)} km` : null,
      // R4 (2026-10-05): semanas seg–dom fechadas que TOCAM o período; o intervalo vai na nota.
      statusText: enough ? `em ${w.weeks} ${plural(w.weeks, 'semana', 'semanas')}` : undefined,
      missingText: noDays ? missingNoDays : (!enough
        ? (w.weeks === 0
          ? (w.nextCloseISO ? `a 1.ª semana fecha a ${dayLabel(w.nextCloseISO)}` : 'sem semanas fechadas')
          : `só ${w.weeks} ${plural(w.weeks, 'semana fechada', 'semanas fechadas')}, pouco para média`)
        : undefined),
    });
  }
  rows.push({
    key: 'carga',
    label: 'Carga · 7 d vs 28 d',
    value: acwrHas ? fmtRatio(view.acwr.ratio) : null,
    goal: '0,8–1,3',
    status: acwrHas ? ACWR_ROW_STATUS[acwrZone] : null,
    statusText: acwrHas ? view.acwrStatus.label : undefined,
    missingText: acwrHas ? undefined : view.acwrStatus.label,
    ariaLabel: acwrHas
      ? `Carga de hoje, últimos 7 dias contra a média dos últimos 28: ${fmtRatio(view.acwr.ratio)} de 0,8 a 1,3, ${view.acwrStatus.label}`
      : `Carga de hoje: ${view.acwrStatus.label}`,
  });

  // Uma só definição de "dias fechados" (2026-10-04): quem a diz é o navegador
  // ("em curso · 124 dias fechados", com o "desde 13 jul" quando o histórico
  // começa dentro do período — PeriodNav closedDays). O bloco de KPIs deixou de
  // a repetir ("No período (124 dias fechados)" ao lado de "276 de 365" eram
  // dois números para a mesma coisa).
  const averageLabel = 'No período';

  /* ── O veredicto: "cedo" substitui só o que fala do período (neutro); um
     aviso de carga é de hoje e fica. ── */
  const earlyIsVerdict = early === 'cedo' && view.verdict.tone === 'neutral';
  // Os dias fechados contam-se desde o 1.º registo; se o período começou antes dele,
  // diz-se, para não contradizer o rótulo do navegador ("6 de 7 dias fechados").
  const earlyWhere = closedN < period.closedDays ? `${scope} (desde o 1.º registo)` : undefined;
  const earlyOpts = { count: closedN, where: earlyWhere };
  const verdict = earlyIsVerdict ? earlyVerdict(cal, earlyOpts) : view.verdict;

  /* ── ▲/▼ face ao anterior equivalente e fechado (R5) ── */
  const d = view.delta;
  const showDeltas = early === 'ok' && !!d;
  const notes = [];
  if (early === 'ok' && !d && !view.beforeData) {
    if (view.prevCoverage === 'none') notes.push(firstPeriodNote(kind));
    else if (view.prevCoverage === 'partial') {
      notes.push(`${cap(prevName)} começou antes do teu primeiro registo (${fmtRange(view.dataStartISO, view.dataStartISO)}) — não dá para comparar.`);
    }
  }
  if (kind !== 'semana' && view.weekly.weeks >= 1 && !view.beforeData) {
    notes.push(`A média por semana usa as semanas seg–dom já fechadas que tocam o período (${view.weekly.range}).`);
  }
  notes.push('A carga é a de hoje (últimos 7 dias contra a média semanal dos últimos 28), não a do período.');

  const prevSummaryText = prevFull
    ? `${prevName}: ${prevFull.count > 0 ? `${corridas(prevFull.count)} · ${fmtNumber(prevFull.km, 1)} km` : 'sem corridas'}`
    : null;
  /* M2/R10 (2026-10-05): "cedo" e período sem corridas dizem ONDE há corridas e
     levam lá: o período anterior e, se nem esse tem, o tipo maior ("Ver o ano"). */
  const dataFb = view.fallbacks?.data || null;
  const emptyPeriod = cur.count === 0;
  const fbSummary = (fb) => (fb.type === 'prev' && prevSummaryText
    ? prevSummaryText
    : `${cap(fb.where)}: ${corridas(fb.count)} · ${fmtNumber(fb.km, 1)} km`);
  const previousLine = early === 'cedo'
    ? (dataFb
      ? { text: fbSummary(dataFb), ...fallbackAction(dataFb, cal) }
      : prevSummaryText ? { text: prevSummaryText, actionLabel: `Ver ${prevName}`, onAction: cal.prev } : undefined)
    : (emptyPeriod && dataFb ? { text: fbSummary(dataFb), ...fallbackAction(dataFb, cal) } : undefined);

  const deltas = showDeltas ? (
    <div data-testid="run-deltas" style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>
      {(d.count.cur + d.count.prev > 0) && (
        <DeltaLine label="Corridas">
          <DeltaVsPrevious current={d.count.cur} previous={d.count.prev} previousLabel={d.label} better="none"
            unit={Math.abs(d.count.cur - d.count.prev) === 1 ? 'corrida' : 'corridas'} />
        </DeltaLine>
      )}
      {(d.km.cur + d.km.prev > 0) && (
        <DeltaLine label="Distância">
          <DeltaVsPrevious current={d.km.cur} previous={d.km.prev} previousLabel={d.label} better="none" decimals={1} unit="km" />
        </DeltaLine>
      )}
      {d.pace && (
        <DeltaLine label="Pace médio">
          <DeltaVsPrevious current={d.pace.cur} previous={d.pace.prev} previousLabel={d.label} better="down" unit="s/km" />
        </DeltaLine>
      )}
      {d.weekly && (
        <DeltaLine label="Média por semana">
          <DeltaVsPrevious current={d.weekly.cur} previous={d.weekly.prev} previousLabel={d.label} better="none" decimals={1} unit="km" />
        </DeltaLine>
      )}
    </div>
  ) : null;

  /* ── "A começar": nenhum dia fechado — resumo vazio e o do período anterior. ── */
  const todayKm = view.todayRuns?.km || 0;
  const startedText = view.todayRuns?.count > 0
    ? `Os dias contam quando acabarem — hoje já registaste ${todayKm > 0 ? `${fmtNumber(todayKm, 1)} km` : corridas(view.todayRuns.count)}.`
    : 'Os dias contam quando acabarem.';
  const prevPeriodSummary = prevFull
    ? `${cap(view.prevLabel.title)} (${view.prevLabel.range}): ${prevFull.count > 0 ? `${corridas(prevFull.count)} · ${fmtNumber(prevFull.km, 1)} km` : 'sem corridas'}`
    : undefined;

  const navigator = <PeriodNav cal={cal} module="corrida" closedDays={closedN} dataStartISO={view.dataStartISO} />;
  // A carga (KPI e barra da semana em curso) é a de hoje e inclui as corridas de hoje (R1,
  // número da Carol): a nota não pode dizer que hoje não entra em nada.
  const today = <TodayExcludedNote period={period} text={`${TODAY_EXCLUDED.replace(/\.$/, '')} do período (a carga e os recordes já o incluem); aparece amanhã.`} />;

  /* ── Os blocos de fora do período: ACWR (hoje, 12 semanas), VDOT e recordes (de sempre). ── */
  const vdotCompare = view.vdotCompare
    ? { current: view.vdotCompare.current, previous: view.vdotCompare.previous, previousLabel: view.vdotCompare.previousLabel, currentWhere: view.vdotCompare.currentWhere }
    : null;

  const renderBucket = ({ km, best, inPeriod }) => {
    const label = `≈${km} km`;
    if (!best) {
      return (
        <div key={km} className="flex items-center justify-between gap-3 py-1.5 border-b border-[var(--border-glass)] last:border-0">
          <p className="text-xs text-[var(--text-3)] font-medium">{label}</p>
          <p className="text-xs text-[var(--text-3)]">Sem dados</p>
        </div>
      );
    }
    return (
      <div key={km} className="flex items-center justify-between gap-3 py-1.5 border-b border-[var(--border-glass)] last:border-0">
        <div>
          <p className="text-xs text-[var(--text-3)] font-medium">{label}</p>
          <p className="text-[11px] text-[var(--text-3)] mt-0.5 flex items-center gap-1.5 flex-wrap">
            {formatDatePT(best.date)}
            {best.source === 'run' && best.runCount > 0 && (
              <> · de {best.runCount} corrida{best.runCount > 1 ? 's' : ''} nesta distância</>
            )}
            {best.source === 'split' && (
              <span
                className="px-1 py-0.5 rounded text-[11px] font-bold uppercase tracking-wide"
                style={{ background: 'var(--tint-run-bg)', color: 'var(--run)' }}
              >split</span>
            )}
            {inPeriod && (
              <span data-testid="recorde-no-periodo" style={{ color: 'var(--ok)', fontWeight: 700 }}>· neste período</span>
            )}
          </p>
        </div>
        <p className="text-base font-extrabold text-white">{paceLabel(best.pace)}</p>
      </div>
    );
  };

  const independent = (
    <>
      <p data-testid="fora-do-periodo" style={{ margin: 0, padding: '0 12px', textAlign: 'center', fontSize: 'var(--text-xs)', lineHeight: 'var(--leading-normal)', color: 'var(--text-4)' }}>
        A carga das últimas 12 semanas, o VDOT e os recordes de sempre não seguem o período escolhido — só a comparação do VDOT e a marca «neste período» dos recordes o usam.
      </p>
      <ACWRChart weeklyData={view.weeklyAcwr} acwr={view.acwr} />

      {view.vdotTrend.length > 0 && (
        <RacePredictionChart
          vdotTrend={view.vdotTrend}
          prediction={view.racePrediction}
          compare={vdotCompare}
          compareNote={view.vdotNote}
        />
      )}

      {/* Recordes: de sempre, dentro e fora do período (R9 + 2026-10-04) */}
      <div style={cardStyle}>
        <h2 style={{ ...cardTitle, marginBottom: 4 }}>Melhor pace de sempre</h2>
        <p data-testid="recordes-de-sempre" className="text-[11px] text-[var(--text-3)] mb-2">
          De sempre, hoje incluído — entre todas as tuas corridas, não só as deste período.
        </p>
        <div className="space-y-1">
          {view.records.map(renderBucket)}
        </div>
        {/* R9: o intervalo real de cada escalão (bestPace.ts, DISTANCE_RANGES). */}
        <p data-testid="recordes-intervalos" className="text-[11px] text-[var(--text-3)] mt-2">{BEST_PACE_LEGEND}</p>
      </div>
    </>
  );

  /* ── "A começar" (segunda-feira, dia 1): sem gráficos nem médias de 0 dias. ── */
  if (early === 'a_comecar') {
    return (
      <div className="space-y-4 fade-in">
        <PeriodHeader tab="corrida" options={CORRIDA} cal={cal} navigator="none" />
        <PeriodSummary
          module="corrida"
          navigator={navigator}
          rows={rows}
          averageLabel={averageLabel}
          countLabel="Dias com corrida"
          notes={[notes[notes.length - 1]]}
        />
        <EarlyPeriodState
          state="a_comecar"
          kind={kind}
          module="corrida"
          title={view.firstDay ? 'Os teus registos começam hoje' : undefined}
          text={startedText}
          onViewPrevious={view.prevCoverage === 'none' ? undefined : cal.prev}
          previousSummary={prevPeriodSummary}
          {...(dataFb?.type === 'kind' ? fallbackAction(dataFb, cal) : {})}
        />
        {independent}
        {today}
      </div>
    );
  }

  /* ── Período sem corridas (ou anterior ao 1.º registo): o texto diz-o e o resto
     (carga, VDOT, recordes) não se esconde. ── */
  const wm = view.watch;
  const showWatch = !emptyPeriod && wm.hasAny;

  return (
    <div className="space-y-4 fade-in">
      <PeriodHeader tab="corrida" options={CORRIDA} cal={cal} navigator="none" />

      <PeriodSummary
        module="corrida"
        navigator={navigator}
        verdict={verdict}
        rows={rows}
        averageLabel={averageLabel}
        countLabel="Dias com corrida"
        previous={previousLine}
        notes={notes}
      >
        {deltas}
      </PeriodSummary>

      {early === 'cedo' && !earlyIsVerdict && (
        <EarlyPeriodState state="cedo" cal={cal} module="corrida" earlyText={earlyVerdict(cal, earlyOpts).text} />
      )}

      {emptyPeriod ? (
        <EmptyModuleState
          tone="run"
          icon={<RunIcon className="w-[22px] h-[22px]" />}
          title={view.beforeData ? 'Antes do teu primeiro registo' : `Sem corridas ${scope}`}
          actionLabel={period.isCurrent ? 'Registar corrida' : undefined}
          onAction={period.isCurrent ? () => setOpenCreationMode('run') : undefined}
        >
          {view.beforeData
            ? `A tua primeira corrida registada é de ${fmtDatePt(view.dataStartISO) || fmtRange(view.dataStartISO, view.dataStartISO)}.`
            : (view.lastRunDate ? `A última foi a ${fmtDatePt(view.lastRunDate)}.` : 'Ainda não registaste corridas antes deste período.')}
        </EmptyModuleState>
      ) : (
        <>
          {/* 7. Distância — o mesmo intervalo dos KPIs (R5): dias fechados do
              período, por dia em Semana/Mês e por semana em Trimestre/Ano. */}
          {chartData && (
            <ChartFrame
              ready={barsReady}
              label={bars.unit === 'day' ? 'Distância por dia' : 'Distância por semana'}
              hint={cal.label?.title}
              value={fmtNumber(bars.total, 1)}
              unit="km no período"
              valueColor="var(--run)"
              delta={{ text: corridas(cur.count), tone: 'neutral' }}
              axis={{ min: '0 km', max: `${fmtNumber(bars.max, 1)} km` }}
              legend={[{ label: bars.unit === 'day' ? 'Distância diária' : 'Distância semanal', color: 'var(--run)' }]}
              height={176}
              footer={bars.unit === 'week' && bars.counts.some((c) => c < 7)
                ? <p data-testid="semanas-parciais" style={{ margin: 0 }}>As semanas com menos de 7 dias estão só parcialmente dentro do período — o total é a soma das barras.</p>
                : undefined}
            >
              <Bar data={chartData} options={chartOptions} updateMode="period" />
            </ChartFrame>
          )}

          {/* Intensidade: só com corridas com zonas que cheguem (R6). R2 (2026-10-05):
              "0 neste período" não é "0 de sempre" — quem já teve zonas lê a última e
              o botão para o período onde há as 3 que chegam. */}
          {view.zoneRuns >= MIN_RUNS_FOR_ZONES ? (
            <IntensityDonut
              distribution={view.distribution}
              hint={`${view.zoneRuns} de ${cur.count} corridas com zonas ${scope}`}
            />
          ) : (
            <MinDataNote
              module="corrida"
              text={hrGateText({
                what: 'Distribuição de intensidade',
                needs: `corridas com zonas de frequência cardíaca`,
                none: 'Regista corridas com zonas de frequência cardíaca (relógio/app) para veres a Distribuição de intensidade.',
                min: MIN_RUNS_FOR_ZONES,
                have: view.zoneRuns,
                ever: view.zonesEver,
                fb: view.fallbacks?.zones,
                scope,
              })}
              {...fallbackAction(view.fallbacks?.zones, cal)}
            />
          )}

          {view.scatter.length >= MIN_RUNS_FOR_EFFICIENCY ? (
            <ScatterTrendChart data={view.scatter} scope={scope} />
          ) : (
            <MinDataNote
              module="corrida"
              text={hrGateText({
                what: 'Eficiência aeróbica',
                needs: 'corridas com frequência cardíaca média',
                none: 'Regista corridas com frequência cardíaca média para veres a Eficiência Aeróbica.',
                min: MIN_RUNS_FOR_EFFICIENCY,
                have: view.scatter.length,
                ever: view.hrEver,
                fb: view.fallbacks?.efficiency,
                scope,
              })}
              {...fallbackAction(view.fallbacks?.efficiency, cal)}
            />
          )}

          {/* 9. Relógio: cada métrica diz em quantas corridas existe. */}
          {showWatch && (
            <div style={cardStyle} data-testid="relogio">
              <div className="flex items-center justify-between mb-3 gap-2">
                <h2 style={{ ...cardTitle, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Mountain className="w-3.5 h-3.5 text-[var(--text-3)]" aria-hidden="true" /> Desnível, calorias e cadência
                </h2>
                {/* Minúscula como a pista dos outros cartões ("setembro 2026"). */}
                <p data-testid="relogio-periodo" style={cardHint}>
                  {cal.label?.title}
                </p>
              </div>
              {/* 2026-10-04: valor em falta é «—», como no resto da app (era «-»). */}
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  { k: 'elev', v: wm.elevation != null ? fmtNumber(wm.elevation, 0) : '—', l: 'Desnível (m)', n: wm.nElevation },
                  { k: 'cal', v: wm.calories != null ? fmtNumber(wm.calories, 0) : '—', l: 'Calorias', n: wm.nCalories },
                  { k: 'cad', v: wm.avgCadence != null ? fmtNumber(wm.avgCadence, 0) : '—', l: 'Cadência (spm)', n: wm.nCadence },
                ].map((m) => (
                  <div key={m.k}>
                    <p className="text-base font-extrabold text-white leading-none">{m.v}</p>
                    <p className="text-[11px] text-[var(--text-3)] mt-1">{m.l}</p>
                    <p data-testid={`relogio-${m.k}-n`} className="text-[11px] text-[var(--text-4)] mt-0.5">
                      {m.n > 0 ? `${m.n} de ${corridas(wm.total)}` : 'sem dados'}
                    </p>
                  </div>
                ))}
              </div>
              {wm.nCadence > 0 && (
                <p data-testid="relogio-cadencia-nota" className="text-[11px] text-[var(--text-4)] mt-2">
                  {wm.cadenceWeighted
                    ? 'Cadência: média ponderada pelo tempo das corridas com dados.'
                    : 'Cadência: média simples — nenhuma das corridas com cadência tem tempo registado.'}
                </p>
              )}
            </div>
          )}
        </>
      )}

      {independent}

      {today}
    </div>
  );
}
