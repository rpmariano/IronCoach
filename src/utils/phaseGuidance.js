/* O que cada fase pede a ESTE atleta — o parecer da prova (racePlanEngine.js)
   diz onde ele está e, logo a seguir, isto. Era uma frase igual para todos
   ("A base é para aguentares volume sem te cansares…"); passa a usar o
   nível, a distância e o tipo da prova, o volume semanal que a app lhe
   conhece, o ritmo-alvo, a prioridade e o D+ (pedido de 2026-09-25).

   Como está a correr a fase — as fáceis, o volume da fase — di-lo o cartão
   da fase, logo abaixo (racePhaseEvaluation.ts): isto não o repete.

   Os números são os da doutrina, nunca inventados:
   - base: o volume semanal mínimo para a distância e o nível (MIN_VOLUME_KM,
     Bloco 1) e a progressão semanal (Corrida 2.1 #1);
   - construção: quando entra cada tipo de treino, por nível (Corrida 2.2 #2);
   - pico: a percentagem e o teto do treino longo (Corrida 2.1 #4, longRun.ts);
   - polimento: os dias, por nível, distância e prioridade (Corrida 2.3 #1). */

import { MIN_VOLUME_KM, categorizeDistance } from '@formulas/vocabulary.ts';
import { getTaperDays } from '@formulas/taper.ts';
import { longRunGuide } from '@formulas/longRun.ts';
import { formatHoursMinutes, formatPace } from './run';

const LEVELS = ['iniciante', 'basico', 'medio', 'avancado'];
const num = (n) => n.toLocaleString('pt-PT', { maximumFractionDigits: 1 });

const RACE_LABEL = { '5k': 'os 5 km', '10k': 'os 10 km', meia: 'a meia', maratona: 'a maratona', ultra: 'o ultra' };

/** "a meia", "os 10 km", "o trail" — a prova, para a frase. */
export function raceLabel(distanceKm, raceType) {
  if (raceType === 'trail') return 'o trail';
  return RACE_LABEL[categorizeDistance(distanceKm)] ?? 'a prova';
}

// Corrida 2.2 #2: quando entra cada tipo de treino de qualidade.
const QUALITY_BY_LEVEL = {
  iniciante: 'Nesta fase ainda não há limiar nem intervalos: subidas curtas e fartlek suave chegam, e o longo cresce devagar.',
  basico: 'Nesta fase entram as subidas, o fartlek e o limiar; os intervalos ficam para quando tiveres seis a oito semanas de base.',
  medio: 'Nesta fase entram o limiar e as subidas, e na parte final os intervalos.',
  avancado: 'Nesta fase entra tudo: limiar, intervalos e blocos a ritmo de prova.',
};

/**
 * A frase da fase para o atleta, ou null numa fase sem texto próprio.
 * @param {object} o
 * @param {'base'|'build'|'peak'|'taper'|string} o.phaseId
 * @param {string} o.experienceLevel
 * @param {number} o.distanceKm
 * @param {string} [o.raceType]        'estrada' | 'trail'
 * @param {number|null} [o.elevationGainM]
 * @param {string} [o.racePriority]    'a' | 'b' | 'c'
 * @param {number|null} [o.weeklyVolumeKm]  o volume que a app lhe conhece (null sem histórico)
 * @param {number|null} [o.targetPaceSeconds]
 * @param {number|null} [o.daysToRace]  para o polimento: quantos dias faltam
 */
