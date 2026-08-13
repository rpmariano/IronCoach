import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Dumbbell, Users, Trash2, Loader2, MessageSquare, Timer, Flame, HeartPulse, TrendingUp, Gauge, Award, PencilLine } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store';
import { useToast } from '../shared/ToastProvider';
import MuscleAnatomy2D from '../GraphicsLibrary/MuscleAnatomy2D';
import CoachText from '../shared/CoachText';
import { mapCategoriesToMuscles } from '../../utils/gym';

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
export default function GymSessionCard({ session, onEdit }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const onToggleExpand = () => setIsExpanded(prev => !prev);
  const { profile, loadInitialData } = useAppStore();
  const { showToast } = useToast();
  const [isDeleting, setIsDeleting] = useState(false);

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
    if (!confirm('Tem a certeza que deseja eliminar este treino?')) return;
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
    session.duration_seconds ? { key: 'dur', colorClass: 'bg-purple-100/90 text-purple-800 border-purple-200/80', icon: <Timer size={14} className="text-purple-600" />, label: formatDuration(session.duration_seconds) } : null,
    session.calories_kcal ? { key: 'cal', colorClass: 'bg-orange-100/90 text-orange-800 border-orange-200/80', icon: <Flame size={14} className="text-orange-600" />, label: `${session.calories_kcal} kcal` } : null,
    session.avg_hr ? { key: 'avghr', colorClass: 'bg-rose-100/90 text-rose-800 border-rose-200/80', icon: <HeartPulse size={14} className="text-rose-600" />, label: `${session.avg_hr} bpm méd` } : null,
    session.max_hr ? { key: 'maxhr', colorClass: 'bg-red-100/90 text-red-800 border-red-200/80', icon: <TrendingUp size={14} className="text-red-600" />, label: `${session.max_hr} bpm máx` } : null,
    session.exertion ? { key: 'exert', colorClass: 'bg-amber-100/90 text-amber-800 border-amber-200/80', icon: <Gauge size={14} className="text-amber-600" />, label: `Esforço ${session.exertion}/10` } : null,
  ].filter(Boolean);

  return (
    <div className="bg-[var(--surf-detail)] border border-slate-200/80 rounded-2xl p-4 shadow-xs space-y-3 transition">
      {/* Header Bar */}
      <div 
        onClick={handleExpandToggle}
        className="flex items-center justify-between cursor-pointer select-none"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-yellow-100/70 border border-yellow-200/60 flex items-center justify-center text-yellow-600 shrink-0">
            {isAula ? <Users size={20} /> : <Dumbbell size={20} />}
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-800 leading-tight flex items-center gap-1.5 flex-wrap">
              {session.name || (isAula ? 'Aula' : 'Treino de Força')}
              {isAula && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-200/60">
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
            <span className="text-sm font-bold text-orange-600">
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

          {/* Observações — só leitura; alterar é pelo botão "Editar" */}
          <div className="bg-white border border-slate-200/60 rounded-xl p-3 shadow-xs">
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
              <div key={exName} className="bg-white border border-slate-200/60 rounded-xl p-3 shadow-xs space-y-2">
                <h5 className="text-xs font-bold text-slate-800">{exName}</h5>
                <div className="space-y-1.5">
                  {exSets.map((s, idx) => (
                    <div key={s.id || idx} className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1.5 text-xs">
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
            <div className="bg-[var(--surf-success-soft)] border border-emerald-200/80 rounded-2xl p-4 space-y-2 shadow-xs">
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-800">
                <Award size={16} className="text-emerald-600 shrink-0" />
                Análise do Coach
              </div>
              <div className="text-xs text-slate-700 font-normal">
                <CoachText>{coachCommentary}</CoachText>
              </div>
            </div>
          )}

          {/* Bottom Action Bar — "Reanalisar" (repescar os prints e voltar a
              extrair exercícios/séries por IA) deixou de existir como ação
              própria: editar já cobre a correção de exercícios/séries à mão,
              por isso só resta editar ou eliminar a sessão toda. */}
          <div className="flex items-center gap-2 pt-1">
            {onEdit && (
              <button
                onClick={() => onEdit(session.id)}
                className="flex-1 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-xl py-2.5 flex items-center justify-center gap-1.5 transition"
              >
                <PencilLine size={14} /> Editar
              </button>
            )}
            <button
              onClick={handleDeleteSession}
              disabled={isDeleting}
              className="flex-1 border border-red-200 bg-red-50/50 hover:bg-red-50 text-red-600 font-bold text-xs rounded-xl py-2.5 flex items-center justify-center gap-1.5 transition disabled:opacity-50"
            >
              {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              Eliminar treino
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
