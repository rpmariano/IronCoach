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
import MetricInfo from '../BI/MetricInfo';
import RaceWebInfoSections from './RaceWebInfoSections';
import { calculateRaceTrainingPlan, formatDatePTShort, formatDateDayMonth } from '../../utils/racePlanEngine';
import { calculateReadinessIndex, predictRaceTime } from '../../utils/biEngine';
import { racePriorityLabel, raceDistanceLabel, formatPace, formatDuration } from '../../utils/run';
import { experienceLevelLabel } from '../../utils/experience';
import './RaceHubView.css';

export default function RaceHubView({
  race,
  runs = [],
  profile = {},
  meals = [],
  bodyAssessments = [],
  gymSessions = [],
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

  const readiness = useMemo(() =>
    calculateReadinessIndex(runs, meals, bodyAssessments, gymSessions, profile, race),
  [runs, meals, bodyAssessments, gymSessions, profile, race]);

  const readinessTitle = readiness.level === 'high' ? 'Alta' : readiness.level === 'medium' ? 'Média' : 'Baixa';

  // Previsão de tempo nesta prova pela fórmula de Riegel — mesmo cálculo do
  // gráfico "Evolução VDOT & Previsão de Prova" (BI/RacePredictionChart),
  // aqui isolado no valor pontual para comparar com o Tempo-Alvo.
  const experienceLevel = race?.experience_level || profile?.experience_level || 'iniciante';
  const prediction = useMemo(() =>
    predictRaceTime(runs, race?.distance_km || 10, experienceLevel),
  [runs, race?.distance_km, experienceLevel]);

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
              <span className="rh-distance-badge">
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
          <div className="rh-traffic-light" title={`Prontidão Global: ${readinessTitle} (${readiness.score}%)`}>
            <div className={`rh-light rh-light-red ${readiness.level === 'low' ? 'on' : ''}`} />
            <div className={`rh-light rh-light-yellow ${readiness.level === 'medium' ? 'on' : ''}`} />
            <div className={`rh-light rh-light-green ${readiness.level === 'high' ? 'on' : ''}`} />
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

          {/* Card 2: Fase de Treino em curso — nome da fase em destaque
              (era o contador "Sem. 4"), com "Sem. 4 de 6" como descrição. */}
          <div className="rh-countdown-box">
            <span className="rh-cd-label">Fase de Treino</span>
            <div className={`rh-cd-num ${daysToStart > 0 || trainingStatus === 'completed' ? '' : 'rh-cd-num-phase'}`}>
              {daysToStart > 0 ? (
                `${daysToStart}d`
              ) : trainingStatus === 'completed' ? (
                '100%'
              ) : (
                currentPhase.name
              )}
            </div>
            <span className="rh-cd-desc">
              {daysToStart > 0
                ? 'Para início do treino'
                : trainingStatus === 'completed'
                ? 'Preparação cumprida'
                : `Sem. ${currentWeek} de ${totalWeeks}`}
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
          {(race?.target_time || race?.target_pace || race?.target_pace_seconds_per_km) && (
            <div className="rh-spec-card rh-spec-card-wide">
              <span className="rh-spec-lbl">Objetivo</span>
              <span className="rh-spec-val">
                {[
                  race?.target_time ? `Total: ${race.target_time}` : null,
                  // race é o rascunho em edição (RunAgenda), que só tem
                  // target_pace (string "5.00" já formatada) — o
                  // target_pace_seconds_per_km só existe depois de gravar,
                  // por isso é o fallback, não a fonte principal.
                  race?.target_pace
                    ? `Pace: ${race.target_pace}/km`
                    : race?.target_pace_seconds_per_km
                    ? `Pace: ${formatPace(race.target_pace_seconds_per_km)}/km`
                    : null,
                ].filter(Boolean).join(' | ')}
              </span>
            </div>
          )}
          {prediction?.predictedSeconds > 0 && (
            <div className="rh-spec-card rh-spec-card-wide">
              {/* Título centrado sozinho — o ícone de ajuda fica à parte,
                  ancorado ao canto direito do cartão (absolute), por isso
                  não conta para essa centragem. left/right iguais ao padding
                  do cartão dão-lhe a mesma largura útil do resto do
                  conteúdo, para o texto de ajuda abrir com a largura certa
                  em vez de espremido. */}
              <span className="rh-spec-lbl block w-full text-center">Previsão (VDOT)</span>
              <div className="absolute flex flex-wrap justify-end" style={{ top: 8, left: 12, right: 12 }}>
                <MetricInfo text="Estimativa do teu tempo e pace nesta prova pela fórmula de Riegel, a partir da tua corrida mais rápida recente, ajustada a esta distância e ao teu nível de experiência. Serve para comparares com o Objetivo: se a previsão for mais lenta, o objetivo pode estar otimista para a tua forma atual; quanto mais perto a corrida de referência estiver desta distância, mais fiável é a estimativa." />
              </div>
              <span className="rh-spec-val">
                Total: {formatDuration(Math.round(prediction.predictedSeconds))} | Pace: {formatPace(Math.round(prediction.predictedPace))}/km
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ─── 2. Parecer & Análise da Carol sobre a Evolução do Treino ───────── */}
      <div className="rh-carol-box">
        <div className="rh-carol-header">
          <div className="rh-carol-badge">
            <div className="rh-carol-avatar">
              <Sparkles size={15} />
            </div>
            <span>Evolução & Prontidão</span>
          </div>
          <span className={`rh-carol-readiness-pill text-[10px] font-extrabold px-2.5 py-1 rounded-full ${
            readiness.level === 'high'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
              : readiness.level === 'medium'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
              : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
          }`}>
            Prontidão {readinessTitle} ({readiness.score}%)
          </span>
        </div>

        <p className="rh-carol-body">
          {carolAnalysis.overviewText}
        </p>

        {plan.viability.flags.length > 0 && (
          <div className="mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2">
            <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2">
              <AlertTriangle size={12} className="shrink-0" /> Alertas de Viabilidade
            </span>
            {plan.viability.flags.map((flag) => (
              <p key={flag} className="text-xs text-amber-200 leading-relaxed">
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
        <div className="flex items-center justify-between gap-2 pt-1 pb-1">
          <span className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <span className="w-1.5 h-3.5 rounded-full bg-amber-400 inline-block shrink-0" />
            Macrociclo de Treino ({totalWeeks} Semanas)
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
                <div className="flex flex-col gap-1.5">
                  {/* Linha 1: [Ícone + Título] à esquerda | pílula de estado da
                      fase + chevron à direita. Só esta pílula (curta: "Em
                      Curso"/"Concluída"/"Planeada") partilha a linha com o
                      título — a de avaliação (texto mais longo, ex.: "Ajuste
                      Recomendado · 50%") ia a esta coluna e espremia o nome
                      da fase até truncar (ex.: "Base Aerób..."). */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className="rh-phase-num-badge shrink-0">
                        {isCompleted ? <CheckCircle2 size={13} /> : phase.number}
                      </div>
                      <span className="rh-phase-name truncate font-bold text-slate-100 text-sm">
                        {phase.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`rh-phase-status-pill rh-pill-${phase.state} whitespace-nowrap`}>
                        {phase.state === 'active' ? 'Em Curso' : phase.state === 'completed' ? 'Concluída' : 'Planeada'}
                      </span>
                      <div className="text-slate-400 pl-0.5">
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </div>
                    </div>
                  </div>

                  {/* Linha 2: Datas & Semanas, alinhadas sob o título (pl-8). */}
                  <p className="rh-phase-dates text-[11px] font-medium text-slate-400 pl-8">
                    {phase.weeksLabel} · {formatDateDayMonth(phase.startDate)} a {formatDateDayMonth(phase.endDate)}
                  </p>

                  {/* Linha 3: pílula de avaliação — à largura total do
                      cartão (sem o recuo pl-8 da linha acima), tal como o
                      pill "Prontidão" do cartão Evolução & Prontidão. Com
                      recuo ficava mais estreita e deslocada para a direita,
                      não lendo como a mesma peça visual. */}
                  {evalData?.score != null && (
                    <span className={`rh-eval-badge rh-eval-${evalData.statusColor} whitespace-nowrap w-full`}>
                      {evalData.gradeLabel} · {evalData.score}%
                    </span>
                  )}
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
                        <div className="flex items-center gap-x-3 gap-y-1 pt-1 text-[11px] text-slate-400 flex-wrap">
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
      <div className="rh-web-info-card mb-4">
        <div className="rh-web-header">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-amber-500/20 flex items-center justify-center text-amber-400">
              <Globe size={14} />
            </div>
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
              {info ? 'Atualizar Informação' : 'Obter Informação'}
            </Button>
          )}
        </div>

        {race?.website?.trim() ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <LinkIcon size={13} className="text-amber-400 shrink-0" />
                <a
                  href={race.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-semibold text-slate-200 underline hover:text-amber-400 transition truncate"
                >
                  {race.website}
                </a>
              </div>
            </div>

            {info ? (
              <RaceWebInfoSections info={info} variant="dark" />
            ) : (
              <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] text-center space-y-2">
                <p className="text-xs text-slate-300 font-medium">
                  Clica em <span className="text-amber-400 font-bold">"Obter Informação"</span> para extrair horários, dorsais, documentos, regulamento e altimetria do site oficial.
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] flex flex-col items-center justify-center text-center gap-2.5">
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
