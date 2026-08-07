import React from 'react';
import './DetailedLineChart.css';

export default function DetailedLineChart({
  title = "Calorias por Dia",
  labels = ['01/08', '02/08', '03/08', '04/08', '05/08'],
  data = [0, 555, 0, 0, 330],
  colorLine = "#e11d48",
  colorFill = "rgba(225, 29, 72, 0.15)",
  yMax = 600,
  yStep = 100
}) {
  // SVG Viewport sizes
  const width = 480;
  const height = 240;
  const paddingLeft = 45;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 35;

  const plotWidth = width - paddingLeft - paddingRight;
  const plotHeight = height - paddingTop - paddingBottom;

  // Convert raw values to coordinates
  const points = data.map((val, idx) => {
    const x = paddingLeft + (idx / (data.length - 1)) * plotWidth;
    const y = paddingTop + (1 - val / yMax) * plotHeight;
    return { x, y, val };
  });

  // Calculate cubic bezier string
  let linePath = "";
  let areaPath = "";

  if (points.length > 0) {
    linePath = `M ${points[0].x},${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const cpX1 = points[i].x + (points[i + 1].x - points[i].x) / 3;
      const cpY1 = points[i].y;
      const cpX2 = points[i].x + 2 * (points[i + 1].x - points[i].x) / 3;
      const cpY2 = points[i + 1].y;
      linePath += ` C ${cpX1},${cpY1} ${cpX2},${cpY2} ${points[i + 1].x},${points[i + 1].y}`;
    }
    // Area path closes at y = bottom line of plot (paddingTop + plotHeight)
    const bottomY = paddingTop + plotHeight;
    areaPath = `${linePath} L ${points[points.length - 1].x},${bottomY} L ${points[0].x},${bottomY} Z`;
  }

  // Generate Y-axis grid values & coordinates
  const yTicks = [];
  for (let val = 0; val <= yMax; val += yStep) {
    const y = paddingTop + (1 - val / yMax) * plotHeight;
    yTicks.push({ val, y });
  }

  const gradId = `detailed-line-grad-${title.replace(/\s+/g, '-').toLowerCase()}`;

  return (
    <div className="detailed-line-chart-card">
      
      {/* Header with Flame Icon and Legend */}
      <div className="dlc-header">
        <div className="dlc-title-row">
          <svg class="dlc-title-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
          </svg>
          <h3 className="dlc-title">{title}</h3>
        </div>
        
        {/* Legend */}
        <div className="dlc-legend">
          <div className="dlc-legend-item">
            <span className="dlc-legend-dot solid"></span>
            <span>Calorias (kcal)</span>
          </div>
          <div className="dlc-legend-item">
            <span className="dlc-legend-dot outline"></span>
            <span>Meta</span>
          </div>
        </div>
      </div>

      {/* SVG Container */}
      <div className="dlc-container">
        <svg className="dlc-svg" viewBox={`0 0 ${width} ${height}`}>
          <defs>
            <linearGradient id={gradId} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={colorLine} stopOpacity="0.15" />
              <stop offset="100%" stopColor={colorLine} stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Y-axis Ticks, Grid Lines, and Labels */}
          <g className="dlc-grid-group">
            {yTicks.map((tick, idx) => (
              <g key={idx}>
                {/* Horizontal grid line */}
                <line 
                  className="dlc-grid-line" 
                  x1={paddingLeft} 
                  y1={tick.y} 
                  x2={width - paddingRight} 
                  y2={tick.y} 
                />
                {/* Y Tick mark */}
                <line 
                  className="dlc-tick-line"
                  x1={paddingLeft - 5}
                  y1={tick.y}
                  x2={paddingLeft}
                  y2={tick.y}
                />
                {/* Y-axis label */}
                <text 
                  className="dlc-y-label"
                  x={paddingLeft - 10} 
                  y={tick.y + 4} 
                  textAnchor="end"
                >
                  {tick.val}
                </text>
              </g>
            ))}
          </g>

          {/* Area Path Fill */}
          {areaPath && (
            <path 
              className="dlc-area" 
              d={areaPath} 
              fill={`url(#${gradId})`} 
            />
          )}

          {/* Spline Line */}
          {linePath && (
            <path 
              className="dlc-line" 
              d={linePath} 
              stroke={colorLine} 
            />
          )}

          {/* Data Points (Big Red Dots with white border) */}
          {points.map((p, i) => (
            <g key={i}>
              <circle
                cx={p.x}
                cy={p.y}
                r="6"
                fill={colorLine}
                stroke="#fff"
                strokeWidth="2"
                className="dlc-point"
                style={{ filter: `drop-shadow(0 2px 4px rgba(225,29,72,0.3))` }}
              />
            </g>
          ))}

          {/* X-axis labels */}
          <g className="dlc-x-labels-group">
            {points.map((p, i) => (
              <text
                key={i}
                className="dlc-x-label"
                x={p.x}
                y={height - 10}
                textAnchor="middle"
              >
                {labels[i]}
              </text>
            ))}
          </g>
        </svg>
      </div>

    </div>
  );
}
