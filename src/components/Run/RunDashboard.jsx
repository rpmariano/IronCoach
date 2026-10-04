import React, { useState, useMemo } from 'react';
import Card from '../shared/Card';
import { useAppStore, sliceReady } from '../../store';
import { useShallow } from 'zustand/react/shallow';
import { TrendingUp, Mountain, Activity, Zap, Timer, HeartPulse } from 'lucide-react';
import { Bar } from 'react-chartjs-2';
import { format, subDays, parseISO, eachDayOfInterval } from 'date-fns';
import '../../lib/chartSetup';
import RunIcon from '../shared/RunIcon';
import TimeFilterBar from '../BI/TimeFilterBar';
import KPICard from '../BI/KPICard';
import ACWRChart from '../BI/ACWRChart';
import { barGrowAnimation } from '../../utils/introAnimations';
import useReducedMotion from '../../utils/useReducedMotion';
import IntensityDonut from '../BI/IntensityDonut';
import ScatterTrendChart from '../BI/ScatterTrendChart';
import RacePredictionChart from '../BI/RacePredictionChart';
import ChartFrame from '../BI/ChartFrame';
import EmptyModuleState, { EmptyChartFrame } from '../BI/EmptyModuleState';
import VerdictLine from '../BI/VerdictLine';
import { runVerdict, fmtNumber } from '../../utils/dashboardVerdicts';
import { filterByDateRange, calculateACWR, calculateTrainingDistribution, calculatePaceVsHR, getVDOTTrend, getRacePrediction, calculateACWRHistory, acwrStatusLabel, acwrMissingWeeks } from '../../utils/biEngine';
import { formatPace } from '../../utils/run';
import { computeBestPace } from '@formulas/bestPace.ts';
import { focusRace } from '@formulas/mainRace.ts';
import { computeRunWatchMetrics } from '@formulas/runWatchMetrics.ts';
import { calculateRaceTrainingPlan } from '../../utils/racePlanEngine';
import { todayISO } from '../../lib/utils';

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
  if (!dateStr) return '';
  const d = parseISO(dateStr);
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

// R9 (2026-10-04): os escalões não são "pelo menos X km" (o "+" do rótulo
// antigo) mas intervalos fechados — um treino de 4,0 km conta como "5 km" e
// uma corrida de 7 ou de 15 km não conta em nenhum. Os valores espelham
// DISTANCE_RANGES de bestPace.ts (4–6,5 / 8,5–12 / 19–23 km); o teste do
// dashboard prova as fronteiras contra computeBestPace, para os dois não
// divergirem em silêncio.
const BEST_PACE_LEGEND = '≈5 km: corridas e splits de 4 a 6,5 km · ≈10 km: de 8,5 a 12 km · ≈21 km: de 19 a 23 km.';

// Delega em @formulas/bestPace.ts (T1.5) — única implementação, partilhada
// com a Carol (specs/formulas-checklist.md Fase E). O fallback `r.pace`
// (string "m:ss/km") do original nunca disparava: `runs` não tem essa
// coluna (select('*') confirmado contra o schema real) — não foi portado.
function getBestPaceData(allRuns, targetKm) {
  return computeBestPace(allRuns, targetKm);
}

