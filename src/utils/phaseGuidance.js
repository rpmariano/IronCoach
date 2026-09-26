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
 * @param {string|null} o.experienceLevel  null quando o atleta não o declarou
 * @param {number} o.distanceKm
 * @param {string} [o.raceType]        'estrada' | 'trail'
 * @param {number|null} [o.elevationGainM]
 * @param {string} [o.racePriority]    'a' | 'b' | 'c'
 * @param {number|null} [o.weeklyVolumeKm]  o volume que a app lhe conhece (null sem histórico)
 * @param {number|null} [o.targetPaceSeconds]
 * @param {number|null} [o.daysToRace]  para o polimento: quantos dias faltam
 * @param {number|null} [o.baseWeeksDone]  semanas de base já feitas (null sem se saber)
 * @param {boolean} [o.hasAcceptedPlan]  há um plano da Carol aceite para esta prova
 * @param {boolean} [o.weekLighterThanLast]  o plano desta semana é mais leve do que o da anterior
 */
export function phaseGuidance(o) {
  // O onboarding grava null a quem salta a pergunta: os números ficam os
  // do iniciante, por prudência, mas não se lhe diz que é esse o nível
  // dele (revisão de 2026-09-26).
  const declared = LEVELS.includes(o.experienceLevel);
  const level = declared ? o.experienceLevel : 'iniciante';
  const pergunta = declared ? '' : ' Diz-me há quanto tempo corres e afino isto.';
  const prova = raceLabel(o.distanceKm, o.raceType);
  const cat = categorizeDistance(o.distanceKm) ?? '10k';
  const vol = typeof o.weeklyVolumeKm === 'number' && o.weeklyVolumeKm > 0 ? o.weeklyVolumeKm : null;
  const dMais = o.raceType === 'trail' && Number(o.elevationGainM) > 0 ? Math.round(Number(o.elevationGainM)) : null;

  // O Bloco 1 desaconselha o ultra ao iniciante: os números da doutrina
  // nunca servem para o habilitar, e o hub já mostra o alerta.
  if (level === 'iniciante' && cat === 'ultra') {
    if (!declared) return `Num ultra, o que cada fase te pede depende muito da experiência que já tens.${pergunta}`;
    // Com o plano aceite, a decisão está tomada: fica o aviso, não a recusa.
    if (o.hasAcceptedPlan) return 'Continuo a achar que um ultra é cedo para ti. Se vamos a ele, vamos com margem: fala comigo antes de cada longo.';
    return 'Um ultra é desaconselhado no teu nível, por isso não o preparo contigo assim. Fala comigo sobre uma distância mais curta para já.';
  }

  switch (o.phaseId) {
    case 'base': {
      const alvo = MIN_VOLUME_KM[level]?.[cat];
      // Corrida 2.1 #1: o iniciante sobe mais devagar.
      const sobe = !declared ? null : level === 'iniciante' ? 'no máximo 2 a 3 km por semana' : 'no máximo 10% por semana';
      let t;
      if (alvo == null) t = 'Na base, quase tudo em ritmo fácil, a conversar.';
      else if (vol == null) t = `Para ${prova}, quero que chegues aos ${alvo} km por semana, quase todos em ritmo fácil.`;
      else if (vol >= alvo) t = `Para ${prova}, quero que aguentes ${alvo} km por semana sem cansaço; já andas nos ${num(vol)}, por isso aqui é mantê-los fáceis.`;
      else t = `Para ${prova}, quero que chegues aos ${alvo} km por semana; andas nos ${num(vol)}. Sobe devagar${sobe ? `: ${sobe}` : ''}.`;
      if (!dMais) return t + pergunta;
      if (!declared) return `${t} Com ${dMais} m de D+ na prova, as subidas também vão entrar.${pergunta}`;
      return level === 'iniciante'
        ? `${t} Com ${dMais} m de D+ na prova, as subidas curtas entram quando tiveres quatro a seis semanas seguidas de base.`
        : `${t} Com ${dMais} m de D+ na prova, as subidas entram já.`;
    }
    case 'build': {
      let t = !declared
        ? 'Nesta fase entram subidas curtas e fartlek suave; o limiar e os intervalos dependem da experiência que já tens.'
        : level === 'basico' && o.baseWeeksDone >= 6
          ? 'Com a base que fizeste, entram as subidas, o fartlek e o limiar, e no fim da fase os intervalos.'
          : QUALITY_BY_LEVEL[level];
      if (o.targetPaceSeconds && level === 'avancado') {
        t += ` O teu ritmo-alvo é ${formatPace(o.targetPaceSeconds)}/km: é esse que treinas nos blocos a ritmo de prova.`;
      }
      if (dMais) t += ` Com ${dMais} m de D+ na prova, as subidas contam como treino de qualidade.`;
      return t + pergunta;
    }
    case 'peak': {
      let t;
      if (!declared) {
        // O teto do longo (km e tempo) é por nível: sem ele declarado, seria
        // o do iniciante dito como facto (revisão de 2026-09-26).
        t = o.raceType === 'trail'
          ? `No pico, o longo mede-se em tempo e não em distância${dMais ? ', com subida como a da prova' : ''}, e a duração dele depende da experiência que já tens.`
          : 'No pico, o longo chega ao mais comprido do ciclo, e até onde vai depende da experiência que já tens.';
      } else {
        const g = longRunGuide({ experienceLevel: level, distanceKm: o.distanceKm, raceType: o.raceType, weeklyVolumeKm: vol });
        // O teto também é em tempo: "2h30", "1h30".
        const tempo = formatHoursMinutes(g.minutes * 60);
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
      }
      // Nas provas longas, é nos longos que se ensaia o abastecimento.
      if (['meia', 'maratona', 'ultra'].includes(cat) || o.raceType === 'trail') {
        t += ' É nesses longos que testas o que vais comer e beber na prova.';
      }
      return t + pergunta;
    }
    case 'taper': {
      // Numa prova B ou C, o polimento (4 dias) cabe na última semana, que
      // tem texto próprio no parecer: aqui não chega.
      if (o.racePriority === 'b' || o.racePriority === 'c') return null;
      // Os dias de polimento são por nível: sem ele declarado, a gama da
      // doutrina para esta prova, e não os do iniciante (revisão de 2026-09-26).
      const gama = (declared ? [level] : LEVELS).map((l) => getTaperDays(o.distanceKm, o.racePriority, l, o.raceType));
      const dias = Math.min(...gama);
      const ate = Math.max(...gama);
      const faltam = Number.isFinite(o.daysToRace) ? o.daysToRace : null;
      // A fase ocupa semanas inteiras; o polimento da doutrina são os
      // últimos N dias, e pode ainda não ter começado.
      if (faltam != null && faltam > dias) {
        // "Já é mais leve" só se o plano desta semana o for de facto.
        const ateLa = o.weekLighterThanLast ? 'a semana já é mais leve, sem treinos novos' : 'cumpre o plano e não metas treinos novos';
        const quantos = ate > dias ? `${dias} a ${ate} dias, conforme a experiência que já tens` : `${dias} dias`;
        return `É a tua prova principal: o polimento a sério são os últimos ${quantos}. Até lá, ${ateLa}.${pergunta}`;
      }
      if (!declared) return `É a tua prova principal, e já estás no polimento. Nada de treinos novos.${pergunta}`;
      return `É a tua prova principal: estás nos últimos ${dias} dias, os do polimento. Nada de treinos novos.${pergunta}`;
    }
    default:
      return null;
  }
}
