import React from 'react';
import './HydrationOptionA.css';

export default function HydrationOptionA({ 
  currentMl = 1800, 
  goalMl = 2500 
}) {
  const percentage = Math.min(100, Math.round((currentMl / goalMl) * 100));
  // 565 is the approx circumference of the circle with r=90 (2 * pi * 90)
  const strokeDashoffset = 565 - (565 * percentage) / 100;

  return (
    <div className="hydro-a-card">
      <div className="hydro-a-header">
        <p>Daily Hydration</p>
        <h2>Mantém-te hidratado 💧</h2>
      </div>

      <div className="hydro-a-circle">
        <svg className="hydro-a-svg" viewBox="0 0 200 200">
          <circle className="hydro-a-bg" cx="100" cy="100" r="90" />
          <circle 
            className="hydro-a-progress" 
            cx="100" cy="100" r="90" 
            style={{ strokeDashoffset }}
          />
        </svg>
        <div className="hydro-a-inner">
          <svg className="hydro-a-bottle-svg" width="36" height="58" viewBox="0 0 44 70" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2L14 10H30L32 2H12Z" fill="#0891b2"/>
            <path d="M8 12L4 26V66C4 68.2091 5.79086 70 8 70H36C38.2091 70 40 68.2091 40 66V26L36 12H8Z" fill="#e2e8f0"/>
            <path d="M4 36V66C4 68.2091 5.79086 70 8 70H36C38.2091 70 40 68.2091 40 66V36H4Z" fill="#06b6d4"/>
          </svg>
          <div className="hydro-a-percent">{percentage}%</div>
          <div className="hydro-a-status">Hidratado</div>
        </div>
      </div>

      <div className="hydro-a-labels">
        <span className="current">{currentMl} ml</span>
        <span className="total">/ {goalMl} ml</span>
      </div>

      <div className="hydro-a-buttons">
        <button className="hydro-a-btn">+ 200 ml</button>
        <button className="hydro-a-btn">+ 250 ml</button>
      </div>
    </div>
  );
}
