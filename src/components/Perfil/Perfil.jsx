import React, { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../../store';
import Button from '../shared/Button';
import { supabase } from '../../lib/supabase';
import { ensurePushSubscription } from '../../lib/push';
import { Bot, User, Target, LogOut, Bell, Sparkles, Loader2, X } from 'lucide-react';
import { ageFromBirthDate } from '../../utils/body';
import { EXPERIENCE_LEVELS, experienceLevelDescription } from '../../utils/experience';
import ExperienceLevelHelp from '../shared/ExperienceLevelHelp';
import { DIETARY_RESTRICTIONS, toggleRestriction, normalizeRestrictions } from '../../utils/diet';
import { useToast } from '../shared/ToastProvider';
import UnsavedChangesModal from '../shared/UnsavedChangesModal';
import CoachMemoryCard from './CoachMemoryCard';

// Hoje em ISO local (não UTC) — trava a data de nascimento no futuro.
// Ver 5.3 do PRD sobre escalas de data.
function todayISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

// Apenas os 4 objetivos corporais com intervenção direta via treino + nutrição.
// Os restantes (IMC, BMR, água corporal, etc.) são métricas derivadas — foram
// removidos da BD porque não fazem sentido como "metas" prescritíveis.
const BODY_METRICS = [
  { key: 'weight_kg',        label: 'Peso-alvo',          unit: 'kg',  dec: 1 },
  { key: 'body_fat_pct',     label: 'Gordura corporal',   unit: '%',   dec: 1 },
  { key: 'muscle_mass_kg',   label: 'Massa muscular',     unit: 'kg',  dec: 1 },
  { key: 'lean_body_mass_kg',label: 'Massa magra',        unit: 'kg',  dec: 1 },
];

// Campos de objetivo corporal que o Coach pode escrever — mapeamento
// BODY_METRICS.key → flag _set_by_coach correspondente.
// Todos os 4 campos corporais são coach-editáveis.
const BODY_GOAL_COACH_FLAGS = {
  weight_kg:          'goal_weight_set_by_coach',
  body_fat_pct:       'goal_body_fat_set_by_coach',
  muscle_mass_kg:     'goal_muscle_set_by_coach',
  lean_body_mass_kg:  'goal_lean_mass_set_by_coach',
};

// Estilos partilhados para campos que podem ser escritos pelo Coach.
const coachFieldStyle = {
  border: '1px solid var(--mod-coach-to)',
  boxShadow: '0 0 0 1px color-mix(in srgb, var(--mod-coach-to) 30%, transparent)',
};
const plainFieldStyle = { border: '1px solid rgb(38 38 38)' };

// Badge inline que assinala que um campo foi escrito pelo Coach.
function CoachBadge() {
  return (
    <span title="Meta definida pelo Coach"
      className="px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide shrink-0 shadow-sm text-white"
      style={{ background: 'linear-gradient(135deg, var(--mod-coach-from), var(--mod-coach-to))' }}>
      Coach
    </span>
  );
}

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
  const [subscribingPush, setSubscribingPush] = useState(false);
  const { showToast } = useToast();

  // Destino pendente quando se tenta sair com alterações por gravar.
  // { kind: 'tab' | 'nav' | 'signout', target: string | null }
  const [leavePrompt, setLeavePrompt] = useState(null);

  /* Só os campos que o utilizador mexeu vão para o UPDATE. Mandar a linha
     inteira faria o Perfil escrever por cima de campos que o servidor também
     altera — water_last_activity_at (cron dos lembretes e registo de água) e
     water_reminder_muted_date — com valores que o rascunho tinha em cache. */
  const dirtyKeys = useRef(new Set());


  // Coach UI
  const [suggestingGoals, setSuggestingGoals] = useState(false);
  const [goalsRationale, setGoalsRationale] = useState(profile?.goals_rationale || '');

  /* Recarrega o rascunho a partir do perfil, mas nunca por cima de alterações
     por gravar. Depender da identidade do objeto `profile` não servia: o
     loadInitialData corre a cada onAuthStateChange (incluindo TOKEN_REFRESHED,
     de hora a hora) e cria sempre um objeto novo, o que apagava o rascunho e
     limpava o próprio aviso de saída sem gravar. Só um perfil diferente, ou
     uma mudança de sub-separador sem nada pendente, justifica o reset. */
  const loadedProfileId = useRef(null);
  useEffect(() => {
    if (!profile) return;
    const isOtherProfile = loadedProfileId.current !== profile.id;
    if (isDirty && !isOtherProfile) return;
    loadedProfileId.current = profile.id;
    dirtyKeys.current.clear();
    setDraft(profile);
    setIsDirty(false);
  }, [profile, tab, isDirty]);

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
    dirtyKeys.current.add(key);
    setIsDirty(true);
  };

  /* Edição manual de uma meta que o Coach pode escrever (proteína/gordura,
     ver DECISÃO N1) — desliga a flag de origem, porque o valor deixa de ser
     "do coach" no momento em que o atleta o substitui pelo seu. */
  const updateCoachableGoal = (key, flagKey, value) => {
    updateDraft(key, value);
    if (draft[flagKey]) updateDraft(flagKey, false);
  };

  /* Ligar o interruptor pede a permissão ao browser e subscreve o push de
     imediato — é uma ação do browser, não um valor de formulário, por isso não
     espera pelo Guardar (ver PRD 3.7). O campo em si continua a ser rascunho:
     se o utilizador sair sem gravar, a subscrição fica mas os lembretes não
     são ativados no perfil. */
  const toggleWaterReminder = async () => {
    const enabling = !draft.water_reminder_enabled;
    if (!enabling) {
      updateDraft('water_reminder_enabled', false);
      return;
    }
    setSubscribingPush(true);
    const { ok, error } = await ensurePushSubscription();
    setSubscribingPush(false);
    if (!ok) {
      showToast(error, 'error');
      return;
    }
    updateDraft('water_reminder_enabled', true);
  };

  const handleSave = async () => {
    if (!isDirty) return true;
    setIsSaving(true);
    try {
      const updates = {};
      for (const key of dirtyKeys.current) updates[key] = draft[key];

      /* resting_hr_bpm: o check constraint do Postgres aceita NULL ou 25-120.
         Durante a digitação o utilizador pode ter um inteiro intermédio fora
         desse range (ex: escreve "5" antes de completar "52"). Se for o caso,
         descarta silenciosamente em vez de deixar o Postgres rejeitar tudo. */
      if ('resting_hr_bpm' in updates) {
        const hr = updates.resting_hr_bpm;
        if (hr !== null && (hr < 25 || hr > 120 || isNaN(hr))) {
          delete updates.resting_hr_bpm;
          dirtyKeys.current.delete('resting_hr_bpm');
        }
      }

      /* Ativar agora começa a contagem a partir deste momento, não do último
         registo antigo, e limpa um "silenciar resto do dia" que não deve
         sobreviver a reativar. */
      if (draft.water_reminder_enabled && !profile?.water_reminder_enabled) {
        updates.water_last_activity_at = new Date().toISOString();
        updates.water_reminder_muted_date = null;
      }
      if (Object.keys(updates).length === 0) {
        setIsDirty(false);
        return true;
      }

      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', profile?.id);

      if (error) throw error;

      setProfile({ ...profile, ...updates });
      dirtyKeys.current.clear();
      setIsDirty(false);
      showToast('Guardado com sucesso');
      return true;
    } catch (err) {
      console.error('Error saving profile:', err);
      showToast('Erro ao guardar o perfil.', 'error');
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

  const goToPendingTarget = async ({ kind, target }) => {
    if (kind === 'tab') {
      setTab(target);
      return;
    }
    // O guard vive no store e ainda está registado neste render — limpa-o
    // antes de sair para não voltar a travar o mesmo pedido.
    setNavGuard(null);
    if (kind === 'signout') {
      try {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
      } catch (err) {
        // Falhar aqui deixava o utilizador num formulário sujo já sem guard.
        console.error('Error signing out:', err);
        showToast('Não foi possível terminar a sessão.', 'error');
        setIsDirty(true);
      }
      return;
    }
    useAppStore.getState().setActiveTab(target);
  };

  const discardAndLeave = () => {
    const pending = leavePrompt;
    dirtyKeys.current.clear();
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

  // Terminar sessão é a saída mais destrutiva de todas: desmonta o Perfil e
  // leva o rascunho com ele. Passa pelo mesmo aviso que as outras.
  const handleSignOut = async () => {
    if (isDirty) {
      setLeavePrompt({ kind: 'signout', target: null });
      return;
    }
    await supabase.auth.signOut();
  };

  const handleSuggestGoals = async () => {
    setSuggestingGoals(true);
    // Placeholder para a edge function de coach.
    setTimeout(() => {
      setSuggestingGoals(false);
      setGoalsRationale('O Coach analisou o teu histórico e ajustou a proteína para garantir que ganhas massa muscular...');
      showToast('A funcionalidade do Coach requer a Edge Function configurada.', 'error');
    }, 2000);
  };

  const reminderStartHour = draft.water_reminder_start_hour ?? DEFAULT_REMINDER_START_HOUR;
  const reminderEndHour = draft.water_reminder_end_hour ?? DEFAULT_REMINDER_END_HOUR;

  const leaveModal = (
    <UnsavedChangesModal
      isOpen={!!leavePrompt}
      isSaving={isSaving}
      onSaveAndLeave={saveAndLeave}
      onDiscardAndLeave={discardAndLeave}
      onCancel={() => setLeavePrompt(null)}
      title="Tens alterações por gravar"
      message="Se saíres agora, as alterações que fizeste neste separador não ficam guardadas."
    />
  );

  const saveButton = (
    <Button
      variant="module"
      onClick={handleSave}
      disabled={!isDirty || isSaving}
      isLoading={isSaving}
      className="w-full mt-4 text-xs py-3"
    >
      Guardar alterações
    </Button>
  );

  return (
    <div className="space-y-4 fade-in pb-8">
      {/* Subnav */}
      <div className="relative flex gap-2 p-1 bg-white border border-slate-200/80 rounded-2xl mb-4 shadow-sm">
        {/* Sliding indicator */}
        <div 
          className="absolute top-1 bottom-1 rounded-xl transition-all duration-300 ease-in-out shadow-[0_2px_10px_rgba(251,191,36,0.3)]"
          style={{
            width: 'calc((100% - 16px) / 3)', // 3 tabs, 2 gaps of 8px
            transform: `translateX(calc(${['perfil', 'metas', 'coach'].indexOf(tab)} * 100% + ${['perfil', 'metas', 'coach'].indexOf(tab) * 8}px))`,
            background: 'linear-gradient(135deg, #d97706, #fbbf24)'
          }}
        />
        {[
          { key: 'perfil', label: 'Pessoal', icon: User },
          { key: 'metas', label: 'Metas', icon: Target },
          { key: 'coach', label: 'Coach', icon: Bot },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => requestTabChange(t.key)}
            className={`relative z-10 flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-xl transition-colors duration-300 ${
              tab === t.key ? 'text-white' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
            }`}
          >
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {leaveModal}

      {/* TABS */}
      {tab === 'perfil' && (
        <>
          <div className="rounded-2xl p-4 bg-neutral-900/50 border border-neutral-800">
            <div className="flex items-center gap-2 mb-4">
              <User size={16} className="text-[var(--accent)]" />
              <h2 className="text-sm font-semibold">Pessoal</h2>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] text-slate-500 block mb-1">Nome</label>
                <input
                  type="text"
                  value={draft.display_name || ''}
                  onChange={e => updateDraft('display_name', e.target.value)}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/60"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-500 block mb-1">Género</label>
                <select
                  value={draft.gender || ''}
                  onChange={e => updateDraft('gender', e.target.value)}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/60"
                >
                  <option value="">–</option>
                  <option value="F">Feminino</option>
                  <option value="M">Masculino</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] text-slate-500 block mb-1">
                  Data de nascimento
                  {ageFromBirthDate(draft.birth_date) != null && (
                    <span className="text-slate-400"> · {ageFromBirthDate(draft.birth_date)} anos</span>
                  )}
                </label>
                <input
                  type="date"
                  max={todayISO()}
                  value={draft.birth_date || ''}
                  onChange={e => updateDraft('birth_date', e.target.value || null)}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/60"
                />
                <p className="text-[10px] text-slate-600 mt-1">
                  Usada para calcular as zonas de frequência cardíaca e ajustar as
                  recomendações do coach. Guardamos a data, não a idade.
                </p>
              </div>
              <ExperienceLevelHelp label="Nível como corredor" variant="dark">
                <select
                  value={draft.experience_level || ''}
                  onChange={e => updateDraft('experience_level', e.target.value || null)}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/60"
                >
                  <option value="">–</option>
                  {EXPERIENCE_LEVELS.map(l => <option key={l.key} value={l.key}>{l.label}</option>)}
                </select>
                <p className="text-[10px] text-slate-600 mt-1">
                  {draft.experience_level
                    ? experienceLevelDescription(draft.experience_level)
                    : 'Calibra a linguagem e os limiares de treino do Coach.'}
                  {' '}Ao registares uma prova, podes indicar um nível diferente só
                  para essa prova — por exemplo, avançado em estrada mas iniciante
                  na primeira trail.
                </p>
              </ExperienceLevelHelp>
              {/* Restrições alimentares — pré-requisito das sugestões do Coach.
                  Sem isto o Coach não fica calado, fica errado: sugere frango a
                  um vegetariano. Ver specs/coach-investigacao.md, Bloco 7 #5. */}
              <div>
                <label className="text-[11px] text-slate-500 block mb-1">Restrições alimentares</label>
                <div className="flex flex-wrap gap-1.5">
                  {DIETARY_RESTRICTIONS.map(r => {
                    const ativa = (draft.dietary_restrictions || []).includes(r.key);
                    return (
                      <button
                        key={r.key}
                        type="button"
                        aria-pressed={ativa}
                        onClick={() => updateDraft(
                          'dietary_restrictions',
                          normalizeRestrictions(toggleRestriction(draft.dietary_restrictions, r.key))
                        )}
                        className={`tap-h-44 px-3 rounded-xl text-xs font-semibold border transition active:scale-95 ${
                          ativa
                            ? 'bg-[var(--accent)]/20 border-[var(--accent)]/60 text-[var(--accent)]'
                            : 'bg-neutral-900 border-neutral-800 text-slate-400'
                        }`}
                      >
                        {r.label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-slate-600 mt-1">
                  Podes escolher mais que uma. Vegetariano e vegano excluem-se —
                  escolher um desliga o outro. Sem nada selecionado, o Coach
                  assume que comes de tudo.
                </p>
                <input
                  type="text"
                  placeholder="Alergias ou alimentos a evitar (ex.: frutos secos)"
                  value={draft.dietary_notes || ''}
                  onChange={e => updateDraft('dietary_notes', e.target.value.trim() === '' ? null : e.target.value)}
                  className="w-full mt-2 bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/60"
                />
                <p className="text-[10px] text-slate-600 mt-1">
                  O Coach trata isto como regra absoluta e nunca sugere nada que
                  a contrarie.
                </p>
              </div>
              <div>
                <label className="text-[11px] text-slate-500 block mb-1">FC em repouso (bpm)</label>
                <input
                  type="number"
                  min="25"
                  max="120"
                  inputMode="numeric"
                  placeholder="Ex.: 52"
                  value={draft.resting_hr_bpm ?? ''}
                  onChange={e => updateDraft('resting_hr_bpm', e.target.value === '' ? null : parseInt(e.target.value, 10))}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/60"
                />
                <p className="text-[10px] text-slate-600 mt-1">
                  Mede ao acordar, antes de te levantares. Torna as zonas de
                  frequência cardíaca mais precisas e permite ao Coach detetar
                  fadiga acumulada — uma subida sustentada face ao teu normal é
                  dos primeiros sinais de sobretreino.
                </p>
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
              <h2 className="text-sm font-semibold">Avaliação Corporal</h2>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="text-[11px] text-slate-500 block mb-1">Altura (cm)</label>
                <input type="number" value={draft.height_cm || ''} onChange={e => updateDraft('height_cm', parseFloat(e.target.value) || null)}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/60" />
              </div>
              <div>
                <label className="text-[11px] text-slate-500 block mb-1">Peso atual (kg)</label>
                <input type="number" step="0.1" value={draft.weight_kg || ''} onChange={e => updateDraft('weight_kg', parseFloat(e.target.value) || null)}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/60" />
              </div>
            </div>
            
            <div className="flex items-center gap-2 mb-3 mt-1">
              <Target size={14} className="text-[var(--accent)]" />
              <h3 className="text-xs font-semibold text-slate-300">Objetivos corporais</h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {BODY_METRICS.map(m => {
                const flagKey = BODY_GOAL_COACH_FLAGS[m.key];
                const isCoach = flagKey && draft[flagKey];
                return (
                  <div key={m.key}>
                    <label className="text-[11px] text-slate-500 flex items-center gap-1.5 mb-1">
                      {m.label}{m.unit ? ` (${m.unit})` : ''}
                      {isCoach && <CoachBadge />}
                    </label>
                    <input type="number" step="0.1" value={draft['goal_' + m.key] ?? ''}
                      onChange={e => {
                        const v = e.target.value === '' ? null : parseFloat(e.target.value);
                        updateCoachableGoal('goal_' + m.key, flagKey, v);
                      }}
                      className="w-full bg-neutral-900 rounded-xl px-3 py-2 text-sm outline-none"
                      style={isCoach ? coachFieldStyle : plainFieldStyle} />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl p-4 bg-neutral-900/50 border border-neutral-800">
            <div className="flex items-center gap-2 mb-4">
              <Target size={16} className="text-[var(--accent)]" />
              <h2 className="text-sm font-semibold">Nutrição & Água</h2>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-slate-500 flex items-center gap-1.5 mb-1">
                  Calorias (kcal/dia)
                  {draft.calorie_goal_set_by_coach && <CoachBadge />}
                </label>
                <input type="number" value={draft.calorie_goal || ''}
                  onChange={e => updateCoachableGoal('calorie_goal', 'calorie_goal_set_by_coach', parseInt(e.target.value) || null)}
                  className="w-full bg-neutral-900 rounded-xl px-3 py-2 text-sm outline-none"
                  style={draft.calorie_goal_set_by_coach ? coachFieldStyle : plainFieldStyle} />
              </div>
              <div>
                <label className="text-[11px] text-slate-500 flex items-center gap-1.5 mb-1">
                  Proteína (g/dia)
                  {draft.protein_goal_set_by_coach && <CoachBadge />}
                </label>
                <input type="number" value={draft.protein_goal || ''}
                  onChange={e => updateCoachableGoal('protein_goal', 'protein_goal_set_by_coach', parseInt(e.target.value) || null)}
                  className="w-full bg-neutral-900 rounded-xl px-3 py-2 text-sm outline-none"
                  style={draft.protein_goal_set_by_coach ? coachFieldStyle : plainFieldStyle} />
              </div>
              <div>
                <label className="text-[11px] text-slate-500 flex items-center gap-1.5 mb-1">
                  Hidratos (g/dia)
                  {draft.carbs_goal_set_by_coach && <CoachBadge />}
                </label>
                <input type="number" value={draft.carbs_goal || ''}
                  onChange={e => updateCoachableGoal('carbs_goal', 'carbs_goal_set_by_coach', parseInt(e.target.value) || null)}
                  className="w-full bg-neutral-900 rounded-xl px-3 py-2 text-sm outline-none"
                  style={draft.carbs_goal_set_by_coach ? coachFieldStyle : plainFieldStyle} />
              </div>
              <div>
                <label className="text-[11px] text-slate-500 flex items-center gap-1.5 mb-1">
                  Gordura (g/dia)
                  {draft.fat_goal_set_by_coach && <CoachBadge />}
                </label>
                <input type="number" value={draft.fat_goal || ''}
                  onChange={e => updateCoachableGoal('fat_goal', 'fat_goal_set_by_coach', parseInt(e.target.value) || null)}
                  className="w-full bg-neutral-900 rounded-xl px-3 py-2 text-sm outline-none"
                  style={draft.fat_goal_set_by_coach ? coachFieldStyle : plainFieldStyle} />
              </div>
              <div className="col-span-2">
                <label className="text-[11px] text-slate-500 flex items-center gap-1.5 mb-1">
                  Meta água (ml/dia)
                  {draft.water_goal_set_by_coach && <CoachBadge />}
                </label>
                <input type="number" step="50" value={draft.water_goal_ml || ''}
                  onChange={e => updateCoachableGoal('water_goal_ml', 'water_goal_set_by_coach', parseInt(e.target.value) || null)}
                  className="w-full bg-neutral-900 rounded-xl px-3 py-2 text-sm outline-none"
                  style={draft.water_goal_set_by_coach ? coachFieldStyle : plainFieldStyle} />
              </div>
            </div>

            {/* Toggle global de autorização — cobre todos os objetivos (nutrição,
                água, corpo). O Coach propõe sempre em texto primeiro e pede
                confirmação; só grava quando o atleta diz que sim. */}
            <div className="flex items-center justify-between mt-5 pt-4 border-t border-neutral-800">
              <div className="pr-4">
                <p className="text-xs font-semibold flex items-center gap-1.5">
                  <Bot size={14} style={{ color: 'var(--mod-coach-to)' }} /> O Coach pode ajustar as metas
                </p>
                <p className="text-[11px] text-slate-500 mt-1">
                  Permite que o Coach grave metas diretamente no teu perfil (nutrição, água e objetivos corporais)
                  quando concordares com a sugestão dele no chat. Os campos alterados pelo Coach ficam marcados com
                  "Coach"; editá-los à mão devolve o controlo a ti.
                </p>
              </div>
              <button onClick={() => updateDraft('coach_can_set_nutrition_goals', !draft.coach_can_set_nutrition_goals)} type="button"
                aria-label={draft.coach_can_set_nutrition_goals ? 'Desativar autorização do Coach' : 'Ativar autorização do Coach'}
                aria-pressed={!!draft.coach_can_set_nutrition_goals}
                className="w-11 h-6 rounded-full relative transition shrink-0"
                style={{ background: draft.coach_can_set_nutrition_goals ? 'var(--mod-coach-to)' : '#404040' }}>
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${draft.coach_can_set_nutrition_goals ? 'left-5' : 'left-0.5'}`}></span>
              </button>
            </div>

            <div className="flex items-center justify-between mt-5 pt-4 border-t border-neutral-800">
              <div className="pr-4">
                <p className="text-xs font-semibold flex items-center gap-1.5"><Bell size={14} className="text-blue-400" /> Lembretes de água</p>
                <p className="text-[11px] text-slate-500 mt-1">
                  Notificações entre as {formatHour(reminderStartHour)} e as {formatHour(reminderEndHour)} enquanto não atingires a meta.
                </p>
              </div>
              <button onClick={toggleWaterReminder} type="button" disabled={subscribingPush}
                aria-label={draft.water_reminder_enabled ? 'Desativar lembretes de água' : 'Ativar lembretes de água'}
                aria-pressed={!!draft.water_reminder_enabled}
                aria-busy={subscribingPush}
                className={`w-11 h-6 rounded-full relative transition shrink-0 disabled:opacity-60 ${draft.water_reminder_enabled ? 'bg-[var(--accent)]' : 'bg-neutral-700'}`}>
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${draft.water_reminder_enabled ? 'left-5' : 'left-0.5'}`}></span>
              </button>
            </div>

            {draft.water_reminder_enabled && (
              <div className="mt-3 space-y-3 fade-in">
                <div>
                  <label className="text-[11px] text-slate-500 block mb-1">Frequência (minutos)</label>
                  <select value={draft.water_reminder_interval_minutes || 120} onChange={e => updateDraft('water_reminder_interval_minutes', parseInt(e.target.value))}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/60">
                    {WATER_REMINDER_INTERVALS.map(m => (
                      <option key={m} value={m}>A cada {m} minutos</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-slate-500 block mb-1">Início</label>
                    <select value={reminderStartHour} onChange={e => updateDraft('water_reminder_start_hour', parseInt(e.target.value))}
                      className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/60">
                      {HOURS.map(h => <option key={h} value={h}>{formatHour(h)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500 block mb-1">Fim</label>
                    <select value={reminderEndHour} onChange={e => updateDraft('water_reminder_end_hour', parseInt(e.target.value))}
                      className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/60">
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
              <h2 className="text-sm font-semibold">Objetivos com o Coach</h2>
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

          <CoachMemoryCard />

          {/* A descontinuar — substituído pela Memória do Coach acima. Fica
              visível e editável só para o atleta poder migrar o que aqui tem;
              apagar já perderia texto escrito à mão. Quando estiver vazio para
              todos, remove-se o campo e a coluna coach_context. */}
          <div className="rounded-2xl p-4 bg-neutral-900/50 border border-amber-500/25">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <Bot size={16} className="text-slate-500" />
              <h2 className="text-sm font-semibold text-slate-400">Contexto do Coach</h2>
              <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400">
                A descontinuar
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mb-3 leading-relaxed">
              Este campo foi substituído pela <strong className="text-slate-400">Memória do Coach</strong>, logo acima,
              onde cada facto fica separado, com categoria, e pode ser corrigido um a um.
              Passa para lá o que ainda faz sentido e apaga aqui — enquanto tiver texto, a Carol continua a lê-lo.
            </p>
            <textarea
              rows="5"
              value={draft.coach_context || ''}
              onChange={e => updateDraft('coach_context', e.target.value)}
              placeholder="(vazio — usa a Memória do Coach acima)"
              className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm outline-none resize-none placeholder-slate-600 focus:border-amber-500/50"
            />
          </div>

          {saveButton}
        </>
      )}
    </div>
  );
}
