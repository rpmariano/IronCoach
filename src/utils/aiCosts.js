/* Custos da API Gemini a partir de ai_usage (gravada pelo servidor; antes app_logs) — o que o Admin → Custos API
   mostra e o que alimenta a simulação de preço por utilizador.

   Auditoria de 2026-09-27 (depois de os créditos pré-pagos esgotarem sem
   aviso — bug #45): o painel subestimava o custo real por três vias.
   1. Tokens de raciocínio (thoughtsTokenCount) nunca eram lidos. A Google
      cobra-os ao preço de OUTPUT. Passam a vir em meta.thoughts_tokens
      (supabase/functions/_shared/geminiUsage.ts). Linhas anteriores não os
      têm: contam-se à parte (legacyCalls) para o painel o poder dizer.
   2. As segundas chamadas de cada registo (comentário da Carol, resumo do
      corpo, inferência de grupos musculares, legenda de prova) não entravam
      no usage devolvido. Corrigido no servidor; não há forma de recuperar o
      histórico.
   3. Os tokens servidos por cache (cached_tokens) eram cobrados a preço
      cheio — aqui o erro era para cima. Passam ao preço de leitura em cache.

   Preços por milhão de tokens, em USD, POR MODELO — o modelo real vem em
   ai_usage.model (modelVersion da resposta). A partir de 2026-09-27 as
   funções fixam "gemini-3.8-flash" (supabase/functions/_shared/
   geminiModel.ts), com fallback para o alias "gemini-flash-latest".

   `confirmed`: preço confirmado pelo dono do projeto na página oficial
   (ai.google.dev/gemini-api/docs/pricing, 27-09-2026; prompts ≤ 200k
   tokens — os nossos ficam muito abaixo).
   Linha Flash 3.7/3.8: tarifa introdutória até 31-12-2026 (0,75 / 3,75,
   cache 0,075), que DUPLICA a 01-01-2027 (1,50 / 7,50, cache 0,15) — o
   `from` de cada entrada trata disso sozinho, por data de cada chamada.
   2.5 Flash: duas tabelas recebidas no mesmo dia davam output 2,50 e 1,20;
   ficou 2,50 e não confirmado (não é usado).
   Cache: ~10% do input quando a tabela não a dá.
   Raciocínio (thoughts): ao preço de OUTPUT em todos os modelos com thinking.
   Ordem: do prefixo mais específico para o mais geral (flash-lite antes de
   flash) e, dentro do mesmo modelo, da data mais recente para a mais antiga.
   Confirmar SEMPRE contra o saldo real do AI Studio (painel "Saldo"). */
const FLASH_3X_2026 = { input: 0.75, output: 3.75, cached: 0.075, confirmed: true };
const FLASH_3X_2027 = { from: '2027-01-01', input: 1.50, output: 7.50, cached: 0.15, confirmed: true };
export const MODEL_PRICING = [
  { match: 'gemini-2.5-flash-lite', input: 0.10, output: 0.40, cached: 0.01, confirmed: true },
  { match: 'gemini-2.5-flash', input: 0.30, output: 2.50, cached: 0.03, confirmed: false },
  { match: 'gemini-2.5-pro', input: 1.25, output: 10.00, cached: 0.125, confirmed: true },
  { match: 'gemini-3.1-pro', input: 2.00, output: 12.00, cached: 0.20, confirmed: true },
  { match: 'gemini-3.5-flash', input: 1.50, output: 9.00, cached: 0.15, confirmed: true },
  { match: 'gemini-3.8-flash', ...FLASH_3X_2027 },
  { match: 'gemini-3.8-flash', ...FLASH_3X_2026 },
  { match: 'gemini-3.7-flash', ...FLASH_3X_2027 },
  { match: 'gemini-3.7-flash', ...FLASH_3X_2026 },
  { match: 'gemini-3-flash', input: 0.50, output: 3.00, cached: 0.05, confirmed: true },
];
// Linhas sem modelo e modelos fora da tabela: a linha Flash 3.8 (o modelo
// fixo em _shared/geminiModel.ts), mas marcado como estimativa.
export const DEFAULT_PRICING_2026 = { match: null, ...FLASH_3X_2026, confirmed: false };
export const DEFAULT_PRICING_2027 = { match: null, ...FLASH_3X_2027, confirmed: false };

