import React, { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { GOAL_KEY } from '@formulas/nutritionPeriod.ts';
import NutritionChartCard, {
  DetailRow, LegendItem, StatusIcon, StatusWord, ViewButton, enterStyle, swatch, usePeriodPick, useRovingRadios,
} from './NutritionChartCard';
import { DeltaVsPrevious, MinDataNote, countOf, nDays, plural, scopeOf } from '../BI/period';
import { WEEKDAY_MIN, WEEKDAY_MIN_DAYS } from '../../store/evolution/views/nutrition';
import { capitalize } from '../../utils/verdicts/shared';
import { DAY_STATUS_STYLE, NUTRIENT_META } from '../../utils/nutrition';
import { fmtInt, isoParts, MONTHS_SHORT, rangeText, WD_ON, WD_PLURAL, WD_SHORT, weekdayCount, wherePast } from './nutritionText';

/**
 * O Trimestre do mock-up aprovado (ecrãs "Trimestre · jul – set 2026,
 * fechado" e "… out – dez 2026, em curso", 2026-10-04):
 *   1. "<Macro> por semana" — média por dia de cada semana (a semana em curso
 *      só com os dias fechados, marcada), com a zona do objetivo;
 *   2. "Dias no objetivo por semana" — Dentro/Abaixo/Acima/Sem registo
 *      empilhados (0 a 7 dias);
 *   3. "<Macro> por dia da semana" — com pelo menos 4 registos em 5 dos 7 dias
 *      da semana (2026-10-05, limiares N4: antes exigia os 7, e um domingo por
 *      registar escondia o gráfico até no Ano). Os dias com menos de 4 registos
 *      aparecem a cinzento ("dom · 2 registos") e não contam para o "dia mais
 *      baixo"; senão, a frase diz onde estão os dados.
 * A semana escolhida é a mesma nos dois primeiros, e "Ver semana" abre-a.
 *
 * ‹ › não remonta estes gráficos (D4, revisão de 2026-10-04): colunas com
 * chave pela posição e sempre <button> (desativado quando a semana não se
 * escolhe), e as barras mudam de altura em 300 ms.
 *
 * Alvos de toque: 13–14 semanas num cartão de telemóvel dão colunas de
 * ~22–24 px, e não há forma de pôr 14 alvos de 44 px lado a lado em 326 px (nem
 * de os sobrepor sem tocar na semana errada). Cada coluna continua a ser um
 * botão da altura do gráfico inteiro e da largura TODA da sua fatia (sem
 * intervalos mortos entre colunas), e as setas do teclado também escolhem — e
 * por baixo de cada gráfico há «‹ Anterior» e «Seguinte ›» de 44 px (WeekStepper):
 * chegar a qualquer semana nunca depende de acertar numa coluna estreita
 * (2026-10-04, reparo da verificação no browser: botões de 23 px).
 */

const H = 132; // altura útil das barras
const PLOT = 140; // altura da área das barras
const LAB = 42; // marca da semana escolhida + estado + mês, por baixo
const DAY_PX = 20; // dias no objetivo: 20 px por dia (7 dias = 140 px)

/* O mês por baixo da 1.ª semana e da semana que contém o dia 1 de cada mês
   (mock-up: "jul", "ago", "set"). As semanas vêm cortadas ao trimestre. */
function monthLabels(weeks) {
  return weeks.map((w, i) => {
    const [, sm, sd] = isoParts(w.start);
    const [, em] = isoParts(w.end);
    if (i === 0 || sd === 1) return MONTHS_SHORT[sm - 1];
    return em !== sm ? MONTHS_SHORT[em - 1] : '';
  });
}

/** «‹ Anterior» / «Seguinte ›» entre as semanas escolhíveis — alvos de 44 px.
 * `scope` distingue os dois pares no mesmo ecrã para quem usa leitor de ecrã
 * (revisão 2026-10-04: tinham o mesmo nome acessível). */
function WeekStepper({ ids, selected, onSelect, testId, scope }) {
  const i = ids.indexOf(selected);
  const prev = i > 0 ? ids[i - 1] : null;
  const next = i >= 0 && i < ids.length - 1 ? ids[i + 1] : null;
  const btn = (disabled) => ({
    flex: 1,
    minHeight: 'var(--tap)',
    borderRadius: 11,
    border: '1px solid var(--border-hairline)',
    background: 'var(--surface-dim)',
    color: 'var(--text-2)',
    fontSize: 'var(--text-sm)',
    fontWeight: 700,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    opacity: disabled ? 0.35 : 1,
  });
  return (
    <div data-testid={testId} style={{ display: 'flex', gap: 8, marginTop: 8 }}>
      <button type="button" aria-label={`Semana anterior do trimestre — ${scope}`} disabled={prev == null} onClick={() => prev != null && onSelect(prev)} style={btn(prev == null)}>
        <ChevronLeft size={16} aria-hidden="true" />
        Anterior
      </button>
      <button type="button" aria-label={`Semana seguinte do trimestre — ${scope}`} disabled={next == null} onClick={() => next != null && onSelect(next)} style={btn(next == null)}>
        Seguinte
        <ChevronRight size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

function weekTitle(w, todayISO) {
  return rangeText(w.start, w.end, todayISO);
}

/**
 * O lugar do gráfico por dia da semana quando ainda não há registos que o
 * sustentem (N4, 2026-10-05): diz quantos dias da semana já cumprem e, se o
 * período anterior já o abre, oferece-o ("Ver jul – set ›"). `goPrev` diz ao
 * ecrã que a ação é ir ao período anterior.
 */
export function weekdayMinNoteProps(view, metric, todayISO) {
  const meta = NUTRIENT_META[metric];
  const strong = view.weekdays?.[metric]?.strong ?? 0;
  const p = view.period;
  const where = p.isCurrent ? scopeOf(view.kind) : wherePast(view.kind, p.start, todayISO, view.offset);
  const base = `${meta.label} por dia da semana: preciso de ${WEEKDAY_MIN} registos em pelo menos ${WEEKDAY_MIN_DAYS} dos 7 dias da semana`;
  // Diz o que é que se conta ("dias da semana que lá chegam"), não um "nenhum"/"há 2"
  // solto que o leitor não sabe a que se refere (revisão 2026-10-05).
  const have = strong === 0
    ? (p.isCurrent ? 'ainda nenhum dia da semana lá chega' : 'nenhum dia da semana lá chegou')
    : p.isCurrent
      ? `só ${strong} ${strong === 1 ? 'dia da semana lá chega' : 'dias da semana lá chegam'}`
      : `só ${strong} ${strong === 1 ? 'dia da semana lá chegou' : 'dias da semana lá chegaram'}`;
  const prev = view.previousData;
  if (p.isCurrent && prev && (prev.weekdayStrong?.[metric] ?? 0) >= WEEKDAY_MIN_DAYS) {
    return { text: `${base} — ${where} ${have}. Em ${prev.name} já dá:`, actionLabel: `Ver ${prev.name}`, goPrev: true };
  }
  return { text: `${base} — ${where} ${have}.` };
}

function WeekdayMinNote({ view, metric, todayISO, onViewPrevious }) {
  const { goPrev, ...note } = weekdayMinNoteProps(view, metric, todayISO);
  return <MinDataNote {...note} onAction={goPrev ? onViewPrevious : undefined} />;
}

export default function NutritionQuarterCharts({ view, metric, onViewWeek, onViewPrevious, todayISO }) {
  const meta = NUTRIENT_META[metric];
  const sum = view.summary.byKey[metric];
  const weeks = view.weeks || [];
  const cmp = view.compare?.byKey?.[metric];

  const selectable = useMemo(() => weeks.filter((w) => !w.future && !w.beforeData).map((w) => w.weekStart), [weeks]);
  // Por omissão a última semana com dias fechados (no mock-up, 28 – 30 set).
  const fallback = useMemo(() => {
    const withDays = weeks.filter((w) => !w.future && !w.beforeData && w.closedDays > 0);
    return (withDays[withDays.length - 1] || weeks.filter((w) => !w.future && !w.beforeData).pop())?.weekStart ?? null;
  }, [weeks]);
  const periodKey = `${view.kind}:${view.period.start}`;
  const [picked, setPicked] = usePeriodPick(periodKey);
  const sel = picked && selectable.includes(picked) ? picked : fallback;
  const rovingA = useRovingRadios(selectable, sel, setPicked);
  const rovingB = useRovingRadios(selectable, sel, setPicked);
  const months = useMemo(() => monthLabels(weeks), [weeks]);

  const stats = weeks.map((w) => w.perKey[metric]);
  // A média dos objetivos dos dias registados (o de cada dia, F3); sem dias, o de hoje.
  const goal = sum.goal ?? (Number(view.goalsToday?.[GOAL_KEY[metric]]) || 0);
  const values = stats.filter((s) => s.avg != null).map((s) => s.avg);
  const maxV = Math.max(1, ...values, goal * (meta.ceiling ? 1.15 : 1)) * 1.08;
  const px = (v) => Math.max(0, Math.round((v / maxV) * H));
  const selWeek = weeks.find((w) => w.weekStart === sel);
  const selStats = selWeek?.perKey[metric];
  const anyBefore = weeks.some((w) => w.beforeData && !w.future);
  const anyProgress = weeks.some((w) => w.inProgress);
  const cols = `repeat(${Math.max(1, weeks.length)}, minmax(0, 1fr))`;
  // Altura das barras: muda em 300 ms ao mudar de período (mesmos elementos).
  const heightTransition = (motion) => (motion.active ? 'height 300ms var(--ease-out)' : undefined);

  // ── 1. Média por semana ────────────────────────────────────────────────
  let detailA = null;
  if (selWeek && selStats) {
    const title = weekTitle(selWeek, todayISO);
    let text;
    if (selWeek.inProgress) {
      text = <><b style={{ color: 'var(--text-2)' }}>{title}</b>{` · em curso · ${nDays(selWeek.closedDays)} ${selWeek.closedDays === 1 ? 'fechado' : 'fechados'}${selStats.avg != null ? ` · ${fmtInt(selStats.avg)} ${meta.unit}/dia` : ''}`}</>;
    } else if (selStats.avg == null) {
      text = <><b style={{ color: 'var(--text-2)' }}>{title}</b> · sem registos</>;
    } else {
      text = (
        <>
          <b style={{ color: 'var(--text-2)' }}>{`${title} (${nDays(selStats.nDays)})`}</b>
          {` · ${fmtInt(selStats.avg)} ${meta.unit}/dia · ${selStats.pctLabel}% · `}
          <StatusWord status={selStats.status} />
          {` · ${countOf(selStats.ok, selStats.nDays)} ${selStats.nDays === 1 ? 'dia' : 'dias'} no objetivo`}
        </>
      );
    }
    detailA = (
      <DetailRow testId="quarter-week-detail" action={<ViewButton onClick={() => onViewWeek?.(selWeek.weekStart)}>Ver semana</ViewButton>}>
        {text}
      </DetailRow>
    );
  }

  const band = meta.ceiling && goal > 0 ? { bottom: LAB + px(goal * 0.9), height: Math.max(1, px(goal * 1.15) - px(goal * 0.9)) } : null;
  const line = goal > 0 ? LAB + px(meta.ceiling ? goal : goal * 0.9) : null;

  const weekAria = (w, s) => {
    const title = weekTitle(w, todayISO);
    if (w.future) return `${title}: ainda não chegou`;
    if (w.beforeData) return `${title}: antes do primeiro registo`;
    if (s.avg == null) return `${title}: sem registos`;
    const st = DAY_STATUS_STYLE[s.status];
    return `${title}${w.inProgress ? ', em curso' : ''}: ${fmtInt(s.avg)} ${meta.long} por dia${st ? `, ${st.long}` : ''}, ${s.ok} de ${s.nDays} ${s.nDays === 1 ? 'dia' : 'dias'} no objetivo`;
  };

  // ── 3. Por dia da semana ───────────────────────────────────────────────
  const wk = view.weekdays?.[metric];
  const wdDays = wk?.days || [];
  // Só os dias com registos que cheguem (≥ 4) contam para o "dia mais baixo" e
  // para o objetivo médio; os outros desenham-se a cinzento.
  const wdStrong = wdDays.map((d, i) => (d && !d.thin ? i : null)).filter((i) => i != null);
  const lowest = wk?.shown ? wdStrong.reduce((best, i) => (best == null || wdDays[i].avg < wdDays[best].avg ? i : best), null) : null;
  const [pickedWd, setPickedWd] = usePeriodPick(periodKey);
  // Só os dias com registos entram no roving: os vazios estão `disabled` e, se
  // ficassem na lista, a seta parava neles e nunca passava adiante (revisão 2026-10-05).
  const wdIdsKey = wdDays.map((d, i) => (d ? i : null)).filter((i) => i != null).join(',');
  const wdIds = useMemo(() => (wdIdsKey ? wdIdsKey.split(',').map(Number) : []), [wdIdsKey]);
  const selWdRaw = pickedWd ?? lowest;
  const selWd = selWdRaw != null && wdDays[selWdRaw] ? selWdRaw : lowest;
  const rovingC = useRovingRadios(wdIds, selWd, setPickedWd);
  const wdGoal = wk?.shown ? wdStrong.reduce((sum, i) => sum + (wdDays[i].goal || 0), 0) / Math.max(1, wdStrong.length) : goal;
  const wdValues = wk?.shown ? wdDays.filter(Boolean).map((d) => d.avg) : [];
  const wdMax = Math.max(1, ...wdValues, wdGoal * (meta.ceiling ? 1.15 : 1)) * 1.08;
  const wpx = (v) => Math.max(0, Math.round((v / wdMax) * 140));
  const anyThin = wdDays.some((d) => d && d.thin);

  return (
    <>
      <NutritionChartCard
        testId="nutrition-quarter-weeks"
        label={`${meta.label} por semana`}
        hint={view.label.title}
        value={sum.avg != null ? fmtInt(sum.avg) : '—'}
        unit={sum.avg != null ? `${meta.unit}/dia · média de ${nDays(sum.nDays)}` : `${meta.unit}/dia · sem dias fechados com registo`}
        valueColor={sum.avg != null ? meta.color : 'var(--text-4)'}
        delta={cmp ? (
          <DeltaVsPrevious current={cmp.curAvg} previous={cmp.prevAvg} previousLabel={view.compare.label} better="none" unit={meta.unit} />
        ) : view.firstPeriod && !view.period.isCurrent ? <span style={{ color: 'var(--text-4)' }}>Primeiro trimestre</span> : null}
        detail={detailA}
        legend={(
          <>
            <LegendItem swatch={swatch.square(meta.color)}>Média por dia, nessa semana</LegendItem>
            {meta.ceiling
              ? <LegendItem swatch={swatch.zone()}>Zona do objetivo (90–115%)</LegendItem>
              : <LegendItem swatch={swatch.dashLine()}>Objetivo: 90% ou mais</LegendItem>}
            {anyBefore && <LegendItem swatch={swatch.stub()}>Antes do primeiro registo</LegendItem>}
            {anyProgress && <LegendItem swatch={<span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 2, border: `1px dashed ${meta.color}`, flexShrink: 0 }} />}>Semana em curso, só dias fechados</LegendItem>}
          </>
        )}
      >
        {(motion) => (
          <>
          <div style={{ position: 'relative' }}>
            {band && <span aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, bottom: band.bottom, height: band.height, borderRadius: 4, background: 'rgba(255,255,255,.07)' }} />}
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
              aria-label="Semanas do trimestre — toca para escolher"
              onKeyDown={rovingA.onKeyDown}
              style={{ position: 'relative', display: 'grid', gridTemplateColumns: cols }}
            >
              {weeks.map((w, i) => {
                const s = stats[i];
                const can = selectable.includes(w.weekStart);
                const checked = can && w.weekStart === sel;
                let bar;
                if (w.future) bar = null;
                else if (w.beforeData || s.avg == null) {
                  bar = <span style={{ display: 'block', width: '100%', height: 4, borderRadius: 2, background: w.beforeData ? 'rgba(255,255,255,.06)' : 'transparent', border: w.beforeData ? 0 : '1px dashed rgba(255,255,255,.22)' }} />;
                } else {
                  bar = (
                    <span
                      data-testid="quarter-week-bar"
                      style={{
                        display: 'block', width: '100%', height: px(s.avg), borderRadius: '4px 4px 1px 1px',
                        background: w.inProgress ? `color-mix(in srgb, ${meta.color} 35%, transparent)` : meta.color,
                        border: w.inProgress ? `1px dashed ${meta.color}` : 0,
                        opacity: checked ? 1 : 0.55,
                        boxShadow: checked ? `0 0 8px ${meta.color}` : undefined,
                        transition: heightTransition(motion),
                        ...enterStyle(motion, i, weeks.length),
                      }}
                    />
                  );
                }
                const body = (
                  <>
                    <span style={{ height: PLOT, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', width: '100%' }}>{bar}</span>
                    <span style={{ height: 3, marginTop: 4, width: '100%', borderRadius: 2, background: checked ? 'var(--text-1)' : 'transparent' }} />
                    <span style={{ height: 12, marginTop: 4, display: 'flex', justifyContent: 'center' }}>
                      {!w.future && !w.beforeData && s.status && <StatusIcon status={s.status} />}
                    </span>
                    <span style={{ height: 15, marginTop: 4, fontSize: 'var(--text-xs)', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'visible' }}>{months[i]}</span>
                  </>
                );
                // Sem intervalo entre colunas: a margem de 1 px fica DENTRO do
                // botão, que ocupa a fatia inteira (alvo de toque, ver acima).
                const style = { border: 0, padding: '0 1px', background: 'transparent', color: 'inherit', display: 'flex', flexDirection: 'column', alignItems: 'stretch', minWidth: 0 };
                return (
                  <button
                    key={i}
                    ref={can ? rovingA.setRef(w.weekStart) : undefined}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    aria-disabled={can ? undefined : 'true'}
                    disabled={!can}
                    tabIndex={checked ? 0 : -1}
                    aria-label={weekAria(w, s)}
                    onClick={can ? () => setPicked(w.weekStart) : undefined}
                    style={style}
                  >
                    {body}
                  </button>
                );
              })}
            </div>
          </div>
          <WeekStepper ids={selectable} selected={sel} onSelect={setPicked} testId="quarter-week-stepper" scope="média por semana" />
          </>
        )}
      </NutritionChartCard>

      <NutritionChartCard
        testId="nutrition-quarter-days"
        label="Dias no objetivo por semana"
        hint={`${meta.label} · ${view.label.title}`}
        value={sum.nDays > 0 ? String(sum.daysInGoal) : '—'}
        unit={sum.nDays > 0 ? `de ${sum.nDays} ${sum.nDays === 1 ? 'dia' : 'dias'} no objetivo` : 'sem dias fechados com registo'}
        valueColor={sum.nDays > 0 ? meta.color : 'var(--text-4)'}
        delta={cmp ? (
          <DeltaVsPrevious current={cmp.curInPct} previous={cmp.prevInPct} previousLabel={view.compare.label} previousText={countOf(cmp.prevIn, cmp.prevN)} better="up" />
        ) : null}
        detail={selWeek && selStats ? (
          <DetailRow testId="quarter-days-detail" action={<ViewButton onClick={() => onViewWeek?.(selWeek.weekStart)}>Ver semana</ViewButton>}>
            <b style={{ color: 'var(--text-2)' }}>{weekTitle(selWeek, todayISO)}</b>
            {(() => {
              const parts = [];
              if (selStats.ok) parts.push(`${selStats.ok} dentro`);
              if (selStats.below) parts.push(`${selStats.below} abaixo`);
              if (selStats.above) parts.push(`${selStats.above} acima`);
              if (selStats.none) parts.push(`${selStats.none} sem registo`);
              return parts.length ? ` · ${parts.join(' · ')}` : ' · sem dias fechados';
            })()}
          </DetailRow>
        ) : null}
        legend={(
          <>
            <LegendItem swatch={swatch.square('var(--ok)')}>Dentro</LegendItem>
            <LegendItem swatch={<span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 2, background: 'rgba(251,124,77,.22)', borderTop: '1px solid var(--warn)', flexShrink: 0 }} />}>Abaixo</LegendItem>
            <LegendItem swatch={<span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 2, background: 'repeating-linear-gradient(45deg, #fb7c4d 0 2px, rgba(251,124,77,.35) 2px 4px)', flexShrink: 0 }} />}>Acima</LegendItem>
            <LegendItem swatch={<span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 2, border: '1px dashed rgba(255,255,255,.4)', flexShrink: 0 }} />}>Sem registo</LegendItem>
          </>
        )}
      >
        {(motion) => (
          <>
            <div style={{ position: 'relative' }}>
              {[1, 3, 5, 7].map((n) => (
                <span key={n} aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, bottom: 7 + n * DAY_PX, height: 1, background: 'rgba(255,255,255,.05)' }} />
              ))}
              <div
                role="radiogroup"
                aria-label="Dias no objetivo, por semana — toca para escolher"
                onKeyDown={rovingB.onKeyDown}
                style={{ position: 'relative', display: 'grid', gridTemplateColumns: cols }}
              >
                {weeks.map((w, i) => {
                  const s = stats[i];
                  const can = selectable.includes(w.weekStart);
                  const checked = can && w.weekStart === sel;
                  const seg = (n, st) => (n > 0 ? <span key={st.key} data-seg={st.key} style={{ display: 'block', width: '100%', height: n * DAY_PX - 2, borderRadius: 3, transition: heightTransition(motion), ...st.style }} /> : null);
                  const empty = w.future || w.beforeData || (s.ok + s.below + s.above + s.none === 0);
                  const stack = empty
                    ? <span style={{ display: 'block', width: '100%', height: 4, borderRadius: 2, background: w.future ? 'transparent' : 'rgba(255,255,255,.06)' }} />
                    : (
                      <span style={{ display: 'flex', flexDirection: 'column-reverse', gap: 2, width: '100%', ...enterStyle(motion, i, weeks.length) }}>
                        {seg(s.ok, { key: 'ok', style: { background: 'var(--ok)', opacity: checked ? 1 : 0.7 } })}
                        {seg(s.below, { key: 'below', style: { background: 'rgba(251,124,77,.22)', borderTop: '1px solid var(--warn)' } })}
                        {seg(s.above, { key: 'above', style: { background: 'repeating-linear-gradient(45deg, #fb7c4d 0 3px, rgba(251,124,77,.35) 3px 6px)' } })}
                        {seg(s.none, { key: 'none', style: { border: '1px dashed rgba(255,255,255,.22)' } })}
                      </span>
                    );
                  const body = (
                    <>
                      <span style={{ height: PLOT, display: 'flex', alignItems: 'flex-end', width: '100%' }}>{stack}</span>
                      <span style={{ height: 3, marginTop: 4, width: '100%', borderRadius: 2, background: checked ? 'var(--text-1)' : 'transparent' }} />
                    </>
                  );
                  const aria = w.future
                    ? `${weekTitle(w, todayISO)}: ainda não chegou`
                    : w.beforeData
                      ? `${weekTitle(w, todayISO)}: antes do primeiro registo`
                      : `${weekTitle(w, todayISO)}${w.inProgress ? ', em curso' : ''}: ${s.ok} dentro, ${s.below} abaixo, ${s.above} acima, ${s.none} sem registo`;
                  const style = { border: 0, padding: '0 1px', background: 'transparent', color: 'inherit', display: 'flex', flexDirection: 'column', minWidth: 0 };
                  return (
                    <button
                      key={i}
                      ref={can ? rovingB.setRef(w.weekStart) : undefined}
                      type="button"
                      role="radio"
                      aria-checked={checked}
                      aria-disabled={can ? undefined : 'true'}
                      disabled={!can}
                      tabIndex={checked ? 0 : -1}
                      aria-label={aria}
                      onClick={can ? () => setPicked(w.weekStart) : undefined}
                      style={style}
                    >
                      {body}
                    </button>
                  );
                })}
              </div>
            </div>
            <div aria-hidden="true" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
              <span>0 dias</span>
              <span>7 dias</span>
            </div>
            <WeekStepper ids={selectable} selected={sel} onSelect={setPicked} testId="quarter-days-stepper" scope="dias no objetivo" />
          </>
        )}
      </NutritionChartCard>

      {wk?.shown ? (
        <NutritionChartCard
          testId="nutrition-quarter-weekdays"
          label={`${meta.label} por dia da semana`}
          hint={view.label.title}
          value={fmtInt(wdDays[lowest].avg)}
          unit={`${meta.unit} ${WD_ON[lowest]}, o dia mais baixo`}
          valueColor={meta.color}
          detail={selWd != null && wdDays[selWd] ? (
            <DetailRow testId="quarter-weekday-detail">
              <b style={{ color: 'var(--text-2)' }}>{capitalize(WD_PLURAL[selWd])}</b>
              {wdDays[selWd].thin ? (
                ` · ${fmtInt(wdDays[selWd].avg)} ${meta.unit} em média (${weekdayCount(selWd, wdDays[selWd].n)}) — poucos para contar, preciso de ${WEEKDAY_MIN}`
              ) : (
                <>
                  {` · ${fmtInt(wdDays[selWd].avg)} ${meta.unit} em média (${weekdayCount(selWd, wdDays[selWd].n)}) · ${wdDays[selWd].pctLabel}% · `}
                  <StatusWord status={wdDays[selWd].status} />
                </>
              )}
            </DetailRow>
          ) : null}
          legend={(
            <>
              <LegendItem swatch={swatch.square(meta.color)}>Média desse dia da semana</LegendItem>
              {meta.ceiling
                ? <LegendItem swatch={swatch.zone()}>Zona do objetivo (90–115%)</LegendItem>
                : <LegendItem swatch={swatch.dashLine()}>Objetivo: 90% ou mais</LegendItem>}
              {anyThin && <LegendItem swatch={swatch.square('var(--text-4)')}>{`Menos de ${WEEKDAY_MIN} registos: não conta`}</LegendItem>}
            </>
          )}
        >
          {(motion) => (
            <div style={{ position: 'relative' }}>
              {meta.ceiling && wdGoal > 0 && (
                <span aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, bottom: 34 + wpx(wdGoal * 0.9), height: Math.max(1, wpx(wdGoal * 1.15) - wpx(wdGoal * 0.9)), borderRadius: 4, background: 'rgba(255,255,255,.07)' }} />
              )}
              {wdGoal > 0 && (
                <span
                  aria-hidden="true"
                  style={meta.ceiling
                    ? { position: 'absolute', left: 0, right: 0, bottom: 34 + wpx(wdGoal), height: 1, background: 'rgba(255,255,255,.35)' }
                    : { position: 'absolute', left: 0, right: 0, bottom: 34 + wpx(wdGoal * 0.9), height: 0, borderTop: '1px dashed rgba(255,255,255,.45)' }}
                />
              )}
              <div
                role="radiogroup"
                aria-label="Dias da semana"
                onKeyDown={rovingC.onKeyDown}
                style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}
              >
                {wdDays.map((d, i) => {
                  const checked = i === selWd;
                  const thin = !!d?.thin;
                  const st = d && !thin ? DAY_STATUS_STYLE[d.status] : null;
                  // "2 de 4": cabe na coluna (~46 px); o nome acessível e a legenda dizem "registos".
                  const sub = !d ? `0 de ${WEEKDAY_MIN}` : thin ? `${d.n} de ${WEEKDAY_MIN}` : nDays(d.n);
                  const aria = !d
                    ? `${WD_SHORT[i]}: sem registo`
                    : thin
                      ? `${WD_SHORT[i]}: ${fmtInt(d.avg)} ${meta.long} em média, só ${d.n} ${plural(d.n, 'registo', 'registos')} — poucos para contar`
                      : `${WD_SHORT[i]}: ${fmtInt(d.avg)} ${meta.long} em média${st ? `, ${st.long}` : ''}, ${nDays(d.n)}`;
                  return (
                    <button
                      key={i}
                      ref={rovingC.setRef(i)}
                      type="button"
                      role="radio"
                      aria-checked={checked}
                      aria-disabled={d ? undefined : 'true'}
                      disabled={!d}
                      tabIndex={checked ? 0 : -1}
                      aria-label={aria}
                      onClick={d ? () => setPickedWd(i) : undefined}
                      style={{ border: 0, padding: 0, borderRadius: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', color: 'inherit', background: checked ? 'var(--surface-raised)' : 'transparent' }}
                    >
                      <span style={{ height: 160, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        {/* O valor numa linha própria por cima das barras: a zona 90–115% nunca lá chega. */}
                        <span className="tabular-nums" style={{ height: 20, display: 'flex', alignItems: 'center', fontSize: 'var(--text-xs)', color: thin || !d ? 'var(--text-4)' : 'var(--text-3)' }}>{d ? fmtInt(d.avg) : '–'}</span>
                        <span style={{ height: 140, display: 'flex', alignItems: 'flex-end' }}>
                          {d && (
                            <span style={{ display: 'block', width: 24, height: wpx(d.avg), borderRadius: '6px 6px 2px 2px', background: thin ? 'var(--text-4)' : meta.color, opacity: thin ? 0.4 : checked ? 1 : 0.7, transition: heightTransition(motion), ...enterStyle(motion, i, 7) }} />
                          )}
                        </span>
                      </span>
                      <span style={{ height: 34, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 4, gap: 1 }}>
                        <span style={{ fontSize: 'var(--text-xs)', lineHeight: '15px', color: 'var(--text-3)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                          {d && !thin && <StatusIcon status={d.status} />}
                          {WD_SHORT[i]}
                        </span>
                        <span style={{ fontSize: 'var(--text-xs)', lineHeight: '15px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{sub}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </NutritionChartCard>
      ) : (
        <WeekdayMinNote view={view} metric={metric} todayISO={todayISO} onViewPrevious={onViewPrevious} />
      )}
    </>
  );
}
