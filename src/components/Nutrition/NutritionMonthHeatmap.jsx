import React, { useCallback, useMemo } from 'react';
import { GOAL_KEY, hasRecord } from '@formulas/nutritionPeriod.ts';
import { addDaysISO } from '@formulas/calendarPeriod.ts';
import NutritionChartCard, {
  DetailRow, INCOMPLETE_READOUT, IncompleteMark, LegendItem, StatusIcon, StatusWord, ViewButton, enterStyle, swatch, usePeriodPick, useRovingRadios,
} from './NutritionChartCard';
import { DeltaVsPrevious, countOf } from '../BI/period';
import { DAY_STATUS_STYLE, NUTRIENT_META } from '../../utils/nutrition';
import { dayLong, dayShort, fmtInt, isoParts, MONTHS_LONG, trainingText, WD_LETTER } from './nutritionText';

/**
 * "<Macro> no mês" — o mapa de calor do mock-up aprovado (ecrãs "Mês ·
 * setembro 2026, fechado" e "Mês · outubro 2026, em curso", 2026-10-04): um
 * quadrado por dia com Dentro / Abaixo / Acima / Sem registo (ícone + cor; o
 * Acima às riscas, para não depender só da cor), o ponto do dia de treino, e
 * o detalhe do dia escolhido com "Ver dia". Hoje não tem estado (ainda não
 * acabou) e os dias que ainda não chegaram ficam apagados.
 *
 * ‹ › não remonta o mapa (D4, revisão de 2026-10-04): cada quadrado tem chave
 * pelo dia do mês, e o estado muda de cor numa transição de 300 ms.
 *
 * Um dia marcado como incompleto (2026-10-06, `state: 'incomplete'`) fica fora
 * das contas: escolhe-se (para o "Ver dia"), mas o quadrado é neutro e
 * tracejado, com uma marca em vez do ícone de estado — nunca a cor de um estado.
 */

/* Os dias do mapa de calor medem ≥ 44 px (alvo de toque do projeto): num
   telemóvel de 390 px o cartão dá 7 colunas de ~43 px com 4 px de intervalo
   (1 px abaixo, reparo da verificação no browser); com 2 px de intervalo dão
   ~44,9 px. O intervalo é o mesmo no cabeçalho S T Q Q S S D e na grelha. */
const GAP = 2;
const CELL_TRANSITION = 'background-color 300ms var(--ease-out), border-color 300ms var(--ease-out)';

