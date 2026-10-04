import React, { useId, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  comparisonChoices,
  resolveComparison,
  compareAssessments,
  daysBetweenISO,
  fmtDayShort,
  fmtWeekdayDay,
  fmtDaysCount,
  fmtMetric,
  isoDay,
} from '../../utils/body';

/**
 * O "Dia" do Corpo = UMA AVALIAÇÃO (2026-10-04, decisão D1 do plano da
 * Evolução, aprovada com esta alteração).
 *
 * - ‹ › saltam de avaliação em avaliação — não de dia em dia: com uma
 *   pesagem por semana, andar por dias era tocar seis vezes em dias vazios.
 *   ‹ desativa-se na primeira, › na mais recente. Abre na mais recente.
 * - Mostra TODAS as métricas registadas nessa avaliação, cada uma com a
 *   diferença face à avaliação de referência: por omissão a ANTERIOR; o
 *   seletor "Comparar com…" (um <select> nativo — acessível de origem, 44 px)
 *   troca-a por "a primeira", "há ~3 meses" ou qualquer outra anterior.
 * - A cor diz se a mudança é boa: pela direção do objetivo do perfil se houver
 *   (goal_<métrica>), senão pela da métrica (gordura a descer, músculo a
 *   subir); o peso sem objetivo fica neutro. Abaixo do limiar de ruído da
 *   balança é "igual" (BODY_METRICS[].noise). A cor nunca vai sozinha: o
 *   leitor de ecrã ouve "no bom sentido" / "no sentido contrário".
 * - Diz quantos dias separam as duas avaliações ("23 dias entre as duas").
 * - Uma pesagem de hoje é um facto fechado e conta (não há "hoje ainda não
 *   acabou" aqui).
 *
 * Props: assessments (ordem cronológica, de sortAssessments), profile, todayISO.
 */

const card = {
  borderRadius: 'var(--radius-2xl)',
  padding: '14px 16px',
  background: 'var(--surface-glass)',
  border: '1px solid var(--border-glass)',
  boxShadow: 'var(--shadow-card)',
};

const TONE_COLOR = { good: 'var(--ok)', bad: 'var(--warn)', neutral: 'var(--text-3)' };
const TONE_WORD = { good: 'no bom sentido', bad: 'no sentido contrário', neutral: '' };
const ARROW = { up: '▲', down: '▼', flat: '=' };

function arrowBtn(disabled) {
  return {
    width: 44,
    height: 44,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    border: 0,
    background: 'transparent',
    color: 'var(--text-2)',
    opacity: disabled ? 0.3 : 1,
  };
}

/** "Hoje" / "Ontem" / "qui, 1 out". */
export function assessmentTitle(iso, todayISO) {
  if (iso === todayISO) return 'Hoje';
  if (todayISO && daysBetweenISO(iso, todayISO) === 1) return 'Ontem';
  return fmtWeekdayDay(iso, todayISO);
}

/** Texto de uma opção do "Comparar com…": "12 set (23 dias antes)". */
function optionDate(sorted, i, curISO, todayISO) {
  const d = isoDay(sorted[i]);
  const gap = daysBetweenISO(d, curISO);
  return `${fmtDayShort(d, todayISO)} (${gap === 0 ? 'no mesmo dia' : `${fmtDaysCount(gap)} antes`})`;
}