export function phaseGuidance(o) {
  const level = LEVELS.includes(o.experienceLevel) ? o.experienceLevel : 'iniciante';
  const prova = raceLabel(o.distanceKm, o.raceType);
  const cat = categorizeDistance(o.distanceKm) ?? '10k';
  const vol = typeof o.weeklyVolumeKm === 'number' && o.weeklyVolumeKm > 0 ? o.weeklyVolumeKm : null;
  const dMais = o.raceType === 'trail' && Number(o.elevationGainM) > 0 ? Math.round(Number(o.elevationGainM)) : null;

  // O Bloco 1 desaconselha o ultra ao iniciante: os números da doutrina
  // nunca servem para o habilitar, e o hub já mostra o alerta.
  if (level === 'iniciante' && cat === 'ultra') {
    return 'Um ultra é desaconselhado no teu nível, por isso não o preparo contigo assim. Fala comigo sobre uma distância mais curta para já.';
  }

  switch (o.phaseId) {
    case 'base': {
      const alvo = MIN_VOLUME_KM[level]?.[cat];
      // Corrida 2.1 #1: o iniciante sobe mais devagar.
      const sobe = level === 'iniciante' ? 'no máximo 2 a 3 km por semana' : 'no máximo 10% por semana';
      let t;
      if (alvo == null) t = 'Na base, quase tudo em ritmo fácil, a conversar.';
      else if (vol == null) t = `Para ${prova}, quero que chegues aos ${alvo} km por semana, quase todos em ritmo fácil.`;
      else if (vol >= alvo) t = `Para ${prova}, quero que aguentes ${alvo} km por semana sem cansaço; já andas nos ${num(vol)}, por isso aqui é mantê-los fáceis.`;
      else t = `Para ${prova}, quero que chegues aos ${alvo} km por semana; andas nos ${num(vol)}. Sobe devagar: ${sobe}.`;
      if (!dMais) return t;
      return level === 'iniciante'
        ? `${t} Com ${dMais} m de D+ na prova, as subidas curtas entram quando tiveres quatro a seis semanas seguidas de base.`
        : `${t} Com ${dMais} m de D+ na prova, as subidas entram já.`;
    }
    case 'build': {
      let t = QUALITY_BY_LEVEL[level];
      if (o.targetPaceSeconds && level === 'avancado') {
        t += ` O teu ritmo-alvo é ${formatPace(o.targetPaceSeconds)}/km: é esse que treinas nos blocos a ritmo de prova.`;
      }
      if (dMais) t += ` Com ${dMais} m de D+ na prova, as subidas contam como treino de qualidade.`;
      return t;
    }
    case 'peak': {
      const g = longRunGuide({ experienceLevel: level, distanceKm: o.distanceKm, raceType: o.raceType, weeklyVolumeKm: vol });
      // O teto também é em tempo: "2h30", "1h30".
      const tempo = formatHoursMinutes(g.minutes * 60);
      let t;
      if (g.byTime) {
        t = dMais
          ? `No pico, o longo mede-se em tempo e não em distância: até ${tempo} de corrida, com subida como a da prova.`
          : `No pico, o longo mede-se em tempo e não em distância: até ${tempo} de corrida.`;
      } else if (g.byVolumeKm == null) {
        t = `No pico, o teu longo mais comprido não passa dos ${g.km[0]} a ${g.km[1]} km, nem de ${tempo} de corrida: o que vier primeiro.`;
      } else if (g.byVolumeKm >= g.km[1]) {
        t = `No pico, o teu longo mais comprido fica pelos ${g.km[1]} km ou ${tempo} de corrida, o que vier primeiro: é o teto para o teu nível.`;
      } else {
        t = `No pico, o teu longo mais comprido fica pelos ${g.byVolumeKm} km, ${g.pct[1]}% do que corres por semana, sem passar de ${tempo} de corrida.`;
      }
      // Nas provas longas, é nos longos que se ensaia o abastecimento.
      if (['meia', 'maratona', 'ultra'].includes(cat) || o.raceType === 'trail') {
        t += ' É nesses longos que testas o que vais comer e beber na prova.';
      }
      return t;
    }
    case 'taper': {
      // Numa prova B ou C, o polimento (4 dias) cabe na última semana, que
      // tem texto próprio no parecer: aqui não chega.
      if (o.racePriority === 'b' || o.racePriority === 'c') return null;
      const dias = getTaperDays(o.distanceKm, o.racePriority, level, o.raceType);
      const faltam = Number.isFinite(o.daysToRace) ? o.daysToRace : null;
      // A fase ocupa semanas inteiras; o polimento da doutrina são os
      // últimos N dias, e pode ainda não ter começado.
      if (faltam != null && faltam > dias) {
        return `É a tua prova principal: o polimento a sério são os últimos ${dias} dias. Até lá, a semana já é mais leve, sem treinos novos.`;
      }
      return `É a tua prova principal: estás nos últimos ${dias} dias, os do polimento. Nada de treinos novos.`;
    }
    default:
      return null;
  }
}
