import React, { useState, useMemo } from 'react';
import { ChevronDown, BarChart2 } from 'lucide-react';
import CrossMetricsChart from './CrossMetricsChart';
import AnalysisAlert from './AnalysisAlert';
import { calculateCrossMetrics, getVDOTTrend, calculateWeightTrend } from '../../utils/biEngine';
import { todayISO } from '../../lib/utils';

// O5 (2026-10-04): a pesagem só serve a uma corrida se for do mesmo período —
// ±7 dias. Mais longe, o peso já não é "o dela" e o ponto fica de fora.
const MAX_WEIGHING_GAP_DAYS = 7;
// O6: o alerta só fala com semanas FECHADAS e com RPE registado de verdade.
const MIN_CLOSED_WEEKS_WITH_RPE = 3;

// Vírgula decimal pt-PT.
function fmtDec(n, casas = 1) {
  return Number(n).toFixed(casas).replace('.', ',');
}

const MS_DAY = 86400000;
function utcDay(iso) {
  return Date.parse(`${iso}T00:00:00Z`);
}
function daysApart(aISO, bISO) {
  return Math.abs(utcDay(aISO) - utcDay(bISO)) / MS_DAY;
}
// Segunda-feira (ISO) da semana de `iso` — as semanas da série cruzada são
// identificadas pela segunda-feira (crossMetrics.ts).
function mondayOf(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  const dow = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  return d.toISOString().slice(0, 10);
}

/**
 * Pesagem mais próxima de `dateISO`, em DIAS reais (empate: a mais antiga, a
 * primeira da série), no máximo `maxDays`. Sem pesagem nessa janela: null.
 * Antes isto usava localeCompare, que devolve -1/0/1 e não uma distância —
 * e por isso escolhia sempre a 1.ª pesagem de sempre (O5).
 */
export function closestWeighing(points, dateISO, maxDays = MAX_WEIGHING_GAP_DAYS) {
  let best = null;
  let bestGap = Infinity;
  for (const p of points || []) {
    if (!p?.date || !(p.weight > 0)) continue;
    const gap = daysApart(p.date, dateISO);
    if (gap < bestGap) { best = p; bestGap = gap; }
  }
  return best && bestGap <= maxDays ? best : null;
}

