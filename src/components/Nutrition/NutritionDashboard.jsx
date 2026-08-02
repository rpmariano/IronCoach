import React, { useState, useMemo } from 'react';
import { useAppStore } from '../../store';
import { MACROS, MICROS, rangeBounds, rangeTotals, mealNutrients, mealTypeLabel } from '../../utils/nutrition';
import { ChevronDown, ChevronUp, Image as ImageIcon, Flame, Drumstick, Wheat, Droplets, FlaskConical, TrendingUp } from 'lucide-react';
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
  const { profile, meals } = useAppStore();
  const [activeRange, setActiveRange] = useState('hoje');
  const [selectedMacro, setSelectedMacro] = useState('calories');
  const [expandedMealId, setExpandedMealId] = useState(null);
  const [microsExpanded, setMicrosExpanded] = useState(true);

  const { start, end, daysElapsed } = rangeBounds(activeRange);
  const totals = rangeTotals(meals, activeRange);

  // Filter meals for the current range
  const periodMeals = useMemo(() => {
    return meals
      .filter(m => m.date >= start && m.date <= end)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [meals, start, end]);

  // Chart Data preparation
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
          backgroundColor: `${macroObj.color}20`, // 20 hex is ~12% opacity
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
      case 'protein': return Drumstick;
      case 'carbs': return Wheat;
      case 'fat': return Droplets;
      default: return Flame;
    }
  };

  return (
    <div className="space-y-4 fade-in pb-20">
      {/* Header Evolução */}
      <div className="flex items-center gap-3">
        <div 
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm"
          style={{ background: 'linear-gradient(135deg, var(--mod-nutricao-from), var(--mod-nutricao-to))' }}
        >
          <TrendingUp className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-slate-800 leading-none">Evolução</h2>
          <p className="text-[11px] text-slate-500 mt-1">{periodMeals.length} refeição(ões) no período</p>
        </div>
      </div>

      {/* Range Tabs */}
      <div className="flex gap-2">
        {['hoje', 'semana', 'mes'].map(r => (
          <button
            key={r}
            onClick={() => setActiveRange(r)}
            className={`range-chip flex-1 ${activeRange === r ? 'active' : ''}`}
          >
            {r === 'hoje' ? 'Hoje' : r === 'semana' ? 'Esta Semana' : 'Este Mês'}
          </button>
        ))}
      </div>

      <p className="text-[11px] text-slate-500 px-1">
        {activeRange === 'hoje' ? 'Hoje' : activeRange === 'semana' ? 'Esta Semana' : 'Este Mês'} · meta proporcional a {daysElapsed} dia(s)
      </p>

      {/* Macros Grid */}
      <div className="grid grid-cols-2 gap-3">
        {MACROS.map(m => {
          const goal = (Number(profile?.[m.goalKey]) || 0) * daysElapsed;
          const consumed = totals[m.key];
          const remaining = goal - consumed;
          const over = remaining < 0;
          const isSelected = selectedMacro === m.key;
          const Icon = getMacroIcon(m.key);

          return (
            <button
              key={m.key}
              onClick={() => setSelectedMacro(m.key)}
              className={`card rounded-2xl p-4 text-left transition ${isSelected ? 'shadow-md' : ''}`}
              style={{
                border: isSelected ? '2px solid var(--accent)' : '1px solid var(--brd-700)',
                boxShadow: isSelected ? '0 0 0 1px var(--accent)' : undefined
              }}
            >
              <span className={`text-xs block truncate mb-1.5 flex items-center gap-1.5 ${isSelected ? 'text-slate-800 font-bold' : 'text-slate-600'}`}>
                <Icon size={14} style={{ color: m.color }} />
                {m.label}
              </span>
              
              {goal > 0 ? (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full inline-block mb-2 whitespace-nowrap ${
                  over ? 'bg-red-500/15 text-red-500 border border-red-500/40' : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/30'
                }`}>
                  {over ? `${Math.abs(remaining).toFixed(0)} ${m.unit} acima` : `restam ${remaining.toFixed(0)} ${m.unit}`}
                </span>
              ) : (
                <span className="text-[10px] text-slate-400 block mb-2">Sem meta</span>
              )}
              
              <div className="flex items-baseline gap-1 mb-2">
                <span className="text-lg font-bold text-slate-800 leading-none">{consumed.toFixed(0)}</span>
                <span className="text-[11px] text-slate-500 font-normal"> / {goal > 0 ? goal.toFixed(0) : '-'} {m.unit}</span>
              </div>

              {/* Barra de progresso do macro */}
              <div className="w-full h-2 rounded-full bg-slate-100 border border-slate-200 overflow-hidden">
                <div 
                  className="h-full rounded-full transition-all duration-500" 
                  style={{ 
                    width: `${goal > 0 ? Math.min(100, (consumed / goal) * 100) : 0}%`, 
                    backgroundColor: over ? '#ef4444' : m.color 
                  }} 
                />
              </div>
            </button>
          );
        })}
      </div>

      {/* Chart */}
      <div className="card rounded-2xl p-4 pb-6">
        <h2 className="text-sm font-semibold text-slate-800 mb-2 flex items-center gap-1.5">
          {(() => {
            const SelectedIcon = getMacroIcon(selectedMacro);
            return <SelectedIcon size={16} style={{ color: MACROS.find(m => m.key === selectedMacro)?.color }} />;
          })()}
          {MACROS.find(m => m.key === selectedMacro)?.label} por Dia
        </h2>
        <div className="flex justify-center items-center gap-3 mb-4 text-[10px] text-slate-500 font-semibold">
          <span className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: MACROS.find(m => m.key === selectedMacro)?.color }}></div> {MACROS.find(m => m.key === selectedMacro)?.label} ({MACROS.find(m => m.key === selectedMacro)?.unit})</span>
          <span className="flex items-center gap-1"><div className="w-2.5 h-2.5 border rounded-sm" style={{ borderColor: '#ef4444' }}></div> Meta</span>
        </div>
        <div className="h-48">
          <Line data={chartData} options={chartOptions} />
        </div>
      </div>

      {/* Micronutrients */}
      <div className="card rounded-2xl overflow-hidden">
        <button
          onClick={() => setMicrosExpanded(!microsExpanded)}
          className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-50 transition"
        >
          <div className="flex items-center gap-2">
            <FlaskConical size={16} className="text-[var(--accent)]" />
            <h2 className="text-sm font-semibold text-slate-800">Micronutrientes · {activeRange === 'hoje' ? 'Hoje' : activeRange === 'semana' ? 'Semana' : 'Mês'}</h2>
          </div>
          {microsExpanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
        </button>
        {microsExpanded && (
          <div className="px-4 pb-4">
            <div className="space-y-3 pt-2">
              {MICROS.map(micro => (
                <div key={micro.key} className="flex justify-between items-center text-sm border-b border-slate-100 last:border-0 pb-2 last:pb-0">
                  <span className="text-slate-500">{micro.label}</span>
                  <span className="font-bold text-slate-800">{(totals[micro.key] || 0).toFixed(1)} <span className="text-xs">{micro.unit}</span></span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
