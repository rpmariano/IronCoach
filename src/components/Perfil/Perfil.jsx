import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../../store';
import Button from '../shared/Button';
import { supabase } from '../../lib/supabase';
import { ensurePushSubscription } from '../../lib/push';
import { User, Target, LogOut, Bell, ChevronRight, ShieldCheck, Utensils, Footprints, Plus, Medal, MessageSquare } from 'lucide-react';
import CarolIcon from '../Coach/CarolIcon';
import { ageFromBirthDate } from '../../utils/body';
import { EXPERIENCE_LEVELS, experienceLevelDescription } from '../../utils/experience';
import ExperienceLevelHelp from '../shared/ExperienceLevelHelp';
import { DIETARY_RESTRICTIONS, toggleRestriction, normalizeRestrictions } from '../../utils/diet';
import { useToast } from '../shared/ToastProvider';
import UnsavedChangesModal from '../shared/UnsavedChangesModal';
import CoachMemoryCard from './CoachMemoryCard';
import TabelasConsentScreen from './TabelasConsentScreen';
import CoachAvatar from '../Coach/CoachAvatar';
import ShoeCabinet from './ShoeCabinet';
import BadgesCard from './BadgesCard';
import ActionBar, { ACTION_BAR_SCROLL_PAD } from '../shared/ActionBar';
import useCarouselActiveHeight from '../../utils/useCarouselActiveHeight';
import CoachInsightsDock from '../BI/CoachInsightsDock';
import { useCarouselHaptics } from '../../utils/haptics';
import SubNav from '../shared/SubNav';
import { useTabEnter } from '../../utils/useTabEnter';
import { todayISO } from '../../lib/utils';

const TAB_KEYS = ['perfil', 'metas', 'vitrina', 'equipamento', 'coach'];

/* Os cinco separadores do Perfil no SubNav (ponto 4 do handoff). O tom é o do
   assunto de cada um — Pessoal ginásio, Metas a prova, Vitrina a prova,
   Equipamento corrida, Coach a Carol — como o mock "Perfil" e os três
   "Submenus do Perfil" mostram, em vez de o âmbar da prova em todos.
   "Equipa." é a abreviatura do mock: quatro rótulos por extenso em 348px
   cairiam abaixo dos 11px (auditoria, achado 1); com cinco separadores o
   vão de cada botão fica ainda mais apertado — medido a 390px no relatório
   desta mudança, sem encolher texto abaixo desse piso.

   Vitrina — os badges (2026-09-22, reforma da gamificação) — fica entre
   Metas e Equipamento: Metas é para onde vais, Vitrina é o que já ganhaste
   por lá, e só depois vem o equipamento com que o fazes. Leva o mesmo tom
   --race de Metas (não um tom novo): o que se ganha ganha-se a correr, e a
   prova é o horizonte de tudo o que está lá dentro — partilhar o tom é
   continuar o mesmo significado, não inventar um segundo. */
const TABS = [
  { key: 'perfil', label: 'Pessoal', icon: <User size={14} />, tone: 'gym' },
  { key: 'metas', label: 'Metas', icon: <Target size={14} />, tone: 'race' },
  // Medalha, não troféu: o troféu é o símbolo das Provas em toda a app.
  { key: 'vitrina', label: 'Vitrina', icon: <Medal size={14} />, tone: 'race' },
  // srLabel: "Equipa." lê-se "equipa" num leitor de ecrã, que é outra coisa.
  // O SubNav já tem o mecanismo (o Dashboard usa-o em "Geral" → "Visão
  // Geral"); faltava aqui.
  { key: 'equipamento', label: 'Equipa.', srLabel: 'Equipamento', icon: <Footprints size={14} />, tone: 'run' },
  { key: 'coach', label: 'Carol', icon: <CarolIcon size={14} />, tone: 'coach' },
];

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

// Badge inline que assinala que um campo foi escrito pela Carol.
function CoachBadge() {
  return (
    <span title="Meta definida pela Carol"
      className="px-1.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide shrink-0 shadow-sm text-[var(--coach-ink)]"
      style={{ background: 'var(--grad-coach-legible)' }}>
      Carol
    </span>
  );
}

const WATER_REMINDER_INTERVALS = [30, 60, 90, 120, 180, 240];
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const DEFAULT_REMINDER_START_HOUR = 8;
const DEFAULT_REMINDER_END_HOUR = 22;

const formatHour = (h) => `${String(h).padStart(2, '0')}:00`;

/* As notificações da Carol (specs/carol-omnisciencia-omnipresenca.md, P.6):
   o interruptor dela, independente da água, e as preferências que o
   coach-proactive-tick lê. Os valores por omissão são os da migration
   carol_push_preferences. */
const DEFAULT_CAROL_PUSH_START_HOUR = 9;
const DEFAULT_CAROL_PUSH_END_HOUR = 21;
const CAROL_PUSH_TYPES = [
  { key: 'intervention', label: 'Assuntos por resolver' },
  { key: 'race_morning', label: 'Manhã da prova' },
  { key: 'race_eve', label: 'Véspera da prova' },
  { key: 'race_conflict', label: 'Provas em conflito' },
  { key: 'race_after', label: 'Balanço da prova' },
  { key: 'block_end', label: 'Fim de bloco' },
  { key: 'silence', label: 'Dias sem registos' },
  { key: 'week_review', label: 'Balanço da semana' },
];
const ALL_CAROL_PUSH_TYPES = CAROL_PUSH_TYPES.map((t) => t.key);

