import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../../store';
import Button from '../shared/Button';
import { supabase } from '../../lib/supabase';
import { ensurePushSubscription } from '../../lib/push';
import { Bot, User, Target, LogOut, Bell, ChevronRight, Utensils, Footprints } from 'lucide-react';
import { ageFromBirthDate } from '../../utils/body';
import { EXPERIENCE_LEVELS, experienceLevelDescription } from '../../utils/experience';
import ExperienceLevelHelp from '../shared/ExperienceLevelHelp';
import { DIETARY_RESTRICTIONS, toggleRestriction, normalizeRestrictions } from '../../utils/diet';
import { useToast } from '../shared/ToastProvider';
import UnsavedChangesModal from '../shared/UnsavedChangesModal';
import CoachMemoryCard from './CoachMemoryCard';
import ShoeCabinet from './ShoeCabinet';
import { useCarouselHaptics } from '../../utils/haptics';
import { todayISO } from '../../lib/utils';

const TAB_KEYS = ['perfil', 'metas', 'equipamento', 'coach'];

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
// rgba(255,255,255,0.1) é o mesmo tom que a override global dá a
// border-slate-200 — mantém este campo igual aos outros do Perfil quando
// NÃO está sob influência do Coach (coachFieldStyle, acima, fica intacto).
const plainFieldStyle = { border: '1px solid rgba(255, 255, 255, 0.1)' };

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

  // Separadores também se deslizam, como um carrossel (mesmo mecanismo do
  // Dashboard — ver esse ficheiro). Trocar de sub-tab a deslizar passa pela
  // mesma verificação de "alterações por gravar" que já existia ao tocar no
  // separador: se estiver sujo, repõe a posição do carrossel e mostra o
  // mesmo aviso em vez de deixar o deslize completar-se.
  const tabIndex = TAB_KEYS.indexOf(tab);
  const scrollRef = useRef(null);
  const scrollToRef = useRef(() => {});
  const handleTabIndexChange = useCallback((idx) => {
    const nextTab = TAB_KEYS[idx];
    if (!nextTab || nextTab === tab) return;
    if (isDirty) {
      scrollToRef.current(TAB_KEYS.indexOf(tab));
      setLeavePrompt({ kind: 'tab', target: nextTab });
      return;
    }
    setTab(nextTab);
  }, [tab, isDirty]);
  const { handleScroll, handleTouchMove, scrollTo } = useCarouselHaptics(
    scrollRef, TAB_KEYS.length, tabIndex, handleTabIndexChange
  );
  scrollToRef.current = scrollTo;

  // tab também muda por fora do carrossel (ex.: goToPendingTarget) —
  // sincroniza o scroll nesses casos.
  useEffect(() => {
    scrollTo(tabIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabIndex]);

  // O carrossel (tab-swipe-carousel, align-items:flex-start) fica sempre com
  // a altura do separador mais alto dos 4 — "Guardar alterações" ficava
  // sempre a essa distância fixa do topo, mesmo num separador bem mais curto
  // (ex.: "Metas"), com um vão enorme e vazio até ao botão. Aqui só se
  // ajusta a ALTURA do próprio carrossel à do separador atualmente visível —
  // não mexe na classe partilhada tab-swipe-carousel (o Dashboard usa a
  // mesma), só num estilo inline específico deste componente.
  const pageRefs = useRef([]);
  const [carouselHeight, setCarouselHeight] = useState(null);
  useEffect(() => {
    const el = pageRefs.current[tabIndex];
    if (!el) return;
    setCarouselHeight(el.offsetHeight);
    // jsdom (testes) não implementa ResizeObserver — sem ele só perde-se o
    // acompanhamento de alterações de altura dentro do separador (ex.: abrir
    // os campos extra dos lembretes de água), a medição inicial acima já
    // corre sempre.
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setCarouselHeight(entry.contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [tabIndex]);

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

  // Tocar num separador passa pelo mesmo aviso que sair do Perfil quando há
  // alterações por gravar; scrollTo desliza o carrossel até lá (que por sua
  // vez chama handleTabIndexChange, acima) em vez de mudar o tab só por si.
  const requestTabChange = (nextTab) => {
    if (nextTab === tab) return;
    if (isDirty) {
      setLeavePrompt({ kind: 'tab', target: nextTab });
      return;
    }
    scrollTo(TAB_KEYS.indexOf(nextTab));
  };

  const goToPendingTarget = async ({ kind, target }) => {
    if (kind === 'tab') {
      // isDirty já está a false a esta altura (discardAndLeave/saveAndLeave
      // repõem-no antes de chamar isto), por isso handleTabIndexChange segue
      // direto para setTab em vez de voltar a mostrar o aviso.
      scrollTo(TAB_KEYS.indexOf(target));
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
      // Sem moduleColor, "module" (Button.jsx) fica só com text-white
      // shadow-sm — sem fundo nenhum, por isso "Guardar alterações"
      // aparecia como texto solto em vez de botão. --mod-prova é a cor de
      // identidade do Perfil (já usada no indicador dos separadores acima).
      moduleColor="var(--mod-prova)"
      onClick={handleSave}
      disabled={!isDirty || isSaving}
      isLoading={isSaving}
      // text-amber-950 sobrepõe-se ao text-white do variant="module" (ver
      // Button.jsx, className é o último a entrar no cn()/twMerge) — dourado
      // (#fbbf24) é claro demais para branco em cima dar contraste WCAG AA,
      // mesmo raciocínio já registado no botão "Guardar" de RunAgenda.jsx.
      className="w-full mt-4 text-xs py-3 text-amber-950"
    >
      Guardar alterações
    </Button>
  );

  return (
    <div className="space-y-4 fade-in pb-8">
      {/* Subnav — mesmo vidro do separador de módulo do Dashboard */}
      <div className="relative flex gap-2 p-2 bg-white/5 backdrop-blur-[20px] border border-white/60 rounded-2xl mb-4 shadow-[0_16px_40px_rgba(0,0,0,0.3),inset_0_2px_10px_rgba(255,255,255,0.6)] overflow-hidden">
        {/* Sliding indicator — tint translúcido em vez de preenchimento
            sólido, a condizer com o resto da app (ver Dashboard.jsx).
            rounded-lg (não -xl) e p-2 (não -1.5): com o contentor a
            rounded-2xl (16px), uma pílula com raio maior do que sobra depois
            do preenchimento ficava com o canto cortado pelo overflow-hidden,
            mais visível na pílula da direita. */}
        <div
          className="absolute top-1 bottom-1 rounded-lg transition-all duration-300 ease-in-out border"
          style={{
            width: 'calc((100% - 24px) / 4)', // 4 tabs, 3 gaps of 8px
            transform: `translateX(calc(${tabIndex} * 100% + ${tabIndex * 8}px))`,
            background: 'color-mix(in srgb, var(--mod-prova) 18%, transparent)',
            borderColor: 'color-mix(in srgb, var(--mod-prova) 40%, transparent)',
          }}
        />
        {[
          { key: 'perfil', label: 'Pessoal', icon: User },
          { key: 'metas', label: 'Metas', icon: Target },
          { key: 'equipamento', label: 'Equipa.', icon: Footprints },
          { key: 'coach', label: 'Coach', icon: Bot },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => requestTabChange(t.key)}
            style={tab === t.key ? { color: 'var(--mod-prova)' } : undefined}
            className={`relative z-10 flex-1 flex items-center justify-center gap-1 py-2 text-[11px] font-semibold rounded-lg transition-colors duration-300 ${
              tab === t.key ? '' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
            }`}
          >
            <t.icon size={13} /> {t.label}
          </button>
        ))}
      </div>

      {leaveModal}

      {/* Separadores lado a lado, como o Dashboard — os 4 ficam sempre
          montados (partilham o mesmo draft/isDirty, nada se perde ao
          ficarem lado a lado) e o scroll nativo com snap trata do resto. */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        onTouchMove={handleTouchMove}
        className="tab-swipe-carousel"
        style={carouselHeight != null ? { height: carouselHeight, overflowY: 'hidden', transition: 'height 0.2s ease' } : undefined}
      >
      <div ref={(el) => { pageRefs.current[0] = el; }} className="tab-swipe-page space-y-4">
          <div className="module-card-contrast">
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
                  className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/60"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-500 block mb-1">Género</label>
                <select
                  value={draft.gender || ''}
                  onChange={e => updateDraft('gender', e.target.value)}
                  className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/60"
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
                  className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/60"
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
                  className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/60"
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
              {/* Restrições alimentares mudaram-se para a aba Coach — vivem ao
                  lado da Memória do Coach, o outro sítio onde o atleta declara
                  factos que a Carol tem de respeitar sempre. Ver o cartão
                  "Restrições Alimentares" em tab === 'coach'. */}
              <button
                type="button"
                onClick={() => requestTabChange('coach')}
                className="w-full flex items-center justify-between gap-2 bg-slate-50/50 border border-slate-200 rounded-xl px-3 py-2.5 text-left hover:bg-slate-50/70 transition"
              >
                <span className="text-[11px] text-slate-500">
                  Restrições alimentares e alergias agora vivem na aba{' '}
                  <span className="font-semibold" style={{ color: 'var(--mod-coach-to)' }}>Coach</span>
                  , junto da Memória do Coach.
                </span>
                <ChevronRight size={14} className="text-slate-500 shrink-0" />
              </button>
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
                  className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/60"
                />
                <p className="text-[10px] text-slate-600 mt-1">
                  Mede ao acordar, antes de te levantares. Torna as zonas de
                  frequência cardíaca mais precisas e permite ao Coach detetar
                  fadiga acumulada — uma subida sustentada face ao teu normal é
                  dos primeiros sinais de sobretreino.
                </p>
              </div>
            </div>
          </div>
          
          <div className="module-card-contrast">
            <p className="text-[11px] text-slate-500 mb-3">Sessão iniciada como <b className="text-slate-300">{session?.user?.email}</b></p>
            <button onClick={handleSignOut} className="w-full border border-red-500/40 text-red-400 text-xs font-semibold rounded-xl py-2.5 flex items-center justify-center gap-1.5 hover:bg-red-500/10 transition">
              <LogOut size={14} /> Terminar sessão
            </button>
          </div>
      </div>

      <div ref={(el) => { pageRefs.current[1] = el; }} className="tab-swipe-page space-y-4">
          <div className="module-card-contrast">
            <div className="flex items-center gap-2 mb-3">
              <User size={16} className="text-[var(--accent)]" />
              <h2 className="text-sm font-semibold">Avaliação Corporal</h2>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="text-[11px] text-slate-500 block mb-1">Altura (cm)</label>
                <input type="number" value={draft.height_cm || ''} onChange={e => updateDraft('height_cm', parseFloat(e.target.value) || null)}
                  className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/60" />
              </div>
              <div>
                <label className="text-[11px] text-slate-500 block mb-1">Peso atual (kg)</label>
                <input type="number" step="0.1" value={draft.weight_kg || ''} onChange={e => updateDraft('weight_kg', parseFloat(e.target.value) || null)}
                  className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/60" />
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
                      className="w-full bg-slate-50/50 rounded-xl px-3 py-2 text-sm outline-none"
                      style={isCoach ? coachFieldStyle : plainFieldStyle} />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="module-card-contrast">
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
                  className="w-full bg-slate-50/50 rounded-xl px-3 py-2 text-sm outline-none"
                  style={draft.calorie_goal_set_by_coach ? coachFieldStyle : plainFieldStyle} />
              </div>
              <div>
                <label className="text-[11px] text-slate-500 flex items-center gap-1.5 mb-1">
                  Proteína (g/dia)
                  {draft.protein_goal_set_by_coach && <CoachBadge />}
                </label>
                <input type="number" value={draft.protein_goal || ''}
                  onChange={e => updateCoachableGoal('protein_goal', 'protein_goal_set_by_coach', parseInt(e.target.value) || null)}
                  className="w-full bg-slate-50/50 rounded-xl px-3 py-2 text-sm outline-none"
                  style={draft.protein_goal_set_by_coach ? coachFieldStyle : plainFieldStyle} />
              </div>
              <div>
                <label className="text-[11px] text-slate-500 flex items-center gap-1.5 mb-1">
                  Hidratos (g/dia)
                  {draft.carbs_goal_set_by_coach && <CoachBadge />}
                </label>
                <input type="number" value={draft.carbs_goal || ''}
                  onChange={e => updateCoachableGoal('carbs_goal', 'carbs_goal_set_by_coach', parseInt(e.target.value) || null)}
                  className="w-full bg-slate-50/50 rounded-xl px-3 py-2 text-sm outline-none"
                  style={draft.carbs_goal_set_by_coach ? coachFieldStyle : plainFieldStyle} />
              </div>
              <div>
                <label className="text-[11px] text-slate-500 flex items-center gap-1.5 mb-1">
                  Gordura (g/dia)
                  {draft.fat_goal_set_by_coach && <CoachBadge />}
                </label>
                <input type="number" value={draft.fat_goal || ''}
                  onChange={e => updateCoachableGoal('fat_goal', 'fat_goal_set_by_coach', parseInt(e.target.value) || null)}
                  className="w-full bg-slate-50/50 rounded-xl px-3 py-2 text-sm outline-none"
                  style={draft.fat_goal_set_by_coach ? coachFieldStyle : plainFieldStyle} />
              </div>
              <div className="col-span-2">
                <label className="text-[11px] text-slate-500 flex items-center gap-1.5 mb-1">
                  Meta água (ml/dia)
                  {draft.water_goal_set_by_coach && <CoachBadge />}
                </label>
                <input type="number" step="50" value={draft.water_goal_ml || ''}
                  onChange={e => updateCoachableGoal('water_goal_ml', 'water_goal_set_by_coach', parseInt(e.target.value) || null)}
                  className="w-full bg-slate-50/50 rounded-xl px-3 py-2 text-sm outline-none"
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
                    className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/60">
                    {WATER_REMINDER_INTERVALS.map(m => (
                      <option key={m} value={m}>A cada {m} minutos</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-slate-500 block mb-1">Início</label>
                    <select value={reminderStartHour} onChange={e => updateDraft('water_reminder_start_hour', parseInt(e.target.value))}
                      className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/60">
                      {HOURS.map(h => <option key={h} value={h}>{formatHour(h)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500 block mb-1">Fim</label>
                    <select value={reminderEndHour} onChange={e => updateDraft('water_reminder_end_hour', parseInt(e.target.value))}
                      className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/60">
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
      </div>

      {/* Equipamento — ao contrário dos outros separadores, este não escreve
          no rascunho partilhado: o armário faz o seu próprio CRUD na tabela
          shoes, par a par, e grava logo. "Guardar alterações" lá em baixo
          continua a ser só dos campos do perfil. */}
      <div ref={(el) => { pageRefs.current[2] = el; }} className="tab-swipe-page space-y-4">
          <ShoeCabinet />
      </div>

      <div ref={(el) => { pageRefs.current[3] = el; }} className="tab-swipe-page space-y-4">
          {/* "Objetivos com o Coach" (botão "Pedir ao Coach para definir
              objetivos") foi removido — nunca chegou a chamar a Edge Function
              suggest-goals (era um placeholder com setTimeout, ver histórico
              git), e os objetivos já se discutem e definem a sério pelo Chat
              (update_goals, com ecrã de aceitar/recusar). Manter os dois
              caminhos seria redundante e o botão daqui nunca funcionou.
              A própria Edge Function suggest-goals foi removida a
              2026-08-23, já sem nada que a chamasse. */}
          <CoachMemoryCard />

          {/* Restrições alimentares — pré-requisito das sugestões do Coach.
              Sem isto o Coach não fica calado, fica errado: sugere frango a
              um vegetariano. Ver specs/coach-investigacao.md, Bloco 7 #5.
              Vive aqui (não em "Alimentação" na Memória do Coach) porque é
              vocabulário fechado com alvos nutricionais citados por trás
              (utils/diet.js) — uma nota de texto livre não os dispara. */}
          <div className="module-card-contrast">
            <div className="flex items-center gap-2 mb-3">
              <Utensils size={16} className="text-[var(--mod-coach-to)]" />
              <h2 className="text-sm font-semibold">Restrições Alimentares</h2>
            </div>
            <p className="text-[11px] text-slate-500 mb-3 leading-relaxed">
              Regra absoluta que o Coach nunca contraria — ao contrário da Memória, aqui é a
              Carol que calcula por trás as metas de nutrientes certas para cada restrição.
            </p>
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
                        ? 'bg-[var(--mod-coach-to)]/20 border-[var(--mod-coach-to)]/60 text-[var(--mod-coach-to)]'
                        : 'bg-slate-50/50 border-slate-200 text-slate-400'
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
              className="w-full mt-2 bg-slate-50/50 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[var(--mod-coach-to)]/60"
            />
            <p className="text-[10px] text-slate-600 mt-1">
              O Coach trata isto como regra absoluta e nunca sugere nada que
              a contrarie.
            </p>
          </div>

          {/* "Contexto do Coach" removido — era só uma migração temporária
              para a Memória do Coach acima (coach_notes), com um badge "A
              descontinuar". O texto que aqui havia (2 contas) já foi
              transposto para lá a 2026-08-20; profiles.coach_context ficou
              a null para todos. A coluna em si não foi apagada, mas desde
              que a suggest-goals foi removida (2026-08-23) já não tem
              leitor nenhum — está morta. */}
      </div>
      </div>

      {/* Um só botão, fora do carrossel — Pessoal/Metas/Coach partilham o
          mesmo rascunho, por isso "Guardar alterações" já grava tudo o
          que estiver por gravar em qualquer um deles, não só no visível.
          O Equipamento é a exceção: grava-se a si próprio, par a par. */}
      {saveButton}
    </div>
  );
}
