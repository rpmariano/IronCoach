import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import CarolIcon from '../Coach/CarolIcon';
import {
  aggregateCosts, COST_EVENT_MODULE, DEFAULT_USD_TO_EUR, localDay, moduleOf, pricingFor, pricingStats, suggestedPrice,
} from '../../utils/aiCosts';

/* Separador "Custos API" do Admin. Extraído de Admin.jsx na auditoria de
   custos de 2026-09-27 (ver o cabeçalho de utils/aiCosts.js): filtros por
   período, utilizador, módulo e função; custo por utilizador com projeção
   mensal; simulação de preço; e o saldo do carregamento no AI Studio, que é
   a única forma de confirmar que a estimativa bate com a fatura real. */

/* Limiares da sinalética "Cache do Coach".
   Contas feitas com os preços reais da linha Flash (0,75 input / 3,75
   output / 0,075 leitura em cache / 0,50 armazenamento por hora): manter
   uma cache explícita viva só se paga a si própria se houver pelo menos
   ~2 pedidos nessa mesma hora — abaixo disso a poupança na leitura não
   cobre o custo de a ter criado. É invariante ao tamanho do prompt (a conta
   dá o mesmo com 15 mil ou com 200 mil tokens), por isso o número fica fixo
   aqui em vez de derivado do tamanho do prompt do momento. */
const COACH_CACHE_BREAKEVEN_CALLS_PER_HOUR = 2;
// Menos chamadas registadas que isto e a amostra ainda é demasiado pequena
// para o padrão de horas-com-tráfego significar alguma coisa.
const COACH_CACHE_MIN_CALLS_FOR_SIGNAL = 20;
// % de tokens de input já servidos pelo caching IMPLÍCITO (automático, sem
// custo de armazenamento — o Google deteta sozinho o prefixo repetido).
// Acima disto, a explícita já não teria muito a acrescentar.
const COACH_CACHE_ALREADY_SAVING_PCT = 25;
// Nº de horas distintas que já bateram o break-even — exige um padrão
// sustentado, não uma rajada isolada de um teste manual.
const COACH_CACHE_SUSTAINED_HOURS = 3;

// Abaixo disto, a média por utilizador é anedótica — o painel avisa.
const MIN_USERS_FOR_PRICING = 10;
// PostgREST devolve no máximo 1000 linhas por pedido (max_rows do Supabase):
// o painel antigo pedia .limit(5000) e ficava, sem aviso, pelas primeiras
// 1000. Pagina-se até este teto.
const PAGE_SIZE = 1000;
const MAX_ROWS = 50000;

const PRESETS = [
  { key: 'hoje', label: 'Hoje', days: 1 },
  { key: '7d', label: '7 dias', days: 7 },
  { key: '30d', label: '30 dias', days: 30 },
  { key: '90d', label: '90 dias', days: 90 },
  { key: 'custom', label: 'Datas' },
];

const SETTINGS_KEY = 'ironcoach.admin.costs.v1';
const DEFAULT_SETTINGS = { usdToEur: DEFAULT_USD_TO_EUR, margin: 70, commission: 15, vat: 23, topUpEur: 20, topUpAt: '' };

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function addDays(day, n) {
  const d = new Date(`${day}T00:00:00`);
  d.setDate(d.getDate() + n);
  return localDay(d.toISOString());
}

function periodFor(preset, from, to) {
  const today = localDay(new Date().toISOString());
  if (preset === 'custom') {
    const start = from || today;
    const end = to && to >= start ? to : today;
    return { start, end };
  }
  const days = PRESETS.find(p => p.key === preset)?.days ?? 30;
  return { start: addDays(today, -(days - 1)), end: today };
}

// Linhas de ai_usage entre dois instantes (ISO), paginadas, no formato que
// utils/aiCosts.js lê ({ user_id, event, created_at, meta }). ai_usage é
// gravada pelo servidor (supabase/functions/_shared/usageRecorder.ts); as
// linhas 'client_backfill' vêm do app_logs antigo e não têm thoughts_tokens
// (NULL) — ficam de fora do meta para o painel as marcar como incompletas.
export function usageRowToLog(r) {
  const meta = {
    input_tokens: r.input_tokens,
    cached_tokens: r.cached_tokens,
    output_tokens: r.output_tokens,
    calls: r.calls,
  };
  if (r.thoughts_tokens !== null && r.thoughts_tokens !== undefined) meta.thoughts_tokens = r.thoughts_tokens;
  return { user_id: r.user_id, event: r.function, created_at: r.created_at, model: r.model || null, meta };
}

