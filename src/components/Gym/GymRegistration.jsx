import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAppStore } from '../../store';
import { supabase, invokeEdgeFunctionWithTimeout } from '../../lib/supabase';
import { ANALYZE_TIMEOUT_MS } from '../../lib/edgeTimeouts';
import { compressImage } from '../../lib/image';
import { CoachAnalyzeButton } from '../shared/CoachButton';
import { AnalysisSkeleton, AnalysisFailure } from '../shared/AnalysisState';
import useAnalysis from '../../utils/useAnalysis';
import { Dumbbell, Users, X } from 'lucide-react';
import { firstRecordMoment } from '../../utils/firstRecord';
import Chip from '../shared/Chip';
import ChipPicker from '../shared/registration/ChipPicker';
import ExerciseEditor from '../shared/registration/ExerciseEditor';
import PhotoReadSection from '../shared/registration/PhotoReadSection';
import PlanPrefillBanner from '../shared/registration/PlanPrefillBanner';
import { MUSCLE_GROUPS } from '../../utils/exerciseLocker';
import { findPendingPlanItems, describePlanItem, exercisesFromPrescription, appendExercises } from '../../utils/planPrefill';
import { parseDurationInput, formatDurationInput, flattenExercises, buildExercisesMeta, exercisesFromSession, lockerIndex, mergePreview, readSummary, completePlanSets, hasUnconfirmedPlanSets, markAllDone, lockerEntryFor } from '../../utils/gymSets';
import RegistrationShell from '../shared/registration/RegistrationShell';
import useRegistrationExit from '../shared/registration/useRegistrationExit';
import { todayISO } from '../../lib/utils';
import { usePersistedFormDraft, restorePersistedFormDraft, clearPersistedFormDraft } from '../../utils/formDraftPersistence';
import { usePersistedDraftMedia } from '../../utils/draftMediaPersistence';
import { normalizeStartTime, startTimeInputValue } from '../../utils/startTime';
import CarolInterventionActions from '../shared/CarolInterventionActions';

const GYM_KINDS = [
  { key: 'forca', label: 'Força', icon: Dumbbell },
  { key: 'aula', label: 'Aula', icon: Users }
];

/* `categories` são sempre grupos musculares, num treino de força ou numa
   aula; a modalidade da aula vive à parte, em `class_types` (migration
   20260925162654 — antes a mesma coluna guardava as duas coisas). */
const CLASS_TYPES = ['HIIT', 'RPM/Cycling', 'Pilates', 'Yoga', 'Body Pump', 'Zumba', 'CrossFit', 'Treino Funcional', 'Natação', 'Outro'];

const MAX_PHOTOS = 6; // espelha MAX_PHOTOS em supabase/functions/analyze-gym

