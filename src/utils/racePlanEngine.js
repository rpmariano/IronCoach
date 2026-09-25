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

import { assessRaceViability, knownRecentWeeklyVolume } from './raceViability';
import { formatPace } from './run';
import { format, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';
import { getTaperWeeks as sharedGetTaperWeeks } from '@formulas/taper.ts';
import { calculateEquivalentFlatKm as sharedCalculateEquivalentFlatKm } from '@formulas/racePrediction.ts';
import { getRecoveryDaysAfterRace as sharedGetRecoveryDaysAfterRace } from '@formulas/recovery.ts';
import { getRecommendedPrepWeeks as sharedGetRecommendedPrepWeeks, getEffectiveDistanceKm as sharedGetEffectiveDistanceKm, resolveExperienceLevel as sharedResolveExperienceLevel, computeEffectivePrepStart } from '@formulas/racePlanning.ts';
import { computePhaseEvaluation } from '@formulas/racePhaseEvaluation.ts';
import { computePhaseWindows, resolvePhaseState } from '@formulas/racePhases.ts';
import { phaseGuidance } from './phaseGuidance';

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
// Delega em @formulas/racePlanning.ts (T1.5) — única implementação,
// partilhada com a Carol (specs/formulas-checklist.md Fase E).
export function getRecommendedPrepWeeks(distanceKm, experienceLevel = 'iniciante') {
  return sharedGetRecommendedPrepWeeks(distanceKm, experienceLevel);
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
// Delega em @formulas/racePlanning.ts (T1.5) — única implementação,
// partilhada com a Carol (specs/formulas-checklist.md Fase E).
export function getEffectiveDistanceKm(race) {
  return sharedGetEffectiveDistanceKm(race);
}

// Nível de experiência a usar para esta prova — o autodeclarado na própria
// prova (RunAgenda) tem sempre prioridade sobre o geral do Perfil, porque
// existe precisamente para poder diferir dele (ex.: avançado em estrada,
// iniciante na primeira prova de trail). Único ponto que resolve isto —
// antes cada chamador repetia `race?.experience_level || profile?.experience_level
// || 'iniciante'` à sua maneira, e um deles (RunDashboard) tinha o fallback
// errado ('beginner', inglês, que nunca bate com as chaves reais da
// doutrina) sem ninguém reparar, porque não havia um só sítio a corrigir.
// Delega em @formulas/racePlanning.ts (T1.5) — única implementação,
// partilhada com a Carol (specs/formulas-checklist.md Fase E).
export function resolveExperienceLevel(race, profile) {
  return sharedResolveExperienceLevel(race, profile);
}

// ─── Início Real da Preparação (Macrociclo Comprimido) ──────────────────────
// Delega em @formulas/racePlanning.ts (T1.5) — única implementação,
// partilhada com a Carol. Ver o comentário completo junto a
// `effectiveStartDate` dentro de `calculateRaceTrainingPlan`, abaixo.
export function computeEffectivePrepStartDate(raceDateISO, totalWeeks, raceCreatedAtISO) {
  return computeEffectivePrepStart(raceDateISO, totalWeeks, raceCreatedAtISO);
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

  // Datas de referência — 'Z' força interpretação UTC. Sem isto,
  // "T00:00:00" é meia-noite LOCAL, e toISOString() (sempre UTC) do
  // planStartDate/planEndDate mais abaixo desliza um dia para trás em
  // qualquer fuso horário à frente de UTC (ex: Lisboa em horário de
  // verão) — mesma classe de bug que addDaysISO() já evita em
  // src/lib/utils.js.
  const raceDateObj = new Date(raceDate + 'T00:00:00Z');
  const todayDateObj = new Date(today + 'T00:00:00Z');

  const planStartDateObj = new Date(raceDateObj.getTime() - totalWeeks * 7 * 86400000);
  const planStartDate = planStartDateObj.toISOString().slice(0, 10);

  const recoveryDays = getRecoveryDaysAfterRace(distanceKm, experienceLevel);
  const planEndDateObj = new Date(raceDateObj.getTime() + recoveryDays * 86400000);
  const planEndDate = planEndDateObj.toISOString().slice(0, 10);

  const daysToRace = Math.round((raceDateObj.getTime() - todayDateObj.getTime()) / 86400000);

  // ─── Início real da preparação (macrociclo comprimido) ──────────────────
  // `planStartDate` é só o início IDEAL, contado para trás a partir da
  // prova — não sabe quando a prova foi de facto registada. Se o atleta só
  // criou a prova depois desse dia, a preparação nunca pôde começar nele:
  // usá-lo às cegas para "onde estamos agora" fabricava fases marcadas
  // "concluídas" sem uma única corrida, e escondia o alerta de tempo
  // insuficiente (bug relatado 2026-08-29, com uma prova a 17 dias
  // registada no próprio dia). `effectiveStartDate` é o mais tardio dos
  // dois — o ideal, ou o dia em que a prova passou a existir para o atleta.
  const { effectiveStartISO: effectiveStartDate, isCompressed, effectiveWeeksAvailable } =
    computeEffectivePrepStart(raceDate, totalWeeks, race?.created_at || null);
  const effectiveStartDateObj = new Date(effectiveStartDate + 'T00:00:00Z');
  const daysToStart = Math.round((effectiveStartDateObj.getTime() - todayDateObj.getTime()) / 86400000);

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
    // Dias realmente disponíveis desde o início efetivo até à prova — igual
    // a totalWeeks×7 quando não há compressão (effectiveStartDate ===
    // planStartDate), por construção (planStartDate = raceDate −
    // totalWeeks×7). Só diverge — e só para menos — quando comprimido.
    const totalDaysAvailable = Math.max(1, Math.round((raceDateObj.getTime() - effectiveStartDateObj.getTime()) / 86400000));
    progressPercentage = Math.max(0, Math.min(100, Math.round((daysElapsed / totalDaysAvailable) * 100)));

    // `currentWeek` NÃO conta a partir do início efetivo (comprimido) — conta
    // a partir do `planStartDate` ideal, o mesmo eixo de calendário que
    // `computePhaseWindows` usa para desenhar as fases (base/build/peak/
    // taper) e o trilho/track do Início e do Hub. Antes usava
    // `daysElapsed`/`effectiveStartDate` como o `progressPercentage` acima —
    // certo para "quanto da preparação REAL já foi treinado" (é para isso
    // que o `progressPercentage` serve, doutrina do bug 2026-08-29), mas
    // errado aqui: com uma prova comprimida (registada tarde), dava uma
    // "semana X de Y" e uma posição no trilho muito atrasadas face à fase
    // realmente ativa (`currentPhase`, sempre calculada pelo calendário
    // ideal) — ex. título "Polimento (Taper)" a 2 dias da prova com o
    // trilho a marcar "semana 2 de 6" ainda na Base (bug relatado
    // 2026-09-11, prova "Corrida do Tejo"). `currentWeek` não fabrica
    // treino nenhum — isso continua a cargo de `resolvePhaseState`
    // (`effectiveStartISO` marca "skipped" o que for anterior ao início
    // real), este é só o número mostrado.
    const daysSincePlanStart = Math.max(0, Math.round((todayDateObj.getTime() - planStartDateObj.getTime()) / 86400000));
    currentWeek = Math.max(1, Math.min(totalWeeks, Math.floor(daysSincePlanStart / 7) + 1));
  }

  // ─── Análise Holística da Carol sobre a Evolução do Treino ───────────────────
  const weeklyVol = knownRecentWeeklyVolume(runs, today);
  const weeksToRace = Math.floor(Math.max(0, daysToRace) / 7);
  // Se o treino já está em curso ou concluído, a viabilidade avalia as
  // semanas REALMENTE disponíveis a partir do início efetivo
  // (effectiveWeeksAvailable), não o ciclo total planeado às cegas —
  // evita falsos positivos de "tempo insuficiente" a meio de uma
  // preparação em curso (P0-7), sem voltar a escondê-lo quando a prova foi
  // registada tarde demais para caber o macrociclo recomendado.
  const prepWeeksForViability = (trainingStatus === 'in_progress' || trainingStatus === 'completed')
    ? effectiveWeeksAvailable
    : weeksToRace;

  const viability = assessRaceViability({
    // distanceKm em bruto, pela mesma razão do totalWeeks acima — MIN_VOLUME_KM
    // também não tem categoria de trail própria na doutrina.
    distanceKm,
    experienceLevel,
    weeksToRace: prepWeeksForViability,
    weeklyVolumeKm: weeklyVol,
    racePriority,
  });

  let readinessLevel = 'green';
  if (viability.flags.includes('ultra_para_iniciante') || viability.flags.includes('tempo_insuficiente')) {
    readinessLevel = 'red';
  } else if (viability.flags.length > 0) {
    readinessLevel = 'yellow';
  }

  // ─── Divisão das 5 Fases do Treino ──────────────────────────────────────────
  // Delega em @formulas/racePhases.ts (T1.5) — única implementação,
  // partilhada com a Carol (specs/formulas-checklist.md Fase F). O clamp do
  // taper a 1/3 do macrociclo passou para dentro desse módulo; mantém-se
  // aqui o `taperWeeks` já clampado por compatibilidade com o resto desta
  // função (é usado no texto do `focus` da fase de taper).
  const phaseWindows = computePhaseWindows(totalWeeks, taperWeeks, planStartDate);
  const windowById = Object.fromEntries(phaseWindows.map(w => [w.id, w]));
  const baseDates = windowById.base;
  const buildDates = windowById.build;
  const peakDates = windowById.peak;
  const taperDates = windowById.taper;

  const wBaseStart = baseDates.startWeek;
  const wBaseEnd = baseDates.endWeek;
  const wBuildStart = buildDates.startWeek;
  const wBuildEnd = buildDates.endWeek;
  const wPeakStart = peakDates.startWeek;
  const wPeakEnd = peakDates.endWeek;
  const wTaperStart = taperDates.startWeek;
  const wTaperEnd = taperDates.endWeek;

  // ─── Determinação do Status de Cada Fase ────────────────────────────────────
  // Delega em @formulas/racePhases.ts (T1.5). O original recebia
  // `(startW, endW, startDateStr, endDateStr)` mas nunca usava os dois
  // primeiros — deixaram de existir. `effectiveStartDate` marca "skipped"
  // qualquer janela inteiramente anterior ao início real da preparação
  // (ver comentário em `effectiveStartDate`, acima).
  const determinePhaseState = (startDateStr, endDateStr) =>
    resolvePhaseState(trainingStatus, today, startDateStr, endDateStr, effectiveStartDate);

  // ─── Avaliação de Desempenho do Atleta pela Carol por Fase ──────────────────
  // Delega em @formulas/racePhaseEvaluation.ts (T1.5) — única implementação,
  // partilhada com a Carol (specs/formulas-checklist.md Fase F). Era uma
  // closure a capturar runs/distanceKm/experienceLevel/viability do escopo
  // exterior, o que a tornava impossível de partilhar; essas quatro passam
  // agora como parâmetros explícitos. O 2.º argumento do original
  // (`phaseName`) era passado nas 4 chamadas mas nunca usado lá dentro —
  // deixou de existir.
  const evaluatePhasePerformance = (phaseId, startDateStr, endDateStr, phaseState, phaseWeeks) =>
    computePhaseEvaluation({
      phaseId,
      startDateStr,
      endDateStr,
      phaseState,
      phaseWeeks,
      runs,
      distanceKm,
      experienceLevel,
      viabilityFlags: viability.flags,
      // Numa fase a decorrer, conta só o que já passou dela.
      todayISO: today,
    });

  // ─── Construção dos Objetos das 5 Fases ──────────────────────────────────────
  const phases = [
    {
      id: 'base',
      // "Estás na Base Aeróbica" — o artigo da fase, para o parecer.
      em: 'na',
      number: 1,
      name: 'Base Aeróbica',
      subtitle: 'Adaptação Cardiovascular & Fortalecimento',
      weeksLabel: weekRangeLabel(wBaseStart, wBaseEnd),
      weeksCount: baseDates.weeksCount,
      startDate: baseDates.startDate,
      endDate: baseDates.endDate,
      state: determinePhaseState(baseDates.startDate, baseDates.endDate),
      focus: 'Volume predominante em Z1/Z2 (≥80% polarizado), reforço muscular e adaptação tendinosa.',
      evaluation: evaluatePhasePerformance('base', baseDates.startDate, baseDates.endDate, determinePhaseState(baseDates.startDate, baseDates.endDate), baseDates.weeksCount),
    },
    {
      id: 'build',
      em: 'na',
      number: 2,
      name: 'Construção Específica',
      subtitle: 'Limiar Anaeróbico & Ritmo-Alvo',
      weeksLabel: weekRangeLabel(wBuildStart, wBuildEnd),
      weeksCount: buildDates.weeksCount,
      startDate: buildDates.startDate,
      endDate: buildDates.endDate,
      state: determinePhaseState(buildDates.startDate, buildDates.endDate),
      focus: 'Sessões de limiar (Z3/Z4), intervalos de ritmo de prova e treinos com desnível/subidas.',
      evaluation: evaluatePhasePerformance('build', buildDates.startDate, buildDates.endDate, determinePhaseState(buildDates.startDate, buildDates.endDate), buildDates.weeksCount),
    },
    {
      id: 'peak',
      em: 'no',
      number: 3,
      name: 'Pico de Carga',
      subtitle: 'Treinos Longos Chave & Simulação',
      weeksLabel: weekRangeLabel(wPeakStart, wPeakEnd),
      weeksCount: peakDates.weeksCount,
      startDate: peakDates.startDate,
      endDate: peakDates.endDate,
      state: determinePhaseState(peakDates.startDate, peakDates.endDate),
      focus: 'Treino longo mais longo do ciclo, testes de nutrição/hidratação em prova e volume máximo.',
      evaluation: evaluatePhasePerformance('peak', peakDates.startDate, peakDates.endDate, determinePhaseState(peakDates.startDate, peakDates.endDate), peakDates.weeksCount),
    },
    {
      id: 'taper',
      em: 'no',
      number: 4,
      name: 'Polimento (Taper)',
      subtitle: `Redução de Carga & Recarga Glicogénica (${racePriority === 'a' ? 'A-Race' : 'B/C-Race'})`,
      weeksLabel: weekRangeLabel(wTaperStart, wTaperEnd),
      weeksCount: taperDates.weeksCount,
      startDate: taperDates.startDate,
      endDate: taperDates.endDate,
      state: determinePhaseState(taperDates.startDate, taperDates.endDate),
      focus: racePriority === 'a'
        ? `Taper progressivo de ${taperWeeks} semana(s) (-30% a -50% de volume mantendo a intensidade-alvo).`
        : 'Taper curto de 2-4 dias com corte de 20-30% para prova secundária.',
      evaluation: evaluatePhasePerformance('taper', taperDates.startDate, taperDates.endDate, determinePhaseState(taperDates.startDate, taperDates.endDate), taperDates.weeksCount),
    },
    {
      id: 'race_recovery',
      em: 'na',
      number: 5,
      name: 'Prova & Recuperação',
      subtitle: `Competição & Regeneração Pós-Esforço (${recoveryDays} dias)`,
      weeksLabel: `Semana ${totalWeeks} + ${recoveryDays}d`,
      weeksCount: 1,
      startDate: raceDate,
      endDate: planEndDate,
      // Depois dos dias de recuperação, a fase acabou.
      state: daysToRace < 0 && -daysToRace >= recoveryDays ? 'completed' : daysToRace <= 0 ? 'active' : 'upcoming',
      focus: `Competição a 100% seguida de ${recoveryDays} dias sem treinos de alta intensidade (Z4/Z5).`,
      evaluation: {
        /* Na manhã da prova ainda não há nota: "Concluída · 95%" saía ao
           lado de "É dia de prova" (terceira revisão, 2026-09-25). Sem
           nota, a pílula não aparece. */
        score: daysToRace < 0 ? 95 : null,
        stars: daysToRace < 0 ? 5 : 0,
        gradeLabel: daysToRace < 0 ? 'Concluída' : daysToRace === 0 ? 'Dia da Prova' : 'Objetivo Final',
        statusColor: 'emerald',
        /* Antes, durante e depois da prova — "É dia de prova" saía a 40 dias
           dela, e "A prova já foi" na própria manhã (segunda revisão
           pré-deploy de 2026-09-25). */
        summary: daysToRace < 0
          ? (-daysToRace < recoveryDays
            ? `A prova já foi. Até ${recoveryDays} dias depois dela, recuperação ativa: só corrida muito leve ou caminhadas.`
            : `A prova já foi, e os ${recoveryDays} dias de recuperação também.`)
          : daysToRace === 0
            ? `É dia de prova. Se passares dos 75 minutos, 30 a 60 g de hidratos por hora.`
            : `No dia da prova, se passares dos 75 minutos, 30 a 60 g de hidratos por hora. Depois, ${recoveryDays} dias de recuperação ativa.`,
        metrics: { totalKm: distanceKm, runsCount: daysToRace < 0 ? 1 : 0, polarizedZ1Z2Pct: 100, avgPace: null },
      },
    },
  ];

  // Fase atualmente ativa
  const currentPhase = phases.find(p => p.state === 'active') || 
                       (trainingStatus === 'completed' ? phases[phases.length - 1] : phases[0]);

  /* O parecer da prova, sob o avatar dela no hub e no cartão da prova: fala
     como ela (ação P.12, acabada na revisão pré-deploy de 2026-09-25). Sem
     elogio automático — "Excelente dedicação" saía em qualquer prova
     concluída —, sem afirmar o que não se verifica ("o trabalho duro está
     feito", mesmo sem um treino registado), sem frase de manual ("sono
     reparador, a hidratação") e sem falar de si na terceira pessoa. */
  let carolOverviewText = '';
  const faltam = (n) => (n === 1 ? 'Falta 1 dia' : `Faltam ${n} dias`);
  const naFase = `${currentPhase.em || 'na'} ${currentPhase.name}`;
  if (daysToRace < 0) {
    // Semanas depois, a recuperação já passou: não se repete "agora são N dias".
    carolOverviewText = -daysToRace < recoveryDays
      ? `A prova já foi. Até ${recoveryDays} dias depois dela, recuperação ativa: só corrida muito leve ou caminhadas. Depois, começamos outro ciclo.`
      : `A prova já foi, e a recuperação também. Quando quiseres, preparamos a próxima.`;
  } else if (daysToStart > 0) {
    carolOverviewText = `${faltam(daysToStart)} para começarmos o ciclo de ${totalWeeks} semanas. Até lá, corrida fácil (Z1/Z2) com regularidade e força no ginásio: quero-te a entrar na base com as pernas preparadas.`;
  } else if (daysToRace === 0) {
    // Sem adjetivos com género ("controlado"), e sem prometer um plano de
    // ritmos que só existe com objetivo ou previsão.
    carolOverviewText = `A prova é hoje. Parte com calma: a primeira metade é para guardar.`;
  } else if (daysToRace <= 7) {
    carolOverviewText = `${faltam(daysToRace)}: esta semana já não se ganha forma, só se perde se exagerares. Uma ou duas corridas curtas com umas acelerações; o resto é descansar e comer hidratos com regularidade.`;
  } else if (currentPhase.evaluation?.metrics?.runsCount > 0) {
    /* Onde está e o que a fase pede a ESTE atleta (utils/phaseGuidance.js:
       o nível, a distância, o volume dele, o ritmo-alvo, a prioridade e o
       D+, com os números da doutrina). Como está a correr — as fáceis, o
       volume da fase — di-lo o cartão da fase, logo abaixo, e o parecer
       não o repete (terceira revisão, 2026-09-25). */
    const guia = phaseGuidance({
      phaseId: currentPhase.id,
      experienceLevel,
      distanceKm,
      raceType,
      elevationGainM,
      racePriority,
      weeklyVolumeKm: weeklyVol,
      targetPaceSeconds: race?.target_pace_seconds_per_km ?? null,
      daysToRace,
    });
    carolOverviewText = `Estás ${naFase}, semana ${currentWeek} de ${totalWeeks}.${guia ? ` ${guia}` : ''}`;
  } else {
    // Sem uma única corrida registada nesta fase, "continua a proteger o
    // rácio 80/20"/"respeita a semana de descarga" presumem um histórico
    // que não existe — ela não pode avaliar (nem recomendar manter) algo
    // que nunca começou a medir. Ver bug relatado 2026-08-30.
    carolOverviewText = `Estás ${naFase}, semana ${currentWeek} de ${totalWeeks}, e ainda não tenho nenhuma corrida tua registada nesta fase${isCompressed ? ' — o ciclo ficou comprimido, porque a prova entrou com menos tempo do que o ciclo completo pede' : ''}. Regista os treinos, para eu poder acompanhar como estás a evoluir.`;
  }

  return {
    raceDate,
    planStartDate,
    planEndDate,
    // Início REAL da preparação e se o macrociclo teve de ser comprimido
    // (prova registada depois do início ideal) — ver comentário acima de
    // `effectiveStartDate`. `daysToStart`/`progressPercentage` já refletem
    // isto (a compressão reduz o tempo realmente disponível); `currentWeek`
    // NÃO — conta sempre pelo calendário ideal (ver comentário junto ao seu
    // cálculo, acima), para se manter alinhado com `currentPhase` e com o
    // trilho/track. Estes campos ficam disponíveis para quem precisar de
    // explicar a compressão em vez de só sofrer o efeito dela.
    effectiveStartDate,
    isCompressed,
    effectiveWeeksAvailable,
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
