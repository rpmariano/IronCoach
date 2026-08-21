import React, { useState, useEffect, useRef } from 'react';
import { ImagePlus, X, Trash2, Loader2, Sparkles, PencilLine, Plus, Camera } from 'lucide-react';
import { useAppStore } from '../../store';
import { supabase, invokeEdgeFunctionWithTimeout } from '../../lib/supabase';
import { compressImage } from '../../lib/image';
import { CoachAnalyzeButton } from '../shared/CoachButton';
import { useToast } from '../shared/ToastProvider';
import { parseDurationToSeconds, formatDuration, parsePaceToSeconds, formatPace } from '../../utils/run';
import MissingMetricsBottomSheet from './MissingMetricsBottomSheet';
import UnsavedChangesModal from '../shared/UnsavedChangesModal';
import RunTrainingTypeHelp from '../shared/RunTrainingTypeHelp';
import Chip from '../shared/Chip';
import AddButton from '../shared/AddButton';
import Card from '../shared/Card';
import Button from '../shared/Button';

// -------------------------------------
// ICONS & UTILS
// -------------------------------------
const SneakerIcon = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M14.1 7.9 12.5 10" />
    <path d="M17.4 10.1 16 12" />
    <path d="M2 16a2 2 0 0 0 2 2h13c2.8 0 5-2.2 5-5a2 2 0 0 0-2-2c-.8 0-1.6-.2-2.2-.7l-6.2-4.2c-.4-.3-.9-.2-1.3.1 0 0-.6.8-1.2 1.1a3.5 3.5 0 0 1-4.2.1C4.4 7 3.7 6.3 3.7 6.3A.92.92 0 0 0 2 7Z" />
    <path d="M2 11c0 1.7 1.3 3 3 3h7" />
  </svg>
);


/* Espelha TRAINING_TYPE_KEYS/LABELS em supabase/functions/analyze-run —
   têm de bater certo com o enum fixo do schema que o Gemini usa. O conjunto
   anterior (intervalado/progressivo/series) não existia nesse enum: a
   função descartava-o em silêncio e gravava training_type: null. */
const RUN_TRAINING_TYPES = [
  { key: 'continuo', label: 'Contínuo', group: 'Corrida solta' },
  { key: 'longo', label: 'Longo', group: 'Corrida solta' },
  { key: 'recuperacao', label: 'Recuperação', group: 'Corrida solta' },
  { key: 'tempo', label: 'Ritmo (Tempo)', group: 'Estruturado' },
  { key: 'fartlek', label: 'Fartlek', group: 'Estruturado' },
  { key: 'intervalos', label: 'Intervalos', group: 'Estruturado' },
  { key: 'subidas', label: 'Subidas', group: 'Trilho' },
  { key: 'trail', label: 'Trail', group: 'Trilho' },
  { key: 'tecnico', label: 'Técnico (trilho)', group: 'Trilho' },
];

const RUN_REPEAT_TRAINING_TYPES = new Set(['intervalos', 'subidas']);

/* Só o detalhe de competição de uma corrida já feita (runs.details.race_type)
   — não confundir com o tipo de prova da Agenda (tabela race_events, editada
   em RunAgenda.jsx), que é um conceito diferente e sem ligação a esta lista. */
const COMPLETED_RACE_TYPES = [
  { key: 'estrada', label: 'Estrada' },
  { key: 'trail', label: 'Trail' },
  { key: 'ultra', label: 'Ultra' },
  { key: '5k', label: '5 km' },
  { key: '10k', label: '10 km' },
  { key: '21k', label: 'Meia maratona' },
  { key: '42k', label: 'Maratona' },
  { key: 'outro', label: 'Outro' },
];

function todayISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

// Convert "43m" or "37:57" or "1:11:26" to seconds
const MAX_PHOTOS = 6; // espelha MAX_PHOTOS em supabase/functions/analyze-run

