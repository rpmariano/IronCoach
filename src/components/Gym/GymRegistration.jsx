import React, { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../../store';
import { supabase, invokeEdgeFunctionWithTimeout } from '../../lib/supabase';
import { compressImage } from '../../lib/image';
import { CoachAnalyzeButton } from '../shared/CoachButton';
import { Dumbbell, ImagePlus, Camera, PencilLine, Users, X, Plus, Trash2, Loader2 } from 'lucide-react';
import { useToast } from '../shared/ToastProvider';
import UnsavedChangesModal from '../shared/UnsavedChangesModal';
import Chip from '../shared/Chip';
import AddButton from '../shared/AddButton';

const GYM_KINDS = [
  { key: 'forca', label: 'Força', icon: Dumbbell },
  { key: 'aula', label: 'Aula', icon: Users }
];

const GYM_CATEGORIES = {
  forca: ['Peito', 'Costas', 'Pernas Superiores', 'Pernas Inferiores', 'Ombros', 'Biceps', 'Triceps', 'Glúteos', 'Full Body', 'Cardio', 'Levantamento Olímpico', 'Powerlifting', 'Calistenia', 'Outro'],
  aula:  ['HIIT', 'RPM/Cycling', 'Pilates', 'Yoga', 'Body Pump', 'Zumba', 'CrossFit', 'Treino Funcional', 'Natação', 'Outro'],
};
const GYM_CATEGORIES_VISIBLE = 6;
const MAX_PHOTOS = 6; // espelha MAX_PHOTOS em supabase/functions/analyze-gym

function todayISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function parseDurationInput(val) {
  val = val.trim().toLowerCase();
  if (!val) return null;
  if (val.endsWith('m')) return parseInt(val) * 60;
  const parts = val.split(':').map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (!isNaN(parts[0])) return parts[0] * 60;
  return null;
}

// Inverso de parseDurationInput, para pré-preencher o campo de texto ao
// editar uma sessão já gravada (duration_seconds vem sempre em segundos).
function formatDurationInput(totalSeconds) {
  if (!totalSeconds) return '';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Achata exercícios→séries em linhas prontas para workout_session_sets,
// espelhando flattenSets em supabase/functions/analyze-gym/index.ts — mesmas
// colunas (session_id, exercise_name, set_index, reps, weight).
function flattenExercises(exercises) {
  const rows = [];
  for (const ex of exercises) {
    const name = ex.name.trim();
    if (!name) continue;
    ex.sets.forEach((s, i) => {
      const reps = s.reps === '' || s.reps === null || s.reps === undefined ? null : parseInt(s.reps);
      const weight = s.weight === '' || s.weight === null || s.weight === undefined ? null : parseFloat(s.weight);
      if (reps === null && weight === null) return;
      rows.push({ exercise_name: name, set_index: i, reps, weight });
    });
  }
  return rows;
}

export default function GymRegistration({ onClose, sessionIdToEdit = null }) {
  const { profile, gymSessions, setGymSessions, loadInitialData, setNavGuard } = useAppStore();
  const { showToast } = useToast();
  const isEditing = !!sessionIdToEdit;

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
  const [kind, setKind] = useState('forca');
  const [categories, setCategories] = useState(planItem?.categories || []);
  const [categoriesExpanded, setCategoriesExpanded] = useState(false);
  const [customCategory, setCustomCategory] = useState('');
  const [name, setName] = useState('');
  const [notes, setNotes] = useState(planItem?.notes || '');
  // Um único cartão, forma de introdução à escolha — mesmo padrão da
  // Corrida/Nutrição/Corpo: só um dos dois blocos fica visível/clicável a
  // cada vez, e as duas formas passam pelo Coach. Vindo do plano, entra
  // direto em manual — os campos já estão preenchidos.
  const [entryMethod, setEntryMethod] = useState(planItem ? 'manual' : 'foto'); // 'foto' | 'manual'
  const [errorMsg, setErrorMsg] = useState('');

  // Limpa o item do plano do store assim que foi consumido para os estados
  // iniciais acima — nunca deve reaparecer numa próxima abertura "Novo Treino".
  useEffect(() => {
    if (completingPlanItemRef.current) useAppStore.getState().clearPlanItemPrefill();
  }, []);

  // Foto (IA)
  const [photos, setPhotos] = useState([]); // [{ dataUrl, base64 }]
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Manual — métricas do relógio; séries/repetições/carga só se gerem ao
  // editar uma sessão já criada (ver exercises abaixo) — não fazem parte do
  // registo inicial (nem por foto, nem manual), tal como sempre foi.
  const [durationStr, setDurationStr] = useState(planItem?.target_duration_min ? String(planItem.target_duration_min) : '');
  const [calories, setCalories] = useState('');
  const [avgHr, setAvgHr] = useState('');
  const [maxHr, setMaxHr] = useState('');
  const [exertion, setExertion] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Edição — exercícios/séries só se gerem aqui (a sessão já existe). Séries,
  // métricas, categorias, tipo e observações são dados ANALÍTICOS: mudá-los
  // muda a análise, por isso guardar passa pelo Coach e regenera-a. Mudar só
  // a data ou o nome é um update direto, sem custo de API (mesmo padrão da
  // Nutrição — ver MealRegistration.jsx e PRD 3.2/3.3).
  const [exercises, setExercises] = useState([]); // [{ key, name, sets: [{key, reps, weight}] }]
  const [originalSnapshot, setOriginalSnapshot] = useState(null);
  const [isFormDirty, setIsFormDirty] = useState(false);
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
    const target = pendingNavTarget.current;
    pendingNavTarget.current = null;
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

  // Assinatura do que é analítico, para comparar o antes com o agora. Recebe
  // os valores em vez de os ler do estado, para poder ser calculada também a
  // partir da sessão em bruto no momento do carregamento (quando o estado
  // ainda não foi atualizado).
  const analyticalSignature = (v) => JSON.stringify({
    kind: v.kind,
    categories: [...(v.categories || [])].sort(),
    notes: (v.notes || '').trim(),
    duration: v.duration ?? null,
    calories: v.calories === '' || v.calories == null ? null : Number(v.calories),
    avgHr: v.avgHr === '' || v.avgHr == null ? null : Number(v.avgHr),
    maxHr: v.maxHr === '' || v.maxHr == null ? null : Number(v.maxHr),
    exertion: v.exertion === '' || v.exertion == null ? null : Number(v.exertion),
    sets: v.sets,
  });

  const currentSignature = () => analyticalSignature({
    kind, categories, notes,
    duration: parseDurationInput(durationStr),
    calories, avgHr, maxHr, exertion,
    sets: flattenExercises(exercises),
  });

  useEffect(() => {
    if (!sessionIdToEdit) return;
    const session = gymSessions.find(s => s.id === sessionIdToEdit);
    if (!session) return;
    setDate(session.date || todayISO());
    setKind(session.kind === 'aula' ? 'aula' : 'forca');
    setName(session.name || '');
    setCategories(session.categories || []);
    setNotes(session.notes || '');
    setDurationStr(session.duration_seconds ? formatDurationInput(session.duration_seconds) : '');
    setCalories(session.calories_kcal ?? '');
    setAvgHr(session.avg_hr ?? '');
    setMaxHr(session.max_hr ?? '');
    setExertion(session.exertion ?? '');

    const grouped = new Map();
    for (const s of session.workout_session_sets || []) {
      const key = s.exercise_name || 'Exercício';
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(s);
    }
    const loadedExercises = Array.from(grouped.entries()).map(([exName, sets], i) => ({
      key: `${Date.now()}-${i}`,
      name: exName,
      sets: sets
        .sort((a, b) => (a.set_index ?? 0) - (b.set_index ?? 0))
        .map((s, j) => ({ key: s.id || `${Date.now()}-${i}-${j}`, reps: s.reps ?? '', weight: s.weight ?? '' })),
    }));
    setExercises(loadedExercises);
    setOriginalSnapshot(analyticalSignature({
      kind: session.kind === 'aula' ? 'aula' : 'forca',
      categories: session.categories || [],
      notes: session.notes || '',
      duration: session.duration_seconds ?? null,
      calories: session.calories_kcal,
      avgHr: session.avg_hr,
      maxHr: session.max_hr,
      exertion: session.exertion,
      sets: flattenExercises(loadedExercises),
    }));
    setEntryMethod('manual');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionIdToEdit]);

  // Só regenera a análise se os dados analíticos mudaram; mudar apenas a data
  // ou o nome não justifica uma chamada ao Gemini.
  const needsReanalysis = isEditing
    && originalSnapshot !== null
    && currentSignature() !== originalSnapshot;

  const handleToggleCategory = (cat) => {
    if (categories.includes(cat)) {
      setCategories(categories.filter(c => c !== cat));
    } else {
      setCategories([...categories, cat]);
    }
  };

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

  const handleKindChange = (newKind) => {
    setKind(newKind);
    setCategories([]);
    setCategoriesExpanded(false);
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
      } catch (err) {
        console.warn('Falha a processar imagem', err);
      }
    }
  };

  const removePhoto = (idx) => setPhotos(prev => prev.filter((_, i) => i !== idx));

  // ----------------------------------
  // ANALISAR TREINO POR FOTO (IA — analyze-gym)
  // ----------------------------------
  const handleAnalyzePhotos = async () => {
    if (!photos.length || isAnalyzing) return;
    setIsAnalyzing(true);
    setErrorMsg('');
    try {
      const { data, error } = await invokeEdgeFunctionWithTimeout('analyze-gym', {
        body: {
          images: photos.map(p => p.base64),
          mime_type: 'image/jpeg',
          date,
          kind,
          name: name.trim() || null,
          categories,
          notes: notes.trim() || null,
        },
      });
      if (error) throw new Error(error);
      if (data?.error) throw new Error(data.error);

      setGymSessions([data.session, ...gymSessions]);
      showToast('Treino registado');
      handleClose();
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || 'Falha na análise. Tenta novamente.');
    } finally {
      setIsAnalyzing(false);
    }
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
          notes: notes.trim() || null,
          duration_seconds: parseDurationInput(durationStr),
          calories_kcal: calories ? parseInt(calories) : null,
          avg_hr: avgHr ? parseInt(avgHr) : null,
          max_hr: maxHr ? parseInt(maxHr) : null,
          exertion: exertion ? parseInt(exertion) : null,
        },
      });
      if (error) throw new Error(error);
      if (data?.error) throw new Error(data.error);

      setGymSessions([data.session, ...gymSessions]);

      // Se esta sessão vem do plano, marca o item como concluído — a data
      // usada é a do formulário, que pode ter sido alterada face ao
      // planned_date (ver specs/plano-de-treino.md §4-§5.2).
      if (completingPlanItemRef.current) {
        await useAppStore.getState().completePlanItem(completingPlanItemRef.current.id, {
          actualDate: date,
          sessionId: data.session.id,
        });
      }

      showToast('Treino registado');
      handleClose();
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
      const finalName = name.trim() || (categories.length ? categories.join(' e ') : (kind === 'aula' ? 'Aula' : 'Treino'));

      if (needsReanalysis) {
        const { data, error } = await invokeEdgeFunctionWithTimeout('analyze-gym', {
          body: {
            mode: 'manual',
            session_id: sessionIdToEdit,
            date,
            kind,
            name: finalName,
            categories,
            notes: notes.trim() || null,
            duration_seconds: parseDurationInput(durationStr),
            calories_kcal: calories ? parseInt(calories) : null,
            avg_hr: avgHr ? parseInt(avgHr) : null,
            max_hr: maxHr ? parseInt(maxHr) : null,
            exertion: exertion ? parseInt(exertion) : null,
            sets: flattenExercises(exercises),
          },
        });
        if (error) throw new Error(error);
        if (data?.error) throw new Error(data.error);
      } else {
        const { error: sessionError } = await supabase
          .from('workout_sessions')
          .update({ date, name: finalName })
          .eq('id', sessionIdToEdit);
        if (sessionError) throw sessionError;
      }

      if (profile?.id) await loadInitialData(profile.id);
      showToast(needsReanalysis ? 'Treino reanalisado pelo Coach' : 'Treino atualizado');
      handleClose();
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || 'Falha a guardar alterações. Tenta novamente.');
    } finally {
      setIsSaving(false);
    }
  };

  // Gestão local de exercícios/séries (só usada em edição)
  const handleAddExercise = () => {
    setExercises(prev => [...prev, { key: `${Date.now()}-${prev.length}`, name: '', sets: [{ key: `${Date.now()}-0`, reps: '', weight: '' }] }]);
  };
  const removeExercise = (exKey) => setExercises(prev => prev.filter(e => e.key !== exKey));
  const updateExercise = (exKey, patch) => setExercises(prev => prev.map(e => (e.key === exKey ? { ...e, ...patch } : e)));
  const addSet = (exKey) => setExercises(prev => prev.map(e => (e.key === exKey ? { ...e, sets: [...e.sets, { key: `${Date.now()}-${e.sets.length}`, reps: '', weight: '' }] } : e)));
  const removeSet = (exKey, setKey) => setExercises(prev => prev.map(e => (e.key === exKey ? { ...e, sets: e.sets.filter(s => s.key !== setKey) } : e)));
  const updateSet = (exKey, setKey, patch) => setExercises(prev => prev.map(e => (e.key === exKey ? { ...e, sets: e.sets.map(s => (s.key === setKey ? { ...s, ...patch } : s)) } : e)));

  const availableCategories = GYM_CATEGORIES[kind] || GYM_CATEGORIES.forca;
  const visibleCategories = categoriesExpanded
    ? availableCategories
    : availableCategories.filter((c, i) => i < GYM_CATEGORIES_VISIBLE || categories.includes(c));
  const hiddenCount = availableCategories.length - visibleCategories.length;

  return (
    <div className="space-y-4 fade-in">
      <div
        className="rounded-2xl p-4"
        style={{
          background: 'radial-gradient(130% 150% at 100% 0%, color-mix(in srgb, var(--mod-ginasio-to) 10%, transparent) 0%, transparent 60%), linear-gradient(165deg, #ffffff, #f8fafc)',
          borderStyle: 'solid',
          borderWidth: '1px 1px 1px 3px',
          borderColor: '#e2e8f0 #e2e8f0 #e2e8f0 color-mix(in srgb, var(--mod-ginasio-to) 70%, #e2e8f0)'
        }}
      >
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <Dumbbell className="w-5 h-5" style={{ color: 'var(--mod-ginasio-to)' }} />
            <h2 className="text-[15px] font-bold text-slate-800">{isEditing ? 'Editar Treino' : 'Novo Treino'}</h2>
          </div>
          <button
            onClick={() => { if (isFormDirty) setShowUnsavedModal(true); else handleClose(); }}
            type="button"
            className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors shrink-0"
            title="Fechar"
            aria-label="Fechar"
          >
            <X size={16} />
          </button>
        </div>

        <label className="text-[11px] text-slate-500 mb-1.5 block">Tipo de sessão</label>
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
                onClick={() => handleKindChange(k.key)}
                className="flex-1 py-2.5 gap-1.5"
                type="button"
              >
                <Icon size={14} /> {k.label}
              </Chip>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-2 mb-4">
          <input
            type="date"
            value={date}
            max={todayISO()}
            onChange={e => setDate(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 outline-none focus:border-[var(--mod-ginasio-to)]"
          />
          <div className="flex items-center justify-center text-[11px] text-slate-500">Data do treino</div>
        </div>

        <div className="mb-4">
          <label className="text-[11px] text-slate-500 mb-1.5 block">
            Nome da sessão (opcional) — ex.: "{kind === 'aula' ? 'Aula de HIIT' : 'Peito e Tríceps'}"
          </label>
          <input
            type="text"
            maxLength={80}
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Nome do treino"
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-[var(--mod-ginasio-to)]"
          />
        </div>

        <div className="mb-4">
          <label className="text-[11px] text-slate-500 mb-1.5 block">
            {kind === 'aula' ? 'Tipo de aula' : 'Grupos musculares'} — podes escolher vários
          </label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {visibleCategories.map(c => (
              <Chip
                key={c}
                active={categories.includes(c)}
                variant="gym"
                onClick={() => handleToggleCategory(c)}
                type="button"
              >
                {c}
              </Chip>
            ))}

            {hiddenCount > 0 && !categoriesExpanded && (
              <button
                onClick={() => setCategoriesExpanded(true)}
                type="button"
                className="rounded-full px-3.5 py-1.5 text-[11px] font-medium border border-dashed border-slate-300 text-slate-500"
              >
                +{hiddenCount} mais
              </button>
            )}
            {categoriesExpanded && availableCategories.length > GYM_CATEGORIES_VISIBLE && (
              <button
                onClick={() => setCategoriesExpanded(false)}
                type="button"
                className="rounded-full px-3.5 py-1.5 text-[11px] font-medium border border-dashed border-slate-300 text-slate-500"
              >
                Mostrar menos
              </button>
            )}

            {/* Custom categories not in the main list */}
            {categories.filter(c => !availableCategories.includes(c)).map(c => (
              <Chip
                key={c}
                active={true}
                variant="gym"
                onClick={() => handleToggleCategory(c)}
                type="button"
              >
                {c}
              </Chip>
            ))}
          </div>
        </div>

        {/* Como queres registar? — escondido a editar: editar é sempre pelos
            campos, sem foto nova (mesmo padrão da Corrida/Refeição). */}
        {!isEditing && (
          <div className="mb-4">
            <label className="text-[11px] text-slate-500 mb-1.5 block">Como queres registar?</label>
            <div className="flex gap-1.5">
              <Chip
                active={entryMethod === 'foto'}
                variant="gym"
                rounded="xl"
                onClick={() => setEntryMethod('foto')}
                className="flex-1 py-2.5 gap-1.5"
                type="button"
              >
                <Camera size={14} /> Foto (IA)
              </Chip>
              <Chip
                active={entryMethod === 'manual'}
                variant="gym"
                rounded="xl"
                onClick={() => setEntryMethod('manual')}
                className="flex-1 py-2.5 gap-1.5"
                type="button"
              >
                <PencilLine size={14} /> Manual
              </Chip>
            </div>
          </div>
        )}

        {entryMethod === 'foto' ? (
          <>
            {photos.length > 0 ? (
              <>
                <div className="grid grid-cols-3 gap-2 mb-2">
                  {photos.map((p, i) => (
                    <div key={i} className="relative aspect-square">
                      <img src={p.dataUrl} className="w-full h-full object-cover rounded-xl border border-slate-200" alt={`Print ${i+1}`} />
                      <button
                        onClick={() => removePhoto(i)}
                        aria-label={`Remover print ${i + 1}`}
                        className="tap-44 absolute -top-1.5 -right-1.5 text-slate-500 hover:text-red-500 transition"
                      >
                        <span className="bg-white/90 border border-slate-200 rounded-full p-1 shadow-sm flex items-center justify-center">
                          <X size={14} />
                        </span>
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[11px] text-slate-500">{photos.length} foto(s) · máx {MAX_PHOTOS}</span>
                </div>
                {photos.length < MAX_PHOTOS && (
                  <label className="flex items-center justify-center gap-2 border-2 border-dashed border-[var(--mod-ginasio-to)]/40 rounded-xl py-3 text-center cursor-pointer hover:bg-[var(--mod-ginasio-to)]/5 transition mb-4">
                    <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoSelect} />
                    <ImagePlus className="w-4 h-4" style={{ color: 'var(--mod-ginasio-to)' }} />
                    <span className="text-[12px] font-bold" style={{ color: 'var(--mod-ginasio-to)' }}>Adicionar outro print</span>
                  </label>
                )}
              </>
            ) : (
              <label className="block border-2 border-dashed border-slate-300 rounded-xl py-6 text-center cursor-pointer hover:border-slate-400 transition mb-4 bg-white/50">
                <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoSelect} />
                <ImagePlus className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                <p className="text-xs text-slate-600 font-semibold">Escolhe os prints da app de treino (Hevy, Strong...)</p>
                <p className="text-[10px] text-slate-500 mt-1 px-4">Podes juntar vários ecrãs da mesma sessão — a IA lê exercícios, séries e cargas automaticamente</p>
              </label>
            )}
          </>
        ) : (
          <>
            <label className="text-[11px] text-slate-500 mb-1.5 block font-semibold">Métricas do relógio (opcional)</label>
            <div className="grid grid-cols-2 gap-2.5 mb-4">
              <div>
                <label className="text-[11px] font-semibold text-slate-500 block mb-1">Duração (ex.: 43m)</label>
                <input
                  type="text"
                  inputMode="text"
                  value={durationStr}
                  onChange={e => { setDurationStr(e.target.value); setIsFormDirty(true); }}
                  placeholder="Ex: 45m"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none focus:border-[var(--mod-ginasio-to)] transition"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-500 block mb-1">Calorias (kcal)</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={calories}
                  onChange={e => { setCalories(e.target.value); setIsFormDirty(true); }}
                  placeholder="Ex: 350"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none focus:border-[var(--mod-ginasio-to)] transition"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-500 block mb-1">FC média (bpm)</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={avgHr}
                  onChange={e => { setAvgHr(e.target.value); setIsFormDirty(true); }}
                  placeholder="Ex: 135"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none focus:border-[var(--mod-ginasio-to)] transition"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-500 block mb-1">FC máxima (bpm)</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={maxHr}
                  onChange={e => { setMaxHr(e.target.value); setIsFormDirty(true); }}
                  placeholder="Ex: 168"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none focus:border-[var(--mod-ginasio-to)] transition"
                />
              </div>
            </div>
            
            <div className="mb-4">
              <label className="text-[12px] text-slate-500 mb-1.5 block">Nível de esforço (RPE, opcional)</label>
              <div className="flex gap-1.5">
                {Array.from({ length: 10 }).map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => { setExertion(exertion == i + 1 ? 0 : i + 1); setIsFormDirty(true); }}
                    style={exertion == i + 1 ? { color: '#fff' } : undefined}
                    className={`flex-1 aspect-square rounded-lg flex items-center justify-center text-[13px] font-bold transition-colors border shadow-sm ${exertion == i + 1 ? 'bg-[var(--mod-ginasio-to)] border-[var(--mod-ginasio-to)]' : 'bg-white border-slate-200 text-slate-400'}`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-slate-400 mt-1.5">1 = Muito leve · 10 = Máximo. Só preenche se sentires que ajuda a explicar como correu.</p>
            </div>
            {isEditing ? (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] text-slate-500">Exercícios e séries</label>
                  <AddButton
                    onClick={handleAddExercise}
                    type="button"
                    variant="gym"
                  >
                    Adicionar exercício
                  </AddButton>
                </div>
                {exercises.length === 0 ? (
                  <p className="text-[11px] text-slate-400">Sem exercícios ainda.</p>
                ) : (
                  <div className="space-y-2">
                    {exercises.map(ex => (
                      <div key={ex.key} className="bg-white border border-slate-200 rounded-xl p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <input
                            type="text"
                            value={ex.name}
                            onChange={e => updateExercise(ex.key, { name: e.target.value })}
                            placeholder="Nome do exercício"
                            className="flex-1 text-xs font-bold text-slate-800 outline-none bg-transparent border-b border-slate-200 focus:border-slate-400 pb-1"
                          />
                          <button onClick={() => removeExercise(ex.key)} type="button" className="text-slate-400 hover:text-red-500 shrink-0">
                            <Trash2 size={14} />
                          </button>
                        </div>
                        <div className="space-y-1.5">
                          {ex.sets.map((s, idx) => (
                            <div key={s.key} className="flex items-center gap-2">
                              <span className="text-[10px] text-slate-400 w-14 shrink-0">Série {idx + 1}</span>
                              <input
                                type="number"
                                value={s.reps}
                                onChange={e => updateSet(ex.key, s.key, { reps: e.target.value })}
                                placeholder="Reps"
                                className="w-16 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800 outline-none focus:border-[var(--mod-ginasio-to)]"
                              />
                              <input
                                type="number"
                                step="0.5"
                                value={s.weight}
                                onChange={e => updateSet(ex.key, s.key, { weight: e.target.value })}
                                placeholder="kg"
                                className="w-16 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800 outline-none focus:border-[var(--mod-ginasio-to)]"
                              />
                              <button onClick={() => removeSet(ex.key, s.key)} type="button" className="text-slate-400 hover:text-red-500 shrink-0">
                                <X size={13} />
                              </button>
                            </div>
                          ))}
                          <AddButton
                            onClick={() => addSet(ex.key)}
                            type="button"
                            variant="gym"
                          >
                            Série
                          </AddButton>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[10px] text-slate-500 -mt-2 mb-4">Séries/repetições/carga adicionam-se ao editar o treino.</p>
            )}
          </>
        )}

        <div className="mb-4">
          <label className="text-[11px] text-slate-500 mb-1.5 block">
            Observações (opcional) — ex.: "{kind === 'aula' ? 'aula puxada, professor novo' : 'treino de força, peso corporal'}"
          </label>
          <textarea
            rows={2}
            maxLength={500}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Contexto do treino..."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-[var(--mod-ginasio-to)] resize-none"
          />
        </div>

        {/* Ação — mesmo botão do Coach nos dois caminhos de criação: a foto e
            o registo manual acabam ambos analisados por ele. A editar, o
            botão só leva o gradiente do Coach quando os dados analíticos
            mudaram (séries, métricas, categorias, tipo ou observações);
            mudar só a data ou o nome é update direto. */}
        {isEditing ? (
          <CoachAnalyzeButton
            onClick={handleSaveEdit}
            disabled={isSaving}
            busy={isSaving}
            label={needsReanalysis ? "Guardar e Reanalisar" : "Guardar Alterações"}
          />
        ) : entryMethod === 'foto' ? (
          <CoachAnalyzeButton
            onClick={handleAnalyzePhotos}
            disabled={!photos.length || isAnalyzing}
            busy={isAnalyzing}
            label="Analisar Treino"
          />
        ) : (
          <CoachAnalyzeButton
            onClick={handleSaveManual}
            disabled={isSaving}
            busy={isSaving}
            label="Analisar Treino"
          />
        )}

        {errorMsg && <p className="text-red-500 text-[13px] font-medium mt-3 text-center">{errorMsg}</p>}
      </div>

      {/* Modal de confirmação de saída com alterações por gravar */}
      <UnsavedChangesModal
        isOpen={showUnsavedModal}
        isSaving={isSaving}
        onSaveAndLeave={isEditing ? handleSaveEdit : handleSaveManual}
        onDiscardAndLeave={handleClose}
        onCancel={() => { pendingNavTarget.current = null; setShowUnsavedModal(false); }}
      />
    </div>
  );
}
