import React, { useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import './HydrationOptionA.css';

export default function HydrationOptionA({ 
  currentMl = 1800, 
  goalMl = 2500,
  onLogWater
}) {
  const [remindersOn, setRemindersOn] = useState(true);

  const percentage = goalMl > 0 ? Math.min(100, Math.round((currentMl / goalMl) * 100)) : 0;
  // 565 is the approx circumference of the circle with r=90 (2 * pi * 90)
  const strokeDashoffset = 565 - (565 * percentage) / 100;

  const handleAddWater = (e, amount) => {
    e.preventDefault();
    e.stopPropagation();
    if (onLogWater) {
      onLogWater(amount);
    }
  };

  const handleToggleBell = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setRemindersOn(!remindersOn);
  };

  return (
    <div className="hydro-neon-card">
      <div className="hydro-neon-header">
        <button 
          className="hydro-neon-bell" 
          onClick={handleToggleBell}
          aria-label="Toggle reminders"
          title={remindersOn ? "Desativar lembretes" : "Ativar lembretes"}
        >
          {remindersOn ? <Bell size={18} /> : <BellOff size={18} />}
        </button>
        <div className="hydro-neon-pct">{percentage}%</div>
      </div>

      <div className="hydro-neon-circle-wrap">
        <svg className="hydro-neon-svg" viewBox="0 0 200 200">
          <circle className="hydro-neon-bg" cx="100" cy="100" r="90" />
          <circle 
            className="hydro-neon-progress" 
            cx="100" cy="100" r="90" 
            style={{ strokeDashoffset }}
          />
        </svg>
        <div className="hydro-neon-inner-text">
          <div className="hydro-neon-amount">{currentMl}</div>
          <div className="hydro-neon-unit">ml</div>
        </div>
      </div>

      <div className="hydro-neon-buttons">
        <button 
          className="hydro-neon-btn" 
          onClick={(e) => handleAddWater(e, 200)}
        >
          +200ml
        </button>
        <button 
          className="hydro-neon-btn" 
          onClick={(e) => handleAddWater(e, 250)}
        >
          +250ml
        </button>
      </div>
    </div>
  );
}
