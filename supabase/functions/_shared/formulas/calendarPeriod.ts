// Motor de períodos de CALENDÁRIO (F1 do plano da Evolução, 2026-10-04).
//
// @contexto specs/evolucao-2026-10/plano.md §1 (R1, R2, R5, R6, R7, R8) e §2 F1.
// Os separadores da Evolução usavam janelas rolantes (relativeDateRange.ts /
// filterByDateRange): "Mês" = 5 set – 4 out, "esta semana" = 7 dias rolantes,
// e o dia de hoje (ainda a meio) entrava nas médias (erros N1, N3, O1, G2, G4
// em erros-verificados.md). Este módulo é a régua única: semana seg–dom, mês
// civil, trimestre civil, ano civil e dia, com "dias fechados" = do início do
// período até ONTEM (hoje nunca entra nas contas — R2).
//
// Vive em _shared/formulas (D3: partilhado com a Carol) — por isso é puro:
// só strings ISO "YYYY-MM-DD" e aritmética em Date.UTC, sem date-fns, sem
// `new Date()` sem argumentos, sem fuso do processo. O "hoje" chega sempre
// como `todayISO` (o dia local do atleta, calculado pelo chamador). Em UTC não
// há dias de 23/25 h, por isso os domingos de mudança de hora (29/03 e 25/10)
// não mexem em nada — está nos testes para que ninguém troque isto por datas
// locais sem dar por isso.
//
// Os textos de periodLabel seguem o mock-up aprovado "Evolução · Nutrição por
// período" (ecrãs Semana em curso / a começar, Mês fechado / em curso,
// Trimestre fechado / em curso).

export type PeriodKind = "dia" | "semana" | "mes" | "trimestre" | "ano";

export interface CalendarPeriod {
  kind: PeriodKind;
  /** 0 = período que contém hoje, -1 = o anterior, … (positivo = futuro). */
  offset: number;
  /** Primeiro dia (ISO, inclusivo). */
  start: string;
  /** Último dia (ISO, inclusivo). */
  end: string;
  /** O período contém hoje. */
  isCurrent: boolean;
  /** O período começa depois de hoje. */
  isFuture: boolean;
  /** min(end, ontem); null se o período ainda não tem nenhum dia fechado. */
  lastClosed: string | null;
  totalDays: number;
  closedDays: number;
}

export type PeriodEarlyState = "a_comecar" | "cedo" | "ok";

export interface PeriodLabel {
  title: string;
  range: string;
  status?: "em curso";
  coverage?: string;
  /** Extensão ao contrato (2026-10-04): leitura por extenso para o leitor de
   * ecrã, só no trimestre — o mock-up usa aria-label "4.º trimestre de 2026,
   * outubro a dezembro" porque "out – dez 2026" lido em voz alta é opaco. */
  ariaTitle?: string;
}

const DAY_MS = 86_400_000;

const MONTHS_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MONTHS_LONG = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];
// Índice 0 = segunda (isoWeekday), como em todo o módulo.
const WEEKDAYS_SHORT = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

// ---------------------------------------------------------------------------
// Aritmética de datas ISO (UTC, determinística)
// ---------------------------------------------------------------------------

/** Aceita "YYYY-MM-DD" ou um timestamp ISO (usa só os 10 primeiros
 * caracteres — o dia já vem calculado pelo chamador). Lança RangeError com
 * lixo: um período errado em silêncio é pior do que um erro visível. */
function parts(iso: string): [number, number, number] {
  const s = typeof iso === "string" ? iso.slice(0, 10) : "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) throw new RangeError(`calendarPeriod: data ISO inválida: ${String(iso)}`);
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const t = Date.UTC(y, mo - 1, d);
  const back = new Date(t);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) {
    throw new RangeError(`calendarPeriod: data ISO inexistente: ${String(iso)}`);
  }
  return [y, mo, d];
}

function toDayNumber(iso: string): number {
  const [y, m, d] = parts(iso);
  return Date.UTC(y, m - 1, d) / DAY_MS;
}

