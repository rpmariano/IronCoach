/* O motor dos prémios — a base única de tudo o que a app premeia.

   Até 2026-09-21 havia dois motores a correr ao mesmo tempo sobre os mesmos
   dados: `utils/medalhoes.js` (os medalhões do Palmarés, entretanto
   removido) e `utils/achievements.js` (as conquistas de cada prova). Tinham
   a régua das provas partilhada (`completedRaces` vivia num e era importado
   pelo outro), mas repetiam tudo o resto: a sequência de provas contava-se
   de duas maneiras, a primeira de trail decidia-se duas vezes, o objetivo
   batido tinha o mesmo predicado escrito em dois sítios — e os helpers de
   datas estavam copiados de um lado para o outro, com diferenças reais (um
   filtrava provas com data futura, o outro não).

   Este ficheiro é a base onde as regras vivem UMA vez. Por cima dele ficam
   as vistas, que não decidem nada por si:

     - `utils/badges.js` — os badges da Vitrina, que desde 2026-09-22 são a
       única coleção (os seis medalhões foram portados para lá);
     - `utils/achievements.js` — as conquistas DE UMA prova, que é a vista
       do hub, do cartão do Início e da confirmação do registo.

   Duas regras da casa, que a fusão veio impor:

   1. **O relógio entra sempre.** Nada aqui chama `new Date()` por omissão:
      `today` (ISO `YYYY-MM-DD`, dia local) é obrigatório e quem não o passar
      leva um erro, em vez de duas leituras da mesma prova discordarem por
      correrem em relógios diferentes (era o que acontecia entre os dois
      motores à meia-noite local e em qualquer chamada com data simulada).

   2. **Uma prova com data no futuro não conta.** O motor dos medalhões já
      filtrava; `completedRaces` não — e uma prova marcada `concluida` com
      data à frente contava num motor e não no outro. Passa a contar em
      nenhum: enquanto o dia não chegar, não há prova feita. Isto MUDA
      contagens visíveis (o ordinal da prova no hub e no Início), de
      propósito.

   Datas: as colunas `date` são ISO `YYYY-MM-DD` (dia local) e toda a
   aritmética de calendário se faz em UTC sobre essas strings — nunca
   `new Date(iso)` sem fixar a hora, que à meia-noite em Lisboa ainda é o dia
   anterior em UTC. */

import { findRaceRun } from './run';
import { classifyRaceOutcome } from './raceOutcome';

const DAY_MS = 86400000;

// ── Datas ────────────────────────────────────────────────────────────────

/** O dia (`YYYY-MM-DD`) de um valor ISO, ou null se não tiver a forma. */
export function dayOf(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
}

function utc(iso) {
  return Date.parse(`${iso}T00:00:00Z`);
}

