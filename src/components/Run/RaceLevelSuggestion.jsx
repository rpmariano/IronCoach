import React, { useMemo } from 'react';
import { Calculator, AlertOctagon } from 'lucide-react';
import Warning, { WarningAction } from '../shared/Warning';
import { getRacePrediction } from '../../utils/biEngine';
import { assessRaceLevelTriage } from '@formulas/raceLevelTriage.ts';

// Rótulos das 5 bandas do motor de triagem (Bloco 8) — 4 coincidem com
// EXPERIENCE_LEVELS (src/utils/experience.js), "sub_iniciante" é um estado
// próprio do motor, sem opção correspondente no <select> (ver render, mais
// abaixo, para o porquê disso importar).
const LEVEL_LABELS = {
  sub_iniciante: 'Abaixo de Iniciante',
  iniciante: 'Iniciante',
  basico: 'Básico',
  medio: 'Médio',
  avancado: 'Avançado',
};

function levelLabel(band) {
  return LEVEL_LABELS[band] || band;
}

// Apresentação casual ("1h40", "45min") — formatDuration (run.js) dá
// H:MM:SS, pensado para tempos-alvo de prova, não para "quanto treinaste".
export function formatHoursMinutes(totalSeconds) {
  if (!totalSeconds || totalSeconds <= 0) return null;
  const totalMinutes = Math.round(totalSeconds / 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h > 0) return `${h}h${m > 0 ? String(m).padStart(2, '0') : ''}`;
  return `${m}min`;
}

/**
 * Propõe o nível do atleta PARA ESTA PROVA a partir do histórico de treino
 * — não perguntado, medido (Bloco 8, specs/nivel-por-prova.md). Mostra a
 * evidência, não só o veredicto: "pelos teus últimos treinos, X". A
 * auto-declaração continua a decidir — isto é proposta, nunca substituição
 * (ver "Interação com a auto-declaração" na spec).
 *
 * Não renderiza nada sem distância válida, sem previsão de tempo (zero
 * corridas registadas) ou fora da forma que o motor sabe avaliar.
 *
 * Voz única (P.7 de specs/carol-omnisciencia-omnipresenca.md): isto é uma
 * fórmula, não a Carol. Por isso não leva o ícone dela (Sparkles) nem o
 * tom dela — é um cálculo, com o ícone de cálculo, e diz que o é. O que a
 * Carol acha da prova diz-o ela no hub e no chat.
 */
/** Tempo previsto para a prova, com as mesmas entradas que a sugestão de
 *  nível usa — a ajuda dos níveis de trail mostra-o em horas em vez de
 *  percentagens. null sem distância ou sem corridas registadas. */
export function predictRaceSeconds({ raceType, distanceKm, elevationGainM, declaredLevel, profile, runs }) {
  if (!(distanceKm > 0)) return null;
  const prediction = getRacePrediction({
    distance_km: distanceKm,
    elevation_gain_m: raceType === 'trail' ? elevationGainM : null,
    race_type: raceType,
    experience_level: declaredLevel || undefined,
  }, profile, runs || []);
  return prediction?.predictedSeconds > 0 ? prediction.predictedSeconds : null;
}

