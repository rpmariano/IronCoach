/* As conquistas de UMA prova (specs/gamificacao-provas.md).

   É a segunda vista do motor dos prémios: as regras — que provas contam, o
   que é objetivo batido, o que é recorde pessoal, o que é um elo de
   sequência, o que é trail — vivem em `utils/premios.js` e são exatamente
   as mesmas que `utils/medalhoes.js` usa para o Palmarés. Aqui só se
   pergunta o que é que ESTA prova deu, e se escreve a frase. É por isso que
   o hub, o Início, o Palmarés e a confirmação do registo nunca podem
   discordar sobre a mesma prova.

   Seis conquistas, calculadas dos dados que já existem: nenhuma tabela nova,
   nenhuma data de desbloqueio guardada (isso é dos medalhões, em
   `medal_awards`). Cinco delas são a mesma pergunta que um encaixe do
   Palmarés faz, feita a uma prova só:

     prova_concluida  → a contagem bruta; o Palmarés conta por balde
     objetivo_batido  → A Superação
     recorde_pessoal  → regra própria: o melhor tempo do atleta na categoria
                        (`outcome.isPersonalRecord`). NÃO é o medalhão "Os
                        Níveis", que é uma escala de aptidão (VDOT) — ver
                        `bateuRecordePessoal` em utils/premios.js
     primeira_trail   → O Terreno (o encaixe `trail1`)
     sequencia        → A Sequência (o elo desta prova, não o máximo)

   A sexta, `acima_do_treino`, não tem par no Palmarés: mede a prova contra
   o que os TREINOS anteriores faziam esperar, que é a única coisa premiada
   aqui que não depende de ter marcado objetivo nem de ter histórico na
   distância.

   Uma prova conta como concluída quando está `status = 'concluida'`, tem
   corrida ligada (findRaceRun) e o dia dela já passou — a régua é
   `completedRaces`, em utils/premios.js. */

import { Flag, Target, Zap, Mountain, Repeat, Rocket } from 'lucide-react';
import { formatDuration } from './run';
import { formatDelta, raceCategoryLabel } from './raceOutcome';
import {
  acimaDoTreino,
  bateuObjetivo,
  bateuRecordePessoal,
  capitalize,
  completedRaces,
  dayOf,
  daysBetween,
  ordinalFem,
  provasDoTerreno,
  requireToday,
  varrerSequencia,
} from './premios';

/** Uma conquista é "nova" enquanto a prova que a deu tiver menos de 7 dias —
 *  é a janela do dia a seguir à prova (a mesma do cartão do Início e do
 *  balanço da Carol). */
export const NOVA_ATE_DIAS = 7;

/** A ordem é fixa. É também o contrato da fronteira com o servidor: estas
 *  chaves viajam em `race_outcome.achievements_new` (utils/coachProactive.js)
 *  e o `coach-chat` só reconhece as que estão em ACHIEVEMENT_LABELS
 *  (supabase/functions/coach-chat/index.ts) — mudar uma aqui e não lá é a
 *  Carol deixar de citar a conquista, em silêncio. */
export const ACHIEVEMENT_KEYS = ['prova_concluida', 'objetivo_batido', 'acima_do_treino', 'recorde_pessoal', 'primeira_trail', 'sequencia'];

/* As conquistas de uma prova avaliam-se NA PRÓPRIA prova, não por "foi a
   mais recente a cumprir a condição": com duas provas com objetivo batido,
   as duas o bateram — e o hub da mais antiga, a lista do Palmarés e o cartão
   do Início têm de o dizer. (Antes filtrava-se o palmarés global pelo raceId
   da última que cumpria, e a mais antiga aparecia sem conquistas e com um
   "fica para a próxima" errado — apanhado na revisão pré-deploy.)
   Devolve { earned, missed }: o que ela deu, e o que ainda podia ter dado —
   só objetivo e recorde, porque "primeira de trail" ou "sequência" não são
   falhas de quem correu — a lista delas é este LOCKED_SHAPE. */
const LOCKED_SHAPE = {
  objetivo_batido: { name: 'Objetivo batido', short: 'Objetivo', tone: 'ok', Icon: Target },
  recorde_pessoal: { name: 'Recorde pessoal', short: 'Recorde', tone: 'run', Icon: Zap },
};

