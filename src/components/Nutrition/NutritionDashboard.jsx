import React, { useState, useMemo } from 'react';
import Card from '../shared/Card';
import { useAppStore } from '../../store';
import { MACROS, MICROS, rangeTotals, mealNutrients } from '../../utils/nutrition';
import { ChevronDown, ChevronUp, Flame, Beef, Wheat, Droplet, FlaskConical, TrendingUp, Utensils } from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { format, eachDayOfInterval, subDays, subWeeks, subMonths, subYears } from 'date-fns';

import TimeFilterBar from '../BI/TimeFilterBar';
import KPICard from '../BI/KPICard';
import MacroComplianceChart from '../BI/MacroComplianceChart';
import EnergyAvailabilityChart from '../BI/EnergyAvailabilityChart';
import MetricInfo from '../BI/MetricInfo';
import ChartFrame from '../BI/ChartFrame';
import EmptyModuleState, { EmptyChartFrame } from '../BI/EmptyModuleState';
import VerdictLine from '../BI/VerdictLine';
import { nutritionVerdict, fmtNumber } from '../../utils/dashboardVerdicts';
import { filterByDateRange, calculateMacroAdherence, calculateEnergyAvailability } from '../../utils/biEngine';
import { classifyCalorieCompliance } from '@formulas/nutritionCompliance.ts';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export default function NutritionDashboard() {
  const { profile, meals, bodyAssessments, runs, gymSessions, setOpenCreationMode } = useAppStore();
  const [activeFilter, setActiveFilter] = useState('semana');
  const [selectedMacro, setSelectedMacro] = useState('calories');
  const [microsExpanded, setMicrosExpanded] = useState(false);

  // Map TimeFilterBar 'activeFilter' to biEngine range
  const biRangeMap = {
    'dia': 'dia',
    'semana': 'semana',
    'mes': 'mes',
    'trimestre': 'trimestre',
    '6meses': '6meses',
    'ano': 'ano'
  };

  const legacyRangeMap = {
    'dia': 'hoje',
    'semana': 'semana',
    'mes': 'mes',
    'trimestre': 'mes',
    '6meses': 'mes',
    'ano': 'mes'
  };

  const biRange = biRangeMap[activeFilter] || 'semana';
  const legacyRange = legacyRangeMap[activeFilter] || 'semana';
  const totals = rangeTotals(meals, legacyRange);

  // BI Engine Calculations
  const adherence = useMemo(() => {
    return calculateMacroAdherence(meals, profile, bodyAssessments || [], biRange);
  }, [meals, profile, bodyAssessments, biRange]);

  const eaWindow = useMemo(() => {
    return calculateEnergyAvailability(meals, bodyAssessments || [], runs || [], gymSessions || [], biRange);
  }, [meals, bodyAssessments, runs, gymSessions, biRange]);
  const eaData = eaWindow?.daily || [];

  /* Ponto 6 do redesenho: a frase de veredicto. As regras vivem em
     utils/dashboardVerdicts.js — aqui só se juntam os dados que o biEngine
     já calculou. A janela de EA passa inteira (e não só `daily`) porque o
     veredicto cita a média do período como prova. */
  const verdict = useMemo(
    () => nutritionVerdict({ adherence, ea: eaWindow }),
    [adherence, eaWindow]
  );

  // Chart Data preparation for selected macro trend
  const chartData = useMemo(() => {
    const macroObj = MACROS.find(m => m.key === selectedMacro) || MACROS[0];
    const now = new Date();
    let startObj = now;
    switch (activeFilter) {
      case 'dia': startObj = subDays(now, 1); break;
      case 'semana': startObj = subWeeks(now, 1); break;
      case 'mes': startObj = subMonths(now, 1); break;
      case 'trimestre': startObj = subMonths(now, 3); break;
      case '6meses': startObj = subMonths(now, 6); break;
      case 'ano': startObj = subYears(now, 1); break;
      default: startObj = subWeeks(now, 1);
    }
    const endObj = now;
    if (startObj > endObj) return null;

    const dates = eachDayOfInterval({ start: startObj, end: endObj });
    const labels = dates.map(d => format(d, 'dd/MM'));
    
    const dailyData = dates.map(dateObj => {
      const dayStr = format(dateObj, 'yyyy-MM-dd');
      const dayMeals = meals.filter(m => m.date === dayStr);
      let val = 0;
      dayMeals.forEach(m => {
        const n = mealNutrients(m);
        val += n[selectedMacro] || 0;
      });
      return Math.round(val * 10) / 10;
    });

    return {
      labels,
      datasets: [
        {
          label: macroObj.label,
          data: dailyData,
          borderColor: macroObj.color,
          backgroundColor: `${macroObj.color}20`,
          fill: true,
          tension: 0.4,
          pointRadius: dailyData.length > 35 ? 0 : 4,
          pointBackgroundColor: macroObj.color,
        }
      ]
    };
  }, [meals, activeFilter, selectedMacro]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        titleColor: '#f8fafc',
        bodyColor: '#f8fafc',
        borderColor: 'rgba(255,255,255,0.15)',
        borderWidth: 1,
        padding: 10,
        callbacks: {
          label: (context) => {
            const macroObj = MACROS.find(m => m.key === selectedMacro);
            return ` ${macroObj?.label || ''}: ${context.raw} ${macroObj?.unit || ''}`;
          }
        }
      }
    },
    // Ponto 6: os ticks deixam de escrever dentro da tela — o valor do
    // último dia é o número grande do ChartFrame e os extremos do eixo vão
    // para os cantos, em HTML.
    scales: {
      x: { grid: { display: false }, ticks: { display: false }, border: { display: false } },
      y: {
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { display: false },
        border: { display: false },
        beginAtZero: true
      }
    }
  };

  const getMacroIcon = (key) => {
    switch (key) {
      case 'calories': return Flame;
      case 'protein': return Beef;
      case 'carbs': return Wheat;
      case 'fat': return Droplet;
      default: return Flame;
    }
  };

  const modColor = 'var(--mod-nutricao)';

  // Determine status for KPICards. 'caution' (não 'warning') porque é o
  // vocabulário que o KPICard reconhece — 'warning' não tinha nenhum case
  // no getStatusColor() dele e caía sempre no cinzento neutro, escondendo o
  // aviso de excesso (ver auditoria de 23/08).
  //
  // A classificação de zona delega em @formulas/nutritionCompliance.ts
  // (T1) — antes tinha um limiar próprio (85/115), diferente dos outros 2
  // ecrãs que mostram a mesma pergunta; unificado por decisão do
  // utilizador (specs/formulas-checklist.md). 'critical' e 'low' mapeiam
  // ambos para 'danger' — o KPICard só tem 3 tons + neutro, não 4.
  const getComplianceStatus = (pct) => {
    const zone = classifyCalorieCompliance(pct);
    if (zone === 'no_data') return 'neutral';
    if (zone === 'critical' || zone === 'low') return 'danger';
    if (zone === 'over') return 'caution';
    return 'safe';
  };

  /* Ponto 7: sem refeições no período, o cartão de convite do mock
     "Dashboard · sem dados" em vez dos quatro KPIs a zero e de uma linha
     de macros achatada no chão do gráfico. */
  const periodMeals = useMemo(
    () => filterByDateRange(meals || [], biRange),
    [meals, biRange]
  );

  if (periodMeals.length === 0) {
    return (
      <div className="space-y-4 fade-in pb-20">
        <VerdictLine text={verdict.text} tone={verdict.tone} />
        <TimeFilterBar activeRange={activeFilter} onChange={setActiveFilter} module="nutricao" />
        <EmptyModuleState
          tone="nutrition"
          icon={<Utensils size={22} />}
          actionLabel="Registar refeição"
          onAction={() => setOpenCreationMode('meal')}
        >
          Ainda não há refeições neste período. Regista uma refeição para veres a tua evolução aqui.
        </EmptyModuleState>
        <EmptyChartFrame label="Calorias por dia" unit="kcal no último dia" height={192} />
      </div>
    );
  }

  return (
    <div className="space-y-4 fade-in pb-20">
      {/* Veredicto — antes dos filtros e dos KPIs, como no mock. */}
      <VerdictLine text={verdict.text} tone={verdict.tone} />

      <TimeFilterBar
        activeRange={activeFilter}
        onChange={setActiveFilter}
        module="nutricao"
      />
      {/* 2x2 KPI Grid */}
      <div className="grid grid-cols-2 gap-3 px-1">
        <div 
          onClick={() => setSelectedMacro('calories')}
          className={`cursor-pointer transition-all rounded-2xl ${selectedMacro === 'calories' ? 'ring-2 ring-[var(--ok)]' : ''}`}
        >
          <KPICard 
            label="Calorias"
            value={adherence?.calories?.actual ?? 0}
            unit="kcal/dia"
            icon={Flame}
            moduleColor={modColor}
            status={getComplianceStatus(adherence?.calories?.compliance_pct)}
            delta={adherence?.calories?.target ? Math.round(((adherence.calories.actual / adherence.calories.target) - 1) * 100) : 0}
            className="h-full"
          />
        </div>
        <div 
          onClick={() => setSelectedMacro('protein')}
          className={`cursor-pointer transition-all rounded-2xl ${selectedMacro === 'protein' ? 'ring-2 ring-[var(--ok)]' : ''}`}
        >
          <KPICard 
            label="Proteína"
            value={adherence?.protein?.actual_g_per_kg ?? 0}
            unit="g/kg"
            icon={Beef}
            moduleColor={modColor}
            status={getComplianceStatus(adherence?.protein?.compliance_pct)}
            delta={adherence?.protein?.target ? Math.round(((adherence.protein.actual_g / adherence.protein.target) - 1) * 100) : 0}
            className="h-full"
          />
        </div>
        <div 
          onClick={() => setSelectedMacro('carbs')}
          className={`cursor-pointer transition-all rounded-2xl ${selectedMacro === 'carbs' ? 'ring-2 ring-[var(--ok)]' : ''}`}
        >
          <KPICard 
            label="Hidratos"
            value={adherence?.carbs?.actual_g_per_kg ?? 0}
            unit="g/kg"
            icon={Wheat}
            moduleColor={modColor}
            status={getComplianceStatus(adherence?.carbs?.compliance_pct)}
            delta={adherence?.carbs?.target ? Math.round(((adherence.carbs.actual_g / adherence.carbs.target) - 1) * 100) : 0}
            className="h-full"
          />
        </div>
        <div 
          onClick={() => setSelectedMacro('fat')}
          className={`cursor-pointer transition-all rounded-2xl ${selectedMacro === 'fat' ? 'ring-2 ring-[var(--ok)]' : ''}`}
        >
          <KPICard 
            label="Gordura"
            value={adherence?.fat?.actual_g_per_kg ?? 0}
            unit="g/kg"
            icon={Droplet}
            moduleColor={modColor}
            status={getComplianceStatus(adherence?.fat?.compliance_pct)}
            delta={adherence?.fat?.target ? Math.round(((adherence.fat.actual_g / adherence.fat.target) - 1) * 100) : 0}
            className="h-full"
          />
        </div>
      </div>

      {/* Macro Trend Line Chart — logo a seguir aos 4 cards */}
      {chartData && (() => {
        const macroObj = MACROS.find(m => m.key === selectedMacro) || MACROS[0];
        const series = chartData.datasets[0].data;
        const lastValue = series.length ? series[series.length - 1] : 0;
        const maxValue = series.length ? Math.max(...series) : 0;
        return (
          <ChartFrame
            label={`${macroObj.label} por dia`}
            info={<MetricInfo text="Aqui mostro-te a tua evolução diária exata deste macronutriente. O segredo da nutrição é a consistência: tenta manter esta linha estável e sem grandes picos repentinos." />}
            value={fmtNumber(lastValue, macroObj.key === 'calories' ? 0 : 1)}
            unit={`${macroObj.unit} no último dia`}
            valueColor={macroObj.color}
            axis={maxValue > 0 ? { min: `0 ${macroObj.unit}`, max: `${fmtNumber(maxValue, 0)} ${macroObj.unit}` } : undefined}
            legend={[{ label: `${macroObj.label} (${macroObj.unit})`, color: macroObj.color, shape: 'line' }]}
            height={192}
          >
            <Line data={chartData} options={chartOptions} />
          </ChartFrame>
        );
      })()}

      {/* BI Charts */}
      {adherence?.dailyBreakdown && adherence.dailyBreakdown.length > 0 && (
        <MacroComplianceChart dailyData={adherence.dailyBreakdown} />
      )}

      {eaData && eaData.length > 0 && (
        <EnergyAvailabilityChart dailyData={eaData} />
      )}

      {/* Micronutrients */}
      <div className="bg-[var(--surface-glass)] backdrop-blur-[20px] border border-white/60 rounded-2xl overflow-hidden shadow-[0_16px_40px_rgba(0,0,0,0.3),inset_0_2px_10px_rgba(255,255,255,0.6)]">
        <button
          onClick={() => setMicrosExpanded(!microsExpanded)}
          className="w-full min-h-[44px] flex items-center justify-between p-4 text-left hover:bg-[var(--surface-strong)] transition"
        >
          <div className="flex items-center gap-2">
            <FlaskConical size={14} className="text-[var(--mod-nutricao)]" />
            <h2 className="text-[11px] font-semibold text-[var(--text-2)] uppercase tracking-wider">Micronutrientes · {activeFilter}</h2>
          </div>
          {microsExpanded ? <ChevronUp size={16} className="text-[var(--text-3)]" /> : <ChevronDown size={16} className="text-[var(--text-3)]" />}
        </button>
        {microsExpanded && (
          <div className="px-4 pb-4">
            <div className="space-y-3 pt-2">
              {MICROS.map(micro => (
                <div key={micro.key} className="flex justify-between items-center text-sm border-b border-[var(--border-glass)] last:border-0 pb-2 last:pb-0">
                  <span className="text-[var(--text-3)] text-xs">{micro.label}</span>
                  <span className="font-bold text-white text-xs">{(totals[micro.key] || 0).toFixed(1)} <span className="text-[11px] font-normal text-[var(--text-3)]">{micro.unit}</span></span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
