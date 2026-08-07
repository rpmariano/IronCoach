import React from 'react';
import './BarChart.css';

export default function BarChart({
  title = "Atividade de Corrida",
  subtitle = "Distância semanal (km)",
  highlightText = "Total: 42.5 km",
  labels = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'],
  data = [40, 65, 20, 85, 50, 100, 30], // percentage values (0 - 100)
  colorDefault = "#3b82f6",
  colorActive = "#e11d48"
}) {
  const maxVal = Math.max(...data);

  return (
    <div className="bar-chart-card">
      <div className="bc-header">
        <div>
          <h3 className="bc-title">{title}</h3>
          <span className="bc-subtitle">{subtitle}</span>
        </div>
        {highlightText && <span className="bc-highlight">{highlightText}</span>}
      </div>

      <div className="bc-container">
        {data.map((val, idx) => {
          const isActive = val === maxVal;
          const strokeColor = isActive ? colorActive : colorDefault;
          
          return (
            <div className="bc-col" key={idx}>
              <div className="bc-track">
                <div 
                  className="bc-fill" 
                  style={{ 
                    height: `${val}%`, 
                    background: `linear-gradient(180deg, color-mix(in srgb, ${strokeColor} 80%, white) 0%, ${strokeColor} 100%)`,
                    box-shadow: `0 4px 10px ${strokeColor}33`
                  }}
                />
              </div>
              <span className="bc-lbl" style={isActive ? { color: colorActive, fontWeight: 900 } : {}}>
                {labels[idx]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
