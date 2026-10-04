import React from 'react';
import NutritionChartCard, { StatusIcon, enterStyle } from './NutritionChartCard';
import MetricInfo from '../BI/MetricInfo';
import { fmtNumber } from '../../utils/verdicts/shared';
import { plural } from '../BI/period';
import { NUTRIENT_META } from '../../utils/nutrition';
import { dayChip, fmtInt, isoParts, MONTHS_SHORT } from './nutritionText';

/**
 * "Comer para treinar" — o bloco do mock-up aprovado (2026-10-04, plano §3):
 * kcal/dia nos dias com e sem treino contra o traço do objetivo, a energia
 * que sobra depois do treino (EA) em média, e os dias de treino com pouca
 * energia (abaixo de 30): na semana e no mês um a um (tocar abre o dia); no
 * trimestre só a contagem.
 *
 * Só dias fechados COM refeições (N4): um dia de treino sem refeições não
 * entra como 0 kcal (dava EA negativa e o falso alarme de RED-S) — fica de
 * fora e diz-se quantos. A massa magra diz de onde vem quando não é medida.
 * O mínimo de dias (7 no mês, 14 no trimestre) decide-o quem chama
 * (MinDataNote no lugar deste cartão).
 */

const INFO = 'Compara o que comes nos dias em que treinas com os de descanso, e quanta energia sobra para o corpo depois de descontar o treino, por kg de massa magra. Abaixo de 30 é onde se começa a perder osso, hormonas e prontidão; 30 a 45 é para vigiar.';

const shortDate = (iso) => {
  const [, m, d] = isoParts(iso);
  return `${d} ${MONTHS_SHORT[m - 1]}`;
};

function eaWord(avg) {
  if (avg < 30) return 'baixa';
  if (avg < 45) return 'a vigiar';
  return 'boa';
}

/* 2026-10-04 (verificação no browser, Nutrição · «Comer para treinar»): o
   arredondamento a inteiro contradizia a classificação — 29,6 lia-se «30 …
   — baixa» com a ajuda a dizer «30 a 45 é para vigiar», e um dia de 29,6
   aparecia como «30» na lista «abaixo de 30». A classificação fica no valor
   real (o mesmo que a fórmula usa para a lista de dias); quando o inteiro
   cruzaria um limite (30 ou 45), mostra-se uma casa decimal («29,6»). */
const EA_LIMITS = [30, 45];
export function fmtEa(v) {
  const n = v == null || v === '' ? NaN : Number(v);
  if (!Number.isFinite(n)) return '—';
  const crosses = EA_LIMITS.some((t) => n < t && Math.round(n) >= t);
  return fmtNumber(n, crosses ? 1 : 0);
}

/* De onde vem a massa magra quando não é medida (N4) — e o peso do gasto da
   corrida quando a avaliação tem massa magra mas não tem peso (revisão de
   2026-10-04: aí contava 70 kg em silêncio). `hasRuns`: só se fala do peso
   da corrida quando há corridas nos dias contados. */
export function leanMassNote(ea, { hasRuns = true } = {}) {
  if (ea.leanMassSource === 'medida') {
    if (!ea.weightFallback || !hasRuns) return null;
    return `A avaliação${ea.leanMassDate ? ` de ${shortDate(ea.leanMassDate)}` : ''} não tem peso: conto com 70 kg para o gasto da corrida.`;
  }
  if (ea.leanMassSource === 'estimada') {
    return `Massa magra estimada a partir do peso e da gordura da avaliação de ${shortDate(ea.leanMassDate)}.`;
  }
  if (ea.leanMassDate && !ea.weightFallback) {
    // 2026-10-04: «Sem gordura medida» lia-se como se nunca houvesse
    // composição medida, mesmo com uma avaliação completa dias antes — o que
    // falta é na avaliação que vale para o período (a última até ao fim dele).
    return `A avaliação de ${shortDate(ea.leanMassDate)} não tem gordura medida: conto com 20% de gordura sobre o peso dela.`;
  }
  return `Sem avaliação com peso: conto com ${fmtNumber(ea.leanMass, 0)} kg de massa magra e 70 kg para o gasto da corrida — regista uma avaliação para este número ser teu.`;
}

function Row({ label, kcal, goal, motion, index }) {
  const scale = goal > 0 ? goal * 1.1 : Math.max(1, kcal || 1);
  const width = kcal != null ? Math.min(100, (kcal / scale) * 100) : 0;
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 'var(--text-sm)' }}>
        <span style={{ fontWeight: 700, color: 'var(--text-2)' }}>{label}</span>
        <span className="tabular-nums" style={{ fontWeight: 900, color: kcal != null ? 'var(--text-1)' : 'var(--text-4)' }}>
          {kcal != null ? fmtInt(kcal) : '—'} <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-4)' }}>kcal/dia</span>
        </span>
      </div>
      <div aria-hidden="true" style={{ position: 'relative', height: 8, marginTop: 6, borderRadius: 99, background: 'var(--border-hairline)' }}>
        {kcal != null && (
          <span
            style={{
              position: 'absolute', left: 0, top: 0, bottom: 0, width: `${width}%`, borderRadius: 99, background: NUTRIENT_META.calories.color,
              // Mudar de período: a barra muda de largura em 300 ms (D4), não reentra.
              transition: motion?.active ? 'width 300ms var(--ease-out)' : undefined,
              ...enterStyle(motion, index, 2, 'growX'),
            }}
          />
        )}
        {goal > 0 && <span style={{ position: 'absolute', left: `${(100 / 1.1).toFixed(1)}%`, top: -3, width: 2, height: 14, borderRadius: 1, background: 'rgba(248,250,252,.6)' }} />}
      </div>
    </div>
  );
}

