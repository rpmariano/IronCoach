import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Image as ImageIcon, Award, Pencil, RefreshCw, Trash2, Loader2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';
import { supabase } from '../../lib/supabase';

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
  return null;
}

function formatDatePT(isoStr) {
  if (!isoStr) return '';
  return format(parseISO(isoStr), 'd MMM yyyy', { locale: pt });
}

export default function RunCard({ run, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const [photos, setPhotos] = useState([]);
  const [photosLoading, setPhotosLoading] = useState(false);

  const toggleExpand = async () => {
    const willExpand = !expanded;
    setExpanded(willExpand);

    // Load photos if expanding and hasn't loaded yet
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

  const hasDistance = !!run.distance_km;
  const hasDuration = !!run.duration_seconds;
  const pace = hasDistance && hasDuration ? paceSecPerKm(run) : null;
  const kindLabel = runKindLabel(run);
  const d = run.details || {};

  const summaryParts = [
    hasDistance ? `${Number(run.distance_km).toFixed(2)} km` : null,
    hasDuration ? formatDuration(run.duration_seconds) : null,
    pace !== null ? formatPace(pace) : null,
  ].filter(Boolean);

  return (
    <div className="card rounded-2xl overflow-hidden mb-3">
      <button 
        onClick={toggleExpand} 
        className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-slate-50 transition"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h4 className="text-sm font-bold text-slate-800">{run.name ? run.name : formatDatePT(run.date)}</h4>
            {kindLabel && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[var(--mod-corrida-from)]/10 text-[var(--mod-corrida-to)]">
                {kindLabel}
              </span>
            )}
            {run.photo_paths?.length > 0 && (
              <span className="text-[10px] text-slate-500 flex items-center gap-1">
                <ImageIcon className="w-3 h-3" /> {run.photo_paths.length}
              </span>
            )}
          </div>
          <p className="text-[12px] text-slate-500 mb-1.5">{run.name ? formatDatePT(run.date) : ''}</p>
          {summaryParts.length > 0 && (
            <p className="text-[13px] font-bold text-slate-800">{summaryParts.join(' · ')}</p>
          )}
        </div>
        {expanded ? <ChevronUp className="w-5 h-5 text-slate-400 shrink-0" /> : <ChevronDown className="w-5 h-5 text-slate-400 shrink-0" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-100 pt-4 space-y-4">
          
          {/* Photos */}
          {run.photo_paths?.length > 0 && (
            <div>
              <p className="text-[11px] text-slate-500 font-semibold mb-2">Prints</p>
              <div className="flex flex-wrap gap-2">
                {photosLoading ? (
                  <div className="w-20 h-20 rounded-xl bg-slate-100 flex items-center justify-center">
                    <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
                  </div>
                ) : (
                  photos.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                      <img src={url} alt={`Print ${i+1}`} className="w-20 h-20 object-cover rounded-xl border border-slate-200 hover:opacity-90 transition" />
                    </a>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Training Splits/Details */}
          {run.kind === 'treino' && (
            <>
              {(d.warmup_minutes || d.recovery_seconds) && (
                <div className="grid grid-cols-2 gap-1.5 text-[11px] text-slate-500 mb-2">
                  {d.warmup_minutes && <span>Aquecimento: <span className="font-semibold text-slate-700">{d.warmup_minutes} min</span></span>}
                  {d.recovery_seconds && <span>Recuperação: <span className="font-semibold text-slate-700">{d.recovery_seconds} seg</span></span>}
                </div>
              )}
              {d.splits?.length > 0 && (
                <div className="space-y-1 mb-2">
                  {d.splits.map((s, i) => (
                    <p key={i} className="text-[11px] text-slate-500">
                      Split {i+1}: <span className="font-semibold text-slate-700">
                        {s.distance_km ? `${Number(s.distance_km).toFixed(2)} km` : ''}
                        {s.distance_km && s.time_seconds ? ' · ' : ''}
                        {s.time_seconds ? formatDuration(s.time_seconds) : ''}
                      </span>
                    </p>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Competition Details */}
          {run.kind === 'competicao' && (
            <div className="grid grid-cols-2 gap-1.5 text-[11px] text-slate-500">
              {d.official_time_seconds && <span>Tempo oficial: <span className="font-semibold text-slate-700">{formatDuration(d.official_time_seconds)}</span></span>}
              {d.position && <span>Posição: <span className="font-semibold text-slate-700">{d.position}º</span></span>}
            </div>
          )}

          {/* Metrics Grid */}
          {(d.elevation_gain_m || d.cadence_spm || d.calories_kcal || d.avg_heart_rate_bpm || d.max_heart_rate_bpm || d.vo2_max) && (
            <div>
              <p className="text-[11px] text-slate-500 font-semibold mb-2">Métricas</p>
              <div className="grid grid-cols-3 gap-2">
                {d.elevation_gain_m && (
                  <div className="bg-white border border-slate-100 rounded-xl p-2.5 text-center shadow-sm">
                    <p className="text-sm font-bold text-slate-800">{d.elevation_gain_m}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Desnível (m)</p>
                  </div>
                )}
                {d.cadence_spm && (
                  <div className="bg-white border border-slate-100 rounded-xl p-2.5 text-center shadow-sm">
                    <p className="text-sm font-bold text-slate-800">{d.cadence_spm}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Cadência (spm)</p>
                  </div>
                )}
                {d.calories_kcal && (
                  <div className="bg-white border border-slate-100 rounded-xl p-2.5 text-center shadow-sm">
                    <p className="text-sm font-bold text-slate-800">{d.calories_kcal}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Calorias</p>
                  </div>
                )}
                {d.vo2_max && (
                  <div className="bg-white border border-slate-100 rounded-xl p-2.5 text-center shadow-sm">
                    <p className="text-sm font-bold text-slate-800">{d.vo2_max}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">VO2 máx</p>
                  </div>
                )}
                {d.avg_heart_rate_bpm && (
                  <div className="bg-white border border-slate-100 rounded-xl p-2.5 text-center shadow-sm">
                    <p className="text-sm font-bold text-slate-800">{d.avg_heart_rate_bpm}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">FC média</p>
                  </div>
                )}
                {d.max_heart_rate_bpm && (
                  <div className="bg-white border border-slate-100 rounded-xl p-2.5 text-center shadow-sm">
                    <p className="text-sm font-bold text-slate-800">{d.max_heart_rate_bpm}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">FC máx</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Effort Bar */}
          {run.effort_rpe && (
            <div>
              <p className="text-[11px] text-slate-500 font-semibold mb-2">Esforço</p>
              <div className="flex gap-1">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div 
                    key={i} 
                    className={`flex-1 h-2 rounded-full ${i < run.effort_rpe ? 'bg-[var(--mod-corrida-to)]' : 'bg-slate-100'}`} 
                  />
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          {run.notes && (
            <div>
              <p className="text-[11px] text-slate-500 font-semibold mb-1">Observações</p>
              <p className="text-[13px] text-slate-700">{run.notes}</p>
            </div>
          )}

          {/* Coach Analysis */}
          {run.coach_notes && (
            <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-4">
              <p className="text-[11px] text-emerald-600 font-bold flex items-center gap-1.5 mb-2 uppercase tracking-wide">
                <Award className="w-4 h-4" /> Análise do Coach
              </p>
              <p className="text-[13px] text-emerald-900 leading-relaxed font-medium">{run.coach_notes}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-2 pt-2">
            <button 
              onClick={() => onEdit(run.id)}
              className="flex-1 bg-white border border-slate-200 hover:border-slate-300 text-slate-600 text-xs font-bold rounded-xl py-2.5 flex items-center justify-center gap-1.5 transition shadow-sm"
            >
              <Pencil className="w-3.5 h-3.5" /> Editar
            </button>
            <button 
              onClick={() => onDelete(run.id)}
              className="px-3 bg-red-50 text-red-500 hover:bg-red-100 text-xs font-bold rounded-xl py-2.5 flex items-center justify-center transition"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

        </div>
      )}
    </div>
  );
}
