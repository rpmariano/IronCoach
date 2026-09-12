import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Image as ImageIcon, Award, Trash2, Loader2, MessageSquare, RefreshCw, Flame, HeartPulse, TrendingUp, Zap, Navigation, Activity, Route, Timer, Gauge, PencilLine, Droplet, Footprints } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';
import { supabase, invokeEdgeFunctionWithTimeout } from '../../lib/supabase';
import { useToast } from '../shared/ToastProvider';
import { useAppStore } from '../../store';
import CoachText from '../shared/CoachText';
import ConfirmDeleteModal from '../shared/ConfirmDeleteModal';
import Button from '../shared/Button';
import { formatDuration, formatPace } from '../../utils/run';

function RunIcon({ className = "w-5 h-5" }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M14.1 7.9 12.5 10"/>
      <path d="M17.4 10.1 16 12"/>
      <path d="M2 16a2 2 0 0 0 2 2h13c2.8 0 5-2.2 5-5a2 2 0 0 0-2-2c-.8 0-1.6-.2-2.2-.7l-6.2-4.2c-.4-.3-.9-.2-1.3.1 0 0-.6.8-1.2 1.1a3.5 3.5 0 0 1-4.2.1C4.4 7 3.7 6.3 3.7 6.3A.92.92 0 0 0 2 7Z"/>
      <path d="M2 11c0 1.7 1.3 3 3 3h7"/>
    </svg>
  );
}

function paceSecPerKm(run) {
  if (!run.distance_km || !run.duration_seconds) return null;
  return run.duration_seconds / run.distance_km;
}

function runKindLabel(run) {
  if (run.kind === 'competicao') return 'Competição';
  if (run.kind === 'treino' && run.training_type) {
    const map = {
      continuo: 'Contínuo',
      longo: 'Longo',
      recuperacao: 'Recuperação',
      tempo: 'Ritmo (Tempo)',
      fartlek: 'Fartlek',
      intervalos: 'Intervalos',
      subidas: 'Subidas',
      trail: 'Trail',
      tecnico: 'Técnico (trilho)',
    };
    return map[run.training_type] || run.training_type;
  }
  return 'Corrida';
}

function formatDatePT(isoStr) {
  if (!isoStr) return '';
  try {
    return format(parseISO(isoStr), 'd MMM yyyy', { locale: pt });
  } catch {
    return isoStr;
  }
}

