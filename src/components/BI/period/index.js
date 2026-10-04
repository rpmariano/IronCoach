/**
 * Blocos comuns dos separadores de período da Evolução (2026-10-04) — a
 * forma do mock-up aprovado "Evolução · Nutrição por período", aplicada aos
 * dados de cada separador. Ver o comentário de cada ficheiro.
 */
export { default as PeriodHeader, PeriodNav } from './PeriodHeader';
export { default as PeriodSummary } from './PeriodSummary';
export { default as EarlyPeriodState } from './EarlyPeriodState';
export { default as TodayExcludedNote, TODAY_EXCLUDED, TODAY_SEE_DAY } from './TodayExcludedNote';
export { default as DeltaVsPrevious, deltaDirection, deltaColor, hasDelta } from './DeltaVsPrevious';
export { default as MinDataNote, minDataText } from './MinDataNote';
export { default as VerdictLine } from '../VerdictLine';
export {
  MODULE_TONE,
  toneOf,
  STATUS_COLOR,
  STATUS_WORD,
  STATUS_LONG,
  plural,
  nDays,
  countOf,
  avgHeader,
  kindText,
  viewPreviousLabel,
  scopeOf,
  firstPeriodNote,
  whereOf,
  earlyVerdict,
  APPROX_GOALS_NOTE,
} from './periodText';
