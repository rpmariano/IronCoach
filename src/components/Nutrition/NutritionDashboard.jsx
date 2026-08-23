import React, { useState, useMemo } from 'react';
import Card from '../shared/Card';
import { useAppStore } from '../../store';
import { MACROS, MICROS, rangeTotals, mealNutrients } from '../../utils/nutrition';
import { ChevronDown, ChevronUp, Flame, Beef, Wheat, Droplet, FlaskConical, TrendingUp } from 'lucide-react';
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
import { filterByDateRange, calculateMacroAdherence, calculateEnergyAvailability } from '../../utils/biEngine';

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
  const { profile, meals, bodyAssessments, runs, gymSessions } = useAppStore();
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

  const eaData = useMemo(() => {
    const res = calculateEnergyAvailability(meals, bodyAssessments || [], runs || [], gymSessions || [], biRange);
    return res?.daily || [];
  }, [meals, bodyAssessments, runs, gymSessions, biRange]);

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
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: 'rgba(255, 255, 255, 0.5)', font: { size: 10 } }
      },
      y: {
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { color: 'rgba(255, 255, 255, 0.5)', font: { size: 10 } },
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
  const getComplianceStatus = (pct) => {
    if (!pct) return 'neutral';
    if (pct < 85) return 'danger';
    if (pct > 115) return 'caution';
    return 'safe';
  };

  return (
    <div className="space-y-4 fade-in pb-20">
      <TimeFilterBar 
        activeRange={activeFilter} 
        onChange={setActiveFilter} 
      />
      {/* 2x2 KPI Grid */}
      <div className="grid grid-cols-2 gap-3 px-1">
        <div 
          onClick={() => setSelectedMacro('calories')}
          className={`cursor-pointer transition-all rounded-2xl ${selectedMacro === 'calories' ? 'ring-2 ring-emerald-500/80' : ''}`}
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
          className={`cursor-pointer transition-all rounded-2xl ${selectedMacro === 'protein' ? 'ring-2 ring-emerald-500/80' : ''}`}
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
          className={`cursor-pointer transition-all rounded-2xl ${selectedMacro === 'carbs' ? 'ring-2 ring-emerald-500/80' : ''}`}
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
          className={`cursor-pointer transition-all rounded-2xl ${selectedMacro === 'fat' ? 'ring-2 ring-emerald-500/80' : ''}`}
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
      {chartData && (
        <div className="bg-white/5 backdrop-blur-[20px] border border-white/60 rounded-2xl p-4 shadow-[0_16px_40px_rgba(0,0,0,0.3),inset_0_2px_10px_rgba(255,255,255,0.6)]">
          <div className="flex items-start mb-2 gap-2">
            <h2 className="text-[11px] font-semibold text-slate-200 flex-1 flex items-center gap-1.5 uppercase tracking-wider">
              {(() => {
                const SelectedIcon = getMacroIcon(selectedMacro);
                return <SelectedIcon size={14} style={{ color: MACROS.find(m => m.key === selectedMacro)?.color }} />;
              })()}
              {MACROS.find(m => m.key === selectedMacro)?.label} por Dia
            </h2>
            <MetricInfo text="Aqui mostro-te a tua evolução diária exata deste macronutriente. O segredo da nutrição é a consistência: tenta manter esta linha estável e sem grandes picos repentinos." />
          </div>
          <div className="flex justify-center items-center gap-3 mb-4 text-[10px] text-slate-400 font-semibold">
            <span className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: MACROS.find(m => m.key === selectedMacro)?.color }}></div> 
              {MACROS.find(m => m.key === selectedMacro)?.label} ({MACROS.find(m => m.key === selectedMacro)?.unit})
            </span>
          </div>
          <div className="h-48">
            <Line data={chartData} options={chartOptions} />
          </div>
        </div>
      )}

      {/* BI Charts */}
      {adherence?.dailyBreakdown && adherence.dailyBreakdown.length > 0 && (
        <MacroComplianceChart dailyData={adherence.dailyBreakdown} />
      )}

      {eaData && eaData.length > 0 && (
        <EnergyAvailabilityChart dailyData={eaData} />
      )}

      {/* Micronutrients */}
      <div className="bg-white/5 backdrop-blur-[20px] border border-white/60 rounded-2xl overflow-hidden shadow-[0_16px_40px_rgba(0,0,0,0.3),inset_0_2px_10px_rgba(255,255,255,0.6)]">
        <button
          onClick={() => setMicrosExpanded(!microsExpanded)}
          className="w-full flex items-center justify-between p-4 text-left hover:bg-white/10 transition"
        >
          <div className="flex items-center gap-2">
            <FlaskConical size={14} className="text-[var(--mod-nutricao)]" />
            <h2 className="text-[11px] font-semibold text-slate-200 uppercase tracking-wider">Micronutrientes · {activeFilter}</h2>
          </div>
          {microsExpanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
        </button>
        {microsExpanded && (
          <div className="px-4 pb-4">
            <div className="space-y-3 pt-2">
              {MICROS.map(micro => (
                <div key={micro.key} className="flex justify-between items-center text-sm border-b border-white/10 last:border-0 pb-2 last:pb-0">
                  <span className="text-slate-400 text-xs">{micro.label}</span>
                  <span className="font-bold text-white text-xs">{(totals[micro.key] || 0).toFixed(1)} <span className="text-[10px] font-normal text-slate-400">{micro.unit}</span></span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