export default function CrossAnalysisSection({ runs, gymSessions, meals, bodyAssessments }) {
  const [open, setOpen] = useState(false);

  const crossData = useMemo(() =>
    calculateCrossMetrics(runs || [], gymSessions || [], meals || [], bodyAssessments || [], 'mes'),
    [runs, gymSessions, meals, bodyAssessments]
  );

  const vdotTrend = useMemo(() => getVDOTTrend(runs || []), [runs]);
  const weightTrend = useMemo(() => calculateWeightTrend(bodyAssessments || []), [bodyAssessments]);

  // Build VDOT vs Weight data for PerformanceCompass chart.
  // O5 (2026-10-04): pesagens REAIS (rawPoints, não a série suavizada), a
  // pesagem mais próxima em dias e a ≤7 dias; sem pesagem nessa janela o
  // ponto fica de fora em vez de herdar um peso de há meses.
  const vdotVsWeightData = useMemo(() => {
    const weighings = weightTrend?.rawPoints?.length ? weightTrend.rawPoints : weightTrend?.movingAverage;
    if (!vdotTrend?.length || !weighings?.length) return [];
    return vdotTrend.map(v => {
      const w = closestWeighing(weighings, v.date);
      return { date: v.date, left: w?.weight || null, right: v.vdot };
    }).filter(d => d.left && d.right);
  }, [vdotTrend, weightTrend]);

  // O6 (2026-10-04): semanas com RPE registado de verdade. Sem nenhum RPE (ou
  // sem ginásio com carga) o gráfico não aparece — um RPE assumido a 5 e um
  // 0 nas semanas sem corrida davam "Boa Gestão… Continua assim!" a quem nunca
  // registou esforço.
  const gymRunSeries = useMemo(() => crossData.gymLoadVsRunRPE || [], [crossData]);
  const weeksWithRpe = useMemo(() => gymRunSeries.filter(d => d.runRPE != null), [gymRunSeries]);
  const hasRpe = weeksWithRpe.length > 0;
  const hasGymLoad = gymRunSeries.some(d => d.gymVolume > 0);
  // A semana em curso ainda não acabou: não conta para o alerta.
  const closedWeeksWithRpe = useMemo(() => {
    const currentMonday = mondayOf(todayISO());
    return weeksWithRpe.filter(d => d.date < currentMonday);
  }, [weeksWithRpe]);

  // Auto-analysis for Gym vs Run.
  // Revisão 2026-10-04: "faltam semanas" e "há semanas mas nada a assinalar"
  // são coisas diferentes. Antes ambos davam null e caíam no texto "Só tenho
  // N semanas…" — com 3 semanas e RPE moderado dizia-se "só tenho 3, com 3
  // digo-te", uma contradição. Agora: sem semanas que cheguem → { enough:false };
  // com semanas e sem veredicto → nota factual neutra (neutral), nunca "continua
  // assim" nem "interferência" sem sinal.
  const gymRunAnalysis = useMemo(() => {
    // Só com ≥3 semanas fechadas com RPE real (O6): menos que isso não é
    // padrão, é ruído — e não se diz "continua assim" sobre ruído.
    if (closedWeeksWithRpe.length < MIN_CLOSED_WEEKS_WITH_RPE) return { enough: false };
    const recent = closedWeeksWithRpe.slice(-4);
    const avgGym = recent.reduce((s, d) => s + (d.gymVolume || 0), 0) / recent.length;
    const avgRPE = recent.reduce((s, d) => s + (d.runRPE || 0), 0) / recent.length;
    if (avgGym > 5000 && avgRPE > 7) {
      return { enough: true, verdict: { title: 'Interferência Ginásio → Corrida', desc: 'O volume de ginásio elevado das últimas semanas coincide com um esforço percebido alto nas corridas. Reduz o volume de força antes das sessões de corrida de qualidade.', severity: 'warning' } };
    } else if (avgGym > 0 && avgRPE < 6) {
      return { enough: true, verdict: { title: 'Boa Gestão da Carga Cruzada', desc: 'O teu volume de ginásio e o esforço nas corridas estão bem equilibrados. Continua assim!', severity: 'success' } };
    }
    const n = recent.length;
    const semanas = `${n} ${n === 1 ? 'semana fechada' : 'semanas fechadas'}`;
    const neutral = avgGym === 0
      ? `Nas últimas ${semanas} com RPE registado não houve treino de ginásio com carga, por isso não há cruzamento a fazer.`
      : `Nas últimas ${semanas} com RPE registado, o esforço médio das corridas foi ${fmtDec(avgRPE, 1)} e o ginásio ${fmtDec(Math.round(avgGym), 0).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0')} kg por semana — sem sinal claro de interferência.`;
    return { enough: true, neutral };
  }, [closedWeeksWithRpe]);

  return (
    <div className="bg-[var(--surface-glass)] backdrop-blur-[20px] border border-white/60 rounded-2xl shadow-[0_8px_20px_rgba(0,0,0,0.2)] overflow-hidden">
      {/* Toggle button */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full min-h-[44px] flex items-center justify-between px-4 py-3 hover:bg-[var(--surface-glass)] transition"
      >
        <div className="flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-[var(--run)]" />
          <span className="text-sm font-bold text-white">Análise Cruzada</span>
          <span className="text-[11px] text-[var(--text-3)] font-medium ml-1">Interações entre pilares</span>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-[var(--text-3)] transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Expandable content */}
      <div className={`grid transition-all duration-300 ease-in-out ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="overflow-hidden">
          <div className="px-4 pb-4 space-y-4 pt-2 border-t border-[var(--border-glass)]">

            {/* Weight vs VDOT */}
            {vdotVsWeightData.length > 0 ? (
              <>
                <CrossMetricsChart
                  title="Eficiência Aeróbica vs. Peso"
                  helpText="Mostra se perder peso está a melhorar o teu VDOT (capacidade aeróbica). Uma descida de peso com VDOT a subir é o sinal ideal de recomposição corporal eficaz para o corredor."
                  leftData={{
                    label: 'Peso (kg)',
                    data: vdotVsWeightData.map(d => ({ x: d.date, y: d.left })),
                    color: '#ff5fa8', // --body
                    unit: 'kg'
                  }}
                  rightData={{
                    label: 'VDOT',
                    data: vdotVsWeightData.map(d => ({ x: d.date, y: d.right })),
                    color: '#2ee0ff', // --run
                    unit: ''
                  }}
                />
              </>
            ) : (
              <div className="bg-[var(--surface-glass)] border border-[var(--border-glass)] rounded-xl p-4 text-center">
                <p className="text-xs text-[var(--text-3)]">Preciso de corridas com tempo e de uma pesagem a, no máximo, 7 dias de cada uma para cruzar Peso e VDOT.</p>
              </div>
            )}

            {/* Gym vs Run RPE */}
            {hasRpe && hasGymLoad ? (
              <>
                <CrossMetricsChart
                  title="Impacto do Ginásio na Corrida"
                  helpText="Cruza o volume de ginásio (kg levantados) com o esforço percebido (RPE) nas corridas da mesma semana. As semanas sem RPE registado ficam em branco. Um RPE alto nas semanas de muito ginásio pode indicar fadiga central acumulada."
                  leftData={{
                    label: 'Volume Ginásio (kg)',
                    data: gymRunSeries.map(d => ({ x: d.date, y: d.gymVolume })),
                    color: '#9ec3d2', // --gym (era #facc15, amarelo reservado ao âmbar da prova)
                    unit: 'kg'
                  }}
                  rightData={{
                    label: 'Esforço Corrida (RPE)',
                    data: gymRunSeries.map(d => ({ x: d.date, y: d.runRPE })),
                    color: '#2ee0ff', // --run
                    unit: 'RPE'
                  }}
                />
                {gymRunAnalysis.verdict ? (
                  <AnalysisAlert title={gymRunAnalysis.verdict.title} desc={gymRunAnalysis.verdict.desc} severity={gymRunAnalysis.verdict.severity} />
                ) : gymRunAnalysis.enough ? (
                  <p className="text-[11px] text-[var(--text-3)] px-1" data-testid="cross-rpe-neutral">
                    {gymRunAnalysis.neutral}
                  </p>
                ) : (
                  <p className="text-[11px] text-[var(--text-3)] px-1" data-testid="cross-rpe-calibrating">
                    {closedWeeksWithRpe.length === 0
                      ? 'Ainda não tenho nenhuma semana fechada com RPE registado.'
                      : `Só tenho ${closedWeeksWithRpe.length} ${closedWeeksWithRpe.length === 1 ? 'semana fechada' : 'semanas fechadas'} com RPE registado.`}
                    {' '}Com {MIN_CLOSED_WEEKS_WITH_RPE} digo-te como o ginásio pesa nas corridas.
                  </p>
                )}
              </>
            ) : (
              <div className="bg-[var(--surface-glass)] border border-[var(--border-glass)] rounded-xl p-4 text-center" data-testid="cross-rpe-empty">
                <p className="text-xs text-[var(--text-3)]">
                  {!hasRpe && !hasGymLoad
                    ? 'Para cruzar ginásio e corrida preciso, nos últimos 30 dias, de treinos de ginásio com carga e do esforço (RPE) das corridas. Regista o RPE ao fechar cada corrida.'
                    : !hasRpe
                      ? 'Tenho treinos de ginásio, mas nenhuma corrida nos últimos 30 dias com RPE registado. Regista o esforço (RPE) ao fechar cada corrida para ver o impacto.'
                      : 'Tenho o RPE das corridas, mas nenhum treino de ginásio com carga nos últimos 30 dias. Regista a carga dos treinos de força para ver o impacto.'}
                </p>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
