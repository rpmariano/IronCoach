import React, { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../../store';
import { supabase, invokeEdgeFunctionWithTimeout } from '../../lib/supabase';
import { ANALYZE_TIMEOUT_MS } from '../../lib/edgeTimeouts';
import { compressImage } from '../../lib/image';
import { CoachAnalyzeButton } from '../shared/CoachButton';
import { AnalysisSkeleton, AnalysisFailure } from '../shared/AnalysisState';
import useAnalysis from '../../utils/useAnalysis';
import { ScanLine } from 'lucide-react';
import { firstRecordMoment } from '../../utils/firstRecord';
import { bodyGoalMoment } from '../../utils/bodyGoal';
import Chip from '../shared/Chip';
import { todayISO } from '../../lib/utils';
import { usePersistedFormDraft, restorePersistedFormDraft, clearPersistedFormDraft } from '../../utils/formDraftPersistence';
import { normalizeStartTime, startTimeInputValue } from '../../utils/startTime';
import { usePersistedDraftMedia } from '../../utils/draftMediaPersistence';
import { ecraPrincipal } from '../../../supabase/functions/_shared/sourceApps.ts';
import CarolInterventionActions from '../shared/CarolInterventionActions';
import RegistrationShell from '../shared/registration/RegistrationShell';
import useRegistrationExit from '../shared/registration/useRegistrationExit';
import PhotoReadSection from '../shared/registration/PhotoReadSection';

const BODY_METRICS = [
  { key:'weight_kg',            label:'Peso',              unit:'kg',   dec:1, color:'#dd3c71' },
  { key:'bmi',                  label:'IMC',               unit:'',     dec:1, color:'#da2fd7' },
  { key:'body_fat_pct',         label:'Gordura corporal',  unit:'%',    dec:1, color:'#dd3c94' },
  { key:'skeletal_muscle_pct',  label:'Músculo esquelético', unit:'%',  dec:1, color:'#468f19' },
  { key:'muscle_mass_kg',       label:'Massa muscular',    unit:'kg',   dec:1, color:'#2c931a' },
  { key:'body_water_pct',       label:'Água corporal',     unit:'%',    dec:1, color:'#2b82da' },
  { key:'protein_pct',          label:'Proteína',          unit:'%',    dec:1, color:'#5f8b18' },
  { key:'bone_mass_kg',         label:'Massa óssea',       unit:'kg',   dec:1, color:'#643cdd' },
  { key:'bmr_kcal',             label:'Metabolismo basal', unit:'kcal', dec:0, color:'#768618' },
  { key:'visceral_fat',         label:'Gordura visceral',  unit:'',     dec:0, color:'#bc3cdd' },
  { key:'subcutaneous_fat_pct', label:'Gordura subcutânea', unit:'%',   dec:1, color:'#1a9324' },
  { key:'metabolic_age',        label:'Idade metabólica',  unit:'anos', dec:0, color:'#1a9340' },
  { key:'lean_body_mass_kg',    label:'Massa magra',       unit:'kg',   dec:1, color:'#198f89' },
];

const MAX_PHOTOS = 6; // espelha MAX_PHOTOS em supabase/functions/analyze-body
const ACCENT = 'var(--mod-corpo-to)';

// Segmentos "Em jejum" / "Não em jejum" (bug #60): escrevem uma frase fixa no
// início das observações — é por aí que a analyze-body já sabe do jejum
// (weighingConditions lê as observações), sem coluna nova. O estado dos
// segmentos lê-se das observações, por isso editar o texto à mão não os
// desalinha.
const FASTED_NOTE = 'Em jejum.';
const NOT_FASTED_NOTE = 'Não estava em jejum.';

function fastingFromNotes(notes) {
  const t = (notes || '').trimStart();
  if (t.startsWith(NOT_FASTED_NOTE)) return 'no';
  if (t.startsWith(FASTED_NOTE)) return 'yes';
  return null;
}

function withFasting(notes, choice) {
  const rest = (notes || '').trimStart().replace(NOT_FASTED_NOTE, '').replace(FASTED_NOTE, '').trimStart();
  const phrase = choice === 'yes' ? FASTED_NOTE : choice === 'no' ? NOT_FASTED_NOTE : '';
  return phrase ? (rest ? `${phrase} ${rest}` : phrase) : rest;
}

const isBlank = (v) => v === undefined || v === '' || v === null;

/** Os valores do formulário como a analyze-body os recebe (só os escritos). */
function payloadMetricsOf(metrics) {
  const out = {};
  for (const m of BODY_METRICS) {
    if (!isBlank(metrics?.[m.key])) out[m.key] = parseFloat(metrics[m.key]);
  }
  return out;
}

/** O lido nos prints entra só nos campos vazios — o que ele escreveu ganha. */
export function mergeBodyPreview(metrics, previewMetrics) {
  const next = { ...metrics };
  let filled = 0;
  let kept = 0;
  for (const m of BODY_METRICS) {
    const v = previewMetrics?.[m.key];
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    if (isBlank(metrics?.[m.key])) { next[m.key] = String(v); filled += 1; }
    else if (Number(metrics[m.key]) !== v) kept += 1;
  }
  return { metrics: next, filled, kept };
}

/** A frase depois de ler os prints. */
export function bodyReadNote({ filled, kept }) {
  if (filled > 0) {
    const what = filled === 1 ? 'Li 1 valor' : `Li ${filled} valores`;
    const keep = kept > 0 ? ` Os ${kept === 1 ? '1 que' : `${kept} que`} já tinhas escrito ficaram.` : '';
    return { text: `${what}. Revê-os e carrega em "Analisar avaliação".${keep}`, tone: 'ok' };
  }
  if (kept > 0) return { text: 'Já tinhas escrito esses valores — ficaram os teus.', tone: 'ok' };
  return { text: 'Não consegui ler valores nestes prints. Confirma que são da Renpho Health e estão nítidos, ou escreve-os abaixo.', tone: 'warn' };
}

/* O registo do Corpo — o primeiro no formulário único (registo unificado,
   specs/plano-registo-plano-coach.md §1, decisões 2, 6 e 12). Já não há
   "Foto | Manual": os prints são opcionais e os campos estão sempre à vista.
   · "Ler os prints e preencher" (analyze-body, mode "preview") enche os
     campos vazios SEM gravar; o atleta revê.
   · "Analisar avaliação" grava: com prints já lidos e os mesmos, não se
     volta a ler (reviewed); com prints por ler, a Carol lê-os e o que ele
     escreveu ganha; sem prints, é o registo pelos valores (mode "manual").
   A moldura (cabeçalho, saída, confirmação, ActionBar) é o RegistrationShell. */
export default function BodyRegistration({ onClose, assessmentIdToEdit = null }) {
  const { bodyAssessments, setBodyAssessments, profile, loadInitialData, setNavGuard } = useAppStore();

  const isEditing = !!assessmentIdToEdit;

  // Identifica este rascunho de forma única para sobreviver a um
  // recarregamento (ver formDraftPersistence.js) — nunca partilhado entre
  // avaliações diferentes nem entre uma edição e uma criação nova a seguir.
  const draftStorageKey = assessmentIdToEdit ? `ironcoach:avaliacao-rascunho:${assessmentIdToEdit}` : 'ironcoach:avaliacao-rascunho:nova';
  // Só tenta restaurar UMA VEZ por sessão de edição/criação.
  const restoredForKeyRef = useRef(null);

  const [date, setDate] = useState(todayISO());
  /* Hora da avaliação ('HH:MM', hora local; body_assessments.assessment_time)
     — a hora a que a pesagem foi feita, sem valor por omissão e obrigatória
     (2026-10-01): a Carol precisa dela para ler a pesagem. */
  const [assessmentTime, setAssessmentTime] = useState('');
  const [notes, setNotes] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const [photos, setPhotos] = useState([]); // [{ dataUrl, base64 }]
  // A espera e a falha da análise com prints (src/utils/useAnalysis.js).
  const analysis = useAnalysis();
  const isAnalyzing = analysis.isAnalyzing;
  /* "Ler os prints": `readState` guarda quantos prints havia quando a leitura
     correu e as etiquetas que a Renpho dava. Se ao gravar os prints são os
     mesmos, o servidor não volta a lê-los (reviewed). */
  const [reading, setReading] = useState(false);
  const [readNote, setReadNote] = useState(null);
  const [readState, setReadState] = useState(null); // { count, classifications } | null

  const [metrics, setMetrics] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  // Edição — métricas, observações e data são dados ANALÍTICOS: mudá-los muda
  // o resumo da Carol e obriga a regenerá-lo (ver analyticalSignature). Só a
  // hora é update direto, sem custo de API (ver PRD 3.2).
  const [originalSnapshot, setOriginalSnapshot] = useState(null);
  const [isFormDirty, setIsFormDirty] = useState(false);
  const [confirmation, setConfirmation] = useState(null);

  const exit = useRegistrationExit({ isDirty: isFormDirty, onClose, draftKey: draftStorageKey });

  /* Ao gravar, o check do "Registo confirmado" corre PRIMEIRO e só depois o
     ecrã fecha e leva ao Calendário no dia da avaliação. Se isto veio de
     "Gravar e sair" a caminho de outro separador, respeita esse destino —
     por isso a saída pendente é lida ANTES de exit.close() a consumir. */
  const finishCreateAndGoToCalendar = (createdRecord, label = 'Avaliação registada') => {
    const hadPendingNav = exit.hasPendingNav();
    /* A analyze-body pode ter mexido no perfil (o peso de uma pesagem recente,
       a intervenção a propor objetivos): relê-se sem await — é a confirmação
       que manda no tempo. */
    useAppStore.getState().refreshProfile?.();
    const st = useAppStore.getState();
    // O primeiro registo deste tipo, ou a avaliação que atravessa uma meta.
    const first = !isEditing && (firstRecordMoment('body', st, createdRecord)
      || bodyGoalMoment(createdRecord, st.bodyAssessments, st.profile));
    // Gravado: o rascunho apaga-se JÁ (revisão pré-deploy de 5ce5f31).
    clearPersistedFormDraft(draftStorageKey);
    setConfirmation({ label, first, done: () => {
      exit.close();
      if (!hadPendingNav) {
        setNavGuard(null);
        if (createdRecord) {
          useAppStore.getState().setNewlyCreatedRecord({ type: 'body', record: createdRecord });
        }
        useAppStore.getState().setPendingCalendarDate(date);
        useAppStore.getState().setActiveTab('calendario');
      }
    } });
  };

  // O que a Carol lê: métricas, observações e a data (a analyze-body compara
  // com o histórico ATÉ essa data). A hora não força reanálise.
  const originalDateRef = useRef(null);
  const analyticalSignature = (dateValue, notesValue, metricsValue) => JSON.stringify({
    date: dateValue,
    notes: (notesValue || '').trim(),
    metrics: BODY_METRICS.reduce((acc, m) => {
      const raw = metricsValue?.[m.key];
      acc[m.key] = isBlank(raw) ? null : Number(raw);
      return acc;
    }, {}),
  });

  useEffect(() => {
    if (!assessmentIdToEdit) return;
    const a = bodyAssessments.find(x => x.id === assessmentIdToEdit);
    if (!a) return;
    const alreadyRestored = restoredForKeyRef.current === draftStorageKey;
    const persisted = alreadyRestored ? null : restorePersistedFormDraft(draftStorageKey);
    restoredForKeyRef.current = draftStorageKey;

    const canonicalMetrics = {};
    for (const m of BODY_METRICS) {
      if (a[m.key] !== null && a[m.key] !== undefined) canonicalMetrics[m.key] = String(a[m.key]);
    }
    setDate(persisted?.date ?? (a.date || todayISO()));
    // A BD devolve 'HH:MM:SS'; o input só fala 'HH:MM' (ver startTime.js).
    setAssessmentTime(persisted?.assessmentTime ?? startTimeInputValue(a.assessment_time));
    setNotes(persisted?.notes ?? (a.notes || ''));
    setMetrics(persisted?.metrics ?? canonicalMetrics);
    // A assinatura de partida compara sempre contra o valor CANÓNICO (do
    // servidor), nunca contra o rascunho restaurado.
    setOriginalSnapshot(analyticalSignature(a.date, a.notes, canonicalMetrics));
    originalDateRef.current = a.date;
    if (persisted) setIsFormDirty(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessmentIdToEdit]);

  // Restaura um rascunho de avaliação NOVA por gravar — uma vez por sessão.
  useEffect(() => {
    if (assessmentIdToEdit) return;
    if (restoredForKeyRef.current === draftStorageKey) return;
    restoredForKeyRef.current = draftStorageKey;
    const persisted = restorePersistedFormDraft(draftStorageKey);
    if (!persisted) return;
    if (persisted.date) setDate(persisted.date);
    if (persisted.assessmentTime !== undefined) setAssessmentTime(persisted.assessmentTime);
    if (persisted.notes !== undefined) setNotes(persisted.notes);
    if (persisted.metrics) setMetrics(persisted.metrics);
    if (persisted.readState) setReadState(persisted.readState);
    setIsFormDirty(true);
  }, [assessmentIdToEdit, draftStorageKey]);

  // O rascunho (com debounce) enquanto houver alterações por gravar; as fotos
  // à parte, em IndexedDB (draftMediaPersistence.js). Com a confirmação à
  // vista o registo está gravado: não volta a guardar-se.
  usePersistedFormDraft(draftStorageKey, { date, assessmentTime, notes, metrics, readState }, { isDirty: isFormDirty && !confirmation });
  usePersistedDraftMedia(assessmentIdToEdit ? null : draftStorageKey, 'photos', photos, (v) => { setPhotos(v); setIsFormDirty(true); });

  // A hora é obrigatória: sem ela a Carol não sabe em que condições foi a pesagem.
  const requireAssessmentTime = () => {
    if (normalizeStartTime(assessmentTime)) return false;
    setErrorMsg('Indica a hora da avaliação — a Carol precisa dela para ler a pesagem.');
    return true;
  };

  /* A hora grava-se por update à parte, como a da corrida e a da refeição:
     quem insere a linha é a analyze-body. Falhar aqui não desfaz a avaliação. */
  const persistAssessmentTime = async (assessment) => {
    if (!assessment?.id) return assessment;
    const value = normalizeStartTime(assessmentTime);
    if (value === normalizeStartTime(assessment.assessment_time)) return assessment;
    try {
      const { error } = await supabase.from('body_assessments').update({ assessment_time: value }).eq('id', assessment.id);
      if (error) throw error;
      return { ...assessment, assessment_time: value };
    } catch (err) {
      console.warn('Hora da avaliação não gravada', err);
      return assessment;
    }
  };

  const hasAnyMetric = BODY_METRICS.some(m => !isBlank(metrics?.[m.key]));
  const onlyDateChanged = analyticalSignature(originalDateRef.current, notes, metrics) === originalSnapshot;
  const needsReanalysis = isEditing
    && originalSnapshot !== null
    && analyticalSignature(date, notes, metrics) !== originalSnapshot
    && !(onlyDateChanged && !hasAnyMetric);
  // Bug #49: o registo pelos valores e a edição que reanalisa também esperam
  // pela Carol — o mesmo ecrã de espera da leitura dos prints.
  const savingWithCarol = isSaving && (!isEditing || needsReanalysis);
  const showAnalysis = isAnalyzing || savingWithCarol;

  const handleMetricChange = (key, value) => {
    setIsFormDirty(true);
    setMetrics(prev => ({ ...prev, [key]: value }));
  };

  // ── Guardar alterações (edição) ─────────────────────────────────────
  //   • Métricas, observações ou data mudaram → analyze-body em mode manual
  //     com assessment_id, que regenera o resumo.
  //   • Só a hora (ou só a data numa avaliação sem métricas) → update direto.
  const handleSaveEdit = async () => {
    if (isSaving) return;
    if (requireAssessmentTime()) return;
    setIsSaving(true);
    setErrorMsg('');
    try {
      let savedAssessment = null;
      if (needsReanalysis) {
        const { data, error } = await invokeEdgeFunctionWithTimeout('analyze-body', {
          body: {
            mode: 'manual',
            assessment_id: assessmentIdToEdit,
            date,
            assessment_time: normalizeStartTime(assessmentTime),
            notes: notes.trim() || null,
            metrics: payloadMetricsOf(metrics),
          },
        }, ANALYZE_TIMEOUT_MS);
        if (error) throw new Error(error);
        if (data?.error) throw new Error(data.error);
        savedAssessment = data?.assessment;
        useAppStore.getState().clearDismissedIntervention(assessmentIdToEdit);
      } else {
        const { error } = await supabase
          .from('body_assessments')
          .update({ date })
          .eq('id', assessmentIdToEdit);
        if (error) throw error;
        const currentAssessment = (bodyAssessments || []).find(a => a.id === assessmentIdToEdit);
        savedAssessment = currentAssessment ? { ...currentAssessment, date } : { id: assessmentIdToEdit, date };
      }

      savedAssessment = await persistAssessmentTime(savedAssessment);
      if (profile?.id) await loadInitialData(profile.id);
      finishCreateAndGoToCalendar(savedAssessment, needsReanalysis ? 'Avaliação reanalisada pela Carol' : 'Avaliação atualizada');
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || 'Falha a guardar alterações. Tenta novamente.');
    } finally {
      setIsSaving(false);
    }
  };

  // Comprime e normaliza para JPEG (src/lib/image.js); o .base64 vai no pedido.
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
        setIsFormDirty(true);
      } catch (err) {
        console.warn('Falha a processar imagem', err);
      }
    }
  };

  const removePhoto = (idx) => { setPhotos(prev => prev.filter((_, i) => i !== idx)); setIsFormDirty(true); };

  // ── Ler os prints para o formulário (sem gravar) ─────────────────────
  const handleRead = async () => {
    if (!photos.length || reading) return;
    setReading(true);
    setReadNote(null);
    setErrorMsg('');
    try {
      const { data, error } = await invokeEdgeFunctionWithTimeout('analyze-body', {
        body: { mode: 'preview', images: photos.map(p => p.base64), mime_type: 'image/jpeg', notes: notes.trim() || null },
      }, ANALYZE_TIMEOUT_MS);
      if (error) throw new Error(error);
      if (data?.error) throw new Error(data.error);
      const preview = data?.preview || {};
      const merged = mergeBodyPreview(metrics, preview.metrics);
      setMetrics(merged.metrics);
      setReadState({ count: photos.length, classifications: preview.classifications || null });
      setReadNote(bodyReadNote(merged));
      setIsFormDirty(true);
    } catch (err) {
      setReadNote({ text: err.message || 'Não consegui ler os prints. Tenta outra vez.', tone: 'warn' });
    } finally {
      setReading(false);
    }
  };

  // ── Analisar avaliação (nova) ────────────────────────────────────────
  // Com prints: a análise com espera e "Tentar de novo" (useAnalysis).
  const analyzePhotosTask = async () => {
    const typed = payloadMetricsOf(metrics);
    const hasTyped = Object.keys(typed).length > 0;
    // Os prints já lidos e os mesmos, com valores no formulário: não se volta a ler.
    const reviewed = hasTyped && readState?.count === photos.length;
    const { data, error } = await invokeEdgeFunctionWithTimeout('analyze-body', {
      body: {
        images: photos.map(p => p.base64),
        mime_type: 'image/jpeg',
        date,
        assessment_time: normalizeStartTime(assessmentTime),
        notes: notes.trim() || null,
        ...(hasTyped ? { metrics: typed } : {}),
        ...(reviewed ? { reviewed: true, classifications: readState.classifications || null } : {}),
      },
    }, ANALYZE_TIMEOUT_MS);
    if (error) throw new Error(error);
    if (data?.error) throw new Error(data.error);

    const saved = await persistAssessmentTime(data.assessment);
    setBodyAssessments([saved, ...bodyAssessments]);
    finishCreateAndGoToCalendar(saved, 'Avaliação registada');
  };

  // Sem prints: os valores do formulário (mode manual) — a Carol comenta na mesma.
  const saveFromFields = async () => {
    if (isSaving) return;
    setIsSaving(true);
    setErrorMsg('');
    try {
      const { data, error } = await invokeEdgeFunctionWithTimeout('analyze-body', {
        body: { mode: 'manual', date, assessment_time: normalizeStartTime(assessmentTime), notes: notes.trim() || null, metrics: payloadMetricsOf(metrics) },
      }, ANALYZE_TIMEOUT_MS);
      if (error) throw new Error(error);
      if (data?.error) throw new Error(data.error);

      const saved = await persistAssessmentTime(data.assessment);
      setBodyAssessments([saved, ...bodyAssessments]);
      finishCreateAndGoToCalendar(saved, 'Avaliação registada');
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || 'Falha a gravar a avaliação. Tenta novamente.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAnalyze = () => {
    if (isAnalyzing || isSaving || reading) return;
    if (requireAssessmentTime()) return;
    if (!photos.length && !hasAnyMetric) {
      setErrorMsg('Junta um print da balança ou escreve pelo menos um valor.');
      return;
    }
    setErrorMsg('');
    if (photos.length) analysis.run(analyzePhotosTask);
    else saveFromFields();
  };

  // A ação primária vive na ActionBar fixa (ponto 2 do handoff).
  const primaryAction = isEditing ? (
    <CoachAnalyzeButton
      onClick={handleSaveEdit}
      disabled={isSaving}
      busy={isSaving}
      label={needsReanalysis ? 'Guardar e reanalisar' : 'Guardar alterações'}
    />
  ) : (
    <CoachAnalyzeButton
      onClick={handleAnalyze}
      disabled={isSaving || isAnalyzing || reading}
      busy={isSaving || isAnalyzing}
      label="Analisar avaliação"
    />
  );

  const status = (
    <>
      {showAnalysis && <AnalysisSkeleton kind="body" manual={!isAnalyzing} />}
      {analysis.hasFailed && (
        <AnalysisFailure
          detail={analysis.error}
          onRetry={analysis.retry}
          onManual={() => analysis.reset()}
          manualLabel="Rever os valores"
        >
          Os prints ficaram guardados. Podes tentar outra vez, ou escrever os valores que faltam — eu faço as contas na mesma.
        </AnalysisFailure>
      )}
    </>
  );

  return (
    <RegistrationShell
      accent={ACCENT}
      icon={ScanLine}
      title={isEditing ? 'Editar Avaliação' : 'Nova Avaliação'}
      exit={exit}
      status={status}
      busy={showAnalysis}
      onSaveAndLeave={isEditing ? handleSaveEdit : handleAnalyze}
      isSaving={isSaving || isAnalyzing}
      confirmation={confirmation}
      primaryAction={primaryAction}
    >
      {/* Data · Hora — a hora a que a pesagem foi feita, obrigatória. */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="min-w-0">
          <label htmlFor="br-data-da-avaliacao" className="text-[11px] text-[var(--text-3)] mb-1.5 block">Data da avaliação</label>
          <input
            id="br-data-da-avaliacao"
            type="date"
            value={date}
            max={todayISO()}
            onChange={e => { setDate(e.target.value); setIsFormDirty(true); }}
            className="w-full min-h-[var(--tap)] bg-[var(--surface-glass)] border border-[var(--border-glass)] rounded-xl px-3 py-2 text-sm text-[var(--text-1)] outline-none focus:border-[var(--mod-corpo-to)]"
          />
        </div>
        <div className="min-w-0">
          <label htmlFor="br-hora-da-avaliacao" className="text-[11px] text-[var(--text-3)] mb-1.5 block">Hora da avaliação</label>
          <input
            id="br-hora-da-avaliacao"
            type="time"
            required
            value={assessmentTime}
            onChange={e => { setAssessmentTime(e.target.value); setIsFormDirty(true); }}
            className="w-full min-h-[var(--tap)] bg-[var(--surface-glass)] border border-[var(--border-glass)] rounded-xl px-3 py-2 text-sm text-[var(--text-1)] outline-none focus:border-[var(--mod-corpo-to)]"
          />
        </div>
      </div>

      {/* Ler de uma foto (opcional) — a editar não há prints novos: os
          valores corrigem-se nos campos. */}
      {!isEditing && (
        <PhotoReadSection
          photos={photos}
          maxPhotos={MAX_PHOTOS}
          onSelect={handlePhotoSelect}
          onRemove={removePhoto}
          onRead={handleRead}
          reading={reading}
          note={readNote}
          accent={ACCENT}
          emptyTitle="Prints da Renpho Health (opcional)"
          emptyHint="Junta os ecrãs da mesma pesagem; eu leio os valores e preencho os campos abaixo para reveres."
          // O ecrã que traz a pesagem toda, pelo nome que tem na app (catálogo
          // em supabase/functions/_shared/sourceApps.ts); sem ele, a linha sai.
          emptyExtra={ecraPrincipal('renpho') ? (
            <>O ecrã <span className="font-bold">{ecraPrincipal('renpho').nome}</span> é o que traz todas as métricas de uma vez</>
          ) : null}
        />
      )}

      {/* Os valores — sempre à vista (formulário único). */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        {BODY_METRICS.map(m => (
          <label key={m.key} className="block">
            <span className="text-[11px] text-[var(--text-3)] block mb-1">{m.label} {m.unit && `(${m.unit})`}</span>
            <input
              type="number"
              inputMode="decimal"
              step={m.dec > 0 ? '0.1' : '1'}
              value={metrics[m.key] ?? ''}
              onChange={e => handleMetricChange(m.key, e.target.value)}
              className="w-full min-h-[var(--tap)] bg-[var(--surface-glass)] border border-[var(--border-glass)] rounded-xl px-2.5 py-2 text-xs text-white outline-none focus:border-[var(--mod-corpo-to)] transition"
            />
          </label>
        ))}
      </div>

      <div className="mb-4">
        <span id="br-jejum-label" className="text-[11px] text-[var(--text-3)] mb-1.5 block">Condições da pesagem</span>
        <div role="group" aria-labelledby="br-jejum-label" className="flex gap-2 mb-3">
          {[['yes', 'Em jejum'], ['no', 'Não em jejum']].map(([value, label]) => {
            const active = fastingFromNotes(notes) === value;
            return (
              <Chip
                key={value}
                type="button"
                variant="body"
                active={active}
                aria-pressed={active}
                onClick={() => { setNotes(withFasting(notes, active ? null : value)); setIsFormDirty(true); }}
              >
                {label}
              </Chip>
            );
          })}
        </div>
        <label htmlFor="br-observacoes-opcional-ex-em-jejum-a" className="text-[11px] text-[var(--text-3)] mb-1.5 block">Observações (opcional) — ex.: "após treino"</label>
        <textarea id="br-observacoes-opcional-ex-em-jejum-a"
          rows={2}
          maxLength={500}
          value={notes}
          onChange={e => { setNotes(e.target.value); setIsFormDirty(true); }}
          placeholder="Contexto da pesagem..."
          className="w-full bg-[var(--surface-glass)] border border-[var(--border-glass)] text-white rounded-xl px-3 py-2.5 text-sm placeholder-[var(--text-muted)] outline-none focus:border-[var(--mod-corpo-to)] resize-none"
        />
      </div>

      {/* A intervenção da Carol neste registo — o mesmo componente do cartão
          e do "Registo Guardado" (2026-10-05). */}
      {isEditing && (
        <CarolInterventionActions
          record={(bodyAssessments || []).find(a => a.id === assessmentIdToEdit)}
          type="body"
          onTalked={exit.close}
          className="mb-2"
        />
      )}

      {errorMsg && <p role="alert" className="text-[13px] font-medium mt-3 text-center" style={{ color: 'var(--danger)' }}>{errorMsg}</p>}
    </RegistrationShell>
  );
}
