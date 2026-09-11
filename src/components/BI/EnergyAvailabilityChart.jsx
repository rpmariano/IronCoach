import React from 'react';
import { Line } from 'react-chartjs-2';
import ChartJS from '../../lib/chartSetup';
import MetricInfo from './MetricInfo';
import ChartFrame from './ChartFrame';
import { fmtNumber } from '../../utils/dashboardVerdicts';

/* Ponto 6 do redesenho: os ticks dos dois eixos saem da tela; o valor atual
   (a média de EA do período) é o número grande, as bandas de risco passam a
   itens de legenda em HTML. As bandas continuam desenhadas — são forma, não
   texto. Cores das bandas e dos pontos passam das do bootstrap
   (#dc3545/#ffc107/#28a745) às três com significado do ponto 3. */

const STATUS_COLOR = {
  critical: '#f87171',     // --danger
  danger: '#f87171',
  subclinical: '#fb7c4d',  // --warn
  caution: '#fb7c4d',
  optimal: '#34d399',      // --ok
};

export default function EnergyAvailabilityChart({ dailyData = [], className = '' }) {
  const values = dailyData.map(d => Number(d.ea || 0));
  const average = values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
  const daysAtRisk = dailyData.filter(d => d.status === 'critical').length;
  // Sem `> 0` no primeiro ramo, de propósito: uma EA negativa (gasta-se mais
  // do que se come — o caso de quem treina e não regista refeições) é pior
  // que 29, não melhor; com a guarda antiga caía em 'warn' coral.
  const tone = average < 30 ? 'danger' : average < 45 ? 'warn' : 'ok';

  const backgroundBandsPlugin = {
    id: 'backgroundBands',
    beforeDraw: (chart) => {
      const { ctx, chartArea, scales } = chart;
      if (!chartArea) return;
      const y = scales.y;
      if (!y) return;

      const drawBand = (min, max, color) => {
        const topVal = Math.min(max, y.max);
        const bottomVal = Math.max(min, y.min);
        if (bottomVal >= topVal) return;
        ctx.save();
        ctx.fillStyle = color;
        ctx.fillRect(chartArea.left, y.getPixelForValue(topVal), chartArea.right - chartArea.left, y.getPixelForValue(bottomVal) - y.getPixelForValue(topVal));
        ctx.restore();
      };

      drawBand(0, 30, 'rgba(248, 113, 113, 0.10)');   // --danger
      drawBand(30, 45, 'rgba(251, 124, 77, 0.10)');   // --warn
    }
  };

  const data = {
    labels: dailyData.map((_, i) => i),
    datasets: [
      {
        label: 'Disponibilidade energética',
        data: values,
        borderColor: '#c77dff',                    // --nutrition, é o módulo
        backgroundColor: 'rgba(199, 125, 255, 0.12)',
        tension: 0.4,
        pointBackgroundColor: dailyData.map(d => STATUS_COLOR[d.status] || STATUS_COLOR.optimal),
        pointBorderColor: 'rgba(11,17,32,1)',
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
      }
    ]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
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
          title: (items) => dailyData[items?.[0]?.dataIndex]?.date || '',
          label: (context) => ` EA: ${fmtNumber(context.raw, 1)} kcal/kg de massa magra`
        }
      }
    },
    scales: {
      x: { grid: { display: false }, ticks: { display: false }, border: { display: false } },
      y: {
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { display: false },
        border: { display: false },
        min: Math.min(10, ...values),
      }
    }
  };

  return (
    <ChartFrame
      className={className}
      label="Disponibilidade energética"
      info={<MetricInfo text="A EA (Energy Availability) é a energia que sobra para o teu corpo viver depois de descontar as calorias que queimaste a treinar. Se ficares repetidamente abaixo dos 30 kcal/kg, corres um risco clínico severo de Síndrome de Deficiência Energética Relativa (RED-S). Come mais nos dias de treino duro!" />}
      hint={dailyData.length > 0 ? `${dailyData.length} dias` : undefined}
      value={fmtNumber(average, 0)}
      unit="kcal/kg de massa magra"
      valueColor={tone === 'danger' ? 'var(--danger)' : tone === 'warn' ? 'var(--warn)' : 'var(--ok)'}
      delta={daysAtRisk > 0 ? { text: `${daysAtRisk} ${daysAtRisk === 1 ? 'dia' : 'dias'} abaixo de 30`, tone: 'danger' } : undefined}
      legend={[
        { label: 'Energia disponível por dia', color: 'var(--nutrition)', shape: 'line' },
        { label: 'Abaixo de 30 é crítico', color: 'var(--danger)' },
        { label: '30 a 45, a vigiar', color: 'var(--warn)' },
      ]}
      height={200}
    >
      <Line data={data} options={options} plugins={[backgroundBandsPlugin]} />
    </ChartFrame>
  );
}
