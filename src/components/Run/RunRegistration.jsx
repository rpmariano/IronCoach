import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ImagePlus, X, Trash2, Sparkles, PencilLine, Camera, MessageSquare, Footprints, Trophy } from 'lucide-react';
import { useAppStore } from '../../store';
import { supabase, invokeEdgeFunctionWithTimeout } from '../../lib/supabase';
import { compressImage } from '../../lib/image';
import RaceMemoriesFields from './RaceMemoriesFields';
import { pickDiploma, pickMedal, pickPhotos, signRaceMemories, persistRaceMemories as persistRaceMemoriesShared } from '../../utils/raceMemories';
import { CoachAnalyzeButton } from '../shared/CoachButton';
import { AnalysisSkeleton, AnalysisFailure } from '../shared/AnalysisState';
import useAnalysis from '../../utils/useAnalysis';
import SectionLabel from '../shared/SectionLabel';
import GlassCard from '../shared/GlassCard';
import Warning, { WarningAction } from '../shared/Warning';
import {
  parseDurationToSeconds, formatDuration, parsePaceToSeconds, formatPace,
  raceDistanceLabel, raceTerrainLabel, formatTargetTimeLabel,
} from '../../utils/run';
import { shoeLabel } from '../../utils/shoes';
import { formatDatePTShort } from '../../utils/racePlanEngine';
import { achievementsForRace } from '../../utils/achievements';
import { raceResultSeconds } from '../../utils/raceOutcome';
import { todayISO } from '../../lib/utils';
import MissingMetricsBottomSheet from './MissingMetricsBottomSheet';
import UnsavedChangesModal from '../shared/UnsavedChangesModal';
import RecordConfirmation from '../shared/RecordConfirmation';
import RunTrainingTypeHelp from '../shared/RunTrainingTypeHelp';
import Chip from '../shared/Chip';
import AddButton from '../shared/AddButton';
import Button from '../shared/Button';
import ActionBar, { ACTION_BAR_SCROLL_PAD } from '../shared/ActionBar';
import { usePersistedFormDraft, restorePersistedFormDraft, clearPersistedFormDraft } from '../../utils/formDraftPersistence';
import { normalizeStartTime, startTimeInputValue } from '../../utils/startTime';
import { isRacePlanItem } from '../../utils/homeModels';

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

// Convert "43m" or "37:57" or "1:11:26" to seconds
const MAX_PHOTOS = 6; // espelha MAX_PHOTOS em supabase/functions/analyze-run

// ── Modo prova (specs/prova-concluida.md) ───────────────────────────────────
// As memórias (diploma, medalha, fotografias do dia) vivem na prova, não na
// corrida, e a sua lógica está em utils/raceMemories.js — partilhada com a
// persiana do hub, onde também se juntam depois de a prova estar concluída.
// Provas a ±7 dias entram no seletor "Qual prova?" — o registo faz-se no dia
// ou nos dias seguintes, e às vezes a data da agenda ficou um dia ao lado.
const RACE_PICKER_WINDOW_DAYS = 7;

function daysBetweenIso(a, b) {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);
}

/* A disciplina do REGISTO (runs.details.race_type, a lista COMPLETED_RACE_TYPES
   acima) a partir da prova da AGENDA: race_events.race_type só distingue o
   piso (estrada/trail) e guarda a distância num campo à parte. São dois enums
   diferentes de propósito — isto é a ponte entre eles. */
function raceTypeFromRaceEvent(ev) {
  if (!ev) return null;
  if (ev.race_type === 'trail') return 'trail';
  const km = Number(ev.distance_km || 0);
  if (Math.abs(km - 5) < 0.3) return '5k';
  if (Math.abs(km - 10) < 0.3) return '10k';
  if (Math.abs(km - 21.0975) < 0.6) return '21k';
  if (Math.abs(km - 42.195) < 0.6) return '42k';
  return 'estrada';
}

