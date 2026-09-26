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
import { lisbonParts } from './carolWelcome';

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
    // "Como corres hoje" queria dizer "hoje em dia", mas às 02:00 lia-se
    // "hoje, dia do calendário" (pedido 2026-09-26): sem "hoje" não há lado
    // errado da meia-noite.
    body: 'Primeiro preciso de te ver correr. Regista as próximas corridas e falamos do teu ritmo de base.',
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

/* O que ela sabe da vida do atleta passa à frente da corrida (revisão de
   2026-09-26; CAROL.md §8, "O contexto primeiro"). Quem veio correr mais
   rápido ou voltar de uma pausa — e "voltar de uma pausa" é muitas vezes
   voltar de uma lesão ou de uma operação — ouvia «Primeiro preciso de te
   ver correr. Regista as próximas corridas», com «Registar uma corrida» no
   botão, no dia a seguir à cirurgia que lhe tinha contado no chat. O Início
   já escondia a linha «Já correste?» nesses dias; o pedido principal do
   cartão ficava. `vida` é o acontecimento de eventoDaVida (carolVida.js):
   da véspera de uma cirurgia até ao fim da recuperação. Nesses dias o
   pedido é saber como está, e o botão principal é falar com ela.
   Sem "hoje" nem "amanhã" (vale a qualquer hora e dos dois lados da
   meia-noite), sem género, e sem prometer nada sobre a recuperação. Os
   outros objetivos não pedem corrida (a data da prova, uma refeição) e
   ficam como estão. */
const COM_VIDA = {
  // "Voltamos com calma" já diz o que é preciso; "vamos pôr-te mais rápido" não.
  title: (goal, n) => (goal === 'regresso'
    ? PEDIDO.regresso.title(n)
    : (n ? `${n}, uma coisa de cada vez.` : 'Uma coisa de cada vez.')),
  body: (vida) => `Não me esqueci ${vida.da}. Antes de falarmos de corridas, quero saber como estás: conta-me, e começamos daí.`,
};

/** { title, body, primary } para o cartão do primeiro dia. `vida`: o
 *  acontecimento de eventoDaVida (carolVida.js) para hoje, ou null. */
export function firstDayAsk(goal, firstName, { vida = null } = {}) {
  const p = PEDIDO[goal] || SEM_OBJETIVO;
  const n = firstName || '';
  if (vida?.da && p.primary === 'run') {
    return { title: COM_VIDA.title(goal, n), body: COM_VIDA.body(vida), primary: 'talk' };
  }
  return { title: p.title(n), body: p.body, primary: p.primary };
}

/* Quando é o primeiro dia (pedido 2026-09-26). Até aqui bastava não haver
   registos nem prova — e o caminho principal do arranque partia-se ao
   meio: o atleta acaba o onboarding, combina o plano no chat, aceita-o, e
   de volta ao Início, ainda sem registos, a Carol dizia-lhe "Antes de te
   dar volume, quero ver as primeiras saídas" — a negar o plano que tinha
   escrito um minuto antes —, e o "O que faço hoje" não aparecia. O mesmo
   com a proposta ainda por decidir (fechou a folha sem escolher): o
   cartão do primeiro dia pedia uma prova "para montar um plano" com o
   plano já escrito no chat.

   Havendo plano, aceite (`planWindow`, de computeAcceptedWindow — o mesmo
   que o "O que faço hoje" usa) ou proposto, o Início é o de todos os dias:
   o cartão do plano mostra o treino de hoje, ou diz que a proposta está no
   chat. O primeiro dia fica para quem ainda não tem nada: nem registos,
   nem prova, nem plano. */
export function isFirstDay({ dataPending = false, hasRecords = false, hasUpcomingRace = false, planWindow = null, plans = [] } = {}) {
  if (dataPending || hasRecords || hasUpcomingRace || planWindow) return false;
  return !(plans || []).some((p) => p?.status === 'proposto');
}

/* A linha que leva ao registo de corrida no primeiro dia (pedido
   2026-09-26). Era "Já correste hoje? Regista e eu ajusto o plano." — no
   primeiro dia não há plano nenhum para ajustar (é isso que o faz ser o
   primeiro dia, ver isFirstDay), e a Carol prometia uma coisa que a app
   não faz. O que a primeira corrida lhe dá é por onde começar — a mesma
   promessa que ela cumpre ao gravá-la (firstRecord.js: "Agora já sei por
   onde começar").

   E o "hoje" só de dia: entre as 23h e as 6h (hora de Lisboa, lisbonParts)
   quem abre a app ainda não se deitou, e "já correste hoje?" à 01:00
   pergunta pelo dia que acabou de começar. De noite a pergunta fica sem
   "hoje", e serve para a corrida que ele fez ao fim da tarde. */
export const FIRST_RUN_LINE = {
  dia: 'Já correste hoje? Regista a corrida e fico a saber por onde começar.',
  noite: 'Já correste? Regista a corrida e fico a saber por onde começar.',
};

export function firstRunLine(now = new Date()) {
  const { hour } = lisbonParts(now);
  return hour >= 23 || hour < 6 ? FIRST_RUN_LINE.noite : FIRST_RUN_LINE.dia;
}
