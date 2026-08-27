import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useAppStore } from '../../store';
import ConfirmDeleteModal from '../shared/ConfirmDeleteModal';
import UnsavedChangesModal from '../shared/UnsavedChangesModal';
import PremiumModal from '../shared/PremiumModal';
import Button from '../shared/Button';
import { CalendarPlus, RotateCcw, CheckCircle, Pencil, Trash2, Check, Loader2, Link as LinkIcon, AlertTriangle, X, Sparkles, RefreshCw, Sliders, Trophy } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';
import { supabase, invokeEdgeFunctionWithTimeout } from '../../lib/supabase';
import RaceWebInfoSections from './RaceWebInfoSections';
import RaceHubView from './RaceHubView';
import RaceLevelSuggestion from './RaceLevelSuggestion';
import {
  RACE_TERRAIN_TYPES,
  RACE_DISTANCE_OPTIONS,
  RACE_PRIORITIES,
  raceDistanceLabel,
  racePriorityLabel,
  racePriorityDescription,
  raceLevelCategoryKey,
  parseDurationToSeconds,
  formatDuration,
  parsePaceToSeconds,
  formatPace,
} from '../../utils/run';
import { EXPERIENCE_LEVELS, experienceLevelLabel, experienceLevelDescription } from '../../utils/experience';
import ExperienceLevelHelp from '../shared/ExperienceLevelHelp';
import { useToast } from '../shared/ToastProvider';
import { assessRaceViability, recentWeeklyVolume } from '../../utils/raceViability';
import { getRecommendedPrepWeeks } from '../../utils/racePlanEngine';
import { useCarouselHaptics } from '../../utils/haptics';
import { todayISO } from '../../lib/utils';

function formatDatePT(isoStr) {
  if (!isoStr) return '';
  return format(parseISO(isoStr), 'd MMM yyyy', { locale: pt });
}

// Aceita vírgula como separador decimal, como o resto do formulário — só
// para comparar categorias na invalidação do nível (ver
// applyExperienceLevelInvalidation, mais abaixo).
function parseFormNumber(v) {
  return parseFloat((v ?? '').toString().replace(',', '.'));
}

const EMPTY_DRAFT = {
  date: todayISO(),
  location: '',
  name: '',
  race_type: 'estrada',
  distance_km: '10',
  elevation_gain_m: '',
  // Autodeclarado pelo atleta para esta prova — não herda de
  // profiles.experience_level. Ver src/utils/experience.js.
  experience_level: '',
  // Decide o taper: principal leva 10-21 dias de polimento, treino leva 2-4.
  race_priority: 'a',
  target_time: '',
  // Só na UI — convertidos para target_time_seconds/target_pace_seconds_per_km
  // ao gravar. Ver handleTargetTimeChange/handleTargetPaceChange: mudar um
  // recalcula sempre o outro a partir da distância selecionada.
  target_pace: '',
  website: '',
  // Resultado de "Obter do site" (ver enrich-race-event) — null até se
  // pedir. Numa prova nova só existe no rascunho até se gravar; a editar
  // uma já gravada, o pedido persiste-o de imediato (ver
  // handleFetchWebInfo), este campo só reflete esse valor.
  web_info: null,
  notes: '',
};

const PAGE_KEYS = ['hub', 'details'];

