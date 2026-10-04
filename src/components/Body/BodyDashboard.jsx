import React, { useState, useMemo } from 'react';
import { useAppStore } from '../../store';
import { BODY_METRICS } from '../../utils/body';
import { getBodyIcon } from '../../utils/bodyIcons';
import { User } from 'lucide-react';
import { Line } from 'react-chartjs-2';
import '../../lib/chartSetup';
import TimeFilterBar from '../BI/TimeFilterBar';
import StackedAreaChart from '../BI/StackedAreaChart';
import MetricInfo from '../BI/MetricInfo';
import ChartFrame from '../BI/ChartFrame';
import EmptyModuleState, { EmptyChartFrame } from '../BI/EmptyModuleState';
import VerdictLine from '../BI/VerdictLine';
import { bodyVerdict, fmtNumber } from '../../utils/dashboardVerdicts';
import { filterByDateRange, calculateWeightTrend, calculateCompositionTrend } from '../../utils/biEngine';
import { WEIGHT_TREND_MIN_POINTS, WEIGHT_TREND_MIN_SPAN_DAYS } from '@formulas/weightTrend.ts';

/* C4 (2026-10-04): os números do Corpo saem com vírgula decimal (fmtNumber)
   e o ChartFrame recebe o número SEM unidade — a unidade vai no `unit`.
   Com fmtMetric (toFixed + unidade) o número grande saía "72.4 kg kg", com
   ponto, e sem data-count-to (não é numérico), por isso também não contava. */
