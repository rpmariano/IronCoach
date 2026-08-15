import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAppStore } from '../../store';
import ConfirmDeleteModal from '../shared/ConfirmDeleteModal';
import { CalendarPlus, RotateCcw, CheckCircle, Pencil, Trash2, Check, Loader2, Link as LinkIcon, AlertTriangle, X } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';
import { supabase } from '../../lib/supabase';
import {
  RACE_TERRAIN_TYPES,
  RACE_DISTANCE_OPTIONS,
  RACE_PRIORITIES,
  raceDistanceLabel,
  racePriorityLabel,
  racePriorityDescription,
  parseDurationToSeconds,
  formatDuration,
  parsePaceToSeconds,
  formatPace,
} from '../../utils/run';
import { EXPERIENCE_LEVELS, experienceLevelLabel, experienceLevelDescription } from '../../utils/experience';
import ExperienceLevelHelp from '../shared/ExperienceLevelHelp';
import { useToast } from '../shared/ToastProvider';
import { assessRaceViability, recentWeeklyVolume } from '../../utils/raceViability';

function todayISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function formatDatePT(isoStr) {
  if (!isoStr) return '';
  return format(parseISO(isoStr), 'd MMM yyyy', { locale: pt });
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
  notes: '',
};

export default function RunAgenda({ onClose }) {
  const { raceEvents, profile, runs, setRaceEvents, setNavGuard, editingRaceId } = useAppStore();
  const { showToast } = useToast();

  const editingEventId = editingRaceId;
  const isFormOpen = true;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [isDirty, setIsDirty] = useState(false);

  // Destino pendente quando se tenta sair (nav para outro módulo) com
  // alterações por gravar — null quando o pedido veio do próprio botão
  // "Cancelar" do formulário, sem navegação nenhuma envolvida.
  const [leavePrompt, setLeavePrompt] = useState(null);

  // Qual dos dois campos (tempo/ritmo) foi o último a ser escrito à mão —
  // é a partir dele que se recalcula o outro quando a distância muda.
  const lastEditedTargetRef = useRef(null); // 'time' | 'pace' | null

  const todayIso = todayISO();



  // Trava a navegação para fora da app enquanto houver alterações por
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
          notes: ev.notes || '',
        });
        setIsDirty(false);
      }
    } else {
      setDraft(EMPTY_DRAFT);
      setIsDirty(false);
    }
  }, [editingEventId, raceEvents]);

  const handleCloseForm = () => {
    useAppStore.getState().setEditingRaceId(null);
    if (onClose) onClose();
  };

  const updateDraft = (key, val) => {
    setIsDirty(true);
    setDraft(prev => ({ ...prev, [key]: val }));
  };

  // Trocar o piso limpa o D+ quando deixa de fazer sentido (Estrada não tem
  // esse campo) — a BD reforça isto com um check constraint.
  const updateTerrain = (key) => {
    setIsDirty(true);
    setDraft(prev => ({ ...prev, race_type: key, elevation_gain_m: key === 'trail' ? prev.elevation_gain_m : '' }));
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
      return next;
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
    if (!draft.name.trim()) { alert('Indica o nome da prova.'); return false; }
    if (!draft.location.trim()) { alert('Indica o local da prova.'); return false; }

    const distanceKm = parseFloat((draft.distance_km ?? '').toString().replace(',', '.'));
    if (!distanceKm || distanceKm <= 0) {
      alert('Escolhe a distância da prova — é o que permite ao coach calcular ritmo-alvo e taper.');
      return false;
    }

    // Autodeclarado, não herdado do Perfil: é a peça que permite a um atleta
    // avançado em estrada marcar-se como iniciante na primeira prova de trail.
    if (!draft.experience_level) {
      alert('Indica o teu nível para esta prova — o coach usa-o para calibrar o plano.');
      return false;
    }

    const targetTimeSecs = parseDurationToSeconds(draft.target_time);
    const targetPaceSecs = parsePaceToSeconds(draft.target_pace);
    if (!targetTimeSecs || !targetPaceSecs) {
      alert('Indica o objetivo de tempo total ou o ritmo-alvo — o outro campo é calculado automaticamente a partir dele.');
      return false;
    }

    let elevationGainM = null;
    if (draft.race_type === 'trail') {
      elevationGainM = parseFloat((draft.elevation_gain_m ?? '').toString().replace(',', '.'));
      if (!Number.isFinite(elevationGainM) || elevationGainM < 0) {
        alert('Indica o D+ (desnível acumulado) desta prova de trail.');
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

  const leaveModal = leavePrompt && (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-black/70 fade-in" role="dialog" aria-modal="true" aria-labelledby="prova-leave-title">
      <div className="w-full max-w-sm rounded-2xl p-5 bg-neutral-900 border border-neutral-800 shadow-2xl">
        <h2 id="prova-leave-title" className="text-sm font-semibold">Tens alterações por gravar</h2>
        <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
          Se saíres agora, as alterações que fizeste nesta prova não ficam guardadas.
        </p>
        <div className="mt-5 space-y-2">
          <button onClick={saveAndLeave} disabled={isSubmitting} type="button"
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-xs bg-[var(--mod-coach-to)] shadow-lg active:scale-95 transition disabled:opacity-60"
            style={{ color: '#fff' }}>
            {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : null}
            {isSubmitting ? 'A guardar...' : 'Gravar e sair'}
          </button>
          <button onClick={discardAndLeave} disabled={isSubmitting} type="button"
            className="w-full py-3 rounded-xl font-semibold text-xs border border-red-500/40 text-red-400 hover:bg-red-500/10 transition disabled:opacity-60">
            Sair sem gravar
          </button>
          <button onClick={() => setLeavePrompt(null)} disabled={isSubmitting} type="button"
            className="w-full py-3 rounded-xl font-semibold text-xs text-slate-400 hover:text-slate-200 transition disabled:opacity-60">
            Continuar a editar
          </button>
        </div>
      </div>
    </div>
  );



  return (
    <div className="fixed inset-0 z-50 bg-[var(--page-bg)] flex flex-col fade-in">
      {leaveModal}
      <div className="flex items-center justify-between px-4 py-4 bg-white border-b border-slate-100">
        <div className="flex items-center gap-2">
          <CalendarPlus size={18} style={{ color: 'var(--mod-coach-to)' }} />
          <h2 className="text-[15px] font-semibold text-slate-700">{editingEventId ? 'Editar Prova' : 'Nova Prova'}</h2>
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
      <div className="flex-1 overflow-y-auto px-4 py-5">
        <div className="space-y-4 fade-in pb-20">

          {/* 1.1 Data · 1.2 Local */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-slate-500 mb-1 block">Data <span className="text-red-400">*</span></label>
              <input
                type="date"
                value={draft.date}
                onChange={e => updateDraft('date', e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 outline-none focus:border-[var(--mod-coach-to)]"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 mb-1 block">Local <span className="text-red-400">*</span></label>
              <input
                type="text"
                maxLength={120}
                placeholder="Ex.: Lisboa"
                value={draft.location}
                onChange={e => updateDraft('location', e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-[var(--mod-coach-to)]"
              />
            </div>
          </div>

          {/* 2.1 Nome da prova · 2.2 Tipo (Estrada/Trail) */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-slate-500 mb-1 block">Nome da prova <span className="text-red-400">*</span></label>
              <input
                type="text"
                maxLength={120}
                placeholder="Ex.: Meia Maratona de Lisboa"
                value={draft.name}
                onChange={e => updateDraft('name', e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-[var(--mod-coach-to)]"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 mb-1 block">Tipo <span className="text-red-400">*</span></label>
              <select
                value={draft.race_type}
                onChange={e => updateTerrain(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 outline-none focus:border-[var(--mod-coach-to)]"
              >
                {RACE_TERRAIN_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </div>
          </div>

          {/* Distância · D+ (só em Trail) */}
          <div className={`grid gap-2 ${draft.race_type === 'trail' ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <div>
              <label className="text-[10px] text-slate-500 mb-1 block">Distância <span className="text-red-400">*</span></label>
              <select
                value={draft.distance_km}
                onChange={e => updateDistance(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 outline-none focus:border-[var(--mod-coach-to)]"
              >
                {RACE_DISTANCE_OPTIONS.map(opt => (
                  <option key={opt.km} value={opt.km}>{opt.label}</option>
                ))}
              </select>
            </div>
            {draft.race_type === 'trail' && (
              <div>
                <label className="text-[10px] text-slate-500 mb-1 block">D+ (desnível, m) <span className="text-red-400">*</span></label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  placeholder="Ex.: 1200"
                  value={draft.elevation_gain_m}
                  onChange={e => updateDraft('elevation_gain_m', e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-[var(--mod-coach-to)]"
                />
              </div>
            )}
          </div>

          {/* Nível do atleta para esta prova — autodeclarado, não herdado do
              Perfil, porque um avançado numa disciplina pode ser iniciante
              noutra ou nesta distância em particular. */}
          <ExperienceLevelHelp
            label={<>O teu nível para esta prova <span className="text-red-400">*</span></>}
          >
            <select
              value={draft.experience_level}
              onChange={e => updateDraft('experience_level', e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 outline-none focus:border-[var(--mod-coach-to)]"
            >
              <option value="">Escolhe...</option>
              {EXPERIENCE_LEVELS.map(l => <option key={l.key} value={l.key}>{l.label}</option>)}
            </select>
            <p className="text-[10px] text-slate-400 mt-1">
              {draft.experience_level
                ? experienceLevelDescription(draft.experience_level)
                : 'Pode ser diferente do teu nível geral no Perfil — ex.: avançado em estrada, iniciante nesta primeira prova de trail.'}
            </p>
          </ExperienceLevelHelp>

          {/* Prioridade da prova — decide o taper (polimento pré-prova). */}
          <div>
            <label className="text-[10px] text-slate-500 mb-1 block">Prioridade desta prova <span className="text-red-400">*</span></label>
            <select
              value={draft.race_priority}
              onChange={e => updateDraft('race_priority', e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 outline-none focus:border-[var(--mod-coach-to)]"
            >
              {RACE_PRIORITIES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
            <p className="text-[10px] text-slate-400 mt-1">
              {racePriorityDescription(draft.race_priority)}
            </p>
          </div>

          {/* Objetivo de tempo total · Objetivo de pace — cada um recalcula o outro */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-slate-500 mb-1 block">Objetivo tempo total <span className="text-red-400">*</span></label>
              <input
                type="text"
                maxLength={60}
                placeholder="Ex.: 1:45:00"
                value={draft.target_time}
                onChange={e => handleTargetTimeChange(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-[var(--mod-coach-to)]"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 mb-1 block">Objetivo pace <span className="text-red-400">*</span></label>
              <input
                type="text"
                maxLength={20}
                placeholder="Ex.: 5.20 /km"
                value={draft.target_pace}
                onChange={e => handleTargetPaceChange(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-[var(--mod-coach-to)]"
              />
            </div>
          </div>
          <p className="text-[10px] text-slate-400 -mt-1.5">Preenche um dos dois — o outro é calculado a partir da distância escolhida.</p>

          {/* Site da prova (opcional) */}
          <div>
            <label className="text-[10px] text-slate-500 mb-1 block">Site da prova (opcional)</label>
            <input
              type="url"
              maxLength={200}
              placeholder="https://..."
              value={draft.website}
              onChange={e => updateDraft('website', e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-[var(--mod-coach-to)]"
            />
          </div>

          {/* Notas (opcional) */}
          <div>
            <label className="text-[10px] text-slate-500 mb-1 block">Notas (opcional)</label>
            <textarea
              rows={2}
              maxLength={300}
              placeholder="Logística, nutrição planeada..."
              value={draft.notes}
              onChange={e => updateDraft('notes', e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-[var(--mod-coach-to)] resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <button onClick={attemptCloseForm} type="button" className="border border-slate-200 text-slate-600 text-xs font-semibold rounded-lg py-2 hover:bg-slate-50 transition">
              Cancelar
            </button>
            <button
              onClick={handleSaveForm}
              disabled={isSubmitting || !draft.name.trim()}
              type="button"
              className="bg-[var(--mod-coach-to)] text-neutral-950 text-xs font-bold rounded-lg py-2 flex items-center justify-center gap-1.5 disabled:opacity-50 transition"
            >
              {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Guardar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

