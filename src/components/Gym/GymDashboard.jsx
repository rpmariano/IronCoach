import React, { useMemo } from 'react';
import { useAppStore, sliceReady } from '../../store';
import { useShallow } from 'zustand/react/shallow';
import { Dumbbell } from 'lucide-react';
import { Bar } from 'react-chartjs-2';
import '../../lib/chartSetup';
import { GINASIO } from '../BI/TimeFilterBar';
import VolumeLoadChart from '../BI/VolumeLoadChart';
import ChartFrame from '../BI/ChartFrame';
import { barGrowAnimation } from '../../utils/introAnimations';
import useReducedMotion from '../../utils/useReducedMotion';
import EmptyModuleState, { EmptyChartFrame } from '../BI/EmptyModuleState';
import {
  PeriodHeader, PeriodNav, PeriodSummary, EarlyPeriodState, TodayExcludedNote, DeltaVsPrevious, MinDataNote,
  VerdictLine, countOf, earlyVerdict, firstPeriodNote,
} from '../BI/period';
import { fmtNumber, fmtDatePt, NO_DATA } from '../../utils/verdicts/shared';
import { gymFrequencyStatus, GYM_TARGET_PER_WEEK } from '../../utils/verdicts/gym';
import { useCalendarPeriod } from '../../utils/useCalendarPeriod';
import { useOpenInClosedPeriod } from '../../store/periodStore';
import { fallbackAction } from '../BI/period/periodText';
import { useEvolutionView } from '../../store/evolution/useEvolutionView';
import { GYM_MIN_CLOSED, fmtRange, dayLabel } from '../../store/evolution/views/gym';
import ExerciseProgression, { progressionEmptyText } from './ExerciseProgression';
import GymClassesCard from './GymClassesCard';
import { perWeekNum, diasFechados, semanasFechadas, treinosForca, aulasN, cap } from './gymText';

/* Ginásio por períodos de calendário (2026-10-04, fase 5 da Evolução — erros
   G2, G3, G4, G6, G7 e D5). A forma é a do mock-up aprovado da Nutrição: o
   seletor (Semana · Mês · Trimestre) e o navegador ‹ › dentro do resumo, só
   dias FECHADOS (hoje não entra), "X de N", ▲/▼ só contra o período anterior
   equivalente e fechado, e um estado "a começar"/"cedo" em vez de números sem
   base. Os números vêm da vista pré-calculada (store/evolution/views/gym.js);
   aqui só se apresenta.

   Saiu (D5): o KPI "Vol. Carga", o gráfico "Volume diário" e o ACWR do
   ginásio — somavam kg de exercícios diferentes ou davam "Perigo" com 2
   sessões. Entrou a progressão por exercício. */

const cardStyle = 'bg-[var(--surface-glass)] backdrop-blur-[20px] border border-white/60 rounded-2xl p-4 shadow-[0_16px_40px_rgba(0,0,0,0.3),inset_0_2px_10px_rgba(255,255,255,0.6)]';

