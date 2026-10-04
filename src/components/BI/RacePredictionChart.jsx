import React, { useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import ChartJS from '../../lib/chartSetup';
import MetricInfo from './MetricInfo';
import ChartFrame from './ChartFrame';
import { useAppStore, sliceReady } from '../../store';
import { fmtNumber } from '../../utils/dashboardVerdicts';
import { LOW_CONFIDENCE } from '@formulas/racePrediction.ts';

/* Ponto 6 do redesenho:
   - O `predictionPlugin` desenhava uma caixa com texto DENTRO da tela
     (`ctx.fillText` do nome da prova e do tempo previsto). Sai por
     completo: o tempo previsto é agora o número grande do ChartFrame e o
     nome da prova é a etiqueta ao lado. Fica só a linha do VDOT no canvas.
   - Ticks e o `title` do eixo y ("VDOT") saem também.
   - Paleta: a série do VDOT estava em âmbar — o âmbar é da prova, e o VDOT
     é forma de corrida. A série passa ao ciano da corrida (--run); o âmbar
     fica só no número da PREVISÃO, que é mesmo da prova. */

const RUN = '#2ee0ff';   // --run

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/* R2 (2026-10-04): "baseado nos 10 km de 12 set". A previsão é uma
   extrapolação da corrida mais rápida de TODO o histórico; sem dizer qual, o
   número parece sair do ar e o atleta não tem como o contrastar com o do hub.
   Quando a corrida é de outro ano a data leva o ano ("12 set 2024"): sem ele
   lia-se como o 12 de setembro deste ano. Sem data válida diz só a distância;
   sem distância não diz nada (nunca inventa). Uma corrida de 1 km diz-se no
   singular ("numa corrida de 1 km"), não "nos 1 km". */
export function descreverBase(basedOn, hoje = new Date()) {
  const km = Number(basedOn?.distance);
  if (!(km > 0)) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(basedOn?.date ?? ''));
  const mes = m ? Number(m[2]) : 0;
  const diaDoMes = m ? Number(m[3]) : 0;
  const dataValida = mes >= 1 && mes <= 12 && diaDoMes >= 1 && diaDoMes <= 31;
  const dia = dataValida
    ? `${diaDoMes} ${MESES_CURTOS[mes - 1]}${Number(m[1]) !== hoje.getFullYear() ? ` ${m[1]}` : ''}`
    : null;
  const kmTxt = Number.isInteger(km) ? String(km) : fmtNumber(km, 1);
  if (!dia) return `baseado numa corrida de ${kmTxt} km`;
  return km === 1 ? `baseado numa corrida de 1 km de ${dia}` : `baseado nos ${kmTxt} km de ${dia}`;
}

export default function RacePredictionChart({ vdotTrend = [], prediction, className = '' }) {
  const formatTime = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return h > 0 ? `${h}h${m}:${s}` : `${m}:${s}`;
  };

  // Um ponto por data, ficando com o melhor VDOT do dia.
  const deduped = useMemo(() => Object.values(
    vdotTrend.reduce((acc, d) => {
      if (!acc[d.date] || d.vdot > acc[d.date].vdot) acc[d.date] = d;
      return acc;
    }, {})
  ).sort((a, b) => a.date.localeCompare(b.date)), [vdotTrend]);
  const ready = useAppStore((s) => sliceReady(s, ['runs', 'races']));

  const vdots = useMemo(() => deduped.map(d => Number(d.vdot)), [deduped]);
  const firstVdot = vdots.length ? vdots[0] : null;
  const lastVdot = vdots.length ? vdots[vdots.length - 1] : null;
  const hasTrend = deduped.length >= 2;

  // 2026-10-04: data/options estáveis; sem `animation` própria (default global).
  const data = useMemo(() => ({
    labels: deduped.map((_, i) => i),
    datasets: [
      {
        label: 'VDOT',
        data: vdots,
        borderColor: RUN,
        backgroundColor: 'rgba(46, 224, 255, 0.15)',
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 4,
      }
    ]
  }), [deduped, vdots]);

  const options = useMemo(() => ({
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
          title: (items) => deduped[items?.[0]?.dataIndex]?.date || '',
          label: (ctx) => `VDOT: ${fmtNumber(ctx.raw, 1)}`
        }
      }
    },
    scales: {
      x: { grid: { display: false }, ticks: { display: false }, border: { display: false } },
      y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { display: false }, border: { display: false } }
    }
  }), [deduped]);

  // O número grande: o tempo previsto quando há prova (âmbar, é da prova);
  // senão o VDOT atual (ciano, é da corrida).
  const value = prediction ? formatTime(prediction.predictedSeconds) : (lastVdot !== null ? fmtNumber(lastVdot, 1) : '—');
  const unit = prediction ? (prediction.raceName || 'prova') : 'VDOT';
  const valueColor = prediction ? 'var(--race)' : 'var(--run)';

  const vdotDelta = hasTrend ? lastVdot - firstVdot : null;

  // A base e a confiança só existem com previsão; o aviso de confiança baixa é
  // o mesmo critério (LOW_CONFIDENCE) e a mesma ressalva do hub da prova.
  const base = prediction ? descreverBase(prediction.basedOn) : null;
  const lowConfidence = !!prediction && (Number(prediction.confidence) || 0) < LOW_CONFIDENCE;

  const legend = [{ label: `VDOT ${lastVdot !== null ? fmtNumber(lastVdot, 1) : '—'}`, color: RUN, shape: 'line' }];
  if (prediction) legend.push({ label: 'Previsão da prova', color: 'var(--race)' });

  return (
    <ChartFrame
      ready={ready}
      className={className}
      label={prediction ? 'Previsão de prova' : 'Evolução do VDOT'}
      info={<MetricInfo text="O VDOT é uma aproximação do teu VO2max. Quanto mais alto o valor, maior a tua aptidão aeróbica e mais rápidos serão os teus tempos em provas." />}
      value={value}
      unit={unit}
      valueColor={valueColor}
      delta={vdotDelta !== null && Math.abs(vdotDelta) >= 0.1
        ? { text: `VDOT ${vdotDelta > 0 ? '+' : '−'}${fmtNumber(Math.abs(vdotDelta), 1)}`, tone: vdotDelta >= 0 ? 'ok' : 'warn' }
        : undefined}
      legend={hasTrend ? legend : []}
      axis={hasTrend ? { min: fmtNumber(Math.min(...vdots), 1), max: fmtNumber(Math.max(...vdots), 1) } : undefined}
      height={hasTrend ? 200 : 0}
      footer={(base || lowConfidence || !hasTrend) ? (
        <>
          {base && <p data-testid="race-prediction-base" style={{ margin: 0 }}>{base.charAt(0).toUpperCase() + base.slice(1)}.</p>}
          {lowConfidence && (
            <p data-testid="race-prediction-confianca" style={{ margin: base ? '4px 0 0' : 0 }}>
              Confiança baixa: a corrida de base é bem mais curta do que a prova, por isso é uma extrapolação. Regista uma mais longa e o número aperta.
            </p>
          )}
          {!hasTrend && (
            <p style={{ margin: (base || lowConfidence) ? '4px 0 0' : 0 }}>
              {prediction
                ? 'Regista mais corridas para veres a evolução do VDOT ao longo do tempo.'
                : 'Regista corridas para veres a previsão desta prova.'}
            </p>
          )}
        </>
      ) : undefined}
    >
      {hasTrend ? <Line data={data} options={options} updateMode="period" /> : null}
    </ChartFrame>
  );
}
