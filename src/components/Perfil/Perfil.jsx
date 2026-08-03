import React, { useState, useEffect } from 'react';
import { useAppStore } from '../../store';
import { supabase } from '../../lib/supabase';
import { User, Target, Bot, LogOut, ChevronDown, ChevronUp, Bell, Sparkles, Loader2, X } from 'lucide-react';

const BODY_METRICS = [
  { key: 'weight_kg', label: 'Peso', unit: 'kg', dec: 1 },
  { key: 'bmi', label: 'IMC', unit: '', dec: 1 },
  { key: 'body_fat_pct', label: 'Gordura corporal', unit: '%', dec: 1 },
  { key: 'skeletal_muscle_pct', label: 'Músculo esquelético', unit: '%', dec: 1 },
  { key: 'muscle_mass_kg', label: 'Massa muscular', unit: 'kg', dec: 1 },
  { key: 'body_water_pct', label: 'Água corporal', unit: '%', dec: 1 },
  { key: 'protein_pct', label: 'Proteína', unit: '%', dec: 1 },
  { key: 'bone_mass_kg', label: 'Massa óssea', unit: 'kg', dec: 1 },
  { key: 'bmr_kcal', label: 'Metabolismo basal', unit: 'kcal', dec: 0 },
  { key: 'visceral_fat', label: 'Gordura visceral', unit: '', dec: 0 },
  { key: 'subcutaneous_fat_pct', label: 'Gordura subcutânea', unit: '%', dec: 1 },
  { key: 'metabolic_age', label: 'Idade metabólica', unit: 'anos', dec: 0 },
  { key: 'lean_body_mass_kg', label: 'Massa magra', unit: 'kg', dec: 1 },
];

const WATER_REMINDER_INTERVALS = [30, 60, 90, 120, 180, 240];
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const DEFAULT_REMINDER_START_HOUR = 8;
const DEFAULT_REMINDER_END_HOUR = 22;

const formatHour = (h) => `${String(h).padStart(2, '0')}:00`;

