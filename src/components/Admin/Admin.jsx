import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store';
import { LayoutGrid, Users, BarChart3, CircleDollarSign, ScrollText, AlertCircle, CheckCircle2, ShieldAlert, Utensils, Bot, Activity } from 'lucide-react';

const ADMIN_TABS = [
  { key: 'overview', label: 'Visão Geral', icon: LayoutGrid },
  { key: 'users', label: 'Utilizadores', icon: Users },
  { key: 'metrics', label: 'Métricas', icon: BarChart3 },
  { key: 'costs', label: 'Custos API', icon: CircleDollarSign },
  { key: 'logs', label: 'Logs', icon: ScrollText },
];

const GEMINI_PRICE_PER_M_INPUT = 0.30;
const GEMINI_PRICE_PER_M_OUTPUT = 2.50;
const GEMINI_COST_EVENT_MODULE = {
  meal_analysis: 'Nutrição', meal_reanalysis: 'Nutrição', meal_item_estimate: 'Nutrição',
  body_analysis: 'Corpo', body_reanalysis: 'Corpo',
  gym_analysis: 'Ginásio', gym_reanalysis: 'Ginásio',
  run_analysis: 'Corrida', run_reanalysis: 'Corrida',
};

function geminiCost(inputTokens, outputTokens) {
  return (inputTokens / 1e6) * GEMINI_PRICE_PER_M_INPUT + (outputTokens / 1e6) * GEMINI_PRICE_PER_M_OUTPUT;
}

function rangeBounds(rangeStr) {
  const end = new Date().toISOString().slice(0, 10);
  let d = new Date();
  if (rangeStr === 'semana') d.setDate(d.getDate() - 7);
  else if (rangeStr === 'mes') d.setDate(d.getDate() - 30);
  const start = d.toISOString().slice(0, 10);
  return { start, end };
}

