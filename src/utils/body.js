import { fmtNumber } from './verdicts/shared';
import { GOAL_HISTORY_SINCE } from './goalHistory';
import {
  WEIGHT_TREND_WINDOW_DAYS,
  WEIGHT_TREND_MIN_POINTS,
  WEIGHT_TREND_MIN_SPAN_DAYS,
} from '@formulas/weightTrend.ts';

/* Cores das métricas de corpo — ponto 6 do redesenho ("paleta das séries
   de dados"). Eram treze cores avulsas (verdes, azuis, magentas) sem
   relação com as oito com significado; nenhuma delas dizia "corpo". Passam
   a duas, as mesmas que o mock "Dashboard · Corpo" usa na barra de
   composição: rosa (--body) para peso e gordura, violeta (--nutrition)
   para tudo o que é massa magra, músculo, água e osso. Nunca aparecem duas
   ao mesmo tempo no mesmo gráfico — só se vê uma métrica de cada vez — por
   isso não há ambiguidade. Em hexadecimal porque o Chart.js pinta em
   <canvas> e não resolve var(--x); os valores são os de tokens/colors.css. */
const C_MASSA = '#ff5fa8';  // --body
const C_MAGRA = '#c77dff';  // --nutrition

/* `noise` (2026-10-04, plano §3 Corpo — "deltas só acima do limiar de
   ruído"): a diferença abaixo da qual duas leituras contam como IGUAIS. As
   balanças de bioimpedância (Renpho e afins) variam de um dia para o outro
   com a água, a hora e o que se comeu: ~1–2 pontos de % de gordura/água e
   ~0,5 kg de massa muscular sem nada ter mudado. O peso varia ~0,5 kg de
   manhã para manhã (água, sal, glicogénio). Sem este limiar, "+0,1 % de
   gordura" saía a coral como se fosse um retrocesso. Os valores são
   deliberadamente conservadores: preferimos "igual" a uma seta inventada. */
export const BODY_METRICS = [
  { key: 'weight_kg', label: 'Peso', unit: 'kg', dec: 1, color: C_MASSA, good: null, noise: 0.5 },
  { key: 'bmi', label: 'IMC', unit: '', dec: 1, color: C_MASSA, good: 'down', noise: 0.2 },
  { key: 'body_fat_pct', label: 'Gordura corporal', unit: '%', dec: 1, color: C_MASSA, good: 'down', noise: 1 },
  { key: 'skeletal_muscle_pct', label: 'Músculo esquelético', unit: '%', dec: 1, color: C_MAGRA, good: 'up', noise: 1 },
  { key: 'muscle_mass_kg', label: 'Massa muscular', unit: 'kg', dec: 1, color: C_MAGRA, good: 'up', noise: 0.5 },
  { key: 'body_water_pct', label: 'Água corporal', unit: '%', dec: 1, color: C_MAGRA, good: 'up', noise: 1 },
  { key: 'protein_pct', label: 'Proteína', unit: '%', dec: 1, color: C_MAGRA, good: 'up', noise: 0.5 },
  { key: 'bone_mass_kg', label: 'Massa óssea', unit: 'kg', dec: 1, color: C_MAGRA, good: null, noise: 0.1 },
  { key: 'bmr_kcal', label: 'Metabolismo basal', unit: 'kcal', dec: 0, color: C_MASSA, good: 'up', noise: 30 },
  { key: 'visceral_fat', label: 'Gordura visceral', unit: '', dec: 0, color: C_MASSA, good: 'down', noise: 1 },
  { key: 'subcutaneous_fat_pct', label: 'Gordura subcutânea', unit: '%', dec: 1, color: C_MASSA, good: 'down', noise: 1 },
  { key: 'metabolic_age', label: 'Idade metabólica', unit: 'anos', unitOne: 'ano', dec: 0, color: C_MASSA, good: 'down', noise: 1 },
  { key: 'lean_body_mass_kg', label: 'Massa magra', unit: 'kg', dec: 1, color: C_MAGRA, good: 'up', noise: 0.5 }
];

