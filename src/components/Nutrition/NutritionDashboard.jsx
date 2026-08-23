import React, { useState, useMemo } from 'react';
import Card from '../shared/Card';
import { useAppStore } from '../../store';
import { MACROS, MICROS, rangeBounds, rangeTotals, mealNutrients } from '../../utils/nutrition';
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
import { format, eachDayOfInterval, parseISO } from 'date-fns';

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

  // Map for nutrition functions (rangeBounds)
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

  const { start, end, daysElapsed } = rangeBounds(legacyRange);
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
    const macroObj = MACROS.find(m => m.key === selectedMacro);
    const dates = eachDayOfInterval({ start: parseISO(start), end: parseISO(end) });
    const labels = dates.map(d => format(d, 'dd/MM'));
    
    const dailyData = dates.map(dateObj => {
      const dayStr = format(dateObj, 'yyyy-MM-dd');
      const dayMeals = meals.filter(m => m.date === dayStr);
      let val = 0;
      dayMeals.forEach(m => {
        const n = mealNutrients(m);
        val += n[selectedMacro];
      });
      return val;
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
          pointRadius: 4,
          pointBackgroundColor: macroObj.color,
        }
      ]
    };
  }, [meals, start, end, selectedMacro]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#171717',
        titleColor: '#a1a1aa',
        bodyColor: '#fff',
        borderColor: '#262626',
        borderWidth: 1,
        padding: 12,
        displayColors: false,
      }
    },
    scales: {
      x: {
        grid: { display: false, drawBorder: false },
        ticks: { color: '#71717a', font: { size: 10 } }
      },
      y: {
        grid: { color: '#262626', drawBorder: false },
        ticks: { color: '#71717a', font: { size: 10 } },
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

  // Determine status for KPICards
  const getComplianceStatus = (pct) => {
    if (!pct) return 'neutral';
    if (pct < 85) return 'danger';
    if (pct > 115) return 'warning';
    return 'safe';
  };

  return (
    <div className="space-y-4 fade-in pb-20">
      <TimeFilterBar 
        activeRange={activeFilter} 
        onChange={setActiveFilter} 
      />
      <div className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-[0_4px_12px_rgba(0,0,0,0.3)]"
          style={{ background: 'linear-gradient(135deg, var(--mod-nutricao), #10b981)' }}
        >
          <TrendingUp className="w-5 h-5" style={{ color: '#fff' }} />
        </div>
        <div>
          <h2 className="text-sm font-bold text-white leading-none">Evolução e BI</h2>
          <p className="text-[11px] text-slate-400 mt-1">Cumprimento de metas no período</p>
        </div>
      </div>

      {/* 2x2 KPI Grid */}
      <div className="grid grid-cols-2 gap-3">
        <div 
          onClick={() => setSelectedMacro('calories')}
          className={`cursor-pointer transition rounded-2xl ${selectedMacro === 'calories' ? 'ring-2 ring-emerald-600 shadow-md scale-[1.02]' : ''}`}
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
          className={`cursor-pointer transition rounded-2xl ${selectedMacro === 'protein' ? 'ring-2 ring-emerald-600 shadow-md scale-[1.02]' : ''}`}
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
          className={`cursor-pointer transition rounded-2xl ${selectedMacro === 'carbs' ? 'ring-2 ring-emerald-600 shadow-md scale-[1.02]' : ''}`}
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
          className={`cursor-pointer transition rounded-2xl ${selectedMacro === 'fat' ? 'ring-2 ring-emerald-600 shadow-md scale-[1.02]' : ''}`}
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

      {/* BI Charts */}
      {adherence?.dailyBreakdown && adherence.dailyBreakdown.length > 0 && (
        <MacroComplianceChart dailyData={adherence.dailyBreakdown} />
      )}

      {eaData && eaData.length > 0 && (
        <EnergyAvailabilityChart dailyData={eaData} />
      )}

      {/* Macro Trend Line Chart */}
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