export default function NutritionMonthHeatmap({ view, metric, onViewDay, todayISO }) {
  const meta = NUTRIENT_META[metric];
  const sum = view.summary.byKey[metric];

  const cells = useMemo(() => view.days.map((d) => {
    const v = d.row && hasRecord(d.row, metric) ? d.row.values[metric] : null;
    const status = d.state === 'closed' ? (v == null ? 'none' : d.row.status[metric].status) : null;
    return { ...d, value: v, status };
  }), [view.days, metric]);

  // Os que se escolhem: os fechados e os marcados como incompletos.
  const closedIds = useMemo(() => cells.filter((c) => c.state === 'closed' || c.state === 'incomplete').map((c) => c.date), [cells]);
  const hasIncomplete = closedIds.length > 0 && cells.some((c) => c.state === 'incomplete');
  const fallback = useMemo(() => {
    const withData = cells.filter((c) => c.state === 'closed' && c.value != null);
    if (withData.length) return withData[withData.length - 1].date;
    const closedOnly = cells.filter((c) => c.state === 'closed');
    if (closedOnly.length) return closedOnly[closedOnly.length - 1].date;
    return closedIds[closedIds.length - 1] ?? null;
  }, [cells, closedIds]);
  const [picked, setPicked] = usePeriodPick(view.period.start);
  const sel = picked && closedIds.includes(picked) ? picked : fallback;
  // ↑/↓ = o mesmo dia da semana na linha de cima/baixo (±7 dias), se esse dia
  // se escolher; senão fica (antes do 1.º registo, hoje, o futuro).
  const vertical = useCallback((date, dir) => {
    const target = addDaysISO(date, 7 * dir);
    return closedIds.includes(target) ? target : null;
  }, [closedIds]);
  const roving = useRovingRadios(closedIds, sel, setPicked, { vertical });

  const cmp = view.compare?.byKey?.[metric];
  const monthName = MONTHS_LONG[isoParts(view.period.start)[1] - 1];

  const selCell = cells.find((c) => c.date === sel);
  let detail = null;
  if (selCell) {
    const g = Number(selCell.row?.goals?.[GOAL_KEY[metric]]) || 0;
    const train = trainingText(selCell.training);
    const cls = selCell.row?.status?.[metric];
    detail = (
      <DetailRow action={<ViewButton onClick={() => onViewDay?.(selCell.date)}>Ver dia</ViewButton>}>
        <b style={{ color: 'var(--text-2)' }}>{dayShort(selCell.date, todayISO)}</b>
        {selCell.state === 'incomplete'
          ? ` · ${INCOMPLETE_READOUT}`
          : selCell.value == null
          ? ' · sem registo'
          : <>{` · ${fmtInt(selCell.value)} de ${fmtInt(g)} ${meta.unit} · ${cls.pctLabel}% · `}<StatusWord status={cls.status} /></>}
        {train ? ` · ${train}` : ''}
      </DetailRow>
    );
  }

  const cellBase = {
    height: 44, borderRadius: 10, position: 'relative', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: 2, padding: 0, color: 'inherit',
  };

  return (
    <NutritionChartCard
      testId="nutrition-month-heatmap"
      label={`${meta.label} no mês`}
      hint={view.label.title}
      value={sum.nDays > 0 ? String(sum.daysInGoal) : '—'}
      unit={sum.nDays > 0 ? `de ${sum.nDays} ${sum.nDays === 1 ? 'dia' : 'dias'} no objetivo` : 'sem dias fechados com registo'}
      valueColor={sum.nDays > 0 ? meta.color : 'var(--text-4)'}
      delta={cmp ? (
        <DeltaVsPrevious
          current={cmp.curInPct}
          previous={cmp.prevInPct}
          previousLabel={view.compare.label}
          previousText={countOf(cmp.prevIn, cmp.prevN)}
          better="up"
        />
      ) : null}
      detail={detail}
      legend={(
        <>
          <LegendItem swatch={<StatusIcon status="ok" />}>Dentro</LegendItem>
          <LegendItem swatch={<StatusIcon status="below" />}>Abaixo</LegendItem>
          <LegendItem swatch={<StatusIcon status="above" />}>Acima</LegendItem>
          <LegendItem swatch={<StatusIcon status="none" />}>Sem registo</LegendItem>
          {hasIncomplete && <LegendItem swatch={swatch.incomplete()}>Incompleto (fora das contas)</LegendItem>}
          <LegendItem swatch={swatch.dot()}>dia de treino</LegendItem>
        </>
      )}
    >
      {(motion) => (
        <>
          <div aria-hidden="true" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: GAP, marginBottom: 6 }}>
            {WD_LETTER.map((l, i) => (
              <span key={i} style={{ textAlign: 'center', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{l}</span>
            ))}
          </div>
          <div
            role="radiogroup"
            aria-label={`Dias de ${monthName}`}
            onKeyDown={roving.onKeyDown}
            style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: GAP }}
          >
            {Array.from({ length: view.leadingBlanks }, (_, i) => <span key={`b${i}`} aria-hidden="true" />)}
            {cells.map((c, i) => {
              // Chave = dia do mês: o mesmo quadrado de um mês para o outro.
              const day = isoParts(c.date)[2];
              const anim = enterStyle(motion, i, cells.length, 'pop');
              if (c.state === 'today') {
                return (
                  <button
                    key={day}
                    type="button"
                    data-testid="month-cell"
                    data-state="today"
                    aria-label={`hoje, ${dayLong(c.date, todayISO)}, em curso — ver o dia`}
                    onClick={() => onViewDay?.(c.date)}
                    style={{ ...cellBase, background: 'transparent', border: '1px dashed var(--text-4)', ...anim }}
                  >
                    <span style={{ fontSize: 'var(--text-xs)', fontWeight: 800, color: 'var(--text-1)' }}>{day}</span>
                    <span style={{ fontSize: 'var(--text-xs)', lineHeight: 1, color: 'var(--text-4)' }}>hoje</span>
                  </button>
                );
              }
              if (c.state === 'incomplete') {
                // Marcado como incompleto: escolhe-se, mas não tem estado.
                const checked = c.date === sel;
                return (
                  <button
                    key={day}
                    ref={roving.setRef(c.date)}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    tabIndex={checked ? 0 : -1}
                    data-testid="month-cell"
                    data-state="incomplete"
                    aria-label={`${dayLong(c.date, todayISO)}: marcado como incompleto, fora das contas`}
                    onClick={() => setPicked(c.date)}
                    style={{
                      ...cellBase,
                      background: 'transparent',
                      border: '1px dashed var(--text-4)',
                      outline: checked ? `2px solid ${meta.color}` : undefined,
                      outlineOffset: checked ? 1 : undefined,
                      transition: motion.active ? CELL_TRANSITION : undefined,
                      ...anim,
                    }}
                  >
                    <span style={{ fontSize: 'var(--text-xs)', fontWeight: 800, color: 'var(--text-4)' }}>{day}</span>
                    <IncompleteMark />
                  </button>
                );
              }
              if (c.state !== 'closed') {
                // Ainda não chegou, ou antes do 1.º registo: sem nada a dizer.
                return (
                  <span
                    key={day}
                    aria-hidden="true"
                    data-testid="month-cell"
                    data-state={c.state}
                    style={{ ...cellBase, border: '1px solid var(--border-faint)', opacity: 0.4, ...anim }}
                  >
                    <span style={{ fontSize: 'var(--text-xs)', fontWeight: 800, color: 'var(--text-4)' }}>{day}</span>
                  </span>
                );
              }
              const st = DAY_STATUS_STYLE[c.status] || DAY_STATUS_STYLE.none;
              const checked = c.date === sel;
              const trained = !!c.training;
              return (
                <button
                  key={day}
                  ref={roving.setRef(c.date)}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  tabIndex={checked ? 0 : -1}
                  data-testid="month-cell"
                  data-state="closed"
                  data-status={c.status}
                  aria-label={`${dayLong(c.date, todayISO)}: ${st.long}${trained ? ', treino' : ''}`}
                  onClick={() => setPicked(c.date)}
                  style={{
                    ...cellBase,
                    background: st.bg,
                    border: c.status === 'none' ? `1px dashed ${st.bd}` : `1px solid ${st.bd}`,
                    outline: checked ? `2px solid ${meta.color}` : undefined,
                    outlineOffset: checked ? 1 : undefined,
                    transition: motion.active ? CELL_TRANSITION : undefined,
                    ...anim,
                  }}
                >
                  {trained && (
                    <span aria-hidden="true" style={{ position: 'absolute', top: 5, right: 5, width: 4, height: 4, borderRadius: 99, background: 'var(--text-3)' }} />
                  )}
                  <span style={{ fontSize: 'var(--text-xs)', fontWeight: 800, color: c.status === 'none' ? 'var(--text-4)' : 'var(--text-1)' }}>{day}</span>
                  <StatusIcon status={c.status} />
                </button>
              );
            })}
          </div>
        </>
      )}
    </NutritionChartCard>
  );
}
