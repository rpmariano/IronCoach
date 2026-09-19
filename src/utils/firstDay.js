/* A Home no primeiro dia, a lembrar-se do arranque.

   Acabado o onboarding, o atleta cai numa Home sem registos. Antes disto a
   Carol dizia sempre "Vamos escolher a tua prova" — mesmo a quem tinha
   acabado de lhe dizer que vinha correr mais rápido, sem prova. CAROL.md §1:
   ela lembra-se e mostra que se lembra. Aqui: o que disseste no arranque
   decide o que ela te pede primeiro, e ela mostra o que já sabe de ti.

   Puro, para os testes. As fontes são as que o arranque grava
   (Onboarding.jsx, `gravar`): a nota `objetivo_pessoal` começa pelo título
   do objetivo; a `disponibilidade` diz os km e os dias; o perfil guarda o
   nível e as restrições. */

import { dietaryRestrictionLabel } from './diet';

const GOAL_BY_TITLE = [
  ['Preparar uma prova', 'prova'],
  ['Correr mais rápido', 'ritmo'],
  ['Manter-me saudável', 'saude'],
  ['Voltar depois de uma pausa', 'regresso'],
];

/** O objetivo que o atleta escolheu no arranque, ou null. */
export function goalFromNotes(coachNotes) {
  const nota = (coachNotes || []).find((n) => n?.category === 'objetivo_pessoal');
  const texto = String(nota?.note || '');
  return GOAL_BY_TITLE.find(([titulo]) => texto.startsWith(titulo))?.[1] || null;
}

const NIVEL = {
  iniciante: 'Corres há menos de um ano',
  basico: 'Corres há 6 a 18 meses',
  medio: 'Corres há 1 a 3 anos',
  avancado: 'Corres há mais de 3 anos',
};

/** O que ela já sabe de ti, em frases curtas — só o que foi dito. */
export function knownFacts({ profile, coachNotes } = {}) {
  const factos = [];
  if (NIVEL[profile?.experience_level]) factos.push(NIVEL[profile.experience_level]);
  const disp = (coachNotes || []).find((n) => n?.category === 'disponibilidade')?.note || '';
  const km = disp.match(/(\d+(?:[.,]\d+)?)\s*km por semana/);
  const dias = disp.match(/(\d+)\s*dias? por semana/);
  if (km) factos.push(`${km[1].replace('.', ',')} km por semana`);
  if (dias) factos.push(`${dias[1]} ${dias[1] === '1' ? 'dia' : 'dias'} por semana`);
  const restricoes = profile?.dietary_restrictions || [];
  if (restricoes.length) factos.push(restricoes.map(dietaryRestrictionLabel).join(', '));
  return factos;
}

/* O que ela pede primeiro, por objetivo. `primary` é a ação principal:
   'race' (marcar prova), 'run' (registar corrida), 'meal' (registar
   refeição). Voz de CAROL.md: afirma, diz porquê, sem exclamações. */
const PEDIDO = {
  prova: {
    title: (n) => (n ? `${n}, falta a data da prova.` : 'Falta a data da prova.'),
    body: 'Disseste que vens preparar uma prova. Com a data, conto as semanas para trás e o plano ganha fases.',
    primary: 'race',
  },
  ritmo: {
    title: (n) => (n ? `${n}, vamos pôr-te mais rápido.` : 'Vamos pôr-te mais rápido.'),
    body: 'Primeiro preciso de ver como corres hoje. Três corridas registadas e digo-te onde está o teu ritmo de base.',
    primary: 'run',
  },
  saude: {
    title: (n) => (n ? `${n}, regularidade primeiro.` : 'Regularidade primeiro.'),
    body: 'Não preciso de treinos duros, preciso de te ver voltar. Começa pelo que fizeres hoje: uma refeição chega.',
    primary: 'meal',
  },
  regresso: {
    title: (n) => (n ? `${n}, voltamos com calma.` : 'Voltamos com calma.'),
    body: 'Antes de te dar volume, quero ver as primeiras saídas. A primeira corrida diz-me mais do que qualquer resposta.',
    primary: 'run',
  },
};

const SEM_OBJETIVO = {
  title: (n) => (n ? `Olá, ${n}. Vamos escolher a tua prova.` : 'Olá. Vamos escolher a tua prova.'),
  body: 'Sem uma prova marcada não consigo montar um plano com fases. Diz-me a distância e a data, e trato do resto.',
  primary: 'talk',
};

/** { title, body, primary } para o cartão do primeiro dia. */
export function firstDayAsk(goal, firstName) {
  const p = PEDIDO[goal] || SEM_OBJETIVO;
  return { title: p.title(firstName || ''), body: p.body, primary: p.primary };
}
