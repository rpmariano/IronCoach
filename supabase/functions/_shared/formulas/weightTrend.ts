// T1 — Tendência de peso (EWMA), fórmula pura.
//
// @doutrina specs/formulas-centralizacao.md §5.3 — decisão tomada: EWMA
// α=0,25 é a fórmula única. Antes desta migração havia 3 implementações
// (biEngine.js em EWMA α=0,25 — a escolhida; coach-chat em média simples
// de 7 dias; coach-daily-summary em regressão de 2 pontos, que ignora
// todos os pontos intermédios do período). Ver
// specs/formulas-checklist.md Fase C.
//
// Regra de pureza: recebe os pontos já ordenados por data ascendente
// (`rawPoints`) — a leitura à BD e a ordenação ficam no chamador. Datas
// aqui são só strings 'YYYY-MM-DD' comparadas lexicograficamente ou via
// Date/UTC determinístico — sem date-fns, sem "now".

export interface WeightPoint {
  date: string; // 'YYYY-MM-DD'
  weight: number;
}

export type WeightTrendLabel = 'subindo' | 'descendo' | 'estavel';

export interface WeightTrendResult {
  movingAverage: WeightPoint[];
  trend: WeightTrendLabel;
  weeklyRate: number;
  isEWMASmoothing: boolean;
}

function addDaysToIso(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// rawPoints tem de vir ordenado por data ascendente (mais antigo primeiro),
// com peso já filtrado para > 0 — o chamador faz essa preparação (é leitura
// de dados, não fórmula).
export function computeWeightTrend(rawPoints: WeightPoint[]): WeightTrendResult | null {
  if (!rawPoints || rawPoints.length === 0) return null;

  const alpha = 2 / (7 + 1); // ~0.25
  const isEWMASmoothing = rawPoints.length >= 5;
  const movingAverage: WeightPoint[] = [];

  if (isEWMASmoothing) {
    let ewma = rawPoints[0].weight;
    for (const pt of rawPoints) {
      ewma = alpha * pt.weight + (1 - alpha) * ewma;
      movingAverage.push({ date: pt.date, weight: Math.round(ewma * 100) / 100 });
    }
  } else {
    for (const pt of rawPoints) {
      movingAverage.push({ date: pt.date, weight: pt.weight });
    }
  }

  let trend: WeightTrendLabel = 'estavel';
  let weeklyRate = 0;

  if (movingAverage.length >= 2) {
    const recent = movingAverage[movingAverage.length - 1];
    // Ponto de referência: o primeiro (mais antigo) que caia dentro dos
    // últimos ~10 dias (7 dias + 3 de tolerância, igual à implementação
    // original de biEngine.js).
    const cutoff = addDaysToIso(recent.date, -10);
    const weekAgoPoint = movingAverage.find(p => p.date > cutoff);

    if (weekAgoPoint) {
      const diff = recent.weight - weekAgoPoint.weight;
      weeklyRate = Math.round(diff * 100) / 100;
      if (diff < -0.3) trend = 'descendo';
      else if (diff > 0.3) trend = 'subindo';
    } else {
      // Fallback: sem nenhum ponto na janela de ~10 dias, compara
      // primeiro e último do histórico disponível (limiar mais largo,
      // porque o intervalo real pode ser bem maior que 1 semana).
      const diff = movingAverage[movingAverage.length - 1].weight - movingAverage[0].weight;
      if (diff < -0.5) trend = 'descendo';
      else if (diff > 0.5) trend = 'subindo';
    }
  }

  return { movingAverage, trend, weeklyRate, isEWMASmoothing };
}
