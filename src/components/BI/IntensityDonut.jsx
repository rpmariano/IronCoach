import React from 'react';
import { Doughnut } from 'react-chartjs-2';
import ChartJS from '../../lib/chartSetup';
import MetricInfo from './MetricInfo';
import ChartFrame from './ChartFrame';

/* Ponto 6 do redesenho. Duas mudanças:

   1. O "80%" deixou de ser desenhado dentro do anel por um plugin de canvas
      (`centerTextPlugin`, `ctx.fillText`) e passa a ser o número grande do
      ChartFrame, em HTML. O anel fica só com as duas fatias.

   2. Paleta (ponto 6, "paleta das séries de dados"). O Z3+ estava em
      #f97316, laranja, que não é nenhuma das oito cores e lia-se como
      âmbar da prova. Passa a: Z1-Z2 no ciano da corrida (a cor do módulo) e
      Z3+ no mesmo ciano a 40% quando a distribuição está dentro do alvo —
      é só a outra parte do mesmo bolo — ou no coral --warn quando está
      acima do alvo, porque aí é mesmo um aviso. Nunca âmbar: o âmbar é da
      prova. */

const RUN = '#2ee0ff';           // --run
const RUN_SOFT = 'rgba(46, 224, 255, 0.4)';
const WARN = '#fb7c4d';          // --warn

export default function IntensityDonut({ distribution = {}, targetLowPct, className = '' }) {
  const { lowIntensityPct = 0, highIntensityPct = 0 } = distribution;
  const target = targetLowPct ?? distribution.targetLowPct ?? 80;
  const targetHigh = 100 - target;
  const overTarget = highIntensityPct > targetHigh;
  const highColor = overTarget ? WARN : RUN_SOFT;

  const data = {
    labels: ['Z1-Z2', 'Z3+'],
    datasets: [
      {
        data: [lowIntensityPct, highIntensityPct],
        backgroundColor: [RUN, highColor],
        borderWidth: 0,
        hoverOffset: 4
      }
    ]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: true,
    cutout: '75%',
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
          label: (context) => ` ${context.label}: ${context.raw}%`
        }
      }
    }
  };

  return (
    <ChartFrame
      className={className}
      label="Distribuição de intensidade"
      info={<MetricInfo text="Regra 80/20. Cerca de 80% do tempo de treino deve ser feito em intensidades baixas (Zonas 1 e 2) para maximizar as adaptações aeróbicas sem acumular fadiga. Só 20% deve ser intenso." />}
      value={lowIntensityPct}
      unit="% em Z1-Z2"
      valueColor={overTarget ? 'var(--warn)' : 'var(--text-1)'}
      delta={{ text: `alvo ${target}%`, tone: overTarget ? 'warn' : 'ok' }}
      legend={[
        { label: 'Z1-Z2 (fácil)', color: RUN },
        { label: `Z3+ (forte) ${highIntensityPct}%`, color: highColor },
      ]}
      height={168}
    >
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 160, height: 160 }}>
          <Doughnut data={data} options={options} />
        </div>
      </div>
    </ChartFrame>
  );
}