export default function Admin() {
  const { profile } = useAppStore();
  const [activeTab, setActiveTab] = useState('overview');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // States for Metrics and Costs
  const [metricsRange, setMetricsRange] = useState('mes');
  const [selectedUserId, setSelectedUserId] = useState('');
  
  const [costRange, setCostRange] = useState('mes');
  const [costLogs, setCostLogs] = useState([]);
  const [costLoading, setCostLoading] = useState(false);

  useEffect(() => {
    if (!profile?.is_admin) return;
    loadAdminData();
  }, [profile]);

  useEffect(() => {
    if (!profile?.is_admin || activeTab !== 'costs') return;
    loadAdminCostData();
  }, [activeTab, costRange, profile]);

  const loadAdminCostData = async () => {
    setCostLoading(true);
    try {
      const { start } = rangeBounds(costRange);
      const { data: logs, error } = await supabase.from('app_logs')
        .select('event, meta, created_at')
        .eq('level', 'success')
        .gte('created_at', `${start}T00:00:00.000Z`)
        .order('created_at', { ascending: false })
        .limit(5000);
      if (error) throw error;
      setCostLogs(logs || []);
    } catch (err) {
      console.error(err);
      setCostLogs([]);
    } finally {
      setCostLoading(false);
    }
  };

  const loadAdminData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Carregar utilizadores via RPC e outras métricas
      const [usersRes, logsRes, mealsRes, coachRes] = await Promise.all([
        supabase.rpc('admin_list_users'),
        supabase.from('app_logs').select('*').order('created_at', { ascending: false }).limit(300),
        supabase.from('meals').select('id, user_id, date, meal_type, created_at'),
        supabase.from('coach_messages').select('id, user_id, role, created_at')
      ]);

      if (usersRes.error) throw usersRes.error;
      if (logsRes.error) throw logsRes.error;
      if (mealsRes.error) throw mealsRes.error;
      if (coachRes.error) throw coachRes.error;

      setData({
        users: usersRes.data || [],
        logs: logsRes.data || [],
        meals: mealsRes.data || [],
        coachMsgs: coachRes.data || []
      });
    } catch (err) {
      console.error('Error loading admin data:', err);
      setError(err.message || 'Erro ao carregar dados de administração.');
    } finally {
      setLoading(false);
    }
  };

  if (!profile?.is_admin) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500 mt-20 fade-in">
        <ShieldAlert size={48} className="text-red-500/50 mb-4" />
        <p>Acesso negado. Esta área é reservada a administradores.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500 mt-20 fade-in">
        <div className="w-8 h-8 border-4 border-slate-700 border-t-slate-400 rounded-full animate-spin mb-4" />
        <p className="text-xs">A carregar dados de administração...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-center space-y-3 m-4 fade-in">
        <p className="text-xs text-red-300">{error}</p>
        <button onClick={loadAdminData} className="text-[11px] text-red-200 underline">Tentar novamente</button>
      </div>
    );
  }

  const { users, logs, meals, coachMsgs } = data;
  
  // Overview calculations
  const today = new Date().toISOString().slice(0, 10);
  const logsToday = logs.filter(l => (l.created_at || '').slice(0, 10) === today);
  const errorsToday = logsToday.filter(l => l.level === 'error').length;
  const successToday = logsToday.filter(l => l.level === 'success').length;

  return (
    <div className="space-y-4 fade-in pb-8">
      {/* Scrollable Tabs */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 px-1">
        {ADMIN_TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`shrink-0 flex items-center gap-1.5 border border-neutral-700 rounded-xl py-2 px-3 text-xs font-semibold transition ${
              activeTab === t.key ? 'bg-[var(--accent)] shadow-md' : 'text-slate-400 hover:text-slate-200 bg-neutral-900/50'
            }`}
            style={activeTab === t.key ? { color: '#fff' } : undefined}
          >
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-3 fade-in">
          <div className="grid grid-cols-2 gap-3">
            <div className="card rounded-2xl p-4 bg-neutral-900/50 border border-neutral-800">
              <div className="flex items-center gap-2 mb-1.5 text-slate-400">
                <Users size={16} />
                <span className="text-xs">Utilizadores registados</span>
              </div>
              <p className="text-2xl font-bold leading-none">{users.length}</p>
            </div>
            
            <div className="card rounded-2xl p-4 bg-neutral-900/50 border border-neutral-800">
              <div className="flex items-center gap-2 mb-1.5 text-slate-400">
                <Utensils size={16} />
                <span className="text-xs">Refeições registadas</span>
              </div>
              <p className="text-2xl font-bold leading-none">{meals.length}</p>
            </div>

            <div className="card rounded-2xl p-4 bg-neutral-900/50 border border-neutral-800">
              <div className="flex items-center gap-2 mb-1.5 text-slate-400">
                <Bot size={16} />
                <span className="text-xs">Mensagens ao Coach</span>
              </div>
              <p className="text-2xl font-bold leading-none">{coachMsgs.filter(m => m.role === 'user').length}</p>
            </div>

            <div className="card rounded-2xl p-4 bg-neutral-900/50 border border-neutral-800">
              <div className="flex items-center gap-2 mb-1.5 text-slate-400">
                <Activity size={16} />
                <span className="text-xs">Eventos hoje</span>
              </div>
              <p className="text-2xl font-bold leading-none">{logsToday.length}</p>
              <p className="text-[11px] text-slate-500 mt-1">{successToday} sucesso · {errorsToday} erro</p>
            </div>
          </div>
          
          <div className="card rounded-2xl p-4 bg-neutral-900/50 border border-neutral-800 flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-500 mb-1">Estado do Sistema</p>
              <div className="flex items-center gap-1.5 text-sm font-semibold text-emerald-400">
                <CheckCircle2 size={16} /> Operacional
              </div>
            </div>
            <button onClick={loadAdminData} className="text-[10px] bg-neutral-800 px-3 py-1.5 rounded-lg text-slate-300 font-semibold active:scale-95">
              Atualizar
            </button>
          </div>
        </div>
      )}

      {activeTab === 'users' && (
        <div className="space-y-2 fade-in">
          {[...users].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')).map(u => {
            const mealCount = meals.filter(m => m.user_id === u.id).length;
            const msgCount = coachMsgs.filter(m => m.user_id === u.id && m.role === 'user').length;
            
            return (
              <div key={u.id} className="card rounded-2xl p-4 bg-neutral-900/50 border border-neutral-800 flex justify-between items-center">
                <div className="min-w-0 pr-3">
                  <p className="text-sm font-bold truncate">{u.display_name || u.email}</p>
                  <p className="text-[10px] text-slate-500 truncate">{u.email}</p>
                  <p className="text-[9px] text-slate-600 mt-1.5">
                    Criado a {new Date(u.created_at).toLocaleDateString('pt-PT')}
                  </p>
                </div>
                <div className="shrink-0 flex flex-col items-end gap-1.5">
                  <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                    u.tier === 'pro' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {u.tier?.toUpperCase() || 'FREE'}
                  </span>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="flex items-center gap-1 text-[10px] text-slate-400" title="Refeições">
                      <Utensils size={10} /> {mealCount}
                    </span>
                    <span className="flex items-center gap-1 text-[10px] text-slate-400" title="Mensagens Coach">
                      <Bot size={10} /> {msgCount}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
          {users.length === 0 && <p className="text-xs text-slate-500 text-center py-4">Nenhum utilizador encontrado.</p>}
        </div>
      )}

      {activeTab === 'metrics' && (() => {
        const { start, end } = rangeBounds(metricsRange);
        const scopeMeals = meals.filter(m => m.date >= start && m.date <= end && (!selectedUserId || m.user_id === selectedUserId));
        const scopeMsgs = coachMsgs.filter(m => m.role === 'user' && (m.created_at || '').slice(0, 10) >= start && (m.created_at || '').slice(0, 10) <= end && (!selectedUserId || m.user_id === selectedUserId));
        const activeUsers = new Set(scopeMeals.map(m => m.user_id).concat(scopeMsgs.map(m => m.user_id))).size;

        return (
          <div className="space-y-3 fade-in">
            <div className="flex gap-2">
              {['hoje', 'semana', 'mes'].map(r => (
                <button key={r} onClick={() => setMetricsRange(r)}
                  className={`flex-1 border border-neutral-700 rounded-xl py-2 text-xs font-semibold transition ${metricsRange === r ? 'bg-[var(--accent)]' : 'text-slate-300'}`}
                  style={metricsRange === r ? { color: '#fff' } : undefined}>
                  {r === 'hoje' ? 'Hoje' : r === 'semana' ? 'Esta Semana' : 'Este Mês'}
                </button>
              ))}
            </div>

            <select value={selectedUserId} onChange={e => setSelectedUserId(e.target.value)}
              className="w-full bg-neutral-900 border border-neutral-700 rounded-xl py-2.5 px-3 text-xs text-slate-200 outline-none">
              <option value="">Todos os utilizadores</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.display_name || u.email}</option>
              ))}
            </select>

            <div className="grid grid-cols-3 gap-3">
              <div className="card rounded-2xl p-3 text-center bg-neutral-900/50 border border-neutral-800">
                <p className="text-lg font-bold">{scopeMeals.length}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Refeições</p>
              </div>
              <div className="card rounded-2xl p-3 text-center bg-neutral-900/50 border border-neutral-800">
                <p className="text-lg font-bold">{scopeMsgs.length}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Msgs Coach</p>
              </div>
              <div className="card rounded-2xl p-3 text-center bg-neutral-900/50 border border-neutral-800">
                <p className="text-lg font-bold">{selectedUserId ? 1 : activeUsers}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Utiliz. ativos</p>
              </div>
            </div>

            <div className="card rounded-2xl p-4 bg-neutral-900/50 border border-neutral-800">
              <div className="flex items-center gap-2 mb-3">
                <BarChart3 size={16} className="text-[var(--accent)]" />
                <h2 className="text-sm font-semibold">Atividade por Dia</h2>
              </div>
              <p className="text-xs text-slate-500 text-center py-6">Os gráficos detalhados requerem a biblioteca chart.js.<br/>Por agora, consulta os totais acima.</p>
            </div>
          </div>
        );
      })()}

      {activeTab === 'costs' && (() => {
        const byModule = {};
        let totalIn = 0, totalOut = 0, totalCalls = 0;
        for (const l of costLogs) {
          const meta = l.meta || {};
          const inTok = Number(meta.input_tokens) || 0;
          const outTok = Number(meta.output_tokens) || 0;
          if (!inTok && !outTok) continue;
          const mod = GEMINI_COST_EVENT_MODULE[l.event] || 'Outro';
          if (!byModule[mod]) byModule[mod] = { input: 0, output: 0, calls: 0 };
          byModule[mod].input += inTok;
          byModule[mod].output += outTok;
          byModule[mod].calls += 1;
          totalIn += inTok; totalOut += outTok; totalCalls += 1;
        }
        const totalCost = geminiCost(totalIn, totalOut);
        const modules = Object.entries(byModule).sort((a, b) => geminiCost(b[1].input, b[1].output) - geminiCost(a[1].input, a[1].output));

        return (
          <div className="space-y-3 fade-in">
            <div className="flex gap-2">
              {['hoje', 'semana', 'mes'].map(r => (
                <button key={r} onClick={() => setCostRange(r)}
                  className={`flex-1 border border-neutral-700 rounded-xl py-2 text-xs font-semibold transition ${costRange === r ? 'bg-[var(--accent)]' : 'text-slate-300'}`}
                  style={costRange === r ? { color: '#fff' } : undefined}>
                  {r === 'hoje' ? 'Hoje' : r === 'semana' ? 'Esta Semana' : 'Este Mês'}
                </button>
              ))}
            </div>

            {costLoading ? (
              <div className="flex items-center justify-center py-10 text-slate-500 text-xs gap-2">
                <div className="w-4 h-4 border-2 border-slate-700 border-t-slate-400 rounded-full animate-spin" /> A carregar...
              </div>
            ) : (
              <>
                <div className="card rounded-2xl p-4 text-center bg-neutral-900/50 border border-neutral-800">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Custo estimado (Gemini)</p>
                  <p className="text-3xl font-extrabold">${totalCost.toFixed(4)}</p>
                  <p className="text-[11px] text-slate-500 mt-1">{totalCalls} chamada(s) · {(totalIn + totalOut).toLocaleString('pt-PT')} tokens</p>
                </div>

                <div className="space-y-2">
                  {modules.length === 0 ? (
                    <p className="text-xs text-slate-500 text-center py-6">Sem chamadas com dados de tokens neste período.</p>
                  ) : modules.map(([mod, v]) => (
                    <div key={mod} className="card rounded-xl p-3 bg-neutral-900/50 border border-neutral-800">
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-xs font-semibold">{mod}</p>
                        <p className="text-xs font-bold text-[var(--accent)]">${geminiCost(v.input, v.output).toFixed(4)}</p>
                      </div>
                      <p className="text-[11px] text-slate-500">{v.calls} chamada(s) · {v.input.toLocaleString('pt-PT')} in / {v.output.toLocaleString('pt-PT')} out tokens</p>
                    </div>
                  ))}
                </div>

                <p className="text-[10px] text-slate-600 text-center px-2">Preços de referência: ${GEMINI_PRICE_PER_M_INPUT.toFixed(2)} / milhão tokens input, ${GEMINI_PRICE_PER_M_OUTPUT.toFixed(2)} / milhão tokens output (gemini-flash-latest).</p>
              </>
            )}
          </div>
        );
      })()}

      {activeTab === 'logs' && (
        <div className="space-y-2 fade-in">
          {logs.map(l => (
            <div key={l.id} className={`rounded-lg p-2.5 text-[10px] font-mono border ${
              l.level === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-300' :
              l.level === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' :
              'bg-neutral-900 border-neutral-800 text-slate-400'
            }`}>
              <div className="flex justify-between items-start gap-2 mb-1">
                <span className="font-bold opacity-75">[{l.module?.toUpperCase()}]</span>
                <span className="opacity-50 shrink-0">{new Date(l.created_at).toLocaleTimeString('pt-PT')}</span>
              </div>
              <p className="whitespace-pre-wrap break-words">{l.message}</p>
              {l.meta && <p className="mt-1 opacity-50 break-words">{JSON.stringify(l.meta)}</p>}
            </div>
          ))}
          {logs.length === 0 && <p className="text-xs text-slate-500 text-center py-4">Sem logs recentes.</p>}
        </div>
      )}
    </div>
  );
}