async function fetchUsageRows(fromIso, toIso) {
  const rows = [];
  for (let offset = 0; offset < MAX_ROWS; offset += PAGE_SIZE) {
    let q = supabase.from('ai_usage')
      .select('user_id, function, model, created_at, input_tokens, cached_tokens, output_tokens, thoughts_tokens, calls')
      .gte('created_at', fromIso);
    if (toIso) q = q.lt('created_at', toIso);
    const { data, error } = await q
      // Ascendente: uma linha inserida durante a paginação cai no fim, em vez
      // de empurrar as seguintes e repetir a da fronteira entre páginas.
      .order('created_at', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data || []).map(usageRowToLog));
    if (!data || data.length < PAGE_SIZE) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

const eur = (usd, rate, digits = 2) => `${(usd * rate).toLocaleString('pt-PT', { minimumFractionDigits: digits, maximumFractionDigits: digits })} €`;
const usdFmt = (usd) => `$${usd.toFixed(4)}`;
const int = (n) => Math.round(n).toLocaleString('pt-PT');

const selectCls = 'w-full bg-[var(--bg-sheet)] border border-[var(--border-glass-strong)] rounded-xl py-2.5 px-3 text-xs text-[var(--text-2)] outline-none min-h-[44px]';
const cardCls = 'card rounded-2xl p-4 bg-[var(--surface-glass)] border border-[var(--border-glass)]';

function NumberField({ label, value, onChange, step = 1, suffix }) {
  return (
    <label className="block">
      <span className="text-[11px] text-[var(--text-3)]">{label}</span>
      <div className="flex items-center gap-1 mt-0.5">
        <input type="number" inputMode="decimal" step={step} value={value}
          onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))}
          className={`${selectCls} min-h-[40px] py-2`} />
        {suffix && <span className="text-[11px] text-[var(--text-3)]">{suffix}</span>}
      </div>
    </label>
  );
}

