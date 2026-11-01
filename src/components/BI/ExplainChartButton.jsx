import React from 'react';
import { MessageCircle } from 'lucide-react';
import { useAppStore } from '../../store';
import { fmtNumber } from '../../utils/dashboardVerdicts';

/* «Pedir à Carol que explique» (pedido do Rui, 2026-11-01): «é importante ter um botão em cada
   gráfico que leve o atleta para a Carol lhe explicar a leitura do gráfico».

   Um botão discreto no fundo de cada cartão de gráfico (ChartFrame, prop `explain`). Abre o chat
   com o pedido já feito, pelo caminho que já existe para isso — o coachIntent `say` (Coach.jsx: o
   texto entra como se o atleta o tivesse escrito). Sem caminho novo no servidor: o contexto vai no
   próprio pedido, curto — o nome, o período, cada série com a unidade, e os números (início, fim,
   mínimo, máximo, tendência) —, para a Carol não ter de adivinhar.

   `explain`: { title, period?, series: [{ label, unit?, values: (number|null)[], decimals?, format? }], note? }
   (`format(v)` escreve um valor à maneira da série — o ritmo «5.24/km» em vez de 324 segundos). */

// Abaixo disto a diferença entre o início e o fim conta como «estável» (2% do intervalo de valores).
const FLAT_SHARE = 0.02;

const fmt = (v, decimals) => fmtNumber(v, decimals ?? (Math.abs(v) >= 100 ? 0 : 1));

/** Os números de uma série: início, fim, mínimo, máximo e tendência; null sem valores. */
export function seriesSummary(values) {
  // Sem valor (null, buraco) não é 0: fica de fora.
  const xs = (values || []).filter((v) => v != null && v !== '').map(Number).filter((v) => Number.isFinite(v));
  if (!xs.length) return null;
  const start = xs[0];
  const end = xs[xs.length - 1];
  const min = Math.min(...xs);
  const max = Math.max(...xs);
  const span = max - min;
  let trend = 'estável';
  if (xs.length >= 2 && span > 0 && Math.abs(end - start) > span * FLAT_SHARE) trend = end > start ? 'a subir' : 'a descer';
  if (xs.length < 2) trend = null;
  return { start, end, min, max, n: xs.length, trend };
}

/** O texto do pedido à Carol. */
export function buildChartExplainText({ title, period = null, series = [], note = null } = {}) {
  const parts = [];
  for (const s of series || []) {
    const sum = seriesSummary(s.values);
    if (!sum) continue;
    const u = s.unit ? ` ${s.unit}` : '';
    const f = (v) => (s.format ? s.format(v) : fmt(v, s.decimals));
    if (sum.n === 1) {
      parts.push(`${s.label}: ${f(sum.end)}${u} (um só ponto)`);
      continue;
    }
    parts.push(`${s.label}: de ${f(sum.start)} para ${f(sum.end)}${u}, mín. ${f(sum.min)}, máx. ${f(sum.max)} — ${sum.trend} (${sum.n} pontos)`);
  }
  const head = `Explica-me a leitura do gráfico «${title}»${period ? ` (${period})` : ''}.`;
  const body = parts.length ? ` ${parts.join('; ')}.` : '';
  const tail = note ? ` ${note}` : '';
  return `${head}${body}${tail}`;
}

export default function ExplainChartButton({ explain }) {
  if (!explain?.title) return null;
  const ask = () => {
    const { setCoachIntent, setActiveTab } = useAppStore.getState();
    setCoachIntent?.({ kind: 'say', text: buildChartExplainText(explain) });
    // Travada a saída (um ecrã com alterações por gravar), o pedido desfaz-se em vez de ficar à
    // espera do próximo chat — como no CarolInterventionActions.
    if (setActiveTab?.('coach') === false) setCoachIntent?.(null);
  };
  return (
    <button
      type="button"
      onClick={ask}
      data-testid="explain-chart"
      aria-label={`Pedir à Carol que explique o gráfico «${explain.title}»`}
      className="mt-3 min-h-[44px] inline-flex items-center gap-1.5 rounded-full px-3 text-[12px] font-bold transition active:scale-95"
      style={{ color: 'var(--coach)', background: 'var(--tint-coach-bg)', border: '1px solid var(--tint-coach-bd)' }}
    >
      <MessageCircle size={14} aria-hidden="true" />
      Pedir à Carol que explique
    </button>
  );
}
