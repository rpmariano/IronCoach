import React, { useState, useEffect, useRef } from 'react';
import { Camera, ImagePlus, X, Trash2, MessageSquare } from 'lucide-react';
import { format } from 'date-fns';
import { useAppStore } from '../../store';
import { supabase, invokeEdgeFunctionWithTimeout } from '../../lib/supabase';
import { ANALYZE_TIMEOUT_MS } from '../../lib/edgeTimeouts';
import { compressImage } from '../../lib/image';
import { CoachAnalyzeButton } from '../shared/CoachButton';
import UnsavedChangesModal from '../shared/UnsavedChangesModal';
import RecordConfirmation from '../shared/RecordConfirmation';
import { firstRecordMoment } from '../../utils/firstRecord';
import Chip from '../shared/Chip';
import AddButton from '../shared/AddButton';
import Button from '../shared/Button';
import ActionBar, { ACTION_BAR_SCROLL_PAD } from '../shared/ActionBar';
import { AnalysisSkeleton, AnalysisFailure } from '../shared/AnalysisState';
import useAnalysis from '../../utils/useAnalysis';
import { usePersistedFormDraft, restorePersistedFormDraft, clearPersistedFormDraft } from '../../utils/formDraftPersistence';
import { normalizeStartTime, startTimeInputValue } from '../../utils/startTime';
import { mealNominalTime } from '../../utils/dayOrder';
import { usePersistedDraftMedia } from '../../utils/draftMediaPersistence';
import { foodKey, habitualsForMealType, isKnownFood, isPantryComplete, pantrySuggestions, portionText } from '../../utils/pantry';

/* Espelha MEAL_TYPES em supabase/functions/analyze-meal e mealTypeLabel()
   em src/utils/nutrition.js — as duas usam hífen (ex.: "pequeno-almoco"). A
   versão anterior deste ficheiro usava underscore ("pequeno_almoco"), que a
   Edge Function rejeitava com 400 "Tipo de refeição inválido" — nunca dava
   para notar porque o botão era um placeholder e nunca chegava a chamá-la. */
const MEAL_TYPES = [
  { key: 'pequeno-almoco', label: 'Pequeno-almoço' },
  { key: 'lanche-manha', label: 'Lanche da manhã' },
  { key: 'almoco', label: 'Almoço' },
  { key: 'lanche', label: 'Lanche' },
  { key: 'jantar', label: 'Jantar' },
  { key: 'ceia', label: 'Ceia' },
];

const MAX_PHOTOS = 6; // espelha MAX_PHOTOS em supabase/functions/analyze-meal

function getDefaultMealType() {
  const hour = new Date().getHours();
  const minute = new Date().getMinutes();
  const time = hour + minute / 60;
  
  if (time >= 5 && time < 10.5) return 'pequeno-almoco'; // 05:00 - 10:30
  if (time >= 10.5 && time < 12) return 'lanche-manha';  // 10:30 - 12:00
  if (time >= 12 && time < 15) return 'almoco';          // 12:00 - 15:00
  if (time >= 15 && time < 19) return 'lanche';          // 15:00 - 19:00
  if (time >= 19 && time < 22.5) return 'jantar';        // 19:00 - 22:30
  return 'ceia';                                         // 22:30 - 05:00
}

