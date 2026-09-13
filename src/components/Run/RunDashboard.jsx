import React, { useState, useMemo } from 'react';
import Card from '../shared/Card';
import { useAppStore } from '../../store';
import { TrendingUp, Mountain, Activity, Zap, Timer, HeartPulse } from 'lucide-react';
import { Bar } from 'react-chartjs-2';
import { format, subDays, parseISO, eachDayOfInterval } from 'date-fns';
import '../../lib/chartSetup';
import RunIcon from '../shared/RunIcon';
import TimeFilterBar from '../BI/TimeFilterBar';
import KPICard from '../BI/KPICard';
import ACWRChart from '../BI/ACWRChart';
import { useIntroAnimation, barGrowAnimation } from '../../utils/introAnimations';
import IntensityDonut from '../BI/IntensityDonut';
import ScatterTrendChart from '../BI/ScatterTrendChart';
import RacePredictionChart from '../BI/RacePredictionChart';
import ChartFrame from '../BI/ChartFrame';
import EmptyModuleState, { EmptyChartFrame } from '../BI/EmptyModuleState';
import VerdictLine from '../BI/VerdictLine';
import { runVerdict, fmtNumber } from '../../utils/dashboardVerdicts';
import { filterByDateRange, calculateACWR, calculateTrainingDistribution, calculatePaceVsHR, getVDOTTrend, getRacePrediction, calculateACWRHistory, acwrStatusLabel } from '../../utils/biEngine';
import { formatPace } from '../../utils/run';
import { computeBestPace } from '@formulas/bestPace.ts';
import { computeRunWatchMetrics } from '@formulas/runWatchMetrics.ts';

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

// Delega em @formulas/bestPace.ts (T1.5) — única implementação, partilhada
// com a Carol (specs/formulas-checklist.md Fase E). O fallback `r.pace`
// (string "m:ss/km") do original nunca disparava: `runs` não tem essa
// coluna (select('*') confirmado contra o schema real) — não foi portado.
function getBestPaceData(allRuns, targetKm) {
  return computeBestPace(allRuns, targetKm);
}

export default function RunDashboard() {
  const { runs, profile, raceEvents = [], setOpenCreationMode } = useAppStore();
  const [activeRange, setActiveRange] = useState('mes');

  // BI Data processing
  const periodRuns = useMemo(() => 
    filterByDateRange(runs, activeRange), 
  [runs, activeRange]);

  const totalDist = useMemo(() => {
    return periodRuns.reduce((sum, r) => sum + Number(r.distance_km || 0), 0);
  }, [periodRuns]);

  const avgPaceSec = useMemo(() => {
    if (totalDist <= 0) return 0;
    const totalDuration = periodRuns.reduce((sum, r) => {
      if (r.duration_seconds) return sum + Number(r.duration_seconds);
      if (r.pace && r.distance_km) {
        const parts = r.pace.replace('/km', '').split(':').map(Number);
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
          return sum + (parts[0] * 60 + parts[1]) * Number(r.distance_km);
        }
      }
      return sum;
    }, 0);
    return totalDuration / totalDist;
  }, [periodRuns, totalDist]);

  // BI - ACWR
  const acwrData = useMemo(() => calculateACWR(runs), [runs]);
  const acwrWeeklyData = useMemo(() => calculateACWRHistory(runs), [runs]);
  // 'undertrained' (carga baixa) e 'unknown'/sem dados não são "Perigo" —
  // ver auditoria de 23/08 (mostrava "Perigo" a um atleta com zero corridas).
  const acwrStatus = useMemo(
    () => acwrStatusLabel(acwrData?.status, acwrData?.hasEnoughData),
    [acwrData]
  );

  // BI - Distribution. Sem o nível de experiência, caía sempre no default
  // 'medio' (alvo 80/20) — um iniciante (alvo 95%) via "não conforme" no
  // donut mesmo dentro da meta da sua doutrina (ver
  // specs/formulas-checklist.md P0-8).
  const distribution = useMemo(
    () => calculateTrainingDistribution(periodRuns, profile?.experience_level || 'iniciante'),
    [periodRuns, profile?.experience_level]
  );

  // BI - Scatter
  const scatterData = useMemo(() => calculatePaceVsHR(periodRuns), [periodRuns]);

  // Evolução do VDOT — sobre TODAS as corridas, não só as do período: a
  // tendência de forma só faz sentido com histórico longo, e é ela que dá
  // contexto à previsão de prova.
  const vdotTrend = useMemo(() => getVDOTTrend(runs), [runs]);

  // Future Races
  const futureRaces = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return raceEvents.filter(r => r.date >= today).sort((a,b) => a.date.localeCompare(b.date));
  }, [raceEvents]);

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
  /* Ponto 9, animação 4: as barras crescem da base com --stagger-bars. */
  const introBars = useIntroAnimation('bi-bars');
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    animation: barGrowAnimation(introBars),
    scales: {
      y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { display: false }, border: { display: false } },
      x: { grid: { display: false }, ticks: { display: false }, border: { display: false } }
    }
  };

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
  const verdict = useMemo(() => runVerdict({
    acwr: acwrData,
    weeklyVolume: acwrWeeklyData,
    vdotTrend,
    distribution,
    runCount: periodRuns.length,
  }), [acwrData, acwrWeeklyData, vdotTrend, distribution, periodRuns.length]);

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
          prediction={
            futureRaces.length > 0
              ? {
                  // getRacePrediction resolve nível (prioriza o desta prova)
                  // e distância equivalente ITRA — ponto único, mesmo usado
                  // no "Previsão (VDOT)" do RaceHubView, para os dois lerem
                  // sempre o mesmo número.
                  ...getRacePrediction(futureRaces[0], profile, runs),
                  raceName: futureRaces[0].name || `${futureRaces[0].distance_km}km`
                }
              : null
          }
        />
      )}

      {/* 7. Daily Distance Bar Chart — o caso "sem corridas no período" já
          saiu antes (EmptyModuleState), por isso aqui há sempre dados. */}
      {chartData && (
        <ChartFrame
          label="Distância por dia"
          value={fmtNumber(totalDist, 1)}
          unit="km no período"
          valueColor="var(--run)"
          delta={{ text: `${periodRuns.length} ${periodRuns.length === 1 ? 'corrida' : 'corridas'}`, tone: 'neutral' }}
          axis={{ min: '0 km', max: `${fmtNumber(Math.max(...chartData.datasets[0].data, 0), 1)} km` }}
          legend={[{ label: 'Distância diária', color: 'var(--run)' }]}
          height={176}
        >
          <Bar data={chartData} options={chartOptions} />
        </ChartFrame>
      )}

      {/* 8. Recordes: Melhor pace de sempre */}
      <div className="bg-[var(--surface-glass)] backdrop-blur-[20px] border border-white/60 rounded-2xl p-4 shadow-[0_16px_40px_rgba(0,0,0,0.3),inset_0_2px_10px_rgba(255,255,255,0.6)]">
        <h2 className="text-[11px] font-semibold text-[var(--text-2)] mb-2 uppercase tracking-wider">Melhor pace de sempre</h2>
        <div className="space-y-1">
          {renderBucket('5 km+', b5)}
          {renderBucket('10 km+', b10)}
          {renderBucket('21 km+', b21)}
        </div>
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
