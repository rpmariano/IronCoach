import React, { useMemo, useState } from 'react';
import {
  Sparkles,
  RefreshCw,
  Calendar,
  MapPin,
  Mountain,
  Gauge,
  Timer,
  Trophy,
  CheckCircle2,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Link as LinkIcon,
  Globe,
  Award,
  Flame,
  Zap,
} from 'lucide-react';
import Button from '../shared/Button';
import RunIcon from '../shared/RunIcon';
import RaceWebInfoSections from './RaceWebInfoSections';
import { calculateRaceTrainingPlan, formatDatePTShort, formatDateDayMonth } from '../../utils/racePlanEngine';
import { racePriorityLabel, raceDistanceLabel, formatPace } from '../../utils/run';
import { experienceLevelLabel } from '../../utils/experience';
import './RaceHubView.css';

export default function RaceHubView({
  race,
  runs = [],
  profile = {},
  onFetchWebInfo,
  fetchingWebInfo = false,
  onGoToEdit,
}) {
  const [expandedPhaseId, setExpandedPhaseId] = useState(null);

  const plan = useMemo(() => {
    return calculateRaceTrainingPlan({
      race,
      profile,
      runs,
    });
  }, [race, profile, runs]);

  const {
    raceDate,
    planStartDate,
    totalWeeks,
    recoveryDays,
    daysToRace,
    daysToStart,
    currentWeek,
    progressPercentage,
    trainingStatus,
    equivalentKm,
    currentPhase,
    phases,
    readinessLevel,
    carolAnalysis,
  } = plan;

  const togglePhase = (id) => {
    setExpandedPhaseId(prev => (prev === id ? null : id));
  };

  const formattedRaceDate = formatDatePTShort(raceDate);
  const distanceLabel = raceDistanceLabel(race?.distance_km || 10);
  const info = race?.web_info || null;

  return (
    <div className="race-hub-container">
      {/* ─── 1. Hero Card AAA com Glow & Countdowns Duplos ─────────────────── */}
      <div className="rh-hero-card">
        <div className="rh-glow" />

        <div className="rh-hero-top">
          <div className="flex-1 min-w-0">
            <div className="rh-header-badges">
              <span className="rh-tag">{race?.race_type || 'Estrada'}</span>
              <span className={`rh-priority-pill rh-priority-${race?.race_priority || 'a'}`}>
                {racePriorityLabel(race?.race_priority || 'a')}
              </span>
              <span className="text-[10px] font-bold text-slate-400">
                {distanceLabel}
              </span>
            </div>
            <h1 className="rh-title">{race?.name || 'Nova Prova'}</h1>
            <div className="rh-sub-info">
              <div className="rh-sub-item">
                <Calendar size={13} className="text-amber-400" />
                <span>{formattedRaceDate}</span>
              </div>
              <div className="rh-sub-item">
                <MapPin size={13} className="text-amber-400" />
                <span>{race?.location || 'Local a definir'}</span>
              </div>
              {race?.experience_level && (
                <div className="rh-sub-item text-slate-300">
                  <span>· {experienceLevelLabel(race.experience_level)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Semáforo de Prontidão Carol */}
          <div className="rh-traffic-light" title={`Prontidão Carol: ${carolAnalysis.readinessLabel}`}>
            <div className={`rh-light rh-light-red ${readinessLevel === 'red' ? 'on' : ''}`} />
            <div className={`rh-light rh-light-yellow ${readinessLevel === 'yellow' ? 'on' : ''}`} />
            <div className={`rh-light rh-light-green ${readinessLevel === 'green' ? 'on' : ''}`} />
          </div>
        </div>

        {/* Countdowns Duplos */}
        <div className="rh-countdown-row">
          {/* Card 1: Dias para a Prova */}
          <div className="rh-countdown-box">
            <span className="rh-cd-label">Contagem para a Prova</span>
            <div className="rh-cd-num">
              {daysToRace < 0 ? 'Concluída' : daysToRace === 0 ? 'Hoje!' : daysToRace}
            </div>
            <span className="rh-cd-desc">
              {daysToRace < 0 ? 'Ciclo finalizado' : daysToRace === 0 ? 'Dia da competição' : 'Dias restantes'}
            </span>
          </div>

          {/* Card 2: Início do Treino / Progresso em Semanas */}
          <div className="rh-countdown-box">
            <span className="rh-cd-label">Status do Treino</span>
            <div className="rh-cd-num">
              {daysToStart > 0 ? (
                `${daysToStart}d`
              ) : trainingStatus === 'completed' ? (
                '100%'
              ) : (
                `Sem. ${currentWeek}`
              )}
            </div>
            <span className="rh-cd-desc">
              {daysToStart > 0
                ? 'Para início do treino'
                : trainingStatus === 'completed'
                ? 'Preparação cumprida'
                : `De ${totalWeeks} sem. (${currentPhase.name})`}
            </span>
          </div>
        </div>

        {/* Linha de Progresso & Corredor na Timeline */}
        <div className="rh-track-container">
          <div className="rh-track-bar">
            <div className="rh-track-fill" style={{ width: `${progressPercentage}%` }} />
            <div className="rh-runner-dot" style={{ left: `${progressPercentage}%` }}>
              <RunIcon size={14} strokeWidth={2.5} color="#d97706" />
            </div>
          </div>
          <div className="rh-track-labels">
            <span>Início ({formatDateDayMonth(planStartDate)})</span>
            <span className="text-amber-400 font-extrabold">
              {trainingStatus === 'not_started'
                ? `Início em ${daysToStart} dias`
                : trainingStatus === 'completed'
                ? 'Prova Concluída'
                : `Fase: ${currentPhase.name}`}
            </span>
            <span>Meta ({formatDateDayMonth(raceDate)})</span>
          </div>
        </div>

        {/* Specs Grid */}
        <div className="rh-specs-grid">
          <div className="rh-spec-card">
            <span className="rh-spec-lbl">Distância</span>
            <span className="rh-spec-val">{race?.distance_km || 10} km</span>
          </div>
          {race?.race_type === 'trail' && (
            <div className="rh-spec-card">
              <span className="rh-spec-lbl">D+ / ITRA Equiv.</span>
              <span className="rh-spec-val">
                +{race?.elevation_gain_m || 0}m ({equivalentKm} km)
              </span>
            </div>
          )}
          {race?.target_time && (
            <div className="rh-spec-card">
              <span className="rh-spec-lbl">Tempo-Alvo</span>
              <span className="rh-spec-val">{race.target_time}</span>
            </div>
          )}
          {race?.target_pace_seconds_per_km && (
            <div className="rh-spec-card">
              <span className="rh-spec-lbl">Ritmo-Alvo</span>
              <span className="rh-spec-val">{formatPace(race.target_pace_seconds_per_km)} /km</span>
            </div>
          )}
          <div className="rh-spec-card">
            <span className="rh-spec-lbl">Duração Macrociclo</span>
            <span className="rh-spec-val">{totalWeeks} Semanas</span>
          </div>
        </div>
      </div>

      {/* ─── 2. Parecer & Análise da Carol sobre a Evolução do Treino ───────── */}
      <div className="rh-carol-box">
        <div className="rh-carol-header">
          <div className="rh-carol-badge">
            <div className="rh-carol-avatar">
              <Sparkles size={15} />
            </div>
            <span>Análise da Carol · Evolução & Prontidão</span>
          </div>
          <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full ${
            readinessLevel === 'green'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
              : readinessLevel === 'yellow'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
              : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
          }`}>
            {carolAnalysis.readinessLabel}
          </span>
        </div>

        <p className="rh-carol-body">
          {carolAnalysis.overviewText}
        </p>

        {plan.viability.flags.length > 0 && (
          <div className="mt-3 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-1">
            <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
              <AlertTriangle size={12} /> Alertas de Viabilidade
            </span>
            {plan.viability.flags.map((flag) => (
              <p key={flag} className="text-xs text-amber-200">
                {flag === 'ultra_para_iniciante' && '• Prova de Ultra-Trail não recomendada para nível iniciante sem histórico de maratona.'}
                {flag === 'tempo_insuficiente' && `• Faltam ${Math.floor(daysToRace / 7)} semanas — a preparação recomendada para esta distância é de ${totalWeeks} semanas.`}
                {flag === 'volume_insuficiente' && `• O teu volume médio recente (${carolAnalysis.weeklyVolumeKm} km/sem) está abaixo do recomendado para esta distância.`}
              </p>
            ))}
          </div>
        )}
      </div>

      {/* ─── 3. Fases do Treino & Classificação da Carol por Fase ──────────── */}
      <div className="rh-phases-section">
        <div className="rh-section-title">
          <span>Macrociclo de Treino ({totalWeeks} Semanas)</span>
          <span className="text-[11px] font-bold text-amber-400">
            Fase Atual: {currentPhase.name}
          </span>
        </div>

        <div className="space-y-2.5">
          {phases.map((phase) => {
            const isActive = phase.state === 'active';
            const isCompleted = phase.state === 'completed';
            const isExpanded = expandedPhaseId === phase.id || (isActive && expandedPhaseId === null);
            const evalData = phase.evaluation;

            return (
              <div
                key={phase.id}
                onClick={() => togglePhase(phase.id)}
                className={`rh-phase-card cursor-pointer ${
                  isActive ? 'active-phase' : isCompleted ? 'completed-phase' : ''
                }`}
              >
                <div className="rh-phase-header">
                  <div className="rh-phase-num-badge">
                    {isCompleted ? <CheckCircle2 size={13} /> : phase.number}
                  </div>

                  <div className="rh-phase-title-wrap">
                    <div className="flex items-center gap-2">
                      <span className="rh-phase-name">{phase.name}</span>
                      <span className={`rh-phase-status-pill rh-pill-${phase.state}`}>
                        {phase.state === 'active' ? 'Em Curso' : phase.state === 'completed' ? 'Concluída' : 'Planeada'}
                      </span>
                    </div>
                    <p className="rh-phase-dates">
                      {phase.weeksLabel} · {formatDateDayMonth(phase.startDate)} a {formatDateDayMonth(phase.endDate)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {evalData?.score && (
                      <span className={`rh-eval-badge rh-eval-${evalData.statusColor}`}>
                        {evalData.gradeLabel} ({evalData.score}%)
                      </span>
                    )}
                    <button
                      type="button"
                      aria-label="Expandir detalhes da fase"
                      className="text-slate-400 hover:text-slate-200"
                    >
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  </div>
                </div>

                {/* Conteúdo Expandido da Fase */}
                {isExpanded && (
                  <div className="rh-phase-eval fade-in" onClick={(e) => e.stopPropagation()}>
                    <p className="text-xs text-slate-300 font-medium">
                      <span className="text-amber-400 font-bold">Foco da Fase:</span> {phase.focus}
                    </p>

                    {/* Classificação da Carol */}
                    <div className="p-2.5 rounded-xl bg-black/20 border border-white/5 space-y-1.5 mt-1">
                      <div className="rh-eval-header">
                        <span className="rh-eval-carol-lbl">
                          <Sparkles size={11} /> Avaliação da Carol
                        </span>
                        {evalData?.stars > 0 && (
                          <span className="rh-eval-stars" title={`${evalData.stars} de 5 estrelas`}>
                            {'★'.repeat(evalData.stars)}{'☆'.repeat(5 - evalData.stars)}
                          </span>
                        )}
                      </div>

                      <p className="rh-eval-summary">
                        {evalData?.summary}
                      </p>

                      {evalData?.metrics?.runsCount > 0 && (
                        <div className="flex items-center gap-3 pt-1 text-[11px] text-slate-400 flex-wrap">
                          <span>Corridas: <strong className="text-slate-200">{evalData.metrics.runsCount}</strong></span>
                          <span>Volume: <strong className="text-slate-200">{evalData.metrics.totalKm} km</strong></span>
                          {evalData.metrics.polarizedZ1Z2Pct !== null && (
                            <span>Z1/Z2: <strong className="text-emerald-400">{evalData.metrics.polarizedZ1Z2Pct}%</strong></span>
                          )}
                          {evalData.metrics.avgPace && (
                            <span>Ritmo médio: <strong className="text-slate-200">{evalData.metrics.avgPace} /km</strong></span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── 4. Informação Oficial do Site da Prova & Extração ─────────────── */}
      <div className="rh-web-info-card">
        <div className="rh-web-header">
          <div className="flex items-center gap-2">
            <Globe size={16} className="text-amber-400" />
            <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
              Informação do Site Oficial
            </span>
          </div>

          {race?.website?.trim() && onFetchWebInfo && (
            <Button
              variant="module"
              moduleColor="var(--mod-prova)"
              size="sm"
              isLoading={fetchingWebInfo}
              onClick={onFetchWebInfo}
              icon={info ? <RefreshCw size={12} /> : <Sparkles size={12} />}
            >
              {info ? 'Atualizar do Site' : 'Obter do Site'}
            </Button>
          )}
        </div>

        {race?.website?.trim() ? (
          <div className="space-y-2.5">
            <p className="text-[11px] text-slate-400 flex items-center gap-1.5 truncate">
              <LinkIcon size={12} className="text-amber-400 shrink-0" />
              <a
                href={race.website}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-amber-400 transition truncate"
              >
                {race.website}
              </a>
            </p>

            {info ? (
              <RaceWebInfoSections info={info} />
            ) : (
              <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-center space-y-2">
                <p className="text-xs text-slate-300">
                  Clica em "Obter do Site" para extrair automaticamente horários, dorsais, documentos e altimetria do site oficial.
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 flex flex-col items-center justify-center text-center gap-2">
            <p className="text-xs text-slate-400">
              Ainda não adicionaste o site oficial desta prova.
            </p>
            {onGoToEdit && (
              <Button variant="light" size="sm" onClick={onGoToEdit}>
                Adicionar Site da Prova
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