export default function MealRegistration({ onClose, dateIso = null, mealIdToEdit = null }) {
  const { profile, meals, setMeals, loadInitialData, setNavGuard, activeTab, session, pantryFoods: storedPantry, pantryLoaded, pantryUserId, loadPantry } = useAppStore();
  // A despensa (bugs #48/#52, fase C): sugestões ao escrever e os habituais
  // desta refeição. Um alimento da despensa já não é analisado.
  // A que está em memória pode ser de outra conta (sessão trocada sem recarregar).
  const myId = session?.user?.id || profile?.id;
  const pantryIsMine = !myId || pantryUserId === myId;
  const pantryFoods = pantryIsMine ? storedPantry : [];
  useEffect(() => { if (!pantryLoaded || !pantryIsMine) loadPantry?.(); }, [pantryLoaded, pantryIsMine, loadPantry]);
  const [initialTab] = useState(activeTab);

  

  const isEditing = !!mealIdToEdit;

  // Identifica este rascunho de forma única para sobreviver a um
  // recarregamento (ver formDraftPersistence.js) — nunca partilhado entre
  // refeições diferentes nem entre uma edição e uma criação nova a seguir.
  const draftStorageKey = mealIdToEdit ? `ironcoach:refeicao-rascunho:${mealIdToEdit}` : 'ironcoach:refeicao-rascunho:nova';
  // Só tenta restaurar UMA VEZ por sessão de edição/criação — sem isto, o
  // efeito de carregamento reporia o rascunho guardado por cima de
  // alterações mais recentes ainda não persistidas.
  const restoredForKeyRef = useRef(null);

  // Comum aos dois caminhos
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  /* Hora da refeição ('HH:MM', hora local; meals.meal_time) — a hora a que
     se COMEU, não a de introdução na app (pedido 2026-09-13): numa refeição
     nova é SUGERIDA pelo tipo (almoço → 13:00, dayOrder.mealNominalTime) e
     acompanha o tipo enquanto o atleta não lhe tocar; tocada, fica. A
     editar, a que está gravada. É ela que ordena o dia no Calendário e que
     diz à Carol a que horas se comeu. */
  const [mealType, setMealType] = useState(getDefaultMealType);
  const [mealTime, setMealTime] = useState(() => (mealIdToEdit ? '' : mealNominalTime(mealType)));
  const mealTimeTouchedRef = useRef(!!mealIdToEdit);
  const [notes, setNotes] = useState('');
  /* Um só ecrã (bug #47, 2026-10-03): já não se escolhe entre Foto e
     Manual. Fotos, alimentos escritos e observações juntam-se no mesmo
     registo — tira-se foto ao prato e escreve-se o que ela não mostra (o
     café com açúcar, o molho) ou a quantidade que se sabe. Basta uma das
     duas coisas para analisar. */
  const [errorMsg, setErrorMsg] = useState('');

  // Foto (IA)
  const [photos, setPhotos] = useState([]); // [{ dataUrl, base64 }]

  /* Ponto 7 do redesenho: espera e erro da análise num só estado
     (src/utils/useAnalysis.js). Antes eram três booleanos independentes
     (isAnalyzing, isFinalizing, isSaving) e um errorMsg partilhado com as
     validações do formulário — uma falha de rede lia-se como um campo mal
     preenchido e não havia forma de repetir sem refazer tudo. `errorMsg`
     fica, mas só para as validações locais (nome do alimento, gramas,
     número de fotos). */
  const analysis = useAnalysis();
  const isAnalyzing = analysis.isAnalyzing;

  // Manual — "Adicionar alimento" só acrescenta {name, grams} a uma lista
  // local, sem tocar no servidor nem no Gemini. Só ao premir "Analisar
  // Refeição" é que UMA ÚNICA chamada estima os valores nutricionais de
  // TODOS os alimentos de uma vez, grava a refeição e gera o comentário do
  // Coach — nada é consultado à IA por cada alimento adicionado.
  const [manualItems, setManualItems] = useState([]); // [{ key, name, grams, dbId? }]
  const [itemName, setItemName] = useState('');
  const [itemGrams, setItemGrams] = useState('');
  // O "Escrever" do aviso de falha traz o atleta aqui.
  const itemNameRef = useRef(null);

  // Edição — carrega a refeição existente. Alimentos e observações são dados
  // ANALÍTICOS: mudá-los muda a análise, por isso guardar passa pelo Coach e
  // regenera-a (as observações entram no prompt de estimação — "hambúrguer"
  // caseiro e do McDonald's não dão os mesmos valores). A data, a hora e o
  // tipo também (a Carol lê-os — ver analyticalSignature). Sem nada mudado,
  // ou numa refeição sem alimentos em que só mudou data/hora/tipo, guardar é
  // um update direto,
  // sem custo de API. É por passar pelo Coach que acrescentar um alimento
  // novo ao editar é agora possível — a estimativa dos valores dele vem daí.
  const [originalSnapshot, setOriginalSnapshot] = useState(null);
  // Só observações + alimentos, tirada ao mesmo tempo (ver needsReanalysis).
  const [originalContent, setOriginalContent] = useState(null);
  const [isFormDirty, setIsFormDirty] = useState(false);
  const autoCloseRef = useRef(false);
  useEffect(() => {
    if (activeTab !== initialTab && !autoCloseRef.current && !isFormDirty) {
      autoCloseRef.current = true;
      if (onClose) onClose();
    }
  }, [activeTab, initialTab, onClose, isFormDirty]);
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
  // Alvo de navegação pendente quando o navGuard intercepta uma troca de
  // separador com o formulário sujo — null quando a saída foi pedida pelo
  // botão X do próprio ecrã, sem destino nenhum.
  const pendingNavTarget = useRef(null);

  // Trava a navegação para fora deste ecrã enquanto houver alterações por
  // gravar — mesmo mecanismo usado em Perfil.jsx e RunAgenda.jsx.
  useEffect(() => {
    if (!isFormDirty) { setNavGuard(null); return; }
    setNavGuard((intendedTab) => {
      pendingNavTarget.current = intendedTab;
      setShowUnsavedModal(true);
      return false;
    });
    return () => setNavGuard(null);
  }, [isFormDirty, setNavGuard]);

  // Fechar/recarregar o separador do browser também avisa.
  useEffect(() => {
    if (!isFormDirty) return;
    const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isFormDirty]);

  // onClose() do prop só fecha este ecrã; quando a saída veio de uma troca
  // de separador (navGuard), há ainda que completar essa navegação depois
  // de fechar — senão o utilizador ficava preso no ecrã Início/Ginásio/etc.
  // que já estava aberto antes de pedir para sair.
  // Chama o onClose() do PROP diretamente (nunca handleClose) — é a saída
  // da recursão. Tudo o resto no ficheiro que antes fechava com onClose()
  // foi trocado para handleClose(), precisamente para passar por aqui.
  const handleClose = () => {
    autoCloseRef.current = true;
    const target = pendingNavTarget.current;
    pendingNavTarget.current = null;
    clearPersistedFormDraft(draftStorageKey);
    onClose();
    if (target) {
      // O guard ainda está registado neste render — o próprio setActiveTab()
      // chamado a seguir voltaria a cair nele e a bloquear-se a si mesmo,
      // porque onClose() só desmonta este ecrã no próximo render, não já.
      // Limpar primeiro é o que falta para a navegação pendente completar
      // (mesmo detalhe já usado em Perfil.jsx/RunAgenda.jsx).
      setNavGuard(null);
      useAppStore.getState().setActiveTab(target);
    }
  };

  // Ao gravar uma refeição NOVA (foto ou manual), vai sempre para o
  // Calendário, aberto no dia da refeição — mesmo padrão de RunAgenda.jsx
  // (Prova) via pendingCalendarDate no store. Se isto veio de "Gravar e
  // sair" a caminho de outro separador (navGuard intercetado), respeita
  // esse destino em vez de o substituir — por isso o alvo pendente é lido
  // ANTES de handleClose() o consumir.
  /* Ponto 9, animação 6 ("Registo confirmado"): o check com impulso
     elástico corre PRIMEIRO e só depois é que o ecrã fecha e leva ao
     destino de sempre. O CreatedRecordModal continua lá — traz o cartão
     analisado e o "Falar com a Carol", que o atleta precisa de ver. */
  const [confirmation, setConfirmation] = useState(null);

  // `extras`: o que mais o ecrã do resultado mostra — pantryAdded, os
  // produtos que entraram já na despensa por um rótulo (bug #48, fase C).
  const finishCreateAndGoToCalendar = (createdRecord, label = 'Refeição registada', extras = {}) => {
    const hadPendingNav = !!pendingNavTarget.current;
    // O primeiro registo deste tipo: a Carol diz o que ele quer dizer
    // (utils/firstRecord.js). Só ao criar — editar a única corrida não é "a primeira".
    const first = !isEditing && firstRecordMoment('meal', useAppStore.getState(), createdRecord);
    // Gravado: o rascunho apaga-se JÁ, não só ao dispensar a confirmação —
    // se o Android matasse a app com ela à vista, o registo reabria cheio e
    // gravar outra vez duplicava-o (revisão pré-deploy de 5ce5f31).
    clearPersistedFormDraft(draftStorageKey);
    setConfirmation({ label, first, done: () => {
      handleClose();
      if (!hadPendingNav) {
        setNavGuard(null);
        if (createdRecord) {
          useAppStore.getState().setNewlyCreatedRecord({ type: 'meal', record: createdRecord, ...extras });
        }
        useAppStore.getState().setPendingCalendarDate(date);
        useAppStore.getState().setActiveTab('calendario');
      }
    } });
  };

  // Assinatura do que é analítico, para comparar o antes com o agora. Desde
  // 2026-09-28 é TUDO o que o formulário edita: qualquer mudança num registo
  // regenera a análise (pedido do Rui). A hora e o tipo contam porque a Carol
  // os lê — ordenam o dia e decidem que refeições ainda podem vir.
  const contentSignature = (notesValue, items) => JSON.stringify({
    notes: (notesValue || '').trim(),
    // O input das gramas guarda texto ("150") e a BD devolve número (150):
    // normaliza, senão apagar e reescrever o mesmo valor reanalisava.
    items: items.map(i => {
      const raw = i.grams === '' || i.grams === undefined ? null : i.grams;
      const n = raw === null ? null : Number(raw);
      return { name: (i.name || '').trim(), grams: n === null ? null : (Number.isFinite(n) ? n : String(raw)) };
    }),
  });
  const analyticalSignature = (dateValue, timeValue, typeValue, notesValue, items) => JSON.stringify({
    date: dateValue,
    time: normalizeStartTime(timeValue),
    type: typeValue,
    content: contentSignature(notesValue, items),
  });

  useEffect(() => {
    if (!mealIdToEdit) return;
    const meal = meals.find(m => m.id === mealIdToEdit);
    if (!meal) return;
    // Rascunho por gravar guardado localmente (ver formDraftPersistence.js)
    // sobrepõe-se ao valor canónico vindo do servidor — restaura-se UMA VEZ
    // por sessão de edição (restoredForKeyRef), senão este efeito repunha-o
    // a cada vez que voltasse a correr.
    const alreadyRestored = restoredForKeyRef.current === draftStorageKey;
    const persisted = alreadyRestored ? null : restorePersistedFormDraft(draftStorageKey);
    restoredForKeyRef.current = draftStorageKey;

    const canonicalItems = (meal.meal_items || []).map((it, i) => ({
      key: it.id || `${Date.now()}-${i}`,
      dbId: it.id,
      name: it.name,
      grams: it.quantity_grams,
    }));
    setDate(persisted?.date ?? (meal.date || format(new Date(), 'yyyy-MM-dd')));
    // A BD devolve 'HH:MM:SS'; o input só fala 'HH:MM' (ver startTime.js).
    setMealTime(persisted?.mealTime ?? startTimeInputValue(meal.meal_time));
    setMealType(persisted?.mealType ?? (meal.meal_type || 'almoco'));
    setNotes(persisted?.notes ?? (meal.notes || ''));
    setManualItems(persisted?.manualItems ?? canonicalItems);
    setItemName(persisted?.itemName ?? '');
    setItemGrams(persisted?.itemGrams ?? '');
    // A assinatura de partida compara sempre contra o valor CANÓNICO (do
    // servidor), nunca contra o rascunho restaurado — é assim que um
    // rascunho com alimentos/observações diferentes dos gravados dispara
    // "Guardar e reanalisar" já na primeira renderização.
    setOriginalSnapshot(analyticalSignature(meal.date, meal.meal_time, meal.meal_type, meal.notes, canonicalItems));
    setOriginalContent(contentSignature(meal.notes, canonicalItems));
    if (persisted) setIsFormDirty(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mealIdToEdit]);

  // Restaura um rascunho de refeição NOVA por gravar (ver
  // formDraftPersistence.js) — o caminho de edição está no efeito acima.
  // Corre uma única vez por sessão de criação (restoredForKeyRef), sem
  // depender de `meals`, para não repor o rascunho por cima de alterações
  // recentes sempre que outra refeição é gravada em paralelo.
  useEffect(() => {
    if (mealIdToEdit) return;
    if (restoredForKeyRef.current === draftStorageKey) return;
    restoredForKeyRef.current = draftStorageKey;
    const persisted = restorePersistedFormDraft(draftStorageKey);
    if (!persisted) return;
    if (persisted.date) setDate(persisted.date);
    if (persisted.mealTime !== undefined) { setMealTime(persisted.mealTime); mealTimeTouchedRef.current = true; }
    if (persisted.mealType) setMealType(persisted.mealType);
    if (persisted.notes !== undefined) setNotes(persisted.notes);
    if (persisted.manualItems) setManualItems(persisted.manualItems);
    if (persisted.itemName !== undefined) setItemName(persisted.itemName);
    if (persisted.itemGrams !== undefined) setItemGrams(persisted.itemGrams);
    setIsFormDirty(true);
  }, [mealIdToEdit, draftStorageKey]);

  // Grava o rascunho (com debounce) enquanto houver alterações por gravar —
  // sobrevive a um recarregamento da página (ver formDraftPersistence.js).
  // As fotos guardam-se à parte, em IndexedDB (draftMediaPersistence.js,
  // logo abaixo): em localStorage estouravam a quota.
  usePersistedFormDraft(draftStorageKey, {
    date, mealTime, mealType, notes, manualItems, itemName, itemGrams,
  // Com a confirmação à vista o registo está gravado: o rascunho já foi
  // apagado e não volta a guardar-se (revisão pré-deploy de 6e92d67).
  }, { isDirty: isFormDirty && !confirmation });

  /* Desde 2026-09-28 a hora vai no próprio pedido à analyze-meal, que a
     grava com a refeição — para a Carol a ler na análise (antes gravava-se
     só aqui, depois, e ela nunca a via). Este update à parte fica como rede
     de segurança: com o servidor atual não faz nada (a hora já vem certa na
     resposta); com um servidor que ainda não a grave, é ele que a grava, e
     no caminho de edição sem reanálise continua a ser o único. Uma coluna
     só, sob a RLS "own rows". Falhar aqui não desfaz a refeição: fica sem
     hora e avisa-se na consola. */
  const persistMealTime = async (meal) => {
    if (!meal?.id) return meal;
    const value = normalizeStartTime(mealTime);
    if (value === normalizeStartTime(meal.meal_time)) return meal;
    try {
      const { error } = await supabase.from('meals').update({ meal_time: value }).eq('id', meal.id);
      if (error) throw error;
      return { ...meal, meal_time: value };
    } catch (err) {
      console.warn('Hora da refeição não gravada', err);
      return meal;
    }
  };

  /* As fotos do rascunho guardam-se à parte, em IndexedDB
     (draftMediaPersistence.js), para sobreviverem a sair da app e voltar
     (relatado 2026-09-13). Só num registo novo: a editar, as fotos já
     gravadas voltam do servidor. Restaurá-las marca o formulário como
     alterado, para o aviso de saída as proteger. */
  usePersistedDraftMedia(mealIdToEdit ? null : draftStorageKey, 'photos', photos, (v) => { setPhotos(v); setIsFormDirty(true); });

  // Regenera a análise se QUALQUER campo mudou. Exceção: numa refeição sem
  // alimentos (análise por foto que devolveu 0 itens) não há o que reanalisar,
  // e corrigir a data, a hora ou o tipo tem de continuar a gravar — cai no
  // update direto (revisão pré-deploy de c6f92a72). Mexer nas observações ou
  // nos alimentos sem alimentos continua bloqueado, como antes.
  const contentUnchanged = originalContent !== null && contentSignature(notes, manualItems) === originalContent;
  const needsReanalysis = isEditing
    && originalSnapshot !== null
    && analyticalSignature(date, mealTime, mealType, notes, manualItems) !== originalSnapshot
    && !(contentUnchanged && manualItems.length === 0);

  const updateManualItem = (key, patch) => {
    setManualItems(prev => prev.map(i => (i.key === key ? { ...i, ...patch } : i)));
    setIsFormDirty(true);
  };

  // Handle Photo Selection — comprime e normaliza para JPEG (src/lib/image.js,
  // partilhado com a Corrida); o .base64 resultante é o que vai no pedido de
  // análise por IA.
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
      } catch (err) {
        console.warn('Falha a processar imagem', err);
      }
    }
  };

  const removePhoto = (idx) => setPhotos(prev => prev.filter((_, i) => i !== idx));
  const clearPhotos = () => setPhotos([]);

  // ----------------------------------
  // ANALISAR REFEIÇÃO COM FOTOS (analyze-meal) — e com os alimentos escritos,
  // se os há (bug #47): o servidor junta as duas coisas numa só chamada.
  // ----------------------------------
  // A tarefa em si, separada do gesto: é ela que o "Tentar de novo" repete,
  // com as MESMAS fotos, alimentos, data, tipo e observações (useAnalysis guarda-a).
  const analyzePhotosTask = async () => {
    const { data, error } = await invokeEdgeFunctionWithTimeout('analyze-meal', {
      body: {
        images: photos.map(p => p.base64),
        mime_type: 'image/jpeg',
        date,
        meal_type: mealType,
        meal_time: normalizeStartTime(mealTime),
        notes: notes.trim() || null,
        ...(manualItems.length ? { items: manualItems.map(i => ({ name: i.name, grams: i.grams })) } : {}),
      },
    }, ANALYZE_TIMEOUT_MS);
    if (error) throw new Error(error);
    if (data?.error) throw new Error(data.error);

    // A resposta traz meal e items em separado — o store espera-os juntos,
    // tal como loadInitialData os carrega (select('*, meal_items(*)')).
    const mealWithItems = await persistMealTime({ ...data.meal, meal_items: data.items || [] });
    if (!Array.isArray(mealWithItems.meal_items) || mealWithItems.meal_items.length === 0) {
      console.warn('Aviso: análise retornou 0 itens', data);
    }
    setMeals([...meals, mealWithItems]);
    // A refeição ensinou a despensa (fase A): as sugestões seguintes já a contam.
    useAppStore.getState().loadPantry?.();
    finishCreateAndGoToCalendar(mealWithItems, 'Refeição registada', data.pantry_added?.length ? { pantryAdded: data.pantry_added } : {});
  };

  // ----------------------------------
  // ALIMENTOS ESCRITOS — adicionar é só local; a estimativa de nutrientes e o
  // comentário do Coach só acontecem ao premir "Analisar refeição". As
  // gramas são opcionais: quando não indicadas, o Coach estima a porção
  // típica a partir da descrição do alimento + das observações da refeição
  // (ex.: "fiambre" com a observação "1 fatia" dá o mesmo resultado que
  // "1 fatia de fiambre" sem observação nenhuma).
  // ----------------------------------
  const handleAddItem = () => {
    const name = itemName.trim();
    if (!name) { setErrorMsg('Escreve o nome do alimento.'); return; }
    const trimmedGrams = itemGrams.trim();
    const grams = trimmedGrams ? Number(trimmedGrams) : null;
    if (trimmedGrams && !(grams > 0)) { setErrorMsg('Indica um valor de gramas válido.'); return; }

    setErrorMsg('');
    setManualItems(prev => [...prev, { key: `${Date.now()}-${prev.length}`, name, grams }]);
    setIsFormDirty(true);
    setItemName('');
    setItemGrams('');
  };

  /* Um alimento da despensa: entra com o nome dela e a porção habitual (ou
     as gramas já escritas). O servidor reconhece-o pelo nome e usa os
     valores dela, sem o voltar a analisar (analyze-meal/pantry.ts). */
  const addPantryFood = (food) => {
    const typed = itemGrams.trim() ? Number(itemGrams) : null;
    const grams = typed > 0 ? typed : (Number(food.portion_grams) > 0 ? Math.round(Number(food.portion_grams)) : null);
    setErrorMsg('');
    setManualItems(prev => [...prev, { key: `${Date.now()}-${prev.length}`, name: food.name, grams }]);
    setIsFormDirty(true);
    setItemName('');
    setItemGrams('');
  };
  /* Desde 2026-10-05 só um alimento da despensa COMPLETO (os 7
     micronutrientes dados) fica de fora da análise; um com micronutrientes
     por confirmar vai lá só buscar esses — calorias e macros continuam os
     da despensa (analyze-meal/pantry.ts, splitKnownWritten). O texto diz a
     verdade sobre cada um. */
  const knownFoodNote = (name) => {
    const food = (pantryFoods || []).find((f) => f.name_key === foodKey(name));
    return isPantryComplete(food) ? 'já conhecido, não é analisado' : 'já conhecido · a Carol completa os micronutrientes';
  };
  const suggestions = pantrySuggestions(itemName, pantryFoods);
  const habituals = habitualsForMealType({ meals, foods: pantryFoods, mealType, today: date })
    .filter((f) => !manualItems.some((i) => isKnownFood(i.name, [f])));

  const handleRemoveManualItem = (key) => {
    setManualItems(prev => prev.filter(i => i.key !== key));
    setIsFormDirty(true);
  };

  const finalizeManualTask = async () => {
    const { data, error } = await invokeEdgeFunctionWithTimeout('analyze-meal', {
      body: {
        mode: 'manual',
        date,
        meal_type: mealType,
        meal_time: normalizeStartTime(mealTime),
        notes: notes.trim() || null,
        items: manualItems.map(i => ({ name: i.name, grams: i.grams })),
      },
    }, ANALYZE_TIMEOUT_MS);
    if (error) throw new Error(error);
    if (data?.error) throw new Error(data.error);

    const savedMeal = await persistMealTime(data.meal);
    setMeals([...meals, savedMeal]);
    useAppStore.getState().loadPantry?.();
    finishCreateAndGoToCalendar(savedMeal, 'Refeição registada');
  };

  // Um só "Analisar refeição": com fotos vai tudo junto (fotos + alimentos
  // escritos), sem fotos é o registo só escrito (mode manual).
  const canAnalyze = photos.length > 0 || manualItems.length > 0;
  const handleAnalyze = () => {
    if (!canAnalyze || isAnalyzing) return;
    setErrorMsg('');
    analysis.run(photos.length ? analyzePhotosTask : finalizeManualTask);
  };

  // ----------------------------------
  // GUARDAR ALTERAÇÕES (edição) — dois caminhos:
  //   • Qualquer campo mudou → passa pelo Coach (analyze-meal em
  //     mode manual com meal_id), que reestima os valores nutricionais de
  //     todos os alimentos e regenera a análise. É o que permite acrescentar
  //     um alimento novo ao editar.
  //     A hora e o tipo contam desde 2026-09-28 (a Carol lê-os).
  //   • Refeição sem alimentos e só data/hora/tipo mudaram → update direto,
  //     sem chamada ao Gemini; a hora grava-a persistMealTime.
  // ----------------------------------
  const saveEditTask = async () => {
    {
      let savedMeal = null;
      if (needsReanalysis) {
        const { data, error } = await invokeEdgeFunctionWithTimeout('analyze-meal', {
          body: {
            mode: 'manual',
            meal_id: mealIdToEdit,
            date,
            meal_type: mealType,
            meal_time: normalizeStartTime(mealTime),
            notes: notes.trim() || null,
            items: manualItems.map(i => ({ name: i.name, grams: i.grams })),
          },
        }, ANALYZE_TIMEOUT_MS);
        if (error) throw new Error(error);
        if (data?.error) throw new Error(data.error);
        savedMeal = data?.meal;
        useAppStore.getState().clearDismissedIntervention(mealIdToEdit);
      } else {
        const { error: mealError } = await supabase
          .from('meals')
          .update({ date, meal_type: mealType })
          .eq('id', mealIdToEdit);
        if (mealError) throw mealError;
        const currentMeal = (meals || []).find(m => m.id === mealIdToEdit);
        savedMeal = currentMeal ? { ...currentMeal, date, meal_type: mealType } : { id: mealIdToEdit, date, meal_type: mealType };
      }

      savedMeal = await persistMealTime(savedMeal);
      if (profile?.id) await loadInitialData(profile.id);
      finishCreateAndGoToCalendar(savedMeal, needsReanalysis ? 'Refeição reanalisada pela Carol' : 'Refeição atualizada');
    }
  };

  const handleSaveEdit = () => {
    if (isAnalyzing) return;
    if (needsReanalysis && !manualItems.length) {
      setErrorMsg('A refeição tem de ter pelo menos um alimento.');
      return;
    }
    setErrorMsg('');
    analysis.run(saveEditTask);
  };

  /* Ação primária do ecrã — vive na ActionBar fixa (ponto 2 do handoff), não
     no fim do formulário, onde ficava abaixo da dobra. Os rótulos são os de
     sempre. */
  const primaryAction = isEditing ? (
    <CoachAnalyzeButton
      onClick={handleSaveEdit}
      disabled={isAnalyzing || (needsReanalysis && !manualItems.length)}
      busy={isAnalyzing}
      label={needsReanalysis ? "Guardar e reanalisar" : "Guardar alterações"}
    />
  ) : (
    <CoachAnalyzeButton
      onClick={handleAnalyze}
      disabled={!canAnalyze || isAnalyzing}
      busy={isAnalyzing}
      label="Analisar refeição"
    />
  );

  return (
    // --focus-ring: anel de teclado na cor do módulo (handoff, "Fidelity").
    <div
      className="fade-in"
      style={{ '--focus-ring': 'var(--mod-nutricao-to)', paddingBottom: ACTION_BAR_SCROLL_PAD }}
    >
      <div
        className="module-card-contrast relative overflow-hidden"
        // Mesmo vidro fosco (bg branco 5% + blur 20px) do resto da app — a
        // versão anterior tinha a borda/glow do .card mas sem backdrop-filter
        // nem base branca, o que dava um retângulo escuro plano em vez do
        // vidro premium usado nos outros ecrãs. Lavagem na cor do módulo por
        // cima, bem subtil.
        style={{
          background: 'linear-gradient(135deg, color-mix(in srgb, var(--mod-nutricao-to) 3%, transparent), color-mix(in srgb, var(--mod-nutricao-to) 6%, transparent)), rgba(255, 255, 255, 0.05)',
        }}
      >
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <Camera size={18} style={{ color: 'var(--mod-nutricao-to)' }} />
            <h2 className="text-sm font-semibold text-[var(--text-1)]">{isEditing ? 'Editar Refeição' : 'Nova Refeição'}</h2>
          </div>
          <button
            onClick={() => { if (isFormDirty) setShowUnsavedModal(true); else handleClose(); }}
            type="button"
            // O circulo continua a desenhar-se com 32px; o que cresce para
            // 44 (--tap) e a area tocavel a volta dele - ponto 2 do handoff.
            className="tap-44 shrink-0"
            title="Fechar"
            aria-label="Fechar"
          >
            <span className="w-8 h-8 flex items-center justify-center rounded-full bg-[var(--surface-glass)] text-[var(--text-3)] hover:bg-[var(--surface-strong)] transition-colors">
              <X size={16} />
            </span>
          </button>
        </div>

        {/* Ponto 7 — ESPERA. O esqueleto ocupa o sítio onde o resultado vai
            aparecer, e o formulário por baixo fica bloqueado mas VISÍVEL:
            nada do que o atleta escreveu ou fotografou se apaga. */}
        {isAnalyzing && <AnalysisSkeleton kind="meal" manual={isEditing || photos.length === 0} />}

        {/* Ponto 7 — ERRO. Texto do mock "Refeição · análise falhou", na voz
            da Carol (CAROL.md: nunca "Desculpa, não consegui analisar").
            "Tentar de novo" repete a MESMA chamada com os mesmos dados;
            "Escrever" leva ao campo dos alimentos, no mesmo ecrã — as fotos,
            a data, o tipo e as observações ficam onde estão (bug #47). */}
        {analysis.hasFailed && (
          <AnalysisFailure
            detail={analysis.error}
            onRetry={analysis.retry}
            onManual={!isEditing && photos.length > 0
              ? () => { analysis.reset(); itemNameRef.current?.focus(); }
              : undefined}
          >
            {photos.length > 0
              ? 'As fotos ficaram guardadas. Podes tentar outra vez, ou escrever o que comeste aqui em baixo — eu junto tudo.'
              : 'O que escreveste ficou guardado. Podes tentar outra vez.'}
          </AnalysisFailure>
        )}

        <div
          data-testid="meal-form-fields"
          aria-busy={isAnalyzing || undefined}
          style={isAnalyzing ? { opacity: 0.45, pointerEvents: 'none' } : undefined}
        >
        {/* Data · Hora — como na corrida e no ginásio. A hora ordena o dia
            no Calendário e diz à Carol a que horas se comeu. */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          <div className="min-w-0">
            <label htmlFor="mr-data-da-refeicao" className="text-[11px] text-[var(--text-3)] mb-1.5 block">Data da refeição</label>
            <input
              id="mr-data-da-refeicao"
              type="date"
              value={date}
              max={format(new Date(), 'yyyy-MM-dd')}
              onChange={e => { setDate(e.target.value); setIsFormDirty(true); }}
              className="w-full min-h-[var(--tap)] bg-[var(--surface-soft)] border border-[var(--border-glass)] rounded-xl px-3 py-2.5 text-sm text-[var(--text-1)] outline-none focus:border-[var(--focus-ring)] shadow-sm transition"
            />
          </div>
          <div className="min-w-0">
            <label htmlFor="mr-hora-da-refeicao" className="text-[11px] text-[var(--text-3)] mb-1.5 block">Hora da refeição</label>
            <input
              id="mr-hora-da-refeicao"
              type="time"
              value={mealTime}
              onChange={e => { mealTimeTouchedRef.current = true; setMealTime(e.target.value); setIsFormDirty(true); }}
              className="w-full min-h-[var(--tap)] bg-[var(--surface-soft)] border border-[var(--border-glass)] rounded-xl px-3 py-2.5 text-sm text-[var(--text-1)] outline-none focus:border-[var(--focus-ring)] shadow-sm transition"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-5">
          {MEAL_TYPES.map(t => {
            const isActive = mealType === t.key;
            return (
              <Chip
                key={t.key}
                active={isActive}
                variant="nutrition"
                onClick={() => {
                  setMealType(t.key);
                  // A hora sugerida segue o tipo enquanto o atleta não a tocar.
                  if (!mealTimeTouchedRef.current) setMealTime(mealNominalTime(t.key));
                  setIsFormDirty(true);
                }}
                className="px-4 py-1.5"
                type="button"
              >
                {t.label}
              </Chip>
            );
          })}
        </div>

        {/* FOTOS — opcionais (bug #47). Escondidas a editar: editar é pelos
            alimentos e observações, sem foto nova (mesmo padrão da Corrida). */}
        {!isEditing && (
          <div className="mb-5" data-testid="meal-photos">
            <p className="text-[11px] text-[var(--text-3)] mb-1.5 px-1">Fotos</p>
            {photos.length > 0 && (
              <>
                <div className="grid grid-cols-3 gap-2 mb-2">
                  {photos.map((p, i) => (
                    <div key={i} className="relative aspect-square">
                      <img src={p.dataUrl} className="w-full h-full object-cover rounded-xl border border-[var(--border-glass)]" alt={`Foto da refeição ${i + 1}`} />
                      <button
                        onClick={() => removePhoto(i)}
                        aria-label={`Remover foto ${i + 1}`}
                        className="tap-44 absolute -top-1.5 -right-1.5 text-[var(--text-3)] hover:text-[var(--danger)] transition"
                      >
                        <span className="bg-white/90 border border-[var(--border-glass)] rounded-full p-1 shadow-sm flex items-center justify-center">
                          <X size={14} />
                        </span>
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] text-[var(--text-3)]">{photos.length} foto(s) · máx {MAX_PHOTOS}</span>
                  <button onClick={clearPhotos} className="tap-h-44 text-[11px] text-[var(--text-3)] hover:text-[var(--danger)] flex items-center gap-1 transition">
                    <Trash2 size={14} /> Limpar todas
                  </button>
                </div>
              </>
            )}
            {photos.length < MAX_PHOTOS && (
              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center justify-center gap-1.5 min-h-[var(--tap)] border-2 border-dashed border-[var(--mod-nutricao)]/40 rounded-xl py-3 text-center cursor-pointer hover:border-[var(--mod-nutricao)]/70 hover:bg-[var(--mod-nutricao)]/5 transition bg-[var(--surface-glass)]">
                  <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoSelect} />
                  <Camera size={16} className="text-[var(--nutrition)]" />
                  <span className="text-xs font-semibold text-[var(--nutrition)]">Tirar foto</span>
                </label>
                <label className="flex items-center justify-center gap-1.5 min-h-[var(--tap)] border-2 border-dashed border-[var(--mod-nutricao)]/40 rounded-xl py-3 text-center cursor-pointer hover:border-[var(--mod-nutricao)]/70 hover:bg-[var(--mod-nutricao)]/5 transition bg-[var(--surface-glass)]">
                  <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoSelect} />
                  <ImagePlus size={16} className="text-[var(--nutrition)]" />
                  <span className="text-xs font-semibold text-[var(--nutrition)]">Da galeria</span>
                </label>
              </div>
            )}
            {photos.length === 0 && (
              <p className="text-[11px] text-[var(--text-3)] mt-2 px-1 leading-relaxed">Tira foto ao prato, escreve os alimentos, ou as duas coisas — eu junto tudo. Podes juntar várias fotos da mesma refeição.</p>
            )}
          </div>
        )}

        {/* ALIMENTOS ESCRITOS — sozinhos, ou a completar as fotos (bug #47).
            Também a editar: como guardar passa pelo Coach quando os alimentos
            mudam, os valores de um alimento novo são estimados na mesma
            chamada. */}
        <div className="mb-4">
          {!isEditing && <p className="text-[11px] text-[var(--text-3)] mb-1.5 px-1">Alimentos</p>}
          {habituals.length > 0 && (
            <div className="mb-3" data-testid="meal-habituals">
              <p className="text-[11px] text-[var(--text-3)] mb-1.5 px-1">O que costumas comer {MEAL_TYPES.find((t) => t.key === mealType)?.label ? `ao ${MEAL_TYPES.find((t) => t.key === mealType).label.toLowerCase()}` : 'a esta refeição'}</p>
              <div className="flex flex-wrap gap-1.5">
                {habituals.map((f) => (
                  <button
                    key={f.id ?? f.name_key}
                    type="button"
                    onClick={() => addPantryFood(f)}
                    className="min-h-[44px] px-3 rounded-full text-[12.5px] font-bold"
                    style={{ border: '1px solid var(--tint-nutrition-bd)', background: 'var(--tint-nutrition-bg)', color: 'var(--text-1)' }}
                  >
                    + {f.name}{portionText(f) ? ` · ${portionText(f)}` : ''}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="rounded-xl border border-[var(--border-glass)] bg-[var(--surface-glass)] p-3 mb-3">
            <p className="text-[12px] font-bold text-[var(--text-3)] mb-2.5">Adicionar alimento</p>
            <div className="grid grid-cols-[1fr_auto] gap-2 mb-2">
              <input
                ref={itemNameRef}
                type="text"
                aria-label="Nome do alimento a adicionar"
                placeholder="Ex.: peito de frango grelhado"
                value={itemName}
                onChange={e => { setItemName(e.target.value); setIsFormDirty(true); }}
                className="w-full bg-[var(--surface-soft)] border border-[var(--border-glass)] rounded-xl px-3 py-2.5 text-sm text-[var(--text-1)] outline-none focus:border-[var(--mod-nutricao-to)] transition"
              />
              <div className="relative w-24">
                <input
                  type="number" min="1" step="1"
                  aria-label="Gramas do alimento a adicionar (opcional)"
                  placeholder="g (opcional)"
                  value={itemGrams}
                  onChange={e => { setItemGrams(e.target.value); setIsFormDirty(true); }}
                  className="w-full bg-[var(--surface-soft)] border border-[var(--border-glass)] rounded-xl px-3 py-2.5 text-sm text-[var(--text-1)] outline-none focus:border-[var(--mod-nutricao-to)] transition"
                />
              </div>
            </div>
            {suggestions.length > 0 && (
              <div role="listbox" aria-label="Da tua despensa" data-testid="pantry-suggestions" className="rounded-xl overflow-hidden mb-2" style={{ border: '1px solid var(--border-glass-strong)', background: 'var(--surface-strong)' }}>
                <p className="px-3 pt-2 pb-1 text-[10.5px] font-extrabold uppercase" style={{ letterSpacing: 'var(--tracking-label)', color: 'var(--text-4)' }}>Da tua despensa</p>
                {suggestions.map((f, i) => (
                  <button
                    key={f.id ?? f.name_key}
                    type="button"
                    role="option"
                    aria-selected={false}
                    onClick={() => addPantryFood(f)}
                    className="w-full min-h-[48px] px-3 py-1.5 text-left"
                    style={i ? { borderTop: '1px solid var(--border-glass)' } : undefined}
                  >
                    <span className="block text-[13.5px] font-extrabold" style={{ color: 'var(--text-1)' }}>{f.name}</span>
                    <span className="block text-[11.5px]" style={{ color: 'var(--text-4)' }}>
                      {[portionText(f), f.portion_grams ? `${Math.round((Number(f.calories_per_100g) || 0) * Number(f.portion_grams) / 100)} kcal` : null].filter(Boolean).join(' · ')}
                    </span>
                  </button>
                ))}
              </div>
            )}
            <p className="text-[11px] text-[var(--text-3)] mb-2 px-1">
              {photos.length > 0
                ? 'Junta o que a foto não mostra, ou a quantidade que sabes (ex.: "café com açúcar", "arroz" com 150 g). Se o alimento também estiver na foto, conta o que escreveste.'
                : 'Sem gramas indicadas, a Carol estima a porção típica pela descrição do alimento (ex.: "1 fatia de fiambre") e pelas observações abaixo.'}
            </p>
            <AddButton
              onClick={handleAddItem}
              disabled={!itemName.trim()}
              variant="nutrition"
              type="button"
            >
              Adicionar Alimento
            </AddButton>
          </div>

          {manualItems.length > 0 && (
            <div className="space-y-1.5 mb-3">
              {manualItems.map(item => (
                <div key={item.key} className="flex items-center gap-2 bg-[var(--surface-faint)] border border-[var(--border-glass)] rounded-xl px-3 py-2">
                  {isEditing ? (
                    <>
                      <input
                        type="text"
                        aria-label={`Nome do alimento: ${item.name}`}
                        value={item.name}
                        onChange={e => { updateManualItem(item.key, { name: e.target.value }); setIsFormDirty(true); }}
                        className="flex-1 text-xs font-bold text-[var(--text-1)] outline-none bg-transparent"
                      />
                      <input
                        type="number" min="1"
                        aria-label={`Gramas de ${item.name}`}
                        value={item.grams}
                        onChange={e => { updateManualItem(item.key, { grams: e.target.value }); setIsFormDirty(true); }}
                        className="w-14 text-xs text-[var(--text-3)] text-right outline-none bg-transparent"
                      />
                      <span className="text-[11px] text-[var(--text-3)]">g</span>
                    </>
                  ) : (
                    <div className="flex-1">
                      <p className="text-xs font-bold text-[var(--text-1)] capitalize">{item.name}</p>
                      <p className="text-[11px] text-[var(--text-3)]">
                        {isKnownFood(item.name, pantryFoods)
                          ? `${item.grams != null ? `${item.grams}g · ` : ''}${knownFoodNote(item.name)}`
                          : (item.grams != null ? `${item.grams}g` : 'Porção estimada pela Carol')}
                      </p>
                    </div>
                  )}
                  <button
                    onClick={() => { handleRemoveManualItem(item.key); setIsFormDirty(true); }}
                    className="tap-44 text-[var(--text-3)] hover:text-[var(--danger)] shrink-0"
                    aria-label={`Remover ${item.name}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              {(!isEditing || needsReanalysis) && (
                <p className="text-[11px] text-[var(--text-3)] text-right px-1">Valores nutricionais calculados ao analisar</p>
              )}
            </div>
          )}
        </div>

        <div className="mb-5">
          <label htmlFor="mr-observacoes-opcional-ex-big-mac-bi" className="text-[11px] text-[var(--text-3)] mb-1.5 block px-1">Observações (opcional) — ex.: "Big Mac", "bife frito em azeite"</label>
          <textarea id="mr-observacoes-opcional-ex-big-mac-bi"
            rows="2"
            maxLength="500"
            placeholder="Detalhes que mudam os valores nutricionais..."
            value={notes}
            onChange={e => { setNotes(e.target.value); setIsFormDirty(true); }}
            className="w-full bg-[var(--surface-soft)] border border-[var(--border-glass)] rounded-xl px-3 py-2.5 text-[13px] text-[var(--text-1)] placeholder-[var(--text-muted)] outline-none focus:border-[var(--focus-ring)] resize-none shadow-sm transition"
          />
        </div>

        {isEditing && (() => {
          const editingMeal = (meals || []).find(m => m.id === mealIdToEdit);
          const notes = editingMeal?.coach_notes || editingMeal?.coach_analysis;
          const isDismissed = editingMeal?.id && (useAppStore.getState().dismissedInterventions[editingMeal.id] === notes || useAppStore.getState().dismissedInterventions[editingMeal.id] === 'dismissed');
          const hasIntervention = !isDismissed && notes && /adaptar o plano|falar com a coach|ajustarmos o teu plano|botão vermelho/i.test(notes);
          if (!hasIntervention) return null;
          return (
            <Button
              variant="module"
              moduleColor="var(--grad-coach-legible)"
              onClick={() => {
                useAppStore.getState().dismissIntervention(editingMeal.id, notes);
                useAppStore.setState({
                  coachIntent: {
                    kind: 'proactive_intervention',
                    recordType: 'meal',
                    recordId: editingMeal.id,
                    recordName: editingMeal.name || 'Refeição',
                    date: editingMeal.date,
                    reason: notes,
                  }
                });
                handleClose();
                useAppStore.getState().setActiveTab('coach');
              }}
              className="w-full text-white shadow-md border-transparent font-semibold text-xs py-3 mb-2"
            >
              <div className="flex items-center justify-center gap-2 w-full">
                <MessageSquare size={16} />
                <span>Falar com a Carol</span>
              </div>
            </Button>
          );
        })()}

        {errorMsg && <p role="alert" className="text-[13px] font-medium mt-3 text-center" style={{ color: 'var(--danger)' }}>{errorMsg}</p>}
        </div>
      </div>

      {/* Modal de confirmação de saída com alterações por gravar */}
      <UnsavedChangesModal
        isOpen={showUnsavedModal}
        isSaving={isAnalyzing}
        onSaveAndLeave={isEditing ? handleSaveEdit : handleAnalyze}
        onDiscardAndLeave={handleClose}
        onCancel={() => { pendingNavTarget.current = null; setShowUnsavedModal(false); }}
      />

      {confirmation && <RecordConfirmation label={confirmation.label} first={confirmation.first} onDone={confirmation.done} />}

      <ActionBar>{primaryAction}</ActionBar>
    </div>
  );
}
