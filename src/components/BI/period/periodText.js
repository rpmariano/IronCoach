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
import { calendarPeriod, previousPeriod, periodLabel, addDaysISO, mondayOf } from '@formulas/calendarPeriod.ts';

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

const MONTHS_ABBR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** "13 jul" (com o ano quando não é o de hoje) — o "desde 13 jul" do navegador. */
function shortDayText(iso, todayISO) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return '';
  const year = todayISO && String(todayISO).slice(0, 4) !== m[1] ? ` ${m[1]}` : '';
  return `${Number(m[3])} ${MONTHS_ABBR[Number(m[2]) - 1]}${year}`;
}

/**
 * Uma só definição de "dias fechados" no ecrã (2026-10-04, reparo da
 * verificação no browser: o navegador do Ano da Corrida dizia "276 de 365 dias
 * fechados" e o bloco de KPIs "124 dias fechados", dois números para a mesma
 * coisa). O rótulo de periodLabel() conta os dias fechados do CALENDÁRIO
 * (1 jan → ontem); quando o histórico começa dentro do período, os dias que
 * contam são os fechados DESDE o 1.º registo (a vista só os usa a eles) e é
 * esse o número que o navegador diz, com o "desde 13 jul". O resumo deixa de
 * repetir a contagem: um só sítio a dizê-la.
 *
 * Só mexe quando o 1.º registo cai DENTRO do período (dataStart > início e
 * ≤ fim) e `closedDays` é um inteiro; em todos os outros casos (histórico que
 * já vinha de trás, período antes do 1.º registo, "dia") devolve o rótulo tal
 * como veio. Num período passado que já traz "com registo" (Nutrição) também
 * não toca.
 */
