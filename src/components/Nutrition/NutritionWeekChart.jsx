import React, { useMemo } from 'react';
import { GOAL_KEY, hasRecord } from '@formulas/nutritionPeriod.ts';
import NutritionChartCard, {
  DetailRow, INCOMPLETE_READOUT, IncompleteMark, LegendItem, StatusIcon, StatusWord, TrainingIcons, ViewButton, enterStyle, swatch,
  usePeriodPick, useRovingRadios,
} from './NutritionChartCard';
import { DeltaVsPrevious, STATUS_LONG, nDays } from '../BI/period';
import { NUTRIENT_META } from '../../utils/nutrition';
import { dayLong, dayShort, fmtInt, isoParts, trainingText, WD_SHORT, weekdayIdx } from './nutritionText';

/**
 * "<Macro> por dia" — a Semana do mock-up aprovado (ecrã "Semana · esta
 * semana", 2026-10-04): uma barra por dia seg–dom com a zona do objetivo
 * (90–115%; na proteína e na água só a linha "90% ou mais"), o estado e o
 * treino de cada dia, e o dia de hoje tracejado "até agora", que não conta.
 *
 * Corrige N3: eram 8 pontos (um dia a mais que a janela dos KPIs), um dia sem
 * refeições caía a 0 e o número grande era o de hoje, incompleto. Agora são
 * os 7 dias do calendário, um dia sem registo não tem barra ("–") e o número
 * grande é a média dos dias fechados com registo.
 *
 * ‹ › não remonta este gráfico (D4, revisão de 2026-10-04): cada coluna tem
 * chave pela posição (seg … dom) e é sempre um <button> (desativado quando o
 * dia não se escolhe), por isso a barra é o mesmo elemento de semana para
 * semana e só muda de altura, em 300 ms.
 *
 * Um dia marcado como incompleto (2026-10-06, `state: 'incomplete'`) fica fora
 * das contas: escolhe-se (para o "Ver dia"), mas a barra é ténue e tracejada e,
 * em vez do ícone de estado, leva uma marca neutra.
 */

const BAR_AREA = 160; // altura da coluna do valor + barra
const H = 140; // altura útil das barras
// O valor de cada dia fica numa linha PRÓPRIA por cima da área das barras (a
// zona 90–115% e a linha do objetivo nunca lá chegam: 1,15 × objetivo ≤
// H / 1,08). Colado ao topo da barra, o rótulo ficava cortado pela linha da
// zona sempre que a barra acabava perto do objetivo (2026-10-04, reparo da
// verificação no browser).
const VALUE_ROW = BAR_AREA - H;
const LAB = 68; // dia da semana, número, estado e treino por baixo