export default function RunAgenda({ onClose }) {
  const { raceEvents, profile, runs, meals, bodyAssessments, gymSessions, setRaceEvents, setNavGuard, editingRaceId } = useAppStore();
  const { showToast } = useToast();

  const editingEventId = editingRaceId;
  const isFormOpen = true;
  const [activePage, setActivePage] = useState('hub'); // 'hub' | 'details'
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [isDirty, setIsDirty] = useState(false);
  const [validationError, setValidationError] = useState(null);
  // Categoria (tipo+distância+D+) associada ao nível ATUALMENTE em
  // draft.experience_level — atualiza-se sempre que o próprio atleta o
  // escolhe/confirma. Compara-se contra a categoria corrente para saber se
  // a resposta ainda serve (ver applyExperienceLevelInvalidation e
  // experienceLevelStale, abaixo; specs/nivel-por-prova.md).
  const [experienceLevelCategoryKey, setExperienceLevelCategoryKey] = useState(null);
  const [fetchingWebInfo, setFetchingWebInfo] = useState(false);

  const activePageIndex = PAGE_KEYS.indexOf(activePage);
  const scrollRef = useRef(null);
  const scrollToRef = useRef(() => {});
  const pageRefs = useRef([]);

  const handlePageIndexChange = useCallback((idx) => {
    const next = PAGE_KEYS[idx];
    if (next && next !== activePage) {
      setActivePage(next);
    }
  }, [activePage]);

  const { handleScroll, handleTouchMove, scrollTo } = useCarouselHaptics(
    scrollRef,
    PAGE_KEYS.length,
    activePageIndex >= 0 ? activePageIndex : 0,
    handlePageIndexChange
  );
  scrollToRef.current = scrollTo;

  // Ajusta dinamicamente a altura do carrossel à página ativa sem cortar conteúdos
  useEffect(() => {
    const carousel = scrollRef.current;
    if (!carousel) return;

    carousel.style.transition = 'height 0.3s cubic-bezier(0.25, 1, 0.5, 1)';
    carousel.style.overflowY = 'hidden';

    let activeEl = null;
    let observer = null;

    const updateHeight = () => {
      const idx = PAGE_KEYS.indexOf(activePage);
      activeEl = pageRefs.current[idx >= 0 ? idx : 0] || carousel.children[idx >= 0 ? idx : 0];
      if (!activeEl) return;
      const newHeight = activeEl.scrollHeight;
      if (newHeight > 0) {
        carousel.style.height = `${newHeight}px`;
      }
    };

    updateHeight();

    if (window.ResizeObserver && activeEl) {
      observer = new ResizeObserver(() => {
        updateHeight();
      });
      observer.observe(activeEl);
    }

    return () => {
      if (observer) observer.disconnect();
    };
  }, [activePage]);

  const activeTab = useAppStore(state => state.activeTab);
  const [initialTab] = useState(activeTab);

  // Destino pendente quando se tenta sair (nav para outro módulo) com
  // alterações por gravar — null quando o pedido veio do próprio botão
  // "Cancelar" do formulário, sem navegação nenhuma envolvida.
  const [leavePrompt, setLeavePrompt] = useState(null);

  // Qual dos dois campos (tempo/ritmo) foi o último a ser escrito à mão —
  // é a partir dele que se recalcula o outro quando a distância muda.
  const lastEditedTargetRef = useRef(null); // 'time' | 'pace' | null

  const todayIso = todayISO();
  const weeklyVol = useMemo(() => recentWeeklyVolume(runs, todayIso), [runs, todayIso]);

  const viability = useMemo(() => {
    if (!draft.distance_km || !draft.date) return { flags: [], isViable: true };
    const distanceKm = parseFloat((draft.distance_km || '').toString().replace(',', '.'));
    const experienceLevel = draft.experience_level || profile?.experience_level;
    const weeksToRace = Math.floor(
      (new Date(draft.date + 'T00:00:00').getTime() - new Date(todayIso + 'T00:00:00').getTime()) / (7 * 86400000)
    );
    // Se o ciclo de preparação recomendado já começou (a prova está a menos
    // de totalWeeks de distância), avalia contra o ciclo total, não contra o
    // que resta — senão o formulário marca 'tempo_insuficiente' a meio de
    // uma preparação em curso que a Home/racePlanEngine já consideram normal
    // (ver specs/formulas-checklist.md P0-7).
    const totalWeeks = getRecommendedPrepWeeks(distanceKm, experienceLevel);
    const prepWeeksForViability = weeksToRace < totalWeeks ? totalWeeks : weeksToRace;
    return assessRaceViability({
      // Distância em bruto — MIN_VOLUME_KM não tem categoria de trail
      // própria na doutrina; usar o equivalente ITRA criava um "penhasco"
      // de categoria por poucos km de D+ convertido (ver racePlanEngine.js).
      distanceKm,
      experienceLevel,
      weeksToRace: prepWeeksForViability >= 0 ? prepWeeksForViability : 0,
      weeklyVolumeKm: weeklyVol > 0 ? weeklyVol : null,
      racePriority: draft.race_priority,
    });
  }, [draft.distance_km, draft.date, draft.experience_level, draft.race_priority, profile?.experience_level, todayIso, weeklyVol]);

  // Só é relevante a editar (a criar, a invalidação já limpa o campo em vez
  // de o deixar "por reconfirmar" — ver applyExperienceLevelInvalidation).
  const experienceLevelStale = useMemo(() => {
    if (!editingEventId || !draft.experience_level || !experienceLevelCategoryKey) return false;
    const currentKey = raceLevelCategoryKey(draft.race_type, parseFormNumber(draft.distance_km), parseFormNumber(draft.elevation_gain_m));
    return !!currentKey && currentKey !== experienceLevelCategoryKey;
  }, [editingEventId, draft.experience_level, draft.race_type, draft.distance_km, draft.elevation_gain_m, experienceLevelCategoryKey]);

  const FLAG_LABELS = {
    ultra_para_iniciante: 'Ultra desaconselhado para iniciante',
    tempo_insuficiente:   `Tempo insuficiente para a preparação`,
    volume_insuficiente:  `Volume de treino insuficiente`,
  };  // Trava a navegação para fora da app enquanto houver alterações por
  // gravar no formulário — mesmo mecanismo usado em Perfil.jsx.
  useEffect(() => {
    if (!isFormOpen || !isDirty) { setNavGuard(null); return; }
    setNavGuard((intendedTab) => {
      setLeavePrompt({ target: intendedTab });
      return false;
    });
    return () => setNavGuard(null);
  }, [isFormOpen, isDirty, setNavGuard]);

  // Fechar/recarregar o separador do browser também avisa.
  useEffect(() => {
    if (!isFormOpen || !isDirty) return;
    const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isFormOpen, isDirty]);

  // Carrega a prova existente para o formulário, ou limpa se for nova.
  useEffect(() => {
    if (editingEventId) {
      const ev = raceEvents.find(e => e.id === editingEventId);
      if (ev) {
        setDraft({
          date: ev.date || todayISO(),
          location: ev.location || '',
          name: ev.name || '',
          race_type: ev.race_type || 'estrada',
          distance_km: ev.distance_km?.toString() || '',
          elevation_gain_m: ev.elevation_gain_m?.toString() || '',
          experience_level: ev.experience_level || '',
          race_priority: ev.race_priority || 'a',
          target_time: ev.target_time || '',
          target_pace: ev.target_pace_seconds_per_km ? formatPace(ev.target_pace_seconds_per_km) : '',
          website: ev.website || '',
          web_info: ev.web_info || null,
          notes: ev.notes || '',
        });
        // A prova já gravada tem o nível "respondido" para a categoria com
        // que foi criada — trata-o como confirmado à partida. Só passa a
        // "por reconfirmar" (experienceLevelStale) se o próprio atleta
        // mudar tipo/distância/D+ nesta sessão de edição.
        setExperienceLevelCategoryKey(
          ev.experience_level
            ? raceLevelCategoryKey(ev.race_type, parseFormNumber(ev.distance_km), parseFormNumber(ev.elevation_gain_m))
            : null
        );
        setIsDirty(false);
        setActivePage('hub');
      }
    } else {
      setDraft(EMPTY_DRAFT);
      setExperienceLevelCategoryKey(null);
      setIsDirty(false);
      setActivePage('details');
      setTimeout(() => {
        scrollToRef.current(1, true);
      }, 0);
    }
  }, [editingEventId, raceEvents]);

  const handleCloseForm = () => {
    useAppStore.getState().setEditingRaceId(null);
    if (onClose) onClose();
  };

  useEffect(() => {
    if (activeTab !== initialTab && isFormOpen) {
      handleCloseForm();
    }
  }, [activeTab, initialTab, isFormOpen]);

  const updateDraft = (key, val) => {
    setIsDirty(true);
    setDraft(prev => ({ ...prev, [key]: val }));
  };

  // Tipo, distância e (em trail) D+ são os três antecessores da pergunta
  // "qual o teu nível para esta prova" (ver specs/nivel-por-prova.md,
  // "Invalidação do nível declarado"). Quando um deles muda de categoria
  // DEPOIS de o atleta já ter respondido, a resposta deixou de valer para a
  // pergunta atual.
  //
  // A CRIAR uma prova nova, limpa em silêncio — é a mesma UX de mudar o
  // piso já limpar o D+ logo acima (updateTerrain): o atleta ainda não
  // respondeu à pergunta nova, não há resposta antiga a proteger.
  //
  // A EDITAR uma já gravada, NUNCA limpa — apagar uma resposta já gravada
  // seria destrutivo. Em vez disso fica "por reconfirmar"
  // (experienceLevelStale, derivado no render a partir de
  // experienceLevelCategoryKey) até o próprio atleta voltar a escolher um
  // nível.
  //
  // Categoria "desconhecida" (ex.: trail sem D+ preenchido, de um lado ou
  // do outro) nunca invalida por si só — não há evidência de mismatch,
  // só falta de dado; não vale a pena apagar uma resposta por isso.
  const applyExperienceLevelInvalidation = (prev, next) => {
    if (editingEventId) return next;
    if (!prev.experience_level) return next;
    const prevKey = raceLevelCategoryKey(prev.race_type, parseFormNumber(prev.distance_km), parseFormNumber(prev.elevation_gain_m));
    if (!prevKey) return next;
    const nextKey = raceLevelCategoryKey(next.race_type, parseFormNumber(next.distance_km), parseFormNumber(next.elevation_gain_m));
    if (!nextKey || nextKey === prevKey) return next;
    return { ...next, experience_level: '' };
  };

  // Escolha do nível — pelo <select> ou pelo botão "Usar nível" de
  // RaceLevelSuggestion, é sempre a mesma coisa: fixa o valor e confirma a
  // categoria ATUAL como a que este nível responde, desligando o aviso de
  // reconfirmação (experienceLevelStale) se estivesse ligado.
  const handleChooseExperienceLevel = (level) => {
    updateDraft('experience_level', level);
    setExperienceLevelCategoryKey(
      level
        ? raceLevelCategoryKey(draft.race_type, parseFormNumber(draft.distance_km), parseFormNumber(draft.elevation_gain_m))
        : null
    );
  };

  // "Obter do site" — a editar uma prova já gravada, usa o modo
  // race_event_id da função (persiste de imediato em race_events.web_info,
  // tal como o mesmo botão em RaceCard); a criar uma prova nova, ainda sem
  // id, usa o modo por website (a função lê e devolve sem gravar) e o
  // resultado fica só no rascunho até "Guardar" — ver payload em
  // handleSaveForm, que é o que o persiste nesse caso.
  const handleFetchWebInfo = async () => {
    if (!draft.website?.trim()) return;
    setFetchingWebInfo(true);
    try {
      const body = editingEventId
        ? { race_event_id: editingEventId }
        : {
            website: draft.website.trim(),
            name: draft.name?.trim() || undefined,
            race_type: draft.race_type || undefined,
            distance_km: parseFloat((draft.distance_km || '').toString().replace(',', '.')) || undefined,
            location: draft.location?.trim() || undefined,
            experience_level: draft.experience_level || undefined,
            elevation_gain_m: draft.race_type === 'trail'
              ? (parseFloat((draft.elevation_gain_m || '').toString().replace(',', '.')) || undefined)
              : undefined,
          };
      const { data, error } = await invokeEdgeFunctionWithTimeout('enrich-race-event', { body }, 90000);
      if (error) {
        showToast(typeof error === 'string' ? error : 'Não consegui obter informação deste site.', 'error');
        return;
      }
      if (data?.race_event) {
        setRaceEvents(raceEvents.map(e => e.id === editingEventId ? data.race_event : e));
        // Direto, não updateDraft: já está gravado no servidor, não é uma
        // alteração pendente que "Guardar" precise de submeter.
        setDraft(prev => ({ ...prev, web_info: data.race_event.web_info }));
        showToast('Informação da prova atualizada.', 'success');
      } else if (data?.web_info) {
        updateDraft('web_info', data.web_info);
        showToast('Informação da prova obtida — grava a prova para a guardar.', 'success');
      } else if (data?.message) {
        showToast(data.message, 'error');
      }
    } catch (err) {
      console.error('Erro a obter informação da prova:', err);
      showToast('Não consegui obter informação deste site.', 'error');
    } finally {
      setFetchingWebInfo(false);
    }
  };

  // Trocar o piso limpa o D+ quando deixa de fazer sentido (Estrada não tem
  // esse campo) — a BD reforça isto com um check constraint.
  const updateTerrain = (key) => {
    setIsDirty(true);
    setDraft(prev => applyExperienceLevelInvalidation(
      prev,
      { ...prev, race_type: key, elevation_gain_m: key === 'trail' ? prev.elevation_gain_m : '' },
    ));
  };

  // D+ só existe em trail (ver updateTerrain acima) — muda de banda D+/km
  // e pode invalidar o nível autodeclarado, tal como tipo e distância.
  const updateElevation = (val) => {
    setIsDirty(true);
    setDraft(prev => applyExperienceLevelInvalidation(prev, { ...prev, elevation_gain_m: val }));
  };

  // Mudar a distância recalcula o campo (tempo ou ritmo) que não foi o
  // último a ser escrito à mão, para os dois continuarem coerentes.
  const updateDistance = (km) => {
    setIsDirty(true);
    setDraft(prev => {
      const next = { ...prev, distance_km: km };
      const dist = parseFloat((km || '').toString().replace(',', '.'));
      if (dist > 0) {
        if (lastEditedTargetRef.current === 'pace') {
          const paceSecs = parsePaceToSeconds(prev.target_pace);
          if (paceSecs) next.target_time = formatDuration(Math.round(paceSecs * dist));
        } else if (lastEditedTargetRef.current === 'time') {
          const timeSecs = parseDurationToSeconds(prev.target_time);
          if (timeSecs) next.target_pace = formatPace(Math.round(timeSecs / dist));
        }
      }
      return applyExperienceLevelInvalidation(prev, next);
    });
  };

  const handleTargetTimeChange = (val) => {
    lastEditedTargetRef.current = 'time';
    setIsDirty(true);
    setDraft(prev => {
      const next = { ...prev, target_time: val };
      const dist = parseFloat((prev.distance_km || '').toString().replace(',', '.'));
      const secs = parseDurationToSeconds(val);
      if (dist > 0 && secs) next.target_pace = formatPace(Math.round(secs / dist));
      else if (!val.trim()) next.target_pace = '';
      return next;
    });
  };

  const handleTargetPaceChange = (val) => {
    lastEditedTargetRef.current = 'pace';
    setIsDirty(true);
    setDraft(prev => {
      const next = { ...prev, target_pace: val };
      const dist = parseFloat((prev.distance_km || '').toString().replace(',', '.'));
      const paceSecs = parsePaceToSeconds(val);
      if (dist > 0 && paceSecs) next.target_time = formatDuration(Math.round(paceSecs * dist));
      else if (!val.trim()) next.target_time = '';
      return next;
    });
  };

  // Devolve true/false para quem chama (o aviso de saída) saber se pode
  // prosseguir para o destino pendente.
  const handleSaveForm = async () => {
    if (!draft.name.trim()) { setValidationError('Indica o nome da prova.'); return false; }
    if (!draft.location.trim()) { setValidationError('Indica o local da prova.'); return false; }

    const distanceKm = parseFloat((draft.distance_km ?? '').toString().replace(',', '.'));
    if (!distanceKm || distanceKm <= 0) {
      setValidationError('Escolhe a distância da prova — é o que permite ao coach calcular ritmo-alvo e taper.');
      return false;
    }

    // Autodeclarado, não herdado do Perfil: é a peça que permite a um atleta
    // avançado em estrada marcar-se como iniciante na primeira prova de trail.
    if (!draft.experience_level) {
      setValidationError('Indica o teu nível para esta prova — o coach usa-o para calibrar o plano.');
      return false;
    }

    const targetTimeSecs = parseDurationToSeconds(draft.target_time);
    const targetPaceSecs = parsePaceToSeconds(draft.target_pace);
    if (!targetTimeSecs || !targetPaceSecs) {
      setValidationError('Indica o objetivo de tempo total ou o ritmo-alvo — o outro campo é calculado automaticamente a partir dele.');
      return false;
    }

    let elevationGainM = null;
    if (draft.race_type === 'trail') {
      elevationGainM = parseFloat((draft.elevation_gain_m ?? '').toString().replace(',', '.'));
      if (!Number.isFinite(elevationGainM) || elevationGainM < 0) {
        setValidationError('Indica o D+ (desnível acumulado) desta prova de trail.');
        return false;
      }
    }

    setIsSubmitting(true);

    // Payload explícito em vez de espalhar o draft: este tem campos só de UI
    // (target_pace) e, na edição, o registo inteiro vindo da BD (id, user_id,
    // created_at). Enviar chaves que não são colunas faz o PostgREST rejeitar.
    const payload = {
      date: draft.date,
      race_type: draft.race_type,
      name: draft.name.trim(),
      location: draft.location.trim(),
      distance_km: distanceKm,
      elevation_gain_m: elevationGainM,
      experience_level: draft.experience_level,
      race_priority: draft.race_priority,
      target_time: draft.target_time.trim(),
      target_time_seconds: targetTimeSecs,
      target_pace_seconds_per_km: targetPaceSecs,
      website: draft.website?.trim() || null,
      // Numa edição, "Obter do site" já persiste isto de imediato (ver
      // handleFetchWebInfo) — reenviá-lo aqui é inofensivo (mesmo valor).
      // A criar uma prova nova é a ÚNICA forma deste valor chegar à BD, já
      // que o pedido corre em modo rascunho sem id para persistir sozinho.
      web_info: draft.web_info || null,
      notes: draft.notes?.trim() || null,
    };

    try {
      if (editingEventId) {
        const { error } = await supabase
          .from('race_events')
          .update(payload)
          .eq('id', editingEventId);
        if (error) throw error;
        setRaceEvents(raceEvents.map(e => e.id === editingEventId ? { ...e, ...payload } : e));
      } else {
        const insertObj = {
          ...payload,
          user_id: profile?.id,
          status: draft.date < todayIso ? 'concluida' : 'agendada'
        };
        const { data, error } = await supabase
          .from('race_events')
          .insert(insertObj)
          .select()
          .single();
        if (error) throw error;
        if (data) {
          setRaceEvents([...raceEvents, data]);
        }
      }
      showToast('Prova guardada');
      handleCloseForm();
      // Gravar uma prova NOVA vai sempre para o Calendário, aberto no dia
      // da prova — independentemente de onde a criação foi iniciada (ex.:
      // o "+" a partir de outro separador). Editar uma já gravada continua
      // a voltar para onde se estava, tal como cancelar/fechar sem gravar
      // (handleCloseForm, acima, já revela o activeTab original intacto —
      // ver initialTab). setNavGuard(null) primeiro, tal como
      // discardAndLeave: o próprio navGuard deste formulário ainda está
      // registado neste render e bloquearia este setActiveTab como se
      // fosse o atleta a tentar sair com alterações por gravar.
      // !leavePrompt?.target: se isto veio de "Gravar e sair" a caminho de
      // outro separador (navGuard intercetado), saveAndLeave já vai repor
      // esse destino a seguir — sem esta guarda, ficava pendingCalendarDate
      // por aplicar (só à próxima visita ao Calendário) sem nunca lá se
      // chegar agora.
      if (!editingEventId && !leavePrompt?.target) {
        setNavGuard(null);
        useAppStore.getState().setPendingCalendarDate(draft.date);
        useAppStore.getState().setActiveTab('calendario');
      }
      return true;
    } catch (err) {
      console.error('Error saving race event:', err);
      showToast('Erro ao guardar prova.', 'error');
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  // Botão "Cancelar" do formulário — só interrompe com o aviso se houver
  // alterações por gravar; sem navegação pendente nenhuma (target: null).
  const attemptCloseForm = () => {
    if (isDirty) { setLeavePrompt({ target: null }); return; }
    handleCloseForm();
  };

  const discardAndLeave = () => {
    const pending = leavePrompt;
    handleCloseForm();
    setLeavePrompt(null);
    setNavGuard(null);
    if (pending?.target) useAppStore.getState().setActiveTab(pending.target);
  };

  const saveAndLeave = async () => {
    const pending = leavePrompt;
    const saved = await handleSaveForm();
    if (!saved) return; // mantém o aviso aberto para o utilizador decidir
    setLeavePrompt(null);
    if (pending?.target) useAppStore.getState().setActiveTab(pending.target);
  };

  const leaveModal = (
    <UnsavedChangesModal
      isOpen={!!leavePrompt}
      isSaving={isSubmitting}
      onSaveAndLeave={saveAndLeave}
      onDiscardAndLeave={discardAndLeave}
      onCancel={() => setLeavePrompt(null)}
      title="Tens alterações por gravar"
      message="Se saíres agora, as alterações que fizeste nesta prova não ficam guardadas."
    />
  );

  const validationModal = validationError && (
    <PremiumModal
      isOpen={!!validationError}
      onClose={() => setValidationError(null)}
      title="Dados Incompletos"
      subtitle="Por favor, corrige os seguintes erros:"
      icon={AlertTriangle}
      theme="warning"
      variant="dialog"
    >
      <div className="p-6 space-y-6">
        <p className="text-sm text-slate-600 leading-relaxed text-center">
          {validationError}
        </p>
        <div className="flex justify-center">
          <Button
            variant="module"
            moduleColor="var(--mod-prova)"
            onClick={() => { setValidationError(null) }}
            className="w-full"
          >
            Entendido
          </Button>
        </div>
      </div>
    </PremiumModal>
  );

  if (!isFormOpen) return null;

  return (
    <div className="w-full max-w-lg mx-auto pb-10 fade-in">
      {leaveModal}
      {validationModal}
      
      <div className="space-y-4">
        {/* Cabeçalho + campos no MESMO cartão, como nos outros registos
            (Avaliação/Refeição/Corrida/Treino) — antes era um cartão
            module-card-contrast só para o título, separado do cartão dos
            campos, o que dava dois vidros foscos empilhados em vez de um só
            ecrã coeso. */}
        <div
          className="space-y-4 fade-in module-card-contrast"
          style={{ background: 'linear-gradient(135deg, color-mix(in srgb, var(--mod-prova) 3%, transparent), color-mix(in srgb, var(--mod-prova) 6%, transparent)), rgba(255, 255, 255, 0.05)' }}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CalendarPlus size={16} style={{ color: 'var(--mod-prova)' }} />
              <h2 className="text-sm font-semibold text-slate-800">{editingEventId ? 'Editar Prova' : 'Nova Prova'}</h2>
            </div>
            <button
              onClick={attemptCloseForm}
              type="button"
              className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors shrink-0"
              title="Fechar"
              aria-label="Fechar"
            >
              <X size={16} />
            </button>
          </div>

          {/* Subnav AAA — idêntico ao Perfil / Dashboard */}
          <div className="relative flex gap-2 p-1.5 bg-white/5 backdrop-blur-[20px] border border-white/60 rounded-2xl mb-1 shadow-[0_16px_40px_rgba(0,0,0,0.3),inset_0_2px_10px_rgba(255,255,255,0.6)] overflow-hidden">
            {/* Sliding indicator com tint translúcido e borda âmbar */}
            <div
              className="absolute top-1.5 bottom-1.5 rounded-xl transition-all duration-300 ease-in-out border"
              style={{
                width: 'calc((100% - 20px) / 2)',
                transform: `translateX(calc(${activePageIndex >= 0 ? activePageIndex : 0} * 100% + ${(activePageIndex >= 0 ? activePageIndex : 0) * 8}px))`,
                background: 'color-mix(in srgb, var(--mod-prova) 18%, transparent)',
                borderColor: 'color-mix(in srgb, var(--mod-prova) 40%, transparent)',
                boxShadow: '0 4px 14px rgba(0, 0, 0, 0.25)',
              }}
            />
            {[
              { key: 'hub', label: 'Treino e Evolução', icon: Sparkles },
              { key: 'details', label: 'Detalhes da prova', icon: Sliders },
            ].map(t => (
              <button
                key={t.key}
                type="button"
                onClick={() => {
                  setActivePage(t.key);
                  scrollTo(PAGE_KEYS.indexOf(t.key));
                }}
                style={activePage === t.key ? { color: 'var(--mod-prova)' } : undefined}
                className={`relative z-10 flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-bold rounded-xl transition-colors duration-300 ${
                  activePage === t.key ? '' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <t.icon size={14} /> {t.label}
              </button>
            ))}
          </div>

          {/* Páginas lado a lado no carrossel deslizável */}
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            onTouchMove={handleTouchMove}
            className="tab-swipe-carousel"
          >
            {/* ─── PÁGINA 1: TREINO E EVOLUÇÃO (AAA) ────────────────────────────── */}
            <div ref={(el) => { pageRefs.current[0] = el; }} className="tab-swipe-page space-y-4">
              <RaceHubView
                race={draft}
                runs={runs}
                profile={profile}
                meals={meals}
                bodyAssessments={bodyAssessments}
                gymSessions={gymSessions}
                onFetchWebInfo={handleFetchWebInfo}
                fetchingWebInfo={fetchingWebInfo}
                onGoToEdit={() => {
                  setActivePage('details');
                  scrollTo(1);
                }}
              />

              <div className="flex items-center gap-2 pt-2 pb-6">
                <Button
                  variant="light"
                  onClick={() => {
                    setActivePage('details');
                    scrollTo(1);
                  }}
                  className="flex-1 text-xs"
                  icon={<Sliders size={14} />}
                >
                  Editar Detalhes
                </Button>
                <Button
                  variant="module"
                  moduleColor="var(--mod-prova)"
                  onClick={handleSaveForm}
                  disabled={isSubmitting || !draft.name.trim()}
                  className="flex-1 text-xs"
                  icon={isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                >
                  Guardar Prova
                </Button>
              </div>
            </div>

            {/* ─── PÁGINA 2: DETALHES DA PROVA ─────────────────────────────────── */}
            <div ref={(el) => { pageRefs.current[1] = el; }} className="tab-swipe-page space-y-4">
              {/* 1.1 Data · 1.2 Local */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-slate-500 mb-1 block">Data <span className="text-red-400">*</span></label>
                  <input
                    type="date"
                    value={draft.date}
                    onChange={e => { updateDraft('date', e.target.value) }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 outline-none focus:border-[var(--mod-prova)]"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-500 mb-1 block">Local <span className="text-red-400">*</span></label>
                  <input
                    type="text"
                    maxLength={120}
                    placeholder="Ex.: Lisboa"
                    value={draft.location}
                    onChange={e => { updateDraft('location', e.target.value) }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-[var(--mod-prova)]"
                  />
                </div>
              </div>

              {/* 2.1 Nome da prova · 2.2 Tipo (Estrada/Trail) */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-slate-500 mb-1 block">Nome da prova <span className="text-red-400">*</span></label>
                  <input
                    type="text"
                    maxLength={120}
                    placeholder="Ex.: Meia Maratona de Lisboa"
                    value={draft.name}
                    onChange={e => { updateDraft('name', e.target.value) }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-[var(--mod-prova)]"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-500 mb-1 block">Tipo <span className="text-red-400">*</span></label>
                  <select
                    value={draft.race_type}
                    onChange={e => { updateTerrain(e.target.value) }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 outline-none focus:border-[var(--mod-prova)]"
                  >
                    {RACE_TERRAIN_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Distância · D+ (só em Trail) */}
              <div className={`grid gap-2 ${draft.race_type === 'trail' ? 'grid-cols-2' : 'grid-cols-1'}`}>
                <div>
                  <label className="text-[11px] text-slate-500 mb-1 block">Distância <span className="text-red-400">*</span></label>
                  <select
                    value={draft.distance_km}
                    onChange={e => { updateDistance(e.target.value) }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 outline-none focus:border-[var(--mod-prova)]"
                  >
                    {RACE_DISTANCE_OPTIONS.map(opt => (
                      <option key={opt.km} value={opt.km}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                {draft.race_type === 'trail' && (
                  <div>
                    <label className="text-[11px] text-slate-500 mb-1 block">D+ (desnível, m) <span className="text-red-400">*</span></label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      inputMode="numeric"
                      placeholder="Ex.: 1200"
                      value={draft.elevation_gain_m}
                      onChange={e => { updateElevation(e.target.value) }}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-[var(--mod-prova)]"
                    />
                  </div>
                )}
              </div>

              {/* Nível do atleta para esta prova */}
              <ExperienceLevelHelp
                label={<>O teu nível para esta prova <span className="text-red-400">*</span></>}
                variant="dark"
                context="prova"
                raceType={draft.race_type}
                distanceKm={parseFormNumber(draft.distance_km)}
                elevationGainM={parseFormNumber(draft.elevation_gain_m)}
              >
                <select
                  value={draft.experience_level}
                  onChange={e => handleChooseExperienceLevel(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 outline-none focus:border-[var(--mod-prova)]"
                >
                  <option value="">Escolhe...</option>
                  {EXPERIENCE_LEVELS.map(l => <option key={l.key} value={l.key}>{l.label}</option>)}
                </select>
                <p className="text-[10px] text-slate-400 mt-1">
                  {draft.experience_level
                    ? experienceLevelDescription(draft.experience_level)
                    : 'Pode ser diferente do teu nível geral no Perfil — ex.: avançado em estrada, iniciante nesta primeira prova de trail.'}
                </p>
                {experienceLevelStale && (
                  <p className="text-[11px] text-amber-500 mt-1.5 flex items-start gap-1.5">
                    <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                    <span>Mudaste o tipo, a distância ou o D+ desde que escolheste este nível — confirma se ainda se aplica.</span>
                  </p>
                )}
                {/* Nível medido a partir do histórico de treino — proposta,
                    nunca substituição (Bloco 8, specs/nivel-por-prova.md). */}
                <RaceLevelSuggestion
                  raceType={draft.race_type}
                  distanceKm={parseFormNumber(draft.distance_km)}
                  elevationGainM={parseFormNumber(draft.elevation_gain_m)}
                  declaredLevel={draft.experience_level}
                  profile={profile}
                  runs={runs}
                  todayISO={todayIso}
                  onUseLevel={handleChooseExperienceLevel}
                />
              </ExperienceLevelHelp>

              {/* Prioridade da prova */}
              <div>
                <label className="text-[11px] text-slate-500 mb-1 block">Prioridade desta prova <span className="text-red-400">*</span></label>
                <select
                  value={draft.race_priority}
                  onChange={e => { updateDraft('race_priority', e.target.value) }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 outline-none focus:border-[var(--mod-prova)]"
                >
                  {RACE_PRIORITIES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                </select>
                <p className="text-[10px] text-slate-400 mt-1">
                  {racePriorityDescription(draft.race_priority)}
                </p>
              </div>

              {/* Objetivo de tempo total · Objetivo de pace */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-slate-500 mb-1 block">Objetivo tempo total <span className="text-red-400">*</span></label>
                  <input
                    type="text"
                    maxLength={60}
                    placeholder="Ex.: 1:45:00"
                    value={draft.target_time}
                    onChange={e => { handleTargetTimeChange(e.target.value) }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-[var(--mod-prova)]"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-500 mb-1 block">Objetivo pace <span className="text-red-400">*</span></label>
                  <input
                    type="text"
                    maxLength={20}
                    placeholder="Ex.: 5.20 /km"
                    value={draft.target_pace}
                    onChange={e => { handleTargetPaceChange(e.target.value) }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-[var(--mod-prova)]"
                  />
                </div>
              </div>
              <p className="text-[10px] text-slate-400 -mt-1.5">Preenche um dos dois — o outro é calculado a partir da distância escolhida.</p>

              {/* Site da prova (opcional) */}
              <div>
                <label className="text-[11px] text-slate-500 mb-1 block">Site da prova (opcional)</label>
                <input
                  type="url"
                  maxLength={200}
                  placeholder="https://..."
                  value={draft.website}
                  onChange={e => { updateDraft('website', e.target.value) }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-[var(--mod-prova)]"
                />
              </div>

              {/* Notas (opcional) */}
              <div>
                <label className="text-[11px] text-slate-500 mb-1 block">Notas (opcional)</label>
                <textarea
                  rows={2}
                  maxLength={300}
                  placeholder="Logística, nutrição planeada..."
                  value={draft.notes}
                  onChange={e => { updateDraft('notes', e.target.value) }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-[var(--mod-prova)] resize-none"
                />
              </div>

              {draft.distance_km && draft.date && new Date(draft.date) >= new Date(todayIso) && (
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex flex-col gap-1.5 mt-1">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    Avaliação do Coach
                  </span>
                  {viability.flags.length > 0 ? (
                    viability.flags.map(flag => (
                      <p key={flag} className="text-[11px] font-medium flex items-center gap-1.5" style={{ color: 'var(--color-warn)' }}>
                        <AlertTriangle size={12} />
                        {FLAG_LABELS[flag] || flag}
                      </p>
                    ))
                  ) : (
                    <p className="text-[11px] font-medium flex items-center gap-1.5 text-emerald-600">
                      <CheckCircle size={12} />
                      Preparação adequada para a prova
                    </p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 pt-1 pb-6">
                <Button
                  variant="light"
                  onClick={attemptCloseForm}
                  type="button"
                  className="text-xs"
                >
                  Cancelar
                </Button>
                <Button
                  variant="module"
                  moduleColor="var(--mod-prova)"
                  onClick={handleSaveForm}
                  disabled={isSubmitting || !draft.name.trim()}
                  type="button"
                  className="text-xs"
                  icon={isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                >
                  Guardar Prova
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