export const BODY_METRIC_BY_KEY = Object.fromEntries(BODY_METRICS.map((m) => [m.key, m]));

// Idade cronológica a partir da data de nascimento. Deriva-se sempre — nunca
// guardamos a idade, que ficaria errada no primeiro aniversário.
// Serve também para dar sentido a `metabolic_age`: sozinha não diz nada, é a
// diferença face à idade real que interessa.
// O cálculo vive em @formulas/age.ts, o mesmo que o servidor usa.
export { ageFromBirthDate } from '@formulas/age.ts';

/* C4 (2026-10-04): vírgula decimal, como o resto da app. Era
   `toFixed(dec)` — "72.4 kg". */
export function fmtMetric(metric, val) {
  if (val === null || val === undefined || val === '' || !Number.isFinite(Number(val))) return '—';
  const v = fmtNumber(Number(val), metric.dec);
  // 2026-10-04 (verificação no browser, Corpo · Trimestre): «+1 anos» — a
  // unidade contável leva singular quando o número mostrado é ±1.
  const unit = metric.unitOne && Math.abs(Number(Number(val).toFixed(metric.dec))) === 1
    ? metric.unitOne
    : metric.unit;
  return unit ? `${v} ${unit}` : v;
}

/** Só o número ("72,4"), sem unidade — para o número grande do ChartFrame. */
export function fmtMetricValue(metric, val) {
  if (val === null || val === undefined || val === '' || !Number.isFinite(Number(val))) return '—';
  return fmtNumber(Number(val), metric.dec);
}

/** "+0,4 kg" / "−0,4 kg" (o "−" é o do fmtNumber; o "+" é nosso). */
export function fmtSigned(metric, diff) {
  const d = Number(diff);
  if (!Number.isFinite(d)) return '—';
  const base = fmtMetric(metric, d);
  return d > 0 ? `+${base}` : base;
}

