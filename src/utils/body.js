import { fmtNumber } from './verdicts/shared';

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