function fromDayNumber(n: number): string {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

function ymd(y: number, m0: number, d: number): string {
  return new Date(Date.UTC(y, m0, d)).toISOString().slice(0, 10);
}

/** Dias de diferença (b − a). */
function daysBetween(aISO: string, bISO: string): number {
  return toDayNumber(bISO) - toDayNumber(aISO);
}

export function addDaysISO(iso: string, n: number): string {
  return fromDayNumber(toDayNumber(iso) + n);
}

/** Soma meses com a regra de "clamp" do date-fns addMonths (31 jan + 1 mês =
 * 28/29 fev), igual à de relativeDateRange.ts, para não haver duas réguas. */
export function addMonthsISO(iso: string, n: number): string {
  const [y, m, d] = parts(iso);
  const total = y * 12 + (m - 1) + n;
  const ty = Math.floor(total / 12);
  const tm0 = ((total % 12) + 12) % 12;
  const dim = new Date(Date.UTC(ty, tm0 + 1, 0)).getUTCDate();
  return ymd(ty, tm0, Math.min(d, dim));
}

/** Dia da semana com 0 = segunda … 6 = domingo (semana portuguesa). */
export function isoWeekday(iso: string): number {
  const [y, m, d] = parts(iso);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/** Segunda-feira da semana (seg–dom) que contém `iso`. */
export function mondayOf(iso: string): string {
  return addDaysISO(iso, -isoWeekday(iso));
}

export function firstOfMonth(iso: string): string {
  const [y, m] = parts(iso);
  return ymd(y, m - 1, 1);
}

export function firstOfQuarter(iso: string): string {
  const [y, m] = parts(iso);
  return ymd(y, Math.floor((m - 1) / 3) * 3, 1);
}

/** Todos os dias de startISO a endISO, inclusivos; [] se start > end. */
export function eachDayISO(startISO: string, endISO: string): string[] {
  const a = toDayNumber(startISO), b = toDayNumber(endISO);
  const out: string[] = [];
  for (let n = a; n <= b; n++) out.push(fromDayNumber(n));
  return out;
}

// ---------------------------------------------------------------------------
// Períodos
// ---------------------------------------------------------------------------

function startOfKind(kind: PeriodKind, iso: string): string {
  switch (kind) {
    case "dia": return iso.slice(0, 10);
    case "semana": return mondayOf(iso);
    case "mes": return firstOfMonth(iso);
    case "trimestre": return firstOfQuarter(iso);
    case "ano": return ymd(parts(iso)[0], 0, 1);
    default: throw new RangeError(`calendarPeriod: tipo de período desconhecido: ${String(kind)}`);
  }
}

/** Avança `n` unidades a partir do INÍCIO de um período (start já alinhado,
 * por isso o clamp dos meses nunca atua — o dia é sempre 1). */
function shiftStart(kind: PeriodKind, startISO: string, n: number): string {
  switch (kind) {
    case "dia": return addDaysISO(startISO, n);
    case "semana": return addDaysISO(startISO, 7 * n);
    case "mes": return addMonthsISO(startISO, n);
    case "trimestre": return addMonthsISO(startISO, 3 * n);
    case "ano": return addMonthsISO(startISO, 12 * n);
  }
}

function endOf(kind: PeriodKind, startISO: string): string {
  return addDaysISO(shiftStart(kind, startISO, 1), -1);
}

/** Offset de um período (pelo seu início) em relação ao período que contém
 * hoje — recalculado em vez de confiar em `p.offset`, que fica velho se o
 * objeto atravessar a meia-noite. */
function offsetOf(kind: PeriodKind, startISO: string, todayISO: string): number {
  const cur = startOfKind(kind, todayISO);
  switch (kind) {
    case "dia": return daysBetween(cur, startISO);
    case "semana": return Math.round(daysBetween(cur, startISO) / 7);
    case "mes":
    case "trimestre":
    case "ano": {
      const [cy, cm] = parts(cur);
      const [sy, sm] = parts(startISO);
      const months = (sy * 12 + sm) - (cy * 12 + cm);
      return kind === "mes" ? months : kind === "trimestre" ? Math.round(months / 3) : Math.round(months / 12);
    }
  }
}

function build(kind: PeriodKind, start: string, todayISO: string, offset: number): CalendarPeriod {
  const today = todayISO.slice(0, 10);
  parts(today);
  const end = endOf(kind, start);
  const yesterday = addDaysISO(today, -1);
  const cap = end < yesterday ? end : yesterday;
  const lastClosed = cap >= start ? cap : null;
  return {
    kind,
    offset,
    start,
    end,
    isCurrent: start <= today && today <= end,
    isFuture: start > today,
    lastClosed,
    totalDays: daysBetween(start, end) + 1,
    closedDays: lastClosed ? daysBetween(start, lastClosed) + 1 : 0,
  };
}

/** O período `kind` que contém `todayISO`, deslocado `offset` unidades
 * (0 = atual, -1 = anterior). Não corta o futuro — isso é o shiftPeriod. */
export function calendarPeriod(kind: PeriodKind, todayISO: string, offset = 0): CalendarPeriod {
  const off = Math.trunc(offset) || 0;
  const start = shiftStart(kind, startOfKind(kind, todayISO.slice(0, 10)), off);
  return build(kind, start, todayISO, off);
}

/** Setas ‹ ›: anda `delta` períodos, mas nunca para lá do período atual
 * (offset ≤ 0) — não há dados do futuro para mostrar. */
export function shiftPeriod(p: CalendarPeriod, delta: number, todayISO: string): CalendarPeriod {
  const next = offsetOf(p.kind, p.start, todayISO) + (Math.trunc(delta) || 0);
  return calendarPeriod(p.kind, todayISO, Math.min(0, next));
}

/** Período anterior equivalente (para os ▲/▼ — R5). */
export function previousPeriod(p: CalendarPeriod, todayISO: string): CalendarPeriod {
  return calendarPeriod(p.kind, todayISO, offsetOf(p.kind, p.start, todayISO) - 1);
}

/** Recalcula lastClosed com o `todayISO` dado (o objeto pode ser de ontem). */
function lastClosedFor(p: CalendarPeriod, todayISO: string): string | null {
  return build(p.kind, p.start, todayISO, p.offset).lastClosed;
}

/** Dias fechados do período (start..lastClosed), cortados a partir de
 * `dataStartISO` quando o período começa antes do primeiro registo (R7,
 * "desde 13 jul"). É o denominador honesto de "X de N dias". */
export function closedDaysOf(p: CalendarPeriod, todayISO: string, dataStartISO?: string | null): string[] {
  const last = lastClosedFor(p, todayISO);
  if (!last) return [];
  let from = p.start;
  if (dataStartISO) {
    const ds = dataStartISO.slice(0, 10);
    parts(ds);
    if (ds > from) from = ds;
  }
  return eachDayISO(from, last);
}

/** A data cai no período? Por omissão só conta dias FECHADOS (R2): hoje e o
 * futuro ficam de fora. `closedOnly: false` usa o período inteiro. */
export function inPeriod(
  dateISO: string | null | undefined,
  p: CalendarPeriod,
  todayISO: string,
  { closedOnly = true }: { closedOnly?: boolean } = {},
): boolean {
  if (typeof dateISO !== "string" || dateISO.length < 10) return false;
  const d = dateISO.slice(0, 10);
  if (d < p.start) return false;
  const upper = closedOnly ? lastClosedFor(p, todayISO) : p.end;
  return upper !== null && d <= upper;
}

/** Estado de arranque (R6/R8): 'a_comecar' sem nenhum dia fechado (segunda,
 * dia 1), 'cedo' com menos de `minClosed`, 'ok' a partir daí. O mínimo nunca
 * passa do tamanho do período (um dia fechado é um "Dia" completo). */
export function periodEarlyState(p: CalendarPeriod, todayISO: string, minClosed = 4): PeriodEarlyState {
  const last = lastClosedFor(p, todayISO);
  const closed = last ? daysBetween(p.start, last) + 1 : 0;
  if (closed === 0) return "a_comecar";
  if (closed < Math.min(minClosed, p.totalDays)) return "cedo";
  return "ok";
}

// ---------------------------------------------------------------------------
// Rótulos (textos do mock-up)
// ---------------------------------------------------------------------------

function shortDate(iso: string, withYear: boolean): string {
  const [y, m, d] = parts(iso);
  return `${d} ${MONTHS_SHORT[m - 1]}${withYear ? ` ${y}` : ""}`;
}

/** "28 set – 4 out", "5 – 11 out", "29 dez 2025 – 4 jan 2026", "21 – 27 set
 * 2025" (ano só quando não é o corrente — regra do mock-up). */
function formatRange(startISO: string, endISO: string, currentYear: number): string {
  const [sy, sm, sd] = parts(startISO);
  const [ey, em] = parts(endISO);
  if (startISO === endISO) return shortDate(startISO, sy !== currentYear);
  if (sy !== ey) return `${shortDate(startISO, true)} – ${shortDate(endISO, true)}`;
  const yearSuffix = sy !== currentYear ? ` ${sy}` : "";
  if (sm === em) return `${sd} – ${shortDate(endISO, false)}${yearSuffix}`;
  return `${shortDate(startISO, false)} – ${shortDate(endISO, false)}${yearSuffix}`;
}

function dias(n: number): string {
  return n === 1 ? "dia" : "dias";
}

/** Título, intervalo, estado e cobertura de um período, como no mock-up:
 *  - semana: "Esta semana" / "Semana passada" / "Semana de 21 set"; range "28 set – 4 out"
 *  - mês: "outubro 2026"; trimestre: "out – dez 2026"; ano: "2026"
 *  - dia: "Hoje" / "Ontem" / "sáb, 3 out"
 *  - coverage: em curso "em curso · 3 de 31 dias fechados"; fechado com dados
 *    "28 de 30 dias com registo"; com início de dados dentro do período
 *    "desde 13 jul · 72 de 80 dias com registo".
 * `daysWithData` é o nº de dias com registo (o chamador conta-os nos seus
 * dados); `dataStartISO` o 1.º dia com registo. Os números são do período
 * fechado; em curso a cobertura descreve o progresso do calendário. */
export function periodLabel(
  p: CalendarPeriod,
  todayISO: string,
  opts: { daysWithData?: number; dataStartISO?: string | null } = {},
): PeriodLabel {
  const today = todayISO.slice(0, 10);
  const currentYear = parts(today)[0];
  const [sy, sm] = parts(p.start);
  const offset = offsetOf(p.kind, p.start, today);
  const fresh = build(p.kind, p.start, today, offset);
  const range = formatRange(p.start, p.end, currentYear);

  let title: string;
  let ariaTitle: string | undefined;
  switch (p.kind) {
    case "semana":
      title = offset === 0 ? "Esta semana"
        : offset === -1 ? "Semana passada"
        : `Semana de ${shortDate(p.start, sy !== currentYear)}`;
      break;
    case "mes":
      title = `${MONTHS_LONG[sm - 1]} ${sy}`;
      break;
    case "trimestre": {
      const q = Math.floor((sm - 1) / 3);
      title = `${MONTHS_SHORT[q * 3]} – ${MONTHS_SHORT[q * 3 + 2]} ${sy}`;
      ariaTitle = `${q + 1}.º trimestre de ${sy}, ${MONTHS_LONG[q * 3]} a ${MONTHS_LONG[q * 3 + 2]}`;
      break;
    }
    case "ano":
      title = String(sy);
      break;
    case "dia":
    default:
      title = offset === 0 ? "Hoje"
        : offset === -1 ? "Ontem"
        : `${WEEKDAYS_SHORT[isoWeekday(p.start)]}, ${shortDate(p.start, sy !== currentYear)}`;
      break;
  }

  const label: PeriodLabel = { title, range };
  if (ariaTitle) label.ariaTitle = ariaTitle;
  if (fresh.isCurrent) label.status = "em curso";

  // Um "Dia" não tem cobertura ("1 de 1 dia" não diz nada): o estado chega.
  if (p.kind === "dia" || fresh.isFuture) return label;

  const ds = opts.dataStartISO ? opts.dataStartISO.slice(0, 10) : null;
  if (ds) parts(ds);
  const desde = ds && ds > p.start && ds <= p.end
    ? `desde ${shortDate(ds, parts(ds)[0] !== currentYear)}`
    : null;

  if (fresh.isCurrent) {
    const prog = fresh.closedDays === 0
      ? "em curso · ainda sem dias fechados"
      : `em curso · ${fresh.closedDays} de ${fresh.totalDays} ${dias(fresh.totalDays)} fechados`;
    label.coverage = desde ? `${desde} · ${prog}` : prog;
    return label;
  }

  // Fechado (passado).
  if (ds && ds > p.end) {
    label.coverage = "antes do primeiro registo";
    return label;
  }
  const denom = closedDaysOf(fresh, today, ds).length;
  const withData = typeof opts.daysWithData === "number" && Number.isFinite(opts.daysWithData)
    ? `${Math.max(0, Math.trunc(opts.daysWithData))} de ${denom} ${dias(denom)} com registo`
    : null;
  if (desde && withData) label.coverage = `${desde} · ${withData}`;
  else if (desde) label.coverage = desde;
  else if (withData) label.coverage = withData;
  return label;
}

// ---------------------------------------------------------------------------
// Agregações por semana / dia da semana
// ---------------------------------------------------------------------------

/** Agrupa dias em semanas seg–dom (por ordem cronológica, dias sem
 * repetições). Só aparecem as semanas que têm algum dia na lista — o
 * chamador passa closedDaysOf(...) para ter as semanas do período. */
export function weeklyBuckets(days: string[]): { weekStart: string; days: string[] }[] {
  const uniq = Array.from(new Set(days.map((d) => d.slice(0, 10)))).sort();
  const out: { weekStart: string; days: string[] }[] = [];
  for (const d of uniq) {
    const ws = mondayOf(d);
    const last = out[out.length - 1];
    if (last && last.weekStart === ws) last.days.push(d);
    else out.push({ weekStart: ws, days: [d] });
  }
  return out;
}

/** Média por dia da semana (índice 0 = segunda). Valores null/NaN são
 * ignorados; um dia da semana com menos de `minPerWeekday` valores dá null
 * (R6 — "preciso de pelo menos 4 registos de cada dia da semana"). Uma
 * entrada por data: se a série tiver datas repetidas, cada uma conta. */
export function weekdayAverages(
  series: { date: string; value: number | null }[],
  minPerWeekday = 4,
): ({ avg: number; n: number } | null)[] {
  const sum = [0, 0, 0, 0, 0, 0, 0];
  const cnt = [0, 0, 0, 0, 0, 0, 0];
  for (const { date, value } of series) {
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    if (typeof date !== "string") continue;
    const wd = isoWeekday(date);
    sum[wd] += value;
    cnt[wd] += 1;
  }
  const min = Math.max(1, minPerWeekday);
  return cnt.map((n, i) => (n >= min ? { avg: sum[i] / n, n } : null));
}
