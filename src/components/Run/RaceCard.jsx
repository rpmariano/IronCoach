import React, { useMemo, useState } from 'react';
import { useAppStore } from '../../store';
import {
  RotateCcw,
  CheckCircle,
  PencilLine,
  Trash2,
  Link as LinkIcon,
  ChevronDown,
  ChevronUp,
  MapPin,
  Target,
  Calendar,
  Activity,
  Sparkles,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import Button from '../shared/Button';
import { pt } from 'date-fns/locale';
import {
  raceDistanceLabel,
  racePriorityLabel,
  raceTerrainLabel,
  formatPace,
} from '../../utils/run';
import { calculateRaceTrainingPlan } from '../../utils/racePlanEngine';
import { todayISO } from '../../lib/utils';

function formatDatePT(isoStr) {
  if (!isoStr) return '';
  return format(parseISO(isoStr), 'd MMM yyyy', { locale: pt });
}

export default function RaceCard({ ev, onEdit, onToggleStatus, onDelete }) {
  const { profile, runs } = useAppStore();
  const [expanded, setExpanded] = useState(false);
  const todayIso = todayISO();
  
  const toggleExpand = () => setExpanded(!expanded);
  
  const distanceLabel = raceDistanceLabel(ev.distance_km);
  const isPast = ev.date < todayIso;
  const done = ev.status === 'concluida';

  // Macrociclo e evolução da preparação através do motor unificado
  const plan = useMemo(() => {
    return calculateRaceTrainingPlan({
      race: ev,
      profile,
      runs,
      todayISO: todayIso,
    });
  }, [ev, profile, runs, todayIso]);

  return (
    <div 
      onClick={toggleExpand}
      className={`card rounded-2xl p-4 shadow-sm cursor-pointer hover:shadow-md transition ${done ? 'opacity-60' : ''}`}
      style={{ backgroundColor: 'rgba(251, 191, 36, 0.04)' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-800 flex items-center gap-1.5 flex-wrap">
            {ev.name}
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white border" style={{ color: 'var(--mod-prova)', borderColor: 'var(--mod-prova)' }}>
              {distanceLabel}
            </span>
            {ev.race_type && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-500">
                {raceTerrainLabel(ev.race_type)}
              </span>
            )}
            {done && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">Concluída</span>}
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
        <div className="space-y-3 pt-2.5 mt-2.5 border-t border-slate-200/60 fade-in">
          {/* Grelha de Dados Essenciais */}
          <div className="grid grid-cols-2 gap-2">
            {/* 1. Localização & Distância */}
            <div className="p-2.5 rounded-xl bg-slate-50/80 border border-slate-200/60 flex flex-col gap-0.5">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                <MapPin size={11} className="text-amber-500" /> Local & Distância
              </span>
              <span className="text-xs font-bold text-slate-800 truncate">
                {ev.location || 'Local a definir'}
              </span>
              <span className="text-[11px] font-medium text-slate-500 truncate">
                {distanceLabel} {ev.elevation_gain_m != null ? `· ${ev.elevation_gain_m}m D+` : ''} {ev.race_type === 'trail' ? '· Trail' : ''}
              </span>
            </div>

            {/* 2. Objetivo */}
            <div className="p-2.5 rounded-xl bg-slate-50/80 border border-slate-200/60 flex flex-col gap-0.5">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                <Target size={11} className="text-amber-500" /> Objetivo
              </span>
              <span className="text-xs font-bold text-slate-800 truncate">
                {ev.target_time ? `Tempo: ${ev.target_time}` : (ev.target_pace_seconds_per_km ? `Ritmo: ${formatPace(ev.target_pace_seconds_per_km)}/km` : 'Sem meta')}
              </span>
              <span className="text-[11px] font-medium text-slate-500 truncate">
                {ev.target_time && ev.target_pace_seconds_per_km ? `Ritmo: ${formatPace(ev.target_pace_seconds_per_km)}/km` : (ev.race_priority ? `Prioridade ${racePriorityLabel(ev.race_priority)}` : 'Treino contínuo')}
              </span>
            </div>

            {/* 3. Tempo que Falta */}
            <div className="p-2.5 rounded-xl bg-slate-50/80 border border-slate-200/60 flex flex-col gap-0.5">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                <Calendar size={11} className="text-amber-500" /> Contagem
              </span>
              <span className="text-xs font-bold text-slate-800">
                {done ? 'Concluída' : plan.daysToRace === 0 ? 'É HOJE!' : plan.daysToRace > 0 ? `Faltam ${plan.daysToRace} dias` : `${Math.abs(plan.daysToRace)} dias atrás`}
              </span>
              <span className="text-[11px] font-medium text-slate-500 truncate">
                {plan.trainingStatus === 'in_progress' ? `Semana ${plan.currentWeek} de ${plan.totalWeeks}` : `${plan.totalWeeks} semanas total`}
              </span>
            </div>

            {/* 4. Fase Atual ou Contagem para Início */}
            <div className="p-2.5 rounded-xl bg-slate-50/80 border border-slate-200/60 flex flex-col gap-0.5">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                <Activity size={11} className="text-amber-500" />
                {plan.trainingStatus === 'not_started' ? 'Início do Treino' : 'Fase do Treino'}
              </span>
              <span className="text-xs font-bold text-amber-600 truncate">
                {plan.trainingStatus === 'not_started'
                  ? `Faltam ${plan.daysToStart} dias`
                  : (plan.currentPhase?.name || 'Base Aeróbica')}
              </span>
              <span className="text-[11px] font-medium text-slate-500 truncate">
                {plan.trainingStatus === 'not_started'
                  ? 'Início da 1ª Fase (Base)'
                  : (plan.currentPhase?.weeksLabel || `Sem. 1-${plan.totalWeeks}`)}
              </span>
            </div>
          </div>

          {/* Como Corre a Preparação (Parecer da Carol) */}
          {!done && (
            <div className="p-3 rounded-xl bg-slate-50/90 border border-slate-200/70 flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles size={12} className="text-amber-500" />
                  {plan.trainingStatus === 'not_started' ? 'Recomendações Prévias da Carol' : 'Evolução da Preparação'}
                </span>
                {plan.trainingStatus !== 'not_started' && (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${
                    plan.readinessLevel === 'green'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                      : plan.readinessLevel === 'yellow'
                      ? 'bg-amber-50 border-amber-200 text-amber-700'
                      : 'bg-rose-50 border-rose-200 text-rose-700'
                  }`}>
                    {plan.carolAnalysis.readinessLabel}
                  </span>
                )}
              </div>

              <p className="text-[11px] text-slate-600 leading-relaxed">
                {plan.trainingStatus === 'not_started'
                  ? plan.carolAnalysis.overviewText
                  : (plan.currentPhase?.evaluation?.summary || plan.carolAnalysis.overviewText)}
              </p>

              {plan.trainingStatus !== 'not_started' && plan.currentPhase?.evaluation?.score != null && (
                <div className="flex items-center justify-between pt-1 border-t border-slate-200/50 text-[11px] text-slate-500">
                  <span>Classificação da Fase:</span>
                  <span className="font-bold text-slate-700">
                    {plan.currentPhase.evaluation.gradeLabel} · {plan.currentPhase.evaluation.score}%
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Link para o site da prova se existir */}
          {ev.website && (
            <div className="text-[11px] text-slate-500 flex items-center gap-1 px-0.5 truncate">
              <LinkIcon size={11} className="shrink-0 text-slate-400" />
              <a href={ev.website} target="_blank" rel="noopener noreferrer" className="underline hover:text-[var(--mod-prova)] transition truncate">
                {ev.website}
              </a>
            </div>
          )}

          {/* Notas adicionais */}
          {ev.notes && <p className="text-[11px] text-slate-500 italic px-0.5">"{ev.notes}"</p>}

          {/* Botões de Ação */}
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
