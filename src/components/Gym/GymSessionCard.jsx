import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Dumbbell, Users, Trash2, Loader2, MessageSquare, Timer, Flame, HeartPulse, TrendingUp, Gauge, Award, PencilLine } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store';
import { useToast } from '../shared/ToastProvider';
import MuscleAnatomy2D from '../GraphicsLibrary/MuscleAnatomy2D';
import CoachText from '../shared/CoachText';
import { mapCategoriesToMuscles } from '../../utils/gym';
import ConfirmDeleteModal from '../shared/ConfirmDeleteModal';
import Button from '../shared/Button';

function formatDuration(totalSeconds) {
  if (!totalSeconds) return '';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/* O cartão é só de consulta e de eliminar. Qualquer alteração ao conteúdo
   passa pelo botão "Editar" → GymRegistration, porque mexer nas séries, no
   esforço ou nas observações muda a análise do Coach e tem de a regenerar.
   Editar aqui à mão deixava a "Análise do Coach" a descrever um treino que
   já não existe. Mesmo padrão da Nutrição (ver MealCard.jsx e PRD 3.2). */
export default function GymSessionCard({ session, onEdit, defaultExpanded = false }) {
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
  const volume = sets.reduce((sum, set) => sum + ((set.reps || 0) * (set.weight || 0)), 0);

  const headlineValue = isAula 
    ? (session.duration_seconds ? formatDuration(session.duration_seconds) : '')
    : (volume > 0 ? `${Math.round(volume).toLocaleString('pt-PT')} kg` : '');

  const dateParts = session.date ? session.date.split('-') : [];
  const effortColors = ['bg-sky-400', 'bg-cyan-400', 'bg-teal-400', 'bg-emerald-400', 'bg-green-400', 'bg-lime-400', 'bg-yellow-400', 'bg-amber-400', 'bg-orange-400', 'bg-rose-500'];
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
    session.duration_seconds ? { key: 'dur', colorClass: 'bg-white/10 text-slate-200 border-white/10', icon: <Timer size={14} className="text-slate-500" />, label: formatDuration(session.duration_seconds) } : null,
    session.calories_kcal ? { key: 'cal', colorClass: 'bg-white/10 text-slate-200 border-white/10', icon: <Flame size={14} className="text-slate-500" />, label: `${session.calories_kcal} kcal` } : null,
    session.avg_hr ? { key: 'avghr', colorClass: 'bg-white/10 text-slate-200 border-white/10', icon: <HeartPulse size={14} className="text-slate-500" />, label: `${session.avg_hr} bpm méd` } : null,
    session.max_hr ? { key: 'maxhr', colorClass: 'bg-white/10 text-slate-200 border-white/10', icon: <TrendingUp size={14} className="text-slate-500" />, label: `${session.max_hr} bpm máx` } : null,
    session.exertion ? { key: 'exert', colorClass: 'bg-white/10 text-slate-200 border-white/10', icon: <Gauge size={14} className="text-slate-500" />, label: `Esforço ${session.exertion}/10` } : null,
  ].filter(Boolean);

  return (
    <div className="module-card-contrast space-y-3">
      {/* HEADER VISÍVEL SEMPRE */}
      <div 
        onClick={handleExpandToggle}
        className="flex items-center justify-between cursor-pointer select-none"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[var(--mod-ginasio)] shrink-0">
            {isAula ? <Users size={20} /> : <Dumbbell size={20} />}
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-800 leading-tight flex items-center gap-1.5 flex-wrap">
              {session.name || (isAula ? 'Aula' : 'Treino de Força')}
              {isAula && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200/60">
                  Aula
                </span>
              )}
            </h4>
            <p className="text-xs text-slate-400 font-medium">
              {formattedDate} {session.categories?.length ? `· ${session.categories.join(', ')}` : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {headlineValue && (
            <span className="text-sm font-bold text-slate-800">
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
            className="tap-44 text-slate-400 hover:text-slate-600 shrink-0"
          >
            {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="space-y-3 pt-2 border-t border-slate-200/60 fade-in">
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
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Prints do Treino</span>
              {photosLoading ? (
                <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
                  <Loader2 size={14} className="animate-spin" /> A carregar fotos...
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {photos.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                      <img src={url} alt="Print" className="w-20 h-20 object-cover rounded-xl border border-slate-200 shadow-xs hover:opacity-95 transition" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Esforço Bar */}
          {session.exertion && (
            <div className="space-y-1">
              <span className="text-[11px] font-bold text-slate-500">Esforço</span>
              <div className="flex gap-1">
                {Array(10).fill(0).map((_, i) => (
                  <div 
                    key={i} 
                    className={`flex-1 h-2 rounded-full ${i < session.exertion ? effortColors[i] : 'bg-white/10'}`} 
                  />
                ))}
              </div>
            </div>
          )}

          {/* Observações — só leitura; alterar é pelo botão "Editar" */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-3 shadow-xs">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
              <MessageSquare size={14} className="text-slate-400" /> Observações
            </div>
            <p className="text-xs text-slate-500 italic mt-1">
              {session.notes || 'Sem observações.'}
            </p>
          </div>

          {/* Grouped Exercises Breakdown List */}
          {Object.keys(groupedSets).length > 0 && (
            Object.entries(groupedSets).map(([exName, exSets]) => (
              <div key={exName} className="bg-white/5 border border-white/10 rounded-xl p-3 shadow-xs space-y-2">
                <h5 className="text-xs font-bold text-slate-800">{exName}</h5>
                <div className="space-y-1.5">
                  {exSets.map((s, idx) => (
                    <div key={s.id || idx} className="flex items-center justify-between bg-white/5 border border-white/5 rounded-lg px-2.5 py-1.5 text-xs">
                      <span className="font-semibold text-slate-500">Série {idx + 1}</span>
                      <span className="font-bold text-slate-800">{s.reps} reps × {s.weight} kg</span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}

          {/* ANÁLISE DO COACH */}
          {coachCommentary && (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-2 shadow-xs">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                <Award size={16} className="text-[var(--mod-coach-from)] shrink-0" />
                Análise do Coach
              </div>
              <div className="text-xs text-slate-700 font-normal">
                <CoachText>{coachCommentary}</CoachText>
              </div>
            </div>
          )}

          {/* Falar com a Coach se a análise indicar intervenção */}
          {Boolean(coachCommentary && /adaptar o plano|falar com a coach|ajustarmos o teu plano|botão vermelho/i.test(coachCommentary)) && (
            <Button
              variant="module"
              moduleColor="linear-gradient(135deg, var(--mod-coach-from), var(--mod-coach-to))"
              onClick={(e) => {
                e.stopPropagation();
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
                <span>Falar com a Coach</span>
              </div>
            </Button>
          )}

          {/* Bottom Action Bar */}
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