export function addDays(iso, n) {
  return new Date(utc(iso) + n * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(fromIso, toIso) {
  return Math.round((utc(toIso) - utc(fromIso)) / DAY_MS);
}

/** O dia de hoje que entra em qualquer regra, sem rede: quem não o injeta
 *  leva um erro em vez de cair no relógio real por trás das costas. */
export function requireToday(today, quem) {
  const dia = dayOf(today);
  if (!dia) throw new Error(`${quem}: falta o dia de hoje (today, ISO YYYY-MM-DD) — o motor dos prémios não usa o relógio real.`);
  return dia;
}

// ── Texto ────────────────────────────────────────────────────────────────

export function capitalize(text) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

export const plural = (n, um, varios) => (n === 1 ? um : varios);

/** "3.ª prova" — o ordinal feminino, que é como se lê em português. */
export const ordinalFem = (n) => `${n}.ª`;

// ── O nome de um registo ─────────────────────────────────────────────────

/* O mesmo nome que o cartão da corrida dá ao tipo de treino (Run/RunCard.jsx,
   runKindLabel) — a lista tem de ler-se como o Calendário. Vive aqui, e não
   na vista, desde que os badges de treino (utils/badges.js) passaram a
   precisar dela ao lado d'O Palmarés: uma segunda cópia da tabela era a
   forma garantida de os dois ecrãs chamarem nomes diferentes ao mesmo
   treino. */
export const TIPOS_TREINO = {
  continuo: 'Contínuo',
  longo: 'Longo',
  recuperacao: 'Recuperação',
  tempo: 'Ritmo (Tempo)',
  fartlek: 'Fartlek',
  intervalos: 'Intervalos',
  subidas: 'Subidas',
  trail: 'Trail',
  tecnico: 'Técnico (trilho)',
};

export function runKindLabel(run) {
  /* 'Prova', não 'Competição': veio do dev em 2026-09-22 ("toda a competição
     passa a ser uma prova", 215eb34). A alteração deles foi feita em
     medalhoes.js, de onde esta função já tinha saído — é aqui que ela vive
     agora, e é aqui que a mudança tem de estar para não se perder no merge. */
  if (run?.kind === 'competicao') return 'Prova';
  if (run?.kind === 'treino' && run.training_type) return TIPOS_TREINO[run.training_type] || capitalize(run.training_type);
  return 'Corrida';
}

/** "10,2 km": uma casa decimal, para a linha de um registo. */
export function fmtKmLinha(value) {
  return `${String(Math.round(value * 10) / 10).replace('.', ',')} km`;
}

/** Os registos da lista, do mais recente para o mais antigo. */
export const newestFirst = (list) => [...list].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

// ── A régua das provas ───────────────────────────────────────────────────

/* As provas que contam: `status = 'concluida'`, com corrida ligada
   (`findRaceRun`) e com a data já passada. Da mais recente para a mais
   antiga, cada uma já com o seu veredicto de `utils/raceOutcome.js`.

   Marcar "concluída" na agenda sem registar nada não dá prémio nenhum — não
   há números para o sustentar. E marcar uma prova de daqui a um mês como
   concluída também não: o dia ainda não chegou. */
export function completedRaces({ raceEvents = [], runs = [], profile = {}, today } = {}) {
  const hoje = requireToday(today, 'completedRaces');
  return (raceEvents || [])
    .filter((race) => race && dayOf(race.date) && dayOf(race.date) <= hoje && race.status === 'concluida')
    .map((race) => ({ race, run: findRaceRun(runs, race) }))
    .filter(({ run }) => !!run)
    .map(({ race, run }) => ({ race, run, outcome: classifyRaceOutcome({ race, run, runs, profile, races: raceEvents }) }))
    .sort((a, b) => dayOf(b.race.date).localeCompare(dayOf(a.race.date)));
}

// ── Os predicados de resultado ───────────────────────────────────────────

/* A régua do resultado é uma só, `utils/raceOutcome.js`. Os prémios não
   comparam tempos: perguntam. */

/** Objetivo batido: o tempo oficial ficou no objetivo marcado ou abaixo.
 *  É o que A Superação conta e o que a conquista `objetivo_batido` diz. */
export const bateuObjetivo = (outcome) => outcome?.verdict === 'superado' && outcome?.basis === 'objetivo';

/* Recorde pessoal: o melhor tempo DE SEMPRE do atleta na mesma distância —
   não na categoria larga que o taper usa (`outcome.isPersonalRecord`;
   raceOutcome.js DISTANCE_MATCH_RATIO, 2026-09-26).

   NÃO é a mesma coisa que o medalhão "Os Níveis", e é por isso que os nomes
   mudaram: aquilo é uma escala de aptidão (VDOT — bronze, prata, ouro), que
   compara distâncias diferentes e que se pode subir sem bater tempo nenhum
   próprio; isto é o atleta contra ele mesmo, na mesma distância. A spec dizia
   que a conquista "passava a viver em Os Recordes" — nunca passou, e não
   podia: são duas perguntas diferentes sobre a mesma prova. */
export const bateuRecordePessoal = (outcome) => !!outcome?.isPersonalRecord;

/** Acima do que o treino previa — a banda TRAINING_BAND_RATIO do
 *  raceOutcome, a mesma que o balanço da Carol usa. Não tem par nos
 *  medalhões: é só da prova. */
export const acimaDoTreino = (outcome) => outcome?.vsTraining === 'acima';

// ── As distâncias de prova ───────────────────────────────────────────────

/* As quatro distâncias que dão prémio, pela distância OFICIAL da prova e não
   pela categoria de treino de `categorizeDistance` (utils/run.js): aí a
   "meia" vai de 11 a 22,5 km e a "maratona" de 22,5 a 50, e uma prova de
   15 km levava o prémio dos 21,1. A folga de cada banda cobre o GPS e os
   percursos medidos por cima.

   Vive aqui, ao lado de TERRENOS, porque é a mesma espécie de regra — o que
   é uma prova de 10 km, tal como o que é uma prova de trail. Teve dois
   leitores enquanto O Palmarés existiu (cada um com a sua cópia da tabela);
   ficou só com o badge `distancias` de `utils/badges.js` quando a cópia de
   lá se foi com o ficheiro, que é o que esta tabela sempre devia ter sido:
   uma só. */
export const DISTANCIAS_DE_PROVA = [
  { key: '5k', min: 4.8, max: 5.5, label: '5 km', nome: '5 km', primeira: 'Primeiros 5 km' },
  { key: '10k', min: 9.5, max: 11, label: '10 km', nome: '10 km', primeira: 'Primeiros 10 km' },
  { key: '21k', min: 20.5, max: 22.5, label: '21,1 km', nome: 'meia maratona', primeira: 'Primeira meia maratona' },
  { key: '42k', min: 41.5, max: 43.5, label: '42,2 km', nome: 'maratona', primeira: 'Primeira maratona' },
];

/** Os quilómetros de uma prova: os da agenda e, se lá não estiverem, os que o
 *  veredicto apurou da corrida ligada. Null quando não há nenhum dos dois —
 *  e é esse null que deixa a prova por decidir, em vez de a pôr num encaixe
 *  errado. */
export function kmDeProva(race, outcome) {
  const km = Number(race?.distance_km) || Number(outcome?.distanceKm);
  return Number.isFinite(km) && km > 0 ? km : null;
}

/** A distância de DISTANCIAS_DE_PROVA em que uma prova cai, ou null se cair
 *  entre bandas (uma prova de 15 km não é nenhuma das quatro) ou se não se
 *  souber a distância. */
export function distanciaDeProva(race, outcome) {
  const km = kmDeProva(race, outcome);
  if (km == null) return null;
  return DISTANCIAS_DE_PROVA.find((d) => km >= d.min && km <= d.max) || null;
}

// ── O terreno ────────────────────────────────────────────────────────────

/* Estrada e trail são os dois únicos terrenos (RACE_TERRAIN_TYPES em
   utils/run.js): `race_type === 'trail'` é trail, tudo o resto é estrada (a
   coluna só admite os dois valores e o formulário guarda 'estrada' por
   omissão; uma prova antiga sem terreno conta como estrada, que é o que
   era). */
export const TERRENOS = [
  { key: 'estrada', nome: 'estrada', em: 'em estrada' },
  { key: 'trail', nome: 'trail', em: 'em trail' },
];

export const terrenoDe = (race) => (race?.race_type === 'trail' ? 'trail' : 'estrada');

/** As provas de um terreno, da mais ANTIGA para a mais recente — é a ordem
 *  em que se ganham a primeira e a quinta, e em que se sabe qual foi "a
 *  primeira de trail". `completed` pode vir em qualquer ordem. */
export function provasDoTerreno(completed, terrenoKey) {
  return (completed || [])
    .filter(({ race }) => terrenoDe(race) === terrenoKey)
    .sort((a, b) => dayOf(a.race.date).localeCompare(dayOf(b.race.date)));
}

// ── A sequência ──────────────────────────────────────────────────────────

/* Um varrimento só, do princípio para o fim, que responde às duas perguntas
   que antes eram dois cálculos:

   - `recordes` — cada vez que a maior sequência de sempre cresce (a lei que
     a app cunha desde o Palmarés e que os badges herdaram: o que se ganhou
     não se perde no dia em que a sequência seguinte quebra);
   - `posicaoDe(raceId)` — em que elo da SUA sequência ficou cada prova (o
     "N provas seguidas" que o hub mostra nessa prova). O máximo de sempre
     não dá este número, por isso o varrimento tem de ser posicional.

   Antes, o segundo número saía de `currentStreak`: a sequência que chega a
   hoje. Uma prova que foi a 3.ª seguida perdia o "3 provas seguidas" no dia
   em que outra prova passasse por registar — a leitura do hub de uma prova
   antiga mudava por causa de uma prova posterior. Agora não: cada prova fica
   com o elo que foi, para sempre.

   A régua do elo: uma prova que já passou só conta se estiver concluída E
   com corrida ligada; se passou sem registo, quebra. Provas ainda por correr
   não entram nem quebram. */
export function varrerSequencia({ raceEvents = [], runs = [], today } = {}) {
  const hoje = requireToday(today, 'varrerSequencia');
  const passadas = (raceEvents || [])
    .filter((race) => race && dayOf(race.date) && dayOf(race.date) <= hoje)
    .sort((a, b) => dayOf(a.date).localeCompare(dayOf(b.date)));

  const recordes = [];
  const posicao = new Map();
  let atual = [];
  let best = 0;
  for (const race of passadas) {
    if (race.status !== 'concluida' || !findRaceRun(runs || [], race)) {
      atual = [];
      continue;
    }
    atual = [...atual, race];
    if (race.id != null) posicao.set(race.id, atual.length);
    if (atual.length > best) {
      best = atual.length;
      recordes.push({ n: best, race, awardedOn: dayOf(race.date), races: [...atual] });
    }
  }

  return {
    recordes,
    best,
    atual,
    posicaoDe: (raceId) => posicao.get(raceId) || 0,
  };
}
