// Engine de Periodização & Análise da Prova (Doutrina do Coach Carol)
// Calcula o macrociclo, contadores de dias, divisão das 5 fases de treino,
// classificação de desempenho por fase e parecer de evolução do treino.
//
// Fontes canónicas:
// - Daniels' Running Formula 4th Ed (2021)
// - Advanced Marathoning / Faster Road Racing (Pfitzinger 2014/2019)
// - Mujika & Padilla (2003) — Tapering Strategies
// - Gabbett (2016) — ACWR & Training-Injury Prevention
// - Minetti / ITRA / Naismith (Conversão D+)

import { categorizeDistance, MIN_PREP_WEEKS, MIN_VOLUME_KM, assessRaceViability, recentWeeklyVolume } from './raceViability';
import { parseDurationToSeconds, formatDuration, parsePaceToSeconds, formatPace, racePriorityLabel } from './run';
import { format, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';
import { getTaperWeeks as sharedGetTaperWeeks } from '@formulas/taper.ts';
import { calculateEquivalentFlatKm as sharedCalculateEquivalentFlatKm } from '@formulas/racePrediction.ts';
import { getRecoveryDaysAfterRace as sharedGetRecoveryDaysAfterRace } from '@formulas/recovery.ts';

function getTodayISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

export function formatDatePTShort(dateStr) {
  if (!dateStr) return '';
  try {
    const d = parseISO(dateStr);
    return format(d, 'd MMM yyyy', { locale: pt });
  } catch {
    return dateStr;
  }
}

// "Semana 6" quando a fase cobre uma só semana (start === end), em vez de
// "Semanas 6-6" — o intervalo só faz sentido a apresentar quando há de
// facto um intervalo.
function weekRangeLabel(start, end) {
  return start === end ? `Semana ${start}` : `Semanas ${start}-${end}`;
}

export function formatDateDayMonth(dateStr) {
  if (!dateStr) return '';
  try {
    const d = parseISO(dateStr);
    // d/MM (ex.: "1/08"), não "d MMM" (ex.: "1 ago") — mais compacto nos
    // intervalos de datas do RaceHubView (contagens, fases do macrociclo).
    return format(d, 'd/MM');
  } catch {
    return dateStr;
  }
}

// ─── Duração Total do Plano em Semanas ──────────────────────────────────────────
export function getRecommendedPrepWeeks(distanceKm, experienceLevel = 'iniciante') {
  const cat = categorizeDistance(distanceKm) || '10k';
  const level = experienceLevel || 'iniciante';
  
  if (MIN_PREP_WEEKS[level] && MIN_PREP_WEEKS[level][cat] !== null && MIN_PREP_WEEKS[level][cat] !== undefined) {
    return MIN_PREP_WEEKS[level][cat];
  }
  
  // Fallbacks seguros por categoria
  switch (cat) {
    case '5k': return 6;
    case '10k': return 8;
    case 'meia': return 12;
    case 'maratona': return 18;
    case 'ultra': return 24;
    default: return 12;
  }
}

// ─── Cálculo dos Dias de Recuperação Pós-Prova (Bloco 2.3 #2) ───────────────────
// Delega em @formulas/recovery.ts (T1) — a tabela completa da doutrina
// (nível×distância, os 4 níveis, não só "avançado" vs. "resto"), decidida
// na Fase C como fonte única, incluindo a resolução do conflito
// avançado+maratona (26 dias, decisão do utilizador). Ver
// specs/formulas-centralizacao.md §4, specs/formulas-checklist.md Fase C.
export function getRecoveryDaysAfterRace(distanceKm, experienceLevel = 'iniciante') {
  return sharedGetRecoveryDaysAfterRace(distanceKm, experienceLevel);
}

// ─── Dias de Polimento / Taper por Prioridade e Distância (Bloco 2.3 #1) ────────
// Delega em @formulas/taper.ts (T1) — a tabela completa da doutrina
// (nível×distância×prioridade), decidida na Fase C como fonte única. Esta
// função aqui já recebia `experienceLevel` mas nunca o usava (era flat por
// distância/prioridade, ignorando o nível por completo) — ver
// specs/formulas-centralizacao.md §5.2, specs/formulas-checklist.md Fase C.
export function getTaperWeeks(distanceKm, racePriority = 'a', experienceLevel = 'iniciante', raceType = 'estrada') {
  return sharedGetTaperWeeks(distanceKm, racePriority, experienceLevel, raceType);
}

// ─── Conversão de Trail (ITRA / Naismith) ──────────────────────────────────────
// Delega em @formulas/racePrediction.ts (T1) — única implementação, sem
// cópias a eliminar (specs/formulas-checklist.md Fase C).
export function calculateEquivalentFlatKm(distanceKm, elevationGainM, raceType) {
  return sharedCalculateEquivalentFlatKm(parseFloat(distanceKm) || 0, elevationGainM, raceType);
}

// Extrai a distância equivalente de um registo de prova (race_events ou
// rascunho do RunAgenda) — wrapper de calculateEquivalentFlatKm que poupa
// cada chamador de repetir o parse de distance_km/elevation_gain_m. É esta
// distância (não a bruta) que alimenta predictRaceTime (Previsão VDOT) e
// getTaperWeeks — Riegel "NÃO se aplica a trail com desnível" e o taper de
// Trail é categoria própria da doutrina (Corrida 2.3 #1/#3/#4). As outras
// contas do macrociclo (semanas de preparação, recuperação, volume mínimo)
// usam a distância em bruto — as tabelas de doutrina não têm categoria de
// trail própria aí, e usar o equivalente criava um "penhasco" de categoria
// por poucos km de D+ convertido.
export function getEffectiveDistanceKm(race) {
  const distanceKm = parseFloat((race?.distance_km ?? '10').toString().replace(',', '.')) || 10;
  const elevationGainM = race?.elevation_gain_m ? parseFloat(race.elevation_gain_m) : null;
  return calculateEquivalentFlatKm(distanceKm, elevationGainM, race?.race_type || 'estrada');
}

// Nível de experiência a usar para esta prova — o autodeclarado na própria
// prova (RunAgenda) tem sempre prioridade sobre o geral do Perfil, porque
// existe precisamente para poder diferir dele (ex.: avançado em estrada,
// iniciante na primeira prova de trail). Único ponto que resolve isto —
// antes cada chamador repetia `race?.experience_level || profile?.experience_level
// || 'iniciante'` à sua maneira, e um deles (RunDashboard) tinha o fallback
// errado ('beginner', inglês, que nunca bate com as chaves reais da
// doutrina) sem ninguém reparar, porque não havia um só sítio a corrigir.
export function resolveExperienceLevel(race, profile) {
  return race?.experience_level || profile?.experience_level || 'iniciante';
}

// ─── Cálculo Completo do Plano & Fases ──────────────────────────────────────────
export function calculateRaceTrainingPlan({ race, profile = {}, runs = [], todayISO = null }) {
  const today = todayISO || getTodayISO();
  const raceDate = race?.date || today;
  const distanceKm = parseFloat((race?.distance_km || '10').toString().replace(',', '.')) || 10;
  const experienceLevel = resolveExperienceLevel(race, profile);
  const racePriority = race?.race_priority || 'a';
  const raceType = race?.race_type || 'estrada';
  const elevationGainM = race?.elevation_gain_m ? parseFloat(race.elevation_gain_m) : null;
  const equivalentKm = calculateEquivalentFlatKm(distanceKm, elevationGainM, raceType);

  // distanceKm em bruto para semanas de preparação e recuperação — as
  // tabelas de doutrina (MIN_PREP_WEEKS, Corrida 2.3 #2) não têm categoria
  // própria de trail, e usar o equivalente ITRA criava um "penhasco": 2km
  // de D+ convertido bastavam para saltar de categoria inteira (10k→meia),
  // duplicando as semanas de preparação por uma diferença de desnível
  // pequena. O taper É a exceção documentada (ver getTaperWeeks acima,
  // "Ultra/Trail" como categoria própria da doutrina); o equivalente
  // continua a valer para a Previsão de tempo/pace (predictRaceTime).
  const totalWeeks = getRecommendedPrepWeeks(distanceKm, experienceLevel);
  const taperWeeks = Math.min(Math.max(1, getTaperWeeks(distanceKm, racePriority, experienceLevel, raceType)), Math.floor(totalWeeks / 3));

  // Datas de referência
  const raceDateObj = new Date(raceDate + 'T00:00:00');
  const todayDateObj = new Date(today + 'T00:00:00');

  const planStartDateObj = new Date(raceDateObj.getTime() - totalWeeks * 7 * 86400000);
  const planStartDate = planStartDateObj.toISOString().slice(0, 10);

  const recoveryDays = getRecoveryDaysAfterRace(distanceKm, experienceLevel);
  const planEndDateObj = new Date(raceDateObj.getTime() + recoveryDays * 86400000);
  const planEndDate = planEndDateObj.toISOString().slice(0, 10);

  const daysToRace = Math.round((raceDateObj.getTime() - todayDateObj.getTime()) / 86400000);
  const daysToStart = Math.round((planStartDateObj.getTime() - todayDateObj.getTime()) / 86400000);

  // Status temporal
  let trainingStatus = 'not_started'; // 'not_started' | 'in_progress' | 'race_day' | 'completed'
  let currentWeek = 0;
  let progressPercentage = 0;

  if (daysToRace < 0) {
    trainingStatus = 'completed';
    progressPercentage = 100;
    currentWeek = totalWeeks;
  } else if (daysToRace === 0) {
    trainingStatus = 'race_day';
    progressPercentage = 100;
    currentWeek = totalWeeks;
  } else if (daysToStart > 0) {
    trainingStatus = 'not_started';
    progressPercentage = 0;
    currentWeek = 0;
  } else {
    trainingStatus = 'in_progress';
    const daysElapsed = Math.abs(daysToStart);
    const totalDays = totalWeeks * 7;
    progressPercentage = Math.max(0, Math.min(100, Math.round((daysElapsed / totalDays) * 100)));
    currentWeek = Math.min(totalWeeks, Math.floor(daysElapsed / 7) + 1);
  }

  // ─── Análise Holística da Carol sobre a Evolução do Treino ───────────────────
  const weeklyVol = recentWeeklyVolume(runs, today);
  const weeksToRace = Math.floor(Math.max(0, daysToRace) / 7);
  // Se o treino já está em curso ou concluído, a viabilidade avalia o ciclo total planeado (totalWeeks),
  // evitando falsos positivos de "tempo insuficiente" a meio da preparação.
  const prepWeeksForViability = (trainingStatus === 'in_progress' || trainingStatus === 'completed') 
    ? totalWeeks 
    : weeksToRace;

  const viability = assessRaceViability({
    // distanceKm em bruto, pela mesma razão do totalWeeks acima — MIN_VOLUME_KM
    // também não tem categoria de trail própria na doutrina.
    distanceKm,
    experienceLevel,
    weeksToRace: prepWeeksForViability,
    weeklyVolumeKm: weeklyVol > 0 ? weeklyVol : null,
    racePriority,
  });

  let readinessLevel = 'green';
  if (viability.flags.includes('ultra_para_iniciante') || viability.flags.includes('tempo_insuficiente')) {
    readinessLevel = 'red';
  } else if (viability.flags.length > 0) {
    readinessLevel = 'yellow';
  }

  // ─── Divisão das 5 Fases do Treino ──────────────────────────────────────────
  // Semanas disponíveis antes do taper
  const preTaperWeeks = Math.max(2, totalWeeks - taperWeeks);
  const baseWeeks = Math.max(1, Math.round(preTaperWeeks * 0.45));
  const peakWeeks = Math.max(1, Math.round(preTaperWeeks * 0.20));
  const buildWeeks = Math.max(1, preTaperWeeks - baseWeeks - peakWeeks);

  // Cálculo dos intervalos de semanas
  const wBaseStart = 1;
  const wBaseEnd = baseWeeks;

  const wBuildStart = wBaseEnd + 1;
  const wBuildEnd = wBaseEnd + buildWeeks;

  const wPeakStart = wBuildEnd + 1;
  const wPeakEnd = wBuildEnd + peakWeeks;

  const wTaperStart = wPeakEnd + 1;
  const wTaperEnd = totalWeeks;

  // Helpers de data para cada fase
  const getPhaseDates = (startWeek, endWeek) => {
    const sDate = new Date(planStartDateObj.getTime() + (startWeek - 1) * 7 * 86400000);
    const eDate = new Date(planStartDateObj.getTime() + (endWeek * 7 - 1) * 86400000);
    return {
      startDate: sDate.toISOString().slice(0, 10),
      endDate: eDate.toISOString().slice(0, 10),
      weeksCount: endWeek - startWeek + 1,
    };
  };

  const baseDates = getPhaseDates(wBaseStart, wBaseEnd);
  const buildDates = getPhaseDates(wBuildStart, wBuildEnd);
  const peakDates = getPhaseDates(wPeakStart, wPeakEnd);
  const taperDates = getPhaseDates(wTaperStart, wTaperEnd);

  // ─── Determinação do Status de Cada Fase ────────────────────────────────────
  const determinePhaseState = (startW, endW, startDateStr, endDateStr) => {
    if (trainingStatus === 'completed') return 'completed';
    if (trainingStatus === 'not_started') return 'upcoming';
    if (today > endDateStr) return 'completed';
    if (today >= startDateStr && today <= endDateStr) return 'active';
    return 'upcoming';
  };

  // ─── Avaliação de Desempenho do Atleta pela Carol por Fase ──────────────────
  const evaluatePhasePerformance = (phaseId, phaseName, startDateStr, endDateStr, phaseState, phaseWeeks) => {
    // Filtrar corridas dentro da janela desta fase
    const phaseRuns = runs.filter(r => r.date && r.date >= startDateStr && r.date <= endDateStr);
    
    // Se não há corridas registadas nesta fase
    if (phaseState === 'upcoming') {
      return {
        score: null,
        stars: 0,
        gradeLabel: 'Planeada',
        statusColor: 'slate',
        summary: 'Aguardar início da fase para cálculo de métricas em tempo real.',
        metrics: { totalKm: 0, runsCount: 0, polarizedZ1Z2Pct: null, avgPace: null },
      };
    }

    const totalKm = phaseRuns.reduce((sum, r) => sum + (parseFloat(r.distance_km) || 0), 0);
    const runsCount = phaseRuns.length;
    
    // Cálculo de polarização (Z1/Z2 vs total)
    let z1z2Count = 0;
    let totalSeconds = 0;
    let totalPacedKm = 0;

    phaseRuns.forEach(r => {
      const isZ1Z2 = r.training_type === 'regenerativo' || 
                     r.training_type === 'facil' || 
                     r.training_type === 'longo' ||
                     (r.rpe && Number(r.rpe) <= 4);
      if (isZ1Z2) z1z2Count++;

      if (r.duration_seconds && r.distance_km) {
        totalSeconds += Number(r.duration_seconds);
        totalPacedKm += Number(r.distance_km);
      }
    });

    const polarizedPct = runsCount > 0 ? Math.round((z1z2Count / runsCount) * 100) : 0;
    const avgPaceSec = totalPacedKm > 0 ? Math.round(totalSeconds / totalPacedKm) : null;

    // Volume semanal alvo da prova baseado na tabela canónica MIN_VOLUME_KM —
    // distanceKm em bruto, pela mesma razão do totalWeeks acima (sem
    // categoria de trail própria nesta tabela).
    const distCategory = categorizeDistance(distanceKm) || '10k';
    const targetWeeklyKm = MIN_VOLUME_KM[experienceLevel]?.[distCategory] || 20;
    const expectedPhaseKm = targetWeeklyKm * Math.max(1, phaseWeeks);
    const volumeRatio = Math.min(1.0, totalKm / expectedPhaseKm);

    if (runsCount === 0) {
      return {
        score: 40,
        stars: 1,
        gradeLabel: 'Sem Registos',
        statusColor: 'rose',
        summary: `Sem treinos registados nesta fase. Mantém a consistência de pelo menos 3 sessões semanais para garantir a adaptação.`,
        metrics: { totalKm: 0, runsCount: 0, polarizedZ1Z2Pct: 0, avgPace: null },
      };
    }

    // Cálculo proporcional rigoroso (Volume: 50%, Polarização: 30%, Consistência/Frequência: 20%)
    const expectedRunsCount = Math.max(1, phaseWeeks * 3);
    const frequencyRatio = Math.min(1.0, runsCount / expectedRunsCount);
    const polFactor = polarizedPct >= 75 ? 1.0 : Math.max(0.4, polarizedPct / 75);

    let rawScore = (volumeRatio * 50) + (polFactor * 30) + (frequencyRatio * 20);

    // Ajuste de realismo: se o ciclo global tem tempo insuficiente, a fase reflete a compressão
    if (viability.flags.includes('tempo_insuficiente')) {
      rawScore = rawScore * 0.85;
    }
    if (viability.flags.includes('volume_insuficiente') && volumeRatio < 0.7) {
      rawScore = rawScore * 0.9;
    }

    const score = Math.min(98, Math.max(35, Math.round(rawScore)));

    let stars = 2;
    let gradeLabel = 'Abaixo do Alvo';
    let statusColor = 'rose';

    if (score >= 90) {
      stars = 5;
      gradeLabel = 'Excelente';
      statusColor = 'emerald';
    } else if (score >= 80) {
      stars = 4;
      gradeLabel = 'Muito Bom';
      statusColor = 'emerald';
    } else if (score >= 68) {
      stars = 3;
      gradeLabel = 'Sólido';
      statusColor = 'amber';
    } else {
      stars = 2;
      gradeLabel = 'Ajuste Recomendado';
      statusColor = 'rose';
    }

    let commentary = '';
    switch (phaseId) {
      case 'base':
        commentary = volumeRatio < 0.6
          ? `Volume realizado (${Math.round(totalKm)} km) abaixo do alvo da fase (${Math.round(expectedPhaseKm)} km). Prioriza aumentar a quilometragem fácil em Z1/Z2.`
          : `Base aeróbica com ${runsCount} corridas (${Math.round(totalKm)} km de ${Math.round(expectedPhaseKm)} km alvo). ${polarizedPct >= 75 ? 'Excelente disciplina nas zonas de baixa intensidade (Z1/Z2).' : 'Atenção: reduz o ritmo nos treinos fáceis para proteger a base aeróbica.'}`;
        break;
      case 'build':
        commentary = volumeRatio < 0.6
          ? `Volume de construção (${Math.round(totalKm)} km) abaixo do previsto para suportar o ritmo de prova. Reforça treinos de limiar e rodagem contínua.`
          : `Fase de construção em bom ritmo (${runsCount} sessões, ${Math.round(totalKm)} km). Foco na tolerância ao limiar e manutenção da progressão semanal.`;
        break;
      case 'peak':
        commentary = `Pico de carga com simulação de ritmo de prova (${Math.round(totalKm)} km). Volume específico atingido com treinos longos chave concluídos.`;
        break;
      case 'taper':
        commentary = `Polimento pré-prova. Redução controlada de volume para recarga total de glicogénio sem perda de sensações de ritmo.`;
        break;
      default:
        commentary = `Execução consistente e registo regular de esforço.`;
    }

    return {
      score,
      stars,
      gradeLabel,
      statusColor,
      summary: commentary,
      metrics: {
        totalKm: Math.round(totalKm * 10) / 10,
        runsCount,
        polarizedZ1Z2Pct: polarizedPct,
        avgPace: avgPaceSec ? formatPace(avgPaceSec) : null,
      },
    };
  };

  // ─── Construção dos Objetos das 5 Fases ──────────────────────────────────────
  const phases = [
    {
      id: 'base',
      number: 1,
      name: 'Base Aeróbica',
      subtitle: 'Adaptação Cardiovascular & Fortalecimento',
      weeksLabel: weekRangeLabel(wBaseStart, wBaseEnd),
      weeksCount: baseDates.weeksCount,
      startDate: baseDates.startDate,
      endDate: baseDates.endDate,
      state: determinePhaseState(wBaseStart, wBaseEnd, baseDates.startDate, baseDates.endDate),
      focus: 'Volume predominante em Z1/Z2 (≥80% polarizado), reforço muscular e adaptação tendinosa.',
      evaluation: evaluatePhasePerformance('base', 'Base Aeróbica', baseDates.startDate, baseDates.endDate, determinePhaseState(wBaseStart, wBaseEnd, baseDates.startDate, baseDates.endDate), baseDates.weeksCount),
    },
    {
      id: 'build',
      number: 2,
      name: 'Construção Específica',
      subtitle: 'Limiar Anaeróbico & Ritmo-Alvo',
      weeksLabel: weekRangeLabel(wBuildStart, wBuildEnd),
      weeksCount: buildDates.weeksCount,
      startDate: buildDates.startDate,
      endDate: buildDates.endDate,
      state: determinePhaseState(wBuildStart, wBuildEnd, buildDates.startDate, buildDates.endDate),
      focus: 'Sessões de limiar (Z3/Z4), intervalos de ritmo de prova e treinos com desnível/subidas.',
      evaluation: evaluatePhasePerformance('build', 'Construção Específica', buildDates.startDate, buildDates.endDate, determinePhaseState(wBuildStart, wBuildEnd, buildDates.startDate, buildDates.endDate), buildDates.weeksCount),
    },
    {
      id: 'peak',
      number: 3,
      name: 'Pico de Carga',
      subtitle: 'Treinos Longos Chave & Simulação',
      weeksLabel: weekRangeLabel(wPeakStart, wPeakEnd),
      weeksCount: peakDates.weeksCount,
      startDate: peakDates.startDate,
      endDate: peakDates.endDate,
      state: determinePhaseState(wPeakStart, wPeakEnd, peakDates.startDate, peakDates.endDate),
      focus: 'Treino longo mais longo do ciclo, testes de nutrição/hidratação em prova e volume máximo.',
      evaluation: evaluatePhasePerformance('peak', 'Pico de Carga', peakDates.startDate, peakDates.endDate, determinePhaseState(wPeakStart, wPeakEnd, peakDates.startDate, peakDates.endDate), peakDates.weeksCount),
    },
    {
      id: 'taper',
      number: 4,
      name: 'Polimento (Taper)',
      subtitle: `Redução de Carga & Recarga Glicogénica (${racePriority === 'a' ? 'A-Race' : 'B/C-Race'})`,
      weeksLabel: weekRangeLabel(wTaperStart, wTaperEnd),
      weeksCount: taperDates.weeksCount,
      startDate: taperDates.startDate,
      endDate: taperDates.endDate,
      state: determinePhaseState(wTaperStart, wTaperEnd, taperDates.startDate, taperDates.endDate),
      focus: racePriority === 'a'
        ? `Taper progressivo de ${taperWeeks} semana(s) (-30% a -50% de volume mantendo a intensidade-alvo).`
        : 'Taper curto de 2-4 dias com corte de 20-30% para prova secundária.',
      evaluation: evaluatePhasePerformance('taper', 'Polimento (Taper)', taperDates.startDate, taperDates.endDate, determinePhaseState(wTaperStart, wTaperEnd, taperDates.startDate, taperDates.endDate), taperDates.weeksCount),
    },
    {
      id: 'race_recovery',
      number: 5,
      name: 'Prova & Recuperação',
      subtitle: `Competição & Regeneração Pós-Esforço (${recoveryDays} dias)`,
      weeksLabel: `Semana ${totalWeeks} + ${recoveryDays}d`,
      weeksCount: 1,
      startDate: raceDate,
      endDate: planEndDate,
      state: daysToRace <= 0 ? 'active' : 'upcoming',
      focus: `Competição a 100% seguida de ${recoveryDays} dias sem treinos de alta intensidade (Z4/Z5).`,
      evaluation: {
        score: daysToRace <= 0 ? 95 : null,
        stars: daysToRace <= 0 ? 5 : 0,
        gradeLabel: daysToRace <= 0 ? 'Concluída' : 'Objetivo Final',
        statusColor: 'emerald',
        summary: daysToRace <= 0 
          ? `Prova terminada! Respeita os ${recoveryDays} dias de regeneração fisiológica ativa (só Z1/caminhadas).` 
          : `O grande dia! Estratégia de nutrição: 30-60g carbo/h se prova > 75 minutos.`,
        metrics: { totalKm: distanceKm, runsCount: daysToRace <= 0 ? 1 : 0, polarizedZ1Z2Pct: 100, avgPace: null },
      },
    },
  ];

  // Fase atualmente ativa
  const currentPhase = phases.find(p => p.state === 'active') || 
                       (trainingStatus === 'completed' ? phases[phases.length - 1] : phases[0]);

  // Gera parecer dinâmico da Carol
  let carolOverviewText = '';
  if (daysToRace < 0) {
    carolOverviewText = `Esta prova já foi realizada. Excelente dedicação ao longo do ciclo de ${totalWeeks} semanas. Mantém a recuperação ativa nos próximos ${recoveryDays} dias antes de iniciar um novo ciclo de preparação.`;
  } else if (daysToStart > 0) {
    carolOverviewText = `Faltam ${daysToStart} dias para o início oficial do macrociclo de ${totalWeeks} semanas. Nesta fase prévia, mantém uma rotina regular de corrida fácil (Z1/Z2) e trabalho de força no ginásio para entrar na Fase de Base com boa tolerância muscular.`;
  } else if (daysToRace <= 7) {
    carolOverviewText = `Estamos na semana decisiva da prova (${daysToRace} dias restantes)! O trabalho duro está feito. Prioriza sono reparador, hidratação constante (1.5-2L/dia) e recarga equilibrada de hidratos de carbono. Mantém apenas 1 ou 2 corridas curtas com algumas acelerações para ativação neuromuscular.`;
  } else {
    carolOverviewText = `Encontras-te na ${currentPhase.name} (Semana ${currentWeek} de ${totalWeeks}). O teu volume médio recente é de ${weeklyVol} km/semana. Continua a proteger o rácio 80/20 polarizado e respeita a semana de descarga a cada 3-4 semanas para garantir que a tua fadiga aguda (ACWR) se mantém em faixa segura.`;
  }

  return {
    raceDate,
    planStartDate,
    planEndDate,
    totalWeeks,
    taperWeeks,
    recoveryDays,
    daysToRace,
    daysToStart,
    currentWeek,
    progressPercentage,
    trainingStatus,
    equivalentKm,
    currentPhase,
    phases,
    viability,
    readinessLevel,
    carolAnalysis: {
      readinessLevel,
      readinessLabel: readinessLevel === 'green' ? 'Preparação Adequada' : readinessLevel === 'yellow' ? 'Atenção / Alertas de Carga' : 'Inadequada / Risco Elevado',
      overviewText: carolOverviewText,
      weeklyVolumeKm: weeklyVol,
      targetTime: race?.target_time || null,
      targetPace: race?.target_pace_seconds_per_km ? formatPace(race.target_pace_seconds_per_km) : (race?.target_pace || null),
    },
  };
}