export function closedCoverageLabel(label, { period, closedDays, dataStartISO, todayISO } = {}) {
  if (!label || !period || period.kind === 'dia' || !Number.isInteger(closedDays)) return label;
  const ds = typeof dataStartISO === 'string' ? dataStartISO.slice(0, 10) : null;
  if (!ds || !(ds > period.start && ds <= period.end)) return label;
  const desde = `desde ${shortDayText(ds, todayISO)}`;
  if (period.isCurrent) {
    const n = Math.max(0, closedDays);
    const prog = n === 0 ? 'ainda sem dias fechados' : `${nDays(n)} ${plural(n, 'fechado', 'fechados')}`;
    return { ...label, coverage: `${desde} · em curso · ${prog}` };
  }
  if (label.coverage && /com registo/.test(label.coverage)) return label;
  // Período passado: «213 dias» sem dizer de quê era ambíguo (revisão 2026-10-04).
  const n = Math.max(0, closedDays);
  return { ...label, coverage: `${desde} · ${nDays(n)} ${plural(n, 'fechado', 'fechados')}` };
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
export function earlyVerdict(cal, { count, one = 'dia fechado', many = 'dias fechados', where, extra } = {}) {
  const n = count ?? cal?.period?.closedDays ?? 0;
  const onde = where ?? whereOf(cal?.kind || cal?.period?.kind, cal?.label?.title, cal?.period?.isCurrent ?? true);
  /* 2026-10-05 (limiares, M2): `extra` diz ONDE estão os dados ("Em setembro
     tens 9 corridas."). Só entra quando o chamador o dá: a frase por omissão
     fica como era para quem não a refinou (Nutrição). */
  return {
    text: `Só ${n} ${plural(n, one, many)} ${onde} — ainda é cedo para conclusões.${extra ? ` ${extra}` : ''}`,
    tone: 'neutral',
  };
}

/** Segundas-feiras das semanas seg–dom FECHADAS que TOCAM [start, end]
 *  (2026-10-05, limiares G2/G7). Antes só contavam as semanas INTEIRAS dentro do
 *  período: outubro só tinha a 1.ª a 12 out e a vista de omissão (mês) dizia
 *  "ainda é cedo" até 26 out, com 20 dias fechados. A semana que cruza a
 *  fronteira (28 set – 4 out) é uma semana completa de dados e conta para os dois
 *  meses que toca — como já fazia o gráfico semanal.
 *
 *  Fechada = acaba até ONTEM (hoje ainda não acabou, R2). Uma semana que começa
 *  antes do 1.º registo não é uma semana observada (puxava a média para baixo com
 *  dias que não existiram) e fica de fora. */
export function closedWeekStarts(start, end, todayISO, dataStartISO) {
  if (!start || !end || start > end || !dataStartISO) return [];
  const yesterday = addDaysISO(todayISO, -1);
  const out = [];
  for (let m = mondayOf(start); m <= end; m = addDaysISO(m, 7)) {
    if (addDaysISO(m, 6) > yesterday) break;
    if (m < dataStartISO) continue;
    out.push(m);
  }
  return out;
}

/** Domingo em que fecha a 1.ª semana que toca o período e ainda não fechou
 *  ("a 1.ª semana fechada de outubro acaba a 4 out"). null num período passado. */
export function nextWeekCloseISO(start, end, todayISO, dataStartISO) {
  if (!start || !end || !dataStartISO) return null;
  const yesterday = addDaysISO(todayISO, -1);
  for (let m = mondayOf(start); m <= end; m = addDaysISO(m, 7)) {
    if (m < dataStartISO) continue;
    const e = addDaysISO(m, 6);
    if (e > yesterday) return e;
  }
  return null;
}

// ── Para onde ir quando o período não tem dados que cheguem ───────────────

const FALLBACK_KINDS = ['semana', 'mes', 'trimestre', 'ano'];
/* "Ver o ano ›" (mock-up). A semana e o mês dizem-se com artigo à mesma. */
const SEE_KIND = { semana: 'Ver a semana', mes: 'Ver o mês', trimestre: 'Ver o trimestre', ano: 'Ver o ano' };

/** Nome curto de um período: "setembro" (mês do ano corrente), "setembro 2025"
 * (de outro ano), "semana passada", "jul – set". O mesmo corte que as vistas
 * já faziam à mão (shortName), agora num só sítio. */
export function shortPeriodName(title, kind, todayISO) {
  const t = String(title || '').trim();
  if (!t) return '';
  if (kind === 'mes') {
    const [name, year] = t.split(' ');
    return year && todayISO && Number(year) === Number(String(todayISO).slice(0, 4)) ? name : t;
  }
  return t.charAt(0).toLowerCase() + t.slice(1);
}

/**
 * Escolhe para onde levar quem está num período sem dados que cheguem
 * (2026-10-05, limiares M2/M4, "no Ano já aparecem"): o MENOR período que já
 * os tem — o anterior equivalente e, se nem esse chega, o tipo de período
 * maior (semana → mês → trimestre → ano) a contar de hoje. Corrida e Ginásio
 * abrem no mês: a 1–3 de cada mês todas as portas fecham, e nenhuma dizia que
 * os dados estavam no mês passado ou no Ano.
 *
 * `countIn(from, to, period)` conta o que a porta pede (corridas com zonas,
 * semanas fechadas…) numa janela de DIAS FECHADOS: de max(início, 1.º
 * registo) ao último dia fechado do período. Numa janela passada o tipo
 * maior é o que contém o início dela (2026-10-05; até aí não se oferecia
 * nenhum, porque "o ano" de HOJE podia nem a conter).
 *
 * Devolve null quando nada chega, senão
 *   { type: 'prev' | 'kind' | 'period', kind, offset?, label: 'Ver setembro',
 *     where: 'em setembro' | 'neste ano', count }
 * — `type` diz ao chamador que ação chamar (cal.prev, cal.setKind(kind) ou
 * cal.setPeriod(kind, offset)).
 */
export function pickFallbackPeriod({
  kind,
  offset = 0,
  todayISO,
  dataStartISO = null,
  kinds = FALLBACK_KINDS,
  min = 1,
  countIn,
}) {
  if (!kind || !todayISO || typeof countIn !== 'function') return null;
  const ds = typeof dataStartISO === 'string' ? dataStartISO.slice(0, 10) : null;
  const countOfPeriod = (p) => {
    const to = p.lastClosed;
    if (!to) return 0;
    const from = ds && ds > p.start ? ds : p.start;
    if (from > to) return 0;
    return Number(countIn(from, to, p)) || 0;
  };

  const cur = calendarPeriod(kind, todayISO, offset);
  const prev = previousPeriod(cur, todayISO);
  const nPrev = countOfPeriod(prev);
  if (nPrev >= min) {
    const name = shortPeriodName(periodLabel(prev, todayISO).title, kind, todayISO);
    return { type: 'prev', kind, label: `Ver ${name}`, where: whereOf(kind, periodLabel(prev, todayISO).title, false), name, count: nPrev };
  }

  const from = FALLBACK_KINDS.indexOf(kind);
  for (const k of FALLBACK_KINDS.slice(from + 1)) {
    if (!kinds.includes(k)) continue;
    /* 2026-10-05 (verificação no browser): num período PASSADO o tipo maior é o
       que CONTÉM o seu início — a semana passada (28 set – 4 out) leva a
       setembro, não ao mês de hoje, que nem a contém. Antes não se oferecia nada
       e a Corrida em "semana passada" dizia "(tens 1)" sem saída. */
    const off = offset === 0 ? 0 : offsetContaining(k, cur.start, todayISO);
    const big = calendarPeriod(k, todayISO, off);
    const n = countOfPeriod(big);
    if (n < min) continue;
    if (off === 0) return { type: 'kind', kind: k, label: SEE_KIND[k], where: scopeOf(k), name: scopeOf(k), count: n };
    const title = periodLabel(big, todayISO).title;
    const name = shortPeriodName(title, k, todayISO);
    return { type: 'period', kind: k, offset: off, label: `Ver ${name}`, where: whereOf(k, title, false), name, count: n };
  }
  return null;
}

/** Offset (≤ 0) do período do tipo `kind` que contém o dia `iso`. */
function offsetContaining(kind, iso, todayISO) {
  for (let o = 0; o > -1000; o--) {
    if (calendarPeriod(kind, todayISO, o).start <= iso) return o;
  }
  return 0;
}

/** Liga o resultado de pickFallbackPeriod aos botões do período (`cal` de
 * useCalendarPeriod): { actionLabel, onAction } prontos para o MinDataNote /
 * EarlyPeriodState — ou {} quando não há para onde ir. */
export function fallbackAction(fb, cal) {
  if (!fb || !cal) return {};
  let onAction;
  if (fb.type === 'prev') onAction = cal.prev;
  else if (fb.type === 'period') {
    // Um período passado de outro tipo (2026-10-05): sem setPeriod não há botão.
    if (typeof cal.setPeriod !== 'function') return {};
    onAction = () => cal.setPeriod(fb.kind, fb.offset);
  } else onAction = () => cal.setKind(fb.kind);
  return { actionLabel: fb.label, onAction };
}
