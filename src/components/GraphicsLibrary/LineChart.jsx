import React from 'react';
import './LineChart.css';

export default function LineChart({
  title = "Evolução do Peso",
  subtitle = "Últimos 7 registos (kg)",
  highlightText = "-2.4 kg este mês",
  labels = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'],
  data = [79.8, 79.5, 79.3, 79.4, 79.2, 79.0, 78.8],
  colorStart = "#e11d48",
  colorEnd = "#ef4444"
}) {
  // SVG Viewport sizes
  const width = 400;
  const height = 160;
  const paddingX = 20;
  const paddingY = 30;

  const minVal = Math.min(...data);
  const maxVal = Math.max(...data);
  const valRange = maxVal - minVal || 1;

  // Convert raw values to coordinates
  const points = data.map((val, idx) => {
    const x = paddingX + (idx / (data.length - 1)) * (width - 2 * paddingX);
    const y = height - paddingY - ((val - minVal) / valRange) * (height - 2 * paddingY);
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
    areaPath = `${linePath} L ${points[points.length - 1].x},${height} L ${points[0].x},${height} Z`;
  }

  const gradId = `line-glow-${title.replace(/\s+/g, '-').toLowerCase()}`;
  const areaGradId = `area-grad-${title.replace(/\s+/g, '-').toLowerCase()}`;

  return (
    <div className="line-chart-card">
      <div className="lc-header">
        <div>
          <h3 className="lc-title">{title}</h3>
          <span className="lc-subtitle">{subtitle}</span>
        </div>
        {highlightText && <span className="lc-highlight">{highlightText}</span>}
      </div>

      <div className="lc-container">
        <svg className="lc-svg" viewBox={`0 0 ${width} ${height}`}>
          <defs>
            <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={colorStart} />
              <stop offset="100%" stopColor={colorEnd} />
            </linearGradient>
            <linearGradient id={areaGradId} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={colorStart} />
              <stop offset="100%" stopColor="transparent" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          <g className="lc-grid-lines">
            <line x1="0" y1="30" x2={width} y2="30" />
            <line x1="0" y1="75" x2={width} y2="75" />
            <line x1="0" y1="120" x2={width} y2="120" />
          </g>

          {/* Fill Area */}
          {areaPath && <path className="lc-area" d={areaPath} fill={`url(#${areaGradId})`} />}

          {/* Smooth Line */}
          {linePath && <path className="lc-line" d={linePath} stroke={`url(#${gradId})`} filter={`drop-shadow(0 4px 8px ${colorStart}44)`} />}

          {/* Active Points */}
          {points.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={i === points.length - 1 ? 6 : 4}
              fill={i === points.length - 1 ? colorEnd : colorStart}
              stroke="#fff"
              strokeWidth="2"
              style={i === points.length - 1 ? { filter: `drop-shadow(0 0 5px ${colorEnd})` } : {}}
            />
          ))}
        </svg>
      </div>

      <div className="lc-labels-x">
        {labels.map((lbl, idx) => (
          <span key={idx}>{lbl}</span>
        ))}
      </div>
    </div>
  );
}