function DiffText({ row, refDate, todayISO }) {
  const m = row.metric;
  if (row.refValue === null) {
    return (
      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-4)' }}>
        {`sem leitura a ${fmtDayShort(refDate, todayISO)}`}
      </span>
    );
  }
  const { cmp } = row;
  const dir = cmp.direction;
  const abs = Math.abs(cmp.diff);
  const amount = fmtMetric(m, abs);
  const color = TONE_COLOR[cmp.tone] || TONE_COLOR.neutral;
  const spoken = dir === 'flat'
    ? `igual (diferença dentro do erro da medição)`
    : `${dir === 'up' ? 'subiu' : 'desceu'} ${amount}${TONE_WORD[cmp.tone] ? `, ${TONE_WORD[cmp.tone]}` : ''}`;
  return (
    <span data-testid={`body-day-diff-${m.key}`} data-tone={cmp.tone} data-direction={dir} style={{ fontSize: 'var(--text-xs)', fontWeight: 800, color, whiteSpace: 'nowrap' }}>
      <span aria-hidden="true">{dir === 'flat' ? '= igual' : `${ARROW[dir]} ${amount}`}</span>
      <span className="sr-only">{spoken}</span>
    </span>
  );
}

export default function BodyAssessmentDay({ assessments = [], profile, todayISO }) {
  const sorted = assessments;
  const total = sorted.length;
  const selectId = useId();
  // null = a mais recente (abre sempre aí — D1); um id fixa a escolhida.
  const [selectedId, setSelectedId] = useState(null);
  const [mode, setMode] = useState('prev');

  const found = selectedId == null ? -1 : sorted.findIndex((a) => String(a.id) === String(selectedId));
  const index = found >= 0 ? found : total - 1;
  const cur = sorted[index];
  const curISO = isoDay(cur);

  const choices = useMemo(() => comparisonChoices(sorted, index), [sorted, index]);
  const refIndex = useMemo(() => resolveComparison(sorted, index, mode), [sorted, index, mode]);
  const ref = refIndex === null ? null : sorted[refIndex];
  const refISO = ref ? isoDay(ref) : null;
  const rows = useMemo(() => compareAssessments(cur, ref, profile), [cur, ref, profile]);

  if (!cur) return null;

  const go = (i) => setSelectedId(sorted[i]?.id ?? null);
  const canPrev = index > 0;
  const canNext = index < total - 1;
  // O que o <select> mostra: um modo que deixou de existir aqui (um id que já
  // não é anterior, "há ~3 meses" sem avaliação perto) mostra "A anterior" —
  // que é também a referência que resolveComparison usa nesse caso.
  const modeValue = (mode.startsWith('id:') && !choices.earlier.some((i) => `id:${sorted[i].id}` === mode))
    || (mode === 'quarter' && choices.quarter === null)
    || (mode === 'first' && choices.first === null)
    ? 'prev'
    : mode;
  const gap = refISO ? daysBetweenISO(refISO, curISO) : null;
  const anyFlat = rows.some((r) => r.cmp?.direction === 'flat');
  const anyColor = rows.some((r) => r.cmp && r.cmp.tone !== 'neutral');

  return (
    <section aria-label="Avaliação" data-testid="body-day" style={card}>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label="Avaliação anterior"
          aria-disabled={!canPrev}
          disabled={!canPrev}
          onClick={canPrev ? () => go(index - 1) : undefined}
          style={arrowBtn(!canPrev)}
        >
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
        <div aria-live="polite" className="flex flex-col items-center min-w-0 text-center">
          <div className="text-[15px] font-black" style={{ color: 'var(--text-1)' }} data-testid="body-day-title">
            {assessmentTitle(curISO, todayISO)}
          </div>
          <div className="text-[11px] leading-snug mt-0.5 tabular-nums" style={{ color: 'var(--text-3)' }}>
            {`Avaliação ${index + 1} de ${total}${index === total - 1 ? ' · a mais recente' : ''}`}
          </div>
        </div>
        <button
          type="button"
          aria-label="Avaliação seguinte"
          aria-disabled={!canNext}
          disabled={!canNext}
          onClick={canNext ? () => go(index + 1) : undefined}
          style={arrowBtn(!canNext)}
        >
          <ChevronRight size={20} aria-hidden="true" />
        </button>
      </div>

      {ref ? (
        <div style={{ marginTop: 12 }}>
          <label htmlFor={selectId} style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-3)', marginBottom: 4 }}>
            {/* "Comparar com…" (D1); as reticências não entram no nome lido. */}
            Comparar com<span aria-hidden="true">…</span>
          </label>
          <select
            id={selectId}
            value={modeValue}
            onChange={(e) => setMode(e.target.value)}
            data-testid="body-day-compare"
            style={{
              width: '100%',
              minHeight: 'var(--tap)',
              padding: '0 12px',
              borderRadius: 12,
              border: '1px solid var(--border-glass-strong)',
              background: 'var(--surface-raised)',
              color: 'var(--text-1)',
              fontSize: 'var(--text-sm)',
              fontWeight: 700,
            }}
          >
            <option value="prev">{`A anterior · ${optionDate(sorted, choices.previous, curISO, todayISO)}`}</option>
            {choices.quarter !== null && (
              <option value="quarter">{`Há ~3 meses · ${optionDate(sorted, choices.quarter, curISO, todayISO)}`}</option>
            )}
            {choices.first !== null && (
              <option value="first">{`A primeira · ${optionDate(sorted, choices.first, curISO, todayISO)}`}</option>
            )}
            <optgroup label="Todas as anteriores">
              {choices.earlier.map((i) => (
                <option key={String(sorted[i].id ?? i)} value={`id:${sorted[i].id}`}>
                  {optionDate(sorted, i, curISO, todayISO)}
                </option>
              ))}
            </optgroup>
          </select>
          <p data-testid="body-day-gap" style={{ margin: '6px 0 0', fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>
            {gap === 0
              ? `${fmtDayShort(refISO, todayISO)} e ${fmtDayShort(curISO, todayISO)} · no mesmo dia`
              : `${fmtDayShort(refISO, todayISO)} → ${fmtDayShort(curISO, todayISO)} · ${fmtDaysCount(gap)} entre as duas`}
          </p>
        </div>
      ) : (
        <p data-testid="body-day-first" style={{ margin: '12px 0 0', fontSize: 'var(--text-xs)', color: 'var(--text-4)' }}>
          Esta é a primeira avaliação registada — ainda não há outra anterior para comparar.
        </p>
      )}

      <ul style={{ listStyle: 'none', margin: '12px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {rows.map((r) => {
          const m = r.metric;
          const aria = [
            `${m.label}: ${fmtMetric(m, r.value)}`,
            r.goal != null ? `objetivo ${fmtMetric(m, r.goal)}` : null,
          ].filter(Boolean).join(', ');
          return (
            <li
              key={m.key}
              data-testid={`body-day-row-${m.key}`}
              style={{ minHeight: 44, padding: '6px 10px', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
            >
              <span style={{ minWidth: 0 }}>
                <span className="sr-only">{`${aria}; `}</span>
                <span aria-hidden="true" style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-3)' }}>
                  {m.label}
                </span>
                {r.goal != null && (
                  <span aria-hidden="true" style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-4)' }}>
                    {`objetivo ${fmtMetric(m, r.goal)}`}
                  </span>
                )}
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                <span aria-hidden="true" className="tabular-nums" data-testid={`body-day-value-${m.key}`} style={{ fontSize: 14, fontWeight: 900, color: 'var(--text-1)' }}>
                  {fmtMetric(m, r.value)}
                </span>
                {ref && <DiffText row={r} refDate={refISO} todayISO={todayISO} />}
              </span>
            </li>
          );
        })}
      </ul>

      {ref && (anyColor || anyFlat) && (
        <p style={{ margin: '10px 0 0', fontSize: 'var(--text-xs)', lineHeight: 'var(--leading-normal)', color: 'var(--text-4)' }}>
          {[
            anyColor ? 'A verde, no bom sentido (o do teu objetivo, ou o da métrica); a coral, no sentido contrário.' : null,
            anyFlat ? 'Diferenças abaixo do erro da balança contam como iguais.' : null,
          ].filter(Boolean).join(' ')}
        </p>
      )}
    </section>
  );
}