export default function Perfil() {
  const { profile, setProfile, session, setNavGuard, setOnboardingOpen } = useAppStore();
  const [tab, setTab] = useState('perfil');
  // O ecrã do consentimento das tabelas (Fase 5) — ecrã inteiro por portal,
  // como o onboarding: não é um separador nem um formulário deste ecrã.
  const [tabelasOpen, setTabelasOpen] = useState(false);

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
  // Espelha isDirty numa ref, atualizada de imediato no corpo do render (tal
  // como scrollToRef, abaixo) — não num useEffect. discardAndLeave/
  // saveAndLeave chamam goToPendingTarget logo a seguir a setIsDirty(false),
  // sem esperar por um novo render; se handleTabIndexChange lesse `isDirty`
  // do closure do useCallback (só atualizado no próximo render), via a
  // scrollTo síncrona despoletada por goToPendingTarget, encontrava sempre o
  // valor antigo (true) e voltava a abrir este mesmo aviso — o popup não
  // desaparecia e o scroll físico do carrossel avançava para o separador de
  // destino sem o estado `tab` (que pinta o menu) alguma vez acompanhar.
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;
  const handleTabIndexChange = useCallback((idx) => {
    const nextTab = TAB_KEYS[idx];
    if (!nextTab || nextTab === tab) return;
    if (isDirtyRef.current) {
      scrollToRef.current(TAB_KEYS.indexOf(tab));
      setLeavePrompt({ kind: 'tab', target: nextTab });
      return;
    }
    setTab(nextTab);
  }, [tab]);
  const { handleScroll, handleTouchMove, scrollTo } = useCarouselHaptics(
    scrollRef, TAB_KEYS.length, tabIndex, handleTabIndexChange
  );
  scrollToRef.current = scrollTo;

  // "O conteúdo segue a pílula": o separador que fica ativo entra do lado de
  // onde veio, 14px e uma pitada de opacidade, em 280ms.
  const setPageRef = useTabEnter(tabIndex);

  // O armário de sapatilhas grava-se a si próprio; a barra do separador
  // Equipamento só lhe pede para abrir o formulário de um par novo.
  const shoeCabinetRef = useRef(null);

  // tab também muda por fora do carrossel (ex.: goToPendingTarget) —
  // sincroniza o scroll nesses casos.
  useEffect(() => {
    scrollTo(tabIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabIndex]);

  /* A ação de cada separador vive na ActionBar fixa (ponto 2 do handoff).
     Antes ficava no fim do carrossel e, como o carrossel
     (tab-swipe-carousel, align-items:flex-start) tem sempre a altura do
     separador mais alto dos 4, "Guardar alterações" aparecia à mesma
     distância fixa do topo mesmo num separador curto. Media-se então a
     altura do separador visível para encolher o carrossel; ao tirar o botão
     do scroll, essa medição foi removida — mas o vão continuou lá, agora
     como scroll vazio por baixo do conteúdo de um separador curto. Foi
     exatamente isso que o utilizador relatou a partir deste ecrã ("o limite
     de scroll tem de ser ajustado ao conteúdo existente em cada tela"), e é
     o que o hook partilhado volta a resolver. */
  const pageRefs = useRef([]);
  useCarouselActiveHeight(scrollRef, pageRefs, tabIndex);

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

  /* O mesmo contrato da água: ligar pede a permissão e subscreve já (é uma
     ação do browser); o valor em si é rascunho e só fica com o Guardar. */
  const toggleCarolPush = async () => {
    const enabling = !draft.carol_push_enabled;
    if (!enabling) {
      updateDraft('carol_push_enabled', false);
      return;
    }
    setSubscribingPush(true);
    const { ok, error } = await ensurePushSubscription();
    setSubscribingPush(false);
    if (!ok) {
      showToast(error, 'error');
      return;
    }
    updateDraft('carol_push_enabled', true);
  };

  const toggleCarolPushType = (key) => {
    const current = Array.isArray(draft.carol_push_types) ? draft.carol_push_types : ALL_CAROL_PUSH_TYPES;
    const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
    // A ordem é sempre a da lista, para o rascunho não parecer mudado sem estar.
    updateDraft('carol_push_types', ALL_CAROL_PUSH_TYPES.filter((k) => next.includes(k)));
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

      if ('height_cm' in updates && updates.height_cm !== null) {
        const hVal = updates.height_cm;
        if (!Number.isInteger(hVal)) {
          showToast('A altura deve ser um número inteiro em centímetros (ex.: 175).', 'error');
          setIsSaving(false);
          return false;
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

  // A pergunta entra no chat como se o atleta a tivesse escrito (intent
  // 'say'); sair com alterações por gravar passa pelo mesmo navGuard.
  const askCarolForGoals = () => {
    const { setCoachIntent, setActiveTab } = useAppStore.getState();
    setCoachIntent({
      kind: 'say',
      text: 'Quero definir os meus objetivos contigo, para o corpo e para a nutrição. Olha para as minhas avaliações corporais e para o meu treino e propõe-me metas.',
    });
    setActiveTab('coach');
  };

  const discardAndLeave = () => {
    const pending = leavePrompt;
    dirtyKeys.current.clear();
    setDraft(profile || {});
    setIsDirty(false);
    isDirtyRef.current = false; // ver comentário junto de isDirtyRef, acima
    setLeavePrompt(null);
    goToPendingTarget(pending);
  };

  const saveAndLeave = async () => {
    const pending = leavePrompt;
    const saved = await handleSave();
    if (!saved) return; // mantém o aviso aberto para o utilizador decidir
    isDirtyRef.current = false; // ver comentário junto de isDirtyRef, acima
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
  const carolStartHour = draft.carol_push_start_hour ?? DEFAULT_CAROL_PUSH_START_HOUR;
  const carolEndHour = draft.carol_push_end_hour ?? DEFAULT_CAROL_PUSH_END_HOUR;
  const carolMaxPerDay = draft.carol_push_max_per_day ?? 1;
  const carolTypes = Array.isArray(draft.carol_push_types) ? draft.carol_push_types : ALL_CAROL_PUSH_TYPES;
  // Sem a coluna (perfil antigo), as boas-vindas estão ligadas.
  const welcomeOn = draft.carol_welcome_enabled !== false;

  const leaveModal = (
    <UnsavedChangesModal
      isOpen={!!leavePrompt}
      isSaving={isSaving}
      onSaveAndLeave={saveAndLeave}
      onDiscardAndLeave={discardAndLeave}
      onCancel={() => {
        // Cancelar a saída para o Coach deixava pendurado o pedido à Carol
        // (ex.: "Definir objetivos com a Carol", ou discutir uma nota da
        // memória): seria enviado sozinho, em nome do atleta, da próxima vez
        // que abrisse o chat (revisão pré-deploy da Vaga 1).
        if (leavePrompt?.target === 'coach') useAppStore.getState().setCoachIntent(null);
        setLeavePrompt(null);
      }}
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
      // A tinta vem do próprio Button (resolveModuleInk, a partir do
      // moduleColor) — dourado (#fbbf24) é claro demais para branco em cima.
      className="w-full text-xs"
    >
      Guardar alterações
    </Button>
  );

  // Equipamento não escreve no rascunho partilhado (o armário grava-se a si
  // próprio, par a par) — a ação da barra nesse separador é a do mock:
  // abrir o formulário de um par novo.
  const addShoesButton = (
    <Button
      variant="module"
      moduleColor="var(--mod-corrida)"
      onClick={() => shoeCabinetRef.current?.openNew()}
      className="w-full text-xs"
    >
      <Plus size={14} /> Adicionar sapatilhas
    </Button>
  );

  return (
    // --focus-ring: anel de teclado na cor do contexto (handoff, "Fidelity").
    // O Perfil é dourado como a prova — a mesma cor do indicador dos
    // separadores e do "Guardar alterações".
    <div data-screen="perfil" className="space-y-4 fade-in" style={{ '--focus-ring': 'var(--mod-prova)', paddingBottom: ACTION_BAR_SCROLL_PAD }}>
      {/* Subnav — SubNav.jsx (ponto 4 do handoff): minhoca a 320ms na cor do
          separador ativo, ícone + rótulo nos quatro. */}
      <SubNav
        items={TABS}
        activeIndex={tabIndex}
        onChange={(i, item) => requestTabChange(item.key)}
        className="mb-4"
      />

      {leaveModal}

      {/* Separadores lado a lado, como o Dashboard — os 4 ficam sempre
          montados (partilham o mesmo draft/isDirty, nada se perde ao
          ficarem lado a lado) e o scroll nativo com snap trata do resto. */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        onTouchMove={handleTouchMove}
        className="tab-swipe-carousel"
      >
      <div ref={(el) => { pageRefs.current[0] = el; setPageRef(0)(el); }} className="tab-swipe-page space-y-4">
          <h2 className="sr-only">Pessoal</h2>
          <div className="module-card-contrast">
            <div className="flex items-center gap-2 mb-4">
              <User size={16} className="text-[var(--gym)]" />
              <h3 className="text-sm font-semibold">Pessoal</h3>
            </div>
            <div className="space-y-3">
              <div>
                <label htmlFor="perfil-nome" className="text-[11px] text-[var(--text-3)] block mb-1">Nome</label>
                <input
                  id="perfil-nome"
                  type="text"
                  value={draft.display_name || ''}
                  onChange={e => updateDraft('display_name', e.target.value)}
                  className="w-full bg-[var(--surface-soft)] border border-[var(--border-glass)] rounded-xl px-3 py-2 text-sm outline-none focus:border-[var(--focus-ring)]/60"
                />
              </div>
              <div>
                <label htmlFor="perfil-genero" className="text-[11px] text-[var(--text-3)] block mb-1">Género</label>
                <select
                  id="perfil-genero"
                  value={draft.gender || ''}
                  onChange={e => updateDraft('gender', e.target.value)}
                  className="w-full bg-[var(--surface-soft)] border border-[var(--border-glass)] rounded-xl px-3 py-2 text-sm outline-none focus:border-[var(--focus-ring)]/60"
                >
                  <option value="">–</option>
                  <option value="F">Feminino</option>
                  <option value="M">Masculino</option>
                </select>
              </div>
              <div>
                <label htmlFor="perfil-nascimento" className="text-[11px] text-[var(--text-3)] block mb-1">
                  Data de nascimento
                  {ageFromBirthDate(draft.birth_date) != null && (
                    <span className="text-[var(--text-3)]"> · {ageFromBirthDate(draft.birth_date)} anos</span>
                  )}
                </label>
                <input
                  id="perfil-nascimento"
                  type="date"
                  max={todayISO()}
                  value={draft.birth_date || ''}
                  onChange={e => updateDraft('birth_date', e.target.value || null)}
                  className="w-full bg-[var(--surface-soft)] border border-[var(--border-glass)] rounded-xl px-3 py-2 text-sm outline-none focus:border-[var(--focus-ring)]/60"
                />
                <p className="text-[11px] text-[var(--text-3)] mt-1">
                  Usada para calcular as zonas de frequência cardíaca e ajustar as
                  recomendações do coach. Guardamos a data, não a idade.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="perfil-altura" className="text-[11px] text-[var(--text-3)] block mb-1">Altura (cm)</label>
                  <input id="perfil-altura" type="number" value={draft.height_cm || ''} onChange={e => updateDraft('height_cm', parseFloat(e.target.value) || null)}
                    className="w-full bg-[var(--surface-soft)] border border-[var(--border-glass)] rounded-xl px-3 py-2 text-sm outline-none focus:border-[var(--focus-ring)]/60" />
                </div>
                <div>
                  <label htmlFor="perfil-peso" className="text-[11px] text-[var(--text-3)] block mb-1">Peso atual (kg)</label>
                  <input id="perfil-peso" type="number" step="0.1" value={draft.weight_kg || ''} onChange={e => updateDraft('weight_kg', parseFloat(e.target.value) || null)}
                    className="w-full bg-[var(--surface-soft)] border border-[var(--border-glass)] rounded-xl px-3 py-2 text-sm outline-none focus:border-[var(--focus-ring)]/60" />
                </div>
              </div>
              <p className="text-[11px] text-[var(--text-3)] -mt-1">
                O peso atual atualiza-se sozinho quando registas uma avaliação corporal recente.
              </p>
              <ExperienceLevelHelp label="Nível como corredor" variant="dark" fieldId="perfil-nivel">
                <select
                  id="perfil-nivel"
                  value={draft.experience_level || ''}
                  onChange={e => updateDraft('experience_level', e.target.value || null)}
                  className="w-full bg-[var(--surface-soft)] border border-[var(--border-glass)] rounded-xl px-3 py-2 text-sm outline-none focus:border-[var(--focus-ring)]/60"
                >
                  <option value="">–</option>
                  {EXPERIENCE_LEVELS.map(l => <option key={l.key} value={l.key}>{l.label}</option>)}
                </select>
                <p className="text-[11px] text-[var(--text-3)] mt-1">
                  {draft.experience_level
                    ? experienceLevelDescription(draft.experience_level)
                    : 'Calibra a linguagem e os limiares de treino da Carol.'}
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
                className="w-full min-h-[44px] flex items-center justify-between gap-2 bg-[var(--surface-soft)] border border-[var(--border-glass)] rounded-xl px-3 py-2.5 text-left hover:bg-[var(--surface-glass)] transition"
              >
                <span className="text-[11px] text-[var(--text-3)]">
                  Restrições alimentares e alergias agora vivem na aba{' '}
                  <span className="font-semibold" style={{ color: 'var(--mod-coach-to)' }}>Carol</span>
                  , junto da Memória da Carol.
                </span>
                <ChevronRight size={14} className="text-[var(--text-3)] shrink-0" />
              </button>
              <div>
                <label htmlFor="perfil-fc-repouso" className="text-[11px] text-[var(--text-3)] block mb-1">FC em repouso (bpm)</label>
                <input
                  id="perfil-fc-repouso"
                  type="number"
                  min="25"
                  max="120"
                  inputMode="numeric"
                  placeholder="Ex.: 52"
                  value={draft.resting_hr_bpm ?? ''}
                  onChange={e => updateDraft('resting_hr_bpm', e.target.value === '' ? null : parseInt(e.target.value, 10))}
                  className="w-full bg-[var(--surface-soft)] border border-[var(--border-glass)] rounded-xl px-3 py-2 text-sm outline-none focus:border-[var(--focus-ring)]/60"
                />
                <p className="text-[11px] text-[var(--text-3)] mt-1">
                  Mede ao acordar, antes de te levantares. Torna as zonas de
                  frequência cardíaca mais precisas e permite à Carol detetar
                  fadiga acumulada — uma subida sustentada face ao teu normal é
                  dos primeiros sinais de sobretreino.
                </p>
              </div>
            </div>
          </div>
          
          <div className="module-card-contrast">
            <p className="text-[11px] text-[var(--text-3)] mb-3">Sessão iniciada como <b className="text-[var(--text-3)]">{session?.user?.email}</b></p>
            <button onClick={handleSignOut} className="w-full min-h-[44px] border border-[var(--tint-danger-bd)] text-[var(--danger)] text-xs font-semibold rounded-xl py-2.5 flex items-center justify-center gap-1.5 hover:bg-[var(--tint-danger-bg)] transition">
              <LogOut size={14} /> Terminar sessão
            </button>
          </div>
      </div>

      <div ref={(el) => { pageRefs.current[1] = el; setPageRef(1)(el); }} className="tab-swipe-page space-y-4">
          <h2 className="sr-only">Metas</h2>
          {/* Bug #41 (2026-09-22): Metas é só o que o atleta quer atingir — a
              altura e o peso atual são medições e passaram para o Pessoal.
              Este cartão diz-o e leva à Carol, com quem os objetivos se
              afinam (update_goals, aceitar/recusar na persiana). */}
          <div className="module-card-contrast" data-testid="perfil-metas-intro">
            <div className="flex items-center gap-2 mb-2">
              <Target size={16} style={{ color: 'var(--coach)' }} />
              <h3 className="text-sm font-semibold">As tuas metas</h3>
            </div>
            <p className="text-[11.5px] text-[var(--text-3)] leading-relaxed">
              Tudo o que está aqui são objetivos teus — o corpo e a nutrição que queres
              atingir, não medições. Afina-os com a Carol: ela olha para as tuas
              avaliações corporais e para o teu treino e propõe valores, que aceitas ou recusas.
            </p>
            <button
              type="button"
              data-testid="perfil-metas-carol"
              onClick={askCarolForGoals}
              className="w-full inline-flex items-center justify-center gap-2 min-h-[44px] mt-3 rounded-[11px] text-[12.5px] font-extrabold"
              style={{ background: 'var(--tint-coach-bg)', border: '1px solid var(--tint-coach-bd)', color: 'var(--coach)' }}
            >
              <MessageSquare size={15} /> Definir objetivos com a Carol
            </button>
          </div>

          <div className="module-card-contrast">
            <div className="flex items-center gap-2 mb-3">
              <Target size={16} className="text-[var(--gym)]" />
              <h3 className="text-sm font-semibold">Objetivos corporais</h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {BODY_METRICS.map(m => {
                const flagKey = BODY_GOAL_COACH_FLAGS[m.key];
                const isCoach = flagKey && draft[flagKey];
                return (
                  <div key={m.key}>
                    <label htmlFor={`perfil-goal-${m.key}`} className="text-[11px] text-[var(--text-3)] flex items-center gap-1.5 mb-1">
                      {m.label}{m.unit ? ` (${m.unit})` : ''}
                      {isCoach && <CoachBadge />}
                    </label>
                    <input id={`perfil-goal-${m.key}`} type="number" step="0.1" value={draft['goal_' + m.key] ?? ''}
                      onChange={e => {
                        const v = e.target.value === '' ? null : parseFloat(e.target.value);
                        updateCoachableGoal('goal_' + m.key, flagKey, v);
                      }}
                      className="w-full bg-[var(--surface-soft)] rounded-xl px-3 py-2 text-sm outline-none"
                      style={isCoach ? coachFieldStyle : plainFieldStyle} />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="module-card-contrast">
            <div className="flex items-center gap-2 mb-4">
              <Target size={16} className="text-[var(--gym)]" />
              <h3 className="text-sm font-semibold">Nutrição &amp; Água</h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="perfil-calorias" className="text-[11px] text-[var(--text-3)] flex items-center gap-1.5 mb-1">
                  Calorias (kcal/dia)
                  {draft.calorie_goal_set_by_coach && <CoachBadge />}
                </label>
                <input id="perfil-calorias" type="number" value={draft.calorie_goal || ''}
                  onChange={e => updateCoachableGoal('calorie_goal', 'calorie_goal_set_by_coach', parseInt(e.target.value) || null)}
                  className="w-full bg-[var(--surface-soft)] rounded-xl px-3 py-2 text-sm outline-none"
                  style={draft.calorie_goal_set_by_coach ? coachFieldStyle : plainFieldStyle} />
              </div>
              <div>
                <label htmlFor="perfil-proteina" className="text-[11px] text-[var(--text-3)] flex items-center gap-1.5 mb-1">
                  Proteína (g/dia)
                  {draft.protein_goal_set_by_coach && <CoachBadge />}
                </label>
                <input id="perfil-proteina" type="number" value={draft.protein_goal || ''}
                  onChange={e => updateCoachableGoal('protein_goal', 'protein_goal_set_by_coach', parseInt(e.target.value) || null)}
                  className="w-full bg-[var(--surface-soft)] rounded-xl px-3 py-2 text-sm outline-none"
                  style={draft.protein_goal_set_by_coach ? coachFieldStyle : plainFieldStyle} />
              </div>
              <div>
                <label htmlFor="perfil-hidratos" className="text-[11px] text-[var(--text-3)] flex items-center gap-1.5 mb-1">
                  Hidratos (g/dia)
                  {draft.carbs_goal_set_by_coach && <CoachBadge />}
                </label>
                <input id="perfil-hidratos" type="number" value={draft.carbs_goal || ''}
                  onChange={e => updateCoachableGoal('carbs_goal', 'carbs_goal_set_by_coach', parseInt(e.target.value) || null)}
                  className="w-full bg-[var(--surface-soft)] rounded-xl px-3 py-2 text-sm outline-none"
                  style={draft.carbs_goal_set_by_coach ? coachFieldStyle : plainFieldStyle} />
              </div>
              <div>
                <label htmlFor="perfil-gordura" className="text-[11px] text-[var(--text-3)] flex items-center gap-1.5 mb-1">
                  Gordura (g/dia)
                  {draft.fat_goal_set_by_coach && <CoachBadge />}
                </label>
                <input id="perfil-gordura" type="number" value={draft.fat_goal || ''}
                  onChange={e => updateCoachableGoal('fat_goal', 'fat_goal_set_by_coach', parseInt(e.target.value) || null)}
                  className="w-full bg-[var(--surface-soft)] rounded-xl px-3 py-2 text-sm outline-none"
                  style={draft.fat_goal_set_by_coach ? coachFieldStyle : plainFieldStyle} />
              </div>
              <div className="col-span-2">
                <label htmlFor="perfil-agua" className="text-[11px] text-[var(--text-3)] flex items-center gap-1.5 mb-1">
                  Meta água (ml/dia)
                  {draft.water_goal_set_by_coach && <CoachBadge />}
                </label>
                <input id="perfil-agua" type="number" step="50" value={draft.water_goal_ml || ''}
                  onChange={e => updateCoachableGoal('water_goal_ml', 'water_goal_set_by_coach', parseInt(e.target.value) || null)}
                  className="w-full bg-[var(--surface-soft)] rounded-xl px-3 py-2 text-sm outline-none"
                  style={draft.water_goal_set_by_coach ? coachFieldStyle : plainFieldStyle} />
              </div>
            </div>

            {/* O interruptor "O Coach pode ajustar as metas" saiu (2026-09-22,
                bug #41): a Carol propõe e é o atleta que aceita ou recusa na
                persiana — uma segunda autorização por cima disso não protegia
                nada, só obrigava a vir aqui ligar um interruptor. Fica a
                regra que continua a valer. */}
            <p className="flex items-start gap-1.5 text-[11px] text-[var(--text-3)] mt-5 pt-4 border-t border-[var(--border-glass)]" data-testid="perfil-metas-coach-nota">
              <CarolIcon size={14} className="shrink-0 mt-px" style={{ color: 'var(--mod-coach-to)' }} />
              <span>
                A Carol pode propor-te metas no chat; só mudam aqui se aceitares. As que vierem dela ficam
                marcadas com "Carol" — editá-las à mão devolve-te o controlo.
              </span>
            </p>

          </div>
      </div>

      {/* Vitrina — os badges, um cartão só (2026-09-22). Nasceu com dois: os
          badges em cima e o Palmarés dos medalhões por baixo. Na fase C os
          medalhões saíram — os seis foram portados para badges e o cartão de
          baixo deixou de ter o que mostrar —, e o que ele ainda dava e os
          badges não davam ("Onde estás", o percentil por escalão) mudou-se
          para dentro da BadgesCard. O separador continua a ser o mesmo sítio
          e a responder à mesma pergunta; só deixou de a responder duas vezes.

          Igual ao Equipamento, não escreve no rascunho partilhado: o cartão
          lê tudo direto do store e abre as suas próprias persianas. */}
      <div ref={(el) => { pageRefs.current[2] = el; setPageRef(2)(el); }} className="tab-swipe-page space-y-4">
          <h2 className="sr-only">Vitrina</h2>
          <BadgesCard />

          {/* Privacidade — os dois consentimentos da comparação por percentil
              (gamificação, Fase 5). Vivia no Pessoal, ao lado do género e da
              data de nascimento que fazem o escalão; mudou-se para a Vitrina
              (bug #42, 2026-09-22): é lá que está o "Onde estás", a pergunta
              a que esta comparação responde. */}
          <button
            type="button"
            data-testid="perfil-privacidade-tabelas"
            onClick={() => setTabelasOpen(true)}
            className="w-full flex items-center gap-3 text-left transition active:scale-[.99]"
            style={{
              minHeight: 'var(--tap)',
              padding: 15,
              borderRadius: 'var(--radius-xl)',
              background: 'var(--surface-glass)',
              border: '1px solid var(--border-glass)',
            }}
          >
            <ShieldCheck size={18} className="shrink-0" style={{ color: profile?.stats_pool_consent_at ? 'var(--ok)' : 'var(--text-4)' }} />
            <span className="flex-1 min-w-0">
              <span className="block" style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text-1)' }}>
                Comparar-me com o meu escalão
              </span>
              <span className="block" style={{ fontSize: 11.5, color: 'var(--text-4)', marginTop: 2 }}>
                {profile?.leaderboard_consent_at
                  ? 'Na média e nas tabelas com o nome abreviado'
                  : profile?.stats_pool_consent_at
                    ? 'Na média do escalão, sem nome nenhum'
                    : 'Fora da média — duas decisões, ambas tuas'}
              </span>
            </span>
            <ChevronRight size={18} className="shrink-0" style={{ color: 'var(--text-4)' }} />
          </button>
      </div>

      {/* Equipamento — ao contrário dos outros separadores, este não escreve
          no rascunho partilhado: o armário faz o seu próprio CRUD na tabela
          shoes, par a par, e grava logo. "Guardar alterações" lá em baixo
          continua a ser só dos campos do perfil. */}
      <div ref={(el) => { pageRefs.current[3] = el; setPageRef(3)(el); }} className="tab-swipe-page space-y-4">
          <h2 className="sr-only">Equipamento</h2>
          <ShoeCabinet ref={shoeCabinetRef} />
      </div>

      <div ref={(el) => { pageRefs.current[4] = el; setPageRef(4)(el); }} className="tab-swipe-page space-y-4">
          <h2 className="sr-only">Carol</h2>
          {/* "Objetivos com o Coach" (botão "Pedir ao Coach para definir
              objetivos") foi removido — nunca chegou a chamar a Edge Function
              suggest-goals (era um placeholder com setTimeout, ver histórico
              git), e os objetivos já se discutem e definem a sério pelo Chat
              (update_goals, com ecrã de aceitar/recusar). Manter os dois
              caminhos seria redundante e o botão daqui nunca funcionou.
              A própria Edge Function suggest-goals foi removida a
              2026-08-23, já sem nada que a chamasse. */}
          {/* "Rever o arranque com a Carol" — os seis passos do onboarding
              outra vez, preenchidos a partir do perfil e da Memória do Coach
              (ponto 8 do handoff; texto do mock "Perfil · Coach"). Abre o
              mesmo componente de ecrã inteiro do primeiro acesso; ao terminar
              volta para aqui. */}
          <button
            type="button"
            onClick={() => setOnboardingOpen(true)}
            className="w-full flex items-center gap-3 text-left transition active:scale-[.99]"
            style={{
              minHeight: 'var(--tap)',
              padding: 15,
              borderRadius: 'var(--radius-xl)',
              background: 'var(--tint-coach-bg)',
              border: '1px solid var(--tint-coach-bd)',
            }}
          >
            <CoachAvatar size={36} radius={11} />
            <span className="flex-1 min-w-0">
              <span className="block" style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--coach-soft)' }}>
                Rever o arranque com a Carol
              </span>
              <span className="block" style={{ fontSize: 11.5, color: 'var(--text-4)', marginTop: 2 }}>
                Os seis passos outra vez, com as respostas que já deste
              </span>
            </span>
            <ChevronRight size={18} className="shrink-0" style={{ color: 'var(--text-4)' }} />
          </button>

          {/* Bug #41 (2026-09-22): todos os pedidos de notificações vivem
              aqui, no separador da Carol — saíram de Metas, que ficou só com
              objetivos. A meta de água continua em Metas; o lembrete dela
              é uma notificação e mudou-se para aqui. */}
          <div className="module-card-contrast" data-testid="perfil-notificacoes">
            <div className="flex items-center gap-2 mb-4">
              <Bell size={16} style={{ color: 'var(--coach)' }} />
              <h3 className="text-sm font-semibold">Notificações</h3>
            </div>
            <div className="flex items-center justify-between">
              <div className="pr-4">
                <p className="text-xs font-semibold flex items-center gap-1.5"><Bell size={14} className="text-[var(--run)]" /> Lembretes de água</p>
                <p className="text-[11px] text-[var(--text-3)] mt-1">
                  Notificações entre as {formatHour(reminderStartHour)} e as {formatHour(reminderEndHour)} enquanto não atingires a meta de água (definida em Metas).
                </p>
              </div>
              <button onClick={toggleWaterReminder} type="button" disabled={subscribingPush}
                aria-label={draft.water_reminder_enabled ? 'Desativar lembretes de água' : 'Ativar lembretes de água'}
                aria-pressed={!!draft.water_reminder_enabled}
                aria-busy={subscribingPush}
                className={`tap-area-44 w-11 h-6 rounded-full relative transition-colors duration-200 shrink-0 disabled:opacity-60 ${
                  draft.water_reminder_enabled ? 'bg-[var(--mod-prova)]' : 'bg-[var(--surface-strong)]'
                }`}>
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full transition-transform duration-200 ${
                  draft.water_reminder_enabled ? 'translate-x-5' : 'translate-x-0'
                }`} style={{ backgroundColor: draft.water_reminder_enabled ? 'var(--race-ink)' : 'var(--text-1)' }}></span>
              </button>
            </div>

            {draft.water_reminder_enabled && (
              <div className="mt-3 space-y-3 fade-in">
                <div>
                  <label htmlFor="perfil-lembrete-intervalo" className="text-[11px] text-[var(--text-3)] block mb-1">Frequência (minutos)</label>
                  <select id="perfil-lembrete-intervalo" value={draft.water_reminder_interval_minutes || 120} onChange={e => updateDraft('water_reminder_interval_minutes', parseInt(e.target.value))}
                    className="w-full bg-[var(--surface-soft)] border border-[var(--border-glass)] rounded-xl px-3 py-2 text-sm outline-none focus:border-[var(--focus-ring)]/60">
                    {WATER_REMINDER_INTERVALS.map(m => (
                      <option key={m} value={m}>A cada {m} minutos</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="perfil-lembrete-inicio" className="text-[11px] text-[var(--text-3)] block mb-1">Início</label>
                    <select id="perfil-lembrete-inicio" value={reminderStartHour} onChange={e => updateDraft('water_reminder_start_hour', parseInt(e.target.value))}
                      className="w-full bg-[var(--surface-soft)] border border-[var(--border-glass)] rounded-xl px-3 py-2 text-sm outline-none focus:border-[var(--focus-ring)]/60">
                      {HOURS.map(h => <option key={h} value={h}>{formatHour(h)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="perfil-lembrete-fim" className="text-[11px] text-[var(--text-3)] block mb-1">Fim</label>
                    <select id="perfil-lembrete-fim" value={reminderEndHour} onChange={e => updateDraft('water_reminder_end_hour', parseInt(e.target.value))}
                      className="w-full bg-[var(--surface-soft)] border border-[var(--border-glass)] rounded-xl px-3 py-2 text-sm outline-none focus:border-[var(--focus-ring)]/60">
                      {HOURS.map(h => <option key={h} value={h}>{formatHour(h)}</option>)}
                    </select>
                  </div>
                </div>
                <p className="text-[11px] text-[var(--text-3)] leading-relaxed">
                  {reminderStartHour === reminderEndHour
                    ? 'Início igual ao fim: lembretes durante as 24 horas.'
                    : reminderStartHour > reminderEndHour
                      ? 'A janela atravessa a meia-noite.'
                      : 'Hora de Portugal continental.'}
                </p>
              </div>
            )}

            <div className="flex items-center justify-between mt-5 pt-4 border-t border-[var(--border-glass)] dark:border-[var(--border-glass)]" data-testid="perfil-carol-push">
              <div className="pr-4">
                <p className="text-xs font-semibold flex items-center gap-1.5"><Bell size={14} className="text-[var(--coach)]" /> Notificações da Carol</p>
                <p className="text-[11px] text-[var(--text-3)] mt-1">
                  A Carol chama por ti quando é preciso: a prova, o balanço, dias sem registos. Tocar abre a conversa.
                </p>
              </div>
              <button onClick={toggleCarolPush} type="button" disabled={subscribingPush}
                aria-label={draft.carol_push_enabled ? 'Desativar notificações da Carol' : 'Ativar notificações da Carol'}
                aria-pressed={!!draft.carol_push_enabled}
                aria-busy={subscribingPush}
                className={`tap-area-44 w-11 h-6 rounded-full relative transition-colors duration-200 shrink-0 disabled:opacity-60 ${
                  draft.carol_push_enabled ? '' : 'bg-[var(--surface-strong)]'
                }`}
                style={draft.carol_push_enabled ? { background: 'var(--mod-coach-to)' } : undefined}>
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full transition-transform duration-200 ${
                  draft.carol_push_enabled ? 'translate-x-5' : 'translate-x-0'
                }`} style={{ backgroundColor: draft.carol_push_enabled ? 'var(--coach-ink)' : 'var(--text-1)' }}></span>
              </button>
            </div>

            {draft.carol_push_enabled && (
              <div className="mt-3 space-y-3 fade-in" data-testid="perfil-carol-push-prefs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="perfil-carol-inicio" className="text-[11px] text-[var(--text-3)] block mb-1">A partir das</label>
                    <select id="perfil-carol-inicio" value={carolStartHour} onChange={e => updateDraft('carol_push_start_hour', parseInt(e.target.value))}
                      className="w-full bg-[var(--surface-soft)] border border-[var(--border-glass)] rounded-xl px-3 py-2 text-sm outline-none focus:border-[var(--focus-ring)]/60">
                      {HOURS.map(h => <option key={h} value={h}>{formatHour(h)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="perfil-carol-fim" className="text-[11px] text-[var(--text-3)] block mb-1">Até às</label>
                    <select id="perfil-carol-fim" value={carolEndHour} onChange={e => updateDraft('carol_push_end_hour', parseInt(e.target.value))}
                      className="w-full bg-[var(--surface-soft)] border border-[var(--border-glass)] rounded-xl px-3 py-2 text-sm outline-none focus:border-[var(--focus-ring)]/60">
                      {HOURS.map(h => <option key={h} value={h}>{formatHour(h)}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label htmlFor="perfil-carol-maximo" className="text-[11px] text-[var(--text-3)] block mb-1">No máximo, por dia</label>
                  <select id="perfil-carol-maximo" value={carolMaxPerDay} onChange={e => updateDraft('carol_push_max_per_day', parseInt(e.target.value))}
                    className="w-full bg-[var(--surface-soft)] border border-[var(--border-glass)] rounded-xl px-3 py-2 text-sm outline-none focus:border-[var(--focus-ring)]/60">
                    {[1, 2, 3].map(n => <option key={n} value={n}>{n === 1 ? '1 notificação' : `${n} notificações`}</option>)}
                  </select>
                </div>
                <fieldset>
                  <legend className="text-[11px] text-[var(--text-3)] mb-1">Quando é que a Carol te pode chamar</legend>
                  <div className="grid grid-cols-2 gap-2">
                    {CAROL_PUSH_TYPES.map(({ key, label }) => {
                      const on = carolTypes.includes(key);
                      return (
                        <button key={key} type="button" aria-pressed={on} onClick={() => toggleCarolPushType(key)}
                          className="min-h-[44px] rounded-xl px-3 text-[12px] font-bold text-left"
                          style={on
                            ? { background: 'var(--tint-coach-bg)', border: '1px solid var(--tint-coach-bd)', color: 'var(--coach)' }
                            : { background: 'var(--surface-soft)', border: '1px solid var(--border-glass)', color: 'var(--text-3)' }}>
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
                <p className="text-[11px] text-[var(--text-3)] leading-relaxed">
                  {carolTypes.length === 0
                    ? 'Sem nenhum momento escolhido, a Carol não te chama.'
                    : carolStartHour === carolEndHour
                      ? 'Início igual ao fim: a Carol usa a janela das 09:00 às 21:00.'
                      : carolStartHour < carolEndHour && carolStartHour > 6 && carolTypes.includes('race_morning')
                        ? 'Hora de Portugal continental. A manhã da prova pode chegar a partir das 06:00: a prova não espera.'
                        : 'Hora de Portugal continental.'}
                </p>
              </div>
            )}

            {/* As boas-vindas (ação P.11): sempre visível, porque não é uma
                notificação — não depende do push nem da permissão do browser.
                É rascunho como o resto, e o App lê-o com `=== false`. */}
            <div className="flex items-center justify-between mt-5 pt-4 border-t border-[var(--border-glass)] dark:border-[var(--border-glass)]" data-testid="perfil-carol-welcome">
              <div className="pr-4">
                <p className="text-xs font-semibold flex items-center gap-1.5"><MessageSquare size={14} className="text-[var(--coach)]" /> Boas-vindas ao abrir a app</p>
                <p className="text-[11px] text-[var(--text-3)] mt-1">
                  A Carol recebe-te antes do Início, uma vez em cada parte do dia, e no dia e na véspera de uma prova.
                </p>
              </div>
              <button onClick={() => updateDraft('carol_welcome_enabled', !welcomeOn)} type="button"
                aria-label={welcomeOn ? 'Desativar boas-vindas ao abrir a app' : 'Ativar boas-vindas ao abrir a app'}
                aria-pressed={welcomeOn}
                className={`tap-area-44 w-11 h-6 rounded-full relative transition-colors duration-200 shrink-0 ${
                  welcomeOn ? '' : 'bg-[var(--surface-strong)]'
                }`}
                style={welcomeOn ? { background: 'var(--mod-coach-to)' } : undefined}>
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full transition-transform duration-200 ${
                  welcomeOn ? 'translate-x-5' : 'translate-x-0'
                }`} style={{ backgroundColor: welcomeOn ? 'var(--coach-ink)' : 'var(--text-1)' }}></span>
              </button>
            </div>
          </div>

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
              <h3 className="text-sm font-semibold">Restrições Alimentares</h3>
            </div>
            <p className="text-[11px] text-[var(--text-3)] mb-3 leading-relaxed">
              Regra absoluta que a Carol nunca contraria — ao contrário da Memória, aqui é a
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
                        : 'bg-[var(--surface-soft)] border-[var(--border-glass)] text-[var(--text-3)]'
                    }`}
                  >
                    {r.label}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-[var(--text-3)] mt-1">
              Podes escolher mais que uma. Vegetariano e vegano excluem-se —
              escolher um desliga o outro. Sem nada selecionado, a Carol
              assume que comes de tudo.
            </p>
            <input
              type="text"
              aria-label="Alergias ou alimentos a evitar"
              placeholder="Alergias ou alimentos a evitar (ex.: frutos secos)"
              value={draft.dietary_notes || ''}
              onChange={e => updateDraft('dietary_notes', e.target.value.trim() === '' ? null : e.target.value)}
              className="w-full mt-2 bg-[var(--surface-soft)] border border-[var(--border-glass)] rounded-xl px-3 py-2 text-sm outline-none focus:border-[var(--mod-coach-to)]/60"
            />
            <p className="text-[11px] text-[var(--text-3)] mt-1">
              A Carol trata isto como regra absoluta e nunca sugere nada que
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

      {/* Barra de ação fixa (ponto 2 do handoff) — um só botão, fora do
          scroll. Pessoal/Metas/Coach partilham o mesmo rascunho, por isso
          "Guardar alterações" grava tudo o que estiver por gravar em
          qualquer um deles, não só no separador visível. O Equipamento é a
          exceção: grava-se a si próprio, par a par, e a barra passa a ser
          "Adicionar sapatilhas" (mock "Perfil · Equipamento"). A Vitrina não
          tem formulário nenhum — são os badges, que se leem, não se gravam —
          por isso a barra nem aparece nesse separador (em vez de mostrar um
          botão sem ação, como fazia o Equipamento antes de ganhar o dele). */}
      {tab !== 'vitrina' && (
        <ActionBar>
          {tab === 'equipamento' ? addShoesButton : saveButton}
        </ActionBar>
      )}

      {/* Os avisos da Carol acompanham o atleta em todo o lado menos no
          Chat (pedido do utilizador). Sobe acima da barra de ação: a 100px
          o botão caía em cima do "Guardar alterações". */}
      <CoachInsightsDock bottom={168} />

      {tabelasOpen && <TabelasConsentScreen onClose={() => setTabelasOpen(false)} />}
    </div>
  );
}