export default function EatingForTraining({ view, onViewDay }) {
  const { eating, ea, kind } = view;
  const withT = eating.withTraining;
  const withoutT = eating.withoutTraining;
  const goal = eating.goalKcal || 0;
  const low = ea.lowTrainingDays || [];
  const hint = kind === 'semana' ? view.label.range : view.label.title;
  const hasRuns = (view.days || []).some((d) => d.state === 'closed' && d.training?.runs > 0);
  const leanNote = ea.nDays > 0 ? leanMassNote(ea, { hasRuns }) : null;

  return (
    <NutritionChartCard
      testId="eating-for-training"
      label="Comer para treinar"
      info={<MetricInfo text={INFO} />}
      hint={hint}
      value={withT.avgKcal != null ? fmtInt(withT.avgKcal) : '—'}
      unit={withT.avgKcal != null ? 'kcal/dia nos dias de treino' : 'sem dias de treino com refeições'}
      valueColor={withT.avgKcal != null ? NUTRIENT_META.calories.color : 'var(--text-4)'}
    >
      {(motion) => (
        <>
          <div style={{ marginTop: -6 }}>
            <Row label={`Com treino · ${withT.nDays} ${plural(withT.nDays, 'dia', 'dias')}`} kcal={withT.avgKcal} goal={goal} motion={motion} index={0} />
            <Row label={`Sem treino · ${withoutT.nDays} ${plural(withoutT.nDays, 'dia', 'dias')}`} kcal={withoutT.avgKcal} goal={goal} motion={motion} index={1} />
            {goal > 0 && (
              <p style={{ margin: '8px 0 0', fontSize: 'var(--text-xs)', color: 'var(--text-4)' }}>
                Traço vertical: objetivo de {fmtInt(goal)} kcal
              </p>
            )}
            {eating.lessOnTraining && (
              <p data-testid="eating-less-on-training" style={{ margin: '10px 0 0', fontSize: 'var(--text-sm)', lineHeight: 1.5, color: 'var(--text-2)', fontWeight: 700 }}>
                Comeste menos nos dias de treino do que nos de descanso.
              </p>
            )}
          </div>
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-hairline)' }}>
            {ea.nDays > 0 && ea.average != null ? (
              <p data-testid="eating-ea" style={{ margin: 0, fontSize: 'var(--text-sm)', lineHeight: 1.5, color: 'var(--text-3)' }}>
                Energia que sobra depois do treino: {fmtEa(ea.average)} kcal por kg de massa magra, em média — {eaWord(ea.average)}.
              </p>
            ) : (
              <p style={{ margin: 0, fontSize: 'var(--text-sm)', lineHeight: 1.5, color: 'var(--text-4)' }}>
                Sem dias com refeições para calcular a energia que sobra depois do treino.
              </p>
            )}
            {leanNote && (
              <p data-testid="eating-lean-mass" style={{ margin: '6px 0 0', fontSize: 'var(--text-xs)', lineHeight: 1.5, color: 'var(--text-4)' }}>
                {leanNote}
              </p>
            )}
            {ea.trainingDaysWithoutMeals > 0 && (
              <p style={{ margin: '6px 0 0', fontSize: 'var(--text-xs)', lineHeight: 1.5, color: 'var(--text-4)' }}>
                {ea.trainingDaysWithoutMeals} {plural(ea.trainingDaysWithoutMeals, 'dia de treino sem refeições registadas não entra', 'dias de treino sem refeições registadas não entram')}.
              </p>
            )}
            {kind === 'trimestre' || kind === 'ano' ? (
              <p data-testid="eating-low-count" style={{ margin: '10px 0 0', fontSize: 'var(--text-sm)', lineHeight: 1.5, color: 'var(--text-3)' }}>
                {low.length > 0
                  ? `Em ${low.length} ${plural(low.length, 'dia de treino', 'dias de treino')} sobrou pouca energia (abaixo de 30) — vê-os semana a semana no Mês.`
                  : 'Nenhum dia de treino ficou abaixo de 30.'}
              </p>
            ) : ea.nDays > 0 && (
              low.length > 0 ? (
                <>
                  <div style={{ marginTop: 12, fontSize: 'var(--text-xs)', fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-3)' }}>
                    Dias de treino com pouca energia (abaixo de 30)
                  </div>
                  <div data-testid="eating-low-days" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                    {low.map((d) => (
                      <button
                        key={d.date}
                        type="button"
                        onClick={() => onViewDay?.(d.date)}
                        aria-label={`${dayChip(d.date)}: ${fmtEa(d.ea)} kcal por kg de massa magra — ver o dia`}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 'var(--tap)', padding: '0 12px',
                          borderRadius: 9999, background: 'var(--surface-raised)', border: '1px solid var(--border-glass)',
                          fontSize: 'var(--text-sm)', color: 'inherit',
                        }}
                      >
                        <StatusIcon status="below" />
                        <span style={{ fontWeight: 700, color: 'var(--text-1)' }}>{dayChip(d.date)}</span>
                        <span className="tabular-nums" style={{ color: 'var(--text-3)' }}>{fmtEa(d.ea)}</span>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <p data-testid="eating-low-count" style={{ margin: '10px 0 0', fontSize: 'var(--text-sm)', lineHeight: 1.5, color: 'var(--text-3)' }}>
                  Nenhum dia de treino ficou abaixo de 30.
                </p>
              )
            )}
          </div>
        </>
      )}
    </NutritionChartCard>
  );
}