export default function GymRegistration({ onClose, dateIso = null, sessionIdToEdit = null }) {
  const { profile, gymSessions, setGymSessions, loadInitialData, setNavGuard } = useAppStore();

  
  const isEditing = !!sessionIdToEdit;

  // Identifica este rascunho de forma única para sobreviver a um
  // recarregamento (ver formDraftPersistence.js) — nunca partilhado entre
  // treinos diferentes nem entre uma edição e uma criação nova a seguir.
  const draftStorageKey = sessionIdToEdit ? `ironcoach:treino-rascunho:${sessionIdToEdit}` : 'ironcoach:treino-rascunho:nova';
  // Só tenta restaurar UMA VEZ por sessão de edição/criação — sem isto, o
  // efeito de carregamento reporia o rascunho guardado por cima de
  // alterações mais recentes ainda não persistidas.
  const restoredForKeyRef = useRef(null);

  // Item do plano que esta sessão vai concluir, se veio do botão "Concluir"
  // no Início — ver Home.jsx e specs/plano-de-treino.md §5.2. Só um estado de
  // ginásio, sem 'forca'/'aula' próprio no plano — assume-se 'forca' por
  // omissão, o mais comum; o utilizador corrige aqui se for aula.
  const completingPlanItemRef = useRef(
    !sessionIdToEdit ? useAppStore.getState().planItemPrefill : null
  );
  const planItem = completingPlanItemRef.current?.kind === 'ginasio' ? completingPlanItemRef.current : null;

  // Comum aos dois caminhos
  const [date, setDate] = useState(planItem?.planned_date || todayISO());
  /* Hora de início ('HH:MM', hora local) — opcional e sem valor por omissão:
     inventar "agora" enchia a coluna de horas que ninguém confirmou. É ela
     que deixa a Carol ver um treino tarde a cortar o sono
     (specs/plano-de-prova.md, "A véspera e a hora"). Do item do plano só vem
     se lá existir — hoje coach_plan_items ainda não tem hora. */
  const [startTime, setStartTime] = useState(startTimeInputValue(planItem?.start_time));
  const [kind, setKind] = useState('forca');
  const [categories, setCategories] = useState(planItem?.categories || []);
  const [classTypes, setClassTypes] = useState([]);
  const [customCategory, setCustomCategory] = useState('');
  const [name, setName] = useState('');
  const [notes, setNotes] = useState(planItem?.notes || '');
  /* Um só formulário (registo unificado, F1 — specs/plano-registo-plano-coach.md
     §1): os prints são opcionais e os campos estão sempre visíveis. Com
     prints, a Carol lê-os; o que o atleta escreveu ganha sempre ao que ela
     ler (analyze-gym). Já não há "Foto | Manual" à escolha. */
  const [errorMsg, setErrorMsg] = useState('');

  // Limpa o item do plano do store assim que foi consumido para os estados
  // iniciais acima — nunca deve reaparecer numa próxima abertura "Novo Treino".
  useEffect(() => {
    if (completingPlanItemRef.current) useAppStore.getState().clearPlanItemPrefill();
  }, []);

  // Foto (IA)
  const [photos, setPhotos] = useState([]); // [{ dataUrl, base64 }]
  /* Ponto 7 do redesenho: o mesmo par espera/erro da Refeição
     (src/utils/useAnalysis.js) — a análise por foto é a operação que demora
     e que pode falhar. O registo manual e a edição continuam com `errorMsg`:
     são gravações, não análises de imagem, e não há alternativa manual para
     onde cair. */
  const analysis = useAnalysis();
  const isAnalyzing = analysis.isAnalyzing;
  /* Ler os prints e/ou as observações para o formulário, sem gravar (F2,
     Opção A). `reviewedPhotos` guarda quantos prints havia quando a leitura
     correu: se são os mesmos ao gravar, o servidor não volta a ler. */
  const [reading, setReading] = useState(false);
  const [readNote, setReadNote] = useState(null);
  const [reviewedPhotos, setReviewedPhotos] = useState(null);

  // Métricas do relógio — opcionais, com ou sem prints.
  const [durationStr, setDurationStr] = useState(planItem?.target_duration_min ? String(planItem.target_duration_min) : '');
  const [calories, setCalories] = useState('');
  const [avgHr, setAvgHr] = useState('');
  const [maxHr, setMaxHr] = useState('');
  const [exertion, setExertion] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Exercícios e séries — na criação (modo Live: picar as séries durante a
  // sessão) e na edição. Séries, objetivos, métricas, categorias, tipo e
  // observações são dados ANALÍTICOS: numa edição, mudá-los passa pelo Coach
  // e regenera a análise. Mudar só a data ou o nome é um update direto, sem
  // custo de API (mesmo padrão da Nutrição — ver MealRegistration.jsx).
  // Forma: utils/gymSets.js (newExercise).
  const [exercises, setExercises] = useState(() => (
    planItem?.prescription
      ? exercisesFromPrescription(planItem.prescription)
      : []
  ));
  // O treino do plano que este registo cumpre: o do botão "Registar sessão" (ligado, sem
  // banner) ou o que o atleta escolheu no banner "Do plano" (F3). 'livre' = não usa o plano.
  // Vai no rascunho persistido: recarregar a página não pode trocar "usei o plano" por "treino livre".
  const [planChoice, setPlanChoice] = useState(planItem ? { id: planItem.id, mode: 'plano' } : null); // { id, mode: 'plano' | 'livre' } | null
  // O Armário de Exercícios: "da última vez" e "+ Do Armário".
  const exerciseLocker = useAppStore(s => s.exerciseLocker);
  const locker = useMemo(() => lockerIndex(exerciseLocker), [exerciseLocker]);
  useEffect(() => { useAppStore.getState().loadExerciseLocker?.(); }, []);
  const [originalSnapshot, setOriginalSnapshot] = useState(null);
  const [isFormDirty, setIsFormDirty] = useState(false);
  // Sair do registo (aviso, navGuard, beforeunload, destino pendente): RegistrationShell.
  const exit = useRegistrationExit({ isDirty: isFormDirty, onClose, draftKey: draftStorageKey });

  // Ao gravar um treino NOVO (foto ou manual), vai sempre para o
  // Calendário, aberto no dia do treino — mesmo padrão de RunAgenda.jsx
  // (Prova) via pendingCalendarDate no store. Se isto veio de "Gravar e
  // sair" a caminho de outro separador (navGuard intercetado), respeita
  // esse destino em vez de o substituir — por isso o alvo pendente é lido
  // ANTES de exit.close() o consumir.
  /* Ponto 9, animação 6 ("Registo confirmado"): o check com impulso
     elástico corre PRIMEIRO e só depois é que o ecrã fecha e leva ao
     destino de sempre. O CreatedRecordModal continua lá — traz o cartão
     analisado e o "Falar com a Carol", que o atleta precisa de ver. */
  const [confirmation, setConfirmation] = useState(null);

  const finishCreateAndGoToCalendar = (createdRecord, label = 'Treino registado') => {
    const hadPendingNav = exit.hasPendingNav();
    // O primeiro registo deste tipo: a Carol diz o que ele quer dizer
    // (utils/firstRecord.js). Só ao criar — editar a única corrida não é "a primeira".
    const first = !isEditing && firstRecordMoment('gym', useAppStore.getState(), createdRecord);
    // Gravado: o rascunho apaga-se JÁ, não só ao dispensar a confirmação —
    // se o Android matasse a app com ela à vista, o registo reabria cheio e
    // gravar outra vez duplicava-o (revisão pré-deploy de 5ce5f31).
    clearPersistedFormDraft(draftStorageKey);
    setConfirmation({ label, first, done: () => {
      exit.close();
      if (!hadPendingNav) {
        setNavGuard(null);
        if (createdRecord) {
          useAppStore.getState().setNewlyCreatedRecord({ type: 'gym', record: createdRecord });
        }
        useAppStore.getState().setPendingCalendarDate(date);
        useAppStore.getState().setActiveTab('calendario');
      }
    } });
  };

  // Assinatura do que é analítico, para comparar o antes com o agora. Recebe
  // os valores em vez de os ler do estado, para poder ser calculada também a
  // partir da sessão em bruto no momento do carregamento (quando o estado
  // ainda não foi atualizado).
  const analyticalSignature = (v) => JSON.stringify({
    date: v.date,
    kind: v.kind,
    categories: [...(v.categories || [])].sort(),
    classTypes: [...(v.classTypes || [])].sort(),
    notes: (v.notes || '').trim(),
    duration: v.duration ?? null,
    calories: v.calories === '' || v.calories == null ? null : Number(v.calories),
    avgHr: v.avgHr === '' || v.avgHr == null ? null : Number(v.avgHr),
    maxHr: v.maxHr === '' || v.maxHr == null ? null : Number(v.maxHr),
    exertion: v.exertion === '' || v.exertion == null ? null : Number(v.exertion),
    sets: v.sets,
    meta: v.meta,
  });

  const currentSignature = () => analyticalSignature({
    date,
    kind, categories, classTypes, notes,
    duration: parseDurationInput(durationStr),
    calories, avgHr, maxHr, exertion,
    sets: flattenExercises(exercises),
    meta: buildExercisesMeta(exercises),
  });

  useEffect(() => {
    if (!sessionIdToEdit) return;
    const session = gymSessions.find(s => s.id === sessionIdToEdit);
    if (!session) return;
    // Rascunho por gravar guardado localmente (ver formDraftPersistence.js)
    // sobrepõe-se ao valor canónico vindo do servidor — restaura-se UMA VEZ
    // por sessão de edição (restoredForKeyRef), senão este efeito repunha-o
    // a cada vez que voltasse a correr.
    const alreadyRestored = restoredForKeyRef.current === draftStorageKey;
    const persisted = alreadyRestored ? null : restorePersistedFormDraft(draftStorageKey);
    restoredForKeyRef.current = draftStorageKey;

    const canonicalExercises = exercisesFromSession(session);
    setDate(persisted?.date ?? (session.date || todayISO()));
    // A BD devolve 'HH:MM:SS'; o input só fala 'HH:MM' (ver startTime.js).
    setStartTime(persisted?.startTime ?? startTimeInputValue(session.start_time));
    setKind(persisted?.kind ?? (session.kind === 'aula' ? 'aula' : 'forca'));
    setName(persisted?.name ?? (session.name || ''));
    setCategories(persisted?.categories ?? (session.categories || []));
    setClassTypes(persisted?.classTypes ?? (session.class_types || []));
    setCustomCategory(persisted?.customCategory ?? '');
    setNotes(persisted?.notes ?? (session.notes || ''));
    setDurationStr(persisted?.durationStr ?? (session.duration_seconds ? formatDurationInput(session.duration_seconds) : ''));
    setCalories(persisted?.calories ?? (session.calories_kcal ?? ''));
    setAvgHr(persisted?.avgHr ?? (session.avg_hr ?? ''));
    setMaxHr(persisted?.maxHr ?? (session.max_hr ?? ''));
    setExertion(persisted?.exertion ?? (session.exertion ?? ''));
    setExercises(persisted?.exercises ?? canonicalExercises);
    // A assinatura de partida compara sempre contra o valor CANÓNICO (do
    // servidor), nunca contra o rascunho restaurado — é assim que um
    // rascunho com séries/métricas diferentes das gravadas dispara "Guardar
    // e Reanalisar" já na primeira renderização.
    setOriginalSnapshot(analyticalSignature({
      date: session.date,
      kind: session.kind === 'aula' ? 'aula' : 'forca',
      categories: session.categories || [],
      classTypes: session.class_types || [],
      notes: session.notes || '',
      duration: session.duration_seconds ?? null,
      calories: session.calories_kcal,
      avgHr: session.avg_hr,
      maxHr: session.max_hr,
      exertion: session.exertion,
      sets: flattenExercises(canonicalExercises),
      meta: buildExercisesMeta(canonicalExercises),
    }));
    if (persisted) setIsFormDirty(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionIdToEdit]);

  // Restaura um rascunho de treino NOVO por gravar (ver
  // formDraftPersistence.js) — o caminho de edição está no efeito acima.
  // Corre uma única vez por sessão de criação (restoredForKeyRef), sem
  // depender de `gymSessions`, para não repor o rascunho por cima de
  // alterações recentes sempre que outro treino é gravado em paralelo.
  useEffect(() => {
    if (sessionIdToEdit) return;
    if (restoredForKeyRef.current === draftStorageKey) return;
    restoredForKeyRef.current = draftStorageKey;
    const persisted = restorePersistedFormDraft(draftStorageKey);
    if (!persisted) return;
    if (persisted.date) setDate(persisted.date);
    if (persisted.startTime !== undefined) setStartTime(persisted.startTime);
    if (persisted.kind) setKind(persisted.kind);
    if (persisted.categories) setCategories(persisted.categories);
    if (persisted.classTypes) setClassTypes(persisted.classTypes);
    if (persisted.customCategory !== undefined) setCustomCategory(persisted.customCategory);
    if (persisted.name !== undefined) setName(persisted.name);
    if (persisted.notes !== undefined) setNotes(persisted.notes);
    if (persisted.durationStr !== undefined) setDurationStr(persisted.durationStr);
    if (persisted.calories !== undefined) setCalories(persisted.calories);
    if (persisted.avgHr !== undefined) setAvgHr(persisted.avgHr);
    if (persisted.maxHr !== undefined) setMaxHr(persisted.maxHr);
    if (persisted.exertion !== undefined) setExertion(persisted.exertion);
    if (persisted.exercises) setExercises(persisted.exercises);
    if (persisted.planChoice !== undefined) setPlanChoice(persisted.planChoice);
    setIsFormDirty(true);
  }, [sessionIdToEdit, draftStorageKey]);

  // Grava o rascunho (com debounce) enquanto houver alterações por gravar —
  // sobrevive a um recarregamento da página (ver formDraftPersistence.js).
  // As fotos guardam-se à parte, em IndexedDB (draftMediaPersistence.js,
  // logo abaixo): em localStorage estouravam a quota.
  usePersistedFormDraft(draftStorageKey, {
    date, startTime, kind, categories, classTypes, customCategory, name, notes, planChoice,
    durationStr, calories, avgHr, maxHr, exertion, exercises,
  // Com a confirmação à vista o registo está gravado: o rascunho já foi
  // apagado e não volta a guardar-se (revisão pré-deploy de 6e92d67).
  }, { isDirty: isFormDirty && !confirmation });

  /* As fotos do rascunho guardam-se à parte, em IndexedDB
     (draftMediaPersistence.js), para sobreviverem a sair da app e voltar
     (relatado 2026-09-13). Só num registo novo: a editar, as fotos já
     gravadas voltam do servidor. Restaurá-las marca o formulário como
     alterado, para o aviso de saída as proteger. */
  usePersistedDraftMedia(sessionIdToEdit ? null : draftStorageKey, 'photos', photos, (v) => { setPhotos(v); setIsFormDirty(true); });

  // Só regenera a análise se os dados analíticos mudaram; mudar apenas a data
  // ou o nome não justifica uma chamada ao Gemini.
  // Sem grupos musculares escolhidos, a reanálise também os tira das
  // observações (inferMuscleGroupsFromNotes em analyze-gym).
  const needsReanalysis = isEditing
    && originalSnapshot !== null
    && currentSignature() !== originalSnapshot;
  // Bug #49: o registo escrito e a edição que reanalisa também esperam pela
  // Carol — o mesmo ecrã de espera da foto, com o formulário bloqueado.
  const savingWithCarol = isSaving && (!isEditing || needsReanalysis);
  const showAnalysis = isAnalyzing || savingWithCarol;

  // O estado de agora, para a leitura (assíncrona) fundir sobre o que está no
  // formulário quando a resposta chega, não sobre o de quando o pedido saiu.
  const formRef = useRef(null);
  formRef.current = { kind, categories, classTypes, name, durationStr, calories, avgHr, maxHr, exertion, exercises };

  const toggleIn = (list, value) => (list.includes(value) ? list.filter(c => c !== value) : [...list, value]);
  const handleToggleCategory = (cat) => setCategories(prev => toggleIn(prev, cat));
  const handleToggleClassType = (t) => setClassTypes(prev => toggleIn(prev, t));

  const handleAddCustomCategory = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = customCategory.trim().slice(0, 60);
      if (val && !categories.includes(val)) {
        setCategories([...categories, val]);
      }
      setCustomCategory('');
    }
  };

  // Os grupos musculares valem para os dois tipos e ficam; a modalidade só
  // existe numa aula.
  const handleKindChange = (newKind) => {
    setKind(newKind);
    if (newKind !== 'aula') setClassTypes([]);
  };

  // Handle Photo Selection — comprime e normaliza para JPEG (src/lib/image.js,
  // partilhado com a Corrida/Refeição/Corpo); o .base64 resultante é o que
  // vai no pedido de análise por IA.
  const handlePhotoSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    const remaining = MAX_PHOTOS - photos.length;
    if (remaining <= 0) {
      setErrorMsg(`Máximo de ${MAX_PHOTOS} fotos.`);
      return;
    }
    for (const file of files.slice(0, remaining)) {
      try {
        const { dataUrl, base64 } = await compressImage(file);
        setPhotos(prev => [...prev, { dataUrl, base64 }]);
        setReviewedPhotos(null);
      } catch (err) {
        console.warn('Falha a processar imagem', err);
      }
    }
  };

  const removePhoto = (idx) => { setPhotos(prev => prev.filter((_, i) => i !== idx)); setReviewedPhotos(null); };

  /* O plano do dia (F3): os treinos pendentes do tipo, nos planos aceites.
     Vindo do botão "Registar sessão" já está ligado, sem banner. */
  const coachPlans = useAppStore(st => st.coachPlans);
  const coachPlanItems = useAppStore(st => st.coachPlanItems);
  const pendingPlanItems = useMemo(
    () => (isEditing || planItem ? [] : findPendingPlanItems('ginasio', date, coachPlans, coachPlanItems)),
    [isEditing, planItem, date, coachPlans, coachPlanItems],
  );
  // Um rascunho restaurado pode apontar para um item que entretanto foi
  // cancelado ou concluído por outro registo: esse já não conta (revisão
  // pré-deploy, N3) — o registo volta a ser livre e o banner volta a perguntar.
  const chosenPlanItem = planChoice?.mode === 'plano'
    ? (planItem?.id === planChoice.id
      ? planItem
      : (coachPlanItems || []).find(i => i.id === planChoice.id && i.status === 'pendente') || null)
    : null;
  // O item que este registo vai riscar: o escolhido ('plano') ou, sem escolha,
  // o primeiro pendente do dia ('auto' — treino livre). A analyze-gym recebe-o
  // para comparar o planeado com o feito; o cliente só o liga depois.
  const linkedPlanItem = chosenPlanItem || pendingPlanItems[0] || null;
  const planSource = chosenPlanItem ? 'plano' : 'auto';

  // Mudar a data depois de escolher no banner: o treino escolhido era de outro
  // dia — a escolha desfaz-se e o banner mostra o plano do dia novo (os
  // exercícios ficam). Vindo de "Registar sessão" não: aí a data é editável
  // de propósito, é como se regista que o treino passou para outro dia
  // (specs/plano-de-treino.md §5.2) — a ligação mantém-se (revisão pré-deploy, N1).
  // Só quando é ELE a mudar a data (o input): restaurar um rascunho também
  // muda a data, e isso não pode desfazer a escolha que vem com ele (N4).
  const handleDateChange = (value) => {
    setDate(value);
    setIsFormDirty(true);
    setPlanChoice(prev => (prev && prev.id !== planItem?.id ? null : prev));
  };

  const handleUsePlan = (item) => {
    const incoming = exercisesFromPrescription(item.prescription);
    setPlanChoice({ id: item.id, mode: 'plano' });
    if (!categories.length && item.categories?.length) setCategories(item.categories);
    if (!notes.trim() && item.notes) setNotes(item.notes);
    if (!durationStr.trim() && item.target_duration_min) setDurationStr(String(item.target_duration_min));
    if (incoming.length) setExercises(prev => appendExercises(prev, incoming));
    setIsFormDirty(true);
  };
  // "Treino livre": campos vazios; ao gravar, o treino do dia risca-se na mesma, como automático.
  const handleFreeWorkout = () => { setPlanChoice({ id: null, mode: 'livre' }); };

  // Os exercícios do plano do dia, para a Carol casar os nomes (e o objetivo).
  const planBlocks = chosenPlanItem?.prescription?.blocks || [];

  /* Ler os prints e/ou as observações e preencher o formulário. Não grava
     nada: a analyze-gym em mode "preview" só devolve o que leu. */
  const handleRead = async () => {
    if (reading || isSaving || isAnalyzing) return;
    const fromPhotos = photos.length > 0;
    setReading(true);
    setReadNote(null);
    try {
      const { data, error } = await invokeEdgeFunctionWithTimeout('analyze-gym', {
        body: {
          mode: 'preview',
          images: photos.map(p => p.base64),
          mime_type: 'image/jpeg',
          kind,
          notes: notes.trim() || null,
          plan_blocks: planBlocks.map(b => ({ name: b.name, type: b.type })),
        },
      }, ANALYZE_TIMEOUT_MS);
      if (error) throw new Error(error);
      if (data?.error) throw new Error(data.error);

      const result = mergePreview(formRef.current, data.preview, planBlocks);
      const { patch } = result;
      if (patch.categories) setCategories(patch.categories);
      if (patch.classTypes) setClassTypes(patch.classTypes);
      if (patch.name !== undefined) setName(patch.name);
      if (patch.durationStr !== undefined) setDurationStr(patch.durationStr);
      if (patch.calories !== undefined) setCalories(patch.calories);
      if (patch.avgHr !== undefined) setAvgHr(patch.avgHr);
      if (patch.maxHr !== undefined) setMaxHr(patch.maxHr);
      if (patch.exertion !== undefined) setExertion(patch.exertion);
      if (patch.exercises) setExercises(patch.exercises);
      if (Object.keys(patch).length) setIsFormDirty(true);
      const readable = !!data.readable;
      setReviewedPhotos(fromPhotos && readable ? photos.length : null);
      setReadNote({ tone: readable ? 'ok' : 'warn', text: readSummary(result, fromPhotos ? 'foto' : 'notas') });
    } catch (err) {
      console.error(err);
      setReadNote({ tone: 'warn', text: err.message || 'Não consegui ler agora. Tenta outra vez, ou escreve o treino abaixo.' });
    } finally {
      setReading(false);
    }
  };

  /* Liga o treino do plano a esta sessão, depois de gravada (specs/plano-de-treino.md
     §5.2). O item é o do banner "Do plano" ou do botão "Registar sessão"
     ('plano'); sem escolha, é o treino pendente desse dia ('auto': um treino
     livre que o risca — decisão 3 do registo unificado). Só ginásio: uma
     corrida planeada no mesmo dia continua pendente — o tipo tem de bater. */
  const completePlanItemForSession = async (savedSession) => {
    if (!linkedPlanItem) return;
    try {
      await useAppStore.getState().completePlanItem(linkedPlanItem.id, { actualDate: date, sessionId: savedSession?.id || null, source: planSource });
    } catch (err) {
      console.warn('Item do plano não marcado como concluído', err);
    }
  };

  // ----------------------------------
  // ANALISAR TREINO POR FOTO (IA — analyze-gym)
  // ----------------------------------
  /* A hora de início não passa pela Edge Function: quem escreve a linha em
     `workout_sessions` é a analyze-gym, e acrescentar-lhe um campo obriga a
     mexer numa função que faz deploy em produção a cada push a `dev` (ver
     CLAUDE.md). É uma coluna só, sob a mesma RLS "own rows", gravada aqui
     logo a seguir, nos três caminhos (foto, manual e edição). Best-effort de
     propósito: o campo é opcional, e perder o treino já gravado por causa
     dele seria pior do que ficar sem a hora. */
  const persistSessionStartTime = async (session) => {
    if (!session?.id) return session;
    const value = normalizeStartTime(startTime);
    if (value === normalizeStartTime(session.start_time)) return session;
    try {
      const { error } = await supabase
        .from('workout_sessions')
        .update({ start_time: value })
        .eq('id', session.id);
      if (error) throw error;
    } catch (err) {
      console.warn('Hora de início do treino não gravada', err);
      return session;
    }
    return { ...session, start_time: value };
  };

  // O que o formulário manda em todos os caminhos: as métricas do relógio, as
  // séries (força e cardio) e o objetivo de cada exercício.
  const metricsAndSetsBody = () => {
    // Séries do plano com as reps escritas e o kg em branco levam o kg que
    // estava à vista como sugestão (N10).
    const exs = completePlanSets(exercises, locker);
    return {
      duration_seconds: parseDurationInput(durationStr),
      calories_kcal: calories ? parseInt(calories) : null,
      avg_hr: avgHr ? parseInt(avgHr) : null,
      max_hr: maxHr ? parseInt(maxHr) : null,
      exertion: exertion ? parseInt(exertion) : null,
      sets: flattenExercises(exs),
      exercises_meta: buildExercisesMeta(exs),
      ...(linkedPlanItem ? { plan_item_id: linkedPlanItem.id, completion_source: planSource } : {}),
      // Os nomes do plano, para a leitura dos prints os reutilizar (N5).
      ...(planBlocks.length ? { plan_blocks: planBlocks.map(b => ({ name: b.name, type: b.type })) } : {}),
    };
  };

  // A tarefa, separada do gesto: é ela que o "Tentar de novo" repete, com as
  // mesmas fotos e os mesmos campos.
  const analyzePhotosTask = async () => {
    {
      const { data, error } = await invokeEdgeFunctionWithTimeout('analyze-gym', {
        body: {
          images: photos.map(p => p.base64),
          mime_type: 'image/jpeg',
          date,
          kind,
          name: name.trim() || null,
          categories,
          class_types: kind === 'aula' ? classTypes : [],
          notes: notes.trim() || null,
          // Os prints já foram lidos e revistos: o servidor só os guarda.
          reviewed: reviewedPhotos !== null && reviewedPhotos === photos.length,
          ...metricsAndSetsBody(),
        },
      }, ANALYZE_TIMEOUT_MS);
      if (error) throw new Error(error);
      if (data?.error) throw new Error(data.error);

      const analysed = { ...data.session, workout_session_sets: data.sets || [] };
      if (!Array.isArray(analysed.workout_session_sets) || analysed.workout_session_sets.length === 0) {
        console.warn('Aviso: análise retornou 0 séries', data);
      }
      const sessionWithSets = await persistSessionStartTime(analysed);
      setGymSessions([sessionWithSets, ...gymSessions]);
      await completePlanItemForSession(sessionWithSets);
      useAppStore.getState().loadExerciseLocker?.();
      finishCreateAndGoToCalendar(sessionWithSets, 'Treino registado');
    }
  };

  const handleAnalyzePhotos = () => {
    if (!photos.length || isAnalyzing) return;
    setErrorMsg('');
    analysis.run(analyzePhotosTask);
  };

  // ----------------------------------
  // REGISTO MANUAL — os valores já vêm todos do formulário (nada para o
  // Gemini extrair de imagem nenhuma); o mesmo pedido grava a sessão E gera
  // o comentário do Coach a partir dos números indicados, comparando com
  // sessões anteriores do mesmo tipo — mode:"manual" em analyze-gym.
  // ----------------------------------
  const handleSaveManual = async () => {
    if (isSaving) return;
    setIsSaving(true);
    setErrorMsg('');
    try {
      const { data, error } = await invokeEdgeFunctionWithTimeout('analyze-gym', {
        body: {
          mode: 'manual',
          date,
          kind,
          name: name.trim() || null,
          categories,
          class_types: kind === 'aula' ? classTypes : [],
          notes: notes.trim() || null,
          ...metricsAndSetsBody(),
        },
      }, ANALYZE_TIMEOUT_MS);
      if (error) throw new Error(error);
      if (data?.error) throw new Error(data.error);

      const analysed = { ...data.session, workout_session_sets: data.sets || [] };
      if (!Array.isArray(analysed.workout_session_sets) || analysed.workout_session_sets.length === 0) {
        console.warn('Aviso: análise retornou 0 séries', data);
      }
      const sessionWithSets = await persistSessionStartTime(analysed);
      setGymSessions([sessionWithSets, ...gymSessions]);

      // Se esta sessão vem do plano (ou bate com um treino de ginásio
      // pendente nesse dia), marca o item como concluído — a data usada é a
      // do formulário, que pode ter sido alterada face ao planned_date (ver
      // specs/plano-de-treino.md §4-§5.2).
      await completePlanItemForSession(sessionWithSets);
      useAppStore.getState().loadExerciseLocker?.();

      finishCreateAndGoToCalendar(sessionWithSets, 'Treino registado');
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || 'Falha a gravar o treino. Tenta novamente.');
    } finally {
      setIsSaving(false);
    }
  };

  // ----------------------------------
  // GUARDAR ALTERAÇÕES (edição) — dois caminhos:
  //   • Séries, métricas, categorias, tipo ou observações mudaram → passa
  //     pelo Coach (analyze-gym em mode manual com session_id), que substitui
  //     as séries todas e regenera a análise.
  //   • Só a data/nome mudaram → update direto, sem chamada ao Gemini.
  // ----------------------------------
  const handleSaveEdit = async () => {
    if (isSaving) return;
    setIsSaving(true);
    setErrorMsg('');
    try {
      const nameParts = kind === 'aula' ? classTypes : categories;
      const finalName = name.trim() || (nameParts.length ? nameParts.join(' e ') : (kind === 'aula' ? 'Aula' : 'Treino'));

      let savedSession = null;
      if (needsReanalysis) {
        const { data, error } = await invokeEdgeFunctionWithTimeout('analyze-gym', {
          body: {
            mode: 'manual',
            session_id: sessionIdToEdit,
            date,
            kind,
            name: finalName,
            categories,
            class_types: kind === 'aula' ? classTypes : [],
            notes: notes.trim() || null,
            ...metricsAndSetsBody(),
          },
        }, ANALYZE_TIMEOUT_MS);
        if (error) throw new Error(error);
        if (data?.error) throw new Error(data.error);
        savedSession = data?.session ? { ...data.session, workout_session_sets: data.sets || [] } : null;
        useAppStore.getState().clearDismissedIntervention(sessionIdToEdit);
      } else {
        const { error: sessionError } = await supabase
          .from('workout_sessions')
          .update({ date, name: finalName })
          .eq('id', sessionIdToEdit);
        if (sessionError) throw sessionError;
        const currentSession = (gymSessions || []).find(s => s.id === sessionIdToEdit);
        savedSession = currentSession ? { ...currentSession, date, name: finalName } : { id: sessionIdToEdit, date, name: finalName };
      }

      // Antes do loadInitialData, para a recarga já trazer a hora nova.
      savedSession = await persistSessionStartTime(savedSession);

      if (profile?.id) await loadInitialData(profile.id);
      finishCreateAndGoToCalendar(savedSession, needsReanalysis ? 'Treino reanalisado pela Carol' : 'Treino atualizado');
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || 'Falha a guardar alterações. Tenta novamente.');
    } finally {
      setIsSaving(false);
    }
  };

  /* Ação primária do ecrã — vive na ActionBar fixa (ponto 2 do handoff), não
     no fim do formulário, onde ficava abaixo da dobra. Rótulos inalterados. */
  // Com prints, a Carol lê-os (e o que está escrito ganha); sem prints, grava
  // o que está escrito. A mesma ação, o mesmo rótulo.
  const doAnalyze = () => (photos.length ? handleAnalyzePhotos() : handleSaveManual());

  /* Séries do plano por confirmar ao gravar: em vez de as deixar cair em
     silêncio (uma sessão com 0 séries e "ficou tudo de fora" — revisão
     pré-deploy, N2), pergunta-se: marcá-las como feitas, ou gravar só as
     confirmadas. */
  const [confirmPlanSets, setConfirmPlanSets] = useState(false);
  const [saveAfterMark, setSaveAfterMark] = useState(false);
  const unconfirmedPlanSets = exercises.some(hasUnconfirmedPlanSets);
  const handleAnalyze = () => {
    // Com prints, as séries do plano por confirmar caem e a leitura dos prints
    // preenche o que ele fez — "marcar todas" ali poria os alvos por cima do
    // que o print mostra (revisão pré-deploy, B1). O aviso é só sem prints.
    if (!isEditing && !photos.length && unconfirmedPlanSets) {
      exit.hideUnsaved();
      setConfirmPlanSets(true);
      return;
    }
    doAnalyze();
  };
  // "Voltar" (ou Escape, ou tocar fora) fecha sem gravar e esquece uma saída
  // pedida pelo "Gravar e sair" (M5).
  const closePlanSetsDialog = () => { exit.cancelLeave(); setConfirmPlanSets(false); };
  useEffect(() => {
    if (!confirmPlanSets) return;
    const onKey = (e) => { if (e.key === 'Escape') closePlanSetsDialog(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmPlanSets]);
  const markAllAndSave = () => {
    setExercises(prev => prev.map(ex => (hasUnconfirmedPlanSets(ex) ? markAllDone(ex, lockerEntryFor(locker, ex.name)) : ex)));
    setConfirmPlanSets(false);
    setIsFormDirty(true);
    setSaveAfterMark(true);
  };
  // Grava depois de o estado já ter as séries marcadas (o render seguinte).
  useEffect(() => {
    if (!saveAfterMark) return;
    setSaveAfterMark(false);
    doAnalyze();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveAfterMark]);
  const primaryAction = isEditing ? (
    <CoachAnalyzeButton
      onClick={handleSaveEdit}
      disabled={isSaving}
      busy={isSaving}
      label={needsReanalysis ? "Guardar e reanalisar" : "Guardar alterações"}
    />
  ) : (
    <CoachAnalyzeButton
      onClick={handleAnalyze}
      disabled={isSaving || isAnalyzing}
      busy={isSaving || isAnalyzing}
      label="Analisar treino"
    />
  );

  const status = (
    <>
        {/* Ponto 7 — espera: esqueleto onde o resultado vai aparecer, com o
            formulário bloqueado mas visível. */}
        {showAnalysis && <AnalysisSkeleton kind="gym" manual={!isAnalyzing} />}

        {/* Ponto 7 — erro: aviso coral na voz da Carol, com "Tentar de novo"
            (mesma chamada, mesmos dados) e a alternativa manual. */}
        {analysis.hasFailed && (
          <AnalysisFailure
            detail={analysis.error}
            onRetry={analysis.retry}
            onManual={!isEditing && photos.length
              ? () => { setPhotos([]); setReviewedPhotos(null); analysis.reset(); setIsFormDirty(true); }
              : undefined}
          >
            As fotos ficaram guardadas. Podes tentar outra vez ou registar só o que escreveste — eu faço as contas na mesma.
          </AnalysisFailure>
        )}
    </>
  );

  // Os diálogos das séries do plano ficam por cima, como antes.
  const planSetsDialog = confirmPlanSets ? (
    <>
      {confirmPlanSets && (
        <div className="fixed inset-0 z-40 bg-[var(--bg-scrim)]" onClick={closePlanSetsDialog} aria-hidden="true" />
      )}
      {confirmPlanSets && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="gr-plan-sets-title"
          aria-describedby="gr-plan-sets-desc"
          className="fixed inset-x-0 bottom-0 z-50 p-4 pb-[calc(env(safe-area-inset-bottom)+16px)] rounded-t-2xl border-t border-[var(--border-glass)] bg-[var(--bg-sheet)] shadow-2xl"
        >
          <p id="gr-plan-sets-title" className="text-sm font-bold text-[var(--text-1)] mb-1">Há séries do plano por confirmar</p>
          <p id="gr-plan-sets-desc" className="text-[12px] text-[var(--text-2)] mb-3">
            Fizeste-as como estavam no plano? As que ficarem por confirmar não contam como feitas.
          </p>
          <div className="flex flex-col gap-2">
            <button type="button" autoFocus onClick={markAllAndSave}
              className="min-h-[44px] rounded-xl text-[13px] font-bold"
              style={{ background: 'var(--mod-ginasio-to)', color: 'var(--bg-app)' }}>
              Marcar todas como feitas e gravar
            </button>
            <button type="button" onClick={() => { setConfirmPlanSets(false); doAnalyze(); }}
              className="min-h-[44px] rounded-xl text-[13px] font-bold border border-[var(--border-glass-strong)] text-[var(--text-1)]">
              Gravar só as confirmadas
            </button>
            <button type="button" onClick={closePlanSetsDialog}
              className="min-h-[44px] rounded-xl text-[13px] font-semibold text-[var(--text-3)]">
              Voltar
            </button>
          </div>
        </div>
      )}
    </>
  ) : null;

  return (
    <RegistrationShell
      accent="var(--mod-ginasio-to)"
      icon={Dumbbell}
      title={isEditing ? 'Editar Treino' : 'Novo Treino'}
      exit={exit}
      status={status}
      busy={showAnalysis || reading}
      onSaveAndLeave={isEditing ? handleSaveEdit : handleAnalyze}
      isSaving={isSaving}
      confirmation={confirmation}
      primaryAction={primaryAction}
      overlays={planSetsDialog}
    >
        <label className="text-[11px] text-[var(--text-3)] mb-1.5 block">Tipo de sessão</label>
        <div className="flex gap-1.5 mb-4">
          {GYM_KINDS.map(k => {
            const Icon = k.icon;
            const isActive = kind === k.key;
            return (
              <Chip
                key={k.key}
                active={isActive}
                variant="gym"
                rounded="xl"
                onClick={() => { handleKindChange(k.key); setIsFormDirty(true); }}
                className="flex-1 py-2.5 gap-1.5"
                type="button"
              >
                <Icon size={14} /> {k.label}
              </Chip>
            );
          })}
        </div>

        {/* Data · Hora — a hora ao lado da data, opcional. É ela que deixa a
            Carol ver um treino às 22:30 a cortar o sono
            (specs/plano-de-prova.md, "A véspera e a hora"). O rótulo passou
            para cima de cada campo: com dois controlos na grelha já não há
            onde pôr o texto ao lado. */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          <div className="min-w-0">
            <label htmlFor="gr-data-do-treino" className="text-[11px] text-[var(--text-3)] mb-1.5 block">Data do treino</label>
            <input id="gr-data-do-treino"
              type="date"
              aria-label="Data do treino"
              value={date}
              max={todayISO()}
              onChange={e => handleDateChange(e.target.value)}
              className="w-full min-h-[var(--tap)] bg-[var(--surface-glass)] border border-[var(--border-glass)] text-white rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-[var(--mod-ginasio-to)]"
            />
          </div>
          <div className="min-w-0">
            <label htmlFor="gr-hora-do-treino" className="text-[11px] text-[var(--text-3)] mb-1.5 block">Hora</label>
            <input id="gr-hora-do-treino"
              type="time"
              aria-label="Hora do treino"
              value={startTime}
              onChange={e => { setStartTime(e.target.value); setIsFormDirty(true); }}
              className="w-full min-h-[var(--tap)] bg-[var(--surface-glass)] border border-[var(--border-glass)] text-white rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-[var(--mod-ginasio-to)]"
            />
          </div>
        </div>

        {pendingPlanItems.length > 0 && (
          <PlanPrefillBanner
            items={pendingPlanItems}
            describe={describePlanItem}
            chosenId={planChoice?.mode === 'plano' ? planChoice.id : null}
            mode={planChoice?.mode || null}
            onUse={handleUsePlan}
            onFree={handleFreeWorkout}
            onChange={() => setPlanChoice(null)}
            dayLabel={date === todayISO() ? 'hoje' : `${date.slice(8, 10)}/${date.slice(5, 7)}`}
            freeCountsAs={pendingPlanItems.length > 1 ? describePlanItem(pendingPlanItems[0]) : null}
          />
        )}

        {/* Prints (opcional) — escondido a editar: editar é sempre pelos
            campos, sem foto nova (mesmo padrão da Corrida/Refeição). */}
        {!isEditing && (
          <PhotoReadSection
            photos={photos}
            maxPhotos={MAX_PHOTOS}
            onSelect={handlePhotoSelect}
            onRemove={removePhoto}
            onRead={handleRead}
            reading={reading}
            note={readNote}
          />
        )}

        <div className="mb-4">
          <label htmlFor="gr-nome-da-sessao-opcional-ex" className="text-[11px] text-[var(--text-3)] mb-1.5 block">
            Nome da sessão (opcional) — ex.: "{kind === 'aula' ? 'Aula de HIIT' : 'Peito e Tríceps'}"
          </label>
          <input id="gr-nome-da-sessao-opcional-ex"
            type="text"
            maxLength={80}
            value={name}
            onChange={e => { setName(e.target.value); setIsFormDirty(true); }}
            placeholder="Nome do treino"
            className="w-full bg-[var(--surface-glass)] border border-[var(--border-glass)] text-white rounded-xl px-3 py-2.5 text-sm text-white placeholder-[var(--text-muted)] outline-none focus:border-[var(--mod-ginasio-to)]"
          />
        </div>

        {kind === 'aula' && (
          <ChipPicker
            id="gr-tipo-aula"
            label="Tipo de aula — podes escolher vários"
            options={CLASS_TYPES}
            selected={classTypes}
            onToggle={(t) => { handleToggleClassType(t); setIsFormDirty(true); }}
          />
        )}
        <ChipPicker
          id="gr-grupos-musculares"
          label={kind === 'aula' ? 'Grupos musculares (opcional) — podes escolher vários' : 'Grupos musculares — podes escolher vários'}
          hint={categories.length === 0 ? 'Se não escolheres, a Carol tira-os das observações.' : null}
          options={MUSCLE_GROUPS}
          selected={categories}
          onToggle={(c) => { handleToggleCategory(c); setIsFormDirty(true); }}
        />

        <ExerciseEditor
          exercises={exercises}
          onChange={(next) => { setExercises(next); setIsFormDirty(true); }}
          locker={locker}
          lockerRows={exerciseLocker}
          onOpenLocker={() => useAppStore.getState().loadExerciseLocker?.()}
        />

        <label className="text-[11px] text-[var(--text-3)] mb-1.5 block font-semibold">Métricas do relógio (opcional)</label>
        <div className="grid grid-cols-2 gap-2.5 mb-4">
          <div>
            <label htmlFor="gr-duracao-ex-43m" className="text-[11px] font-semibold text-[var(--text-3)] block mb-1">Duração (ex.: 43m)</label>
            <input id="gr-duracao-ex-43m"
              type="text"
              inputMode="text"
              value={durationStr}
              onChange={e => { setDurationStr(e.target.value); setIsFormDirty(true); }}
              placeholder="Ex: 45m"
              className="w-full bg-[var(--surface-glass)] border border-[var(--border-glass)] text-white rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-[var(--mod-ginasio-to)] transition"
            />
          </div>
          <div>
            <label htmlFor="gr-calorias-kcal" className="text-[11px] font-semibold text-[var(--text-3)] block mb-1">Calorias (kcal)</label>
            <input id="gr-calorias-kcal"
              type="number"
              min="0"
              step="1"
              value={calories}
              onChange={e => { setCalories(e.target.value); setIsFormDirty(true); }}
              placeholder="Ex: 350"
              className="w-full bg-[var(--surface-glass)] border border-[var(--border-glass)] text-white rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-[var(--mod-ginasio-to)] transition"
            />
          </div>
          <div>
            <label htmlFor="gr-fc-media-bpm" className="text-[11px] font-semibold text-[var(--text-3)] block mb-1">FC média (bpm)</label>
            <input id="gr-fc-media-bpm"
              type="number"
              min="0"
              step="1"
              value={avgHr}
              onChange={e => { setAvgHr(e.target.value); setIsFormDirty(true); }}
              placeholder="Ex: 135"
              className="w-full bg-[var(--surface-glass)] border border-[var(--border-glass)] text-white rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-[var(--mod-ginasio-to)] transition"
            />
          </div>
          <div>
            <label htmlFor="gr-fc-maxima-bpm" className="text-[11px] font-semibold text-[var(--text-3)] block mb-1">FC máxima (bpm)</label>
            <input id="gr-fc-maxima-bpm"
              type="number"
              min="0"
              step="1"
              value={maxHr}
              onChange={e => { setMaxHr(e.target.value); setIsFormDirty(true); }}
              placeholder="Ex: 168"
              className="w-full bg-[var(--surface-glass)] border border-[var(--border-glass)] text-white rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-[var(--mod-ginasio-to)] transition"
            />
          </div>
        </div>
        
        <div className="mb-4">
          <label className="text-[12px] text-[var(--text-3)] mb-1.5 block">Nível de esforço (RPE, opcional)</label>
          <div className="flex gap-1.5">
            {Array.from({ length: 10 }).map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => { setExertion(exertion == i + 1 ? 0 : i + 1); setIsFormDirty(true); }}
                // min-h-[44px] em vez de aspect-square: dez celulas de 44px de LARGURA nao
                // cabem em 358px, e o piso do handoff e de altura (44 de largura so
                // se exige a botoes que sao so icone).
                className={`flex-1 min-h-[44px] rounded-lg flex items-center justify-center text-[13px] font-bold transition-colors border shadow-sm ${exertion == i + 1 ? 'bg-[var(--mod-ginasio-to)]/15 border-[var(--mod-ginasio-to)]/40 text-[var(--mod-ginasio-to)]' : 'bg-[var(--surface-glass)] border-[var(--border-glass)] text-[var(--text-3)]'}`}
              >
                {i + 1}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-[var(--text-3)] mt-1.5">1 = Muito leve · 10 = Máximo. Só preenche se sentires que ajuda a explicar como correu.</p>
        </div>

        <div className="mb-4">
          <label htmlFor="gr-observacoes-opcional-ex" className="text-[11px] text-[var(--text-3)] mb-1.5 block">
            Observações (opcional) — ex.: "{kind === 'aula' ? 'aula puxada, professor novo' : 'treino de força, peso corporal'}"
          </label>
          <textarea id="gr-observacoes-opcional-ex"
            rows={2}
            maxLength={500}
            value={notes}
            onChange={e => { setNotes(e.target.value); setIsFormDirty(true); }}
            placeholder="Contexto do treino..."
            className="w-full bg-[var(--surface-glass)] border border-[var(--border-glass)] text-white rounded-xl px-3 py-2.5 text-sm text-white placeholder-[var(--text-muted)] outline-none focus:border-[var(--mod-ginasio-to)] resize-none"
          />
          {!isEditing && photos.length === 0 && notes.trim().length >= 3 && (
            <>
              <button
                type="button"
                onClick={handleRead}
                disabled={reading}
                className="mt-2 min-h-[44px] px-3 rounded-xl border text-[12px] font-bold disabled:opacity-60"
                style={{ borderColor: 'color-mix(in srgb, var(--mod-ginasio-to) 55%, transparent)', color: 'var(--mod-ginasio-to)', background: 'color-mix(in srgb, var(--mod-ginasio-to) 10%, transparent)' }}
              >
                {reading ? 'A ler…' : 'Preencher o formulário com isto'}
              </button>
              <p role="status" aria-live="polite" className="text-[12px] mt-2 text-[var(--text-2)]">{readNote?.text || ''}</p>
            </>
          )}
        </div>

        {/* A intervenção da Carol neste registo — o mesmo componente do cartão
            e do "Registo Guardado" (2026-10-05): "Falar com a Carol" não
            dispensa e só fecha o formulário se o separador mudar de facto;
            "Dispensar" usa a chave única do tipo (utils/recordIntervention.js) —
            antes este formulário lia coach_notes || coach_analysis e o cartão
            outro campo, e a dispensa num não valia no outro. */}
        {isEditing && (
          <CarolInterventionActions
            record={(gymSessions || []).find(s => s.id === sessionIdToEdit)}
            type="gym"
            onTalked={exit.close}
            className="mb-2"
          />
        )}

        {errorMsg && <p role="alert" className="text-[13px] font-medium mt-3 text-center" style={{ color: 'var(--danger)' }}>{errorMsg}</p>}
    </RegistrationShell>
  );
}