// A Agenda de Provas (raceEvents) tem o próprio formulário dedicado em
// RunAgenda.jsx — este componente só regista corridas (tabela runs).
export default function RunRegistration({ onClose, dateIso = null, runIdToEdit = null }) {
  const { profile, runs, setRuns, setNavGuard, activeTab, shoes, raceEvents } = useAppStore();
  const [initialTab] = useState(activeTab);

  

  // Item do plano que esta corrida vai concluir, se veio do botão "Concluir"
  // no Início (ver Home.jsx e specs/plano-de-treino.md §5.2). Consumido uma
  // única vez no mount seguinte; guardado num ref para o handler de gravação
  // saber a que item ligar o registo, sem precisar de o repetir no estado.
  const completingPlanItemRef = useRef(
    !runIdToEdit ? useAppStore.getState().planItemPrefill : null
  );
  const planItem = completingPlanItemRef.current?.kind === 'corrida' ? completingPlanItemRef.current : null;

  /* ── MODO PROVA (specs/prova-concluida.md §3) ──────────────────────────────
     A prova que esta corrida vem concluir. Chega de três sítios — o hub, o
     cartão do Início e o cartão da agenda — sempre pelo mesmo campo do store
     (runRacePrefill, posto por openRaceRun), consumido UMA vez ao montar. A
     editar uma corrida já gravada vem do próprio registo (runs.race_id), mais
     abaixo; e o seletor "Qual prova?" do FAB escreve diretamente no estado. */
  const runRacePrefillRef = useRef(
    !runIdToEdit ? useAppStore.getState().runRacePrefill : null
  );
  const initialRace = runRacePrefillRef.current?.raceId
    ? (useAppStore.getState().raceEvents || []).find(e => e.id === runRacePrefillRef.current.raceId) || null
    : null;
  const [raceId, setRaceId] = useState(initialRace?.id || null);
  const raceEvent = raceId ? (raceEvents || []).find(e => e.id === raceId) || null : null;
  // O modo prova exige a prova: sem ela em memória, isto é uma competição
  // fora da agenda e o ecrã é o de sempre.
  const isRaceMode = !!raceEvent;

  // Identifica este rascunho de forma única para sobreviver a um
  // recarregamento (ver formDraftPersistence.js) — nunca partilhado entre
  // corridas diferentes nem entre uma edição e uma criação nova a seguir.
  const draftStorageKey = runIdToEdit ? `ironcoach:corrida-rascunho:${runIdToEdit}` : 'ironcoach:corrida-rascunho:nova';
  // Só tenta restaurar UMA VEZ por sessão de edição/criação — sem isto, o
  // efeito de carregamento reporia o rascunho guardado por cima de
  // alterações mais recentes ainda não persistidas.
  const restoredForKeyRef = useRef(null);

  // --- RUNS STATE ---
  const [runKind, setRunKind] = useState(planItem?.isRace || initialRace ? 'competicao' : 'treino'); // 'treino' | 'competicao'
  const [runTrainingType, setRunTrainingType] = useState(planItem?.training_type || 'continuo');
  const [runDate, setRunDate] = useState(initialRace?.date || planItem?.planned_date || dateIso || todayISO());
  /* Hora de início ('HH:MM', hora local) — opcional, e sem valor por omissão:
     inventar "agora" enchia a coluna de horas que ninguém confirmou. O que a
     pré-preenche é uma hora que já foi decidida noutro sítio: a partida da
     prova, no modo prova, ou o item do plano quando o vier a trazer (hoje o
     plano ainda não tem hora — ver coach_plan_items). Ver
     specs/plano-de-prova.md, "A véspera e a hora". */
  const [runStartTime, setRunStartTime] = useState(
    startTimeInputValue(initialRace?.start_time || planItem?.start_time)
  );
  const [runName, setRunName] = useState(initialRace?.name || planItem?.title || 'Corrida de Hoje');
  // Par usado nesta corrida — é daqui que sai o acumulado de km do armário
  // (Perfil → Equipamento). Fica fora da analyticalSignature de propósito:
  // trocar o par não muda a análise do Coach, por isso não deve custar uma
  // reanálise (ver needsReanalysis, mais abaixo).
  const [shoeId, setShoeId] = useState(null);
  /* Só pares ativos entram na lista — um par aposentado já não se calça. A
     exceção é o par que ESTA corrida já tem: se foi aposentado depois de a
     corrida ter sido registada, tem de continuar a aparecer, senão editar a
     corrida perdia silenciosamente a associação. */
  const activeShoes = (shoes || []).filter(s => s.status !== 'aposentada' || s.id === shoeId);
  
  // Basic metrics
  const [runDistance, setRunDistance] = useState(
    initialRace?.distance_km ? String(initialRace.distance_km)
      : planItem?.target_distance_km ? String(planItem.target_distance_km) : ''
  );
  const [runDuration, setRunDuration] = useState(planItem?.target_duration ? formatDuration(planItem.target_duration) : '');
  const [runEffortRpe, setRunEffortRpe] = useState(0); // 0-10
  const [runNotes, setRunNotes] = useState('');
  
  // Detailed metrics
  const [elevationGain, setElevationGain] = useState(
    initialRace?.elevation_gain_m ? String(initialRace.elevation_gain_m)
      : planItem?.elevation_gain_m ? String(planItem.elevation_gain_m) : ''
  );
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
  // Em modo prova o tempo oficial começa VAZIO — é o resultado, e pré-enchê-lo
  // com o objetivo da prova seria pôr na boca do atleta um número que ele
  // ainda não disse.
  const [officialTime, setOfficialTime] = useState(
    !initialRace && planItem?.target_duration ? formatDuration(planItem.target_duration) : ''
  );
  const [position, setPosition] = useState('');
  const [completedRaceType, setCompletedRaceType] = useState(
    raceTypeFromRaceEvent(initialRace) || planItem?.race_type || '10k'
  );

  /* Memórias da prova — vivem em race_events, não em runs (specs §2). Cada
     uma é { dataUrl?, blob?, url?, path?, isPdf?, name? }: `blob` só existe
     enquanto o ficheiro é novo e está por enviar; `path`/`url` são o que já
     está no bucket (e a sua signed URL) ao editar. */
  const [diploma, setDiploma] = useState(null);
  const [medal, setMedal] = useState(null);
  const [racePhotos, setRacePhotos] = useState([]);
  // Recusa na ESCOLHA do ficheiro (tamanho, formato ilegível) — imediata.
  const [memoryError, setMemoryError] = useState('');
  // Falha no ENVIO, já com a corrida gravada: aí não se perde nada, mostra-se
  // o aviso com "Tentar de novo" (mesmo padrão do useAnalysis).
  const [memoriesFailed, setMemoriesFailed] = useState(false);
  const [savingMemories, setSavingMemories] = useState(false);
  const savedRaceRunRef = useRef(null);

  // Photos
  const [runPhotos, setRunPhotos] = useState([]); // [{ file?, dataUrl, url? }]
  /* Ponto 7 do redesenho: o mesmo par espera/erro da Refeição
     (src/utils/useAnalysis.js). Só a análise por foto passa por aqui — o
     registo manual (handleSaveCorrida) é uma gravação, não uma leitura de
     print, e fica com o `errorMsg` de sempre. */
  const analysis = useAnalysis();
  const analyzingRun = analysis.isAnalyzing;
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

  // Ao gravar uma corrida NOVA (foto ou manual), vai sempre para o
  // Calendário, aberto no dia da corrida — mesmo padrão de RunAgenda.jsx
  // (Prova) via pendingCalendarDate no store. Se isto veio de "Gravar e
  // sair" a caminho de outro separador (navGuard intercetado), respeita
  // esse destino em vez de o substituir — por isso o alvo pendente é lido
  // ANTES de handleClose() o consumir.
  /* Ponto 9, animação 6 ("Registo confirmado"): o check com impulso
     elástico corre PRIMEIRO e só depois é que o ecrã fecha e leva ao
     destino de sempre. O CreatedRecordModal continua lá — traz o cartão
     analisado e o "Falar com a Carol", que o atleta precisa de ver. */
  const [confirmation, setConfirmation] = useState(null);

  const finishCreateAndGoToCalendar = (createdRecord, label = 'Corrida registada') => {
    const hadPendingNav = !!pendingNavTarget.current;
    setConfirmation({ label, done: () => {
      handleClose();
      if (!hadPendingNav) {
        setNavGuard(null);
        if (createdRecord) {
          useAppStore.getState().setNewlyCreatedRecord({ type: 'run', record: createdRecord });
        }
        useAppStore.getState().setPendingCalendarDate(runDate);
        useAppStore.getState().setActiveTab('calendario');
      }
    } });
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
    const store = useAppStore.getState();
    if (completingPlanItemRef.current) store.clearPlanItemPrefill();
    // Limpa-se SEMPRE que exista, não só quando foi consumido: a editar uma
    // corrida já gravada (o hub a reabrir o registo para as memórias) o ref
    // fica a null de propósito, mas o store ficava com o prefill — e o
    // "Nova corrida" seguinte abria em modo prova dessa prova e gravava uma
    // segunda corrida ligada a ela (apanhado na revisão pré-deploy).
    if (store.runRacePrefill) store.clearRunRacePrefill();
  }, []);

  /* Seletor "Qual prova?" do FAB → chip "Competição": as provas agendadas a
     ±7 dias de hoje, mais "Prova fora da agenda". Fora desta janela a
     resposta certa é a agenda, não este ecrã. */
  const racePickerOptions = useMemo(() => {
    const hoje = todayISO();
    return (raceEvents || [])
      .filter(e => e?.date && e.status === 'agendada' && Math.abs(daysBetweenIso(e.date, hoje)) <= RACE_PICKER_WINDOW_DAYS)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [raceEvents]);

  /* Escolher uma prova entra no modo prova e traz o que a prova já sabe — o
     que aqui não se edita (nome, data, distância, piso) tem mesmo de vir
     dela, senão o cabeçalho do bloco "A prova" e o registo divergiam. */
  const applyRaceSelection = (id) => {
    const ev = id ? (raceEvents || []).find(e => e.id === id) || null : null;
    setRaceId(ev?.id || null);
    setIsFormDirty(true);
    if (!ev) return;
    setRunKind('competicao');
    setRunName(ev.name || 'Corrida de Hoje');
    setRunDate(ev.date);
    // A hora da prova só se impõe se ainda não houver uma escrita aqui.
    if (!runStartTime && ev.start_time) setRunStartTime(startTimeInputValue(ev.start_time));
    setCompletedRaceType(raceTypeFromRaceEvent(ev));
    if (!runDistance && ev.distance_km) setRunDistance(String(ev.distance_km));
    if (!elevationGain && ev.elevation_gain_m) setElevationGain(String(ev.elevation_gain_m));
  };

  // Assinatura do que é analítico. Normaliza (descarta vazios, ordena
  // chaves) para que o objeto vindo da BD e o construído a partir do
  // formulário sejam comparáveis campo a campo.
  const analyticalSignature = (v) => JSON.stringify({
    date: v.date,
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
        // Rascunho por gravar guardado localmente (ver
        // formDraftPersistence.js) sobrepõe-se ao valor canónico vindo do
        // servidor — restaura-se UMA VEZ por sessão de edição
        // (restoredForKeyRef), senão este efeito repunha-o a cada vez que
        // voltasse a correr (ex.: `runs` muda por uma reanálise em paralelo).
        const alreadyRestored = restoredForKeyRef.current === draftStorageKey;
        const persisted = alreadyRestored ? null : restorePersistedFormDraft(draftStorageKey);
        restoredForKeyRef.current = draftStorageKey;

        const d = r.details || {};
        const canonicalSplits = d.splits ? d.splits.map(s => ({ distance_km: s.distance_km || '', minutes: s.time_seconds ? formatDuration(s.time_seconds) : '' })) : [];
        const canonicalHrZones = d.hr_zones ? d.hr_zones.map(z => ({ zone: z.zone || '', minutes: z.minutes || '' })) : [];

        setEntryMethod(persisted?.entryMethod ?? 'manual');
        setRunKind(persisted?.runKind ?? (r.kind || 'treino'));
        setRunTrainingType(persisted?.runTrainingType ?? (r.training_type || 'continuo'));
        setRunDate(persisted?.runDate ?? (r.date || todayISO()));
        // A BD devolve 'HH:MM:SS'; o input só fala 'HH:MM' (ver startTime.js).
        setRunStartTime(persisted?.runStartTime ?? startTimeInputValue(r.start_time));
        setRunName(persisted?.runName ?? (r.name || ''));
        setRunDistance(persisted?.runDistance ?? (r.distance_km || ''));
        setRunDuration(persisted?.runDuration ?? (r.duration_seconds ? formatDuration(r.duration_seconds) : ''));
        setRunEffortRpe(persisted?.runEffortRpe ?? (r.effort_rpe || 0));
        setRunNotes(persisted?.runNotes ?? (r.notes || ''));
        setShoeId(persisted?.shoeId ?? (r.shoe_id || null));

        setElevationGain(persisted?.elevationGain ?? (d.elevation_gain_m || ''));
        setCadence(persisted?.cadence ?? (d.cadence_spm || ''));
        setMaxCadence(persisted?.maxCadence ?? (d.max_cadence_spm || ''));
        setCalories(persisted?.calories ?? (d.calories_kcal || ''));
        setVo2Max(persisted?.vo2Max ?? (d.vo2_max || ''));
        setAvgHeartRate(persisted?.avgHeartRate ?? (d.avg_heart_rate_bpm || ''));
        setMaxHeartRate(persisted?.maxHeartRate ?? (d.max_heart_rate_bpm || ''));

        setSweatLossMl(persisted?.sweatLossMl ?? (d.sweat_loss_ml || ''));
        setTotalSteps(persisted?.totalSteps ?? (d.total_steps || ''));
        setMaxPace(persisted?.maxPace ?? (d.max_pace_seconds_per_km ? formatPace(d.max_pace_seconds_per_km) : ''));
        setElevationLoss(persisted?.elevationLoss ?? (d.elevation_loss_m || ''));
        setAerobicThreshold(persisted?.aerobicThreshold ?? (d.aerobic_threshold_bpm || ''));
        setAnaerobicThreshold(persisted?.anaerobicThreshold ?? (d.anaerobic_threshold_bpm || ''));
        setHrRecovery(persisted?.hrRecovery ?? (d.hr_recovery_bpm || ''));
        setGroundContactTime(persisted?.groundContactTime ?? (d.ground_contact_time_ms || ''));
        setFlightTime(persisted?.flightTime ?? (d.flight_time_ms || ''));
        setVerticalOscillation(persisted?.verticalOscillation ?? (d.vertical_oscillation_cm || ''));
        setAsymmetryPct(persisted?.asymmetryPct ?? (d.asymmetry_pct || ''));
        setLegStiffness(persisted?.legStiffness ?? (d.leg_stiffness_kn_m || ''));

        setWarmupMinutes(persisted?.warmupMinutes ?? (d.warmup_minutes || ''));
        setRecoverySeconds(persisted?.recoverySeconds ?? (d.recovery_seconds || ''));
        setSplits(persisted?.splits ?? canonicalSplits);
        setHrZones(persisted?.hrZones ?? canonicalHrZones);

        setOfficialTime(persisted?.officialTime ?? (d.official_time_seconds ? formatDuration(d.official_time_seconds) : ''));
        setPosition(persisted?.position ?? (d.position || ''));
        setCompletedRaceType(persisted?.completedRaceType ?? (d.race_type || '10k'));
        // Uma corrida já ligada a uma prova reabre SEMPRE em modo prova — é
        // assim que se voltam a ver (e a corrigir) as memórias já guardadas.
        setRaceId(persisted?.raceId ?? (r.race_id || null));

        // Distância, duração, RPE, tipo e métricas são dados ANALÍTICOS:
        // mudá-los muda a análise, e guardar passa pelo Coach para a
        // regenerar. Mudar só a data ou o nome é update direto, sem custo de
        // API (mesmo padrão da Nutrição/Ginásio/Corpo — ver PRD 3.2). A
        // assinatura de partida compara sempre contra o valor CANÓNICO (do
        // servidor), nunca contra o rascunho restaurado — é assim que um
        // rascunho com métricas diferentes das gravadas dispara "Reanalisar"
        // já na primeira renderização.
        setOriginalSnapshot(analyticalSignature({
          date: r.date,
          kind: r.kind || 'treino',
          trainingType: r.training_type || 'continuo',
          distance: r.distance_km,
          duration: r.duration_seconds,
          rpe: r.effort_rpe,
          notes: r.notes || null,
          details: r.details,
        }));
        if (persisted) setIsFormDirty(true);

        // Load photos (são privadas, precisamos de signed URLs) — nunca
        // vindas do rascunho persistido (ver usePersistedFormDraft abaixo).
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

  /* Memórias JÁ guardadas nesta prova — o bucket race-memories é privado, por
     isso assinam-se na hora, como os prints acima. Depende dos CAMINHOS (não
     do objeto da prova, que muda de identidade a cada render do store) e
     nunca pisa um ficheiro novo ainda por enviar (`blob`). */
  const memoryPathsKey = raceEvent
    ? JSON.stringify([raceEvent.diploma_path || null, raceEvent.medal_path || null, raceEvent.photo_paths || []])
    : '';
  useEffect(() => {
    const ev = raceEvent;
    if (!ev || (!ev.diploma_path && !ev.medal_path && !(ev.photo_paths || []).length)) return undefined;
    let cancelled = false;
    (async () => {
      const current = await signRaceMemories(ev);
      if (cancelled) return;
      if (current.diploma) setDiploma(prev => (prev?.blob ? prev : current.diploma));
      if (current.medal) setMedal(prev => (prev?.blob ? prev : current.medal));
      if (current.photos.length) setRacePhotos(prev => (prev.some(p => p.blob) ? prev : current.photos));
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memoryPathsKey]);

  // Restaura um rascunho de corrida NOVA por gravar (ver
  // formDraftPersistence.js) — o caminho de edição está no efeito acima.
  // Corre uma única vez por sessão de criação (restoredForKeyRef), sem
  // depender de `runs`, para não repor o rascunho por cima de alterações
  // recentes sempre que outra corrida é gravada em paralelo.
  useEffect(() => {
    if (runIdToEdit) return;
    if (restoredForKeyRef.current === draftStorageKey) return;
    restoredForKeyRef.current = draftStorageKey;
    const persisted = restorePersistedFormDraft(draftStorageKey);
    if (!persisted) return;
    if (persisted.entryMethod) setEntryMethod(persisted.entryMethod);
    if (persisted.runKind) setRunKind(persisted.runKind);
    if (persisted.runTrainingType) setRunTrainingType(persisted.runTrainingType);
    if (persisted.runDate) setRunDate(persisted.runDate);
    if (persisted.runStartTime !== undefined) setRunStartTime(persisted.runStartTime);
    if (persisted.runName !== undefined) setRunName(persisted.runName);
    if (persisted.shoeId !== undefined) setShoeId(persisted.shoeId);
    if (persisted.runDistance !== undefined) setRunDistance(persisted.runDistance);
    if (persisted.runDuration !== undefined) setRunDuration(persisted.runDuration);
    if (persisted.runEffortRpe !== undefined) setRunEffortRpe(persisted.runEffortRpe);
    if (persisted.runNotes !== undefined) setRunNotes(persisted.runNotes);
    if (persisted.elevationGain !== undefined) setElevationGain(persisted.elevationGain);
    if (persisted.cadence !== undefined) setCadence(persisted.cadence);
    if (persisted.maxCadence !== undefined) setMaxCadence(persisted.maxCadence);
    if (persisted.calories !== undefined) setCalories(persisted.calories);
    if (persisted.vo2Max !== undefined) setVo2Max(persisted.vo2Max);
    if (persisted.avgHeartRate !== undefined) setAvgHeartRate(persisted.avgHeartRate);
    if (persisted.maxHeartRate !== undefined) setMaxHeartRate(persisted.maxHeartRate);
    if (persisted.sweatLossMl !== undefined) setSweatLossMl(persisted.sweatLossMl);
    if (persisted.totalSteps !== undefined) setTotalSteps(persisted.totalSteps);
    if (persisted.maxPace !== undefined) setMaxPace(persisted.maxPace);
    if (persisted.elevationLoss !== undefined) setElevationLoss(persisted.elevationLoss);
    if (persisted.aerobicThreshold !== undefined) setAerobicThreshold(persisted.aerobicThreshold);
    if (persisted.anaerobicThreshold !== undefined) setAnaerobicThreshold(persisted.anaerobicThreshold);
    if (persisted.hrRecovery !== undefined) setHrRecovery(persisted.hrRecovery);
    if (persisted.groundContactTime !== undefined) setGroundContactTime(persisted.groundContactTime);
    if (persisted.flightTime !== undefined) setFlightTime(persisted.flightTime);
    if (persisted.verticalOscillation !== undefined) setVerticalOscillation(persisted.verticalOscillation);
    if (persisted.asymmetryPct !== undefined) setAsymmetryPct(persisted.asymmetryPct);
    if (persisted.legStiffness !== undefined) setLegStiffness(persisted.legStiffness);
    if (persisted.warmupMinutes !== undefined) setWarmupMinutes(persisted.warmupMinutes);
    if (persisted.recoverySeconds !== undefined) setRecoverySeconds(persisted.recoverySeconds);
    if (persisted.splits) setSplits(persisted.splits);
    if (persisted.hrZones) setHrZones(persisted.hrZones);
    if (persisted.officialTime !== undefined) setOfficialTime(persisted.officialTime);
    if (persisted.position !== undefined) setPosition(persisted.position);
    if (persisted.completedRaceType) setCompletedRaceType(persisted.completedRaceType);
    if (persisted.raceId !== undefined) setRaceId(persisted.raceId);
    setIsFormDirty(true);
  }, [runIdToEdit, draftStorageKey]);

  // Grava o rascunho (com debounce) enquanto houver alterações por gravar —
  // sobrevive a um recarregamento da página (ver formDraftPersistence.js).
  // Fotos ficam de fora de propósito: são grandes, a seleção do ficheiro/
  // picker não é restaurável depois de recarregar, e não são tipicamente o
  // que se está a meio de escrever quando se é interrompido. Isso vale
  // igualmente para as memórias da prova (diploma, medalha, fotografias):
  // seis imagens em dataUrl estouravam a quota do localStorage, e o que o
  // rascunho tem mesmo de guardar é a PROVA escolhida — sem ela, recarregar
  // a página caía no formulário de competição genérico.
  usePersistedFormDraft(draftStorageKey, {
    raceId,
    entryMethod, runKind, runTrainingType, runDate, runStartTime, runName, shoeId,
    runDistance, runDuration, runEffortRpe, runNotes,
    elevationGain, cadence, maxCadence, calories, vo2Max, avgHeartRate, maxHeartRate,
    sweatLossMl, totalSteps, maxPace, elevationLoss, aerobicThreshold, anaerobicThreshold,
    hrRecovery, groundContactTime, flightTime, verticalOscillation, asymmetryPct, legStiffness,
    warmupMinutes, recoverySeconds, splits, hrZones,
    officialTime, position, completedRaceType,
  }, { isDirty: isFormDirty });

  // Só regenera a análise se os dados analíticos mudaram (incluindo data, tipo, distância, etc.)
  const needsReanalysis = !!runIdToEdit
    && originalSnapshot !== null
    && analyticalSignature({
      date: runDate,
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
  // MEMÓRIAS DA PROVA (diploma, medalha, fotografias)
  // ----------------------------------
  // A leitura dos ficheiros (compressão, limite do PDF, teto de fotos) é a
  // do módulo partilhado; aqui só se guarda o resultado e se marca o
  // formulário como alterado.
  const handleDiplomaFile = async (file) => {
    const { memory, error } = await pickDiploma(file);
    setMemoryError(error);
    if (memory) { setDiploma(memory); setIsFormDirty(true); }
  };

  const handleMedalFile = async (file) => {
    const { memory, error } = await pickMedal(file);
    setMemoryError(error);
    if (memory) { setMedal(memory); setIsFormDirty(true); }
  };

  const handleRacePhotoFiles = async (files) => {
    const { added, error } = await pickPhotos(files, racePhotos.length);
    setMemoryError(error);
    if (added.length) { setRacePhotos(prev => [...prev, ...added]); setIsFormDirty(true); }
  };

  /* A corrida é gravada pela Edge Function analyze-run, que insere a linha em
     `runs` e não sabe nada de provas. Passar-lhe race_id obrigava a mexer numa
     função que faz deploy em produção a cada push a `dev` (ver CLAUDE.md), e a
     spec põe isso fora de âmbito — por isso a ligação faz-se AQUI, logo a
     seguir, com o id que ela devolve: um update de uma coluna, sob a mesma
     RLS "own rows" da tabela. */
  const linkRunToRace = async (run) => {
    if (!run?.id || !raceId) return run;
    const { error } = await supabase.from('runs').update({ race_id: raceId }).eq('id', run.id);
    if (error) throw error;
    return { ...run, race_id: raceId };
  };

  /* A hora de início toma o mesmo caminho do race_id acima, e pela mesma
     razão: quem escreve a linha em `runs` é a analyze-run, e acrescentar-lhe
     um campo obriga a mexer numa função que faz deploy em produção a cada
     push a `dev` (ver CLAUDE.md). É uma coluna só, sob a mesma RLS "own
     rows" — grava-se aqui, no ponto comum aos quatro caminhos de gravação
     (finishSavedRun). Não vai na analyticalSignature de propósito: mudar a
     hora não muda análise nenhuma, logo não custa uma reanálise. */
  const persistRunStartTime = async (run) => {
    if (!run?.id) return run;
    const value = normalizeStartTime(runStartTime);
    if (value === normalizeStartTime(run.start_time)) return run;
    const { error } = await supabase.from('runs').update({ start_time: value }).eq('id', run.id);
    if (error) throw error;
    return { ...run, start_time: value };
  };

  /* Envia o que é novo para o bucket e grava os caminhos na prova, junto
     com o status "concluida" — pelo módulo partilhado com a persiana do hub
     (utils/raceMemories.js), que é quem sabe dos nomes, do upsert e da
     limpeza do que deixou de ser referenciado. */
  const persistRaceMemories = () => persistRaceMemoriesShared({
    userId: profile?.id,
    raceId,
    current: (useAppStore.getState().raceEvents || []).find(e => e.id === raceId),
    diploma,
    medal,
    photos: racePhotos,
    extraPatch: { status: 'concluida' },
  });

  /* O dia da prova no plano (specs/plano-de-prova.md, "O plano tem de saber
     da prova"): o plano aceite tem nesse dia um item `corrida` com
     `training_type = 'prova'`, e é REGISTAR A PROVA que o conclui — o botão
     "Registar sessão" nem sequer aparece nesse dia, porque o registo que
     conta é este, em modo prova. Procura-se o item pela data DA PROVA (não
     pela do formulário: a corrida pode ter sido gravada noutro dia), e a
     data de conclusão é a do registo, como no caminho normal do plano.

     Falhar aqui não desfaz nada nem trava o fecho: a corrida e a prova já
     estão gravadas, e um item por marcar é muito menos mau do que perder o
     registo por causa dele. */
  const completeRacePlanItem = async () => {
    // Com prefill do plano, o caminho de sempre já marcou o item.
    if (!isRaceMode || !raceEvent?.date || completingPlanItemRef.current) return;
    const store = useAppStore.getState();
    const raceDate = String(raceEvent.date).slice(0, 10);
    const acceptedIds = new Set((store.coachPlans || []).filter(p => p.status === 'aceite').map(p => p.id));
    const item = (store.coachPlanItems || []).find(
      i => acceptedIds.has(i.plan_id) && i.status === 'pendente' && i.planned_date === raceDate && isRacePlanItem(i),
    );
    if (!item) return;
    try {
      await store.completePlanItem(item.id, { actualDate: runDate, runId: savedRaceRunRef.current?.id || null });
    } catch (err) {
      console.warn('Item de prova do plano não marcado como concluído', err);
    }
  };

  const persistRaceLinkAndMemories = async () => {
    const store = useAppStore.getState();
    const linked = await linkRunToRace(savedRaceRunRef.current);
    savedRaceRunRef.current = linked;
    if (linked?.id) {
      store.setRuns(store.runs.map(r => (r.id === linked.id ? { ...r, ...linked } : r)));
    }
    await completeRacePlanItem();
    const patch = await persistRaceMemories();
    store.setRaceEvents(store.raceEvents.map(e => (e.id === raceId ? { ...e, ...patch } : e)));
  };

  /* A conquista que ESTA prova acabou de dar (specs/gamificacao-provas.md
     §1). Corre depois de a corrida estar gravada, ligada à prova e a prova
     concluída — por isso lê o store, que já tem as três coisas, em vez de
     recalcular com os dados do formulário. Havendo mais do que uma, mostra-se
     a primeira e conta-se o resto; a lista completa fica no hub, para onde o
     atleta vai a seguir. */
  const novaConquistaDaProva = () => {
    const store = useAppStore.getState();
    // A que se mostra é a mais rara: "Prova concluída" toda a prova dá — se
    // esta também deu o objetivo ou um recorde, é isso que vai à frente.
    const prioridade = ['objetivo_batido', 'recorde_pessoal', 'primeira_trail', 'sequencia', 'prova_concluida'];
    const novas = achievementsForRace({ raceEvents: store.raceEvents, runs: store.runs, profile }, raceId)
      .filter((a) => a.isNew)
      .sort((a, b) => prioridade.indexOf(a.key) - prioridade.indexOf(b.key));
    if (!novas.length) return null;
    const resto = novas.length - 1;
    return { ...novas[0], extra: resto > 0 ? `+${resto} conquista${resto > 1 ? 's' : ''}` : null };
  };

  /* Modo prova: a confirmação é a da prova (âmbar, troféu, o nome dela) e o
     destino é o HUB, não o Calendário — é lá que estão o tempo final ao lado
     do objetivo, o balanço da Carol e a galeria das memórias. */
  const finishRaceAndGoToHub = () => {
    const hadPendingNav = !!pendingNavTarget.current;
    // "Meia de Lisboa concluída · 1:53:42" — o nome dela e o tempo que conta.
    const finalSeconds = raceResultSeconds(savedRaceRunRef.current);
    setConfirmation({
      label: `${raceEvent?.name || 'Prova'} concluída${finalSeconds ? ` · ${formatDuration(finalSeconds)}` : ''}`,
      tone: 'race',
      achievement: novaConquistaDaProva(),
      done: () => {
        handleClose();
        if (!hadPendingNav) {
          setNavGuard(null);
          useAppStore.getState().setEditingRaceId(raceId);
        }
      },
    });
  };

  /* Fecho comum dos quatro caminhos de gravação (foto/IA e manual, criar e
     editar). Fora do modo prova nada muda. Em modo prova, a corrida JÁ está
     gravada quando isto corre: se a ligação ou as memórias falharem, não se
     desfaz nada — fica o aviso com "Tentar de novo" e o atleta não perde o
     registo por causa de uma foto. */
  const finishSavedRun = async (savedRun, label) => {
    /* A hora é a primeira coisa a assentar, porque é comum aos quatro
       caminhos. Se falhar não se desfaz nada nem se bloqueia o fecho: é um
       campo opcional, e perder a corrida inteira por causa dele seria pior
       do que ficar sem a hora. */
    let run = savedRun;
    try {
      run = await persistRunStartTime(savedRun);
      if (run !== savedRun && run?.id) {
        const store = useAppStore.getState();
        store.setRuns(store.runs.map(r => (r.id === run.id ? { ...r, start_time: run.start_time } : r)));
      }
    } catch (err) {
      console.warn('Hora de início da corrida não gravada', err);
      run = savedRun;
    }

    if (!isRaceMode) {
      finishCreateAndGoToCalendar(run, label);
      return;
    }
    savedRaceRunRef.current = run;
    try {
      await persistRaceLinkAndMemories();
    } catch (err) {
      console.error('Falha a ligar a corrida à prova ou a guardar as memórias', err);
      setMemoriesFailed(true);
      setIsSubmitting(false);
      return;
    }
    setMemoriesFailed(false);
    finishRaceAndGoToHub();
  };

  const retryRaceMemories = async () => {
    setSavingMemories(true);
    try {
      await persistRaceLinkAndMemories();
      setMemoriesFailed(false);
      finishRaceAndGoToHub();
    } catch (err) {
      console.error('Falha a guardar as memórias da prova (nova tentativa)', err);
      setMemoriesFailed(true);
    } finally {
      setSavingMemories(false);
    }
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
    // O tempo oficial é o resultado da prova — sem ele não há o que comparar
    // com o objetivo no hub, e o registo do dia fica pela metade.
    if (isRaceMode && !parseDurationToSeconds(officialTime)) {
      setErrorMsg('Indica o tempo oficial da prova.');
      return;
    }

    setErrorMsg('');
    analysis.run(analyzeRunTask);
  };

  // A tarefa, separada das validações e do gesto: é ela que o "Tentar de
  // novo" repete, com os mesmos prints e os mesmos campos.
  const analyzeRunTask = async () => {
    {
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
          shoe_id: shoeId,
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
      await finishSavedRun(createdRun, 'Corrida registada');
    }
  };

  // Callback ao decidir prosseguir no Bottom Sheet sem adicionar mais métricas
  const handleProceedAnyway = async () => {
    setShowMissingMetricsSheet(false);
    setUserBypassedMissingSheet(true);
    if (pendingCreatedRun) {
      setRuns([...runs, pendingCreatedRun]);
      await finishSavedRun(pendingCreatedRun, 'Corrida registada');
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
    if (isRaceMode && !parseDurationToSeconds(officialTime)) {
      setErrorMsg('Indica o tempo oficial da prova.');
      return;
    }

    const { details } = buildDetailsFromForm();

    // Update vs. Reanalisar?
    // Se a "assinatura analítica" mudou, é preciso reanalisar no Coach.
    let signatureChanged = false;
    if (runIdToEdit && originalSnapshot !== null) {
      const newSig = analyticalSignature({
        date: runDate,
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
              shoe_id: shoeId,
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
          const updatedRun = data.run;
          setRuns(runs.map(r => (r.id === runIdToEdit ? updatedRun : r)));
          useAppStore.getState().clearDismissedIntervention(runIdToEdit);
          await finishSavedRun(updatedRun, 'Corrida reanalisada pelo Coach');
        } else {
          const payload = { date: runDate, name: runName.trim(), shoe_id: shoeId };
          const { error } = await supabase.from('runs').update(payload).eq('id', runIdToEdit);
          if (error) throw error;
          const currentRun = runs.find(r => r.id === runIdToEdit);
          const updatedRun = currentRun ? { ...currentRun, ...payload } : payload;
          setRuns(runs.map(r => r.id === runIdToEdit ? { ...r, ...payload } : r));
          await finishSavedRun(updatedRun, 'Corrida atualizada');
        }
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
          shoe_id: shoeId,
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

      await finishSavedRun(newlySavedRun, 'Corrida registada');
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
  const showToggle = !runIdToEdit;
  const showFotoBlock = showToggle && entryMethod === 'foto';

  /* Ação primária do ecrã — vive na ActionBar fixa (ponto 2 do handoff), não
     no fim do formulário: num ecrã de registo com este comprimento ficava
     sempre abaixo da dobra. O rótulo é o mesmo de antes (os testes e o
     atleta conhecem-no): "Analisar corrida" a criar, "Guardar alterações"
     (ou "Guardar e reanalisar") a editar. */
  const primaryAction = showFotoBlock ? (
    <CoachAnalyzeButton
      onClick={handleAnalyzeRun}
      disabled={!runPhotos.length || analyzingRun}
      busy={analyzingRun}
      label={isRaceMode ? 'Registar a prova' : 'Analisar corrida'}
    />
  ) : runIdToEdit ? (
    <CoachAnalyzeButton
      onClick={() => handleSaveCorrida(false, needsReanalysis)}
      disabled={isSubmitting}
      busy={isSubmitting}
      label={needsReanalysis ? "Guardar e reanalisar" : "Guardar alterações"}
    />
  ) : (
    // Criar uma corrida manualmente também passa pelo Coach, por isso tem o
    // mesmo botão do caminho por foto. No modo prova o botão nomeia o que
    // está mesmo a acontecer — registar a prova, memórias incluídas.
    <CoachAnalyzeButton
      onClick={handleSaveCorrida}
      disabled={isSubmitting}
      busy={isSubmitting}
      label={isRaceMode ? 'Registar a prova' : 'Analisar corrida'}
    />
  );

  const isRepeatType = runKind === 'treino' && RUN_REPEAT_TRAINING_TYPES.has(runTrainingType);

  /* As peças partilhadas pelos dois layouts (treino e modo prova) vivem aqui
     em cima, para não haver duas versões do mesmo bloco a divergir com o
     tempo. O que muda entre os dois é a ORDEM e o enquadramento, não os
     campos. */
  const closeButton = (
    <button
      onClick={() => { if (isFormDirty) setShowUnsavedModal(true); else handleClose(); }}
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
  );

  /* Ponto 7 — espera e erro (ver MealRegistration para o padrão):
     esqueleto no sítio do resultado, formulário bloqueado mas visível, e
     aviso coral com "Tentar de novo" e a alternativa manual quando a leitura
     do print falha. */
  const renderAnalysisStates = () => (
    <>
      {analyzingRun && <AnalysisSkeleton />}

      {analysis.hasFailed && (
        <AnalysisFailure
          detail={analysis.error}
          onRetry={analysis.retry}
          onManual={showToggle && entryMethod === 'foto'
            ? () => { setEntryMethod('manual'); analysis.reset(); }
            : undefined}
        >
          Os prints ficaram guardados. Podes tentar outra vez ou escrever os dados da corrida — eu faço as contas na mesma.
        </AnalysisFailure>
      )}
    </>
  );

  const renderEntryMethodChips = () => (
    <div className="mb-4">
      <label className="text-[11px] text-[var(--text-3)] mb-1.5 block">Como queres registar?</label>
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
  );

  /* A cor do foco e do estado ativo segue o ecrã: ciano do módulo Corrida
     num treino, âmbar da prova no modo prova. Strings literais (e não
     interpoladas) para o Tailwind as conseguir gerar. */
  const fieldFocusClass = isRaceMode ? 'focus:border-[var(--race)]' : 'focus:border-[var(--mod-corrida-to)]';
  const rpeActiveClass = isRaceMode
    ? 'bg-[var(--race)]/15 border-[var(--race)]/40 text-[var(--race)]'
    : 'bg-[var(--mod-corrida-to)]/15 border-[var(--mod-corrida-to)]/40 text-[var(--mod-corrida-to)]';

  const renderEffortField = () => (
    <div className="mb-4">
      <label className="text-[11px] text-[var(--text-3)] mb-1.5 block">Nível de esforço (RPE, opcional)</label>
      <div className="flex gap-1.5">
        {Array.from({ length: 10 }).map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => { setRunEffortRpe(runEffortRpe === i + 1 ? 0 : i + 1); setIsFormDirty(true); }}
            // min-h-[44px] em vez de aspect-square: ver a mesma nota em
            // GymRegistration - dez celulas de 44px de largura nao cabem.
            className={`flex-1 min-h-[44px] rounded-lg flex items-center justify-center text-[13px] font-bold transition-colors border shadow-sm ${runEffortRpe === i + 1 ? rpeActiveClass : 'bg-[var(--surface-glass)] border-[var(--border-glass)] text-[var(--text-3)]'}`}
          >
            {i + 1}
          </button>
        ))}
      </div>
    </div>
  );

  /* Sapatilhas usadas — alimenta o acumulado de km do armário
     (Perfil → Equipamento). Só aparece se houver pares ativos: sem
     armário montado seria um campo vazio a ocupar espaço. */
  const renderShoesField = () => (activeShoes.length > 0 ? (
    <div className="mb-4">
      <label htmlFor="rr-sapatilhas-opcional" className="text-[11px] text-[var(--text-3)] mb-1.5 flex items-center gap-1.5">
        <Footprints size={14} /> Sapatilhas (opcional)
      </label>
      <select id="rr-sapatilhas-opcional"
        value={shoeId || ''}
        onChange={e => { setShoeId(e.target.value || null); setIsFormDirty(true); }}
        className={`w-full min-h-[44px] bg-[var(--surface-soft)] border border-[var(--border-glass)] rounded-xl px-3 py-2.5 text-[14px] text-white outline-none transition ${fieldFocusClass}`}
      >
        <option value="">Não indicar</option>
        {activeShoes.map(s => (
          <option key={s.id} value={s.id}>{shoeLabel(s)}</option>
        ))}
      </select>
      <p className="text-[11px] text-[var(--text-3)] mt-1.5">
        Os km desta corrida somam-se ao par escolhido.
      </p>
    </div>
  ) : null);

  const renderNotesField = () => (
    <div className="mb-4">
      <label htmlFor="rr-observacoes-opcional" className="text-[11px] text-[var(--text-3)] mb-1.5 flex items-center gap-1.5">
        <PencilLine size={14} /> {isRaceMode ? 'Notas da prova (opcional)' : 'Observações (opcional)'}
      </label>
      <textarea id="rr-observacoes-opcional"
        className={`w-full bg-[var(--surface-soft)] border border-[var(--border-glass)] rounded-xl px-3 py-2.5 text-[14px] text-white outline-none transition min-h-[80px] resize-y ${fieldFocusClass}`}
        placeholder={isRaceMode ? 'O percurso, o tempo que esteve, como te sentiste...' : 'Como te sentiste, dores, condições atmosféricas...'}
        value={runNotes}
        onChange={e => { setRunNotes(e.target.value); setIsFormDirty(true); }}
      />
    </div>
  );

  /* Distância e duração do relógio. Em competição a duração é o "tempo
     pessoal" (runs.duration_seconds) — distinto do tempo oficial, que é o
     do cronómetro da organização e vai em details.official_time_seconds. */
  const renderCoreMetrics = () => (
    <>
      <div className="mb-3">
        <label htmlFor="rr-distancia" className="text-[11px] font-semibold text-[var(--text-3)] block mb-1">
          {isRepeatType ? 'Distância total (km, opcional)' : 'Distância (km)'}
        </label>
        <div className="relative">
          <input
            type="number" min="0" step="0.01"
            id="rr-distancia"
            placeholder="0.00"
            value={runDistance} onChange={e => { setRunDistance(e.target.value); setIsFormDirty(true); }}
            className={`w-full min-h-[44px] bg-[var(--surface-soft)] border border-[var(--border-glass)] rounded-xl pl-3 pr-10 py-2.5 text-sm text-white outline-none transition ${fieldFocusClass}`}
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[12px] font-medium text-[var(--text-3)] pointer-events-none">km</span>
        </div>
      </div>

      <div className="mb-4">
        <label htmlFor="rr-duracao" className="text-[11px] font-semibold text-[var(--text-3)] block mb-1">
          {isRepeatType ? 'Duração total (ex.: 43m ou 37:57)' : (runKind === 'competicao' ? 'Tempo pessoal (ex.: 1:11:26)' : 'Duração (ex.: 43m ou 37:57)')}
        </label>
        <input id="rr-duracao"
          type="text"
          placeholder="00:00"
          value={runDuration} onChange={e => { setRunDuration(e.target.value); setIsFormDirty(true); }}
          className={`w-full min-h-[44px] bg-[var(--surface-soft)] border border-[var(--border-glass)] rounded-xl px-3 py-2.5 text-sm text-white outline-none transition ${fieldFocusClass}`}
        />
      </div>
    </>
  );

  const renderProvaForm = () => {
    const objetivo = [
      raceEvent?.target_time ? `Tempo ${formatTargetTimeLabel(raceEvent.target_time)}` : null,
      raceEvent?.target_pace_seconds_per_km ? `Ritmo ${formatPace(raceEvent.target_pace_seconds_per_km)}/km` : null,
    ].filter(Boolean).join(' · ');

    const pill = {
      fontSize: 11,
      fontWeight: 800,
      padding: '3px 9px',
      borderRadius: 'var(--radius-pill)',
      background: 'var(--tint-race-bg)',
      border: '1px solid var(--tint-race-bd)',
      color: 'var(--race)',
    };

    return (
      <div className="space-y-2.5 fade-in pb-10" data-testid="run-race-mode">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Trophy size={16} style={{ color: 'var(--race)' }} className="shrink-0" />
            <h2 className="text-[14px] font-extrabold truncate" style={{ color: 'var(--text-1)' }}>
              {runIdToEdit ? 'Editar o registo da prova' : 'Registar a prova'}
            </h2>
          </div>
          {closeButton}
        </div>

        {/* ── 1. A PROVA — o que a agenda já sabe. Não se edita aqui: a prova
            vive em race_events e o sítio de lhe mexer é a Agenda. ───────── */}
        <SectionLabel tone="race">A prova</SectionLabel>
        <GlassCard tone="race" glow data-testid="race-mode-header">
          <div className="text-[17px] font-black leading-[1.15]" style={{ color: 'var(--race)', letterSpacing: 'var(--tracking-tight)' }}>
            {raceEvent.name}
          </div>
          <div className="text-[12.5px] mt-1.5" style={{ color: 'var(--text-3)' }}>
            {[formatDatePTShort(raceEvent.date), raceEvent.location].filter(Boolean).join(' · ')}
          </div>
          <div className="flex flex-wrap gap-1.5 mt-3">
            <span style={pill}>{raceDistanceLabel(raceEvent.distance_km)}</span>
            <span style={pill}>{raceTerrainLabel(raceEvent.race_type)}</span>
            {raceEvent.elevation_gain_m ? <span style={pill}>{`${raceEvent.elevation_gain_m} m D+`}</span> : null}
          </div>
          {objetivo && (
            <div
              className="flex items-center justify-between gap-2 mt-3"
              style={{ padding: '10px 12px', borderRadius: 'var(--radius-md)', background: 'rgba(255,255,255,.05)', border: '1px solid var(--border-glass)' }}
            >
              <span className="text-[11px]" style={{ color: 'var(--text-4)' }}>Objetivo</span>
              <span className="text-[12.5px] font-extrabold" style={{ color: 'var(--text-1)' }}>{objetivo}</span>
            </div>
          )}
          <p className="text-[11px] mt-2.5" style={{ color: 'var(--text-4)' }}>
            Estes dados vêm da agenda — é lá que se mudam.
          </p>
        </GlassCard>

        {/* ── 2. O RESULTADO ─────────────────────────────────────────────── */}
        <SectionLabel tone="race">O resultado</SectionLabel>
        <GlassCard>
          {renderAnalysisStates()}
          <div
            aria-busy={analyzingRun || undefined}
            style={analyzingRun ? { opacity: 0.45, pointerEvents: 'none' } : undefined}
          >
            <div className="grid grid-cols-2 gap-2.5 mb-4">
              <div>
                <label htmlFor="rr-tempo-oficial" className="text-[11px] text-[var(--text-3)] block mb-1.5">
                  Tempo oficial <span className="text-[var(--danger)]">*</span>
                </label>
                <input
                  id="rr-tempo-oficial"
                  type="text"
                  inputMode="numeric"
                  placeholder="ex.: 1:45:00"
                  value={officialTime}
                  onChange={e => { setOfficialTime(e.target.value); setIsFormDirty(true); }}
                  className="w-full min-h-[44px] bg-[var(--surface-soft)] border border-[var(--border-glass)] rounded-xl px-3 py-2.5 text-[14px] text-white outline-none focus:border-[var(--race)] transition"
                />
              </div>
              <div>
                <label htmlFor="rr-posicao" className="text-[11px] text-[var(--text-3)] block mb-1.5">Posição geral (opcional)</label>
                <input
                  id="rr-posicao"
                  type="number"
                  placeholder="ex.: 12"
                  value={position}
                  onChange={e => { setPosition(e.target.value); setIsFormDirty(true); }}
                  className="w-full min-h-[44px] bg-[var(--surface-soft)] border border-[var(--border-glass)] rounded-xl px-3 py-2.5 text-[14px] text-white outline-none focus:border-[var(--race)] transition"
                />
              </div>
            </div>

            {showToggle && renderEntryMethodChips()}

            {showFotoBlock ? renderPhotoBlock() : (
              <>
                {renderCoreMetrics()}
                {renderManualDetails()}
              </>
            )}

            {errorMsg && <p role="alert" className="text-[13px] font-medium mt-3" style={{ color: 'var(--danger)' }}>{errorMsg}</p>}
          </div>
        </GlassCard>

        {/* ── 3. COMO CORREU ─────────────────────────────────────────────── */}
        <SectionLabel tone="race">Como correu</SectionLabel>
        <GlassCard>
          {renderEffortField()}
          {renderNotesField()}
          {renderShoesField()}
        </GlassCard>

        {/* ── 4. MEMÓRIAS — vivem na prova, não na corrida (spec §2). São uma
            oferta, não uma condição: a prova conclui-se com a corrida, e o
            diploma, a medalha e as fotos juntam-se aqui ou, mais tarde, na
            persiana "Memórias" do hub (pedido 2026-09-13). ─────────────── */}
        <SectionLabel tone="race">Memórias</SectionLabel>
        <GlassCard data-testid="race-memories">
          <p className="text-[12px] leading-[1.5] mb-4" style={{ color: 'var(--text-3)' }}>
            Opcional. Se o diploma ou as fotografias ainda não chegaram, regista a prova na mesma — juntas tudo depois, no hub da prova.
          </p>
          <RaceMemoriesFields
            diploma={diploma}
            medal={medal}
            photos={racePhotos}
            onDiplomaFile={handleDiplomaFile}
            onMedalFile={handleMedalFile}
            onPhotoFiles={handleRacePhotoFiles}
            onRemoveDiploma={() => { setDiploma(null); setIsFormDirty(true); }}
            onRemoveMedal={() => { setMedal(null); setIsFormDirty(true); }}
            onRemovePhoto={(i) => { setRacePhotos(prev => prev.filter((_, idx) => idx !== i)); setIsFormDirty(true); }}
            error={memoryError}
          />

          {memoriesFailed && (
            <Warning
              title="Memórias por guardar"
              className="mt-3"
              actions={(
                <WarningAction onClick={retryRaceMemories} disabled={savingMemories}>
                  {savingMemories ? 'A guardar…' : 'Tentar de novo'}
                </WarningAction>
              )}
            >
              A corrida ficou gravada. O que não consegui foi guardar as memórias da prova — podes tentar outra vez sem perder nada.
            </Warning>
          )}
        </GlassCard>
      </div>
    );
  };

  const renderCorridaForm = () => {
    if (isRaceMode) return renderProvaForm();

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

          {renderAnalysisStates()}

          <div
            aria-busy={analyzingRun || undefined}
            style={analyzingRun ? { opacity: 0.45, pointerEvents: 'none' } : undefined}
          >
          <div className="flex flex-wrap gap-1.5 mb-3">
            {/* Cor via style, não pela classe: nestes botões o fundo é escuro ou
                colorido e o texto tem de ficar branco a valer, não o --text-1
                do resto da app. (O override global que reescrevia text-white
                saiu no impeccable colorize — ver a tabela em globals.css.) */}
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
              <RunTrainingTypeHelp label="Tipo de treino" fieldId="rr-tipo-de-treino">
                <select
                  id="rr-tipo-de-treino"
                  value={runTrainingType}
                  onChange={e => { setRunTrainingType(e.target.value); setIsFormDirty(true); }}
                  className="w-full bg-[var(--surface-soft)] border border-[var(--border-glass)] rounded-xl px-3 py-3 text-[14px] text-white outline-none focus:border-[var(--mod-corrida-to)] transition"
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
                <p className="text-[11px] text-[var(--text-3)] mt-1.5">A maioria das corridas é "Contínuo" — só muda se for um treino estruturado.</p>
              </RunTrainingTypeHelp>
            </div>
          ) : (
            <>
              {/* "Qual prova?" — uma competição quase sempre é uma prova que
                  já está na agenda. Escolhê-la entra no modo prova (spec §3);
                  "fora da agenda" é o comportamento de sempre, para a corrida
                  de rua que ninguém marcou. Só a criar: a editar, a ligação
                  já vem de runs.race_id. */}
              {showToggle && racePickerOptions.length > 0 && (
                <div className="mb-4">
                  <label htmlFor="rr-qual-prova" className="text-[11px] text-[var(--text-3)] mb-1.5 block">Qual prova?</label>
                  <select id="rr-qual-prova"
                    value={raceId || ''}
                    onChange={e => applyRaceSelection(e.target.value || null)}
                    className="w-full min-h-[44px] bg-[var(--surface-soft)] border border-[var(--border-glass)] rounded-xl px-3 py-3 text-[14px] text-white outline-none focus:border-[var(--race)] transition"
                  >
                    <option value="">Prova fora da agenda</option>
                    {racePickerOptions.map(ev => (
                      <option key={ev.id} value={ev.id}>{`${ev.name} · ${formatDatePTShort(ev.date)}`}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="mb-4">
                <label htmlFor="rr-disciplina" className="text-[11px] text-[var(--text-3)] mb-1.5 block">Disciplina</label>
                <select id="rr-disciplina"
                  value={completedRaceType}
                  onChange={e => { setCompletedRaceType(e.target.value); setIsFormDirty(true); }}
                  className="w-full bg-[var(--surface-soft)] border border-[var(--border-glass)] rounded-xl px-3 py-3 text-[14px] text-white outline-none focus:border-[var(--mod-corrida-to)] transition"
                >
                  {COMPLETED_RACE_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
              </div>
            </>
          )}

          {/* Data · Hora — a hora ao lado da data, opcional. É ela que diz à
              Carol que se treinou às 22:30 (sono) ou à hora da prova na
              última semana (specs/plano-de-prova.md, "A véspera e a hora"). */}
          <div className="grid grid-cols-2 gap-2 mb-4">
            <div className="min-w-0">
              <label htmlFor="rr-data-da-corrida" className="text-[11px] text-[var(--text-3)] mb-1.5 block">Data da corrida</label>
              <input id="rr-data-da-corrida"
                type="date"
                value={runDate}
                max={todayISO()}
                onChange={e => { setRunDate(e.target.value); setIsFormDirty(true); }}
                className="w-full min-h-[var(--tap)] bg-[var(--surface-soft)] border border-[var(--border-glass)] rounded-xl px-3 py-2.5 text-[14px] text-white outline-none focus:border-[var(--mod-corrida-to)] transition"
              />
            </div>
            <div className="min-w-0">
              <label htmlFor="rr-hora-da-corrida" className="text-[11px] text-[var(--text-3)] mb-1.5 block">Hora</label>
              <input id="rr-hora-da-corrida"
                type="time"
                value={runStartTime}
                onChange={e => { setRunStartTime(e.target.value); setIsFormDirty(true); }}
                className="w-full min-h-[var(--tap)] bg-[var(--surface-soft)] border border-[var(--border-glass)] rounded-xl px-3 py-2.5 text-[14px] text-white outline-none focus:border-[var(--mod-corrida-to)] transition"
              />
            </div>
          </div>

          {renderEffortField()}

          {renderShoesField()}

          {renderNotesField()}

          <div className="mb-4">
            <label htmlFor="rr-nome-da-corrida" className="text-[11px] text-[var(--text-3)] mb-1.5 block">Nome da corrida <span className="text-[var(--danger)]">*</span></label>
            <input id="rr-nome-da-corrida"
              type="text"
              value={runName}
              onChange={e => { setRunName(e.target.value); setIsFormDirty(true); }}
              className="w-full bg-[var(--surface-soft)] border border-[var(--border-glass)] rounded-xl px-3 py-2.5 text-[14px] text-white outline-none focus:border-[var(--mod-corrida-to)] transition"
            />
            <p className="text-[11px] text-[var(--text-3)] mt-1.5">Sugestão automática — muda se quiseres.</p>
          </div>

          {/* Competition Specifics */}
          {runKind === 'competicao' && (
            <div className="grid grid-cols-2 gap-2 mb-4 bg-[var(--surface-glass)] border border-[var(--border-glass)] text-white rounded-xl p-3">
              <div>
                <label htmlFor="rr-tempo-oficial" className="text-[11px] text-[var(--text-3)] block mb-1">Tempo Oficial</label>
                <input id="rr-tempo-oficial" type="text" placeholder="ex: 1:45:00" value={officialTime} onChange={e => { setOfficialTime(e.target.value); setIsFormDirty(true); }} className="w-full bg-[var(--surface-glass)] border border-[var(--border-glass)] text-white rounded-xl px-2 py-1.5 text-xs outline-none focus:border-[var(--mod-corrida-to)] transition" />
              </div>
              <div>
                <label htmlFor="rr-posicao" className="text-[11px] text-[var(--text-3)] block mb-1">Posição</label>
                <input id="rr-posicao" type="number" placeholder="ex: 12" value={position} onChange={e => { setPosition(e.target.value); setIsFormDirty(true); }} className="w-full bg-[var(--surface-glass)] border border-[var(--border-glass)] text-white rounded-xl px-2 py-1.5 text-xs outline-none focus:border-[var(--mod-corrida-to)] transition" />
              </div>
            </div>
          )}

          {/* Main Manual Fields */}
          {renderCoreMetrics()}

          {showToggle && renderEntryMethodChips()}

          {showFotoBlock ? renderPhotoBlock() : renderManualDetails()}

          {errorMsg && <p role="alert" className="text-[13px] font-medium mt-3" style={{ color: 'var(--danger)' }}>{errorMsg}</p>}
          </div>
        </div>
      </div>
    );
  };

  /* Os prints do relógio (foto/IA) — a matéria-prima da análise da Carol.
     Não confundir com as memórias da prova, que não passam pela IA. */
  function renderPhotoBlock() {
    return (
            <>
              {runPhotos.length > 0 ? (
                <>
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {runPhotos.map((p, i) => (
                      <div key={i} className="relative aspect-square">
                        <img src={p.dataUrl} className="w-full h-full object-cover rounded-xl border border-[var(--border-glass)]" alt={`Print ${i+1}`} />
                        <button onClick={() => removePhoto(i)} style={{ color: '#fff' }} aria-label={`Remover print ${i + 1}`} className="tap-area-44 absolute top-1 right-1 bg-[var(--bg-scrim)] rounded-full p-1 hover:bg-[var(--danger)] transition">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[11px] text-[var(--text-3)]">{runPhotos.length} print(s) · máx {MAX_PHOTOS}</span>
                    <button onClick={() => { setRunPhotos([]); setIsFormDirty(true); }} className="tap-h-44 text-[11px] text-[var(--text-3)] hover:text-[var(--danger)] flex items-center gap-1 transition">
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
                <label className="block border-2 border-dashed border-[var(--border-glass-strong)] rounded-xl py-6 text-center cursor-pointer hover:border-[var(--border-control)] transition mb-3 bg-[var(--surface-glass)]">
                  <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoSelected} />
                  <ImagePlus className="w-7 h-7 text-[var(--text-3)] mx-auto mb-2" />
                  <p className="text-[11px] text-[var(--text-3)] font-bold">Escolhe os prints da app de corrida (Strava, Garmin...)</p>
                  <p className="text-[11px] text-[var(--text-3)] mt-1 px-4">A IA lê a distância, duração, tipo de treino e splits automaticamente</p>
                </label>
              )}
            </>
    );
  }

  /* Tudo o que o registo manual acrescenta: os prints já carregados (a
     editar), as grelhas de métricas do relógio, as zonas de FC, a estrutura
     da sessão (só treinos de repetições) e o atalho para a Carol. Partilhado
     pelos dois layouts — em modo prova entra dentro de "O resultado". */
  function renderManualDetails() {
    return (
            <>
          {runIdToEdit && runPhotos.length > 0 && (
            <div className="mb-4">
              <label className="text-[11px] text-[var(--text-3)] mb-1.5 block">Prints carregados</label>
              <div className="grid grid-cols-3 gap-2">
                {runPhotos.map((p, i) => (
                  <div key={i} className="relative aspect-square">
                    <img src={p.url || p.dataUrl} className="w-full h-full object-cover rounded-xl border border-[var(--border-glass)]" alt={`Print ${i+1}`} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Metrics Grid inside Organized Sub-containers */}
          <div className="space-y-3 mb-4">
            {/* Relógio & Fisiologia */}
            <div className="rounded-xl border border-[var(--border-glass)] bg-[var(--surface-glass)] text-white p-3">
              <p className="text-[12px] font-bold text-[var(--text-3)] mb-2.5 flex items-center justify-between">
                <span>Fisiologia & Relógio</span>
                <span className="text-[11px] font-normal text-[var(--text-3)]">opcional</span>
              </p>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label htmlFor="rr-desnivel-subida-m" className="text-[11px] font-semibold text-[var(--text-3)] block mb-1">Desnível subida (m)</label>
                  <input id="rr-desnivel-subida-m" 
                    type="number" placeholder="Ex: 120" 
                    value={elevationGain} onChange={e=>{setElevationGain(e.target.value); setIsFormDirty(true);}} 
                    className="w-full bg-[var(--surface-glass)] border border-[var(--border-glass)] text-white rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-[var(--border-control)] transition" 
                  />
                </div>
                <div>
                  <label htmlFor="rr-desnivel-descida-m" className="text-[11px] font-semibold text-[var(--text-3)] block mb-1">Desnível descida (m)</label>
                  <input id="rr-desnivel-descida-m" 
                    type="number" placeholder="Ex: 80" 
                    value={elevationLoss} onChange={e=>{setElevationLoss(e.target.value); setIsFormDirty(true);}} 
                    className="w-full bg-[var(--surface-glass)] border border-[var(--border-glass)] text-white rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-[var(--border-control)] transition" 
                  />
                </div>
                <div>
                  <label htmlFor="rr-cadencia-media-spm" className="text-[11px] font-semibold text-[var(--text-3)] block mb-1">Cadência média (spm)</label>
                  <input id="rr-cadencia-media-spm"
                    type="number" placeholder="Ex: 158"
                    value={cadence} onChange={e=>{setCadence(e.target.value); setIsFormDirty(true);}}
                    className="w-full bg-[var(--surface-glass)] border border-[var(--border-glass)] text-white rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-[var(--border-control)] transition"
                  />
                </div>
                <div>
                  <label htmlFor="rr-cadencia-max-spm" className="text-[11px] font-semibold text-[var(--text-3)] block mb-1">Cadência máx (spm)</label>
                  <input id="rr-cadencia-max-spm"
                    type="number" placeholder="Ex: 175"
                    value={maxCadence} onChange={e=>{setMaxCadence(e.target.value); setIsFormDirty(true);}}
                    className="w-full bg-[var(--surface-glass)] border border-[var(--border-glass)] text-white rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-[var(--border-control)] transition"
                  />
                </div>
                <div>
                  <label htmlFor="rr-calorias-kcal" className="text-[11px] font-semibold text-[var(--text-3)] block mb-1">Calorias (kcal)</label>
                  <input id="rr-calorias-kcal"
                    type="number" placeholder="Ex: 450"
                    value={calories} onChange={e=>{setCalories(e.target.value); setIsFormDirty(true);}} 
                    className="w-full bg-[var(--surface-glass)] border border-[var(--border-glass)] text-white rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-[var(--border-control)] transition" 
                  />
                </div>
                <div>
                  <label htmlFor="rr-vo2-max" className="text-[11px] font-semibold text-[var(--text-3)] block mb-1">VO2 máx</label>
                  <input id="rr-vo2-max" 
                    type="number" step="0.1" placeholder="Ex: 48.5" 
                    value={vo2Max} onChange={e=>{setVo2Max(e.target.value); setIsFormDirty(true);}} 
                    className="w-full bg-[var(--surface-glass)] border border-[var(--border-glass)] text-white rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-[var(--border-control)] transition" 
                  />
                </div>
                <div>
                  <label htmlFor="rr-fc-media-bpm" className="text-[11px] font-semibold text-[var(--text-3)] block mb-1">FC média (bpm)</label>
                  <input id="rr-fc-media-bpm" 
                    type="number" placeholder="Ex: 142" 
                    value={avgHeartRate} onChange={e=>{setAvgHeartRate(e.target.value); setIsFormDirty(true);}} 
                    className="w-full bg-[var(--surface-glass)] border border-[var(--border-glass)] text-white rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-[var(--border-control)] transition" 
                  />
                </div>
                <div>
                  <label htmlFor="rr-fc-maxima-bpm" className="text-[11px] font-semibold text-[var(--text-3)] block mb-1">FC máxima (bpm)</label>
                  <input id="rr-fc-maxima-bpm" 
                    type="number" placeholder="Ex: 172" 
                    value={maxHeartRate} onChange={e=>{setMaxHeartRate(e.target.value); setIsFormDirty(true);}} 
                    className="w-full bg-[var(--surface-glass)] border border-[var(--border-glass)] text-white rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-[var(--border-control)] transition" 
                  />
                </div>
                <div>
                  <label htmlFor="rr-fc-limiar-aerobio-bpm" className="text-[11px] font-semibold text-[var(--text-3)] block mb-1">FC Limiar Aeróbio (bpm)</label>
                  <input id="rr-fc-limiar-aerobio-bpm" 
                    type="number" placeholder="Ex: 145" 
                    value={aerobicThreshold} onChange={e=>{setAerobicThreshold(e.target.value); setIsFormDirty(true);}} 
                    className="w-full bg-[var(--surface-glass)] border border-[var(--border-glass)] text-white rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-[var(--border-control)] transition" 
                  />
                </div>
                <div>
                  <label htmlFor="rr-fc-limiar-anaerobio-bpm" className="text-[11px] font-semibold text-[var(--text-3)] block mb-1">FC Limiar Anaeróbio (bpm)</label>
                  <input id="rr-fc-limiar-anaerobio-bpm" 
                    type="number" placeholder="Ex: 165" 
                    value={anaerobicThreshold} onChange={e=>{setAnaerobicThreshold(e.target.value); setIsFormDirty(true);}} 
                    className="w-full bg-[var(--surface-glass)] border border-[var(--border-glass)] text-white rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-[var(--border-control)] transition" 
                  />
                </div>
              </div>
            </div>

            {/* Biomecânica de Corrida */}
            <div className="rounded-xl border border-[var(--border-glass)] bg-[var(--surface-glass)] text-white p-3">
              <p className="text-[12px] font-bold text-[var(--text-3)] mb-2.5 flex items-center justify-between">
                <span>Biomecânica de Corrida</span>
                <span className="text-[11px] font-normal text-[var(--text-3)]">opcional</span>
              </p>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label htmlFor="rr-contacto-solo-ms" className="text-[11px] font-semibold text-[var(--text-3)] block mb-1">Contacto Solo (ms)</label>
                  <input id="rr-contacto-solo-ms" 
                    type="number" placeholder="Ex: 215" 
                    value={groundContactTime} onChange={e=>{setGroundContactTime(e.target.value); setIsFormDirty(true);}} 
                    className="w-full bg-[var(--surface-glass)] border border-[var(--border-glass)] text-white rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-[var(--border-control)] transition" 
                  />
                </div>
                <div>
                  <label htmlFor="rr-tempo-de-voo-ms" className="text-[11px] font-semibold text-[var(--text-3)] block mb-1">Tempo de Voo (ms)</label>
                  <input id="rr-tempo-de-voo-ms" 
                    type="number" placeholder="Ex: 190" 
                    value={flightTime} onChange={e=>{setFlightTime(e.target.value); setIsFormDirty(true);}} 
                    className="w-full bg-[var(--surface-glass)] border border-[var(--border-glass)] text-white rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-[var(--border-control)] transition" 
                  />
                </div>
                <div>
                  <label htmlFor="rr-oscilacao-vertical-cm" className="text-[11px] font-semibold text-[var(--text-3)] block mb-1">Oscilação Vertical (cm)</label>
                  <input id="rr-oscilacao-vertical-cm" 
                    type="number" step="0.1" placeholder="Ex: 8.5" 
                    value={verticalOscillation} onChange={e=>{setVerticalOscillation(e.target.value); setIsFormDirty(true);}} 
                    className="w-full bg-[var(--surface-glass)] border border-[var(--border-glass)] text-white rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-[var(--border-control)] transition" 
                  />
                </div>
                <div>
                  <label htmlFor="rr-assimetria" className="text-[11px] font-semibold text-[var(--text-3)] block mb-1">Assimetria (%)</label>
                  <input id="rr-assimetria" 
                    type="number" step="0.1" placeholder="Ex: 48.2" 
                    value={asymmetryPct} onChange={e=>{setAsymmetryPct(e.target.value); setIsFormDirty(true);}} 
                    className="w-full bg-[var(--surface-glass)] border border-[var(--border-glass)] text-white rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-[var(--border-control)] transition" 
                  />
                </div>
                <div>
                  <label htmlFor="rr-rigidez-perna-kn-m" className="text-[11px] font-semibold text-[var(--text-3)] block mb-1">Rigidez Perna (kN/m)</label>
                  <input id="rr-rigidez-perna-kn-m" 
                    type="number" step="0.1" placeholder="Ex: 11.5" 
                    value={legStiffness} onChange={e=>{setLegStiffness(e.target.value); setIsFormDirty(true);}} 
                    className="w-full bg-[var(--surface-glass)] border border-[var(--border-glass)] text-white rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-[var(--border-control)] transition" 
                  />
                </div>
                <div>
                  <label htmlFor="rr-pace-max-min-km" className="text-[11px] font-semibold text-[var(--text-3)] block mb-1">Pace máx (min/km)</label>
                  <input id="rr-pace-max-min-km" 
                    type="text" placeholder="Ex: 4:15" 
                    value={maxPace} onChange={e=>{setMaxPace(e.target.value); setIsFormDirty(true);}} 
                    className="w-full bg-[var(--surface-glass)] border border-[var(--border-glass)] text-white rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-[var(--border-control)] transition" 
                  />
                </div>
              </div>
            </div>

            {/* Hidratação & Passos */}
            <div className="rounded-xl border border-[var(--border-glass)] bg-[var(--surface-glass)] text-white p-3">
              <p className="text-[12px] font-bold text-[var(--text-3)] mb-2.5 flex items-center justify-between">
                <span>Hidratação & Atividade</span>
                <span className="text-[11px] font-normal text-[var(--text-3)]">opcional</span>
              </p>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label htmlFor="rr-perda-transpiracao-ml" className="text-[11px] font-semibold text-[var(--text-3)] block mb-1">Perda transpiração (ml)</label>
                  <input id="rr-perda-transpiracao-ml" 
                    type="number" placeholder="Ex: 850" 
                    value={sweatLossMl} onChange={e=>{setSweatLossMl(e.target.value); setIsFormDirty(true);}} 
                    className="w-full bg-[var(--surface-glass)] border border-[var(--border-glass)] text-white rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-[var(--border-control)] transition" 
                  />
                </div>
                <div>
                  <label htmlFor="rr-passos-totais" className="text-[11px] font-semibold text-[var(--text-3)] block mb-1">Passos totais</label>
                  <input id="rr-passos-totais" 
                    type="number" placeholder="Ex: 12500" 
                    value={totalSteps} onChange={e=>{setTotalSteps(e.target.value); setIsFormDirty(true);}} 
                    className="w-full bg-[var(--surface-glass)] border border-[var(--border-glass)] text-white rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-[var(--border-control)] transition" 
                  />
                </div>
              </div>
            </div>
          </div>

            {/* FC Zones */}
            <div className="rounded-xl border border-[var(--border-glass)] bg-[var(--surface-glass)] text-white p-3 mb-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-[12px] font-bold text-[var(--text-3)]">Zonas de FC (tempo em cada zona)</label>
                <AddButton
                  onClick={() => { setHrZones([...hrZones, { zone: '', minutes: '' }]); setIsFormDirty(true); }}
                  variant="run"
                  type="button"
                >
                  Adicionar Zona
                </AddButton>
              </div>
              {hrZones.length === 0 ? (
                <p className="text-[11px] text-[var(--text-3)]">Sem zonas ainda — usa "Adicionar zona" para cada uma que o relógio mostrar.</p>
              ) : (
                hrZones.map((z, idx) => (
                  <div key={idx} className="flex items-center gap-1.5 mb-1.5">
                    <select 
                      aria-label={`Zona de FC na linha ${idx + 1}`}
                      value={z.zone} 
                      onChange={e => { const copy = [...hrZones]; copy[idx].zone = e.target.value; setHrZones(copy); setIsFormDirty(true); }} 
                      className="bg-[var(--surface-glass)] border border-[var(--border-glass)] rounded-xl px-2 py-2 text-xs text-white outline-none"
                    >
                      <option value="">Zona</option>
                      {[1,2,3,4,5].map(n => <option key={n} value={n}>Z{n}</option>)}
                    </select>
                    <input 
                      type="number" placeholder="Minutos" 
                      aria-label={`Minutos na linha ${idx + 1}`}
                      value={z.minutes} 
                      onChange={e => { const copy = [...hrZones]; copy[idx].minutes = e.target.value; setHrZones(copy); setIsFormDirty(true); }} 
                      className="w-full bg-[var(--surface-glass)] border border-[var(--border-glass)] rounded-xl px-2 py-2 text-xs text-white outline-none" 
                    />
                    <button 
                      onClick={() => { setHrZones(hrZones.filter((_, i) => i !== idx)); setIsFormDirty(true); }} 
                      type="button" 
                      aria-label={`Remover zona ${idx + 1}`}
                      className="tap-44 text-[var(--text-3)] hover:text-[var(--danger)]"
                    >
                      <X className="w-3.5 h-3.5"/>
                    </button>
                  </div>
                ))
              )}
            </div>

          {/* Repeat Specifics */}
          {runKind === 'treino' && isRepeatType && (
            <div className="bg-[var(--surface-glass)] rounded-xl p-3 border border-[var(--border-glass)] text-white mb-4">
              <p className="text-[12px] font-semibold text-[var(--text-3)] mb-2">Estrutura da Sessão</p>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div>
                  <label htmlFor="rr-aquecimento-min" className="text-[11px] text-[var(--text-3)] block mb-1">Aquecimento (min)</label>
                  <input id="rr-aquecimento-min" type="number" value={warmupMinutes} onChange={e => { setWarmupMinutes(e.target.value); setIsFormDirty(true); }} className="w-full bg-[var(--surface-glass)] border border-[var(--border-glass)] text-white rounded-xl px-2 py-1.5 text-xs outline-none" />
                </div>
                <div>
                  <label htmlFor="rr-recuperacao-seg" className="text-[11px] text-[var(--text-3)] block mb-1">Recuperação (seg)</label>
                  <input id="rr-recuperacao-seg" type="number" value={recoverySeconds} onChange={e => { setRecoverySeconds(e.target.value); setIsFormDirty(true); }} className="w-full bg-[var(--surface-glass)] border border-[var(--border-glass)] text-white rounded-xl px-2 py-1.5 text-xs outline-none" />
                </div>
              </div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px] text-[var(--text-3)]">Splits (voltas)</label>
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
                  <span className="text-[11px] text-[var(--text-3)] w-3">{i+1}.</span>
                  <input type="number" step="0.01" placeholder="km" aria-label={`Distância da parcial ${i + 1} (km)`} value={s.distance_km} onChange={e => { const newSplits = [...splits]; newSplits[i].distance_km = e.target.value; setSplits(newSplits); setIsFormDirty(true); }} className="w-20 bg-[var(--surface-glass)] border border-[var(--border-glass)] text-white rounded-xl px-2 py-1 text-xs" />
                  <input type="text" placeholder="Tempo" aria-label={`Tempo da parcial ${i + 1}`} value={s.minutes} onChange={e => { const newSplits = [...splits]; newSplits[i].minutes = e.target.value; setSplits(newSplits); setIsFormDirty(true); }} className="flex-1 bg-[var(--surface-glass)] border border-[var(--border-glass)] text-white rounded-xl px-2 py-1 text-xs" />
                  <button onClick={() => { setSplits(splits.filter((_, idx) => idx !== i)); setIsFormDirty(true); }} type="button"
                    aria-label={`Remover parcial ${i + 1}`}
                    className="tap-44 text-[var(--text-3)] hover:text-[var(--danger)] shrink-0"><X className="w-3.5 h-3.5"/></button>
                </div>
              ))}
            </div>
          )}

          {runIdToEdit && (() => {
            const editingRun = runs.find(r => r.id === runIdToEdit);
            const notes = editingRun?.coach_notes || editingRun?.coach_analysis;
            const isDismissed = editingRun?.id && (useAppStore.getState().dismissedInterventions[editingRun.id] === notes || useAppStore.getState().dismissedInterventions[editingRun.id] === 'dismissed');
            const hasIntervention = !isDismissed && notes && /adaptar o plano|falar com a coach|ajustarmos o teu plano|botão vermelho/i.test(notes);
            if (!hasIntervention) return null;
            return (
              <Button
                variant="module"
                moduleColor="var(--grad-coach-legible)"
                onClick={() => {
                  useAppStore.getState().dismissIntervention(editingRun.id, notes);
                  useAppStore.setState({
                    coachIntent: {
                      kind: 'proactive_intervention',
                      recordType: 'run',
                      recordId: editingRun.id,
                      recordName: editingRun.name,
                      date: editingRun.date,
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

            </>
    );
  }

  return (
    // --focus-ring: anel de teclado na cor do módulo (handoff, "Fidelity").
    // No modo prova o módulo é a prova, e o âmbar é dela — o anel acompanha.
    // paddingBottom: espaço para a ActionBar fixa não tapar o fim do form.
    <div
      className="w-full max-w-lg mx-auto"
      style={{ '--focus-ring': isRaceMode ? 'var(--race)' : 'var(--mod-corrida-to)', paddingBottom: ACTION_BAR_SCROLL_PAD }}
    >
      {renderCorridaForm()}

      <ActionBar>{primaryAction}</ActionBar>

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
          className="fixed bottom-20 right-5 z-[90] min-h-[44px] text-[var(--coach-ink)] font-bold text-xs rounded-xl px-4 py-2.5 shadow-[0_8px_30px_rgb(0,0,0,0.12)] flex items-center gap-2 transition active:scale-95 coach-nudge hover:opacity-90"
          style={{ background: 'var(--grad-coach-legible)' }}
        >
          <Sparkles className="w-4 h-4" />
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

      {confirmation && <RecordConfirmation label={confirmation.label} tone={confirmation.tone} achievement={confirmation.achievement} onDone={confirmation.done} />}
    </div>
  );
}
