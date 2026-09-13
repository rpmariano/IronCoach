import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Dumbbell, Users, Trash2, Loader2, MessageSquare, Timer, Flame, HeartPulse, TrendingUp, Gauge, Award, PencilLine } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store';
import { useToast } from '../shared/ToastProvider';
import MuscleAnatomy2D from '../GraphicsLibrary/MuscleAnatomy2D';
import CoachText from '../shared/CoachText';
import { mapCategoriesToMuscles } from '../../utils/gym';
import { sessionVolumeKg } from '../../utils/biEngine';
import ConfirmDeleteModal from '../shared/ConfirmDeleteModal';
import Button from '../shared/Button';
import { formatDuration } from '../../utils/run';
import { normalizeStartTime } from '../../utils/startTime';

/* O cartão é só de consulta e de eliminar. Qualquer alteração ao conteúdo
   passa pelo botão "Editar" → GymRegistration, porque mexer nas séries, no
   esforço ou nas observações muda a análise do Coach e tem de a regenerar.
   Editar aqui à mão deixava a "Análise do Coach" a descrever um treino que
   já não existe. Mesmo padrão da Nutrição (ver MealCard.jsx e PRD 3.2). */
export default function GymSessionCard({ session, onEdit, defaultExpanded = false, hideActions = false }) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const onToggleExpand = () => setIsExpanded(prev => !prev);
  const { profile, loadInitialData } = useAppStore();
  const { showToast } = useToast();
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [photos, setPhotos] = useState([]);
  const [photosLoading, setPhotosLoading] = useState(false);

  const coachCommentary = session.coach_notes;

  const isAula = session.kind === 'aula';
  const sets = session.workout_session_sets || [];
  
  const groupedSets = sets.reduce((acc, set) => {
    const name = set.exercise_name || 'Desconhecido';
    if (!acc[name]) acc[name] = [];
    acc[name].push(set);
    return acc;
  }, {});

  const totalSets = sets.length;
  // sessionVolumeKg() (biEngine.js) — antes este cartão reimplementava a
  // soma peso×reps sem o atalho `volume_kg` (specs/formulas-checklist.md
  // Fase C).
  const volume = sessionVolumeKg(session);

  const headlineValue = isAula 
    ? (session.duration_seconds ? formatDuration(session.duration_seconds) : '')
    : (volume > 0 ? `${Math.round(volume).toLocaleString('pt-PT')} kg` : '');

  const dateParts = session.date ? session.date.split('-') : [];
  /* Escala de esforço (RPE 1-10). Tinha três degraus amarelo/âmbar/laranja
     (bg-yellow-400, bg-amber-400 = exatamente o âmbar da prova) — ponto 3 do
     redesenho: o âmbar é da prova e mais nada. A rampa passa a ir do ciano da
     corrida ao verde do "dentro do alvo" e daí ao coral do aviso e ao vermelho,
     sem tocar no âmbar. */
  const effortColors = ['#2ee0ff', '#35dbef', '#3cd6df', '#34d399', '#6ed092', '#a7cd85', '#fb9d6d', '#fb7c4d', '#f4603f', '#f87171'];
    const formattedDate = dateParts.length === 3 ? `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}` : session.date;

  const handleExpandToggle = async () => {
    onToggleExpand();
    if (!isExpanded && session.photo_paths?.length > 0 && photos.length === 0) {
      setPhotosLoading(true);
      try {
        const { data, error } = await supabase.storage.from('gym-photos').createSignedUrls(session.photo_paths, 3600);
        if (!error && data) {
          setPhotos(data.map(d => d.signedUrl).filter(Boolean));
        }
      } catch (err) {
        console.error('Error loading gym photos:', err);
      } finally {
        setPhotosLoading(false);
      }
    }
  };

  const handleDeleteSession = async () => {
    setShowDeleteConfirm(false);
    setIsDeleting(true);
    try {
      const { error } = await supabase.from('workout_sessions').delete().eq('id', session.id);
      if (error) throw error;
      if (profile?.id) await loadInitialData(profile.id);
      showToast('Treino eliminado');
    } catch (e) {
      console.error(e);
      showToast('Erro ao eliminar treino.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  // Pílulas Coloridas com Ícones (apenas métricas com dados)
  const metricChips = [
    session.duration_seconds ? { key: 'dur', colorClass: 'bg-[var(--surface-strong)] text-[var(--text-2)] border-[var(--border-glass)]', icon: <Timer size={14} className="text-[var(--text-3)]" />, label: formatDuration(session.duration_seconds) } : null,
    session.calories_kcal ? { key: 'cal', colorClass: 'bg-[var(--surface-strong)] text-[var(--text-2)] border-[var(--border-glass)]', icon: <Flame size={14} className="text-[var(--text-3)]" />, label: `${session.calories_kcal} kcal` } : null,
    session.avg_hr ? { key: 'avghr', colorClass: 'bg-[var(--surface-strong)] text-[var(--text-2)] border-[var(--border-glass)]', icon: <HeartPulse size={14} className="text-[var(--text-3)]" />, label: `${session.avg_hr} bpm méd` } : null,
    session.max_hr ? { key: 'maxhr', colorClass: 'bg-[var(--surface-strong)] text-[var(--text-2)] border-[var(--border-glass)]', icon: <TrendingUp size={14} className="text-[var(--text-3)]" />, label: `${session.max_hr} bpm máx` } : null,
    session.exertion ? { key: 'exert', colorClass: 'bg-[var(--surface-strong)] text-[var(--text-2)] border-[var(--border-glass)]', icon: <Gauge size={14} className="text-[var(--text-3)]" />, label: `Esforço ${session.exertion}/10` } : null,
  ].filter(Boolean);

  return (
    <div className="module-card-contrast space-y-3">
      {/* HEADER VISÍVEL SEMPRE */}
      <div 
        onClick={handleExpandToggle}
        className="flex items-center justify-between cursor-pointer select-none"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[var(--surface-glass)] border border-[var(--border-glass)] flex items-center justify-center text-[var(--mod-ginasio)] shrink-0">
            {isAula ? <Users size={20} /> : <Dumbbell size={20} />}
          </div>
          <div>
            <h4 className="text-sm font-bold text-[var(--text-1)] leading-tight flex items-center gap-1.5 flex-wrap">
              {session.name || (isAula ? 'Aula' : 'Treino de Força')}
              {isAula && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[var(--surface-glass)] text-[var(--text-3)] border border-[var(--border-glass)]">
                  Aula
                </span>
              )}
            </h4>
            {/* "05/09/2026 · 18:45 · Peito, Tríceps" — a hora só entra quando
                existe (specs/plano-de-prova.md, "A véspera e a hora"). */}
            <p className="text-xs text-[var(--text-3)] font-medium">
              {[formattedDate, normalizeStartTime(session.start_time), session.categories?.length ? session.categories.join(', ') : null]
                .filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {headlineValue && (
            <span className="text-sm font-bold text-[var(--text-1)]">
              {headlineValue}
            </span>
          )}
          {/* A linha inteira é clicável, mas o chevron é o controlo real —
              é ele que dá acesso por teclado e o estado ao leitor de ecrã. */}
          <button
            onClick={(e) => { e.stopPropagation(); handleExpandToggle(); }}
            type="button"
            aria-label={isExpanded ? 'Fechar detalhes do treino' : 'Ver detalhes do treino'}
            aria-expanded={isExpanded}
            className="tap-44 text-[var(--text-3)] hover:text-[var(--text-1)] shrink-0"
          >
            {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="space-y-3 pt-2 border-t border-[var(--border-glass)] fade-in">
          {/* Pílulas Coloridas com Ícones */}
          {metricChips.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              {metricChips.map(c => (
                <span key={c.key} className={`px-3 py-1.5 rounded-full text-xs font-bold border shadow-xs flex items-center gap-1.5 ${c.colorClass}`}>
                  {c.icon}
                  {c.label}
                </span>
              ))}
            </div>
          )}

          {/* Anatomia Muscular */}
          {!isAula && session.categories?.length > 0 && (
             <MuscleAnatomy2D activeMuscles={mapCategoriesToMuscles(session.categories)} naked />
          )}

          {/* Prints / Photos se existirem */}
          {session.photo_paths?.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold text-[var(--text-3)] uppercase tracking-wider">Prints do Treino</span>
              {photosLoading ? (
                <div className="flex items-center gap-2 text-xs text-[var(--text-3)] py-2">
                  <Loader2 size={14} className="animate-spin" /> A carregar fotos...
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

          {/* Esforço Bar */}
          {session.exertion && (
            <div className="space-y-1">
              <span className="text-[11px] font-bold text-[var(--text-3)]">Esforço</span>
              <div className="flex gap-1">
                {Array(10).fill(0).map((_, i) => (
                  <div 
                    key={i} 
                    className="flex-1 h-2 rounded-full"
                    style={{ background: i < session.exertion ? effortColors[i] : 'rgba(255,255,255,.10)' }} 
                  />
                ))}
              </div>
            </div>
          )}

          {/* Observações — só leitura; alterar é pelo botão "Editar" */}
          <div className="bg-[var(--surface-glass)] border border-[var(--border-glass)] rounded-xl p-3 shadow-xs">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-2)]">
              <MessageSquare size={14} className="text-[var(--text-3)]" /> Observações
            </div>
            <p className="text-xs text-[var(--text-3)] italic mt-1">
              {session.notes || 'Sem observações.'}
            </p>
          </div>

          {/* Grouped Exercises Breakdown List */}
          {Object.keys(groupedSets).length > 0 && (
            Object.entries(groupedSets).map(([exName, exSets]) => (
              <div key={exName} className="bg-[var(--surface-glass)] border border-[var(--border-glass)] rounded-xl p-3 shadow-xs space-y-2">
                <h5 className="text-xs font-bold text-[var(--text-1)]">{exName}</h5>
                <div className="space-y-1.5">
                  {exSets.map((s, idx) => (
                    <div key={s.id || idx} className="flex items-center justify-between bg-[var(--surface-glass)] border border-[var(--border-faint)] rounded-lg px-2.5 py-1.5 text-xs">
                      <span className="font-semibold text-[var(--text-3)]">Série {idx + 1}</span>
                      <span className="font-bold text-[var(--text-1)]">{s.reps} reps × {s.weight} kg</span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}

          {/* ANÁLISE DO COACH */}
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
            useAppStore.getState().dismissedInterventions[session.id] !== coachCommentary
          ) && (
            <Button
              variant="module"
              moduleColor="var(--grad-coach-legible)"
              onClick={(e) => {
                e.stopPropagation();
                useAppStore.getState().dismissIntervention(session.id, coachCommentary);
                useAppStore.setState({
                  coachIntent: {
                    kind: 'proactive_intervention',
                    recordType: 'gym',
                    recordId: session.id,
                    recordName: session.name,
                    date: session.date,
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

          {/* Bottom Action Bar — escondida quando o cartão é só uma
              pré-visualização (ex.: CreatedRecordModal, que tem os seus
              próprios botões de Eliminar/Fechar agrupados no rodapé). */}
          {!hideActions && (
            <div className="flex items-center gap-2 pt-1">
              {onEdit && (
                <Button
                  variant="light"
                  onClick={() => onEdit(session.id)}
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
                Eliminar treino
              </Button>
            </div>
          )}
        </div>
      )}
      <ConfirmDeleteModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDeleteSession}
        isDeleting={isDeleting}
        message="Tem a certeza que deseja eliminar este treino? Esta ação não pode ser desfeita."
      />
    </div>
  );
}
