import React, { useMemo, useState } from 'react';
import { useAppStore } from '../../store';
import { RotateCcw, CheckCircle, PencilLine, Trash2, Link as LinkIcon, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import Button from '../shared/Button';
import { pt } from 'date-fns/locale';
import {
  raceDistanceLabel,
  racePriorityLabel,
  formatPace,
} from '../../utils/run';
import { experienceLevelLabel } from '../../utils/experience';
import { assessRaceViability, recentWeeklyVolume } from '../../utils/raceViability';
import RaceInfoPanel from './RaceInfoPanel';

function todayISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function formatDatePT(isoStr) {
  if (!isoStr) return '';
  return format(parseISO(isoStr), 'd MMM yyyy', { locale: pt });
}

export default function RaceCard({ ev, onEdit, onToggleStatus, onDelete }) {
  const { profile, runs } = useAppStore();
  const [expanded, setExpanded] = useState(false);
  const todayIso = todayISO();
  const weeklyVol = useMemo(() => recentWeeklyVolume(runs, todayIso), [runs, todayIso]);
  
  const toggleExpand = () => setExpanded(!expanded);
  
  const distanceLabel = raceDistanceLabel(ev.distance_km);
  const isPast = ev.date < todayIso;
  const done = ev.status === 'concluida';

  // Viabilidade do objetivo — Bloco 1 da doutrina do Coach.
  const weeksToRace = Math.floor(
    (new Date(ev.date + 'T00:00:00').getTime() - new Date(todayIso + 'T00:00:00').getTime()) / (7 * 86400000)
  );
  const viability = !done ? assessRaceViability({
    distanceKm: ev.distance_km,
    experienceLevel: ev.experience_level || profile?.experience_level,
    weeksToRace,
    weeklyVolumeKm: weeklyVol > 0 ? weeklyVol : null,
  }) : { flags: [], isViable: true };

  const FLAG_LABELS = {
    ultra_para_iniciante: 'Ultra desaconselhado para iniciante',
    tempo_insuficiente:   `Tempo insuficiente — faltam ${weeksToRace} sem.`,
    volume_insuficiente:  `Volume insuficiente — média ${weeklyVol} km/sem`,
  };

  return (
    <div 
      onClick={toggleExpand}
      className={`card rounded-2xl p-4 shadow-sm cursor-pointer hover:shadow-md transition ${done ? 'opacity-60' : ''}`}
      // .card já traz a borda branca uniforme (ver globals.css) — sem
      // borda lateral colorida, como os outros cartões.
      style={{ backgroundColor: 'rgba(251, 191, 36, 0.04)' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-800 flex items-center gap-1.5 flex-wrap">
            {ev.name}
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white border" style={{ color: 'var(--mod-prova)', borderColor: 'var(--mod-prova)' }}>
              {distanceLabel}
            </span>
            {ev.race_type === 'trail' && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-500">
                Trail
              </span>
            )}
            {done && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">Concluída</span>}
            {ev.experience_level && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-500">
                {experienceLevelLabel(ev.experience_level)}
              </span>
            )}
            {/* Pílula de prioridade A/B/C — cor diferente por nível. */}
            {ev.race_priority && (
              <span className={[
                'text-[10px] font-bold px-2 py-0.5 rounded-full border',
                ev.race_priority === 'a'
                  ? 'bg-amber-50 border-amber-300 text-amber-700'
                  : ev.race_priority === 'b'
                  ? 'bg-blue-50 border-blue-300 text-blue-700'
                  : 'bg-slate-50 border-slate-300 text-slate-500',
              ].join(' ')}>
                {racePriorityLabel(ev.race_priority)}
              </span>
            )}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            {formatDatePT(ev.date)}
            {isPast && !done ? ' · já passou' : ''}
            {ev.location ? ` · ${ev.location}` : ''}
          </p>
        </div>
        <div className="flex items-start justify-end shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); toggleExpand(); }}
            type="button"
            aria-label={expanded ? 'Fechar detalhes da prova' : 'Ver detalhes da prova'}
            aria-expanded={expanded}
            className="tap-44 text-slate-400 hover:text-slate-600"
          >
            {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        </div>
      </div>

      {/* Expanded Content */}
      {expanded && (
        <div className="space-y-3 pt-2 mt-2 border-t border-slate-200/60 fade-in">
          <div className="space-y-1">
            {ev.elevation_gain_m != null && <p className="text-[11px] text-slate-500 mt-0.5">D+: {ev.elevation_gain_m} m</p>}
            {ev.target_time && <p className="text-[11px] text-slate-500 mt-0.5">Tempo-alvo: {ev.target_time}</p>}
            {ev.target_pace_seconds_per_km && <p className="text-[11px] text-slate-500 mt-0.5">Ritmo-alvo: {formatPace(ev.target_pace_seconds_per_km)} /km</p>}
            {ev.website && (
              <p className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1">
                <LinkIcon size={11} />
                <a href={ev.website} target="_blank" rel="noopener noreferrer" className="underline hover:text-[var(--mod-prova)] transition truncate">
                  {ev.website}
                </a>
              </p>
            )}
            {ev.notes && <p className="text-[11px] text-slate-500 mt-0.5 italic">"{ev.notes}"</p>}
          </div>

          <RaceInfoPanel ev={ev} />

          {/* Avisos de viabilidade (Bloco 1 — objetivo_inviavel) */}
          {!done && (
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex flex-col gap-1.5">
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

          <div className="flex items-center gap-2 pt-1">
            <Button
              variant="light"
              onClick={(e) => { e.stopPropagation(); onToggleStatus && onToggleStatus(ev); setExpanded(false); }}
              className={`flex-1 text-xs ${done ? 'text-amber-600' : 'text-emerald-600'}`}
              icon={done ? <RotateCcw size={14} /> : <CheckCircle size={14} />}
            >
              {done ? 'Repor' : 'Concluída'}
            </Button>
            {onEdit && (
              <Button
                variant="light"
                onClick={(e) => { e.stopPropagation(); onEdit(ev.id); }}
                className="flex-1 text-xs"
                icon={<PencilLine size={14} />}
              >
                Editar
              </Button>
            )}
            <Button
              variant="light-danger"
              onClick={(e) => { e.stopPropagation(); onDelete && onDelete(ev.id); }}
              className="flex-1 text-xs"
              icon={<Trash2 size={14} />}
            >
              Eliminar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