export default function CostsTab({ users = [] }) {
  const [preset, setPreset] = useState('30d');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [userId, setUserId] = useState('');
  const [moduleKey, setModuleKey] = useState('');
  const [eventKey, setEventKey] = useState('');
  const [rows, setRows] = useState([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [settings, setSettings] = useState(loadSettings);
  const [balance, setBalance] = useState(null);
  const [balanceTick, setBalanceTick] = useState(0);

  const period = useMemo(() => periodFor(preset, from, to), [preset, from, to]);
  const rate = Number(settings.usdToEur) || DEFAULT_USD_TO_EUR;

  const updateSetting = (key, value) => {
    setSettings(prev => {
      const next = { ...prev, [key]: value };
      try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch { /* sem storage: fica só nesta sessão */ }
      return next;
    });
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const fromIso = new Date(`${period.start}T00:00:00`).toISOString();
        const toIso = new Date(`${addDays(period.end, 1)}T00:00:00`).toISOString();
        const res = await fetchUsageRows(fromIso, toIso);
        if (cancelled) return;
        setRows(res.rows);
        setTruncated(res.truncated);
      } catch (err) {
        console.error(err);
        if (!cancelled) { setRows([]); setLoadError('Não foi possível carregar os registos de consumo.'); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [period.start, period.end]);

  // Gasto estimado desde o último carregamento — independente dos filtros.
  useEffect(() => {
    if (!settings.topUpAt) { setBalance(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const since = new Date(settings.topUpAt);
        if (Number.isNaN(since.getTime())) { setBalance(null); return; }
        const res = await fetchUsageRows(since.toISOString(), null);
        if (cancelled) return;
        const agg = aggregateCosts(res.rows);
        const hours = Math.max(1, (Date.now() - since.getTime()) / 3600000);
        setBalance({ spentUsd: agg.total.cost, calls: agg.total.calls, perDayUsd: (agg.total.cost / hours) * 24, hours, truncated: res.truncated });
      } catch (err) {
        console.error(err);
        if (!cancelled) setBalance(null);
      }
    })();
    return () => { cancelled = true; };
  }, [settings.topUpAt, balanceTick]);

  const filtered = useMemo(() => rows.filter(r =>
    (!userId || (userId === '—' ? !r.user_id : r.user_id === userId))
    && (!moduleKey || moduleOf(r.event) === moduleKey)
    && (!eventKey || r.event === eventKey)), [rows, userId, moduleKey, eventKey]);

  const agg = useMemo(() => aggregateCosts(filtered, { period, users }), [filtered, period, users]);
  // A simulação de preço olha para TODOS os módulos (o que um utilizador
  // custa por mês), mas respeita o período e o filtro de utilizador.
  const aggAllModules = useMemo(() => aggregateCosts(
    rows.filter(r => !userId || (userId === '—' ? !r.user_id : r.user_id === userId)), { period, users },
  ), [rows, userId, period, users]);
  const stats = useMemo(() => pricingStats(aggAllModules.perUser), [aggAllModules]);

  const moduleOptions = useMemo(() => [...new Set(Object.values(COST_EVENT_MODULE))].sort(), []);
  const eventOptions = useMemo(() => [...new Set(rows.map(r => r.event))]
    .filter(e => !moduleKey || moduleOf(e) === moduleKey).sort(), [rows, moduleKey]);

  // O período mudou e a função escolhida deixou de existir nele: limpa o
  // filtro em vez de deixar o painel vazio sem nada visível no select.
  useEffect(() => {
    if (eventKey && !loading && !eventOptions.includes(eventKey)) setEventKey('');
  }, [eventKey, eventOptions, loading]);

  const priceOpts = { margin: (Number(settings.margin) || 0) / 100, commission: (Number(settings.commission) || 0) / 100, vat: (Number(settings.vat) || 0) / 100 };
  const priceMean = suggestedPrice(stats.mean * rate, priceOpts);
  const priceP90 = suggestedPrice(stats.p90 * rate, priceOpts);

  // ── Sinalética "Cache do Coach" (sobre o período, todos os utilizadores
  // do filtro) — decide com dados reais se compensa caching explícito.
  const coachRows = filtered.filter(l => l.event === 'coach-chat');
  let coachInput = 0, coachCached = 0;
  const hourBuckets = {};
  for (const l of coachRows) {
    coachInput += Number(l.meta?.input_tokens) || 0;
    coachCached += Number(l.meta?.cached_tokens) || 0;
    const hour = (l.created_at || '').slice(0, 13);
    if (hour) hourBuckets[hour] = (hourBuckets[hour] || 0) + 1;
  }
  const cacheHitPct = coachInput > 0 ? Math.round((coachCached / coachInput) * 100) : 0;
  const activeHourCounts = Object.values(hourBuckets);
  const sustainedHours = activeHourCounts.filter(c => c >= COACH_CACHE_BREAKEVEN_CALLS_PER_HOUR).length;
  let cacheSignal;
  if (coachRows.length < COACH_CACHE_MIN_CALLS_FOR_SIGNAL) {
    cacheSignal = { level: 'insuficiente', label: 'Ainda sem dados suficientes', detail: `${coachRows.length} chamada(s) registadas — a partir de ${COACH_CACHE_MIN_CALLS_FOR_SIGNAL} já dá para ler um padrão.` };
  } else if (cacheHitPct >= COACH_CACHE_ALREADY_SAVING_PCT) {
    cacheSignal = { level: 'ja_poupa', label: 'O caching implícito já está a poupar', detail: `${cacheHitPct}% dos tokens de input já vêm de cache automática, sem custo de armazenamento — não parece valer a pena montar caching explícito agora.` };
  } else if (sustainedHours >= COACH_CACHE_SUSTAINED_HOURS) {
    cacheSignal = { level: 'vale_a_pena', label: 'Vale a pena montar caching explícito', detail: `${sustainedHours} hora(s) diferentes já tiveram ${COACH_CACHE_BREAKEVEN_CALLS_PER_HOUR}+ chamadas à Carol — nessas horas, uma cache explícita já se teria pago sozinha.` };
  } else {
    cacheSignal = { level: 'ainda_nao', label: 'Tráfego ainda baixo para compensar', detail: `Só ${sustainedHours} hora(s) com ${COACH_CACHE_BREAKEVEN_CALLS_PER_HOUR}+ chamadas em ${activeHourCounts.length} hora(s) com atividade — o custo de armazenamento ainda não se pagaria com regularidade.` };
  }
  const CACHE_SIGNAL_STYLES = {
    insuficiente: { badge: 'bg-[var(--surface-strong)] text-[var(--text-3)] border-[var(--border-glass)]', text: 'text-[var(--text-3)]' },
    ja_poupa: { badge: 'bg-[var(--tint-run-bg)] text-[var(--run)] border-[var(--tint-run-bd)]', text: 'text-[var(--run)]' },
    vale_a_pena: { badge: 'bg-[var(--tint-warn-bg)] text-[var(--warn)] border-[var(--tint-warn-bd)]', text: 'text-[var(--warn)]' },
    ainda_nao: { badge: 'bg-[var(--surface-strong)] text-[var(--text-3)] border-[var(--border-glass)]', text: 'text-[var(--text-3)]' },
  };
  const cacheStyle = CACHE_SIGNAL_STYLES[cacheSignal.level];

  const { total } = agg;
  const maxDayCost = Math.max(0, ...agg.perDay.map(d => d.cost));
  const topUpEur = Number(settings.topUpEur) || 0;
  const remainingEur = balance ? topUpEur - balance.spentUsd * rate : null;
  const daysLeft = balance && balance.perDayUsd > 0 ? Math.max(0, remainingEur / (balance.perDayUsd * rate)) : null;

  return (
    <div className="space-y-3 fade-in">
      {/* ── Filtros ─────────────────────────────────────────────────── */}
      <div className="flex gap-1.5">
        {PRESETS.map(p => (
          <button key={p.key} onClick={() => setPreset(p.key)}
            className={`flex-1 min-h-[44px] border border-[var(--border-glass-strong)] rounded-xl py-2 text-[11px] font-semibold transition ${preset === p.key ? 'bg-[var(--coach)] text-[var(--coach-ink)]' : 'text-[var(--text-3)]'}`}>
            {p.label}
          </button>
        ))}
      </div>
      {preset === 'custom' && (
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-[11px] text-[var(--text-3)]">De</span>
            <input type="date" value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} className={selectCls} />
          </label>
          <label className="block">
            <span className="text-[11px] text-[var(--text-3)]">Até</span>
            <input type="date" value={to} min={from || undefined} onChange={e => setTo(e.target.value)} className={selectCls} />
          </label>
        </div>
      )}
      <select value={userId} onChange={e => setUserId(e.target.value)} className={selectCls} aria-label="Utilizador">
        <option value="">Todos os utilizadores</option>
        {users.map(u => <option key={u.id} value={u.id}>{u.display_name || u.email}</option>)}
      </select>
      <div className="grid grid-cols-2 gap-2">
        <select value={moduleKey} onChange={e => { setModuleKey(e.target.value); setEventKey(''); }} className={selectCls} aria-label="Módulo">
          <option value="">Todos os módulos</option>
          {moduleOptions.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={eventKey} onChange={e => setEventKey(e.target.value)} className={selectCls} aria-label="Função">
          <option value="">Todas as funções</option>
          {eventOptions.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
      </div>
      <p className="text-[11px] text-[var(--text-3)] text-center">{period.start} → {period.end} · {agg.periodDays} dia(s)</p>

      {loading ? (
        <div className="flex items-center justify-center py-10 text-[var(--text-3)] text-xs gap-2">
          <div className="w-4 h-4 border-2 border-[var(--border-glass)] border-t-slate-400 rounded-full animate-spin" /> A carregar...
        </div>
      ) : loadError ? (
        <p className="text-xs text-[var(--danger)] text-center py-6">{loadError}</p>
      ) : (
        <>
          {/* ── Total ─────────────────────────────────────────────────── */}
          <div className={`${cardCls} text-center`}>
            <p className="text-[11px] text-[var(--text-3)] uppercase tracking-wide mb-1">Custo estimado (Gemini)</p>
            <p className="text-3xl font-extrabold">{eur(total.cost, rate)}</p>
            <p className="text-[11px] text-[var(--text-3)] mt-0.5">{usdFmt(total.cost)} · {total.calls} registo(s) · {total.geminiCalls} chamada(s) ao Gemini · {total.calls ? eur(total.cost / total.calls, rate, 4) : '—'}/registo</p>
            <div className="grid grid-cols-4 gap-1 mt-3 text-center">
              {[['Input', total.input - total.cached], ['Cache', total.cached], ['Output', total.output], ['Raciocínio', total.thoughts]].map(([l, v]) => (
                <div key={l}><p className="text-xs font-bold">{int(v)}</p><p className="text-[10px] text-[var(--text-3)]">{l}</p></div>
              ))}
            </div>
            {total.legacyCalls > 0 && (
              <p className="text-[11px] text-[var(--warn)] mt-3 leading-relaxed">
                {total.legacyCalls} de {total.calls} registo(s) são anteriores à correção da contagem (27-09-2026): não incluem o raciocínio do modelo
                nem o comentário da Carol nos registos. O custo real desse período foi maior do que o mostrado.
              </p>
            )}
            {truncated && <p className="text-[11px] text-[var(--warn)] mt-2">Mais de {int(MAX_ROWS)} registos — escolhe um período mais curto.</p>}
          </div>

          {/* ── Saldo do carregamento ─────────────────────────────────── */}
          <div className={`${cardCls} space-y-2.5`}>
            <p className="text-xs font-semibold">Saldo do carregamento (AI Studio)</p>
            <div className="grid grid-cols-2 gap-2">
              <NumberField label="Valor carregado" value={settings.topUpEur} step={1} suffix="€" onChange={v => updateSetting('topUpEur', v)} />
              <label className="block">
                <span className="text-[11px] text-[var(--text-3)]">Carregado em</span>
                <input type="datetime-local" value={settings.topUpAt} onChange={e => updateSetting('topUpAt', e.target.value)} className={`${selectCls} min-h-[40px] py-2 mt-0.5`} />
              </label>
            </div>
            {!settings.topUpAt ? (
              <p className="text-[11px] text-[var(--text-3)]">Indica quando carregaste para acompanhar o gasto estimado desde então.</p>
            ) : balance ? (
              <>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div><p className="text-sm font-bold">{eur(balance.spentUsd, rate)}</p><p className="text-[11px] text-[var(--text-3)]">gasto estimado</p></div>
                  <div><p className={`text-sm font-bold ${remainingEur < topUpEur * 0.2 ? 'text-[var(--warn)]' : ''}`}>{eur(remainingEur, 1)}</p><p className="text-[11px] text-[var(--text-3)]">restante</p></div>
                  <div><p className="text-sm font-bold">{remainingEur <= 0 ? 'esgotado' : daysLeft == null ? '—' : daysLeft > 999 ? '999+' : Math.floor(daysLeft)}</p><p className="text-[11px] text-[var(--text-3)]">dias ao ritmo atual</p></div>
                </div>
                <p className="text-[11px] text-[var(--text-3)] leading-relaxed">
                  {balance.calls} registo(s) · {eur(balance.perDayUsd, rate)}/dia. Compara o restante com o saldo real no AI Studio: se divergir muito,
                  os preços ou o câmbio abaixo estão desatualizados.
                  {' '}<button onClick={() => setBalanceTick(t => t + 1)} className="underline font-semibold">Atualizar</button>
                </p>
                {balance.truncated && <p className="text-[11px] text-[var(--warn)]">Mais de {int(MAX_ROWS)} registos desde o carregamento — o gasto está subestimado.</p>}
              </>
            ) : (
              <p className="text-[11px] text-[var(--text-3)]">A calcular…</p>
            )}
          </div>

          {/* ── Por utilizador ────────────────────────────────────────── */}
          <div className={`${cardCls} space-y-2`}>
            <p className="text-xs font-semibold">Por utilizador</p>
            {agg.perUser.length === 0 ? (
              <p className="text-xs text-[var(--text-3)] text-center py-4">Sem chamadas com dados de tokens neste período.</p>
            ) : agg.perUser.map(u => (
              <button key={u.userId} disabled={u.userId === '—'} onClick={() => setUserId(userId === u.userId ? '' : u.userId)}
                className="w-full text-left rounded-xl p-3 border border-[var(--border-glass)] hover:bg-[var(--surface-strong)] transition">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold truncate">{u.name}</p>
                  <p className="text-xs font-bold text-[var(--coach)] whitespace-nowrap">{eur(u.cost, rate)}</p>
                </div>
                <p className="text-[11px] text-[var(--text-3)] mt-0.5">
                  {u.calls} registo(s) · {u.activeDays} dia(s) ativo(s) · {total.cost ? Math.round((u.cost / total.cost) * 100) : 0}% do total
                </p>
                <p className="text-[11px] text-[var(--text-3)]">
                  {eur(u.costPerActiveDay, rate)}/dia ativo · projeção <span className="font-semibold text-[var(--text-2)]">{eur(u.monthlyCost, rate)}/mês</span>
                </p>
              </button>
            ))}
          </div>

          {/* ── Por módulo e por função ───────────────────────────────── */}
          <div className={`${cardCls} space-y-2`}>
            <p className="text-xs font-semibold">Por módulo</p>
            {agg.perModule.map(m => (
              <div key={m.key}>
                <div className="flex items-center justify-between text-xs">
                  <span>{m.key}</span>
                  <span className="font-bold">{eur(m.cost, rate)}</span>
                </div>
                <div className="h-1.5 rounded bg-[var(--surface-strong)] mt-1 overflow-hidden">
                  <div className="h-full bg-[var(--coach)]" style={{ width: `${total.cost ? (m.cost / total.cost) * 100 : 0}%` }} />
                </div>
              </div>
            ))}
            <p className="text-xs font-semibold pt-2">Por modelo</p>
            {agg.perModel.map(m => {
              const p = pricingFor(m.key === 'desconhecido' ? null : m.key);
              return (
                <div key={m.key} className="text-[11px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate">{m.key}</span>
                    <span className="text-[var(--text-3)] whitespace-nowrap">{m.calls}× · <span className="font-semibold text-[var(--text-2)]">{eur(m.cost, rate)}</span></span>
                  </div>
                  <p className={p.confirmed ? 'text-[var(--text-3)]' : 'text-[var(--warn)]'}>
                    ${p.input.toFixed(2)} input · ${p.output.toFixed(2)} output e raciocínio / milhão{p.confirmed ? '' : ' — preço estimado, não confirmado'}
                  </p>
                </div>
              );
            })}
            <p className="text-xs font-semibold pt-2">Por função</p>
            {agg.perEvent.map(e => (
              <div key={e.key} className="flex items-center justify-between gap-2 text-[11px]">
                <span className="truncate">{e.key}</span>
                <span className="text-[var(--text-3)] whitespace-nowrap">{e.calls}× · {eur(e.calls ? e.cost / e.calls : 0, rate, 4)}/registo · <span className="font-semibold text-[var(--text-2)]">{eur(e.cost, rate)}</span></span>
              </div>
            ))}
          </div>

          {/* ── Evolução diária ───────────────────────────────────────── */}
          {agg.perDay.length > 0 && (
            <div className={`${cardCls} space-y-1`}>
              <p className="text-xs font-semibold mb-1">Por dia</p>
              {agg.perDay.slice(-31).map(d => (
                <div key={d.day} className="flex items-center gap-2 text-[11px]">
                  <span className="w-12 text-[var(--text-3)]">{d.day.slice(8, 10)}/{d.day.slice(5, 7)}</span>
                  <div className="flex-1 h-2 rounded bg-[var(--surface-strong)] overflow-hidden">
                    <div className="h-full bg-[var(--coach)]" style={{ width: `${maxDayCost ? (d.cost / maxDayCost) * 100 : 0}%` }} />
                  </div>
                  <span className="w-16 text-right">{eur(d.cost, rate)}</span>
                </div>
              ))}
            </div>
          )}

          {/* ── Quanto cobrar ─────────────────────────────────────────── */}
          <div className={`${cardCls} space-y-2.5`}>
            <p className="text-xs font-semibold">Quanto cobrar por utilizador (só IA)</p>
            <div className="grid grid-cols-4 gap-2 text-center">
              {[['Média', stats.mean], ['Mediana', stats.median], ['P90', stats.p90], ['Máximo', stats.max]].map(([l, v]) => (
                <div key={l}><p className="text-sm font-bold">{eur(v, rate)}</p><p className="text-[10px] text-[var(--text-3)]">{l}/mês</p></div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <NumberField label="Margem sobre a IA" value={settings.margin} suffix="%" onChange={v => updateSetting('margin', v)} />
              <NumberField label="Comissão loja/pagamentos" value={settings.commission} suffix="%" onChange={v => updateSetting('commission', v)} />
              <NumberField label="IVA" value={settings.vat} suffix="%" onChange={v => updateSetting('vat', v)} />
              <NumberField label="Câmbio USD→EUR" value={settings.usdToEur} step={0.01} onChange={v => updateSetting('usdToEur', v)} />
            </div>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded-xl p-2 border border-[var(--border-glass)]">
                <p className="text-base font-extrabold">{priceMean ? eur(priceMean.gross, 1) : '—'}</p>
                <p className="text-[11px] text-[var(--text-3)]">/mês c/ IVA — cobre a média</p>
              </div>
              <div className="rounded-xl p-2 border border-[var(--border-glass)]">
                <p className="text-base font-extrabold">{priceP90 ? eur(priceP90.gross, 1) : '—'}</p>
                <p className="text-[11px] text-[var(--text-3)]">/mês c/ IVA — cobre 90% dos utilizadores</p>
              </div>
            </div>
            <p className="text-[11px] text-[var(--text-3)] leading-relaxed">
              Custo mensal projetado de cada utilizador = custo no período ÷ dias em que a conta existia × 30,4. Todos os módulos, o período e o
              utilizador escolhidos acima. Preço = custo ÷ ((1 − comissão) × (1 − margem)) × (1 + IVA). Só cobre a IA: Supabase, alojamento
              e suporte ficam de fora.
            </p>
            {stats.users < MIN_USERS_FOR_PRICING && (
              <p className="text-[11px] text-[var(--warn)] leading-relaxed">
                Amostra de {stats.users} utilizador(es): a média ainda não representa um cliente típico. Usa-a como ordem de grandeza.
              </p>
            )}
          </div>

          {/* Sinalética de decisão: caching explícito do prompt do Coach.
              Só o coach-chat entra nesta análise — é o único caminho onde o
              prefixo do prompt é grande e idêntico entre TODOS os atletas. */}
          <div className={`${cardCls} space-y-2.5`}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold flex items-center gap-1.5">
                <CarolIcon size={14} className="text-[var(--mod-coach-to)]" /> Cache da Carol
              </p>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded border whitespace-nowrap ${cacheStyle.badge}`}>{cacheSignal.label}</span>
            </div>
            <p className={`text-[11px] leading-relaxed ${cacheStyle.text}`}>{cacheSignal.detail}</p>
            <div className="grid grid-cols-3 gap-2 pt-1">
              <div className="text-center"><p className="text-sm font-bold">{coachRows.length}</p><p className="text-[11px] text-[var(--text-3)]">chamadas</p></div>
              <div className="text-center"><p className="text-sm font-bold">{cacheHitPct}%</p><p className="text-[11px] text-[var(--text-3)]">já em cache</p></div>
              <div className="text-center"><p className="text-sm font-bold">{sustainedHours}<span className="text-[var(--text-3)]">/{activeHourCounts.length}</span></p><p className="text-[11px] text-[var(--text-3)]">horas ≥{COACH_CACHE_BREAKEVEN_CALLS_PER_HOUR}/h</p></div>
            </div>
          </div>

          <p className="text-[11px] text-[var(--text-3)] text-center px-2">
            Custo calculado com o preço do modelo real de cada chamada (ver "Por modelo"). Raciocínio cobrado como output; cache a ~10% do input.
            Os preços estão em utils/aiCosts.js — os marcados "não confirmado" são estimativas.
          </p>
        </>
      )}
    </div>
  );
}