export default function Perfil() {
  const { profile, setProfile, session, setNavGuard } = useAppStore();
  const [tab, setTab] = useState('perfil');

  // Local state form (draft)
  const [draft, setDraft] = useState({});
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Destino pendente quando se tenta sair com alterações por gravar.
  // { kind: 'tab' | 'nav', target: string }
  const [leavePrompt, setLeavePrompt] = useState(null);

  // Metas UI
  const [metasBodyExpanded, setMetasBodyExpanded] = useState(false);

  // Coach UI
  const [suggestingGoals, setSuggestingGoals] = useState(false);
  const [goalsRationale, setGoalsRationale] = useState(profile?.goals_rationale || '');

  // Reset draft when profile changes or tab changes
  useEffect(() => {
    if (profile) {
      setDraft(profile);
      setIsDirty(false);
    }
  }, [profile, tab]);

  // Trava a navegação para fora do Perfil enquanto houver alterações por gravar.
  useEffect(() => {
    if (!isDirty) {
      setNavGuard(null);
      return;
    }
    setNavGuard((intendedTab) => {
      setLeavePrompt({ kind: 'nav', target: intendedTab });
      return false;
    });
    return () => setNavGuard(null);
  }, [isDirty, setNavGuard]);

  // Fechar/recarregar o separador do browser também avisa.
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const updateDraft = (key, value) => {
    setDraft(prev => ({ ...prev, [key]: value }));
    setIsDirty(true);
  };

  const handleSave = async () => {
    if (!isDirty) return true;
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update(draft)
        .eq('id', profile?.id);

      if (error) throw error;

      setProfile({ ...profile, ...draft });
      setIsDirty(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
      return true;
    } catch (err) {
      console.error('Error saving profile:', err);
      alert('Erro ao guardar o perfil.');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  // Mudar de sub-tab descarta o draft (ver o useEffect acima), por isso passa
  // pelo mesmo aviso que sair do Perfil.
  const requestTabChange = (nextTab) => {
    if (nextTab === tab) return;
    if (isDirty) {
      setLeavePrompt({ kind: 'tab', target: nextTab });
      return;
    }
    setTab(nextTab);
  };

  const goToPendingTarget = ({ kind, target }) => {
    if (kind === 'tab') {
      setTab(target);
      return;
    }
    // O guard vive no store e ainda está registado neste render — limpa-o
    // antes de navegar para não voltar a travar o mesmo pedido.
    setNavGuard(null);
    useAppStore.getState().setActiveTab(target);
  };

  const discardAndLeave = () => {
    const pending = leavePrompt;
    setDraft(profile || {});
    setIsDirty(false);
    setLeavePrompt(null);
    goToPendingTarget(pending);
  };

  const saveAndLeave = async () => {
    const pending = leavePrompt;
    const saved = await handleSave();
    if (!saved) return; // mantém o aviso aberto para o utilizador decidir
    setLeavePrompt(null);
    goToPendingTarget(pending);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const handleSuggestGoals = async () => {
    setSuggestingGoals(true);
    // Placeholder para a edge function de coach.
    setTimeout(() => {
      setSuggestingGoals(false);
      setGoalsRationale('O Coach analisou o teu histórico e ajustou a proteína para garantir que ganhas massa muscular...');
      alert("A funcionalidade do Coach requer a Edge Function configurada.");
    }, 2000);
  };

  const reminderStartHour = draft.water_reminder_start_hour ?? DEFAULT_REMINDER_START_HOUR;
  const reminderEndHour = draft.water_reminder_end_hour ?? DEFAULT_REMINDER_END_HOUR;

  const leaveModal = leavePrompt && (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-black/70 fade-in" role="dialog" aria-modal="true" aria-labelledby="perfil-leave-title">
      <div className="w-full max-w-sm rounded-2xl p-5 bg-neutral-900 border border-neutral-800 shadow-2xl">
        <h2 id="perfil-leave-title" className="text-sm font-semibold text-white">Tens alterações por gravar</h2>
        <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
          Se saíres agora, as alterações que fizeste neste separador não ficam guardadas.
        </p>
        <div className="mt-5 space-y-2">
          <button onClick={saveAndLeave} disabled={isSaving} type="button"
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-xs bg-[var(--accent)] text-white shadow-lg active:scale-95 transition disabled:opacity-60">
            {isSaving ? <Loader2 size={16} className="animate-spin" /> : null}
            {isSaving ? 'A guardar...' : 'Gravar e sair'}
          </button>
          <button onClick={discardAndLeave} disabled={isSaving} type="button"
            className="w-full py-3 rounded-xl font-semibold text-xs border border-red-500/40 text-red-400 hover:bg-red-500/10 transition disabled:opacity-60">
            Sair sem gravar
          </button>
          <button onClick={() => setLeavePrompt(null)} disabled={isSaving} type="button"
            className="w-full py-3 rounded-xl font-semibold text-xs text-slate-400 hover:text-slate-200 transition disabled:opacity-60">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );

  const saveButton = (
    <button
      onClick={handleSave}
      disabled={!isDirty || isSaving}
      className={`w-full mt-4 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-xs transition ${
        isDirty && !isSaving 
          ? 'bg-[var(--accent)] text-white shadow-lg active:scale-95' 
          : 'bg-neutral-800 text-slate-500 cursor-not-allowed'
      }`}
    >
      {isSaving ? <Loader2 size={16} className="animate-spin" /> : null}
      {isSaving ? 'A guardar...' : 'Guardar alterações'}
    </button>
  );

  return (
    <div className="space-y-4 fade-in pb-8">
      {/* Subnav */}
      <div className="flex gap-2 p-1 bg-neutral-900 border border-neutral-800 rounded-2xl mb-4">
        {[
          { key: 'perfil', label: 'Pessoal', icon: User },
          { key: 'metas', label: 'Metas', icon: Target },
          { key: 'coach', label: 'Coach', icon: Bot },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => requestTabChange(t.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-xl transition ${
              tab === t.key ? 'bg-[var(--accent)] text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {saveSuccess && (
        <div className="fixed top-4 inset-x-4 z-50 flex justify-center fade-in">
          <div className="bg-emerald-500 text-white px-4 py-2 rounded-full text-xs font-bold shadow-lg flex items-center gap-2">
            ✓ Guardado com sucesso
          </div>
        </div>
      )}

      {leaveModal}

      {/* TABS */}
      {tab === 'perfil' && (
        <>
          <div className="rounded-2xl p-4 bg-neutral-900/50 border border-neutral-800">
            <div className="flex items-center gap-2 mb-4">
              <User size={16} className="text-[var(--accent)]" />
              <h2 className="text-sm font-semibold text-white">Pessoal</h2>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] text-slate-500 block mb-1">Nome</label>
                <input
                  type="text"
                  value={draft.display_name || ''}
                  onChange={e => updateDraft('display_name', e.target.value)}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]/60"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-500 block mb-1">Género</label>
                <select
                  value={draft.gender || ''}
                  onChange={e => updateDraft('gender', e.target.value)}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]/60"
                >
                  <option value="">–</option>
                  <option value="F">Feminino</option>
                  <option value="M">Masculino</option>
                </select>
              </div>
            </div>
            {saveButton}
          </div>
          
          <div className="rounded-2xl p-4 bg-neutral-900/50 border border-neutral-800">
            <p className="text-[11px] text-slate-500 mb-3">Sessão iniciada como <b className="text-slate-300">{session?.user?.email}</b></p>
            <button onClick={handleSignOut} className="w-full border border-red-500/40 text-red-400 text-xs font-semibold rounded-xl py-2.5 flex items-center justify-center gap-1.5 hover:bg-red-500/10 transition">
              <LogOut size={14} /> Terminar sessão
            </button>
          </div>
        </>
      )}

      {tab === 'metas' && (
        <>
          <div className="rounded-2xl p-4 bg-neutral-900/50 border border-neutral-800">
            <div className="flex items-center gap-2 mb-3">
              <User size={16} className="text-[var(--accent)]" />
              <h2 className="text-sm font-semibold text-white">Avaliação Corporal</h2>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="text-[11px] text-slate-500 block mb-1">Altura (cm)</label>
                <input type="number" value={draft.height_cm || ''} onChange={e => updateDraft('height_cm', parseFloat(e.target.value) || null)}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]/60" />
              </div>
              <div>
                <label className="text-[11px] text-slate-500 block mb-1">Peso atual (kg)</label>
                <input type="number" step="0.1" value={draft.weight_kg || ''} onChange={e => updateDraft('weight_kg', parseFloat(e.target.value) || null)}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]/60" />
              </div>
            </div>
            
            <button type="button" onClick={() => setMetasBodyExpanded(v => !v)}
              className={`w-full flex items-center justify-between border border-neutral-800 rounded-xl px-3 py-2.5 ${metasBodyExpanded ? 'mb-2' : ''}`}>
              <div className="flex items-center gap-2">
                <Target size={16} className="text-[var(--accent)]" />
                <span className="text-sm font-semibold text-white">Objetivos corporais</span>
                <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  {BODY_METRICS.filter(m => draft['goal_' + m.key] != null).length}/{BODY_METRICS.length} definidos
                </span>
              </div>
              {metasBodyExpanded ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
            </button>

            {metasBodyExpanded && (
              <div className="grid grid-cols-2 gap-3 mt-3 fade-in">
                {BODY_METRICS.map(m => (
                  <div key={m.key}>
                    <label className="text-[11px] text-slate-500 truncate block mb-1">{m.label}{m.unit ? ` (${m.unit})` : ''}</label>
                    <input type="number" step={m.dec === 0 ? '1' : '0.1'} value={draft['goal_' + m.key] ?? ''}
                      onChange={e => updateDraft('goal_' + m.key, e.target.value === '' ? null : parseFloat(e.target.value))}
                      className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]/60" />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl p-4 bg-neutral-900/50 border border-neutral-800">
            <div className="flex items-center gap-2 mb-4">
              <Target size={16} className="text-[var(--accent)]" />
              <h2 className="text-sm font-semibold text-white">Nutrição & Água</h2>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-slate-500 block mb-1">Calorias (kcal/dia)</label>
                <input type="number" value={draft.calorie_goal || ''} onChange={e => updateDraft('calorie_goal', parseInt(e.target.value) || null)}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white outline-none" />
              </div>
              <div>
                <label className="text-[11px] text-slate-500 block mb-1">Proteína (g/dia)</label>
                <input type="number" value={draft.protein_goal || ''} onChange={e => updateDraft('protein_goal', parseInt(e.target.value) || null)}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white outline-none" />
              </div>
              <div>
                <label className="text-[11px] text-slate-500 block mb-1">Hidratos (g/dia)</label>
                <input type="number" value={draft.carbs_goal || ''} onChange={e => updateDraft('carbs_goal', parseInt(e.target.value) || null)}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white outline-none" />
              </div>
              <div>
                <label className="text-[11px] text-slate-500 block mb-1">Gordura (g/dia)</label>
                <input type="number" value={draft.fat_goal || ''} onChange={e => updateDraft('fat_goal', parseInt(e.target.value) || null)}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white outline-none" />
              </div>
              <div className="col-span-2">
                <label className="text-[11px] text-slate-500 block mb-1">Meta água (ml/dia)</label>
                <input type="number" step="50" value={draft.water_goal_ml || ''} onChange={e => updateDraft('water_goal_ml', parseInt(e.target.value) || null)}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white outline-none" />
              </div>
            </div>

            <div className="flex items-center justify-between mt-5 pt-4 border-t border-neutral-800">
              <div className="pr-4">
                <p className="text-xs font-semibold text-white flex items-center gap-1.5"><Bell size={14} className="text-blue-400" /> Lembretes de água</p>
                <p className="text-[11px] text-slate-500 mt-1">
                  Notificações entre as {formatHour(reminderStartHour)} e as {formatHour(reminderEndHour)} enquanto não atingires a meta.
                </p>
              </div>
              <button onClick={() => updateDraft('water_reminder_enabled', !draft.water_reminder_enabled)} type="button"
                aria-label={draft.water_reminder_enabled ? 'Desativar lembretes de água' : 'Ativar lembretes de água'}
                aria-pressed={!!draft.water_reminder_enabled}
                className={`w-11 h-6 rounded-full relative transition shrink-0 ${draft.water_reminder_enabled ? 'bg-[var(--accent)]' : 'bg-neutral-700'}`}>
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${draft.water_reminder_enabled ? 'left-5' : 'left-0.5'}`}></span>
              </button>
            </div>

            {draft.water_reminder_enabled && (
              <div className="mt-3 space-y-3 fade-in">
                <div>
                  <label className="text-[11px] text-slate-500 block mb-1">Frequência (minutos)</label>
                  <select value={draft.water_reminder_interval_minutes || 120} onChange={e => updateDraft('water_reminder_interval_minutes', parseInt(e.target.value))}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]/60">
                    {WATER_REMINDER_INTERVALS.map(m => (
                      <option key={m} value={m}>A cada {m} minutos</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-slate-500 block mb-1">Início</label>
                    <select value={reminderStartHour} onChange={e => updateDraft('water_reminder_start_hour', parseInt(e.target.value))}
                      className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]/60">
                      {HOURS.map(h => <option key={h} value={h}>{formatHour(h)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500 block mb-1">Fim</label>
                    <select value={reminderEndHour} onChange={e => updateDraft('water_reminder_end_hour', parseInt(e.target.value))}
                      className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]/60">
                      {HOURS.map(h => <option key={h} value={h}>{formatHour(h)}</option>)}
                    </select>
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  {reminderStartHour === reminderEndHour
                    ? 'Início igual ao fim: lembretes durante as 24 horas.'
                    : reminderStartHour > reminderEndHour
                      ? 'A janela atravessa a meia-noite.'
                      : 'Hora de Portugal continental.'}
                </p>
              </div>
            )}
          </div>

          {saveButton}
        </>
      )}

      {tab === 'coach' && (
        <>
          <div className="rounded-2xl p-4 bg-neutral-900/50 border border-neutral-800">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={16} className="text-[var(--mod-coach-to)]" />
              <h2 className="text-sm font-semibold text-white">Objetivos com o Coach</h2>
            </div>
            <p className="text-[11px] text-slate-500 mb-4 leading-relaxed">
              O Coach analisa o teu histórico (Corpo, Nutrição, Ginásio, Corrida) e as tuas próximas provas para sugerir objetivos (na aba Metas).
            </p>
            <button onClick={handleSuggestGoals} disabled={suggestingGoals} type="button"
              className="w-full border-2 border-dashed border-[var(--mod-coach-to)]/40 hover:border-[var(--mod-coach-to)]/70 hover:bg-[var(--mod-coach-to)]/10 text-[var(--mod-coach-to)] py-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition disabled:opacity-50">
              {suggestingGoals ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              {suggestingGoals ? 'A analisar histórico...' : 'Pedir ao Coach para definir objetivos'}
            </button>
            
            {goalsRationale && (
              <div className="rounded-xl p-3 mt-4 border fade-in relative" style={{ background: 'color-mix(in srgb, var(--mod-coach-to) 5%, transparent)', borderColor: 'color-mix(in srgb, var(--mod-coach-to) 20%, transparent)' }}>
                <button onClick={() => { setGoalsRationale(''); updateDraft('goals_rationale', null); }} className="absolute top-3 right-3 text-slate-500 hover:text-white">
                  <X size={14} />
                </button>
                <div className="flex items-center gap-1.5 mb-1 text-[11px] font-semibold text-[var(--mod-coach-to)]">
                  <Sparkles size={14} /> Porquê estes objetivos
                </div>
                <p className="text-xs text-slate-300 leading-relaxed pr-6">{goalsRationale}</p>
              </div>
            )}
          </div>

          <div className="rounded-2xl p-4 bg-neutral-900/50 border border-neutral-800">
            <div className="flex items-center gap-2 mb-2">
              <Bot size={16} className="text-[var(--mod-coach-to)]" />
              <h2 className="text-sm font-semibold text-white">Contexto do Coach</h2>
            </div>
            <p className="text-[11px] text-slate-500 mb-3 leading-relaxed">
              Descreve os teus objetivos, lesões ou preferências. O coach terá sempre isto em conta.
            </p>
            <textarea
              rows="5"
              value={draft.coach_context || ''}
              onChange={e => updateDraft('coach_context', e.target.value)}
              placeholder="Ex: Quero correr uma meia maratona em Novembro. Tenho uma lesão no joelho direito. Objetivo: ganhar massa muscular mantendo o peso."
              className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white outline-none resize-none placeholder-slate-600 focus:border-[var(--mod-coach-to)]/70"
            />
          </div>

          {saveButton}
        </>
      )}
    </div>
  );
}
