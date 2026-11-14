import React, { useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import ChartJS from '../../lib/chartSetup';
import ChartFrame from '../BI/ChartFrame';
import { fmtNumber } from '../../utils/verdicts/shared';

/* O perfil de altitude do percurso (o `points` do perfil do GPX: [km, altitude m], ≤ 300 pontos),
   no padrão dos outros gráficos: ChartFrame com o número grande (o D+), a legenda, os extremos do
   eixo em HTML e o «Pedir à Carol que explique». Carrega-se por React.lazy (CourseProfilePanel):
   o Chart.js só chega ao hub da prova quando há percurso. */

const RACE = '#fbbf24'; // --race

export default function CourseElevationChart({ profile, raceName = null }) {
  const pts = useMemo(() => (Array.isArray(profile?.points) ? profile.points : [])
    .filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])), [profile]);

  const data = useMemo(() => ({
    labels: pts.map((p) => p[0]),
    datasets: [{
      label: 'Altitude',
      data: pts.map((p) => p[1]),
      borderColor: RACE,
      backgroundColor: 'rgba(251, 191, 36, 0.16)',
      fill: true,
      tension: 0.25,
      pointRadius: 0,
      pointHoverRadius: 4,
      borderWidth: 2,
    }],
  }), [pts]);

  const options = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
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
          title: (items) => `km ${fmtNumber(pts[items?.[0]?.dataIndex]?.[0] ?? 0, 1)}`,
          label: (ctx) => `${fmtNumber(ctx.raw, 0)} m`,
        },
      },
    },
    scales: {
      x: { type: 'linear', grid: { display: false }, ticks: { display: false }, border: { display: false } },
      y: {
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { display: true, color: RACE, maxTicksLimit: 4, font: { size: 10 }, padding: 4, callback: (v) => `${fmtNumber(v, 0)} m` },
        border: { display: false },
      },
    },
  }), [pts]);

  if (pts.length < 2) return null;
  const dist = Number(profile.distance_km) || pts[pts.length - 1][0];
  return (
    <ChartFrame
      label="Perfil de altitude"
      value={`+${fmtNumber(profile.gain_m, 0)}`}
      unit="m de subida"
      valueColor="var(--race)"
      legend={[{ label: `Altitude · ${fmtNumber(profile.min_alt_m, 0)}–${fmtNumber(profile.max_alt_m, 0)} m`, color: RACE, shape: 'line' }]}
      axis={{ min: '0 km', max: `${fmtNumber(dist, 1)} km` }}
      height={170}
      explain={{
        title: `Perfil de altitude${raceName ? ` — ${raceName}` : ''}`,
        period: `${fmtNumber(dist, 1)} km`,
        series: [{ label: 'Altitude (m) por km', values: pts.map((p) => p[1]), decimals: 0 }],
        note: `D+ ${fmtNumber(profile.gain_m, 0)} m, D− ${fmtNumber(profile.loss_m, 0)} m, do GPX do percurso.`,
      }}
      data-testid="course-elevation-chart"
    >
      <Line data={data} options={options} />
    </ChartFrame>
  );
}