const NOTA_FORMULA = 'Cálculo a partir dos teus últimos treinos, não uma opinião da Carol.';
export default function RaceLevelSuggestion({
  raceType,
  distanceKm,
  elevationGainM,
  declaredLevel,
  profile,
  runs,
  todayISO,
  onUseLevel,
}) {
  const result = useMemo(() => {
    if (!(distanceKm > 0)) return null;

    // Mesma resolução de nível que RaceHubView/RunDashboard já usam
    // (getRacePrediction → resolveExperienceLevel prioriza o nível JÁ
    // declarado nesta prova) — não a duplicamos com outra regra só aqui,
    // ou este ecrã voltava a divergir de todos os outros (ver o aviso no
    // próprio comentário de getRacePrediction em biEngine.js).
    const predictedSeconds = predictRaceSeconds({ raceType, distanceKm, elevationGainM, declaredLevel, profile, runs });
    if (!predictedSeconds) return null; // sem corridas — nada a prever

    // runs vêm do store como linhas cruas de `runs` — o D+ vive em
    // details.elevation_gain_m (jsonb), não numa coluna própria (ver
    // runWatchMetrics.ts). Mesmo fallback multi-camada do RunCard.jsx, para
    // não perder D+ de registos anteriores a essa normalização.
    const flattenedRuns = (runs || []).map((r) => ({
      date: r.date,
      duration_seconds: r.duration_seconds,
      elevation_gain_m: r.details?.elevation_gain_m ?? r.elevation_gain_m ?? null,
    }));

    const raceElevationM = raceType === 'trail' && elevationGainM > 0 ? elevationGainM : 0;
    const triage = assessRaceLevelTriage({
      runs: flattenedRuns,
      todayISO,
      raceTimeSecondsPrevisto: predictedSeconds,
      raceElevationM,
    });

    return { ...triage, isTrail: raceType === 'trail', raceElevationM };
  }, [raceType, distanceKm, elevationGainM, declaredLevel, profile, runs, todayISO]);

  if (!result) return null;

  if (result.level == null) {
    return (
      <p className="text-[11px] text-[var(--text-3)] mt-1.5 flex items-start gap-1.5">
        <Calculator size={12} className="shrink-0 mt-0.5 opacity-60" />
        <span>Ainda sem dados suficientes dos últimos treinos (menos de 3 das últimas 4 semanas com registo) para sugerir automaticamente o teu nível para esta prova.</span>
      </p>
    );
  }

  const timeStr = formatHoursMinutes(result.peakTimeOnFeetSeconds);
  const elevationStr = result.isTrail && result.raceElevationM > 0 && result.peakElevationM != null
    ? `sobes ${Math.round(result.peakElevationM)} m por semana`
    : null;
  const evidence = [
    timeStr ? `corres ${timeStr} por semana` : null,
    elevationStr,
  ].filter(Boolean).join(', ');

  // sub_iniciante não tem opção no <select> de nível (EXPERIENCE_LEVELS) —
  // de propósito: não há "nível seguro" abaixo de Iniciante para oferecer
  // num clique. É o Red Flag da doutrina (Bloco 8, Índice de Cobertura
  // Excêntrica) — avisa com firmeza em vez de propor uma ação de um clique.
  if (result.level === 'sub_iniciante') {
    return (
      <Warning tone="danger" title="Preparação insuficiente (cálculo)" icon={<AlertOctagon size={14} />} className="mt-1.5">
        Pelos teus últimos treinos ({evidence || 'sem registo suficiente'}), a tua preparação
        está abaixo do que esta prova exige — mesmo para o nível Iniciante. Considera reduzir o
        objetivo, mudar a prioridade da prova para Secundária/Treino, ou dar mais tempo à
        preparação antes de escolheres um nível aqui.
        <span className="block mt-1.5 text-[11px]" style={{ color: 'var(--text-4)' }}>{NOTA_FORMULA}</span>
      </Warning>
    );
  }

  /* Ponto 3: a sugestão era âmbar sobre fundo âmbar claro — o âmbar é da
     prova. "Bate certo" é o verde do dentro-do-alvo; "não bate certo" é o
     coral do aviso. Os textos são os mesmos. */
  const matchesDeclared = declaredLevel && declaredLevel === result.level;
  if (matchesDeclared) {
    return (
      <Warning tone="ok" title="Nível calculado: bate certo" icon={<Calculator size={12} />} className="mt-1.5">
        Pelos teus últimos treinos ({evidence}), o nível que escolheste bate certo.
        <span className="block mt-1.5 text-[11px]" style={{ color: 'var(--text-4)' }}>{NOTA_FORMULA}</span>
      </Warning>
    );
  }

  return (
    <Warning
      title="Nível calculado"
      icon={<Calculator size={14} />}
      className="mt-1.5"
      actions={
        <WarningAction onClick={() => onUseLevel(result.level)}>
          Usar nível {levelLabel(result.level)}
        </WarningAction>
      }
    >
      Pelos teus últimos treinos ({evidence}), classificas-te como{' '}
      <strong>{levelLabel(result.level)}</strong> para esta prova.
      <span className="block mt-1.5 text-[11px]" style={{ color: 'var(--text-4)' }}>{NOTA_FORMULA}</span>
    </Warning>
  );
}