export default function RunDashboard() {
  /* Seletor com useShallow em vez de `useAppStore()` inteiro (2026-10-04): sem
     seletor, qualquer alteração ao store — um deslize entre separadores
     mexe em `lastDashboardTab` — redesenhava este separador (e recalculava os
     seus gráficos) mesmo escondido, que era o jank do deslize. Com o shallow só
     redesenha quando um destes campos muda de referência. */
  const { runs, profile, raceEvents = [], setOpenCreationMode, coachPlans, coachPlanItems } = useAppStore(useShallow((s) => ({
    runs: s.runs, profile: s.profile, raceEvents: s.raceEvents, setOpenCreationMode: s.setOpenCreationMode,
    coachPlans: s.coachPlans, coachPlanItems: s.coachPlanItems,
  })));
  const [activeRange, setActiveRange] = useState('mes');

  // BI Data processing
  const periodRuns = useMemo(() => 
    filterByDateRange(runs, activeRange), 
  [runs, activeRange]);

  const totalDist = useMemo(() => {
    return periodRuns.reduce((sum, r) => sum + Number(r.distance_km || 0), 0);
  }, [periodRuns]);

  // R4 (2026-10-04): o ritmo médio só conta corridas com distância E tempo.
  // Antes somava os segundos das que tinham duração mas dividia pelos km de
  // TODAS — 10 km a 5:00 mais 10 km sem tempo davam 2:30/km — e, no sentido
  // inverso, uma corrida com tempo e sem distância tornava-o mais lento. O
  // fallback `r.pace` ("m:ss/km") não existia na BD (a tabela runs não tem
  // essa coluna) e saiu. Quando nem todas contam, o ecrã diz "N de M".
  // O mesmo critério filtra as corridas que servem para prever a prova (R2).
  const runsComTempo = useMemo(
    () => (runs || []).filter((r) => Number(r?.distance_km) > 0 && Number(r?.duration_seconds) > 0),
    [runs]
  );
  const paceStats = useMemo(() => {
    const comTempo = periodRuns.filter((r) => Number(r?.distance_km) > 0 && Number(r?.duration_seconds) > 0);
    const km = comTempo.reduce((sum, r) => sum + Number(r.distance_km), 0);
    const seconds = comTempo.reduce((sum, r) => sum + Number(r.duration_seconds), 0);
    return {
      avgPaceSec: km > 0 ? seconds / km : 0,
      withTime: comTempo.length,
      total: periodRuns.length,
    };
  }, [periodRuns]);
  const avgPaceSec = paceStats.avgPaceSec;

  // BI - ACWR
  const acwrData = useMemo(() => calculateACWR(runs), [runs]);
  const acwrWeeklyData = useMemo(() => calculateACWRHistory(runs), [runs]);
  // 'undertrained' (carga baixa) e 'unknown'/sem dados não são "Perigo" —
  // ver auditoria de 23/08 (mostrava "Perigo" a um atleta com zero corridas).
  // Sem histórico, quanto falta em vez de "Sem dados" (auditoria de
  // onboarding, 2026-09-27).
  const acwrStatus = useMemo(() => {
    const st = acwrStatusLabel(acwrData?.status, acwrData?.hasEnoughData);
    const missing = acwrMissingWeeks(acwrData);
    return missing ? { ...st, label: `Faltam ${missing} sem.` } : st;
  }, [acwrData]);

  // BI - Distribution. Sem nível declarado a omissão é 'medio' (alvo 80/20),
  // a mesma da Carol (coach-chat: `experienceLevel || "medio"`) e dos
  // insights do biEngine (detectCoachInsights) — ver o comentário de
  // calculateTrainingDistribution em utils/biEngine.js: são três sítios e
  // mudam juntos. R8 (2026-10-04): aqui estava 'iniciante' (alvo 95%), e o
  // donut e o veredicto diziam "forte demais, máximo 5% em Z3+" a quem a
  // Carol dava como conforme, ao lado do seu próprio texto "cerca de 80%".
  const distribution = useMemo(
    () => calculateTrainingDistribution(periodRuns, profile?.experience_level || 'medio'),
    [periodRuns, profile?.experience_level]
  );

  // BI - Scatter
  const scatterData = useMemo(() => calculatePaceVsHR(periodRuns), [periodRuns]);

  // Evolução do VDOT — sobre TODAS as corridas, não só as do período: a
  // tendência de forma só faz sentido com histórico longo, e é ela que dá
  // contexto à previsão de prova.
  const vdotTrend = useMemo(() => getVDOTTrend(runs), [runs]);

  // Prova-objetivo — a mesma escolha do hub (focusRace de @formulas/mainRace:
  // a próxima principal por correr, ou a próxima por data se não houver
  // nenhuma). Antes era "a mais próxima por data", e uma prova de treino à
  // frente da principal tomava o lugar do objetivo (R2, 2026-10-04).
  const today = todayISO();
  const focus = useMemo(() => focusRace(raceEvents, today), [raceEvents, today]);

  // Previsão — mesmo pipeline do RaceHubView: getRacePrediction sobre as
  // corridas com distância E tempo (runsComTempo). Sem previsão utilizável
  // (predictedSeconds 0) não se mostra número nenhum: um "00:00" não é uma
  // previsão, é um buraco nos dados. O gráfico cai no "Evolução do VDOT".
  // getRacePrediction resolve nível (prioriza o desta prova) e distância
  // equivalente ITRA — ponto único, o mesmo do "Previsão (VDOT)" do hub.
  const racePrediction = useMemo(() => {
    if (!focus) return null;
    const p = getRacePrediction(focus, profile, runsComTempo);
    if (!(p.predictedSeconds > 0)) return null;
    return { ...p, raceName: focus.name || `${focus.distance_km}km` };
  }, [focus, profile, runsComTempo]);

  // Best pace records across ALL runs
  const b5 = useMemo(() => getBestPaceData(runs, 5), [runs]);
  const b10 = useMemo(() => getBestPaceData(runs, 10), [runs]);
  const b21 = useMemo(() => getBestPaceData(runs, 21), [runs]);

  // Daily Distance Bar Chart Data
  const chartData = useMemo(() => {
    if (periodRuns.length === 0) return null;
    
    // Calcula startObj e endObj com base nos dados reais ou no activeRange
    const now = new Date();
    let startObj = now;
    switch (activeRange) {
      case 'semana': startObj = subDays(now, 7); break;
      case 'mes': startObj = subDays(now, 30); break;
      case 'trimestre': startObj = subDays(now, 90); break;
      case '6meses': startObj = subDays(now, 180); break;
      case 'ano': startObj = subDays(now, 365); break;
    }
    const endObj = now;
    
    if (startObj > endObj) return null;
    
    const days = eachDayOfInterval({ start: startObj, end: endObj });

    const labels = days.map(d => format(d, 'dd/MM'));
    const data = days.map(d => {
      const dayStr = format(d, 'yyyy-MM-dd');
      const dayRuns = periodRuns.filter(r => r.date === dayStr);
      return dayRuns.reduce((sum, r) => sum + Number(r.distance_km || 0), 0);
    });

    return {
      labels,
      datasets: [
        {
          label: 'Distância (km)',
          data,
          // Ponto 6, paleta das séries: era azul genérico (59,130,246).
          // Passa ao ciano da corrida (--run #2ee0ff), em tinta.
          backgroundColor: (context) => {
            const chart = context.chart;
            const { ctx, chartArea } = chart;
            if (!chartArea) return 'rgba(46, 224, 255, 0.6)';

            const gradient = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
            gradient.addColorStop(0, 'rgba(46, 224, 255, 0.25)');
            gradient.addColorStop(1, 'rgba(46, 224, 255, 0.9)');
            return gradient;
          },
          borderRadius: 6,
          borderSkipped: false,
        }
      ]
    };
    // startObj/endObj são derivados de activeRange aqui dentro — as antigas
    // startDate/endDate deixaram de existir na reescrita e ficaram nas
    // dependências, o que rebentava o componente ao montar (ReferenceError).
  }, [periodRuns, activeRange]);

  // Ponto 6: os ticks deixam de escrever dentro da tela. O total do período
  // é o número grande do ChartFrame e os extremos do eixo vão para os
  // cantos, em HTML.
  /* Ponto 9, animação 4: as barras crescem da base com --stagger-bars,
     quando o gráfico aparece no ecrã — a revelação é do ChartFrame
     (2026-10-04); aqui só opções estáveis e reduced-aware. */
  const reduced = useReducedMotion();
  const barsReady = useAppStore((s) => sliceReady(s, ['runs']));
  const barCount = chartData?.labels?.length;
  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    animation: barGrowAnimation({ reduced, count: barCount }),
    scales: {
      y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { display: false }, border: { display: false } },
      x: { grid: { display: false }, ticks: { display: false }, border: { display: false } }
    }
  }), [reduced, barCount]);

  // Watch metrics — delega em @formulas/runWatchMetrics.ts (T1.5). BUG DE
  // PARIDADE corrigido ao migrar (2026-08-25, Fase E): lia
  // r.elevation_gain_m/r.calories_kcal/r.avg_cadence_spm como colunas de
  // TOPO de `runs`, mas esses valores vivem em `details` (e a chave certa é
  // `cadence_spm`, não `avg_cadence_spm` — essa nunca existiu). Este cartão
  // mostrava sempre 0 km de desnível, 0 kcal e cadência "—", mesmo com dados
  // gravados — ver comentário em runWatchMetrics.ts.
  const watchMetrics = useMemo(() => computeRunWatchMetrics(periodRuns), [periodRuns]);

  /* Ponto 6 do redesenho: a frase de veredicto. O dashboard tem de dizer se
     está bem ou mal antes de mostrar um único número (auditoria, achado 6).
     As regras vivem em utils/dashboardVerdicts.js — aqui só se juntam os
     dados que o biEngine já calculou acima. */
  /* O que o plano previa (revisão de 2026-09-26): no polimento, ou numa
     semana em que o próprio plano desce, a carga a baixar não é falta de
     treino. A fase é a mesma do trilho do Início (calculateRaceTrainingPlan). */
  const taper = useMemo(() => {
    const next = [...(raceEvents || [])]
      .filter((r) => typeof r?.date === 'string' && r.date.slice(0, 10) >= today)
      .sort((a, b) => a.date.localeCompare(b.date))[0];
    if (!next) return false;
    try {
      return calculateRaceTrainingPlan({ race: next, profile: profile || {}, runs: runs || [], todayISO: today })?.currentPhase?.id === 'taper';
    } catch (e) {
      return false;
    }
  }, [raceEvents, profile, runs, today]);
  const planItems = useMemo(() => {
    const aceites = new Set((coachPlans || []).filter((p) => p?.status === 'aceite').map((p) => p.id));
    return (coachPlanItems || []).filter((i) => i && aceites.has(i.plan_id));
  }, [coachPlans, coachPlanItems]);

  const verdict = useMemo(() => runVerdict({
    acwr: acwrData,
    weeklyVolume: acwrWeeklyData,
    vdotTrend,
    distribution,
    runCount: periodRuns.length,
    today,
    taper,
    planItems,
  }), [acwrData, acwrWeeklyData, vdotTrend, distribution, periodRuns.length, today, taper, planItems]);

  const renderBucket = (label, b) => {
    if (!b) {
      return (
        <div className="flex items-center justify-between gap-3 py-1.5 border-b border-[var(--border-glass)] last:border-0">
          <p className="text-xs text-[var(--text-3)] font-medium">{label}</p>
          <p className="text-xs text-[var(--text-3)]">Sem dados</p>
        </div>
      );
    }
    return (
      <div className="flex items-center justify-between gap-3 py-1.5 border-b border-[var(--border-glass)] last:border-0">
        <div>
          <p className="text-xs text-[var(--text-3)] font-medium">{label}</p>
          <p className="text-[11px] text-[var(--text-3)] mt-0.5 flex items-center gap-1.5">
            {formatDatePT(b.date)}
            {b.source === 'run' && b.runCount > 0 && (
              <> · de {b.runCount} corrida{b.runCount > 1 ? 's' : ''} nesta distância</>
            )}
            {b.source === 'split' && (
              <span
                className="px-1 py-0.5 rounded text-[11px] font-bold uppercase tracking-wide"
                style={{ background: 'var(--tint-run-bg)', color: 'var(--run)' }}
              >split</span>
            )}
          </p>
        </div>
        <p className="text-base font-extrabold text-white">{paceLabel(b.pace)}</p>
      </div>
    );
  };

  /* Ponto 7 do redesenho: sem corridas no período, o dashboard não mostra
     gráficos a zero (uma barra a zero lê-se como "correste zero", não como
     "não sei") nem os cartões partidos que o ponto 6 assinalou — mostra o
     cartão de convite do mock "Dashboard · sem dados" e a moldura do
     gráfico vazia. O veredicto e o filtro de período ficam: é pelo filtro
     que se chega a um período com dados. */
  const isEmpty = periodRuns.length === 0;

  if (isEmpty) {
    return (
      <div className="space-y-4 fade-in">
        <VerdictLine text={verdict.text} tone={verdict.tone} />
        <TimeFilterBar activeRange={activeRange} onChange={setActiveRange} module="corrida" />
        <EmptyModuleState
          tone="run"
          icon={<RunIcon className="w-[22px] h-[22px]" />}
          actionLabel="Registar corrida"
          onAction={() => setOpenCreationMode('run')}
        >
          Ainda não há corridas neste período. Regista uma corrida para veres a tua evolução aqui.
        </EmptyModuleState>
        <EmptyChartFrame label="Distância por dia" unit="km no período" />
      </div>
    );
  }

  return (
    <div className="space-y-4 fade-in">
      {/* 0. Veredicto — antes dos filtros e dos KPIs, como no mock. */}
      <VerdictLine text={verdict.text} tone={verdict.tone} />

      {/* 1. TimeFilterBar */}
      <TimeFilterBar
        activeRange={activeRange}
        onChange={setActiveRange}
        module="corrida"
      />

      {/* 2. KPICard row (2x2 grid) */}
      <div className="grid grid-cols-2 gap-3">
        <KPICard 
          label="Total Corridas" 
          value={periodRuns.length} 
          icon={Activity}
          moduleColor="var(--mod-corrida)"
        />
        <KPICard 
          label="Distância Total" 
          value={`${totalDist.toFixed(1)}`} 
          unit="km"
          icon={TrendingUp}
          moduleColor="var(--mod-corrida)"
        />
        <KPICard 
          label="Pace Médio" 
          value={paceLabel(avgPaceSec)}
          icon={Timer}
          moduleColor="var(--mod-corrida)"
        />
        <KPICard
          label="ACWR Status"
          value={acwrStatus.label}
          icon={Zap}
          moduleColor="var(--mod-corrida)"
          status={acwrStatus.tone}
        />
      </div>
      {/* R4: o denominador do ritmo médio, só quando nem todas contam. */}
      {paceStats.withTime < paceStats.total && (
        <p data-testid="pace-denominador" className="text-[11px] text-[var(--text-3)] -mt-1">
          {paceStats.withTime === 0
            ? (paceStats.total === 1
                ? 'Pace médio: a corrida não tem distância e tempo registados.'
                : `Pace médio: nenhuma das ${paceStats.total} corridas tem distância e tempo registados.`)
            : `Pace médio: ${paceStats.withTime} de ${paceStats.total} corridas com distância e tempo.`}
        </p>
      )}

      {/* 3-6. Gráficos BI.
          Cada componente já traz o seu próprio cartão, título e alturas, por
          isso é montado direto, sem wrapper. Estavam embrulhados num .card
          com <h3> e altura fixa: dava título a dobrar, e o h-44 de fora
          (176px) era menor que o h-64 de dentro (256px + padding + título),
          o que fazia o conteúdo transbordar e sobrepor-se ao cartão
          seguinte. Também não levam className="card" — a classe repete o
          fundo/borda/sombra que o componente já aplica. */}
      <ACWRChart weeklyData={acwrWeeklyData} />

      {/* Ambos dependem de dados que as corridas manuais não trazem (zonas de
          FC, FC média) — sem guarda, o donut fica só com o anel vazio e o
          "0%" a solo, e o scatter fica sem nenhum ponto, os dois sem
          explicação. Mesmo tratamento de vazio que o resto do BI (ver
          CrossAnalyticsDashboard). */}
      {(distribution.lowIntensityPct > 0 || distribution.highIntensityPct > 0) ? (
        <IntensityDonut distribution={distribution} />
      ) : (
        <div className="bg-[var(--surface-glass)] backdrop-blur-[20px] border border-white/60 rounded-2xl p-6 text-center shadow-[0_16px_40px_rgba(0,0,0,0.3),inset_0_2px_10px_rgba(255,255,255,0.6)]">
          <Activity className="w-8 h-8 text-[var(--text-3)] mx-auto mb-2" />
          <p className="text-xs font-medium text-[var(--text-3)]">Regista corridas com zonas de frequência cardíaca (relógio/app) para veres a Distribuição de Intensidade.</p>
        </div>
      )}

      {scatterData.length > 0 ? (
        <ScatterTrendChart data={scatterData} />
      ) : (
        <div className="bg-[var(--surface-glass)] backdrop-blur-[20px] border border-white/60 rounded-2xl p-6 text-center shadow-[0_16px_40px_rgba(0,0,0,0.3),inset_0_2px_10px_rgba(255,255,255,0.6)]">
          <HeartPulse className="w-8 h-8 text-[var(--text-3)] mx-auto mb-2" />
          <p className="text-xs font-medium text-[var(--text-3)]">Regista corridas com frequência cardíaca média para veres a Eficiência Aeróbica.</p>
        </div>
      )}

      {vdotTrend.length > 0 && (
        <RacePredictionChart
          vdotTrend={vdotTrend}
          prediction={racePrediction}
        />
      )}

      {/* 7. Daily Distance Bar Chart — o caso "sem corridas no período" já
          saiu antes (EmptyModuleState), por isso aqui há sempre dados. */}
      {chartData && (
        <ChartFrame
          ready={barsReady}
          label="Distância por dia"
          value={fmtNumber(totalDist, 1)}
          unit="km no período"
          valueColor="var(--run)"
          delta={{ text: `${periodRuns.length} ${periodRuns.length === 1 ? 'corrida' : 'corridas'}`, tone: 'neutral' }}
          axis={{ min: '0 km', max: `${fmtNumber(Math.max(...chartData.datasets[0].data, 0), 1)} km` }}
          legend={[{ label: 'Distância diária', color: 'var(--run)' }]}
          height={176}
        >
          <Bar data={chartData} options={chartOptions} updateMode="period" />
        </ChartFrame>
      )}

      {/* 8. Recordes: Melhor pace de sempre */}
      <div className="bg-[var(--surface-glass)] backdrop-blur-[20px] border border-white/60 rounded-2xl p-4 shadow-[0_16px_40px_rgba(0,0,0,0.3),inset_0_2px_10px_rgba(255,255,255,0.6)]">
        <h2 className="text-[11px] font-semibold text-[var(--text-2)] mb-2 uppercase tracking-wider">Melhor pace de sempre</h2>
        <div className="space-y-1">
          {renderBucket('≈5 km', b5)}
          {renderBucket('≈10 km', b10)}
          {renderBucket('≈21 km', b21)}
        </div>
        {/* R9: o intervalo real de cada escalão (bestPace.ts, DISTANCE_RANGES). */}
        <p data-testid="recordes-intervalos" className="text-[11px] text-[var(--text-3)] mt-2">{BEST_PACE_LEGEND}</p>
      </div>

      {/* 9. Watch Metrics Card (if any data) */}
      {(watchMetrics.totalElevation > 0 || watchMetrics.totalCalories > 0 || watchMetrics.avgCadence !== null) && (
        <div className="bg-[var(--surface-glass)] backdrop-blur-[20px] border border-white/60 rounded-2xl p-4 shadow-[0_16px_40px_rgba(0,0,0,0.3),inset_0_2px_10px_rgba(255,255,255,0.6)]">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[11px] font-semibold text-[var(--text-2)] flex items-center gap-1.5 uppercase tracking-wider">
              <Mountain className="w-3.5 h-3.5 text-[var(--text-3)]" /> Desnível, calorias e cadência
            </h2>
            <p className="text-[11px] text-[var(--text-3)] capitalize">
              {activeRange.replace('mes', 'mês').replace('6meses', '6 Meses')}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-base font-extrabold text-white leading-none">
                {watchMetrics.totalElevation > 0 ? Math.round(watchMetrics.totalElevation) : '-'}
              </p>
              <p className="text-[11px] text-[var(--text-3)] mt-1">Desnível (m)</p>
            </div>
            <div>
              <p className="text-base font-extrabold text-white leading-none">
                {watchMetrics.totalCalories > 0 ? Math.round(watchMetrics.totalCalories) : '-'}
              </p>
              <p className="text-[11px] text-[var(--text-3)] mt-1">Calorias</p>
            </div>
            <div>
              <p className="text-base font-extrabold text-white leading-none">
                {watchMetrics.avgCadence !== null ? watchMetrics.avgCadence : '-'}
              </p>
              <p className="text-[11px] text-[var(--text-3)] mt-1">Cadência (spm)</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
