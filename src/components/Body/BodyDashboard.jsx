import React, { useState, useMemo } from 'react';
import { useAppStore } from '../../store';
import { BODY_METRICS, fmtMetric } from '../../utils/body';
import { getBodyIcon } from '../../utils/bodyIcons';
import { User, CalendarDays, Activity } from 'lucide-react';
import { Line } from 'react-chartjs-2';
import '../../lib/chartSetup';
import Button from '../shared/Button';
import TimeFilterBar from '../BI/TimeFilterBar';
import StackedAreaChart from '../BI/StackedAreaChart';
import MetricInfo from '../BI/MetricInfo';
import { filterByDateRange, calculateWeightTrend, calculateCompositionTrend } from '../../utils/biEngine';

export default function BodyDashboard({ onGoToCalendar }) {
  const { bodyAssessments, profile } = useAppStore();
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

      if (validInPeriod.length === 0) {
        return {
          metric: m,
          value: latestOverall,
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
        const formattedDiff = (isPositive ? '+' : '') + diff.toFixed(m.dec) + (m.unit ? ` ${m.unit}` : '');
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
        deltaText = '0.0 ' + (m.unit || '');
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

  const darkScales = {
    y: { beginAtZero: false, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: 'rgba(255,255,255,0.5)' } },
    x: { grid: { display: false }, ticks: { color: 'rgba(255,255,255,0.5)' } }
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: darkScales
  };

  const weightTrendData = useMemo(() => calculateWeightTrend(filteredAssessments), [filteredAssessments]);
  const compositionData = useMemo(() => calculateCompositionTrend(filteredAssessments), [filteredAssessments]);

  if (bodyAssessments.length === 0) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center text-center px-6 fade-in">
        <span className="w-16 h-16 rounded-3xl flex items-center justify-center mb-4" style={{ background: 'linear-gradient(135deg, var(--mod-corpo-from), var(--mod-corpo-to))' }}>
          <User className="w-7 h-7" style={{ color: '#fff' }} />
        </span>
        <h2 className="text-sm font-bold text-white mb-1">Composição corporal</h2>
        <p className="text-xs text-slate-400 max-w-xs leading-relaxed">Ainda não tens avaliações. Vai ao Calendário para enviar o teu primeiro print da Renpho Health.</p>
        <Button 
          variant="module"
          moduleColor="var(--accent)"
          onClick={onGoToCalendar} 
          className="mt-4 text-xs px-4"
          icon={<CalendarDays className="w-4 h-4" />}
        >
          Ir para o Calendário
        </Button>
      </div>
    );
  }

  const weightDualChartData = weightTrendData ? {
    labels: weightTrendData.rawPoints.map(p => p.date.slice(8, 10) + '/' + p.date.slice(5, 7)),
    datasets: [
      {
        label: 'EWMA (Tendência)',
        data: weightTrendData.movingAverage.map(p => p.weight),
        borderColor: 'var(--mod-corpo)',
        borderWidth: 3,
        pointRadius: 0,
        tension: 0.4,
        fill: false,
      },
      {
        label: 'Pesagens (Raw)',
        data: weightTrendData.rawPoints.map(p => p.weight),
        borderColor: 'transparent',
        backgroundColor: 'rgba(99, 102, 241, 0.4)',
        pointBackgroundColor: 'rgba(99, 102, 241, 0.4)',
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
      <TimeFilterBar
        activeRange={timeRange}
        onChange={setTimeRange}
      />

      {/* 1. Grelha de Cards Pequenos e Acionáveis com Variação */}
      <div className="grid grid-cols-3 gap-2">
        {metricSummaries.map(({ metric: m, value, deltaText, deltaType }) => {
          const isSelected = selectedMetricKey === m.key;
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => setSelectedMetricKey(m.key)}
              className={`p-2.5 text-left rounded-xl transition-all relative overflow-hidden backdrop-blur-[20px] shadow-[0_8px_20px_rgba(0,0,0,0.2)] active:scale-95 cursor-pointer ${
                isSelected 
                  ? 'bg-white/15 ring-2 shadow-[0_0_12px_rgba(255,255,255,0.2)]' 
                  : 'bg-white/5 border border-white/20 hover:bg-white/10'
              }`}
              style={isSelected ? { borderColor: m.color, ringColor: m.color } : {}}
            >
              <div className="flex items-center justify-between gap-1 mb-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span style={{ color: m.color }}>{getBodyIcon(m.key, 12)}</span>
                  <p className="text-[10px] font-medium text-slate-300 truncate">{m.label}</p>
                </div>
                {isSelected && (
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: m.color }} />
                )}
              </div>
              <p className="text-sm font-bold text-white tracking-tight leading-tight">
                {fmtMetric(m, value)}
              </p>
              <div className="mt-1 flex items-center justify-between min-h-[14px]">
                {deltaText ? (
                  <span className={`text-[9px] font-semibold ${
                    deltaType === 'good' ? 'text-emerald-400' :
                    deltaType === 'bad' ? 'text-rose-400' : 'text-slate-400'
                  }`}>
                    {deltaText}
                  </span>
                ) : (
                  <span className="text-[9px] text-slate-500">—</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* 2. Gráfico da Métrica Selecionada (reage aos cards acima) */}
      <div className="bg-white/5 backdrop-blur-[20px] border border-white/60 rounded-2xl p-4 shadow-[0_16px_40px_rgba(0,0,0,0.3),inset_0_2px_10px_rgba(255,255,255,0.6)]">
        <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: selectedMetric.color }} />
            <h2 className="text-[11px] font-semibold text-slate-200 uppercase tracking-wider truncate">{selectedMetric.label}</h2>
          </div>
          {latestVal !== null && (
            <span className="text-xl font-bold text-white">{fmtMetric(selectedMetric, latestVal)}</span>
          )}
        </div>

        <div className="mb-3">
          {goalVal != null && latestVal != null ? (
            <span className="text-[11px] text-slate-400">
              Objetivo: <span className="text-slate-200 font-semibold">{fmtMetric(selectedMetric, goalVal)}</span>
            </span>
          ) : (
            <span className="text-[11px] text-slate-400">
              {points.length} leitura(s){goalVal == null ? ' · sem objetivo definido' : ''}
            </span>
          )}
        </div>

        {points.length >= 1 ? (
          <div className="h-48 relative">
            <Line data={chartData} options={chartOptions} />
          </div>
        ) : (
          <p className="text-[11px] text-slate-500 py-8 text-center uppercase tracking-wider">Sem leituras desta métrica no período selecionado.</p>
        )}
      </div>

      {/* 3. Tendência de Peso (EWMA) */}
      {weightTrendData && (
        <div className="bg-white/5 backdrop-blur-[20px] border border-white/60 rounded-2xl p-4 shadow-[0_16px_40px_rgba(0,0,0,0.3),inset_0_2px_10px_rgba(255,255,255,0.6)]">
          <div className="flex items-start gap-2 mb-3">
            <div className="flex items-center gap-2 flex-1">
              <Activity className="w-4 h-4 text-[var(--mod-corpo)]" />
              <h2 className="text-[11px] font-semibold text-slate-200 uppercase tracking-wider leading-tight">Tendência de Peso (EWMA)</h2>
            </div>
            <MetricInfo text="O teu peso natural flutua todos os dias devido à água, ao sal e ao glicogénio (vê os pontos soltos). A linha contínua usa uma matemática especial (Média Móvel) para ignorar esse 'ruído' e mostrar-te a tua verdadeira tendência a longo prazo. Foca-te apenas na linha!" />
          </div>
          <div className="h-48 relative">
            <Line 
              data={weightDualChartData} 
              options={chartOptions} 
            />
          </div>
        </div>
      )}

      {/* 4. Composição Corporal (Massa Magra vs Massa Gorda - Eixo Duplo) */}
      {compositionData && compositionData.dates.length > 0 && (
        <StackedAreaChart data={compositionData} />
      )}
    </div>
  );
}
