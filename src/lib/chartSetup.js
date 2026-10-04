import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  ArcElement,
  RadialLinearScale,
  DoughnutController,
  RadarController,
  ScatterController
} from 'chart.js';
import { prefersReducedMotion, subscribeReducedMotion } from '../utils/useReducedMotion';
import { DUR_CHART, DUR_CHART_PERIOD } from '../utils/introAnimations';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  ArcElement,
  RadialLinearScale,
  DoughnutController,
  RadarController,
  ScatterController
);


ChartJS.defaults.color = '#cbd5e1';
ChartJS.defaults.font.family = 'ui-sans-serif, system-ui, sans-serif';
ChartJS.defaults.scale.grid.color = 'rgba(255, 255, 255, 0.05)';
ChartJS.defaults.scale.ticks.color = '#94a3b8';

/* Movimento (2026-10-04, F5 — animação ao ficar visível).
   O objeto de animação por omissão do Chart.js é alterado NO SÍTIO e nunca
   trocado por um objeto novo: o animador das linhas/scatter lê propriedades
   que só o objeto original traz (medido com o Chart.js 4.5.1 — trocá-lo
   congela as animações da sessão). Por isso o BASE guarda-se UMA vez (também
   num HMR, em que `defaults.animation` pode já estar a `false`) e o
   reduced-motion só alterna `defaults.animation` entre o BASE e `false`. */
const BASE = ChartJS._ironBaseAnimation
  ?? (ChartJS._ironBaseAnimation = ChartJS.defaults.animation);
if (BASE && typeof BASE === 'object') {
  // 700 ms (e não os 1000 de origem): com o escalonamento das barras o total
  // fica ~1 s, sem arrastar a entrada de um gráfico que já se está a ver.
  Object.assign(BASE, { duration: DUR_CHART, easing: 'easeOutQuart' });
}

// Mudar de período (setas ‹ ›) não repete a entrada: só uma transição curta.
// Quem quer isto usa `updateMode="period"` no react-chartjs-2.
ChartJS.defaults.transitions = ChartJS.defaults.transitions || {};
ChartJS.defaults.transitions.period = { animation: { duration: DUR_CHART_PERIOD } };

/* Gráfico "seguro na base" (2026-10-04). A ChartFrame marca a área do gráfico
   com `data-chart-hold` enquanto ele não foi revelado (ou foi rearmado). Aqui,
   depois de QUALQUER update de um gráfico lá dentro, para-se a animação que o
   update acabou de agendar e repõe-se a base — o render que se segue desenha
   já quieto, sem um frame escondido a mexer. Cobre o que a moldura não vê
   sem render seu: a instância que o React.StrictMode recria a seguir à
   montagem (medido no `npm run dev`: animava a entrada toda com opacity 0 e
   depois já não animava no reveal), um resize (rodar o telemóvel punha as
   barras cheias durante o deslize) e o update('none') do syncChartMotion.
   stop() antes de reset(), como em todo o lado: sem ele a animação desfaz o
   reset. O reveal tira o atributo no commit, antes de a moldura chamar
   stop → reset → update. */
const HOLD_SELECTOR = '[data-chart-hold]';
export const HOLD_AT_ZERO_PLUGIN = {
  id: 'ironHoldAtZero',
  afterUpdate(chart) {
    let held = false;
    try {
      held = !!chart.canvas?.closest?.(HOLD_SELECTOR);
    } catch {
      held = false;
    }
    if (!held) return;
    chart.stop();
    chart.reset();
  },
};
if (!ChartJS.registry?.plugins?.get?.(HOLD_AT_ZERO_PLUGIN.id)) {
  ChartJS.register(HOLD_AT_ZERO_PLUGIN);
}

/** Aplica a preferência de movimento aos defaults. Com `reduced` o Chart.js
 *  pinta tudo já no sítio; as opções de cada gráfico continuam a ganhar ao
 *  global (é por isso que `barGrowAnimation` recebe `reduced`). */
export function applyChartMotion(reduced = prefersReducedMotion()) {
  ChartJS.defaults.animation = reduced ? false : BASE;
}

/** Reavalia a preferência e põe os gráficos já criados no estado final, sem
 *  animação: `stop()` primeiro, porque uma animação a meio sobreviveria ao
 *  `update('none')` e acabaria a mexer um gráfico que devia estar quieto. */
export function syncChartMotion() {
  applyChartMotion();
  Object.values(ChartJS.instances || {}).forEach((chart) => {
    try {
      chart.stop?.();
      chart.update('none');
    } catch {
      /* gráfico a meio de ser destruído (canvas já fora do DOM) — nada a fazer */
    }
  });
}

applyChartMotion();
// Um único ouvinte para a vida do módulo; num HMR cancela o anterior.
ChartJS._ironMotionUnsub?.();
ChartJS._ironMotionUnsub = subscribeReducedMotion(syncChartMotion);

export default ChartJS;
