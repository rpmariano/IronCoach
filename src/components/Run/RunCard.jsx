import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Image as ImageIcon, Award, Trash2, Loader2, MessageSquare, RefreshCw, Flame, HeartPulse, TrendingUp, Zap, Navigation, Activity, Route, Timer, Gauge } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store';

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

function paceSecPerKm(run) {
  if (!run.distance_km || !run.duration_seconds) return null;
  return run.duration_seconds / run.distance_km;
}

function formatPace(secPerKm) {
  if (!secPerKm) return '';
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}'${s.toString().padStart(2, '0')}"/km`;
}

function runKindLabel(run) {
  if (run.kind === 'competicao') return 'Competição';
  if (run.kind === 'treino' && run.training_type) {
    const map = {
      'continuo': 'Contínuo',
      'intervalado': 'Intervalado',
      'progressivo': 'Progressivo',
      'longo': 'Longo',
      'recuperacao': 'Recuperação',
      'fartlek': 'Fartlek',
      'series': 'Séries'
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

export default function RunCard({ run, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const { profile, loadInitialData } = useAppStore();
  const [photos, setPhotos] = useState([]);
  const [photosLoading, setPhotosLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
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
    if (!confirm('Tem a certeza que deseja eliminar esta corrida?')) return;
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
      }
    } catch (err) {
      console.error('Error deleting run:', err);
      alert('Erro ao eliminar corrida.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleReanalyze = async () => {
    setIsReanalyzing(true);
    try {
      alert('Reanálise enviada para o Coach...');
    } finally {
      setIsReanalyzing(false);
    }
  };

  const distStr = run.distance_km ? `${Number(run.distance_km).toFixed(2)} km` : '';
  const durStr = run.duration_seconds ? formatDuration(run.duration_seconds) : '';
  const paceVal = paceSecPerKm(run);
  const paceStr = paceVal ? formatPace(paceVal) : '';

  const kindLabel = runKindLabel(run);
  const coachCommentary = run.coach_notes || run.ai_analysis || run.coach_analysis;

  const elevation = run.elevation_gain_m ?? run.elevation_gain ?? run.elevation ?? run.metrics?.elevation_gain_m;
  const cadence = run.cadence_spm ?? run.cadence ?? run.metrics?.cadence_spm;
  const calories = run.calories_kcal ?? run.calories ?? run.metrics?.calories_kcal ?? run.metrics?.calories;
  const vo2max = run.vo2_max ?? run.vo2max ?? run.metrics?.vo2_max;
  const avgHr = run.avg_heart_rate_bpm ?? run.avg_hr ?? run.avg_heart_rate ?? run.metrics?.avg_heart_rate_bpm ?? run.metrics?.avg_hr;
  const maxHr = run.max_heart_rate_bpm ?? run.max_hr ?? run.max_heart_rate ?? run.metrics?.max_heart_rate_bpm ?? run.metrics?.max_hr;

  // Pílulas Coloridas com Ícones (sem duplicação no cabeçalho)
  const activeChips = [
    distStr ? { key: 'dist', colorClass: 'bg-pink-100/90 text-pink-800 border-pink-200/80', icon: <Route size={14} className="text-pink-600" />, label: distStr } : null,
    durStr ? { key: 'dur', colorClass: 'bg-purple-100/90 text-purple-800 border-purple-200/80', icon: <Timer size={14} className="text-purple-600" />, label: durStr } : null,
    paceStr ? { key: 'pace', colorClass: 'bg-indigo-100/90 text-indigo-800 border-indigo-200/80', icon: <Gauge size={14} className="text-indigo-600" />, label: paceStr } : null,
    elevation ? { key: 'elev', colorClass: 'bg-teal-100/90 text-teal-800 border-teal-200/80', icon: <Navigation size={14} className="text-teal-600" />, label: `${elevation}m Desnível` } : null,
    cadence ? { key: 'cad', colorClass: 'bg-amber-100/90 text-amber-800 border-amber-200/80', icon: <Zap size={14} className="text-amber-600" />, label: `${cadence} spm` } : null,
    calories ? { key: 'cal', colorClass: 'bg-orange-100/90 text-orange-800 border-orange-200/80', icon: <Flame size={14} className="text-orange-600" />, label: `${calories} kcal` } : null,
    vo2max ? { key: 'vo2', colorClass: 'bg-blue-100/90 text-blue-800 border-blue-200/80', icon: <Activity size={14} className="text-blue-600" />, label: `VO2 máx ${vo2max}` } : null,
    avgHr ? { key: 'avghr', colorClass: 'bg-rose-100/90 text-rose-800 border-rose-200/80', icon: <HeartPulse size={14} className="text-rose-600" />, label: `${avgHr} bpm méd` } : null,
    maxHr ? { key: 'maxhr', colorClass: 'bg-red-100/90 text-red-800 border-red-200/80', icon: <TrendingUp size={14} className="text-red-600" />, label: `${maxHr} bpm máx` } : null,
  ].filter(Boolean);

  return (
    <div className="bg-[#f8fafc] border border-slate-200/80 rounded-2xl p-4 shadow-xs space-y-3 transition">
      {/* Header Bar — Limpo, sem repetição de texto abaixo da data */}
      <div 
        onClick={toggleExpand}
        className="flex items-center justify-between cursor-pointer select-none"
      >
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-full bg-pink-100/70 border border-pink-200/60 flex items-center justify-center text-pink-600 shrink-0 mt-0.5">
            <RunIcon className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h4 className="text-sm font-bold text-slate-800 leading-tight">
                {run.title || run.name || 'Corrida'}
              </h4>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-200/60">
                {kindLabel}
              </span>
              {run.photo_paths?.length > 0 && (
                <span className="text-[10px] text-slate-400 font-medium flex items-center gap-0.5">
                  <ImageIcon size={12} /> {run.photo_paths.length}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 font-medium mt-0.5">
              {formatDatePT(run.date)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {distStr && (
            <span className="text-sm font-bold text-pink-600">
              {distStr}
            </span>
          )}
          <button className="text-slate-400 hover:text-slate-600 p-1 shrink-0">
            {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        </div>
      </div>

      {/* Expanded Content */}
      {expanded && (
        <div className="space-y-3 pt-2 border-t border-slate-200/60 fade-in">
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
              <span className="text-[11px] font-bold text-slate-500">Prints</span>
              {photosLoading ? (
                <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
                  <Loader2 size={14} className="animate-spin" /> A carregar prints...
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
          {run.effort_rpe && (
            <div className="space-y-1">
              <span className="text-[11px] font-bold text-slate-500">Esforço</span>
              <div className="flex gap-1">
                {Array(10).fill(0).map((_, i) => (
                  <div 
                    key={i} 
                    className={`flex-1 h-2 rounded-full ${i < run.effort_rpe ? 'bg-purple-500' : 'bg-slate-200'}`} 
                  />
                ))}
              </div>
            </div>
          )}

          {/* Observações */}
          {run.notes && (
            <div className="bg-white border border-slate-200/60 rounded-xl p-3 shadow-xs">
              <span className="text-[11px] font-bold text-slate-500 block mb-1">Observações</span>
              <p className="text-xs text-slate-700 italic">{run.notes}</p>
            </div>
          )}

          {/* ANÁLISE DO COACH */}
          {coachCommentary && (
            <div className="bg-[#e6f4ea] border border-emerald-200/80 rounded-2xl p-4 space-y-2 shadow-xs">
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-800">
                <Award size={16} className="text-emerald-600 shrink-0" />
                Análise do Coach
              </div>
              <p className="text-xs text-slate-700 leading-relaxed font-normal">
                {coachCommentary}
              </p>
            </div>
          )}

          {/* Bottom Action Bar */}
          <div className="flex items-center gap-2 pt-1">
            {run.photo_paths?.length > 0 && (
              <button
                onClick={handleReanalyze}
                disabled={isReanalyzing}
                className="flex-1 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-xl py-2.5 flex items-center justify-center gap-1.5 transition disabled:opacity-50"
              >
                {isReanalyzing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                Reanalisar
              </button>
            )}
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="border border-red-200 bg-red-50/50 hover:bg-red-50 text-red-600 font-bold text-xs rounded-xl p-2.5 flex items-center justify-center transition disabled:opacity-50"
              aria-label="Eliminar corrida"
            >
              {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