export function pricingFor(model, isoDate = new Date().toISOString()) {
  const m = String(model || '').toLowerCase().replace(/^models\//, '');
  const day = String(isoDate || '').slice(0, 10);
  const applies = (p) => !p.from || day >= p.from;
  const hit = m && MODEL_PRICING.find(p => (m === p.match || m.startsWith(`${p.match}-`)) && applies(p));
  if (hit) return hit;
  return applies(DEFAULT_PRICING_2027) ? DEFAULT_PRICING_2027 : DEFAULT_PRICING_2026;
}

/* Câmbio USD→EUR para mostrar em euros (o carregamento no AI Studio é em
   euros, a tabela de preços em dólares). Editável no painel; este é só o
   ponto de partida. */
export const DEFAULT_USD_TO_EUR = 0.86;

export const COST_EVENT_MODULE = {
  // Edge Functions (novas e atuais)
  'analyze-meal': 'Nutrição',
  'analyze-body': 'Corpo',
  'analyze-gym': 'Ginásio',
  'analyze-run': 'Corrida',
  'analyze-diploma': 'Corrida',
  'coach-chat': 'Carol',
  'coach-daily-summary': 'Carol',
  // O texto das notificações da Carol, escrito pelo modelo no servidor (P.10).
  'coach-proactive-tick': 'Carol',
  'enrich-race-event': 'Corrida',
  'estimate-shoe-lifespan': 'Equipamento',
  // Eventos legado
  meal_analysis: 'Nutrição',
  meal_reanalysis: 'Nutrição',
  meal_item_estimate: 'Nutrição',
  body_analysis: 'Corpo',
  body_reanalysis: 'Corpo',
  gym_analysis: 'Ginásio',
  gym_reanalysis: 'Ginásio',
  run_analysis: 'Corrida',
  run_reanalysis: 'Corrida',
  coach_message: 'Carol',
  coach_daily_summary: 'Carol',
};

export function moduleOf(event) {
  return COST_EVENT_MODULE[event] || 'Outro';
}

/** Tokens de uma linha de app_logs, normalizados. */
export function tokensOf(meta) {
  const m = meta || {};
  const input = Number(m.input_tokens) || 0;
  // A cache nunca pode passar o input (proteção contra linhas estranhas).
  const cached = Math.min(Number(m.cached_tokens) || 0, input);
  return {
    input,
    cached,
    output: Number(m.output_tokens) || 0,
    thoughts: Number(m.thoughts_tokens) || 0,
    // Chamadas ao Gemini somadas neste registo (comentário da Carol, voltas
    // de function calling…). Linhas antigas não têm o campo: 1.
    geminiCalls: m.calls === undefined ? 1 : Number(m.calls) || 0,
    // As linhas gravadas antes da auditoria não trazem o campo.
    legacy: !('thoughts_tokens' in m),
  };
}

/** Custo em USD de uma linha: input não-cache + cache + (output + raciocínio). */
export function rowCostUsd(row) {
  const t = tokensOf(row?.meta);
  const p = pricingFor(row?.model, row?.created_at);
  return ((t.input - t.cached) * p.input + t.cached * p.cached + (t.output + t.thoughts) * p.output) / 1e6;
}

function emptyBucket() {
  return { calls: 0, geminiCalls: 0, input: 0, cached: 0, output: 0, thoughts: 0, cost: 0, legacyCalls: 0 };
}

function addTo(bucket, t, cost) {
  bucket.calls += 1;
  bucket.geminiCalls += t.geminiCalls;
  bucket.input += t.input;
  bucket.cached += t.cached;
  bucket.output += t.output;
  bucket.thoughts += t.thoughts;
  bucket.cost += cost;
  if (t.legacy) bucket.legacyCalls += 1;
}

/** Dia local (YYYY-MM-DD) de um timestamp ISO. */
export function localDay(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/** Nº de dias de calendário entre dois dias YYYY-MM-DD, inclusive. */
export function daysInclusive(startDay, endDay) {
  const a = Date.parse(`${startDay}T00:00:00Z`);
  const b = Date.parse(`${endDay}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0;
  return Math.round((b - a) / 86400000) + 1;
}

/**
 * Agrega as linhas (já filtradas) por total, utilizador, módulo, função e dia.
 * `period` = { start, end } em dias locais; serve para projetar o custo
 * mensal de cada utilizador sobre os dias em que ele EXISTIA no período
 * (conta criada a meio não dilui a média com dias em que não podia gastar).
 */
export function aggregateCosts(rows, { period, users = [] } = {}) {
  const total = emptyBucket();
  const byUser = new Map();
  const byModule = new Map();
  const byEvent = new Map();
  const byDay = new Map();
  const byModel = new Map();

  for (const row of rows || []) {
    const t = tokensOf(row.meta);
    if (!t.input && !t.output && !t.thoughts) continue;
    const cost = rowCostUsd(row);
    const day = localDay(row.created_at);
    addTo(total, t, cost);

    const uid = row.user_id || '—';
    if (!byUser.has(uid)) byUser.set(uid, { ...emptyBucket(), userId: uid, days: new Set() });
    const u = byUser.get(uid);
    addTo(u, t, cost);
    if (day) u.days.add(day);

    const mod = moduleOf(row.event);
    if (!byModule.has(mod)) byModule.set(mod, emptyBucket());
    addTo(byModule.get(mod), t, cost);

    if (!byEvent.has(row.event)) byEvent.set(row.event, emptyBucket());
    addTo(byEvent.get(row.event), t, cost);

    // O modelo real (modelVersion) — só nas linhas gravadas pelo servidor.
    const model = row.model || 'desconhecido';
    if (!byModel.has(model)) byModel.set(model, emptyBucket());
    addTo(byModel.get(model), t, cost);

    if (day) {
      if (!byDay.has(day)) byDay.set(day, emptyBucket());
      addTo(byDay.get(day), t, cost);
    }
  }

  const userById = new Map(users.map(u => [u.id, u]));
  const periodDays = period ? daysInclusive(period.start, period.end) : 0;
  const perUser = [...byUser.values()].map(u => {
    const info = userById.get(u.userId);
    // Dias em que a conta existia dentro do período.
    const createdDay = info?.created_at ? localDay(info.created_at) : null;
    const from = period && createdDay && createdDay > period.start ? createdDay : period?.start;
    const exposureDays = period ? Math.max(1, daysInclusive(from, period.end)) : Math.max(1, u.days.size);
    return {
      userId: u.userId,
      name: info?.display_name || info?.email || (u.userId === '—' ? 'Sem utilizador' : u.userId.slice(0, 8)),
      email: info?.email || null,
      calls: u.calls,
      geminiCalls: u.geminiCalls,
      input: u.input,
      cached: u.cached,
      output: u.output,
      thoughts: u.thoughts,
      cost: u.cost,
      legacyCalls: u.legacyCalls,
      activeDays: u.days.size,
      exposureDays,
      costPerActiveDay: u.days.size ? u.cost / u.days.size : 0,
      monthlyCost: (u.cost / exposureDays) * 30.44,
    };
  }).sort((a, b) => b.cost - a.cost);

  const sortByCost = (m) => [...m.entries()].map(([key, v]) => ({ key, ...v })).sort((a, b) => b.cost - a.cost);
  const perDay = [...byDay.entries()].map(([day, v]) => ({ day, ...v })).sort((a, b) => a.day.localeCompare(b.day));

  return { total, perUser, perModule: sortByCost(byModule), perEvent: sortByCost(byEvent), perModel: sortByCost(byModel), perDay, periodDays };
}

/** Percentil (0–1) por interpolação linear; 0 para lista vazia. */
export function percentile(values, q) {
  const v = [...values].filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return 0;
  const pos = (v.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return v[lo] + (v[hi] - v[lo]) * (pos - lo);
}

/**
 * Preço mensal (em EUR, IVA incluído) que cobre o custo de IA de um
 * utilizador com a margem pedida.
 *   preço s/ IVA = custo / ((1 − comissão) × (1 − margem))
 *   preço c/ IVA = preço s/ IVA × (1 + IVA)
 * `commission` = o que a loja/pagamentos ficam (0,15 = 15%); `margin` = a
 * fração do líquido (depois da comissão) que sobra depois de pagar a IA.
 * Só cobre a IA — alojamento, Supabase, suporte, etc. ficam de fora.
 */
export function suggestedPrice(monthlyCostEur, { margin = 0.7, commission = 0.15, vat = 0.23 } = {}) {
  const denom = (1 - commission) * (1 - margin);
  if (!(denom > 0) || !(monthlyCostEur >= 0)) return null;
  const net = monthlyCostEur / denom;
  return { net, gross: net * (1 + vat) };
}

/** Resumo da distribuição do custo mensal por utilizador ativo. */
export function pricingStats(perUser) {
  const monthly = perUser.filter(u => u.userId !== '—').map(u => u.monthlyCost);
  const n = monthly.length;
  return {
    users: n,
    mean: n ? monthly.reduce((s, x) => s + x, 0) / n : 0,
    median: percentile(monthly, 0.5),
    p90: percentile(monthly, 0.9),
    max: n ? Math.max(...monthly) : 0,
  };
}
