/**
 * Textos e cores comuns dos blocos de período da Evolução (2026-10-04).
 *
 * @contexto specs/evolucao-2026-10/plano.md §1 (R2–R8) e o mock-up aprovado
 * "Evolução · Nutrição por período". Os quatro separadores (Nutrição,
 * Corrida, Ginásio, Corpo) e o Geral escrevem as MESMAS frases com estes
 * ajudantes — antes cada dashboard tinha a sua ("6mêses", "Tenho uma
 * corridas", "2 sessãoões": erros R6, R7, O2), e os plurais partiam-se.
 */
import { fmtNumber } from '../../../utils/verdicts/shared';

/* Cor de cada separador (tokens de colors.css). O Geral ('hub') fala na
   cor da Carol: não é nenhum dos quatro módulos. */
export const MODULE_TONE = {
  nutricao: { color: 'var(--nutrition)', ink: 'var(--nutrition-ink)', bg: 'var(--tint-nutrition-bg)', bd: 'var(--tint-nutrition-bd)' },
  corrida: { color: 'var(--run)', ink: 'var(--run-ink)', bg: 'var(--tint-run-bg)', bd: 'var(--tint-run-bd)' },
  ginasio: { color: 'var(--gym)', ink: 'var(--gym-ink)', bg: 'var(--tint-gym-bg)', bd: 'var(--tint-gym-bd)' },
  corpo: { color: 'var(--body)', ink: 'var(--body-ink)', bg: 'var(--tint-body-bg)', bd: 'var(--tint-body-bd)' },
  hub: { color: 'var(--coach)', ink: 'var(--coach-ink)', bg: 'var(--tint-coach-bg)', bd: 'var(--tint-coach-bd)' },
};

export const toneOf = (module) => MODULE_TONE[module] || MODULE_TONE.nutricao;

/** Cor do estado de uma linha/valor: verde dentro, coral fora (nunca âmbar —
 * o âmbar é a prova), cinzento sem estado. */
export const STATUS_COLOR = {
  ok: 'var(--ok)',
  below: 'var(--warn)',
  above: 'var(--warn)',
  neutral: 'var(--text-4)',
};

export const STATUS_WORD = { ok: 'Dentro', below: 'Abaixo', above: 'Acima' };
export const STATUS_LONG = { ok: 'dentro do objetivo', below: 'abaixo do objetivo', above: 'acima do objetivo' };

/** Plural português simples: plural(1, 'dia', 'dias') → "dia". */
export function plural(n, one, many) {
  return Math.abs(Number(n)) === 1 ? one : many;
}

/** "1 dia" / "6 dias" (com o número). */
export function nDays(n) {
  return `${n} ${plural(n, 'dia', 'dias')}`;
}

/** "X de N" (R4) — a contagem que substitui as médias soltas. */
export function countOf(k, n) {
  return `${fmtNumber(k, 0)} de ${fmtNumber(n, 0)}`;
}

/** Cabeçalho da coluna das médias (R3: toda a média diz o denominador).
 * avgHeader(6) → "Média por dia registado (6 dias)". */
export function avgHeader(n, base = 'Média por dia registado') {
  return `${base} (${nDays(n)})`;
}

/* Por tipo de período: nome do anterior, "Voltar a…", "começou hoje",
   "neste <período>" e "Primeiro <período> com registos". Concordância de
   género escrita à mão (semana é feminina). */
const KIND_TEXT = {
  dia: { prevName: 'ontem', back: 'Voltar a hoje', started: 'O dia começou agora', scope: 'neste dia', first: 'Primeiro dia com registos — ainda não há outro para comparar.' },
  semana: { prevName: 'semana passada', back: 'Voltar a esta semana', started: 'A semana começou hoje', scope: 'nesta semana', first: 'Primeira semana com registos — ainda não há outra para comparar.' },
  mes: { prevName: 'mês passado', back: 'Voltar a este mês', started: 'O mês começou hoje', scope: 'neste mês', first: 'Primeiro mês com registos — ainda não há outro para comparar.' },
  trimestre: { prevName: 'trimestre passado', back: 'Voltar a este trimestre', started: 'O trimestre começou hoje', scope: 'neste trimestre', first: 'Primeiro trimestre com registos — ainda não há outro para comparar.' },
  ano: { prevName: 'ano passado', back: 'Voltar a este ano', started: 'O ano começou hoje', scope: 'neste ano', first: 'Primeiro ano com registos — ainda não há outro para comparar.' },
};

export const kindText = (kind) => KIND_TEXT[kind] || KIND_TEXT.semana;

/** "Ver semana passada" / "Ver mês passado" (botão do estado "a começar"). */
export const viewPreviousLabel = (kind) => `Ver ${kindText(kind).prevName}`;

/** "nesta semana" / "neste mês" / … — para as notas de mínimo de dados. */
export const scopeOf = (kind) => kindText(kind).scope;

/** "Primeiro trimestre com registos — ainda não há outro para comparar."
 * (mock-up, trimestre jul – set). Usa-se em vez do ▲/▼ quando não há
 * período anterior com dados (R5). */
export const firstPeriodNote = (kind) => kindText(kind).first;

/** Nota da Nutrição sobre objetivos anteriores a 3 out (F3 / N5). */
export const APPROX_GOALS_NOTE = 'Objetivos aproximados: a app só guarda as mudanças de objetivos desde 3 out.';

/** Onde fica o período na frase "Só 3 dias fechados <onde>": no período em
 * curso "nesta semana" / "neste trimestre", mas o mês diz o nome ("em
 * outubro", como no mock-up); num período passado diz sempre o nome. */
export function whereOf(kind, title, isCurrent = true) {
  const name = String(title || '').trim();
  if (kind === 'mes' && name) return `em ${name.split(' ')[0]}`;
  if (isCurrent || !name) return scopeOf(kind);
  return kind === 'semana' ? `na ${name.charAt(0).toLowerCase()}${name.slice(1)}` : `em ${name}`;
}

/**
 * Veredicto "cedo" (R6): "Só 3 dias fechados em outubro — ainda é cedo para
 * conclusões." Devolve { text, tone: 'neutral' } — o formato do VerdictLine e
 * do `verdict` do PeriodSummary. O traço fica cinzento (mock-up: a frase não
 * é boa nem má, é falta de dados).
 *
 * `cal` é o resultado de useCalendarPeriod(tab); `count` substitui os dias
 * fechados (ex.: sessões de força) com `one`/`many` para o nome.
 */
export function earlyVerdict(cal, { count, one = 'dia fechado', many = 'dias fechados', where } = {}) {
  const n = count ?? cal?.period?.closedDays ?? 0;
  const onde = where ?? whereOf(cal?.kind || cal?.period?.kind, cal?.label?.title, cal?.period?.isCurrent ?? true);
  return {
    text: `Só ${n} ${plural(n, one, many)} ${onde} — ainda é cedo para conclusões.`,
    tone: 'neutral',
  };
}