export default function RunCard({ run, onEdit, onDelete, defaultExpanded = false, hideActions = false }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  /* Escala de esforço (RPE 1-10). Tinha três degraus amarelo/âmbar/laranja
     (bg-yellow-400, bg-amber-400 = exatamente o âmbar da prova) — ponto 3 do
     redesenho: o âmbar é da prova e mais nada. A rampa passa a ir do ciano da
     corrida ao verde do "dentro do alvo" e daí ao coral do aviso e ao vermelho,
     sem tocar no âmbar. */
  const effortColors = ['#2ee0ff', '#35dbef', '#3cd6df', '#34d399', '#6ed092', '#a7cd85', '#fb9d6d', '#fb7c4d', '#f4603f', '#f87171'];

  const { profile, loadInitialData, runs, setRuns } = useAppStore();
  const { showToast } = useToast();
  const [photos, setPhotos] = useState([]);
  const [photosLoading, setPhotosLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isReanalyzing, setIsReanalyzing] = useState(false);

  const toggleExpand = async () => {
    const willExpand = !expanded;
    setExpanded(willExpand);

    if (willExpand && run.photo_paths?.length > 0 && photos.length === 0) {
      setPhotosLoading(true);
      try {
        const { data, error } = await supabase.storage.from('run-photos').createSignedUrls(run.photo_paths, 3600);
        if (!error && data) {
          setPhotos(data.map(d => d.signedUrl).filter(Boolean));
        }
      } catch (err) {
        console.error('Error loading run photos:', err);
      } finally {
        setPhotosLoading(false);
      }
    }
  };

  const handleDelete = async () => {
    setShowDeleteConfirm(false);
    setIsDeleting(true);
    try {
      if (onDelete) {
        await onDelete(run.id);
      } else {
        const { error } = await supabase.from('runs').delete().eq('id', run.id);
        if (error) throw error;
        if (profile?.id) {
          await loadInitialData(profile.id);
        }
        showToast('Corrida eliminada');
      }
    } catch (err) {
      console.error('Error deleting run:', err);
      showToast('Erro ao eliminar corrida.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleReanalyze = async () => {
    if (isReanalyzing) return;
    setIsReanalyzing(true);
    try {
      const { data, error } = await invokeEdgeFunctionWithTimeout('analyze-run', {
        body: { run_id: run.id, notes: run.notes || null },
      });
      if (error) throw new Error(error);
      if (data?.error) throw new Error(data.error);
      setRuns(runs.map(r => (r.id === run.id ? { ...r, ...data.run } : r)));
      useAppStore.getState().clearDismissedIntervention(run.id);
      showToast('Reanálise concluída');
    } catch (err) {
      console.error('Error reanalyzing run:', err);
      showToast(err.message || 'Falha na reanálise. Tenta novamente.', 'error');
    } finally {
      setIsReanalyzing(false);
    }
  };

  const distStr = run.distance_km ? `${Number(run.distance_km).toFixed(2)} km` : '';
  const durStr = run.duration_seconds ? formatDuration(run.duration_seconds) : '';
  const paceVal = paceSecPerKm(run);
  const paceStr = paceVal ? `${formatPace(paceVal)}/km` : '';

  const kindLabel = runKindLabel(run);
  const coachCommentary = run.coach_notes || run.ai_analysis || run.coach_analysis;

  const details = run.details || {};
  const elevation = details.elevation_gain_m ?? run.elevation_gain_m ?? run.elevation_gain ?? run.elevation ?? run.metrics?.elevation_gain_m;
  const cadence = details.cadence_spm ?? run.cadence_spm ?? run.cadence ?? run.metrics?.cadence_spm;
  const maxCadence = details.max_cadence_spm ?? run.max_cadence_spm ?? run.metrics?.max_cadence_spm;
  const calories = details.calories_kcal ?? run.calories_kcal ?? run.calories ?? run.metrics?.calories_kcal ?? run.metrics?.calories;
  const vo2max = details.vo2_max ?? run.vo2_max ?? run.vo2max ?? run.metrics?.vo2_max;
  const avgHr = details.avg_heart_rate_bpm ?? run.avg_heart_rate_bpm ?? run.avg_hr ?? run.avg_heart_rate ?? run.metrics?.avg_heart_rate_bpm ?? run.metrics?.avg_hr;
  const maxHr = details.max_heart_rate_bpm ?? run.max_heart_rate_bpm ?? run.max_hr ?? run.max_heart_rate ?? run.metrics?.max_heart_rate_bpm ?? run.metrics?.max_hr;
  const hrZones = details.hr_zones ?? run.hr_zones ?? run.metrics?.hr_zones;
  const splits = details.splits ?? run.splits ?? run.metrics?.splits;

  const sweatLoss = details.sweat_loss_ml;
  const totalSteps = details.total_steps;

  const activeChips = [
    distStr ? { key: 'dist', colorClass: 'bg-[var(--surface-strong)] text-[var(--text-2)] border-[var(--border-glass)]', icon: <Route size={14} className="text-[var(--text-3)]" />, label: distStr } : null,
    durStr ? { key: 'dur', colorClass: 'bg-[var(--surface-strong)] text-[var(--text-2)] border-[var(--border-glass)]', icon: <Timer size={14} className="text-[var(--text-3)]" />, label: durStr } : null,
    paceStr ? { key: 'pace', colorClass: 'bg-[var(--surface-strong)] text-[var(--text-2)] border-[var(--border-glass)]', icon: <Gauge size={14} className="text-[var(--text-3)]" />, label: paceStr } : null,
    sweatLoss ? { key: 'sweat', colorClass: 'bg-[var(--surface-strong)] text-[var(--text-2)] border-[var(--border-glass)]', icon: <Droplet size={14} className="text-[var(--text-3)]" />, label: `${sweatLoss} ml transpiração` } : null,
    totalSteps ? { key: 'steps', colorClass: 'bg-[var(--surface-strong)] text-[var(--text-2)] border-[var(--border-glass)]', icon: <Footprints size={14} className="text-[var(--text-3)]" />, label: `${totalSteps.toLocaleString('pt-PT')} passos` } : null,
    elevation ? { key: 'elev', colorClass: 'bg-[var(--surface-strong)] text-[var(--text-2)] border-[var(--border-glass)]', icon: <Navigation size={14} className="text-[var(--text-3)]" />, label: `${elevation}m Desnível` } : null,
    cadence ? { key: 'cad', colorClass: 'bg-[var(--surface-strong)] text-[var(--text-2)] border-[var(--border-glass)]', icon: <Zap size={14} className="text-[var(--text-3)]" />, label: `${cadence} spm méd` } : null,
    maxCadence ? { key: 'maxcad', colorClass: 'bg-[var(--surface-strong)] text-[var(--text-2)] border-[var(--border-glass)]', icon: <Zap size={14} className="text-[var(--text-3)]" />, label: `${maxCadence} spm máx` } : null,
    calories ? { key: 'cal', colorClass: 'bg-[var(--surface-strong)] text-[var(--text-2)] border-[var(--border-glass)]', icon: <Flame size={14} className="text-[var(--text-3)]" />, label: `${calories} kcal` } : null,
    vo2max ? { key: 'vo2', colorClass: 'bg-[var(--surface-strong)] text-[var(--text-2)] border-[var(--border-glass)]', icon: <Activity size={14} className="text-[var(--text-3)]" />, label: `VO2 máx ${vo2max}` } : null,
    avgHr ? { key: 'avghr', colorClass: 'bg-[var(--surface-strong)] text-[var(--text-2)] border-[var(--border-glass)]', icon: <HeartPulse size={14} className="text-[var(--text-3)]" />, label: `${avgHr} bpm méd` } : null,
    maxHr ? { key: 'maxhr', colorClass: 'bg-[var(--surface-strong)] text-[var(--text-2)] border-[var(--border-glass)]', icon: <TrendingUp size={14} className="text-[var(--text-3)]" />, label: `${maxHr} bpm máx` } : null,
  ].filter(Boolean);

  return (
    <div className="module-card-contrast space-y-3">
      {/* === CABEÇALHO (Sempre visível) === */}
      <div 
        onClick={toggleExpand}
        className="flex items-center justify-between cursor-pointer select-none"
      >
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-full bg-[var(--surface-glass)] border border-[var(--border-glass)] flex items-center justify-center text-[var(--mod-corrida)] shrink-0 mt-0.5">
            <RunIcon className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h4 className="text-sm font-bold text-[var(--text-1)] leading-tight">
                {run.title || run.name || 'Corrida'}
              </h4>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[var(--surface-glass)] text-[var(--text-3)] border border-[var(--border-glass)]">
                {kindLabel}
              </span>
              {run.photo_paths?.length > 0 && (
                <span className="text-[11px] text-[var(--text-3)] font-medium flex items-center gap-0.5">
                  <ImageIcon size={12} /> {run.photo_paths.length}
                </span>
              )}
            </div>
            <p className="text-xs text-[var(--text-3)] font-medium mt-0.5">
              {formatDatePT(run.date)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {distStr && (
            <span className="text-sm font-bold text-[var(--text-1)]">
              {distStr}
            </span>
          )}
          {/* A linha inteira é clicável, mas o chevron é o controlo real —
              é ele que dá acesso por teclado e o estado ao leitor de ecrã. */}
          <button
            onClick={(e) => { e.stopPropagation(); toggleExpand(); }}
            type="button"
            aria-label={expanded ? 'Fechar detalhes da corrida' : 'Ver detalhes da corrida'}
            aria-expanded={expanded}
            className="tap-44 text-[var(--text-3)] hover:text-[var(--text-1)] shrink-0"
          >
            {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        </div>
      </div>

      {/* Expanded Content */}
      {expanded && (
        <div className="space-y-3 pt-2 border-t border-[var(--border-glass)] fade-in">
          {/* Pílulas Coloridas com Ícones */}
          {activeChips.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              {activeChips.map(c => (
                <span key={c.key} className={`px-3 py-1.5 rounded-full text-xs font-bold border shadow-xs flex items-center gap-1.5 ${c.colorClass}`}>
                  {c.icon}
                  {c.label}
                </span>
              ))}
            </div>
          )}

          {/* Prints / Photos Section */}
          {run.photo_paths?.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold text-[var(--text-3)]">Prints</span>
              {photosLoading ? (
                <div className="flex items-center gap-2 text-xs text-[var(--text-3)] py-2">
                  <Loader2 size={14} className="animate-spin" /> A carregar prints...
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {photos.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                      <img src={url} alt="Print" className="w-20 h-20 object-cover rounded-xl border border-[var(--border-glass)] shadow-xs hover:opacity-95 transition" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Zonas de FC — tempo em cada zona, lido do relógio (details.hr_zones) */}
          {Array.isArray(hrZones) && hrZones.length > 0 && (() => {
            const maxMinutes = Math.max(...hrZones.map(z => Number(z.minutes) || 0), 1);
            return (
              <div className="bg-[var(--surface-glass)] border border-[var(--border-glass)] rounded-xl p-3 shadow-xs space-y-1.5">
                <span className="text-[11px] font-bold text-[var(--text-3)] block mb-1">Zonas de FC</span>
                {[...hrZones].sort((a, b) => (a.zone || 0) - (b.zone || 0)).map((z, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-[var(--text-3)] w-6 shrink-0">Z{z.zone}</span>
                    <div className="flex-1 h-2 rounded-full bg-[var(--surface-glass)] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[var(--run)]"
                        style={{ width: `${Math.max(4, ((Number(z.minutes) || 0) / maxMinutes) * 100)}%` }}
                      />
                    </div>
                    <span className="text-[11px] text-[var(--text-3)] font-medium w-14 text-right shrink-0">{Number(z.minutes).toFixed(0)} min</span>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Splits/voltas — troço a troço, lido do relógio (details.splits) */}
          {Array.isArray(splits) && splits.length > 0 && (
            <div className="bg-[var(--surface-glass)] border border-[var(--border-glass)] rounded-xl p-3 shadow-xs">
              <span className="text-[11px] font-bold text-[var(--text-3)] block mb-1.5">Splits</span>
              <div className="space-y-1">
                {splits.map((s, i) => {
                  const splitPace = s.distance_km && s.time_seconds ? s.time_seconds / s.distance_km : null;
                  return (
                    <div key={i} className="flex items-center justify-between text-[11px] text-[var(--text-3)]">
                      <span className="font-bold text-[var(--text-3)] w-6 shrink-0">{i + 1}.</span>
                      <span className="flex-1">{s.distance_km ? `${Number(s.distance_km).toFixed(2)} km` : '—'}</span>
                      <span className="flex-1 text-center">{s.time_seconds ? formatDuration(s.time_seconds) : '—'}</span>
                      <span className="flex-1 text-right text-[var(--text-3)]">{splitPace ? `${formatPace(splitPace)}/km` : ''}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Biomecânica de Corrida */}
          {(details.ground_contact_time_ms || details.vertical_oscillation_cm || details.asymmetry_pct || details.leg_stiffness_kn_m) && (
            <div className="bg-[var(--surface-glass)] border border-[var(--border-glass)] rounded-xl p-3 shadow-xs space-y-2">
              <span className="text-[11px] font-bold text-[var(--text-2)] block">Biomecânica de Corrida</span>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {details.ground_contact_time_ms && (
                  <div className="bg-[var(--surface-soft)] p-2 rounded-lg border border-[var(--border-faint)]">
                    <span className="text-[11px] text-[var(--text-3)] block">Contacto Solo</span>
                    <span className="font-bold text-[var(--text-2)]">{details.ground_contact_time_ms} ms</span>
                  </div>
                )}
                {details.flight_time_ms && (
                  <div className="bg-[var(--surface-soft)] p-2 rounded-lg border border-[var(--border-faint)]">
                    <span className="text-[11px] text-[var(--text-3)] block">Tempo Voo</span>
                    <span className="font-bold text-[var(--text-2)]">{details.flight_time_ms} ms</span>
                  </div>
                )}
                {details.vertical_oscillation_cm && (
                  <div className="bg-[var(--surface-soft)] p-2 rounded-lg border border-[var(--border-faint)]">
                    <span className="text-[11px] text-[var(--text-3)] block">Oscilação Vertical</span>
                    <span className="font-bold text-[var(--text-2)]">{details.vertical_oscillation_cm} cm</span>
                  </div>
                )}
                {details.asymmetry_pct !== undefined && details.asymmetry_pct !== null && (
                  <div className="bg-[var(--surface-soft)] p-2 rounded-lg border border-[var(--border-faint)]">
                    <span className="text-[11px] text-[var(--text-3)] block">Assimetria</span>
                    <span className="font-bold text-[var(--text-2)]">{details.asymmetry_pct}%</span>
                  </div>
                )}
                {details.leg_stiffness_kn_m && (
                  <div className="bg-[var(--surface-soft)] p-2 rounded-lg border border-[var(--border-faint)]">
                    <span className="text-[11px] text-[var(--text-3)] block">Rigidez (Stiffness)</span>
                    <span className="font-bold text-[var(--text-2)]">{details.leg_stiffness_kn_m} kN/m</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Limiares Fisiológicos FC */}
          {(details.aerobic_threshold_bpm || details.anaerobic_threshold_bpm) && (
            <div className="bg-[var(--surface-glass)] border border-[var(--border-glass)] rounded-xl p-3 shadow-xs space-y-2">
              <span className="text-[11px] font-bold text-[var(--text-2)] block">Limiares Fisiológicos (FC)</span>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {details.aerobic_threshold_bpm && (
                  <div className="bg-[var(--tint-ok-bg)] border border-[var(--tint-ok-bd)] p-2 rounded-lg">
                    <span className="text-[11px] text-[var(--ok)] font-medium block">Limiar Aeróbio (FC LA)</span>
                    <span className="font-bold text-[var(--ok)]">{details.aerobic_threshold_bpm} bpm</span>
                  </div>
                )}
                {details.anaerobic_threshold_bpm && (
                  <div className="bg-[var(--tint-danger-bg)] border border-[var(--tint-danger-bd)] p-2 rounded-lg">
                    <span className="text-[11px] text-[var(--danger)] font-medium block">Limiar Anaeróbio (FC LAn)</span>
                    <span className="font-bold text-[var(--danger)]">{details.anaerobic_threshold_bpm} bpm</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Transpiração & Hidratação */}
          {details.sweat_loss_ml && (
            <div className="bg-[var(--tint-run-bg)] border border-[var(--tint-run-bd)] rounded-xl p-3 shadow-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-[var(--tint-run-bg)] rounded-lg text-[var(--run)]">
                  <Droplet size={18} />
                </div>
                <div>
                  <span className="text-xs font-bold text-[var(--run)] block">Perda por Transpiração</span>
                  <span className="text-[11px] text-[var(--run)]">Estimado: <strong>{details.sweat_loss_ml} ml</strong></span>
                </div>
              </div>
              <span className="text-[11px] font-semibold bg-[var(--tint-run-bg)] text-[var(--run)] px-2 py-1 rounded-full">
                Repor ~{Math.round(details.sweat_loss_ml * 1.5)} ml
              </span>
            </div>
          )}

          {/* Esforço Bar */}
          {run.effort_rpe && (
            <div className="space-y-1">
              <span className="text-[11px] font-bold text-[var(--text-3)]">Esforço</span>
              <div className="flex gap-1">
                {Array(10).fill(0).map((_, i) => (
                  <div 
                    key={i} 
                    className="flex-1 h-2 rounded-full"
                    style={{ background: i < run.effort_rpe ? effortColors[i] : 'rgba(255,255,255,.10)' }}
                    
                  />
                ))}
              </div>
            </div>
          )}

          {/* Observações */}
          {run.notes && (
            <div className="bg-[var(--surface-glass)] border border-[var(--border-glass)] rounded-xl p-3 shadow-xs">
              <span className="text-[11px] font-bold text-[var(--text-3)] block mb-1">Observações</span>
              <p className="text-xs text-[var(--text-2)] italic">{run.notes}</p>
            </div>
          )}

          {/* Análise do Coach */}
          {coachCommentary && (
            <div className="bg-[var(--surface-glass)] border border-[var(--border-glass)] rounded-2xl p-4 space-y-2 shadow-xs">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--text-1)]">
                <Award size={16} className="text-[var(--mod-coach-from)] shrink-0" />
                Análise do Coach
              </div>
              <div className="text-xs text-[var(--text-2)] font-normal">
                <CoachText>{coachCommentary}</CoachText>
              </div>
            </div>
          )}

          {/* Falar com a Carol se a análise indicar intervenção */}
          {Boolean(
            coachCommentary &&
            /adaptar o plano|falar com a coach|ajustarmos o teu plano|botão vermelho/i.test(coachCommentary) &&
            useAppStore.getState().dismissedInterventions[run.id] !== coachCommentary
          ) && (
            <Button
              variant="module"
              moduleColor="var(--grad-coach-legible)"
              onClick={(e) => {
                e.stopPropagation();
                useAppStore.getState().dismissIntervention(run.id, coachCommentary);
                useAppStore.setState({
                  coachIntent: {
                    kind: 'proactive_intervention',
                    recordType: 'run',
                    recordId: run.id,
                    recordName: run.name,
                    date: run.date,
                    reason: coachCommentary,
                  }
                });
                useAppStore.getState().setActiveTab('coach');
              }}
              className="w-full text-white shadow-md border-transparent font-semibold text-xs py-3"
            >
              <div className="flex items-center justify-center gap-2 w-full">
                <MessageSquare size={16} />
                <span>Falar com a Carol</span>
              </div>
            </Button>
          )}

          {/* Ações — escondidas quando o cartão é só uma pré-visualização
              (ex.: CreatedRecordModal, que tem os seus próprios botões de
              Eliminar/Fechar agrupados no rodapé). */}
          {!hideActions && (
            <div className="flex items-center gap-2 pt-1">
              {run.photo_paths?.length > 0 && (
                <Button
                  variant="light"
                  onClick={handleReanalyze}
                  disabled={isReanalyzing}
                  isLoading={isReanalyzing}
                  className="flex-1 text-xs"
                  icon={!isReanalyzing && <RefreshCw size={14} />}
                >
                  Reanalisar
                </Button>
              )}
              {onEdit && (
                <Button
                  variant="light"
                  onClick={(e) => { e.stopPropagation(); onEdit(run.id); }}
                  className="flex-1 text-xs"
                  icon={<PencilLine size={14} />}
                >
                  Editar
                </Button>
              )}
              <Button
                variant="light-danger"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={isDeleting}
                isLoading={isDeleting}
                className="flex-1 text-xs"
                icon={!isDeleting && <Trash2 size={14} />}
              >
                Eliminar
              </Button>
            </div>
          )}
        </div>
      )}
      <ConfirmDeleteModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        isDeleting={isDeleting}
        message="Tem a certeza que deseja eliminar esta corrida? Esta ação não pode ser desfeita."
      />
    </div>
  );
}
