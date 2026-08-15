import React, { useMemo } from 'react';
import { useAppStore } from '../../store';
import { RotateCcw, CheckCircle, Pencil, Trash2, Link as LinkIcon, AlertTriangle } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';
import {
  raceDistanceLabel,
  racePriorityLabel,
  formatPace,
} from '../../utils/run';
import { experienceLevelLabel } from '../../utils/experience';
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

export default function RaceCard({ ev, onEdit, onToggleStatus, onDelete }) {
  const { profile, runs } = useAppStore();
  const todayIso = todayISO();
  const weeklyVol = useMemo(() => recentWeeklyVolume(runs, todayIso), [runs, todayIso]);
  
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
    <div className={`card rounded-2xl p-4 shadow-sm border border-slate-100 ${done ? 'opacity-60' : ''}`} style={{ backgroundColor: 'rgba(217, 70, 239, 0.02)' }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-800 flex items-center gap-1.5 flex-wrap">
            {ev.name}
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white border" style={{ color: 'var(--mod-coach-to)', borderColor: 'var(--mod-coach-to)' }}>
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
          {/* Avisos de viabilidade (Bloco 1 — objetivo_inviavel) */}
          {viability.flags.length > 0 && (
            <div className="mt-1.5 flex flex-col gap-0.5">
              {viability.flags.map(flag => (
                <p key={flag} className="text-[10px] font-semibold flex items-center gap-1" style={{ color: 'var(--color-warn)' }}>
                  <AlertTriangle size={10} />
                  {FLAG_LABELS[flag] || flag}
                </p>
              ))}
            </div>
          )}
          {ev.elevation_gain_m != null && <p className="text-[11px] text-slate-500 mt-0.5">D+: {ev.elevation_gain_m} m</p>}
          {ev.target_time && <p className="text-[11px] text-slate-500 mt-0.5">Tempo-alvo: {ev.target_time}</p>}
          {ev.target_pace_seconds_per_km && <p className="text-[11px] text-slate-500 mt-0.5">Ritmo-alvo: {formatPace(ev.target_pace_seconds_per_km)} /km</p>}
          {ev.website && (
            <p className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1">
              <LinkIcon size={11} />
              <a href={ev.website} target="_blank" rel="noopener noreferrer" className="underline hover:text-[var(--mod-coach-to)] transition truncate">
                {ev.website}
              </a>
            </p>
          )}
          {ev.notes && <p className="text-[11px] text-slate-500 mt-0.5 italic">"{ev.notes}"</p>}
        </div>
        <div className="flex flex-col items-center justify-start gap-2 shrink-0">
          <button onClick={() => onToggleStatus && onToggleStatus(ev)} aria-label={done ? 'Marcar prova como agendada' : 'Marcar prova como concluída'} className="tap-44 text-slate-400 hover:text-emerald-500 transition">
            {done ? <RotateCcw size={16} /> : <CheckCircle size={16} />}
          </button>
          <button onClick={() => onEdit && onEdit(ev.id)} aria-label="Editar prova" className="tap-44 text-slate-400 hover:text-[var(--mod-coach-to)] transition">
            <Pencil size={16} />
          </button>
          <button onClick={() => onDelete && onDelete(ev.id)} aria-label="Eliminar prova" className="tap-44 text-slate-400 hover:text-red-500 transition">
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