// A Agenda de Provas (raceEvents) tem o próprio formulário dedicado em
// RunAgenda.jsx — este componente só regista corridas (tabela runs).
export default function RunRegistration({ onClose, dateIso = null, runIdToEdit = null }) {
  const { profile, runs, setRuns, setNavGuard, activeTab } = useAppStore();
  const [initialTab] = useState(activeTab);
  const { showToast } = useToast();

  

  // Item do plano que esta corrida vai concluir, se veio do botão "Concluir"
  // no Início (ver Home.jsx e specs/plano-de-treino.md §5.2). Consumido uma
  // única vez no mount seguinte; guardado num ref para o handler de gravação
  // saber a que item ligar o registo, sem precisar de o repetir no estado.
  const completingPlanItemRef = useRef(
    !runIdToEdit ? useAppStore.getState().planItemPrefill : null
  );
  const planItem = completingPlanItemRef.current?.kind === 'corrida' ? completingPlanItemRef.current : null;

  // --- RUNS STATE ---
  const [runKind, setRunKind] = useState(planItem?.isRace ? 'competicao' : 'treino'); // 'treino' | 'competicao'
  const [runTrainingType, setRunTrainingType] = useState(planItem?.training_type || 'continuo');
  const [runDate, setRunDate] = useState(planItem?.planned_date || dateIso || todayISO());
  const [runName, setRunName] = useState(planItem?.title || 'Corrida de Hoje');
  
  // Basic metrics
  const [runDistance, setRunDistance] = useState(planItem?.target_distance_km ? String(planItem.target_distance_km) : '');
  const [runDuration, setRunDuration] = useState(planItem?.target_duration ? formatDuration(planItem.target_duration) : '');
  const [runEffortRpe, setRunEffortRpe] = useState(0); // 0-10
  const [runNotes, setRunNotes] = useState('');
  
  // Detailed metrics
  const [elevationGain, setElevationGain] = useState(planItem?.elevation_gain_m ? String(planItem.elevation_gain_m) : '');
  const [cadence, setCadence] = useState('');
  const [maxCadence, setMaxCadence] = useState('');
  const [calories, setCalories] = useState('');
  const [vo2Max, setVo2Max] = useState('');
  const [avgHeartRate, setAvgHeartRate] = useState('');
  const [maxHeartRate, setMaxHeartRate] = useState('');

  // Advanced metrics (Samsung Health / Garmin / Apple)
  const [sweatLossMl, setSweatLossMl] = useState('');
  const [totalSteps, setTotalSteps] = useState('');
  const [maxPace, setMaxPace] = useState('');
  const [elevationLoss, setElevationLoss] = useState('');
  const [aerobicThreshold, setAerobicThreshold] = useState('');
  const [anaerobicThreshold, setAnaerobicThreshold] = useState('');
  const [hrRecovery, setHrRecovery] = useState('');
  const [groundContactTime, setGroundContactTime] = useState('');
  const [flightTime, setFlightTime] = useState('');
  const [verticalOscillation, setVerticalOscillation] = useState('');
  const [asymmetryPct, setAsymmetryPct] = useState('');
  const [legStiffness, setLegStiffness] = useState('');
  
  // Training structure
  const [warmupMinutes, setWarmupMinutes] = useState('');
  const [recoverySeconds, setRecoverySeconds] = useState('');
  const [splits, setSplits] = useState([]); // { distance_km, minutes }
  const [hrZones, setHrZones] = useState([]); // { zone, minutes }
  
  // Competition specifics (when runKind === 'competicao')
  const [officialTime, setOfficialTime] = useState(planItem?.target_duration ? formatDuration(planItem.target_duration) : '');
  const [position, setPosition] = useState('');
  const [completedRaceType, setCompletedRaceType] = useState(planItem?.race_type || '10k');
  
  // Photos
  const [runPhotos, setRunPhotos] = useState([]); // [{ file?, dataUrl, url? }]
  const [analyzingRun, setAnalyzingRun] = useState(false);
  // Um único cartão, forma de introdução escolhida em vez de 2 blocos
  // sempre visíveis — só um dos dois fica ativo/clicável a cada vez, por
  // isso não há risco de o utilizador preencher os dois em paralelo.
  // Vindo do plano, entra direto em manual — os campos já estão preenchidos,
  // não faz sentido pedir foto/IA por cima.
  const [entryMethod, setEntryMethod] = useState(planItem ? 'manual' : 'foto'); // 'foto' | 'manual'
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [originalSnapshot, setOriginalSnapshot] = useState(null);
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

  // Ao gravar uma corrida NOVA (foto ou manual), vai sempre para o
  // Calendário, aberto no dia da corrida — mesmo padrão de RunAgenda.jsx
  // (Prova) via pendingCalendarDate no store. Se isto veio de "Gravar e
  // sair" a caminho de outro separador (navGuard intercetado), respeita
  // esse destino em vez de o substituir — por isso o alvo pendente é lido
  // ANTES de handleClose() o consumir.
  const finishCreateAndGoToCalendar = (createdRecord) => {
    const hadPendingNav = !!pendingNavTarget.current;
    handleClose();
    if (!hadPendingNav) {
      setNavGuard(null);
      if (createdRecord && !runIdToEdit) {
        useAppStore.getState().setNewlyCreatedRecord({ type: 'run', record: createdRecord });
      }
      useAppStore.getState().setPendingCalendarDate(runDate);
      useAppStore.getState().setActiveTab('calendario');
    }
  };

  // Estado do Bottom Sheet de métricas em falta
  const [showMissingMetricsSheet, setShowMissingMetricsSheet] = useState(false);
  const [missingKeysList, setMissingKeysList] = useState([]);
  const [userBypassedMissingSheet, setUserBypassedMissingSheet] = useState(false);
  const [sheetClosedViaTouch, setSheetClosedViaTouch] = useState(false);
  const [pendingCreatedRun, setPendingCreatedRun] = useState(null);
  const [pendingForceReanalyze, setPendingForceReanalyze] = useState(false);

  // Helper para identificar métricas recomendadas em falta
  const detectMissingRunMetrics = (detailsObj = {}, distance = null, duration = null) => {
    const missing = [];
    if (distance === null || distance === undefined || distance === '' || Number(distance) === 0) {
      missing.push('distance_km');
    }
    if (!duration) {
      missing.push('duration_seconds');
    }
    if (!detailsObj.avg_heart_rate_bpm) missing.push('avg_heart_rate_bpm');
    if (!detailsObj.cadence_spm) missing.push('cadence_spm');
    if (!detailsObj.elevation_gain_m) missing.push('elevation_gain_m');
    if (!detailsObj.sweat_loss_ml) missing.push('sweat_loss_ml');
    if (!detailsObj.ground_contact_time_ms && !detailsObj.vertical_oscillation_cm && !detailsObj.asymmetry_pct) {
      missing.push('biomechanics');
    }
    if (!detailsObj.aerobic_threshold_bpm && !detailsObj.anaerobic_threshold_bpm) {
      missing.push('thresholds');
    }
    if (!detailsObj.splits || !Array.isArray(detailsObj.splits) || detailsObj.splits.length === 0) {
      missing.push('splits');
    }
    if (!detailsObj.hr_zones || !Array.isArray(detailsObj.hr_zones) || detailsObj.hr_zones.length === 0) {
      missing.push('hr_zones');
    }
    return missing;
  };

  // Limpa o item do plano do store assim que foi consumido para os estados
  // iniciais acima — nunca deve reaparecer numa próxima abertura "Nova Corrida".
  useEffect(() => {
    if (completingPlanItemRef.current) useAppStore.getState().clearPlanItemPrefill();
  }, []);

  // Assinatura do que é analítico. Normaliza (descarta vazios, ordena
  // chaves) para que o objeto vindo da BD e o construído a partir do
  // formulário sejam comparáveis campo a campo.
  const analyticalSignature = (v) => JSON.stringify({
    kind: v.kind,
    trainingType: v.trainingType || null,
    distance: v.distance === '' || v.distance == null ? null : Number(v.distance),
    duration: v.duration ?? null,
    rpe: v.rpe || 0,
    notes: v.notes?.trim() || null,
    details: Object.fromEntries(
      Object.entries(v.details || {})
        .filter(([, val]) => val !== null && val !== undefined && val !== '')
        .sort(([a], [b]) => a.localeCompare(b)),
    ),
  });

  // Métricas do formulário na mesma forma com que são gravadas em runs.details.
  const buildDetailsFromForm = () => {
    const parsedSplits = splits
      .map(s => ({ distance_km: parseFloat(s.distance_km) || null, time_seconds: parseDurationToSeconds(s.minutes) }))
      .filter(s => s.distance_km || s.time_seconds);
    const parsedHrZones = hrZones
      .map(z => ({ zone: parseInt(z.zone) || null, minutes: parseInt(z.minutes) || null }))
      .filter(z => z.zone && z.minutes);

    const details = {
      elevation_gain_m: parseInt(elevationGain) || null,
      cadence_spm: parseInt(cadence) || null,
      max_cadence_spm: parseInt(maxCadence) || null,
      calories_kcal: parseInt(calories) || null,
      vo2_max: parseFloat(vo2Max) || null,
      avg_heart_rate_bpm: parseInt(avgHeartRate) || null,
      max_heart_rate_bpm: parseInt(maxHeartRate) || null,
      // Advanced metrics
      sweat_loss_ml: parseInt(sweatLossMl) || null,
      total_steps: parseInt(totalSteps) || null,
      max_pace_seconds_per_km: parsePaceToSeconds(maxPace) || null,
      elevation_loss_m: parseInt(elevationLoss) || null,
      aerobic_threshold_bpm: parseInt(aerobicThreshold) || null,
      anaerobic_threshold_bpm: parseInt(anaerobicThreshold) || null,
      hr_recovery_bpm: parseInt(hrRecovery) || null,
      ground_contact_time_ms: parseInt(groundContactTime) || null,
      flight_time_ms: parseInt(flightTime) || null,
      vertical_oscillation_cm: parseFloat(verticalOscillation) || null,
      asymmetry_pct: parseFloat(asymmetryPct) || null,
      leg_stiffness_kn_m: parseFloat(legStiffness) || null,
    };
    if (parsedHrZones.length > 0) details.hr_zones = parsedHrZones;
    if (runKind === 'treino') {
      if (warmupMinutes) details.warmup_minutes = parseInt(warmupMinutes);
      if (recoverySeconds) details.recovery_seconds = parseInt(recoverySeconds);
      if (parsedSplits.length) details.splits = parsedSplits;
    } else {
      details.race_type = completedRaceType;
      if (officialTime) details.official_time_seconds = parseDurationToSeconds(officialTime);
      if (position) details.position = parseInt(position);
    }
    return { details, parsedSplits, parsedHrZones };
  };

  // Load existing data if editing
  useEffect(() => {
    if (runIdToEdit) {
      const r = runs.find(r => r.id === runIdToEdit);
      if (r) {
        setEntryMethod('manual');
        setRunKind(r.kind || 'treino');
        setRunTrainingType(r.training_type || 'continuo');
        setRunDate(r.date || todayISO());
        setRunName(r.name || '');
        setRunDistance(r.distance_km || '');
        setRunDuration(r.duration_seconds ? formatDuration(r.duration_seconds) : '');
        setRunEffortRpe(r.effort_rpe || 0);
        setRunNotes(r.notes || '');
        
        const d = r.details || {};
        setElevationGain(d.elevation_gain_m || '');
        setCadence(d.cadence_spm || '');
        setMaxCadence(d.max_cadence_spm || '');
        setCalories(d.calories_kcal || '');
        setVo2Max(d.vo2_max || '');
        setAvgHeartRate(d.avg_heart_rate_bpm || '');
        setMaxHeartRate(d.max_heart_rate_bpm || '');

        setSweatLossMl(d.sweat_loss_ml || '');
        setTotalSteps(d.total_steps || '');
        setMaxPace(d.max_pace_seconds_per_km ? formatPace(d.max_pace_seconds_per_km) : '');
        setElevationLoss(d.elevation_loss_m || '');
        setAerobicThreshold(d.aerobic_threshold_bpm || '');
        setAnaerobicThreshold(d.anaerobic_threshold_bpm || '');
        setHrRecovery(d.hr_recovery_bpm || '');
        setGroundContactTime(d.ground_contact_time_ms || '');
        setFlightTime(d.flight_time_ms || '');
        setVerticalOscillation(d.vertical_oscillation_cm || '');
        setAsymmetryPct(d.asymmetry_pct || '');
        setLegStiffness(d.leg_stiffness_kn_m || '');
        
        setWarmupMinutes(d.warmup_minutes || '');
        setRecoverySeconds(d.recovery_seconds || '');
        setSplits(d.splits ? d.splits.map(s => ({ distance_km: s.distance_km || '', minutes: s.time_seconds ? formatDuration(s.time_seconds) : '' })) : []);
        setHrZones(d.hr_zones ? d.hr_zones.map(z => ({ zone: z.zone || '', minutes: z.minutes || '' })) : []);
        
        setOfficialTime(d.official_time_seconds ? formatDuration(d.official_time_seconds) : '');
        setPosition(d.position || '');
        setCompletedRaceType(d.race_type || '10k');

        // Distância, duração, RPE, tipo e métricas são dados ANALÍTICOS:
        // mudá-los muda a análise, e guardar passa pelo Coach para a
        // regenerar. Mudar só a data ou o nome é update direto, sem custo de
        // API (mesmo padrão da Nutrição/Ginásio/Corpo — ver PRD 3.2).
        setOriginalSnapshot(analyticalSignature({
          kind: r.kind || 'treino',
          trainingType: r.training_type || 'continuo',
          distance: r.distance_km,
          duration: r.duration_seconds,
          rpe: r.effort_rpe,
          notes: r.notes || null,
          details: r.details,
        }));

        // Load photos (são privadas, precisamos de signed URLs)
        if (r.photo_paths && r.photo_paths.length > 0) {
          supabase.storage.from('run-photos').createSignedUrls(r.photo_paths, 3600).then(({ data, error }) => {
            if (!error && data) {
              setRunPhotos(data.map(d => ({ url: d.signedUrl, dataUrl: d.signedUrl })).filter(p => p.url));
            }
          });
        }
      }
    }
  }, [runIdToEdit, runs]);

  // Só regenera a análise se os dados analíticos mudaram; mudar apenas a data
  // ou o nome não justifica uma chamada ao Gemini.
  const needsReanalysis = !!runIdToEdit
    && originalSnapshot !== null
    && analyticalSignature({
      kind: runKind,
      trainingType: runKind === 'treino' ? runTrainingType : null,
      distance: runDistance,
      duration: parseDurationToSeconds(runDuration),
      rpe: runEffortRpe,
      notes: runNotes.trim() ? runNotes.trim() : null,
      details: buildDetailsFromForm().details,
    }) !== originalSnapshot;

  // Handle Photo Selection — comprime e normaliza para JPEG antes de guardar
  // (ver src/lib/image.js); o .base64 resultante é o que vai no pedido de
  // análise por IA.
  const handlePhotoSelected = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    const remaining = MAX_PHOTOS - runPhotos.length;
    if (remaining <= 0) {
      setErrorMsg(`Máximo de ${MAX_PHOTOS} imagens.`);
      return;
    }

    for (const file of files.slice(0, remaining)) {
      try {
        const { dataUrl, base64 } = await compressImage(file);
        setRunPhotos(prev => [...prev, { dataUrl, base64 }]);
      } catch (err) {
        console.warn('Falha a processar imagem', err);
      }
    }
  };

  const removePhoto = (index) => {
    setRunPhotos(prev => prev.filter((_, i) => i !== index));
  };

  // ----------------------------------
  // ANALISAR CORRIDA (IA — analyze-run)
  // ----------------------------------
  // Fotos são só para este caminho: o registo manual (handleSaveCorrida)
  // nunca teve anexos de foto, no vanilla nem aqui — evita duas rotas a
  // gravar a mesma corrida de formas diferentes (uma comprimida e analisada
  // pela IA, outra crua e sem análise nenhuma).
  const handleAnalyzeRun = async () => {
    if (!runPhotos.length || analyzingRun) return;

    if (!runName.trim()) {
      setErrorMsg('Preenche o nome da corrida.');
      return;
    }
    if (runKind === 'treino' && !runTrainingType) {
      setErrorMsg('Escolhe o tipo de treino.');
      return;
    }
    if (runKind === 'competicao' && !completedRaceType) {
      setErrorMsg('Escolhe a disciplina.');
      return;
    }

    setAnalyzingRun(true);
    setErrorMsg('');
    try {
      const { data, error } = await invokeEdgeFunctionWithTimeout('analyze-run', {
        body: {
          images: runPhotos.map(p => p.base64),
          mime_type: 'image/jpeg',
          date: runDate,
          kind: runKind,
          name: runName.trim(),
          name_is_auto: false,
          effort_rpe: runEffortRpe || null,
          notes: runNotes.trim() ? runNotes.trim() : null,
          training_type: runKind === 'treino' ? runTrainingType : null,
          race_type: runKind === 'competicao' ? completedRaceType : null,
        },
      });
      if (error) throw new Error(error);
      if (data?.error) throw new Error(data.error);

      const createdRun = data.run;
      const extractedDetails = createdRun.details || {};

      // Pré-preencher campos manuais para o caso de o atleta querer rever ou editar depois
      if (createdRun.distance_km) setRunDistance(createdRun.distance_km);
      if (createdRun.duration_seconds) setRunDuration(formatDuration(createdRun.duration_seconds));
      if (createdRun.effort_rpe) setRunEffortRpe(createdRun.effort_rpe);
      if (createdRun.notes) setRunNotes(createdRun.notes);
      if (createdRun.name) setRunName(createdRun.name);

      if (extractedDetails.elevation_gain_m) setElevationGain(extractedDetails.elevation_gain_m);
      if (extractedDetails.cadence_spm) setCadence(extractedDetails.cadence_spm);
      if (extractedDetails.max_cadence_spm) setMaxCadence(extractedDetails.max_cadence_spm);
      if (extractedDetails.calories_kcal) setCalories(extractedDetails.calories_kcal);
      if (extractedDetails.vo2_max) setVo2Max(extractedDetails.vo2_max);
      if (extractedDetails.avg_heart_rate_bpm) setAvgHeartRate(extractedDetails.avg_heart_rate_bpm);
      if (extractedDetails.max_heart_rate_bpm) setMaxHeartRate(extractedDetails.max_heart_rate_bpm);
      if (extractedDetails.sweat_loss_ml) setSweatLossMl(extractedDetails.sweat_loss_ml);
      if (extractedDetails.total_steps) setTotalSteps(extractedDetails.total_steps);
      if (extractedDetails.max_pace_seconds_per_km) setMaxPace(formatPace(extractedDetails.max_pace_seconds_per_km));
      if (extractedDetails.elevation_loss_m) setElevationLoss(extractedDetails.elevation_loss_m);
      if (extractedDetails.aerobic_threshold_bpm) setAerobicThreshold(extractedDetails.aerobic_threshold_bpm);
      if (extractedDetails.anaerobic_threshold_bpm) setAnaerobicThreshold(extractedDetails.anaerobic_threshold_bpm);
      if (extractedDetails.hr_recovery_bpm) setHrRecovery(extractedDetails.hr_recovery_bpm);
      if (extractedDetails.ground_contact_time_ms) setGroundContactTime(extractedDetails.ground_contact_time_ms);
      if (extractedDetails.flight_time_ms) setFlightTime(extractedDetails.flight_time_ms);
      if (extractedDetails.vertical_oscillation_cm) setVerticalOscillation(extractedDetails.vertical_oscillation_cm);
      if (extractedDetails.asymmetry_pct) setAsymmetryPct(extractedDetails.asymmetry_pct);
      if (extractedDetails.leg_stiffness_kn_m) setLegStiffness(extractedDetails.leg_stiffness_kn_m);

      if (extractedDetails.splits) {
        setSplits(extractedDetails.splits.map(s => ({
          distance_km: s.distance_km || '',
          minutes: s.time_seconds ? formatDuration(s.time_seconds) : ''
        })));
      }
      if (extractedDetails.hr_zones) {
        setHrZones(extractedDetails.hr_zones.map(z => ({
          zone: z.zone || '',
          minutes: z.minutes || ''
        })));
      }

      const missing = detectMissingRunMetrics(extractedDetails, createdRun.distance_km, createdRun.duration_seconds);
      if (missing.length > 0 && !userBypassedMissingSheet) {
        setPendingCreatedRun(createdRun);
        setMissingKeysList(missing);
        setShowMissingMetricsSheet(true);
        return;
      }

      setRuns([...runs, createdRun]);
      showToast('Corrida registada');
      finishCreateAndGoToCalendar(createdRun);
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || 'Falha na análise. Tenta novamente.');
    } finally {
      setAnalyzingRun(false);
    }
  };

  // Callback ao decidir prosseguir no Bottom Sheet sem adicionar mais métricas
  const handleProceedAnyway = async () => {
    setShowMissingMetricsSheet(false);
    setUserBypassedMissingSheet(true);
    if (pendingCreatedRun) {
      setRuns([...runs, pendingCreatedRun]);
      showToast('Corrida registada');
      finishCreateAndGoToCalendar(pendingCreatedRun);
    } else {
      handleSaveCorrida(true, pendingForceReanalyze);
    }
  };

  // ----------------------------------
  // SAVE CORRIDA (Runs Table) — registo manual
  // ----------------------------------
  // A criar uma corrida nova, passa pelo mesmo Coach que o caminho de fotos
  // — modo "manual" da analyze-run: sem imagens, gera só o comentário a
  // partir dos números que o próprio formulário já tem. A editar uma
  // corrida existente mantém-se o update direto (sem reanálise — essa é a
  // ação dedicada "Reanalisar" no cartão da corrida).
  const handleSaveCorrida = async (forceBypassMissing = false, forceReanalyze = false) => {
    const isBypass = forceBypassMissing === true;
    const isForceReanalyze = forceReanalyze === true;

    if (!runName.trim()) {
      setErrorMsg('Preenche o nome da corrida.');
      return;
    }
    if (runKind === 'treino' && !runTrainingType) {
      setErrorMsg('Escolhe o tipo de treino.');
      return;
    }
    if (runKind === 'competicao' && !completedRaceType) {
      setErrorMsg('Escolhe a disciplina.');
      return;
    }

    const { details } = buildDetailsFromForm();

    // Update vs. Reanalisar?
    // Se a "assinatura analítica" mudou, é preciso reanalisar no Coach.
    let signatureChanged = false;
    if (runIdToEdit && originalSnapshot !== null) {
      const newSig = analyticalSignature({
        kind: runKind,
        trainingType: runKind === 'treino' ? runTrainingType : null,
        distance: runDistance,
        duration: parseDurationToSeconds(runDuration),
        rpe: runEffortRpe,
        notes: runNotes.trim() ? runNotes.trim() : null,
        details,
      });
      signatureChanged = originalSnapshot !== newSig || isForceReanalyze;
    }

    const missing = detectMissingRunMetrics(details, runDistance, runDuration);
    const shouldNag = missing.length > 0 && !userBypassedMissingSheet && !isBypass && (!runIdToEdit || signatureChanged);

    if (shouldNag) {
      setPendingForceReanalyze(isForceReanalyze);
      setMissingKeysList(missing);
      setShowMissingMetricsSheet(true);
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');

    try {
      const distVal = parseFloat(runDistance);
      const durSecs = parseDurationToSeconds(runDuration);

      const parsedSplits = splits.map(s => ({
        distance_km: parseFloat(s.distance_km) || null,
        time_seconds: parseDurationToSeconds(s.minutes)
      })).filter(s => s.distance_km || s.time_seconds);

      const parsedHrZones = hrZones
        .map(z => ({ zone: parseInt(z.zone) || null, minutes: parseInt(z.minutes) || null }))
        .filter(z => z.zone && z.minutes);

      let newlySavedRun = null;
      // Editar: dois caminhos. Se os dados analíticos mudaram (distância,
      // duração, RPE, tipo ou métricas), passa pelo Coach e regenera a
      // análise; se só mudou a data ou o nome, é update direto sem custo
      // de API. Mesmo padrão da Nutrição/Ginásio/Corpo (PRD 3.2).
      if (runIdToEdit) {
        if (signatureChanged) {
          const { data, error } = await invokeEdgeFunctionWithTimeout('analyze-run', {
            body: {
              mode: 'manual',
              run_id: runIdToEdit,
              date: runDate,
              kind: runKind,
              name: runName.trim(),
              effort_rpe: runEffortRpe || null,
              notes: runNotes.trim() ? runNotes.trim() : null,
              training_type: runKind === 'treino' ? runTrainingType : null,
              race_type: runKind === 'competicao' ? completedRaceType : null,
              distance_km: !isNaN(distVal) ? distVal : null,
              duration_seconds: durSecs,
              elevation_gain_m: parseInt(elevationGain) || null,
              cadence_spm: parseInt(cadence) || null,
              max_cadence_spm: parseInt(maxCadence) || null,
              calories_kcal: parseInt(calories) || null,
              vo2_max: parseFloat(vo2Max) || null,
              avg_heart_rate_bpm: parseInt(avgHeartRate) || null,
              max_heart_rate_bpm: parseInt(maxHeartRate) || null,
              hr_zones: parsedHrZones.length ? parsedHrZones : null,
              warmup_minutes: warmupMinutes ? parseInt(warmupMinutes) : null,
              recovery_seconds: recoverySeconds ? parseInt(recoverySeconds) : null,
              splits: parsedSplits.length ? parsedSplits : null,
              official_time_seconds: officialTime ? parseDurationToSeconds(officialTime) : null,
              position: position ? parseInt(position) : null,
              sweat_loss_ml: parseInt(sweatLossMl) || null,
              total_steps: parseInt(totalSteps) || null,
              max_pace_seconds_per_km: parsePaceToSeconds(maxPace) || null,
              elevation_loss_m: parseInt(elevationLoss) || null,
              aerobic_threshold_bpm: parseInt(aerobicThreshold) || null,
              anaerobic_threshold_bpm: parseInt(anaerobicThreshold) || null,
              hr_recovery_bpm: parseInt(hrRecovery) || null,
              ground_contact_time_ms: parseInt(groundContactTime) || null,
              flight_time_ms: parseInt(flightTime) || null,
              vertical_oscillation_cm: parseFloat(verticalOscillation) || null,
              asymmetry_pct: parseFloat(asymmetryPct) || null,
              leg_stiffness_kn_m: parseFloat(legStiffness) || null,
            },
          });
          if (error) throw new Error(error);
          if (data?.error) throw new Error(data.error);
          setRuns(runs.map(r => (r.id === runIdToEdit ? data.run : r)));
          showToast('Corrida reanalisada pelo Coach');
        } else {
          const payload = { date: runDate, name: runName.trim() };
          const { error } = await supabase.from('runs').update(payload).eq('id', runIdToEdit);
          if (error) throw error;
          setRuns(runs.map(r => r.id === runIdToEdit ? { ...r, ...payload } : r));
          showToast('Corrida atualizada');
        }
        handleClose();
        return;
      }

      const { data, error } = await invokeEdgeFunctionWithTimeout('analyze-run', {
        body: {
          mode: 'manual',
          date: runDate,
          kind: runKind,
          name: runName.trim(),
          effort_rpe: runEffortRpe || null,
          notes: runNotes.trim() ? runNotes.trim() : null,
          training_type: runKind === 'treino' ? runTrainingType : null,
          race_type: runKind === 'competicao' ? completedRaceType : null,
          distance_km: !isNaN(distVal) ? distVal : null,
          duration_seconds: durSecs,
          elevation_gain_m: parseInt(elevationGain) || null,
          cadence_spm: parseInt(cadence) || null,
          max_cadence_spm: parseInt(maxCadence) || null,
          calories_kcal: parseInt(calories) || null,
          vo2_max: parseFloat(vo2Max) || null,
          avg_heart_rate_bpm: parseInt(avgHeartRate) || null,
          max_heart_rate_bpm: parseInt(maxHeartRate) || null,
          hr_zones: parsedHrZones.length ? parsedHrZones : null,
          warmup_minutes: warmupMinutes ? parseInt(warmupMinutes) : null,
          recovery_seconds: recoverySeconds ? parseInt(recoverySeconds) : null,
          splits: parsedSplits.length ? parsedSplits : null,
          official_time_seconds: officialTime ? parseDurationToSeconds(officialTime) : null,
          position: position ? parseInt(position) : null,
          sweat_loss_ml: parseInt(sweatLossMl) || null,
          total_steps: parseInt(totalSteps) || null,
          max_pace_seconds_per_km: parsePaceToSeconds(maxPace) || null,
          elevation_loss_m: parseInt(elevationLoss) || null,
          aerobic_threshold_bpm: parseInt(aerobicThreshold) || null,
          anaerobic_threshold_bpm: parseInt(anaerobicThreshold) || null,
          hr_recovery_bpm: parseInt(hrRecovery) || null,
          ground_contact_time_ms: parseInt(groundContactTime) || null,
          flight_time_ms: parseInt(flightTime) || null,
          vertical_oscillation_cm: parseFloat(verticalOscillation) || null,
          asymmetry_pct: parseFloat(asymmetryPct) || null,
          leg_stiffness_kn_m: parseFloat(legStiffness) || null,
        },
      });
      if (error) throw new Error(error);
      if (data?.error) throw new Error(data.error);

      newlySavedRun = data.run;
      setRuns([...runs, newlySavedRun]);

      // Se esta corrida vem do plano, marca o item como concluído — a data
      // usada é a que ficou no formulário (runDate), que pode ter sido
      // alterada face ao planned_date; é essa divergência que corrige os
      // objetivos de nutrição dos dois dias (ver specs/plano-de-treino.md §4).
      if (completingPlanItemRef.current) {
        await useAppStore.getState().completePlanItem(completingPlanItemRef.current.id, {
          actualDate: runDate,
          runId: newlySavedRun.id,
        });
      }

      showToast('Corrida registada');
      finishCreateAndGoToCalendar(newlySavedRun);
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || 'Falha a gravar a corrida. Tenta novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ----------------------------------
  // RENDER CORRIDA (Runs)
  // ----------------------------------
  const renderCorridaForm = () => {
    const isRepeatType = runKind === 'treino' && RUN_REPEAT_TRAINING_TYPES.has(runTrainingType);

    const showToggle = !runIdToEdit;
    const showFotoBlock = showToggle && entryMethod === 'foto';

    return (
      <div className="space-y-4 fade-in pb-10">

        {/* Cartão único — os campos comuns ficam sempre visíveis; a forma de
            introdução (foto/IA ou manual) decide o resto. Editar uma corrida
            existente é sempre pelos campos (ver showToggle acima) — a IA por
            foto só cria; "Reanalisar" no cartão da corrida é a ação dedicada
            a reanalisar uma corrida já criada assim. */}
        <div
          className="module-card-contrast"
          // Mesmo vidro fosco (bg branco 5% + blur 20px) do resto da app —
          // a versão anterior tinha a borda/glow do .card mas sem
          // backdrop-filter nem base branca, o que dava um retângulo escuro
          // plano em vez do vidro premium usado nos outros ecrãs.
          style={{ background: 'linear-gradient(135deg, color-mix(in srgb, var(--mod-corrida-to) 3%, transparent), color-mix(in srgb, var(--mod-corrida-to) 6%, transparent)), rgba(255, 255, 255, 0.05)' }}
        >
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <SneakerIcon className="w-4 h-4" style={{ color: 'var(--mod-corrida-to)' }} />
              <h2 className="text-sm font-semibold text-white">{runIdToEdit ? 'Editar Corrida' : 'Nova Corrida'}</h2>
            </div>
            <button
              onClick={() => { if (isFormDirty) setShowUnsavedModal(true); else handleClose(); }}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors shrink-0"
              title="Fechar"
              aria-label="Fechar"
            >
              <X size={16} />
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5 mb-3">
            {/* Cor via style, não pela classe text-white — um override global
                (globals.css:66, "portado do legado") força text-white para
                #0f172a com !important; nestes botões o fundo é mesmo escuro/
                colorido e o texto tem de ficar branco a valer. */}
            <Chip
              active={runKind === 'treino'}
              variant="run"
              onClick={() => { setRunKind('treino'); setIsFormDirty(true); }}
              className="px-3 py-1.5"
              type="button"
            >
              Treino
            </Chip>
            <Chip
              active={runKind === 'competicao'}
              variant="run"
              onClick={() => { setRunKind('competicao'); setIsFormDirty(true); }}
              className="px-3 py-1.5"
              type="button"
            >
              Competição
            </Chip>
          </div>

          {runKind === 'treino' ? (
            <div className="mb-4">
              <RunTrainingTypeHelp label="Tipo de treino">
                <select
                  value={runTrainingType}
                  onChange={e => { setRunTrainingType(e.target.value); setIsFormDirty(true); }}
                  className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-3 py-3 text-[14px] text-white outline-none focus:border-[var(--mod-corrida-to)] transition"
                >
                  <optgroup label="Corrida solta">
                    <option value="continuo">Contínuo</option>
                    <option value="longo">Longo</option>
                    <option value="recuperacao">Recuperação</option>
                  </optgroup>
                  <optgroup label="Estruturado">
                    <option value="tempo">Ritmo (Tempo)</option>
                    <option value="fartlek">Fartlek</option>
                    <option value="intervalos">Intervalos</option>
                  </optgroup>
                  <optgroup label="Trilho">
                    <option value="subidas">Subidas</option>
                    <option value="trail">Trail</option>
                    <option value="tecnico">Técnico (trilho)</option>
                  </optgroup>
                </select>
                <p className="text-[10px] text-slate-400 mt-1.5">A maioria das corridas é "Contínuo" — só muda se for um treino estruturado.</p>
              </RunTrainingTypeHelp>
            </div>
          ) : (
            <div className="mb-4">
              <label className="text-[11px] text-slate-500 mb-1.5 block">Disciplina</label>
              <select
                value={completedRaceType}
                onChange={e => { setCompletedRaceType(e.target.value); setIsFormDirty(true); }}
                className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-3 py-3 text-[14px] text-white outline-none focus:border-[var(--mod-corrida-to)] transition"
              >
                {COMPLETED_RACE_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </div>
          )}

          <div className="mb-4">
            <label className="text-[11px] text-slate-500 mb-1.5 block">Data da corrida</label>
            <input
              type="date"
              value={runDate}
              max={todayISO()}
              onChange={e => { setRunDate(e.target.value); setIsFormDirty(true); }}
              className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-3 py-2.5 text-[14px] text-white outline-none focus:border-[var(--mod-corrida-to)] transition"
            />
          </div>

          <div className="mb-4">
            <label className="text-[11px] text-slate-500 mb-1.5 block">Nível de esforço (RPE, opcional)</label>
            <div className="flex gap-1.5">
              {Array.from({ length: 10 }).map((_, i) => (
                <button
                  key={i}
                  onClick={() => { setRunEffortRpe(runEffortRpe === i + 1 ? 0 : i + 1); setIsFormDirty(true); }}
                  className={`flex-1 aspect-square rounded-lg flex items-center justify-center text-[13px] font-bold transition-colors border shadow-sm ${runEffortRpe === i + 1 ? 'bg-[var(--mod-corrida-to)]/15 border-[var(--mod-corrida-to)]/40 text-[var(--mod-corrida-to)]' : 'bg-white/5 border-white/10 text-slate-400'}`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-4">
            <label className="text-[11px] text-slate-500 mb-1.5 flex items-center gap-1.5">
              <PencilLine size={14} /> Observações (opcional)
            </label>
            <textarea
              className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-3 py-2.5 text-[14px] text-white outline-none focus:border-[var(--mod-corrida-to)] transition min-h-[80px] resize-y"
              placeholder="Como te sentiste, dores, condições atmosféricas..."
              value={runNotes}
              onChange={e => { setRunNotes(e.target.value); setIsFormDirty(true); }}
            />
          </div>

          <div className="mb-4">
            <label className="text-[11px] text-slate-500 mb-1.5 block">Nome da corrida <span className="text-red-400">*</span></label>
            <input
              type="text"
              value={runName}
              onChange={e => { setRunName(e.target.value); setIsFormDirty(true); }}
              className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-3 py-2.5 text-[14px] text-white outline-none focus:border-[var(--mod-corrida-to)] transition"
            />
            <p className="text-[10px] text-slate-400 mt-1.5">Sugestão automática — muda se quiseres.</p>
          </div>

          {/* Competition Specifics */}
          {runKind === 'competicao' && (
            <div className="grid grid-cols-2 gap-2 mb-4 bg-white/5 border border-white/10 text-white rounded-xl p-3">
              <div>
                <label className="text-[10px] text-slate-500 block mb-1">Tempo Oficial</label>
                <input type="text" placeholder="ex: 1:45:00" value={officialTime} onChange={e => { setOfficialTime(e.target.value); setIsFormDirty(true); }} className="w-full bg-white/5 border border-white/10 text-white rounded-xl px-2 py-1.5 text-xs outline-none focus:border-[var(--mod-corrida-to)] transition" />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 block mb-1">Posição</label>
                <input type="number" placeholder="ex: 12" value={position} onChange={e => { setPosition(e.target.value); setIsFormDirty(true); }} className="w-full bg-white/5 border border-white/10 text-white rounded-xl px-2 py-1.5 text-xs outline-none focus:border-[var(--mod-corrida-to)] transition" />
              </div>
            </div>
          )}

          {/* Main Manual Fields */}
          <div className="mb-3">
            <label className="text-[11px] font-semibold text-slate-500 block mb-1">
              {isRepeatType ? 'Distância total (km, opcional)' : 'Distância (km)'}
            </label>
            <div className="relative">
              <input 
                type="number" min="0" step="0.01" 
                placeholder="0.00" 
                value={runDistance} onChange={e => { setRunDistance(e.target.value); setIsFormDirty(true); }}
                className="w-full bg-slate-50/50 border border-slate-200 rounded-xl pl-3 pr-10 py-2.5 text-sm text-white outline-none focus:border-[var(--mod-corrida-to)] transition" 
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[12px] font-medium text-slate-400 pointer-events-none">km</span>
            </div>
          </div>
          
          <div className="mb-4">
            <label className="text-[11px] font-semibold text-slate-500 block mb-1">
              {isRepeatType ? 'Duração total (ex.: 43m ou 37:57)' : (runKind==='competicao' ? 'Tempo pessoal (ex.: 1:11:26)' : 'Duração (ex.: 43m ou 37:57)')}
            </label>
            <input
              type="text"
              placeholder="00:00"
              value={runDuration} onChange={e => { setRunDuration(e.target.value); setIsFormDirty(true); }}
              className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-[var(--mod-corrida-to)] transition"
            />
          </div>

          {showToggle && (
            <div className="mb-4">
              <label className="text-[11px] text-slate-500 mb-1.5 block">Como queres registar?</label>
              <div className="flex gap-1.5">
                <Chip
                  active={entryMethod === 'foto'}
                  variant="run"
                  rounded="xl"
                  onClick={() => setEntryMethod('foto')}
                  className="flex-1 py-2.5 gap-1.5"
                  type="button"
                >
                  <Camera size={14} /> Foto (IA)
                </Chip>
                <Chip
                  active={entryMethod === 'manual'}
                  variant="run"
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

          {showFotoBlock ? (
            <>
              {runPhotos.length > 0 ? (
                <>
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {runPhotos.map((p, i) => (
                      <div key={i} className="relative aspect-square">
                        <img src={p.dataUrl} className="w-full h-full object-cover rounded-xl border border-slate-200" alt={`Print ${i+1}`} />
                        <button onClick={() => removePhoto(i)} style={{ color: '#fff' }} className="absolute top-1 right-1 bg-slate-900/80 rounded-full p-1 hover:bg-red-500 transition">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[11px] text-slate-500">{runPhotos.length} print(s) · máx {MAX_PHOTOS}</span>
                    <button onClick={() => { setRunPhotos([]); setIsFormDirty(true); }} className="text-[11px] text-slate-500 hover:text-red-400 flex items-center gap-1 transition">
                      <Trash2 className="w-3.5 h-3.5" /> Limpar todos
                    </button>
                  </div>
                  {runPhotos.length < MAX_PHOTOS && (
                    <label className="flex items-center justify-center gap-2 border-2 border-dashed border-[var(--mod-corrida-to)]/40 rounded-xl py-3 text-center cursor-pointer hover:bg-[var(--mod-corrida-to)]/5 transition mb-3">
                      <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoSelected} />
                      <ImagePlus className="w-4 h-4 text-[var(--mod-corrida-to)]" />
                      <span className="text-[12px] font-bold text-[var(--mod-corrida-to)]">Adicionar outro print</span>
                    </label>
                  )}
                </>
              ) : (
                <label className="block border-2 border-dashed border-slate-300 rounded-xl py-6 text-center cursor-pointer hover:border-slate-400 transition mb-3 bg-white/50">
                  <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoSelected} />
                  <ImagePlus className="w-7 h-7 text-slate-400 mx-auto mb-2" />
                  <p className="text-[11px] text-slate-500 font-bold">Escolhe os prints da app de corrida (Strava, Garmin...)</p>
                  <p className="text-[10px] text-slate-400 mt-1 px-4">A IA lê a distância, duração, tipo de treino e splits automaticamente</p>
                </label>
              )}

              <CoachAnalyzeButton
                onClick={handleAnalyzeRun}
                disabled={!runPhotos.length || analyzingRun}
                busy={analyzingRun}
                label="Analisar Corrida"
              />
            </>
          ) : (
            <>
          {runIdToEdit && runPhotos.length > 0 && (
            <div className="mb-4">
              <label className="text-[11px] text-slate-500 mb-1.5 block">Prints carregados</label>
              <div className="grid grid-cols-3 gap-2">
                {runPhotos.map((p, i) => (
                  <div key={i} className="relative aspect-square">
                    <img src={p.url || p.dataUrl} className="w-full h-full object-cover rounded-xl border border-slate-200" alt={`Print ${i+1}`} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Metrics Grid inside Organized Sub-containers */}
          <div className="space-y-3 mb-4">
            {/* Relógio & Fisiologia */}
            <div className="rounded-xl border border-white/10 bg-white/5 text-white p-3">
              <p className="text-[12px] font-bold text-slate-300 mb-2.5 flex items-center justify-between">
                <span>Fisiologia & Relógio</span>
                <span className="text-[10px] font-normal text-slate-400">opcional</span>
              </p>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 block mb-1">Desnível subida (m)</label>
                  <input 
                    type="number" placeholder="Ex: 120" 
                    value={elevationGain} onChange={e=>{setElevationGain(e.target.value); setIsFormDirty(true);}} 
                    className="w-full bg-white/5 border border-white/10 text-white rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-slate-400 transition" 
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 block mb-1">Desnível descida (m)</label>
                  <input 
                    type="number" placeholder="Ex: 80" 
                    value={elevationLoss} onChange={e=>{setElevationLoss(e.target.value); setIsFormDirty(true);}} 
                    className="w-full bg-white/5 border border-white/10 text-white rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-slate-400 transition" 
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 block mb-1">Cadência média (spm)</label>
                  <input
                    type="number" placeholder="Ex: 158"
                    value={cadence} onChange={e=>{setCadence(e.target.value); setIsFormDirty(true);}}
                    className="w-full bg-white/5 border border-white/10 text-white rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-slate-400 transition"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 block mb-1">Cadência máx (spm)</label>
                  <input
                    type="number" placeholder="Ex: 175"
                    value={maxCadence} onChange={e=>{setMaxCadence(e.target.value); setIsFormDirty(true);}}
                    className="w-full bg-white/5 border border-white/10 text-white rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-slate-400 transition"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 block mb-1">Calorias (kcal)</label>
                  <input
                    type="number" placeholder="Ex: 450"
                    value={calories} onChange={e=>{setCalories(e.target.value); setIsFormDirty(true);}} 
                    className="w-full bg-white/5 border border-white/10 text-white rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-slate-400 transition" 
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 block mb-1">VO2 máx</label>
                  <input 
                    type="number" step="0.1" placeholder="Ex: 48.5" 
                    value={vo2Max} onChange={e=>{setVo2Max(e.target.value); setIsFormDirty(true);}} 
                    className="w-full bg-white/5 border border-white/10 text-white rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-slate-400 transition" 
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 block mb-1">FC média (bpm)</label>
                  <input 
                    type="number" placeholder="Ex: 142" 
                    value={avgHeartRate} onChange={e=>{setAvgHeartRate(e.target.value); setIsFormDirty(true);}} 
                    className="w-full bg-white/5 border border-white/10 text-white rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-slate-400 transition" 
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 block mb-1">FC máxima (bpm)</label>
                  <input 
                    type="number" placeholder="Ex: 172" 
                    value={maxHeartRate} onChange={e=>{setMaxHeartRate(e.target.value); setIsFormDirty(true);}} 
                    className="w-full bg-white/5 border border-white/10 text-white rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-slate-400 transition" 
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 block mb-1">FC Limiar Aeróbio (bpm)</label>
                  <input 
                    type="number" placeholder="Ex: 145" 
                    value={aerobicThreshold} onChange={e=>{setAerobicThreshold(e.target.value); setIsFormDirty(true);}} 
                    className="w-full bg-white/5 border border-white/10 text-white rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-slate-400 transition" 
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 block mb-1">FC Limiar Anaeróbio (bpm)</label>
                  <input 
                    type="number" placeholder="Ex: 165" 
                    value={anaerobicThreshold} onChange={e=>{setAnaerobicThreshold(e.target.value); setIsFormDirty(true);}} 
                    className="w-full bg-white/5 border border-white/10 text-white rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-slate-400 transition" 
                  />
                </div>
              </div>
            </div>

            {/* Biomecânica de Corrida */}
            <div className="rounded-xl border border-white/10 bg-white/5 text-white p-3">
              <p className="text-[12px] font-bold text-slate-300 mb-2.5 flex items-center justify-between">
                <span>Biomecânica de Corrida</span>
                <span className="text-[10px] font-normal text-slate-400">opcional</span>
              </p>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 block mb-1">Contacto Solo (ms)</label>
                  <input 
                    type="number" placeholder="Ex: 215" 
                    value={groundContactTime} onChange={e=>{setGroundContactTime(e.target.value); setIsFormDirty(true);}} 
                    className="w-full bg-white/5 border border-white/10 text-white rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-slate-400 transition" 
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 block mb-1">Tempo de Voo (ms)</label>
                  <input 
                    type="number" placeholder="Ex: 190" 
                    value={flightTime} onChange={e=>{setFlightTime(e.target.value); setIsFormDirty(true);}} 
                    className="w-full bg-white/5 border border-white/10 text-white rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-slate-400 transition" 
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 block mb-1">Oscilação Vertical (cm)</label>
                  <input 
                    type="number" step="0.1" placeholder="Ex: 8.5" 
                    value={verticalOscillation} onChange={e=>{setVerticalOscillation(e.target.value); setIsFormDirty(true);}} 
                    className="w-full bg-white/5 border border-white/10 text-white rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-slate-400 transition" 
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 block mb-1">Assimetria (%)</label>
                  <input 
                    type="number" step="0.1" placeholder="Ex: 48.2" 
                    value={asymmetryPct} onChange={e=>{setAsymmetryPct(e.target.value); setIsFormDirty(true);}} 
                    className="w-full bg-white/5 border border-white/10 text-white rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-slate-400 transition" 
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 block mb-1">Rigidez Perna (kN/m)</label>
                  <input 
                    type="number" step="0.1" placeholder="Ex: 11.5" 
                    value={legStiffness} onChange={e=>{setLegStiffness(e.target.value); setIsFormDirty(true);}} 
                    className="w-full bg-white/5 border border-white/10 text-white rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-slate-400 transition" 
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 block mb-1">Pace máx (min/km)</label>
                  <input 
                    type="text" placeholder="Ex: 4:15" 
                    value={maxPace} onChange={e=>{setMaxPace(e.target.value); setIsFormDirty(true);}} 
                    className="w-full bg-white/5 border border-white/10 text-white rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-slate-400 transition" 
                  />
                </div>
              </div>
            </div>

            {/* Hidratação & Passos */}
            <div className="rounded-xl border border-white/10 bg-white/5 text-white p-3">
              <p className="text-[12px] font-bold text-slate-300 mb-2.5 flex items-center justify-between">
                <span>Hidratação & Atividade</span>
                <span className="text-[10px] font-normal text-slate-400">opcional</span>
              </p>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 block mb-1">Perda transpiração (ml)</label>
                  <input 
                    type="number" placeholder="Ex: 850" 
                    value={sweatLossMl} onChange={e=>{setSweatLossMl(e.target.value); setIsFormDirty(true);}} 
                    className="w-full bg-white/5 border border-white/10 text-white rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-slate-400 transition" 
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 block mb-1">Passos totais</label>
                  <input 
                    type="number" placeholder="Ex: 12500" 
                    value={totalSteps} onChange={e=>{setTotalSteps(e.target.value); setIsFormDirty(true);}} 
                    className="w-full bg-white/5 border border-white/10 text-white rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-slate-400 transition" 
                  />
                </div>
              </div>
            </div>
          </div>

            {/* FC Zones */}
            <div className="rounded-xl border border-white/10 bg-white/5 text-white p-3 mb-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-[12px] font-bold text-slate-300">Zonas de FC (tempo em cada zona)</label>
                <AddButton
                  onClick={() => { setHrZones([...hrZones, { zone: '', minutes: '' }]); setIsFormDirty(true); }}
                  variant="run"
                  type="button"
                >
                  Adicionar Zona
                </AddButton>
              </div>
              {hrZones.length === 0 ? (
                <p className="text-[11px] text-slate-400">Sem zonas ainda — usa "Adicionar zona" para cada uma que o relógio mostrar.</p>
              ) : (
                hrZones.map((z, idx) => (
                  <div key={idx} className="flex items-center gap-1.5 mb-1.5">
                    <select 
                      value={z.zone} 
                      onChange={e => { const copy = [...hrZones]; copy[idx].zone = e.target.value; setHrZones(copy); setIsFormDirty(true); }} 
                      className="bg-slate-100/50 border border-slate-200 rounded-xl px-2 py-2 text-xs text-white outline-none"
                    >
                      <option value="">Zona</option>
                      {[1,2,3,4,5].map(n => <option key={n} value={n}>Z{n}</option>)}
                    </select>
                    <input 
                      type="number" placeholder="Minutos" 
                      value={z.minutes} 
                      onChange={e => { const copy = [...hrZones]; copy[idx].minutes = e.target.value; setHrZones(copy); setIsFormDirty(true); }} 
                      className="w-full bg-slate-100/50 border border-slate-200 rounded-xl px-2 py-2 text-xs text-white outline-none" 
                    />
                    <button 
                      onClick={() => { setHrZones(hrZones.filter((_, i) => i !== idx)); setIsFormDirty(true); }} 
                      type="button" 
                      className="p-1 text-slate-400 hover:text-red-500"
                    >
                      <X className="w-3.5 h-3.5"/>
                    </button>
                  </div>
                ))
              )}
            </div>

          {/* Repeat Specifics */}
          {runKind === 'treino' && isRepeatType && (
            <div className="bg-white/5 rounded-xl p-3 border border-white/10 text-white mb-4">
              <p className="text-[12px] font-semibold text-slate-500 mb-2">Estrutura da Sessão</p>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div>
                  <label className="text-[10px] text-slate-500 block mb-1">Aquecimento (min)</label>
                  <input type="number" value={warmupMinutes} onChange={e => { setWarmupMinutes(e.target.value); setIsFormDirty(true); }} className="w-full bg-white/5 border border-white/10 text-white rounded-xl px-2 py-1.5 text-xs outline-none" />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 block mb-1">Recuperação (seg)</label>
                  <input type="number" value={recoverySeconds} onChange={e => { setRecoverySeconds(e.target.value); setIsFormDirty(true); }} className="w-full bg-white/5 border border-white/10 text-white rounded-xl px-2 py-1.5 text-xs outline-none" />
                </div>
              </div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px] text-slate-500">Splits (voltas)</label>
                <AddButton
                  onClick={() => { setSplits([...splits, { distance_km: '', minutes: '' }]); setIsFormDirty(true); }}
                  variant="run"
                  type="button"
                >
                  Adicionar Split
                </AddButton>
              </div>
              {splits.map((s, i) => (
                <div key={i} className="flex gap-1 mb-1.5 items-center">
                  <span className="text-[10px] text-slate-400 w-3">{i+1}.</span>
                  <input type="number" step="0.01" placeholder="km" value={s.distance_km} onChange={e => { const newSplits = [...splits]; newSplits[i].distance_km = e.target.value; setSplits(newSplits); setIsFormDirty(true); }} className="w-20 bg-white/5 border border-white/10 text-white rounded-xl px-2 py-1 text-xs" />
                  <input type="text" placeholder="Tempo" value={s.minutes} onChange={e => { const newSplits = [...splits]; newSplits[i].minutes = e.target.value; setSplits(newSplits); setIsFormDirty(true); }} className="flex-1 bg-white/5 border border-white/10 text-white rounded-xl px-2 py-1 text-xs" />
                  <button onClick={() => { setSplits(splits.filter((_, idx) => idx !== i)); setIsFormDirty(true); }} type="button"
                    aria-label={`Remover parcial ${i + 1}`}
                    className="tap-44 text-slate-400 hover:text-red-500 shrink-0"><X className="w-3.5 h-3.5"/></button>
                </div>
              ))}
            </div>
          )}

          {runIdToEdit ? (
            <CoachAnalyzeButton
              onClick={() => handleSaveCorrida(false, needsReanalysis)}
              disabled={isSubmitting}
              busy={isSubmitting}
              label={needsReanalysis ? "Guardar e Reanalisar" : "Guardar Alterações"}
            />
          ) : (
            // passam pelo Coach, por isso têm o mesmo botão.
            <CoachAnalyzeButton
              onClick={handleSaveCorrida}
              disabled={isSubmitting}
              busy={isSubmitting}
              label="Analisar Corrida"
            />
          )}
            </>
          )}

          {errorMsg && <p className="text-red-500 text-[13px] font-medium mt-3">{errorMsg}</p>}
        </div>
      </div>
    );
  };

  return (
    <div className="w-full max-w-lg mx-auto pb-10">
      {renderCorridaForm()}

      {/* Modal Bottom Sheet para métricas em falta */}
      <MissingMetricsBottomSheet
        isOpen={showMissingMetricsSheet}
        missingKeys={missingKeysList}
        onAddPhotos={() => {
          setShowMissingMetricsSheet(false);
          setEntryMethod('foto');
        }}
        onGoManual={() => {
          setShowMissingMetricsSheet(false);
          setEntryMethod('manual');
        }}
        onProceedAnyway={handleProceedAnyway}
        onClose={() => {
          setShowMissingMetricsSheet(false);
          setSheetClosedViaTouch(true);
        }}
      />

      {/* Botão flutuante para reabrir o Bottom Sheet quando fechado pelo traço */}
      {sheetClosedViaTouch && !showMissingMetricsSheet && missingKeysList.length > 0 && (
        <button
          type="button"
          onClick={() => setShowMissingMetricsSheet(true)}
          className="fixed bottom-20 right-5 z-[90] text-white font-bold text-xs rounded-xl px-4 py-2.5 shadow-[0_8px_30px_rgb(0,0,0,0.12)] flex items-center gap-2 transition active:scale-95 animate-bounce hover:opacity-90"
          style={{ background: 'linear-gradient(135deg, var(--mod-coach-from), var(--mod-coach-to))' }}
        >
          <Sparkles className="w-4 h-4 text-white" />
          <span>Métricas em falta ({missingKeysList.length})</span>
        </button>
      )}

      {/* Modal de confirmação de saída com alterações por gravar */}
      <UnsavedChangesModal
        isOpen={showUnsavedModal}
        isSaving={isSubmitting}
        onSaveAndLeave={handleSaveCorrida}
        onDiscardAndLeave={handleClose}
        onCancel={() => { pendingNavTarget.current = null; setShowUnsavedModal(false); }}
      />
    </div>
  );
}