export function evaluateRace({ raceEvents = [], runs = [], profile = {}, today } = {}, raceId) {
  const none = { earned: [], missed: [] };
  if (!raceId) return none;
  const hoje = requireToday(today, 'evaluateRace');
  const completed = completedRaces({ raceEvents, runs, profile, today: hoje });
  const idx = completed.findIndex(({ race }) => race.id === raceId);
  if (idx < 0) return none;
  const { race, run, outcome } = completed[idx];
  /* "Nova" conta pela data do REGISTO (created_at da corrida ligada), não
     pela data da prova: quem registar dez dias depois vê o cartão de
     conquista na mesma (apanhado na revisão pré-deploy). Sem created_at
     (registos antigos, demo), vale a data da prova. */
  const isNew = daysBetween(dayOf(run?.created_at) || dayOf(race.date), hoje) < NOVA_ATE_DIAS;
  const item = (key, name, short, tone, Icon, detail) => ({
    key, name, short, tone, Icon, unlocked: true, date: dayOf(race.date), raceId: race.id, raceName: race.name ?? null, detail, isNew,
  });
  const locked = (key) => ({ key, ...LOCKED_SHAPE[key], unlocked: false, raceId: race.id });
  const earned = [];
  const missed = [];

  // A lista vem da mais recente para a mais antiga: a ordem desta prova é
  // quantas há dela (inclusive) para trás.
  earned.push(item('prova_concluida', 'Prova concluída', 'Prova', 'race', Flag, `${ordinalFem(completed.length - idx)} prova`));

  if (bateuObjetivo(outcome)) {
    earned.push(item('objetivo_batido', 'Objetivo batido', 'Objetivo', 'ok', Target,
      `${race.name}, ${formatDuration(outcome.officialSeconds)} (objetivo ${formatDuration(outcome.targetSeconds)})`));
  } else {
    missed.push(locked('objetivo_batido'));
  }

  /* Acima do que o treino previa — a prova em que ele correu mais do que o
     que as corridas ANTERIORES faziam esperar. A régua é a mesma do balanço
     da Carol (a banda TRAINING_BAND_RATIO de 2% do raceOutcome, não os 3% do
     NEAR_TARGET_RATIO, que é outra coisa) — o palmarés não pode discordar do
     que ela diz sobre a mesma prova.

     O tom é `gym` e não `coach`: --coach é a cor da Carol e só dela
     (colors.css, "uma cor, um sentido"), e era praticamente o mesmo ciano de
     --run, o tom do recorde pessoal — numa prova que desse as duas, as
     pílulas ficavam indistinguíveis no Início.

     Não entra nas "perdidas": a diferença face à previsão já está no bloco
     dos tempos do hub, e três linhas de "fica para a próxima" na mesma prova
     passavam de leitura a repreensão. */
  if (acimaDoTreino(outcome)) {
    earned.push(item('acima_do_treino', 'Acima do treino', 'Treino', 'gym', Rocket,
      `${formatDuration(outcome.officialSeconds)} — ${formatDelta(outcome.deltaPredictionSeconds)} abaixo do que o treino previa (${formatDuration(outcome.predictedSeconds)})`));
  }

  if (bateuRecordePessoal(outcome)) {
    earned.push(item('recorde_pessoal', 'Recorde pessoal', 'Recorde', 'run', Zap,
      `${capitalize(raceCategoryLabel(outcome.category))}: ${formatDuration(outcome.officialSeconds)}, ${formatDelta(outcome.deltaBestSeconds)} abaixo do anterior`));
  } else {
    missed.push(locked('recorde_pessoal'));
  }

  // A primeira de trail é a PRIMEIRA por data — a mesma pergunta que enche o
  // encaixe `trail1` d'O Terreno, feita a esta prova.
  const trails = provasDoTerreno(completed, 'trail');
  if (trails.length && trails[0].race.id === race.id) {
    earned.push(item('primeira_trail', 'Primeira de trail', 'Trail', 'race', Mountain,
      [race.name, outcome?.officialSeconds ? formatDuration(outcome.officialSeconds) : null].filter(Boolean).join(', ')));
  }

  /* A sequência conta-se a partir da 2.ª prova seguida: o elo desta prova na
     sua própria sequência é o número que ela mostra ("2 provas seguidas").
     Sai do varrimento único de utils/premios.js — o mesmo que dá os marcos
     d'A Sequência no Palmarés.

     Antes saía da sequência que chega a HOJE, e por isso uma prova que foi a
     3.ª seguida perdia o "3 provas seguidas" assim que uma prova posterior
     passasse por registar: a leitura do hub de uma prova antiga mudava por
     causa de uma prova que veio depois. Agora não — é a mesma lei da medalha
     d'A Sequência, o que se ganhou não se perde. */
  const elo = varrerSequencia({ raceEvents, runs, today: hoje }).posicaoDe(race.id);
  if (elo >= 2) earned.push(item('sequencia', 'Sequência de provas', 'Sequência', 'race', Repeat, `${elo} provas seguidas`));

  return { earned, missed };
}

/** As conquistas desbloqueadas POR esta prova — o que o hub, o cartão do
 *  Início e a confirmação do registo mostram. */
export function achievementsForRace(data, raceId) {
  return evaluateRace(data, raceId).earned;
}

/** As que esta prova ainda podia ter dado (objetivo, recorde). */
export function missedInRace(data, raceId) {
  return evaluateRace(data, raceId).missed;
}

/** A linha discreta do hub: o que esta prova não deu, com o número de quanto
 *  faltou — nunca uma repreensão, é o que a treinadora diria a seguir. */
export function describeMissedInRace(achievement, outcome) {
  if (!achievement) return '';
  if (achievement.key === 'objetivo_batido') {
    if (outcome?.targetSeconds && outcome?.deltaTargetSeconds > 0) {
      return `Objetivo batido fica para a próxima: ficaste a ${formatDelta(outcome.deltaTargetSeconds)}`;
    }
    return 'Objetivo batido fica para a próxima: esta prova não tinha objetivo marcado';
  }
  if (achievement.key === 'recorde_pessoal') {
    if (outcome?.previousBestSeconds && outcome?.deltaBestSeconds > 0) {
      return `Recorde pessoal fica para a próxima: ${formatDelta(outcome.deltaBestSeconds)} acima do teu melhor na ${raceCategoryLabel(outcome.category)}`;
    }
    return 'Recorde pessoal fica para a próxima: precisa de duas provas na mesma distância';
  }
  return `${achievement.name} fica para a próxima`;
}
