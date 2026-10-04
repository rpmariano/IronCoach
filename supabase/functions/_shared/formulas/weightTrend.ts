// T1 — Tendência de peso (EWMA + ritmo semanal por regressão), fórmula pura.
//
// @doutrina specs/formulas-centralizacao.md §5.3 — decisão tomada: EWMA
// α=0,25 é a fórmula única da LINHA suavizada. Antes desta migração havia 3
// implementações (biEngine.js em EWMA α=0,25 — a escolhida; coach-chat em
// média simples de 7 dias; coach-daily-summary em regressão de 2 pontos, que
// ignora todos os pontos intermédios do período). Ver
// specs/formulas-checklist.md Fase C.
//
// Ritmo semanal (C1/C2, 2026-10-04 — specs/evolucao-2026-10/erros-verificados.md):
// era a diferença bruta entre a última pesagem e a mais antiga dos 10 dias
// anteriores, sem dividir pelos dias — 2 pesagens a 3 dias com +0,6 kg davam
// "0,6 kg/semana", e com pesagens espaçadas 10+ dias a última comparava-se
// consigo própria ("O peso estabilizou" depois de 80 → 74 kg). O ramo de
// recurso que compararia o primeiro com o último nunca corria. Passa a ser o
// declive (kg/dia) de uma regressão linear de mínimos quadrados sobre as
// pesagens REAIS da janela recente (os 14 dias até à última pesagem), × 7 —
// e só quando há pesagens que cheguem: ≥3 na janela, a abranger ≥10 dias.
// Sem isso weeklyRate e trend ficam null (nunca um 0 inventado) e quem
// consome diz o que falta.
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
  /** null quando `sufficient` é false — não há tendência que se possa afirmar. */
  trend: WeightTrendLabel | null;
  /** kg/semana (declive por dia × 7, 2 casas); null quando `sufficient` é false. */
  weeklyRate: number | null;
  isEWMASmoothing: boolean;
  /** ≥ WEIGHT_TREND_MIN_POINTS pesagens na janela, a abranger ≥ WEIGHT_TREND_MIN_SPAN_DAYS. */
  sufficient: boolean;
  /** Dias entre a primeira e a última pesagem DA JANELA (0 com uma só). */
  spanDays: number;
  /** Pesagens dentro da janela (os últimos WEIGHT_TREND_WINDOW_DAYS dias até à última). */
  pointsInWindow: number;
}

// Exportados para quem consome poder escrever o que falta ("Preciso de 3
// pesagens em 10 dias") sem repetir os números à mão.
export const WEIGHT_TREND_WINDOW_DAYS = 14;
export const WEIGHT_TREND_MIN_POINTS = 3;
export const WEIGHT_TREND_MIN_SPAN_DAYS = 10;
// Banda de "estável" em kg/semana. Era ±0,3 kg sobre uma diferença não
// normalizada; com um ritmo semanal a sério, ±0,2 kg/semana.
const STABLE_BAND_KG_WEEK = 0.2;

function addDaysToIso(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(fromIso + 'T00:00:00Z');
  const b = Date.parse(toIso + 'T00:00:00Z');
  return Math.round((b - a) / 86_400_000);
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

  // Janela recente: as pesagens reais (não a EWMA, que já arrasta o passado
  // e duplicaria a suavização da regressão) dos 14 dias até à última.
  const last = rawPoints[rawPoints.length - 1];
  const windowStart = addDaysToIso(last.date, -WEIGHT_TREND_WINDOW_DAYS);
  const windowPts = rawPoints.filter(p => p.date >= windowStart);
  const pointsInWindow = windowPts.length;
  const spanDays = daysBetween(windowPts[0].date, last.date);
  const sufficient = pointsInWindow >= WEIGHT_TREND_MIN_POINTS && spanDays >= WEIGHT_TREND_MIN_SPAN_DAYS;

  let trend: WeightTrendLabel | null = null;
  let weeklyRate: number | null = null;

  if (sufficient) {
    // Mínimos quadrados com x = dias desde a primeira pesagem da janela.
    // spanDays ≥ 10 garante variância de x > 0 (há pelo menos duas datas).
    const xs = windowPts.map(p => daysBetween(windowPts[0].date, p.date));
    const ys = windowPts.map(p => p.weight);
    const n = xs.length;
    const mx = xs.reduce((s, x) => s + x, 0) / n;
    const my = ys.reduce((s, y) => s + y, 0) / n;
    let sxy = 0;
    let sxx = 0;
    for (let i = 0; i < n; i++) {
      sxy += (xs[i] - mx) * (ys[i] - my);
      sxx += (xs[i] - mx) * (xs[i] - mx);
    }
    const slopePerDay = sxy / sxx;
    const rounded = Math.round(slopePerDay * 7 * 100) / 100;
    weeklyRate = rounded === 0 ? 0 : rounded; // sem "−0"
    if (weeklyRate < -STABLE_BAND_KG_WEEK) trend = 'descendo';
    else if (weeklyRate > STABLE_BAND_KG_WEEK) trend = 'subindo';
    else trend = 'estavel';
  }

  return { movingAverage, trend, weeklyRate, isEWMASmoothing, sufficient, spanDays, pointsInWindow };
}
