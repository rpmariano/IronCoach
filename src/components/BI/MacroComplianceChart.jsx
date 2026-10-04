import React, { useMemo } from 'react';
import { Bar } from 'react-chartjs-2';
import ChartJS from '../../lib/chartSetup';
import MetricInfo from './MetricInfo';
import ChartFrame from './ChartFrame';
import { fmtNumber } from '../../utils/dashboardVerdicts';
import { barGrowAnimation } from '../../utils/introAnimations';
import useReducedMotion from '../../utils/useReducedMotion';
import { useAppStore, sliceReady } from '../../store';

/* Ponto 6 do redesenho:
   - A legenda do Chart.js (desenhada na tela) e os ticks dos dois eixos
     saem; passam a HTML no ChartFrame.
   - As três linhas de alvo continuam desenhadas (são forma, tracejado) mas
     sem rótulo dentro do canvas.
   - Paleta: #3c6cdd / #8b8118 / #dd3cb7 eram três cores inventadas. Passam
     às do mock "Dashboard · Nutrição": proteína rosa (--body), hidratos
     violeta (--nutrition), gordura ciano (--run). */

const PROT = '#ff5fa8';   // --body
const CARB = '#c77dff';   // --nutrition
const FAT = '#2ee0ff';    // --run

/* 2026-10-04: as linhas de alvo são um plugin CONSTANTE que lê os alvos das
   opções na hora de desenhar (`options.plugins.targetLines`). O
   react-chartjs-2 só entrega `plugins` ao `new Chart(...)` e nunca os
   atualiza: com o plugin a fechar sobre `sample` as linhas ficavam nos alvos
   da criação enquanto a legenda e o `y.suggestedMax` (que vêm das opções)
   mudavam — e no carrossel o canvas já não remonta a cada reveal. */
const TARGET_LINES_PLUGIN = {
  id: 'targetLines',
  afterDatasetsDraw: (chart, _args, opts) => {
    const { ctx, chartArea, scales } = chart;
    if (!chartArea || !scales?.y || !opts?.show) return;

    const drawLine = (target, color) => {
      if (!target || isNaN(target)) return;
      const yPos = scales.y.getPixelForValue(target);
      if (yPos > chartArea.bottom || yPos < chartArea.top) return;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(chartArea.left, yPos);
      ctx.lineTo(chartArea.right, yPos);
      ctx.lineWidth = 2;
      ctx.strokeStyle = color;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.restore();
    };

    // Sem rótulo dentro da tela — os alvos estão na legenda em HTML.
    drawLine(opts.protein, PROT);
    drawLine(opts.carbs, CARB);
    drawLine(opts.fat, FAT);
  },
};
const PLUGINS = [TARGET_LINES_PLUGIN];
const NO_SAMPLE = {};

export default function MacroComplianceChart({ dailyData = [], className = '' }) {
  /* 2026-10-04 (F5, plano §2.1): data, plugin e options estáveis — cada
     referência nova faz o react-chartjs-2 chamar chart.update(), que a meio de
     uma entrada a reaproveita e perde o escalonamento das barras. Quando o
     gráfico entra em cena é a ChartFrame que decide (stop → reset → update);
     aqui só se diz COMO as barras crescem. */
  const reduced = useReducedMotion();
  // As refeições alimentam as barras e os alvos vêm do perfil; fora do
  // separador (sem TabReadyContext) é isto que segura a entrada até chegarem.
  const ready = useAppStore((s) => sliceReady(s, ['meals', 'profile', 'body']));
  // Constante e não `{}`: um objeto novo a cada render refazia as opções (e
  // cada opção nova é um chart.update()) com a lista vazia (2026-10-04).
  const sample = dailyData[0] || NO_SAMPLE;


  const data = useMemo(() => ({
    labels: dailyData.map((_, i) => i),
    datasets: [
      { label: 'Proteína', data: dailyData.map(d => d.protein), backgroundColor: PROT, borderRadius: 4 },
      { label: 'Hidratos', data: dailyData.map(d => d.carbs), backgroundColor: CARB, borderRadius: 4 },
      { label: 'Gordura', data: dailyData.map(d => d.fat), backgroundColor: FAT, borderRadius: 4 },
    ]
  }), [dailyData]);

  const n = dailyData.length;
  const options = useMemo(() => ({
    responsive: true,
    /* Ponto 9, animação 4: as barras crescem da base, da esquerda para a
       direita; com reduced-motion é `false` e aparecem logo. */
    animation: barGrowAnimation({ reduced, count: n }),
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
          afterBody: (context) => {
            if (context.length === 0) return '';
            const d = dailyData[context[0].dataIndex];
            return `\nAlvos:\nProt: ${fmtNumber(d.proteinTarget || 0, 0)} g\nHidr: ${fmtNumber(d.carbsTarget || 0, 0)} g\nGord: ${fmtNumber(d.fatTarget || 0, 0)} g`;
          }
        }
      },
      // Lido pelo TARGET_LINES_PLUGIN a cada desenho.
      targetLines: {
        show: dailyData.length > 0,
        protein: sample.proteinTarget,
        carbs: sample.carbsTarget,
        fat: sample.fatTarget,
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { display: false }, border: { display: false } },
      y: {
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { display: false },
        border: { display: false },
        beginAtZero: true,
        suggestedMax: dailyData.length > 0
          ? Math.max(sample.proteinTarget || 0, sample.carbsTarget || 0, sample.fatTarget || 0) * 1.1
          : undefined
      }
    }
  }), [dailyData, sample, reduced, n]);

  // O "valor atual" deste gráfico é a proteína do último dia registado —
  // é a macro que decide a recuperação, e a que a Carol cita primeiro. Os
  // valores chegam em gramas absolutas por dia (o NutritionDashboard soma-as
  // das refeições; até 2026-09-29 eram g/kg do macroAdherence).
  const lastDay = dailyData[dailyData.length - 1] || {};
  const lastProtein = Number(lastDay.protein || 0);
  const proteinTarget = Number(lastDay.proteinTarget || sample.proteinTarget || 0);
  const proteinPct = proteinTarget > 0 ? (lastProtein / proteinTarget) * 100 : 0;

  return (
    <ChartFrame
      ready={ready}
      className={className}
      label="Adesão às macros"
      info={<MetricInfo text="Compara o que realmente comeste (barras coloridas) com os teus alvos ideais de Nutrição Desportiva (linhas tracejadas). Tens de bater as linhas tracejadas, especialmente a proteína, para garantirmos recuperação máxima!" />}
      hint={dailyData.length > 0 ? `${dailyData.length} dias` : undefined}
      value={fmtNumber(lastProtein, 0)}
      unit="g de proteína no último dia"
      valueColor={proteinPct >= 85 ? 'var(--text-1)' : 'var(--warn)'}
      delta={proteinTarget > 0 ? { text: `${fmtNumber(proteinPct, 0)}% do alvo`, tone: proteinPct >= 85 ? 'ok' : 'warn' } : undefined}
      legend={[
        { label: `Proteína · alvo ${fmtNumber(sample.proteinTarget || 0, 0)} g`, color: PROT },
        { label: `Hidratos · alvo ${fmtNumber(sample.carbsTarget || 0, 0)} g`, color: CARB },
        { label: `Gordura · alvo ${fmtNumber(sample.fatTarget || 0, 0)} g`, color: FAT },
      ]}
      height={200}
    >
      <Bar data={data} options={options} plugins={PLUGINS} updateMode="period" />
    </ChartFrame>
  );
}