function DeltaLine({ label, children }) {
  return (
    <p style={{ margin: 0, display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
      <span style={{ color: 'var(--text-4)' }}>{label}</span>
      {children}
    </p>
  );
}

export default function GymDashboard() {
  /* Seletor com useShallow em vez de `useAppStore()` inteiro (2026-10-04): sem
     seletor, qualquer alteração ao store — um deslize entre separadores
     mexe em `lastDashboardTab` — redesenhava este separador mesmo escondido,
     que era o jank do deslize. Os dados de que a vista depende vêm do
     useEvolutionView (só redesenha quando uma dessas listas muda). */
  const { setOpenCreationMode } = useAppStore(useShallow((s) => ({ setOpenCreationMode: s.setOpenCreationMode })));
  const view = useEvolutionView('ginasio');

  // UM só cal, partilhado pelo seletor, pelo navegador e pelo resumo (forma do
  // mock-up). Sem `daysWithData` de propósito: "9 de 30 dias com registo"
  // leria-se como falhas, e para quem treina os dias de descanso não são
  // buracos — o rótulo diz só "desde …" e os dias fechados.
  const cal = useCalendarPeriod('ginasio', { dataStartISO: view?.dataStartISO, minClosed: GYM_MIN_CLOSED });
  const reduced = useReducedMotion();
  const ready = useAppStore((s) => sliceReady(s, ['gym']));
  /* 2026-10-05: se o mês por omissão ainda não tem nenhum dia fechado, abre no
     anterior (a seta › leva ao mês a começar). Só decide quando os treinos JÁ
     chegaram (ready): a vista existe sempre, mesmo com a fatia por carregar, e um
     null do 1.º render ficava gravado como "nunca registou" (revisão). */
  useOpenInClosedPeriod('ginasio', view && ready ? (view.dataStartISO ?? null) : undefined);

  /* Séries por músculo, em séries/semana (G1 + semanas fechadas). Ponto 9,
     animação 4: as barras crescem da base quando o gráfico aparece no ecrã — a
     revelação é da ChartFrame; aqui só opções estáveis e reduced-aware. */
  const muscle = view?.muscle;
  const muscleCount = muscle?.groups?.length || 0;
  const muscleData = useMemo(() => ({
    labels: (muscle?.groups || []).map((g) => g.name),
    datasets: [{
      label: 'Séries por semana',
      data: (muscle?.groups || []).map((g) => Math.round(g.perWeek * 10) / 10),
      // Ardósia do ginásio (--gym #9ec3d2), em tinta; o âmbar é da prova.
      backgroundColor: (context) => {
        const { ctx, chartArea } = context.chart;
        if (!chartArea) return 'rgba(158, 195, 210, 0.7)';
        const gradient = ctx.createLinearGradient(chartArea.left, 0, chartArea.right, 0);
        gradient.addColorStop(0, 'rgba(158, 195, 210, 0.25)');
        gradient.addColorStop(1, 'rgba(158, 195, 210, 0.9)');
        return gradient;
      },
      borderRadius: 6,
    }],
  }), [muscle]);
  const muscleOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: (ctx) => ` ${fmtNumber(ctx.raw, 1)} séries/semana` } },
    },
    animation: barGrowAnimation({ reduced, count: muscleCount }),
    indexAxis: 'y',
    scales: {
      x: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { display: false }, border: { display: false } },
      y: { grid: { display: false }, ticks: { display: false }, border: { display: false } },
    },
  }), [reduced, muscleCount]);

  if (!view) return null;

  const { cur, kind, scope } = view;
  const period = cal.period;
  const early = view.earlyState;
  const closedN = view.closedDays;
  const w = view.weeks;
  const isWeek = kind === 'semana';

  /* ── Sem nenhuma sessão registada: o convite, com o seletor à vista. ── */
  if (!view.hasSessions) {
    return (
      <div className="space-y-4 fade-in">
        <PeriodHeader tab="ginasio" options={GINASIO} cal={cal} navigator="none" />
        <VerdictLine text={NO_DATA.text} tone={NO_DATA.tone} />
        <EmptyModuleState
          tone="gym"
          icon={<Dumbbell size={22} />}
          actionLabel="Registar treino"
          onAction={() => setOpenCreationMode('workout')}
        >
          Ainda não há treinos. Regista um treino para veres a tua evolução aqui.
        </EmptyModuleState>
        <EmptyChartFrame label="Volume-carga semanal" unit="kg na última semana fechada" height={192} />
      </div>
    );
  }

  const noDays = closedN === 0;
  const prevName = view.prevName;
  const prevFull = view.prevFull;

  /* ── As linhas do resumo (todas só de dias fechados) ── */
  const missingNoDays = view.beforeData ? 'antes do 1.º registo' : 'ainda sem dias fechados';
  const rows = [];

  if (isWeek) {
    // Em Semana não há semanas para dividir: as sessões contra o alvo de 2.
    const n = cur.strength;
    const reached = n >= GYM_TARGET_PER_WEEK;
    rows.push({
      key: 'forca',
      label: 'Treinos de força',
      value: noDays ? null : String(n),
      missingText: noDays ? missingNoDays : undefined,
      status: noDays ? null : reached ? 'ok' : period.isCurrent ? null : 'below',
      statusText: noDays ? undefined : reached ? `No alvo (${GYM_TARGET_PER_WEEK})` : period.isCurrent ? `Alvo: ${GYM_TARGET_PER_WEEK} por semana` : `Abaixo do alvo (${GYM_TARGET_PER_WEEK})`,
      barPct: noDays ? undefined : Math.min(100, (n / GYM_TARGET_PER_WEEK) * 100),
      count: noDays ? undefined : countOf(cur.strengthDays, closedN),
    });
  } else {
    const perWeek = w.perWeekStrength;
    const enough = w.count >= w.min;
    rows.push({
      key: 'forca',
      label: 'Treinos de força',
      // "N · X/semana (semanas fechadas)": o N é de todos os dias fechados, o
      // X/semana só das semanas inteiras (as que têm numerador e denominador).
      value: noDays ? null : `${cur.strength}${w.count >= 1 ? ` · ${perWeekNum(perWeek)}/semana` : ''}`,
      missingText: noDays ? missingNoDays : undefined,
      status: !noDays && enough ? gymFrequencyStatus(perWeek) : null,
      /* 2026-10-05: o "X/semana" é das sessões dentro das semanas fechadas
      (w.strength) a dividir por essas semanas; se o período tem sessões fora
      delas (dias soltos nas pontas), o numerador diz-se à vista para o N e o
      X/semana não parecerem da mesma conta. */
      /* Sem repetir "treinos de força" (a etiqueta da linha já o diz): o texto
         longo, ao lado do "2 de 5", deixava a calha da barra a 0 px num ecrã
         de 390 px (verificação no browser, 2026-10-05). */
      statusText: noDays ? undefined : w.count >= 1
        ? (w.strength !== cur.strength ? `${w.strength} em ${semanasFechadas(w.count)}` : `em ${semanasFechadas(w.count)}`)
        : 'sem semanas fechadas ainda',
      barPct: !noDays && enough ? Math.min(100, (perWeek / GYM_TARGET_PER_WEEK) * 100) : undefined,
      count: !noDays && w.count >= 1 ? countOf(w.onTarget, w.count) : undefined,
    });
  }
  if (cur.classes > 0) {
    rows.push({
      key: 'aulas',
      label: 'Aulas',
      // As aulas contam-se UMA vez (aqui, com "/semana"); o cartão de baixo só
      // tem o tempo e o esforço.
      value: `${cur.classes}${!isWeek && w.count >= 1 ? ` · ${perWeekNum(w.perWeekClasses)}/semana` : ''}`,
      statusText: !isWeek && w.count >= 1 ? `em ${semanasFechadas(w.count)}` : undefined,
    });
  }

  const averageLabel = noDays ? (view.beforeData ? 'No período' : 'No período (0 dias fechados)') : `No período (${diasFechados(closedN)})`;
  const countLabel = isWeek ? 'Dias com treino' : `Semanas com ${GYM_TARGET_PER_WEEK}+ treinos`;

  /* ── O veredicto: "cedo" substitui só o que fala do período (neutro). ── */
  /* Em "cedo" o veredicto neutro dá lugar à frase de "ainda é cedo". Um veredicto
     factual (Semana com o alvo já cumprido) fica sozinho: o bloco "cedo" por
     baixo contradizia-o (revisão de 2026-10-04) e deixou de existir. */
  const earlyIsVerdict = early === 'cedo' && view.verdict.tone === 'neutral';
  const verdict = earlyIsVerdict ? earlyVerdict(cal, { count: closedN }) : view.verdict;

  /* ── ▲/▼ face ao anterior equivalente e fechado (R5) ── */
  const d = view.delta;
  const showDeltas = early === 'ok' && !!d;
  const notes = [];
  if (early === 'ok' && !d && !view.beforeData) {
    if (view.prevCoverage === 'none') notes.push(firstPeriodNote(kind));
    else if (view.prevCoverage === 'partial') {
      notes.push(`${cap(prevName)} começou antes do teu primeiro registo (${fmtDatePt(view.dataStartISO) || fmtRange(view.dataStartISO, view.dataStartISO, view.today)}) — não dá para comparar.`);
    }
  }
  /* Antes do 1.º registo não há contas a que a nota se aplique. 2026-10-05
     (G2/G7): as semanas são as seg–dom FECHADAS que tocam o período — a que cruza
     a fronteira (28 set – 4 out) conta para os dois meses — e a nota diz quais. */
  if (!isWeek && !view.beforeData) {
    notes.push(`As contas por semana usam as semanas seg–dom já fechadas que tocam o período${w.range ? ` (${w.range})` : ''}.`);
  }

  // R7: o anterior que começou antes do 1.º registo diz-o ("desde 25 ago").
  const prevSince = view.prevLabel?.coverage ? ` (${view.prevLabel.coverage})` : '';
  const prevSummaryText = prevFull
    ? `${prevName}${prevSince}: ${prevFull.total > 0 ? `${treinosForca(prevFull.strength)}${prevFull.classes > 0 ? ` · ${aulasN(prevFull.classes)}` : ''}` : 'sem treinos'}`
    : null;
  /* M2/R10 (2026-10-05): "cedo" e período vazio dizem ONDE há treinos e levam lá:
     o período anterior e, se nem esse tem, o tipo maior ("Ver o trimestre"). */
  const dataFb = view.fallbacks?.data || null;
  const fbSummary = (fb) => {
    if (fb.type === 'prev' && prevSummaryText) return prevSummaryText;
    const parts = [];
    if (fb.strength > 0) parts.push(treinosForca(fb.strength));
    if (fb.classes > 0) parts.push(aulasN(fb.classes));
    return `${cap(fb.where)}: ${parts.join(' · ') || 'sem treinos'}`;
  };
  const emptyPeriod = cur.total === 0;
  const previousLine = early === 'cedo'
    ? (dataFb
      ? { text: fbSummary(dataFb), ...fallbackAction(dataFb, cal) }
      : prevSummaryText ? { text: prevSummaryText, actionLabel: `Ver ${prevName}`, onAction: cal.prev } : undefined)
    : (emptyPeriod && dataFb ? { text: fbSummary(dataFb), ...fallbackAction(dataFb, cal) } : undefined);

  const summaryLine = !isWeek && w.count >= w.min && w.onTargetPct != null && !view.verdict.early
    ? `Duas ou mais sessões de força em ${countOf(w.onTarget, w.count)} semanas (${w.onTargetPct}%)`
    : undefined;

  const deltas = showDeltas ? (
    <div data-testid="gym-deltas" style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>
      {(d.strength.cur + d.strength.prev > 0) && (
        <DeltaLine label="Treinos de força">
          <DeltaVsPrevious current={d.strength.cur} previous={d.strength.prev} previousLabel={d.label} better="none"
            unit={Math.abs(d.strength.cur - d.strength.prev) === 1 ? 'treino' : 'treinos'} />
        </DeltaLine>
      )}
      {(d.classes.cur + d.classes.prev > 0) && (
        <DeltaLine label="Aulas">
          <DeltaVsPrevious current={d.classes.cur} previous={d.classes.prev} previousLabel={d.label} better="none"
            unit={Math.abs(d.classes.cur - d.classes.prev) === 1 ? 'aula' : 'aulas'} />
        </DeltaLine>
      )}
    </div>
  ) : null;

  /* ── "A começar": nenhum dia fechado — resumo vazio e o do período anterior. ── */
  const todayN = view.todaySessions?.total || 0;
  const startedText = todayN > 0
    ? `Os dias contam quando acabarem — hoje já registaste ${view.todaySessions.strength > 0 ? treinosForca(view.todaySessions.strength) : aulasN(view.todaySessions.classes)}.`
    : 'Os dias contam quando acabarem.';
  const prevPeriodSummary = prevFull
    ? `${cap(view.prevLabel.title)} (${view.prevLabel.range}${view.prevLabel.coverage ? `, ${view.prevLabel.coverage}` : ''}): ${prevFull.total > 0 ? `${treinosForca(prevFull.strength)}${prevFull.classes > 0 ? ` · ${aulasN(prevFull.classes)}` : ''}` : 'sem treinos'}`
    : undefined;

  const navigator = <PeriodNav cal={cal} module="ginasio" />;
  const today = <TodayExcludedNote period={period} hasDayView={false} />;

  /* ── "A começar" (segunda-feira, dia 1): sem gráficos nem médias de 0 dias. ── */
  if (early === 'a_comecar') {
    return (
      <div className="space-y-4 fade-in">
        <PeriodHeader tab="ginasio" options={GINASIO} cal={cal} navigator="none" />
        <PeriodSummary
          module="ginasio"
          navigator={navigator}
          rows={rows}
          averageLabel={averageLabel}
          countLabel={countLabel}
        />
        <EarlyPeriodState
          state="a_comecar"
          kind={kind}
          module="ginasio"
          title={view.firstDay ? 'Os teus registos começam hoje' : undefined}
          text={startedText}
          onViewPrevious={cal.prev}
          previousSummary={prevPeriodSummary}
          {...(view.fallbacks?.data?.type === 'kind' ? fallbackAction(view.fallbacks.data, cal) : {})}
        />
        {today}
      </div>
    );
  }

  /* ── Os gráficos e cartões do período ── */
  // Séries por músculo: só com semanas fechadas (séries/semana).
  const groups = muscle.groups;
  const topMuscle = groups[0];
  const muscleFb = view.fallbacks?.muscle || null;
  const multi = muscle.multiGroupSessions;
  const multiNote = multi > 0
    ? `${multi} ${multi === 1 ? 'sessão com vários grupos não entra' : 'sessões com vários grupos não entram'}.`
    : '';

  // A progressão espera por um período em condições e por um anterior fechado.
  const fbProg = view.fallbacks?.progression || null;
  const progressionGate = early !== 'ok'
    // G4 (2026-10-05): a promessa "aparece a partir de 4 dias fechados" era falsa —
    // ao 4.º dia ainda faltam o anterior inteiro e o exercício repetido. Diz-se o que
    // a comparação pede e onde já há.
    ? {
      text: `Progressão por exercício: compara cada exercício com o período anterior — ${scope} ainda só há ${diasFechados(closedN)}.${fbProg ? ` ${cap(fbProg.where)} já tem a sua.` : ''}`,
      ...fallbackAction(fbProg, cal),
    }
    : view.prevCoverage === 'none'
      ? 'Progressão por exercício: ainda não há período anterior para comparar.'
      : view.prevCoverage === 'partial'
        ? `Progressão por exercício: ${prevName} começou antes do teu primeiro registo, não dá para comparar.`
        /* Sem exercício comparável mas com um período que já tem (2026-10-05): a
           frase de sempre e o botão para lá ("Setembro já tem a sua. Ver setembro ›"). */
        : (view.progression?.rows?.length ?? 0) === 0 && fbProg
          ? {
            text: `${progressionEmptyText({ withoutPrevious: view.progression?.withoutPrevious, scope, minSessions: view.progression?.minSessions || 2 })} ${cap(fbProg.where)} já tem a sua.`,
            ...fallbackAction(fbProg, cal),
          }
          : null;

  return (
    <div className="space-y-4 fade-in">
      <PeriodHeader tab="ginasio" options={GINASIO} cal={cal} navigator="none" />

      <PeriodSummary
        module="ginasio"
        navigator={navigator}
        verdict={verdict}
        rows={rows}
        averageLabel={averageLabel}
        countLabel={countLabel}
        summaryLine={summaryLine}
        delta={view.weeksDelta && summaryLine ? view.weeksDelta : undefined}
        previous={previousLine}
        notes={notes}
      >
        {deltas}
      </PeriodSummary>

      {emptyPeriod ? (
        <EmptyModuleState
          tone="gym"
          icon={<Dumbbell size={22} />}
          title={view.beforeData ? 'Antes do teu primeiro registo' : `Sem treinos ${scope}`}
          actionLabel={period.isCurrent ? 'Registar treino' : undefined}
          onAction={period.isCurrent ? () => setOpenCreationMode('workout') : undefined}
        >
          {view.beforeData
            ? `O teu primeiro treino registado é de ${fmtDatePt(view.dataStartISO) || fmtRange(view.dataStartISO, view.dataStartISO, view.today)}.`
            : (view.lastSessionDate ? `O último foi a ${fmtDatePt(view.lastSessionDate)}.` : 'Ainda não registaste treinos antes deste período.')}
        </EmptyModuleState>
      ) : (
        <>
          {/* Volume-carga em semanas de calendário (G3/G4): zeros explícitos, a
              semana em curso fora da média e do delta. */}
          {view.weeklyData.length > 0 && (
            <VolumeLoadChart weeklyData={view.weeklyData} hint="semanas seg–dom" ready={ready} />
          )}

          {/* D5: a progressão por exercício, no lugar do "Vol. Carga" e do "Volume diário". */}
          <ExerciseProgression progression={view.progression} scope={scope} gate={progressionGate} />

          {groups.length > 0 ? (
            <ChartFrame
              ready={ready}
              label="Séries por músculo"
              hint={semanasFechadas(muscle.weeks)}
              value={perWeekNum(topMuscle.perWeek)}
              unit={`séries/semana em ${topMuscle.name}`}
              valueColor="var(--gym)"
              legend={[{ label: 'Séries por semana', color: 'var(--gym)' }]}
              height={192}
              footer={multiNote ? <p data-testid="multi-grupo" style={{ margin: 0 }}>{multiNote}</p> : undefined}
            >
              <Bar data={muscleData} options={muscleOptions} updateMode="period" />
            </ChartFrame>
          ) : (
            <MinDataNote
              module="ginasio"
              text={muscle.weeks === 0 && isWeek
                ? `Séries por músculo: aparece quando a semana acabar (as contas são por semana seg–dom inteira).${muscleFb ? ` ${cap(muscleFb.where)} já tem.` : ''}`
                : muscle.weeks === 0
                // G7 (2026-10-05): conta as semanas fechadas que tocam o período e diz
                // quando fecha a 1.ª; a semana passada (28 set – 4 out) já contava.
                ? `Séries por músculo: ${w.nextCloseISO ? `a 1.ª semana fechada ${scope} acaba a ${dayLabel(w.nextCloseISO)}` : `preciso de pelo menos 1 semana fechada (seg–dom) ${scope}`}.${muscleFb ? ` ${cap(muscleFb.where)} já tem.` : ''}${multiNote ? ` ${multiNote}` : ''}`
                : `Séries por músculo: sem grupos para mostrar em ${semanasFechadas(muscle.weeks)}.${multiNote ? ` ${multiNote}` : ''}`}
              {...fallbackAction(muscleFb, cal)}
            />
          )}

          <GymClassesCard classes={view.classes} />
        </>
      )}

      {today}
    </div>
  );
}
