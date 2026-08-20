import { create } from 'zustand';
import { supabase, invokeEdgeFunctionWithTimeout } from '../lib/supabase';
import { todayISO, addDaysISO } from '../lib/utils';

const getInitialDashboardTab = () => {
  try {
    const saved = localStorage.getItem('ironhealth_last_module');
    if (['corrida', 'ginasio', 'nutricao', 'corpo', 'holistica'].includes(saved)) {
      return saved;
    }
  } catch (err) {
    // ignore
  }
  return 'corrida';
};

export const useAppStore = create((set, get) => ({
  // Auth & Profile State
  session: null,
  profile: null,
  isAdmin: false,
  
  // App Data State (mimicking the legacy 'state' object)
  meals: [],
  bodyAssessments: [],
  gymSessions: [],
  runs: [],
  waterLogs: [],
  raceEvents: [],
  coachPlans: [],
  coachPlanItems: [],
  coachGoalProposals: [],
  // Resumo diário do Coach (card rotativo do Início) — null até carregar,
  // depois {recap, warnings, meal_suggestion, tomorrow_prep, date, ...}.
  // Ver specs/plano-de-treino.md §11.
  dailySummary: null,
  dailySummaryLoading: false,
  // Item do plano em vias de ser concluído — posto pelo Início mesmo antes de
  // navegar para o registo (RunRegistration/GymRegistration), que o consome
  // ao montar para se pré-preencher. Ver specs/plano-de-treino.md §5.2.
  planItemPrefill: null,

  // Coach State
  coachMessages: [],
  coachLoading: false,
  coachSuggestions: [],
  
  // UI State
  activeTab: 'home',
  lastDashboardTab: getInitialDashboardTab(),
  openCreationMode: null, // null | 'meal' | 'assessment' | 'run' | 'workout' | 'race'
  editingRaceId: null,
  // Data (YYYY-MM-DD) a abrir no Calendário — posto por RunAgenda ao gravar
  // uma prova NOVA, para o Calendário abrir logo nesse dia em vez do de
  // hoje. Consumido uma vez por Calendar.jsx ao montar; ver
  // clearPendingCalendarDate.
  pendingCalendarDate: null,
  // Ecrãs com alterações por gravar registam aqui uma função que decide se a
  // navegação prossegue — devolve false para a travar e mostrar o seu aviso.
  navGuard: null,

  // Actions
  setSession: (session) => set({ session }),
  setProfile: (profile) => set({ profile, isAdmin: profile?.is_admin || false }),
  setNavGuard: (fn) => set({ navGuard: fn }),
  // Devolve false quando o guard recusa, para quem chama não seguir com
  // efeitos secundários (ex.: abrir um formulário de registo) numa navegação
  // que não aconteceu.
  setActiveTab: (tab) => {
    const guard = get().navGuard;
    if (guard && !guard(tab)) return false;
    if (['corrida', 'ginasio', 'nutricao', 'corpo', 'holistica'].includes(tab)) {
      try {
        localStorage.setItem('ironhealth_last_module', tab);
      } catch (e) {
        // ignore
      }
      set({ activeTab: tab, lastDashboardTab: tab });
    } else {
      set({ activeTab: tab });
    }
    return true;
  },
  setOpenCreationMode: (mode) => set({ openCreationMode: mode }),
  setEditingRaceId: (id) => set({ editingRaceId: id, openCreationMode: id ? 'race' : null }),
  coachIntent: null,
  setCoachIntent: (intent) => set({ coachIntent: intent }),
  
  // Coach Actions
  addCoachMessage: (msg) => set((state) => ({ coachMessages: [...state.coachMessages, msg] })),
  // Usado para retirar a mensagem placeholder "isto está a demorar…" depois
  // de resolvida (com a resposta real ou com o erro final) — ver
  // handleAsyncFallback em Coach.jsx.
  removeCoachMessage: (id) => set((state) => ({ coachMessages: state.coachMessages.filter((m) => m.id !== id) })),
  setCoachLoading: (loading) => set({ coachLoading: loading }),
  clearCoachChat: () => set({ coachMessages: [], coachSuggestions: [] }),
  setCoachSuggestions: (suggestions) => set({ coachSuggestions: suggestions }),

  // Data Actions
  setMeals: (meals) => set({ meals }),
  setRuns: (runs) => set({ runs }),
  setGymSessions: (sessions) => set({ gymSessions: sessions }),
  setBodyAssessments: (assessments) => set({ bodyAssessments: assessments }),
  setRaceEvents: (events) => set({ raceEvents: events }),
  setCoachPlans: (plans) => set({ coachPlans: plans }),
  setCoachPlanItems: (items) => set({ coachPlanItems: items }),
  setPlanItemPrefill: (item) => set({ planItemPrefill: item }),
  clearPlanItemPrefill: () => set({ planItemPrefill: null }),
  setPendingCalendarDate: (dateIso) => set({ pendingCalendarDate: dateIso }),
  clearPendingCalendarDate: () => set({ pendingCalendarDate: null }),

  // Recarrega planos e itens — usado pelo Coach quando a resposta criou uma
  // proposta (plan_proposed), para o Início a mostrar sem refrescar a página.
  reloadCoachPlans: async () => {
    const userId = get().session?.user?.id || get().profile?.id;
    if (!userId) return;
    const [{ data: plans }, { data: items }] = await Promise.all([
      supabase.from('coach_plans').select('*').eq('user_id', userId).order('period_start', { ascending: false }),
      supabase.from('coach_plan_items').select('*').eq('user_id', userId).order('planned_date', { ascending: true }),
    ]);
    set({ coachPlans: plans || [], coachPlanItems: items || [] });
      return plans;
  },

  // ── Memória de longo prazo do Coach (tabela coach_notes) ────────────────
  // Factos duradouros sobre o atleta que a Carol tem sempre no prompt. Ao
  // contrário do histórico de conversa, não caem fora de nenhuma janela.
  // A Carol escreve-os pela ferramenta save_coach_note; o atleta lê, corrige
  // e acrescenta os seus aqui — é memória partilhada, não um registo dela.
  coachNotes: [],

  reloadCoachNotes: async () => {
    const userId = get().session?.user?.id || get().profile?.id;
    if (!userId) return [];
    const { data, error } = await supabase
      .from('coach_notes')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });
    if (error) { console.error('Error loading coach notes:', error); return []; }
    set({ coachNotes: data || [] });
    return data || [];
  },

  addCoachNote: async ({ category, note }) => {
    const userId = get().session?.user?.id || get().profile?.id;
    if (!userId) return false;
    const { error } = await supabase.from('coach_notes').insert({
      user_id: userId,
      category,
      note: (note || '').trim(),
      source: 'atleta',
    });
    // 23505 = o mesmo facto já lá está (índice único por categoria+texto).
    // Para quem está a escrever isso não é um erro: o resultado é o que queria.
    if (error && error.code !== '23505') { console.error('Error adding coach note:', error); return false; }
    await get().reloadCoachNotes();
    return true;
  },

  updateCoachNote: async (id, { category, note }) => {
    // Esta ação só existe no ecrã do atleta, por isso editar transfere a
    // autoria: sem isto, o texto que ele escreveu por cima de uma nota da
    // Carol continuava a aparecer com a cor e o rótulo dela. A cor serve
    // para distinguir o que a Carol inferiu (e pode estar errado) do que o
    // atleta confirmou — ao editar, ele passa a responder pela nota.
    const patch = { updated_at: new Date().toISOString(), source: 'atleta' };
    if (category !== undefined) patch.category = category;
    if (note !== undefined) patch.note = (note || '').trim();
    const { error } = await supabase.from('coach_notes').update(patch).eq('id', id);
    if (error) { console.error('Error updating coach note:', error); return false; }
    await get().reloadCoachNotes();
    return true;
  },

  deleteCoachNote: async (id) => {
    const { error } = await supabase.from('coach_notes').delete().eq('id', id);
    if (error) { console.error('Error deleting coach note:', error); return false; }
    set((state) => ({ coachNotes: (state.coachNotes || []).filter(n => n.id !== id) }));
    return true;
  },

  reloadCoachGoalProposals: async () => {
    const userId = get().session?.user?.id || get().profile?.id;
    if (!userId) return;
    const { data, error } = await supabase
      .from('coach_goal_proposals')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'proposto')
      .order('created_at', { ascending: false });
    if (!error && data) {
      set({ coachGoalProposals: data });
      return data;
    }
  },

  respondToGoalProposal: async (proposalId, accept) => {
    const proposal = (get().coachGoalProposals || []).find(p => p.id === proposalId);
    const updates = accept
      ? { status: 'aceite', accepted_at: new Date().toISOString() }
      : { status: 'recusado' };

    const { error } = await supabase.from('coach_goal_proposals').update(updates).eq('id', proposalId);
    if (error) { console.error('Error responding to goal proposal:', error); return false; }

    if (accept && proposal?.goals) {
      const userId = get().session?.user?.id || get().profile?.id;
      if (userId) {
        await supabase.from('profiles').update(proposal.goals).eq('id', userId);
        const { data: updatedProfile } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
        if (updatedProfile) {
          set({ profile: updatedProfile });
        }
      }
    }

    set((state) => ({
      coachGoalProposals: (state.coachGoalProposals || []).filter(p => p.id !== proposalId),
    }));

    return true;
  },

  // Aceitar/recusar uma proposta do coach. Enquanto 'proposto', os itens não
  // contam para nada — nem aparecem como treinos a fazer, nem ajustam
  // objetivos de nutrição. Ver specs/plano-de-treino.md §5.1.
  //
  // Se a proposta vinha para substituir um plano ativo (supersedes_plan_id),
  // é AQUI que a substituição se concretiza — nunca no momento da proposta.
  // Recusar tem de deixar o plano antigo intacto: o atleta pediu para ver uma
  // alternativa, não para deitar fora o microciclo que estava a cumprir.
  respondToPlan: async (planId, accept) => {
    const updates = accept
      ? { status: 'aceite', accepted_at: new Date().toISOString() }
      : { status: 'recusado' };
    const { error } = await supabase.from('coach_plans').update(updates).eq('id', planId);
    if (error) { console.error('Error responding to plan:', error); return false; }

    if (accept) {
      const userId = get().session?.user?.id || get().profile?.id;
      if (userId) {
        // Encontrar o plano novo para sabermos o period_start
        const { data: newPlan } = await supabase.from('coach_plans').select('period_start, supersedes_plan_id').eq('id', planId).single();
        if (newPlan) {
          const { data: oldPlans } = await supabase.from('coach_plans').select('id, period_start, period_end').eq('user_id', userId).eq('status', 'aceite').neq('id', planId);
          for (const old of oldPlans || []) {
            if (old.period_start >= newPlan.period_start) {
              // Se o antigo começou depois ou no mesmo dia do novo, recusa-o (foi totalmente substituído)
              await supabase.from('coach_plans').update({ status: 'recusado' }).eq('id', old.id);
            } else {
              // Se o antigo começou antes, truncar o seu period_end para o dia anterior ao novo
              const newEndStr = addDaysISO(newPlan.period_start, -1);

              if (newEndStr >= old.period_start) {
                await supabase.from('coach_plans').update({ period_end: newEndStr }).eq('id', old.id);
                // Remover itens que caiam na parte truncada
                await supabase.from('coach_plan_items').delete().eq('plan_id', old.id).gte('planned_date', newPlan.period_start);
              } else {
                await supabase.from('coach_plans').update({ status: 'recusado' }).eq('id', old.id);
              }
            }
          }
        }
      }
    }

    // Recarrega em vez de reconstruir o estado à mão: ao aceitar, a BD
    // acima trunca o plano anterior mas MANTÉM-NO aceite (é ele que guarda
    // os dias já passados). Marcar localmente todos os outros aceites como
    // recusados apagava esse histórico do cartão até ao próximo refresh.
    await get().reloadCoachPlans();

    if (accept) {
      get().loadDailySummary({ force: true }).catch(() => {});
    }

    return true;
  },

  // Marca um item como concluído — chamado pelo próprio ecrã de registo
  // (RunRegistration/GymRegistration) depois de gravar a corrida/sessão que
  // o cumpre. actualDate pode divergir de planned_date; é essa divergência
  // que corrige os objetivos de nutrição dos dois dias (ver
  // src/utils/nutrition.js e specs/plano-de-treino.md §4).
  completePlanItem: async (itemId, { actualDate, runId = null, sessionId = null }) => {
    const updates = {
      status: 'concluido',
      actual_date: actualDate,
      completed_run_id: runId,
      completed_session_id: sessionId,
    };
    const { error } = await supabase.from('coach_plan_items').update(updates).eq('id', itemId);
    if (error) { console.error('Error completing plan item:', error); return false; }
    set((state) => ({
      coachPlanItems: state.coachPlanItems.map(i => i.id === itemId ? { ...i, ...updates } : i),
    }));
    return true;
  },

  // Cancelar não apaga — sai da lista ativa e deixa de contar para
  // objetivos de nutrição, mas fica no histórico do plano.
  cancelPlanItem: async (itemId) => {
    const { error } = await supabase.from('coach_plan_items').update({ status: 'cancelado' }).eq('id', itemId);
    if (error) { console.error('Error cancelling plan item:', error); return false; }
    set((state) => ({
      coachPlanItems: state.coachPlanItems.map(i => i.id === itemId ? { ...i, status: 'cancelado' } : i),
    }));
    return true;
  },

  completeMealPlanItem: async (itemId) => {
    // Guarda o item original para rollback
    const originalItem = get().coachPlanItems.find(i => i.id === itemId);
    
    // Optimistic update
    set((state) => ({
      coachPlanItems: state.coachPlanItems.map(i => i.id === itemId ? { ...i, meal_status: 'seguida' } : i),
    }));
    
    const { error } = await supabase.from('coach_plan_items').update({ meal_status: 'seguida' }).eq('id', itemId);
    if (error) { 
      console.error('Error completing meal plan item:', error); 
      // Rollback apenas do item
      if (originalItem) {
        set((state) => ({
          coachPlanItems: state.coachPlanItems.map(i => i.id === itemId ? originalItem : i)
        }));
      }
      return false; 
    }
    return true;
  },

  cancelMealPlanItem: async (itemId) => {
    // Guarda o item original para rollback
    const originalItem = get().coachPlanItems.find(i => i.id === itemId);

    // Optimistic update
    set((state) => ({
      coachPlanItems: state.coachPlanItems.map(i => i.id === itemId ? { ...i, meal_status: 'nao_seguida' } : i),
    }));
    
    const { error } = await supabase.from('coach_plan_items').update({ meal_status: 'nao_seguida' }).eq('id', itemId);
    if (error) { 
      console.error('Error cancelling meal plan item:', error); 
      // Rollback apenas do item
      if (originalItem) {
        set((state) => ({
          coachPlanItems: state.coachPlanItems.map(i => i.id === itemId ? originalItem : i)
        }));
      }
      return false; 
    }
    return true;
  },

  // Resumo diário do Coach — 1x por dia, cacheado no servidor
  // (coach_daily_summary). Não refaz o pedido se já houver um resumo de HOJE
  // em memória, a não ser que force=true (botão "Atualizar" do card) ou
  // reload=true (montagem do Início, para apanhar o resumo gerado por outra
  // sessão/dispositivo no mesmo dia). Ver specs/plano-de-treino.md §11.
  loadDailySummary: async ({ force = false, reload = false } = {}) => {
    const today = todayISO();
    const current = get().dailySummary;
    if (!force && !reload && current?.date === today) return current;

    set({ dailySummaryLoading: true });
    try {
      const { data, error } = await invokeEdgeFunctionWithTimeout('coach-daily-summary', { body: { force } });
      if (error) { console.error('Error loading daily summary:', error); return null; }
      if (data?.summary) {
        set({ dailySummary: data.summary });
        return data.summary;
      }
      return null;
    } finally {
      set({ dailySummaryLoading: false });
    }
  },

  // Hydration Actions
  addWaterLog: async (amount, userId) => {
    try {
      const now = new Date();
      // lisbon timezone date string
      const dateStr = now.toLocaleDateString('en-CA', { timeZone: 'Europe/Lisbon' }); 
      const newLog = {
        user_id: userId,
        amount_ml: amount,
        date: dateStr,
        created_at: now.toISOString()
      };
      
      const { data, error } = await supabase.from('water_logs').insert(newLog).select().single();
      if (error) throw error;
      
      // Update local store for immediate feedback
      set(state => ({ waterLogs: [data, ...state.waterLogs] }));
      
      // Update profile last activity (fire and forget to not block UI)
      supabase.from('profiles').update({ water_last_activity_at: now.toISOString() }).eq('id', userId).then(({error: err}) => {
        if(!err) {
          set(state => ({ profile: { ...state.profile, water_last_activity_at: now.toISOString() } }));
        }
      });
      return data;
    } catch (err) {
      console.error('Error in addWaterLog:', err);
      return null;
    }
  },
  
  snoozeWaterReminder: async (userId, scope = 'next') => {
    try {
      // lisbon time helper
      const lisbonDateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Lisbon' }); 
      const updates = scope === 'next'
        ? { water_last_activity_at: new Date().toISOString() }
        : { water_reminder_muted_date: lisbonDateStr };
        
      const { error } = await supabase.from('profiles').update(updates).eq('id', userId);
      if (error) throw error;
      
      set(state => ({ profile: { ...state.profile, ...updates } }));
      return true;
    } catch (err) {
      console.error('Error snoozing water reminder:', err);
      return false;
    }
  },

  // Fetch initial user data (called after login)
  loadInitialData: async (userId) => {
    try {
      // 1. Fetch Profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
        
      if (profile) {
        set({ profile, isAdmin: profile.is_admin });
      }

      // 2. Fetch all app data concurrently
      const [
        { data: meals },
        { data: runs },
        { data: gymSessions },
        { data: bodyAssessments },
        { data: waterLogs },
        { data: coachMsgs },
        { data: raceEvents },
        { data: coachPlans },
        { data: coachPlanItems }
      ] = await Promise.all([
        supabase.from('meals').select('*, meal_items(*)').eq('user_id', userId).order('date', { ascending: false }),
        supabase.from('runs').select('*').eq('user_id', userId).order('date', { ascending: false }),
        supabase.from('workout_sessions').select('*, workout_session_sets(*)').eq('user_id', userId).order('date', { ascending: false }),
        supabase.from('body_assessments').select('*').eq('user_id', userId).order('date', { ascending: false }),
        supabase.from('water_logs').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
        supabase.from('coach_messages').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
        supabase.from('race_events').select('*').eq('user_id', userId).order('date', { ascending: true }),
        supabase.from('coach_plans').select('*').eq('user_id', userId).order('period_start', { ascending: false }),
        supabase.from('coach_plan_items').select('*').eq('user_id', userId).order('planned_date', { ascending: true })
      ]);

      set({
        meals: meals || [],
        runs: runs || [],
        gymSessions: gymSessions || [],
        bodyAssessments: bodyAssessments || [],
        waterLogs: waterLogs || [],
        coachMessages: coachMsgs || [],
        raceEvents: raceEvents || [],
        coachPlans: coachPlans || [],
        coachPlanItems: coachPlanItems || []
      });

    } catch (err) {
      console.error('Error loading initial data:', err);
    }
  }
}));