/** Valor numérico de uma métrica numa avaliação, ou null se não foi medida. */
export function readingOf(assessment, key) {
  const v = assessment?.[key];
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  // Peso 0 ou gordura 0 não são medições (a fórmula de composição já os ignora).
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export const hasReading = (assessment, key) => readingOf(assessment, key) !== null;

/** Objetivo do perfil para a métrica (profiles.goal_<key>), ou null. */
export function goalOf(profile, key) {
  const v = profile?.[`goal_${key}`];
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/* Para onde é BOM ir (2026-10-04, plano §3 Corpo / D1): com objetivo, para o
   lado do objetivo a partir da leitura de referência (como em bodyGoal.js —
   o peso vai para onde a meta estiver); sem objetivo, a direção natural da
   métrica (gordura a descer, músculo a subir); o peso sem objetivo não tem
   direção boa (null). Já em cima do objetivo: 'hold' (mexer é afastar-se). */
export function betterDirection(metric, refValue, goal) {
  if (goal != null && refValue != null) {
    if (refValue > goal) return 'down';
    if (refValue < goal) return 'up';
    return 'hold';
  }
  return metric?.good || null;
}

/**
 * Compara a leitura `cur` com a de referência `ref` (2026-10-04).
 * → { diff, direction: 'up'|'down'|'flat', aboveNoise, better, tone: 'good'|'bad'|'neutral' }
 * Abaixo do limiar de ruído da métrica é 'flat' (igual) e neutro.
 */
export function compareValues(metric, cur, ref, { goal = null } = {}) {
  const a = Number(cur);
  const b = Number(ref);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const diff = Math.round((a - b) * 1000) / 1000;
  const noise = Number(metric?.noise) || 0;
  const aboveNoise = Math.abs(diff) >= noise && diff !== 0;
  const direction = !aboveNoise ? 'flat' : diff > 0 ? 'up' : 'down';
  const better = betterDirection(metric, b, goal);
  let tone = 'neutral';
  if (direction !== 'flat' && better) tone = better === 'hold' ? 'bad' : direction === better ? 'good' : 'bad';
  /* Passar o objetivo (2026-10-04, revisão do Corpo): ir "para o lado" do
     objetivo mas acabar mais longe dele do que a referência estava não é bom
     (objetivo 72 kg, 73 → 65 kg). Cruzá-lo e ficar mais perto continua bom. */
  const g = Number(goal);
  if (tone === 'good' && goal != null && Number.isFinite(g) && Math.abs(a - g) > Math.abs(b - g)) tone = 'bad';
  return { diff, direction, aboveNoise, better, tone };
}

// ── Datas ──────────────────────────────────────────────────────────────────

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

export const isoDay = (a) => (typeof a?.date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(a.date) ? a.date.slice(0, 10) : null);

/** Dias de `a` até `b` (b − a), em UTC — sem fuso nem mudança de hora. */
export function daysBetweenISO(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

/** "12 set" no ano de `todayISO`, "12 set 2025" nos outros (C5: a data de uma
 *  leitura antiga tem de se ler sem ambiguidade). */
export function fmtDayShort(iso, todayISO) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  const year = todayISO ? Number(String(todayISO).slice(0, 4)) : y;
  return `${d} ${MESES[m - 1]}${y === year ? '' : ` ${y}`}`;
}

/** "qui, 1 out" (com o ano se não for o de `todayISO`). */
export function fmtWeekdayDay(iso, todayISO) {
  if (!iso) return '';
  const wd = new Date(`${String(iso).slice(0, 10)}T12:00:00Z`).getUTCDay();
  return `${DIAS_SEMANA[wd]}, ${fmtDayShort(iso, todayISO)}`;
}

/** "no mesmo dia" / "1 dia" / "23 dias". */
export function fmtDaysCount(n) {
  const v = Math.abs(Number(n));
  return `${v} ${v === 1 ? 'dia' : 'dias'}`;
}

// ── Avaliações ─────────────────────────────────────────────────────────────

/** Avaliações com data, por ordem cronológica (a mais antiga primeiro). No
 *  mesmo dia, pela hora de criação e depois pelo id — estável. */
export function sortAssessments(list) {
  return (Array.isArray(list) ? list : [])
    .filter((a) => isoDay(a))
    .slice()
    .sort((a, b) => isoDay(a).localeCompare(isoDay(b))
      || String(a.created_at || '').localeCompare(String(b.created_at || ''))
      || String(a.id ?? '').localeCompare(String(b.id ?? '')));
}

/** As métricas com pelo menos uma leitura nestas avaliações (as nunca
 *  registadas escondem-se — plano §3 Corpo). */
export function metricsRegistered(assessments) {
  const list = Array.isArray(assessments) ? assessments : [];
  return BODY_METRICS.filter((m) => list.some((a) => hasReading(a, m.key)));
}

/* "Há ~3 meses" (D1): a avaliação anterior mais perto de 91 dias antes desta,
   desde que fique a menos de um mês desse alvo — sem isso não é "há ~3 meses". */
export const QUARTER_BACK_DAYS = 91;
const QUARTER_TOLERANCE_DAYS = 31;

/**
 * Atalhos do "Comparar com…" da vista Dia (D1, 2026-10-04) para a avaliação
 * `index` de `sorted` (ordem cronológica). Só avaliações ANTERIORES: a
 * diferença lê-se sempre "desde então" (comparar com uma posterior é o mesmo
 * que abrir essa e comparar com esta).
 * → { previous, first, quarter, earlier: [índices, da mais recente para a mais antiga] }
 *   (índices em `sorted`; null quando não há).
 */
export function comparisonChoices(sorted, index) {
  if (!Array.isArray(sorted) || index <= 0 || index >= sorted.length) {
    return { previous: null, first: null, quarter: null, earlier: [] };
  }
  const cur = isoDay(sorted[index]);
  const earlier = [];
  for (let i = index - 1; i >= 0; i--) earlier.push(i);
  const previous = index - 1;
  const first = 0;
  let quarter = null;
  let best = Infinity;
  for (const i of earlier) {
    const gap = daysBetweenISO(isoDay(sorted[i]), cur);
    const off = Math.abs(gap - QUARTER_BACK_DAYS);
    if (off <= QUARTER_TOLERANCE_DAYS && off < best) {
      best = off;
      quarter = i;
    }
  }
  if (quarter === previous || quarter === first) quarter = null;
  return { previous, first: first === previous ? null : first, quarter, earlier };
}

/** O índice de referência para um modo do "Comparar com…": 'prev', 'first',
 *  'quarter' ou 'id:<id>'. Um id que já não é anterior volta à anterior. */
export function resolveComparison(sorted, index, mode) {
  const ch = comparisonChoices(sorted, index);
  if (ch.previous === null) return null;
  if (mode === 'first') return ch.first ?? ch.previous;
  if (mode === 'quarter') return ch.quarter ?? ch.previous;
  if (typeof mode === 'string' && mode.startsWith('id:')) {
    const id = mode.slice(3);
    const i = ch.earlier.find((j) => String(sorted[j]?.id) === id);
    return i ?? ch.previous;
  }
  return ch.previous;
}

// ── Caminho até ao objetivo (2026-10-05) ───────────────────────────────────

const lisbonDay = (ts) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date(ts));

/**
 * Desde que dia vale o objetivo corporal `key` com o valor `goal`
 * (2026-10-05, barras do resumo do Corpo).
 *   → { since: ISO | null, approx: 'sem_historico' | 'antes_do_historico' | null }
 *
 * Lê o histórico de objetivos do store (`state.goalHistory`, migração
 * 20261003224956) com as mesmas regras do goalsResolver (utils/goalHistory.js):
 * o dia é o de Lisboa de `valid_from`, e tudo o que é anterior a
 * GOAL_HISTORY_SINCE (3 out) é aproximado. Não se chama o goalsResolver
 * diretamente porque ele só devolve os cinco objetivos de NUTRIÇÃO (o `pick`
 * deita fora o resto) — e, a 2026-10-05, a tabela também só guarda esses cinco:
 * os objetivos do corpo (goal_weight_kg, goal_body_fat_pct, …) não têm
 * histórico. Por isso, hoje, a resposta é sempre `since: null` com
 * 'sem_historico' e quem chama conta desde a primeira leitura dos últimos
 * GOAL_START_LOOKBACK_DAYS dias, dizendo que o ponto de partida é aproximado. Quando a tabela ganhar as colunas `goal_*`,
 * isto passa a dar o dia certo sem mexer em mais nada.
 *
 * O dia é o da 1.ª linha do troço final em que o objetivo já tinha este valor
 * (mudar 76 → 74 → 76 conta desde o último 76).
 */
export function bodyGoalSince(history, key, goal) {
  const field = `goal_${key}`;
  const rows = (Array.isArray(history) ? history : [])
    .filter((r) => r?.valid_from && Object.prototype.hasOwnProperty.call(r, field))
    .map((r) => ({ day: lisbonDay(r.valid_from), v: r[field] == null || r[field] === '' ? null : Number(r[field]) }))
    .sort((a, b) => a.day.localeCompare(b.day));
  const g = Number(goal);
  const same = (v) => v !== null && Number.isFinite(v) && Math.abs(v - g) < 1e-6;
  // Sem histórico deste objetivo, ou o histórico ainda não tem o valor de agora
  // (o perfil mudou e a releitura ainda não chegou): não se sabe o dia.
  if (!rows.length || !same(rows[rows.length - 1].v)) return { since: null, approx: 'sem_historico' };
  let i = rows.length - 1;
  while (i > 0 && same(rows[i - 1].v)) i--;
  const since = rows[i].day;
  return { since, approx: since < GOAL_HISTORY_SINCE ? 'antes_do_historico' : null };
}

/** Sem o dia do objetivo, a barra conta desde a primeira leitura destes últimos
 *  dias até à leitura de que se fala (2026-10-05, revisão das barras). Contar
 *  desde a primeira leitura de SEMPRE inventava factos: com 72 kg em 2024,
 *  79,4 em julho e 77,3 hoje (objetivo 76), a barra dizia "objetivo atingido".
 *  Três meses é o horizonte de um objetivo de corpo (o mesmo "há ~3 meses" da
 *  vista Dia) e é dito na nota do resumo. */
export const GOAL_START_LOOKBACK_DAYS = 90;

/**
 * O caminho feito até ao objetivo (2026-10-05): da leitura do ponto de partida
 * até à leitura `current`.
 *   readings  todas as leituras da métrica, por ordem cronológica [{ date, value }]
 *   current   a leitura de que se fala (a última do período)
 *   since     o resultado de bodyGoalSince
 * → { start, remaining, pct, reached, away, noPath, crossed, below, approx } ou null (sem
 *   objetivo, sem leituras, ou o período é anterior ao ponto de partida).
 *
 * - Para onde é o caminho (revisão de 2026-10-05): o sentido é o da métrica
 *   quando ela o tem (gordura a descer, músculo a subir) e, sem ele (peso),
 *   o lado do objetivo a partir de AGORA — nunca a partir do ponto de partida.
 *   Orientar pela 1.ª leitura dava "objetivo atingido" a quem tinha passado o
 *   objetivo no sentido mau (gordura 16 % → 23 %, objetivo 18 %).
 * - Atingido: com sentido próprio, estar em cima do objetivo ou do lado bom
 *   dele (gordura 17 % com objetivo 18 % está atingido — não é "faltam 1 %" a
 *   caminho de engordar); no peso, estar a menos do ruído da balança, ou tê-lo
 *   passado a partir do dia em que o definiste e estar mais perto dele.
 * - Ponto de partida: a última leitura até ao dia do objetivo (o estado em que
 *   estavas quando o definiste); sem nenhuma antes, a primeira depois
 *   (aproximado). Sem dia conhecido: a primeira leitura dos últimos
 *   GOAL_START_LOOKBACK_DAYS dias até `current` (aproximado).
 * - Se o ponto de partida já estava do lado bom (ou em cima) e agora não está,
 *   é `away` — afastaste-te; nunca progresso.
 * - `pct` é a fração do caminho já feita, 0–100 — é a largura da barra.
 *   Afastar-se do objetivo dá 0 com `away` (diz-se "mais longe", nunca um
 *   "0%" que esconda o recuo). Atingido: 100 com `reached`.
 * - `noPath`: não há caminho que se possa medir — o ponto de partida é a
 *   própria leitura `current`, ou o peso passou o objetivo a partir de uma
 *   partida aproximada (`crossed`: diz-se de que lado está, "0,8 kg abaixo do
 *   objetivo", com `below`). Diz-se só o facto, sem barra.
 * - `remaining` é o que falta, já arredondado às casas da métrica (faltar
 *   "0,0 kg" é ter chegado).
 */
export function goalProgress(metric, readings, current, goal, since = null) {
  if (goal == null || !current || !Array.isArray(readings) || !readings.length) return null;
  const g = Number(goal);
  const cur = Number(current.value);
  if (!Number.isFinite(g) || !Number.isFinite(cur)) return null;
  let start = null;
  let approx = since?.approx || null;
  if (since?.since) {
    for (const r of readings) {
      if (r.date <= since.since) start = r;
      else break;
    }
    if (!start) {
      start = readings.find((r) => r.date >= since.since) || null;
      if (start) approx = approx || 'leitura_depois';
    }
  } else {
    const desde = addDaysISO(current.date, -GOAL_START_LOOKBACK_DAYS);
    start = readings.find((r) => r.date >= desde && r.date <= current.date) || null;
    approx = approx || 'sem_historico';
  }
  // Um período anterior ao ponto de partida não tem caminho para medir.
  if (!start || start.date > current.date) return null;
  const dec = Number.isInteger(metric?.dec) ? metric.dec : 1;
  const remaining = Number(Math.abs(g - cur).toFixed(dec));
  const sv = Number(start.value);
  const result = (o) => ({ start, remaining, pct: 0, reached: false, away: false, noPath: false, crossed: false, below: cur < g, approx, ...o });
  if (remaining === 0) return result({ pct: 100, reached: true });
  if (metric?.good === 'up' || metric?.good === 'down') {
    // +1: é bom subir; −1: é bom descer. Distâncias do lado MAU (≤ 0: em cima
    // do objetivo ou do lado bom).
    const dir = metric.good === 'up' ? 1 : -1;
    const gapNow = (g - cur) * dir;
    const gapStart = (g - sv) * dir;
    if (gapNow <= 0) return result({ pct: 100, reached: true });
    if (start.date === current.date) return result({ noPath: true });
    if (gapStart <= 0) return result({ away: true });
    const ratio = (gapStart - gapNow) / gapStart;
    return ratio < 0 ? result({ away: true }) : result({ pct: Math.min(100, Math.round(ratio * 100)) });
  }
  /* Sem sentido próprio (peso, massa óssea): o objetivo diz para onde ir.
     - A menos do ruído da balança (`noise`, 0,5 kg no peso) é estar lá.
     - Do mesmo lado que a partida: o caminho feito, para o lado do objetivo
       visto de AGORA.
     - Do outro lado: mais longe do que a partida é afastar-se; mais perto é
       ter passado o objetivo — "atingido" só se a partida é a do dia em que o
       definiste (o sentido que querias); com partida aproximada não se sabe
       se o querias passar, e diz-se só o que falta. */
  const noise = Number(metric?.noise) || 0;
  if (Math.abs(cur - g) < noise) return result({ pct: 100, reached: true });
  if (start.date === current.date) return result({ noPath: true });
  const sideNow = Math.sign(cur - g);
  const sideStart = Math.sign(sv - g);
  if (sideStart === sideNow) {
    const ratio = (Math.abs(sv - g) - Math.abs(cur - g)) / Math.abs(sv - g);
    return ratio < 0 ? result({ away: true }) : result({ pct: Math.min(100, Math.round(ratio * 100)) });
  }
  if (sideStart === 0 || Math.abs(cur - g) > Math.abs(sv - g)) return result({ away: true });
  return approx ? result({ noPath: true, crossed: true, below: cur < g }) : result({ pct: 100, reached: true });
}

// ── O que falta para a tendência do peso (2026-10-05) ───────────────────────

const addDaysISO = (iso, n) => {
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * Quantas pesagens faltam, e em que dias, para haver tendência (2026-10-05,
 * auditoria dos limiares C2 e pedido do dono: "Preciso de três pesagens
 * espalhadas por pelo menos 10 dias" numa semana lia-se como impossível).
 *
 * A régua é a do weightTrend.ts, que NÃO muda (a Carol usa-a): ≥3 pesagens nos
 * 14 dias até à última, a cobrir ≥10 dias — e as de antes do período contam.
 * Aqui só se procura, a partir de hoje, o menor número de pesagens novas que
 * a cumpre, e o intervalo de dias em que a última delas tem de cair:
 *   → { more, start, from, until, fresh } (ISO), ou null se as pesagens que
 *     já tens chegam para a tendência.
 *   more   pesagens que faltam (1–3)
 *   start  o 1.º dia em que se pode pesar (hoje; amanhã se já se pesou hoje)
 *   from   o 1.º dia em que a última pode cair
 *   until  o último dia em que ainda serve — sempre definido: a janela é de 14
 *          dias, por isso três pesagens novas, a primeira em `start`, têm a
 *          última entre start+10 e start+14 (revisão de 2026-10-05: "a última a
 *          partir de 15 out" prometia sem limite, e pesar a 5, 6 e 20 out não dá
 *          tendência)
 *   fresh  nenhuma das pesagens que já tens entra nas contas (são três novas)
 * `dates` são os dias com pesagem até hoje, por ordem cronológica.
 */
export function weightTrendNeed(dates, todayISO) {
  const days = [...new Set((Array.isArray(dates) ? dates : []).filter((d) => d && d <= todayISO))].sort();
  // Já há tendência com as que tens (a régua ancora na última pesagem): nada a
  // pedir. Revisão de 2026-10-05 — antes devolvia um plano mesmo assim.
  if (days.length) {
    const last = days[days.length - 1];
    const win = days.filter((d) => d >= addDaysISO(last, -WEIGHT_TREND_WINDOW_DAYS));
    if (win.length >= WEIGHT_TREND_MIN_POINTS && daysBetweenISO(win[0], last) >= WEIGHT_TREND_MIN_SPAN_DAYS) return null;
  }
  const start = days.includes(todayISO) ? addDaysISO(todayISO, 1) : todayISO;
  const horizon = WEIGHT_TREND_WINDOW_DAYS + WEIGHT_TREND_MIN_SPAN_DAYS + 2;
  let best = null;
  for (let k = 0; k <= horizon; k++) {
    const D = addDaysISO(start, k);
    const from = addDaysISO(D, -WEIGHT_TREND_WINDOW_DAYS);
    const ex = days.filter((d) => d >= from);
    // Sem nenhuma que conte, a 1.ª nova é em `start` — e tem de caber na janela.
    if (!ex.length && daysBetweenISO(start, D) > WEIGHT_TREND_WINDOW_DAYS) continue;
    const first = ex.length ? ex[0] : start;
    if (daysBetweenISO(first, D) < WEIGHT_TREND_MIN_SPAN_DAYS) continue;
    const more = Math.max(1, WEIGHT_TREND_MIN_POINTS - ex.length);
    // Uma pesagem por dia: duas no mesmo dia não espalham nada.
    if (more > daysBetweenISO(start, D) + 1) continue;
    if (!best || more < best.more) best = { more, start, from: D, until: D, fresh: ex.length === 0 };
    else if (more === best.more && best.until === addDaysISO(D, -1)) best.until = D;
  }
  return best;
}

/**
 * A estimativa com poucas pesagens (2026-10-05): da primeira à última do
 * período, em linha reta — é o que se diz quando não há tendência ("Desceste
 * 1,1 kg em 12 dias"). Calcula-se aqui e não no weightTrend.ts, que a Carol
 * usa e que só afirma ritmo com pesagens que cheguem.
 *   points  [{ date, weight }] por ordem cronológica (≥2)
 * → { first, last, n, diff, days, weeklyRate } (weeklyRate null com < 7 dias:
 *   esticar 3 dias a uma semana é inventar), ou null.
 */
export function weightEstimate(points) {
  if (!Array.isArray(points) || points.length < 2) return null;
  const first = points[0];
  const last = points[points.length - 1];
  const days = daysBetweenISO(first.date, last.date);
  if (!(days > 0)) return null;
  const diff = Math.round((Number(last.weight) - Number(first.weight)) * 100) / 100;
  return {
    first,
    last,
    n: points.length,
    diff,
    days,
    weeklyRate: days >= 7 ? Math.round((diff / days) * 7 * 100) / 100 : null,
  };
}

/**
 * As métricas medidas na avaliação `cur`, cada uma com a diferença face a
 * `ref` (null quando `ref` não a mediu) — vista Dia (D1, 2026-10-04).
 */
export function compareAssessments(cur, ref, profile) {
  return BODY_METRICS.filter((m) => hasReading(cur, m.key)).map((m) => {
    const value = readingOf(cur, m.key);
    const refValue = ref ? readingOf(ref, m.key) : null;
    const goal = goalOf(profile, m.key);
    return {
      key: m.key,
      metric: m,
      value,
      refValue,
      goal,
      cmp: refValue !== null ? compareValues(m, value, refValue, { goal }) : null,
    };
  });
}