export default function NutritionWeekChart({ view, metric, onViewDay, todayISO }) {
  const meta = NUTRIENT_META[metric];
  const sum = view.summary.byKey[metric];
  const goalOf = (row) => Number(row?.goals?.[GOAL_KEY[metric]]) || 0;
  // Objetivo da zona: a média dos objetivos dos dias registados (o de cada
  // dia, F3); sem dias, o de hoje.
  const goal = sum.goal ?? (Number(view.goalsToday?.[GOAL_KEY[metric]]) || 0);

  const cols = useMemo(() => view.days.map((d) => {
    const v = d.row && hasRecord(d.row, metric) ? d.row.values[metric] : null;
    const status = d.state === 'closed' ? (v == null ? 'none' : d.row.status[metric].status) : null;
    return { ...d, value: v, status };
  }), [view.days, metric]);

  const selectable = useMemo(() => cols.filter((c) => c.state === 'closed' || c.state === 'today' || c.state === 'incomplete').map((c) => c.date), [cols]);
  // Por omissão, o último dia fechado com registo (no mock-up, sábado).
  const fallback = useMemo(() => {
    const withData = cols.filter((c) => c.state === 'closed' && c.value != null);
    if (withData.length) return withData[withData.length - 1].date;
    return selectable[selectable.length - 1] ?? null;
  }, [cols, selectable]);
  const [picked, setPicked] = usePeriodPick(view.period.start);
  const sel = picked && selectable.includes(picked) ? picked : fallback;
  const roving = useRovingRadios(selectable, sel, setPicked);

  const values = cols.filter((c) => c.value != null).map((c) => c.value);
  const maxV = Math.max(1, ...values, goal * (meta.ceiling ? 1.15 : 1)) * 1.08;
  const px = (v) => Math.max(0, Math.round((v / maxV) * H));
  const hasToday = cols.some((c) => c.state === 'today');
  const hasIncomplete = cols.some((c) => c.state === 'incomplete');
  const anyRun = cols.some((c) => c.training?.runs > 0);
  const anyGym = cols.some((c) => c.training?.gym > 0 || c.training?.classes > 0);

  const cmp = view.compare?.byKey?.[metric];
  const valueTxt = sum.avg != null ? fmtInt(sum.avg) : '—';
  const unitTxt = sum.avg != null
    ? `${meta.unit}/dia · média de ${nDays(sum.nDays)}`
    : sum.tooFew ? `${meta.unit}/dia · ${nDays(sum.nDays)}, poucos para média` : `${meta.unit}/dia · sem dias fechados com registo`;

  const selCol = cols.find((c) => c.date === sel);
  let detail = null;
  if (selCol) {
    const g = goalOf(selCol.row) || goal;
    const train = trainingText(selCol.training);
    let text;
    if (selCol.state === 'today') {
      text = selCol.value != null
        ? <><b style={{ color: 'var(--text-2)' }}>Hoje</b>, até agora: {fmtInt(selCol.value)} de {fmtInt(g)} {meta.unit} · ainda em curso</>
        : <><b style={{ color: 'var(--text-2)' }}>Hoje</b> · ainda sem registos</>;
    } else if (selCol.state === 'incomplete') {
      text = <><b style={{ color: 'var(--text-2)' }}>{dayShort(selCol.date, todayISO)}</b>{` · ${INCOMPLETE_READOUT}`}</>;
    } else if (selCol.value == null) {
      text = <><b style={{ color: 'var(--text-2)' }}>{dayShort(selCol.date, todayISO)}</b> · sem registo</>;
    } else {
      const cls = selCol.row.status[metric];
      text = (
        <>
          <b style={{ color: 'var(--text-2)' }}>{dayShort(selCol.date, todayISO)}</b>
          {` · ${fmtInt(selCol.value)} de ${fmtInt(g)} ${meta.unit} · ${cls.pctLabel}% · `}
          <StatusWord status={cls.status} />
        </>
      );
    }
    detail = (
      <DetailRow action={<ViewButton onClick={() => onViewDay?.(selCol.date)}>Ver dia</ViewButton>}>
        {text}
        {train ? ` · ${train}` : ''}
      </DetailRow>
    );
  }

  // Zona do objetivo (90–115%) ou, sem teto, a linha dos 90%.
  const band = meta.ceiling && goal > 0
    ? { bottom: LAB + px(goal * 0.9), height: Math.max(1, px(goal * 1.15) - px(goal * 0.9)) }
    : null;
  const line = goal > 0 ? (meta.ceiling ? LAB + px(goal) : LAB + px(goal * 0.9)) : null;

  return (
    <NutritionChartCard
      testId="nutrition-week-chart"
      label={`${meta.label} por dia`}
      hint={view.label.range}
      value={valueTxt}
      unit={unitTxt}
      valueColor={sum.avg != null ? meta.color : 'var(--text-4)'}
      delta={cmp ? (
        <DeltaVsPrevious current={cmp.curAvg} previous={cmp.prevAvg} previousLabel={view.compare.label} better="none" unit={meta.unit} />
      ) : null}
      detail={detail}
      legend={(
        <>
          <LegendItem swatch={swatch.square(meta.color)}>Comido</LegendItem>
          {meta.ceiling
            ? <LegendItem swatch={swatch.zone()}>Zona do objetivo (90–115%)</LegendItem>
            : <LegendItem swatch={swatch.dashLine()}>Objetivo: 90% ou mais</LegendItem>}
          {hasToday && <LegendItem swatch={swatch.today()}>Hoje, até agora</LegendItem>}
          {hasIncomplete && <LegendItem swatch={swatch.incomplete()}>Incompleto (fora das contas)</LegendItem>}
          {anyRun && <LegendItem swatch={<TrainingIcons training={{ runs: 1 }} />}>corrida</LegendItem>}
          {anyGym && <LegendItem swatch={<TrainingIcons training={{ gym: 1 }} />}>ginásio</LegendItem>}
        </>
      )}
    >
      {(motion) => (
        <div style={{ position: 'relative' }}>
          {band && (
            <span aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, bottom: band.bottom, height: band.height, background: 'rgba(255,255,255,.07)', borderRadius: 4 }} />
          )}
          {line != null && (
            <span
              aria-hidden="true"
              style={meta.ceiling
                ? { position: 'absolute', left: 0, right: 0, bottom: line, height: 1, background: 'rgba(255,255,255,.35)' }
                : { position: 'absolute', left: 0, right: 0, bottom: line, height: 0, borderTop: '1px dashed rgba(255,255,255,.45)' }}
            />
          )}
          <div
            role="radiogroup"
            aria-label="Dias da semana"
            onKeyDown={roving.onKeyDown}
            style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}
          >
            {cols.map((c, i) => {
              const isToday = c.state === 'today';
              const isIncomplete = c.state === 'incomplete';
              const canPick = c.state === 'closed' || isToday || isIncomplete;
              const checked = canPick && c.date === sel;
              const barH = c.value != null ? px(c.value) : 0;
              const wd = isToday ? 'hoje' : WD_SHORT[weekdayIdx(c.date)];
              let aria = `${isToday ? `hoje, ${dayLong(c.date, todayISO)}` : dayLong(c.date, todayISO)}: `;
              if (c.state === 'future') aria += 'ainda não chegou';
              else if (c.state === 'before') aria += 'antes do primeiro registo';
              else if (isIncomplete) aria += 'marcado como incompleto, fora das contas';
              else if (isToday) aria += c.value != null ? `até agora ${fmtInt(c.value)} ${meta.long}, em curso` : 'ainda sem registos, em curso';
              else if (c.value == null) aria += 'sem registo';
              else aria += `${fmtInt(c.value)} ${meta.long}, ${STATUS_LONG[c.status]}`;
              const train = trainingText(c.training);
              if (train) aria += `, ${train}`;
              const barStyle = isToday
                ? {
                    height: barH, borderRadius: '6px 6px 2px 2px', border: barH ? '1px dashed var(--text-4)' : 0,
                    background: 'repeating-linear-gradient(135deg, rgba(255,255,255,.10) 0 3px, transparent 3px 7px)',
                  }
                : isIncomplete
                ? {
                    // Ténue e tracejada: está lá para se ver, não conta.
                    height: barH, borderRadius: '6px 6px 2px 2px', background: meta.color,
                    border: barH ? '1px dashed var(--text-3)' : 0, opacity: 0.45,
                  }
                : {
                    height: barH, borderRadius: '6px 6px 2px 2px', background: meta.color,
                    opacity: checked ? 1 : 0.7, boxShadow: checked ? `0 0 10px ${meta.color}` : undefined,
                  };
              const body = (
                <>
                  <span style={{ height: BAR_AREA, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <span className="tabular-nums" data-testid="week-value" style={{ height: VALUE_ROW, display: 'flex', alignItems: 'center', fontSize: 'var(--text-xs)', color: isToday || isIncomplete || c.value == null ? 'var(--text-4)' : 'var(--text-3)' }}>
                      {c.value != null ? fmtInt(c.value) : c.state === 'future' ? '' : '–'}
                    </span>
                    <span style={{ height: H, display: 'flex', alignItems: 'flex-end' }}>
                      <span
                        data-testid="week-bar"
                        data-date={c.date}
                        data-state={c.state}
                        style={{ display: 'block', width: 24, transition: motion.active ? 'height 300ms var(--ease-out)' : undefined, ...barStyle, ...enterStyle(motion, i, cols.length) }}
                      />
                    </span>
                  </span>
                  <span style={{ height: LAB, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 4, gap: 1 }}>
                    <span style={{ fontSize: 'var(--text-xs)', lineHeight: '15px', color: 'var(--text-muted)' }}>{wd}</span>
                    <span style={{ fontSize: 'var(--text-xs)', lineHeight: '15px', fontWeight: 700, color: 'var(--text-3)' }}>{isoParts(c.date)[2]}</span>
                    <span style={{ height: 15, display: 'flex', alignItems: 'center' }}>
                      {c.status && <StatusIcon status={c.status} />}
                      {isIncomplete && <IncompleteMark />}
                    </span>
                    <span style={{ height: 15, display: 'flex', alignItems: 'center', gap: 2 }}>
                      <TrainingIcons training={c.training} />
                    </span>
                  </span>
                </>
              );
              const colStyle = {
                border: 0, padding: 0, borderRadius: 10, display: 'flex', flexDirection: 'column', alignItems: 'center',
                background: checked ? 'var(--surface-raised)' : 'transparent', color: 'inherit',
                opacity: c.state === 'future' || c.state === 'before' ? 0.45 : 1,
              };
              // Chave pela posição e sempre <button>: o mesmo elemento de uma
              // semana para a outra (a barra transita em vez de remontar).
              return (
                <button
                  key={i}
                  ref={canPick ? roving.setRef(c.date) : undefined}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  aria-disabled={canPick ? undefined : 'true'}
                  disabled={!canPick}
                  aria-label={aria}
                  tabIndex={checked ? 0 : -1}
                  onClick={canPick ? () => setPicked(c.date) : undefined}
                  style={colStyle}
                >
                  {body}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </NutritionChartCard>
  );
}
