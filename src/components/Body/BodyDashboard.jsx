import React, { useState, useMemo } from 'react';
import { useAppStore } from '../../store';
import { BODY_METRICS, fmtMetric } from '../../utils/body';
import { getBodyIcon } from '../../utils/bodyIcons';
import { List, User, CalendarDays, TrendingUp, Activity } from 'lucide-react';
import { Line } from 'react-chartjs-2';
import '../../lib/chartSetup';
import Button from '../shared/Button';
import Chip from '../shared/Chip';
import TimeFilterBar from '../BI/TimeFilterBar';
import KPICard from '../BI/KPICard';
import StackedAreaChart from '../BI/StackedAreaChart';
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

  // Points for selected metric
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
        backgroundColor: `${selectedMetric.color}20`,
        pointBackgroundColor: selectedMetric.color,
        pointRadius: points.length > 20 ? 0 : 4,
        borderWidth: 2,
        tension: 0.25,
        fill: true,
      }]
    };
  }, [points, selectedMetric]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      y: { beginAtZero: false, grid: { color: 'rgba(0,0,0,0.05)' } },
      x: { grid: { display: false } }
    }
  };

  const weightTrendData = useMemo(() => calculateWeightTrend(filteredAssessments), [filteredAssessments]);
  const compositionData = useMemo(() => calculateCompositionTrend(filteredAssessments), [filteredAssessments]);

  // KPI Calculations
  const kpiPeso = useMemo(() => {
    if (!filteredAssessments.length) return null;
    const valid = filteredAssessments.filter(a => a.weight_kg);
    if (!valid.length) return null;
    const latest = valid[valid.length - 1].weight_kg;
    const first = valid[0].weight_kg;
    const diff = latest - first;
    return { value: latest, trendValue: diff, trendType: diff > 0.5 ? 'up' : diff < -0.5 ? 'down' : 'neutral' };
  }, [filteredAssessments]);

  const kpiBF = useMemo(() => {
    const valid = filteredAssessments.filter(a => a.body_fat_pct);
    if (!valid.length) return null;
    const latest = valid[valid.length - 1].body_fat_pct;
    const first = valid[0].body_fat_pct;
    const diff = latest - first;
    return { value: latest, trendValue: diff, trendType: diff > 0.5 ? 'up' : diff < -0.5 ? 'down' : 'neutral' };
  }, [filteredAssessments]);

  const kpiLM = useMemo(() => {
    const valid = filteredAssessments.filter(a => a.lean_body_mass_kg);
    if (!valid.length) return null;
    const latest = valid[valid.length - 1].lean_body_mass_kg;
    const first = valid[0].lean_body_mass_kg;
    const diff = latest - first;
    return { value: latest, trendValue: diff, trendType: diff > 0.5 ? 'up' : diff < -0.5 ? 'down' : 'neutral' };
  }, [filteredAssessments]);

  if (bodyAssessments.length === 0) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center text-center px-6 fade-in">
        <span className="w-16 h-16 rounded-3xl flex items-center justify-center mb-4" style={{ background: 'linear-gradient(135deg, var(--mod-corpo-from), var(--mod-corpo-to))' }}>
          <User className="w-7 h-7" style={{ color: '#fff' }} />
        </span>
        <h2 className="text-sm font-bold text-slate-800 mb-1">Composição corporal</h2>
        <p className="text-xs text-slate-500 max-w-xs leading-relaxed">Ainda não tens avaliações. Vai ao Calendário para enviar o teu primeiro print da Renpho Health.</p>
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
    <div className="space-y-4 fade-in pb-8">
      <TimeFilterBar
        activeRange={timeRange}
        onChange={setTimeRange}
      />

      <div className="grid grid-cols-3 gap-2">
        {kpiPeso && (
          <KPICard 
            label="Peso" 
            value={kpiPeso.value.toFixed(1)}
            unit="kg"
            delta={Math.round(kpiPeso.trendValue * 10) / 10}
            moduleColor="var(--mod-corpo)" 
          />
        )}
        {kpiBF && (
          <KPICard 
            label="BF%" 
            value={kpiBF.value.toFixed(1)}
            unit="%"
            delta={Math.round(kpiBF.trendValue * 10) / 10}
            moduleColor="var(--mod-corpo)" 
          />
        )}
        {kpiLM && (
          <KPICard 
            label="Massa Magra" 
            value={kpiLM.value.toFixed(1)}
            unit="kg"
            delta={Math.round(kpiLM.trendValue * 10) / 10}
            moduleColor="var(--mod-corpo)" 
          />
        )}
      </div>

      {/* Weight Trend Chart */}
      {weightDualChartData && (
        <div className="card glass rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="w-5 h-5 text-[var(--mod-corpo)]" />
            <h2 className="text-sm font-semibold text-slate-800">Tendência de Peso (EWMA)</h2>
          </div>
          <div className="h-48 relative">
            <Line 
              data={weightDualChartData} 
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                  y: { beginAtZero: false, grid: { color: 'rgba(0,0,0,0.05)' } },
                  x: { grid: { display: false } }
                }
              }} 
            />
          </div>
        </div>
      )}

      {/* Body Composition Stacked Area.
          O componente traz o seu próprio cartão, título e alturas, e monta
          as séries a partir de `data` ({ dates, leanMassKg, fatMassKg }) —
          os antigos labels/datasets eram simplesmente ignorados, e o
          cartão exterior com h-48 fixo cortava o gráfico. */}
      {compositionData && compositionData.dates.length > 0 && (
        <StackedAreaChart data={compositionData} />
      )}

      {/* Evolução Individual */}
      <div className="flex items-center gap-3 mt-6">
        <div 
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm"
          style={{ background: 'linear-gradient(135deg, var(--mod-corpo-from), var(--mod-corpo-to))' }}
        >
          <TrendingUp className="w-5 h-5" style={{ color: '#fff' }} />
        </div>
        <div>
          <h2 className="text-sm font-bold text-slate-800 leading-none">Evolução por Métrica</h2>
          <p className="text-[11px] text-slate-500 mt-1">{filteredAssessments.length} avaliação(ões) no período</p>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {BODY_METRICS.map(m => {
          const isSelected = selectedMetricKey === m.key;
          return (
            <Chip
              key={m.key}
              active={isSelected}
              variant="body"
              rounded="full"
              onClick={() => setSelectedMetricKey(m.key)}
              className="shrink-0 px-3 py-1.5 whitespace-nowrap"
              style={isSelected ? { backgroundColor: m.color } : {}}
            >
              {m.label}
            </Chip>
          );
        })}
      </div>

      <div className="card glass rounded-2xl p-4">
        <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: selectedMetric.color }} />
            <h2 className="text-sm font-semibold text-slate-800 truncate">{selectedMetric.label}</h2>
          </div>
          {latestVal !== null && (
            <span className="text-lg font-bold text-slate-800">{fmtMetric(selectedMetric, latestVal)}</span>
          )}
        </div>

        <div className="mb-3">
          {goalVal != null && latestVal != null ? (
            <span className="text-[11px] text-slate-500">
              Objetivo: <span className="text-slate-700 font-semibold">{fmtMetric(selectedMetric, goalVal)}</span>
            </span>
          ) : (
            <span className="text-[11px] text-slate-500">
              {points.length} leitura(s){goalVal == null ? ' · sem objetivo definido' : ''}
            </span>
          )}
        </div>

        {points.length >= 1 ? (
          <div className="h-48 relative">
            <Line data={chartData} options={chartOptions} />
          </div>
        ) : (
          <p className="text-xs text-slate-400 py-8 text-center">Sem leituras desta métrica ainda no período.</p>
        )}
      </div>

      {/* Valores mais recentes grid */}
      <div className="flex items-center gap-2 px-1 mt-6">
        <List size={16} className="text-[var(--accent)]" />
        <h2 className="text-sm font-semibold text-slate-800">Valores mais recentes</h2>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {BODY_METRICS.map(m => {
          const withVal = bodyAssessments.filter(as => as[m.key] !== null && as[m.key] !== undefined);
          const latest = withVal[0];
          return (
            <div key={m.key} className="card glass rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span style={{ color: m.color }}>{getBodyIcon(m.key, 14)}</span>
                <p className="text-[10px] text-slate-500 truncate">{m.label}</p>
              </div>
              <p className="text-sm font-bold text-slate-800 mt-0.5">{latest ? fmtMetric(m, latest[m.key]) : '—'}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