function fmtValue(metric, val) {
  if (val === null || val === undefined || !isFinite(Number(val))) return '—';
  return fmtNumber(Number(val), metric.dec);
}
function fmtValueUnit(metric, val) {
  const v = fmtValue(metric, val);
  return v === '—' || !metric.unit ? v : `${v} ${metric.unit}`;
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
/* "12 set" no ano corrente, "12 set 2025" nos outros — a data de uma
   leitura que não é do período (C5) tem de se ler sem ambiguidade. */
function fmtShortDate(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  const base = `${d} ${MESES[m - 1]}`;
  return y === new Date().getFullYear() ? base : `${base} ${y}`;
}

export default function BodyDashboard({ onGoToCalendar }) {
  const { bodyAssessments, gymSessions, profile, setOpenCreationMode } = useAppStore();
  const [timeRange, setTimeRange] = useState('trimestre');
  const [selectedMetricKey, setSelectedMetricKey] = useState('weight_kg');

  const selectedMetric = useMemo(() => {
    return BODY_METRICS.find(m => m.key === selectedMetricKey) || BODY_METRICS[0];
  }, [selectedMetricKey]);

  const filteredAssessments = useMemo(() => {
    return filterByDateRange(bodyAssessments, timeRange, 'date').sort((a, b) => a.date.localeCompare(b.date));
  }, [bodyAssessments, timeRange]);

  const sortedAssessmentsDesc = useMemo(() => {
    return [...bodyAssessments].sort((a, b) => b.date.localeCompare(a.date));
  }, [bodyAssessments]);

  // Metric summaries for top compact cards
  const metricSummaries = useMemo(() => {
    return BODY_METRICS.map(m => {
      const validInPeriod = filteredAssessments.filter(a => a[m.key] !== null && a[m.key] !== undefined);
      const validOverall = sortedAssessmentsDesc.filter(a => a[m.key] !== null && a[m.key] !== undefined);
      const latestOverall = validOverall[0]?.[m.key];

      /* C5 (2026-10-04): sem leitura desta métrica no período, o cartão
         mostrava o último valor de sempre sem data, como se fosse do
         período (e o gráfico, ao tocar, dizia que não havia leituras).
         Passa a levar a data dessa leitura — ou "—" se nunca houve. */
      if (validInPeriod.length === 0) {
        return {
          metric: m,
          value: latestOverall ?? null,
          valueDate: validOverall[0]?.date ?? null,
          hasPeriodData: false,
          deltaText: null,
          deltaType: 'neutral'
        };
      }

      const first = Number(validInPeriod[0][m.key]);
      const latest = Number(validInPeriod[validInPeriod.length - 1][m.key]);
      const diff = latest - first;

      let deltaText = null;
      let deltaType = 'neutral';

      if (validInPeriod.length >= 2 && Math.abs(diff) >= 0.01) {
        const isPositive = diff > 0;
        // fmtNumber já escreve o "−" dos negativos; o "+" é nosso.
        const formattedDiff = (isPositive ? '+' : '') + fmtValueUnit(m, diff);
        deltaText = formattedDiff;

        if (m.good === 'down') {
          deltaType = diff < 0 ? 'good' : 'bad';
        } else if (m.good === 'up') {
          deltaType = diff > 0 ? 'good' : 'bad';
        } else {
          deltaType = 'neutral';
        }
      } else if (validInPeriod.length === 1) {
        deltaText = '1 leitura';
        deltaType = 'neutral';
      } else {
        deltaText = fmtValueUnit(m, 0);
        deltaType = 'neutral';
      }

      return {
        metric: m,
        value: latest,
        hasPeriodData: true,
        deltaText,
        deltaType
      };
    });
  }, [filteredAssessments, sortedAssessmentsDesc]);

  // Points for selected metric chart
  const points = useMemo(() => {
    return filteredAssessments
      .filter(a => a[selectedMetric.key] !== null && a[selectedMetric.key] !== undefined);
  }, [filteredAssessments, selectedMetric]);

  const latestVal = points.length > 0 ? points[points.length - 1][selectedMetric.key] : null;
  const selectedSummary = metricSummaries.find(s => s.metric.key === selectedMetric.key);
  const goalVal = profile ? profile['goal_' + selectedMetric.key] : null;

  const chartData = useMemo(() => {
    return {
      labels: points.length ? points.map(a => a.date.slice(8, 10) + '/' + a.date.slice(5, 7)) : ['—'],
      datasets: [{
        label: `${selectedMetric.label}${selectedMetric.unit ? ' (' + selectedMetric.unit + ')' : ''}`,
        data: points.length ? points.map(a => Number(a[selectedMetric.key])) : [0],
        borderColor: selectedMetric.color,
        backgroundColor: `${selectedMetric.color}25`,
        pointBackgroundColor: selectedMetric.color,
        pointRadius: points.length > 20 ? 0 : 5,
        pointHoverRadius: 7,
        borderWidth: 2.5,
        tension: 0.25,
        fill: true,
      }]
    };
  }, [points, selectedMetric]);

  // Ponto 6: os ticks deixam de escrever dentro da tela — o valor atual é o
  // número grande do ChartFrame e os extremos do eixo vão para os cantos,
  // em HTML.
  const darkScales = {
    y: { beginAtZero: false, grace: '5%', grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { display: false }, border: { display: false } },
    x: { grid: { display: false }, ticks: { display: false }, border: { display: false } }
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: darkScales
  };

  const weightTrendData = useMemo(() => calculateWeightTrend(filteredAssessments), [filteredAssessments]);
  const compositionData = useMemo(() => calculateCompositionTrend(filteredAssessments), [filteredAssessments]);

  /* Ponto 6 do redesenho: a frase de veredicto. As regras vivem em
     utils/dashboardVerdicts.js — aqui só se juntam os dados que o biEngine
     já calculou. */
  const verdict = useMemo(() => bodyVerdict({
    weightTrend: weightTrendData,
    composition: compositionData,
    assessmentCount: filteredAssessments.length,
    gymSessionCount: filterByDateRange(gymSessions, timeRange).length,
  }), [weightTrendData, compositionData, filteredAssessments.length, gymSessions, timeRange]);

  /* Ponto 7 do redesenho. Este `return` antecipado era o caso que o ponto 6
     assinalou: saía ANTES da frase de veredicto e do filtro de período, por
     isso o Corpo era o único módulo sem veredicto nenhum quando não havia
     dados — e o botão que mostrava ("Ir para o Calendário") recebia um
     onGoToCalendar que ninguém passa (Body.jsx monta <BodyDashboard /> sem
     props), ou seja, não fazia nada. Passa a ser o cartão do mock
     "Dashboard · sem dados", já depois do veredicto e do filtro, com o
     convite a registar uma avaliação.
     A condição também passa a ser do PERÍODO (e não "nenhuma avaliação de
     sempre"): com avaliações antigas mas nenhuma no trimestre, o ecrã
     mostrava gráficos vazios sem dizer porquê. */
  if (filteredAssessments.length === 0) {
    return (
      <div className="space-y-4 fade-in pb-16">
        <VerdictLine text={verdict.text} tone={verdict.tone} />
        <TimeFilterBar activeRange={timeRange} onChange={setTimeRange} module="corpo" />
        <EmptyModuleState
          tone="body"
          icon={<User size={22} />}
          actionLabel="Registar avaliação"
          onAction={() => setOpenCreationMode('assessment')}
        >
          Ainda não há avaliações neste período. Regista uma avaliação — podes enviar um print da Renpho Health — para veres a tua evolução aqui.
        </EmptyModuleState>
        <EmptyChartFrame label="Peso" unit="kg" height={192} />
      </div>
    );
  }

  const weightDualChartData = weightTrendData ? {
    labels: weightTrendData.rawPoints.map(p => p.date.slice(8, 10) + '/' + p.date.slice(5, 7)),
    datasets: [
      {
        label: weightTrendData.isEWMASmoothing ? 'EWMA (Tendência)' : 'Evolução (Raw)',
        data: weightTrendData.movingAverage.map(p => p.weight),
        borderColor: '#ff5fa8', // --body
        borderWidth: 3,
        pointRadius: 0,
        tension: 0.4,
        fill: false,
      },
      {
        label: 'Pesagens (Raw)',
        data: weightTrendData.rawPoints.map(p => p.weight),
        borderColor: 'transparent',
        backgroundColor: 'rgba(255, 255, 255, 0.4)',
        pointBackgroundColor: 'rgba(255, 255, 255, 0.4)',
        pointRadius: 4,
        borderWidth: 0,
        tension: 0,
        fill: false,
        showLine: false,
      }
    ]
  } : null;

  return (
    <div className="space-y-4 fade-in pb-16">
      {/* Veredicto — antes dos filtros e dos KPIs, como no mock. */}
      <VerdictLine text={verdict.text} tone={verdict.tone} />

      <TimeFilterBar
        activeRange={timeRange}
        onChange={setTimeRange}
        module="corpo"
      />

      <div className="grid grid-cols-3 gap-2 px-1">
        {metricSummaries.map(({ metric: m, value, valueDate, hasPeriodData, deltaText, deltaType }) => {
          const isSelected = selectedMetricKey === m.key;
          // C5: leitura de fora do período — valor apagado e a data dela.
          const outOfPeriod = !hasPeriodData && value !== null && value !== undefined;
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => setSelectedMetricKey(m.key)}
              className={`p-2.5 min-h-[44px] text-left rounded-xl transition-all relative overflow-hidden backdrop-blur-[20px] shadow-[0_8px_20px_rgba(0,0,0,0.2)] active:scale-95 cursor-pointer border ${
                isSelected 
                  ? 'bg-[var(--surface-glass)] ring-2' 
                  : 'bg-[var(--surface-glass)] border-white/20 hover:bg-[var(--surface-strong)]'
              }`}
              style={isSelected ? { borderColor: m.color, '--tw-ring-color': `${m.color}cc` } : {}}
            >
              <div className="flex items-center justify-between gap-1 mb-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span style={{ color: m.color }}>{getBodyIcon(m.key, 12)}</span>
                  <p className="text-[11px] font-medium text-[var(--text-3)] truncate">{m.label}</p>
                </div>
                {isSelected && (
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: m.color }} />
                )}
              </div>
              <p
                className={`text-sm font-bold tracking-tight leading-tight ${outOfPeriod ? 'text-[var(--text-3)]' : 'text-white'}`}
                data-testid={`body-card-value-${m.key}`}
              >
                {hasPeriodData || outOfPeriod ? fmtValueUnit(m, value) : '—'}
              </p>
              <div className="mt-1 flex items-center justify-between min-h-[14px]">
                {outOfPeriod ? (
                  <span
                    className="text-[11px] text-[var(--text-3)] truncate"
                    data-testid={`body-card-date-${m.key}`}
                    aria-label={`Última leitura a ${fmtShortDate(valueDate)}, fora do período`}
                  >
                    {`a ${fmtShortDate(valueDate)}`}
                  </span>
                ) : deltaText ? (
                  <span className={`text-[11px] font-semibold ${
                    deltaType === 'good' ? 'text-[var(--ok)]' :
                    deltaType === 'bad' ? 'text-[var(--danger)]' : 'text-[var(--text-3)]'
                  }`}>
                    {deltaText}
                  </span>
                ) : (
                  <span className="text-[11px] text-[var(--text-3)]">—</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* 2. Gráfico da Métrica Selecionada (reage aos cards acima) */}
      {(() => {
        const vals = points.map(a => Number(a[selectedMetric.key])).filter(v => isFinite(v));
        const first = vals.length ? vals[0] : null;
        const diff = vals.length >= 2 ? vals[vals.length - 1] - first : null;
        return (
          <ChartFrame
            label={selectedMetric.label}
            hint={goalVal != null ? `objetivo ${fmtValueUnit(selectedMetric, goalVal)}` : `${points.length} leitura${points.length === 1 ? '' : 's'}`}
            value={latestVal !== null ? fmtValue(selectedMetric, latestVal) : '—'}
            unit={selectedMetric.unit || undefined}
            valueColor={selectedMetric.color}
            delta={diff !== null && Math.abs(diff) >= 0.01
              ? {
                  text: `${diff > 0 ? '+' : '−'}${fmtNumber(Math.abs(diff), selectedMetric.dec)}${selectedMetric.unit ? ' ' + selectedMetric.unit : ''} no período`,
                  tone: selectedMetric.good === 'down'
                    ? (diff < 0 ? 'ok' : 'warn')
                    : selectedMetric.good === 'up'
                      ? (diff > 0 ? 'ok' : 'warn')
                      : 'neutral',
                }
              : undefined}
            axis={vals.length > 1
              ? { min: fmtValueUnit(selectedMetric, Math.min(...vals)), max: fmtValueUnit(selectedMetric, Math.max(...vals)) }
              : undefined}
            legend={[{ label: selectedMetric.label, color: selectedMetric.color, shape: 'line' }]}
            height={points.length >= 1 ? 192 : 0}
            footer={points.length >= 1
              ? undefined
              : selectedSummary?.valueDate
                ? `Sem leituras desta métrica no período selecionado. A última é de ${fmtShortDate(selectedSummary.valueDate)} (${fmtValueUnit(selectedMetric, selectedSummary.value)}).`
                : 'Sem leituras desta métrica no período selecionado.'}
          >
            {points.length >= 1 ? <Line data={chartData} options={chartOptions} /> : null}
          </ChartFrame>
        );
      })()}

      {/* 3. Tendência de Peso (EWMA) */}
      {weightTrendData && (() => {
        const ma = weightTrendData.movingAverage || [];
        const lastWeight = ma.length ? Number(ma[ma.length - 1].weight) : null;
        const raw = (weightTrendData.rawPoints || []).map(pt => Number(pt.weight)).filter(v => isFinite(v));
        /* C1/C2 (2026-10-04): o ritmo só existe com pesagens que cheguem
           (weightTrend.ts: ≥3 nos últimos 14 dias, a abranger ≥10). Antes
           saía "+0,6 kg/semana" de 2 pesagens a 3 dias, ou nada com
           pesagens espaçadas; agora, sem dados, diz-se o que falta. */
        const sufficient = weightTrendData.sufficient === true && weightTrendData.weeklyRate != null;
        const rate = sufficient ? Number(weightTrendData.weeklyRate) : null;
        const roundedRate = rate !== null && Math.abs(rate) >= 0.05 ? rate : 0;
        const n = weightTrendData.pointsInWindow ?? 0;
        const span = weightTrendData.spanDays ?? 0;
        const missing = `Preciso de ${WEIGHT_TREND_MIN_POINTS} pesagens em ${WEIGHT_TREND_MIN_SPAN_DAYS} dias para a tendência — `
          + (n <= 1
            ? 'nas duas semanas até à última pesagem só há essa.'
            : `nas duas semanas até à última pesagem há ${n} pesagens em ${span} ${span === 1 ? 'dia' : 'dias'}.`);
        return (
          <ChartFrame
            label={weightTrendData.isEWMASmoothing ? 'Tendência de peso (EWMA)' : 'Evolução de peso'}
            info={<MetricInfo text={
              weightTrendData.isEWMASmoothing
                ? "O teu peso natural flutua todos os dias devido à água, ao sal e ao glicogénio (vê os pontos soltos). A linha contínua usa uma matemática especial (Média Móvel) para ignorar esse 'ruído' e mostrar-te a tua verdadeira tendência a longo prazo. Foca-te apenas na linha."
                : "A evolução direta do teu peso no período selecionado. A tendência (EWMA) será ativada automaticamente quando registares pelo menos 5 pesagens neste período."
            } />}
            hint={`${raw.length} ${raw.length === 1 ? 'pesagem' : 'pesagens'}`}
            value={lastWeight !== null ? fmtNumber(lastWeight, 1) : '—'}
            unit="kg"
            valueColor="var(--body)"
            delta={rate !== null
              ? {
                  text: `${roundedRate > 0 ? '+' : roundedRate < 0 ? '−' : ''}${fmtNumber(Math.abs(roundedRate), 1)} kg/semana`,
                  tone: Math.abs(rate) >= 1 ? 'danger' : 'neutral',
                }
              : undefined}
            footer={sufficient ? undefined : missing}
            axis={raw.length > 1
              ? { min: `${fmtNumber(Math.min(...raw), 1)} kg`, max: `${fmtNumber(Math.max(...raw), 1)} kg` }
              : undefined}
            legend={[
              { label: weightTrendData.isEWMASmoothing ? 'Tendência' : 'Evolução', color: 'var(--body)', shape: 'line' },
              { label: 'Pesagens', color: 'rgba(248,250,252,.4)' },
            ]}
            height={192}
          >
            <Line data={weightDualChartData} options={chartOptions} />
          </ChartFrame>
        );
      })()}

      {/* 4. Composição Corporal (Massa Magra vs Massa Gorda - Eixo Duplo) */}
      {compositionData && compositionData.dates.length > 0 && (
        <StackedAreaChart data={compositionData} />
      )}
    </div>
  );
}
