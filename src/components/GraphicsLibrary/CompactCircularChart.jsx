import React from 'react';
import './CompactCircularChart.css';

export default function CompactCircularChart({
  label = "Proteína",
  value = "102g",
  target = "150g",
  percentage = 68,
  color = "#3b82f6"
}) {
  // Stroke dasharray is approx 251 (2 * pi * r = 2 * 3.1415 * 40 = 251.3)
  const strokeDashoffset = 251 - (251 * Math.min(percentage, 100)) / 100;

  return (
    <div className="circular-compact-card" style={{ borderLeft: `4px solid ${color}` }}>
      <span className="ccc-lbl" style={{ color: color }}>{label}</span>
      <div className="ccc-wrap">
        <svg className="ccc-svg" viewBox="0 0 100 100">
          <circle className="ccc-bg" cx="50" cy="50" r="40" />
          <circle 
            className="ccc-progress" 
            cx="50" 
            cy="50" 
            r="40" 
            style={{ 
              stroke: color, 
              strokeDashoffset: strokeDashoffset,
              filter: `drop-shadow(0 2px 4px ${color}33)`
            }} 
          />
        </svg>
        <div className="ccc-inner-text">{percentage}%</div>
      </div>
      <span className="ccc-val">{value}</span>
      <span className="ccc-target">meta <span style={{ color: color }}>{target}</span></span>
    </div>
  );
}
