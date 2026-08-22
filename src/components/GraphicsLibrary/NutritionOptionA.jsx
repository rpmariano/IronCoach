import React, { useMemo } from 'react';
import { Utensils, Info, Flame } from 'lucide-react';
import { mealNutrients } from '../../utils/nutrition';
import './NutritionOptionA.css';

function todayISO() {
  const d = new Date();
  const tzDate = new Date(d.toLocaleString('en-US', { timeZone: 'Europe/Lisbon' }));
  const yyyy = tzDate.getFullYear();
  const mm = String(tzDate.getMonth() + 1).padStart(2, '0');
  const dd = String(tzDate.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export default function NutritionOptionA({ meals = [], profile = {}, onNav }) {
  const today = todayISO();
  const calGoal = Number(profile?.calorie_goal) || 0;
  const proteinGoal = Number(profile?.protein_goal) || 0;
  
  const totals = useMemo(() => {
    return meals.filter(m => m.date === today).reduce((acc, m) => {
      const n = mealNutrients(m);
      return {
        calories: acc.calories + (n.calories || 0),
        protein: acc.protein + (n.protein || 0),
      };
    }, { calories: 0, protein: 0 });
  }, [meals, today]);

  const remaining = calGoal - totals.calories;
  const isOverLimit = calGoal > 0 && remaining < 0;
  
  const percentage = calGoal > 0 ? Math.min(100, Math.round((totals.calories / calGoal) * 100)) : 0;
  const mealsToday = meals.filter(m => m.date === today).length;

  let proteinStatus = null;
  if (proteinGoal > 0 && totals.protein >= proteinGoal) proteinStatus = { color: '#16a34a', label: 'Proteína no alvo' };
  else if (proteinGoal > 0) proteinStatus = { color: '#d97706', label: `Faltam ${(proteinGoal - totals.protein).toFixed(0)}g de proteína` };

  const barColor = isOverLimit ? 'over-limit' : '';

  return (
    <div 
      className="nutri-nrc-card"
      onClick={() => onNav('nutricao')} 
      role="button" 
      tabIndex={0}
    >
      <div className="nutri-nrc-glow"></div>
      
      <div className="nutri-nrc-top">
        <div className="nutri-nrc-top-left">
          <div className="nutri-nrc-header-row">
            <span className="nutri-nrc-lbl">Nutrição Diária</span>
            <span className="nutri-nrc-tag">hoje</span>
          </div>
          
          <div className="nutri-nrc-sub">
            <div className="nutri-nrc-sub-item">
              <Utensils size={14} style={{ marginRight: '6px', color: '#10b981' }} />
              {mealsToday} refeições registadas
            </div>
            {proteinStatus && (
              <div className="nutri-nrc-sub-item">
                <Info size={14} style={{ marginRight: '6px', color: proteinStatus.color }} />
                <span style={{ color: proteinStatus.color }}>{proteinStatus.label}</span>
              </div>
            )}
          </div>
        </div>

        <div className="nutri-nrc-top-right">
          <span className="nutri-nrc-days" style={{ color: isOverLimit ? '#e11d48' : '#10b981' }}>
            {totals.calories.toFixed(0)}
          </span>
          <span className="nutri-nrc-days-lbl" style={{ color: isOverLimit ? '#be123c' : '#16a34a' }}>kcal</span>
        </div>
      </div>

      <div className="nutri-nrc-bottom">
        <div className="nutri-nrc-progress-container">
          <div className="nutri-nrc-progress-bar">
            <div className={`nutri-nrc-progress-fill ${barColor}`} style={{ width: `${percentage}%` }}></div>
            <div className={`nutri-nrc-runner ${barColor}`} style={{ left: `${percentage}%` }}>
              <Flame size={12} color={isOverLimit ? '#e11d48' : '#10b981'} />
            </div>
          </div>
          <div className="nutri-nrc-progress-labels">
            <span>Início</span>
            <span style={{ color: isOverLimit ? '#e11d48' : '#10b981', fontWeight: 800 }}>
              {calGoal > 0 ? (isOverLimit ? `${Math.abs(remaining).toFixed(0)} kcal acima` : `Faltam ${remaining.toFixed(0)} kcal`) : 'Sem meta'}
            </span>
            <span>Meta</span>
          </div>
        </div>
      </div>
    </div>
  );
}
