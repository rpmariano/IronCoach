/* A resposta da Carol ao check-in de hoje.

   O check-in é uma conversa de dez segundos, não um formulário: depois de o
   atleta dizer como acordou, ela responde — e a resposta fica no cartão do
   "Como estou" o resto do dia, em vez de um "Check-in guardado" que ninguém
   lê. Uma frase, na voz de CAROL.md: o que preocupa primeiro, afirma, sem
   emoji nem exclamação, e nada que ela não saiba.

   Tem de aguentar a centésima vez: um dia normal tem uma resposta curta e
   seca ("Anotado."), e o reconhecimento é raro — só quando há motivo (dormiu
   bem depois de noites más, energia em cheio, uma sequência redonda de
   check-ins). Puro, para os testes.

   A frase depende também do que o dia é (pedido 2026-09-26): "nem se olha
   para o relógio" num dia de descanso, ou "Anotado. Dia normal." na manhã da
   prova, é o tipo de frase que lembra ao atleta que está a falar com uma
   máquina. `dia` vem de checkinDay (utils/carolWelcome.js), o mesmo que dá
   as boas-vindas: { tipo: 'treino' | 'feito' | 'descanso' | 'semTreino' |
   'semPlano' | 'prova' | 'provaFeita', corrida, vespera }. Sem `dia`, as frases são as que
   servem qualquer dia. */

import { todaysCheckin } from './checkin';

const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Quantos dias seguidos, a acabar hoje, têm check-in. */
export function checkinStreak(checkins, today) {
  const dias = new Set((checkins || []).map((c) => String(c?.date).slice(0, 10)));
  let n = 0;
  for (let d = today; dias.has(d); d = addDays(d, -1)) n++;
  return n;
}

// Até 100: o store só carrega 119 dias de check-ins, mais do que isso nunca se contava.
// Por extenso, e o que ela sabe cresce com o marco: aos 100 dias, "já começo
// a conhecer" era pouco (revisão de 2026-09-26).
const DIAS = 'Já começo a conhecer os teus dias.';
const SEMANAS = 'Já sei como são as tuas semanas.';
const MARCOS = new Map([
  [7, `Sete dias seguidos de check-in. ${DIAS}`],
  [14, `Catorze dias seguidos de check-in. ${DIAS}`],
  [30, `Trinta dias seguidos de check-in. ${SEMANAS}`],
  [60, `Sessenta dias seguidos de check-in. ${SEMANAS}`],
  [100, 'Cem dias seguidos de check-in. Já sei como são os teus meses.'],
]);
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

/** Quantas noites más seguidas, a acabar hoje (sono ≤ 2). */
function noitesMas(checkins, today) {
  let n = 0;
  for (let d = today; ; d = addDays(d, -1)) {
    const c = todaysCheckin(checkins, d);
    const sono = c ? num(c.sleep) : null;
    if (sono == null || sono > 2) return n;
    n++;
  }
}

const EXTENSO = ['', 'Uma', 'Duas', 'Três', 'Quatro', 'Cinco', 'Seis', 'Sete'];

/**
 * { text, mood, tone } para o check-in de hoje, ou null sem check-in.
 * mood: neutral | happy | worried (CAROL.md §4); tone: coach | warn.
 */
export function checkinReply(checkins, today, dia = null, { conversaSobreADor } = {}) {
  const c = todaysCheckin(checkins, today);
  if (!c) return null;
  const ontem = todaysCheckin(checkins, addDays(today, -1));
  const sono = num(c.sleep);
  const energia = num(c.energy);
  const stress = num(c.stress);
  const dor = num(c.pain) || 0;
  const onde = String(c.pain_location || '').trim();
  // Entre parênteses: "no canela" ou "na joelho" não concordam.
  const noLocal = onde ? ` (${onde.toLowerCase()})` : '';
  const tipo = dia?.tipo || null;
  const prova = tipo === 'prova';
  const provaFeita = tipo === 'provaFeita';
  const treino = tipo === 'treino';
  const descanso = tipo === 'descanso';
  const feito = tipo === 'feito';
  const vespera = !prova && !!dia?.vespera;
  // Uma cirurgia, uma lesão ou uma doença de que ela sabe (utils/carolVida.js),
  // de hoje até ao fim da recuperação: a resposta parte daí.
  const vida = dia?.vida && dia.vida.dias >= 0 ? dia.vida : null;

  // 1. O que preocupa, primeiro.
  if (dor >= 4 && vida && vida.tipo !== 'doenca') {
    // Depois de uma cirurgia, a dor é assunto da equipa médica primeiro.
    const quando = vida.tipo === 'cirurgia' ? `depois ${vida.da}` : `com ${vida.a}`;
    return { mood: 'worried', tone: 'warn', text: `Uma dor de ${dor}${noLocal} ${quando} não se ignora. Se não aliviar, fala com a equipa médica, e conta-me como estás.` };
  }
  // Sem assunto da dor por abrir — a conversa já aconteceu, ou o que está
  // pendente é outro (a carga) — não se promete uma conversa que não vem
  // (revisão de 2026-09-26). Sem se saber (undefined), fica a promessa.
  if (dor >= 4 && conversaSobreADor === false) {
    const depois = prova ? 'Se piorar antes da partida, diz-me.' : 'Hoje nada de impacto; se piorar, diz-me.';
    return { mood: 'worried', tone: 'warn', text: `Uma dor de ${dor}${noLocal} não se ignora. ${depois}` };
  }
  if (dor >= 4) {
    const depois = prova ? 'Quero falar contigo antes da partida.'
      : provaFeita ? 'Quero falar contigo sobre ela ainda hoje.'
        : vespera ? 'Quero falar contigo sobre ela antes da prova de amanhã.'
          : treino || !tipo ? 'Hoje não se força, e quero falar contigo sobre ela.'
            : 'Quero falar contigo sobre ela antes do próximo treino.';
    return { mood: 'worried', tone: 'warn', text: `Uma dor de ${dor}${noLocal} não se ignora. ${depois}` };
  }
  if (sono != null && sono <= 2 && vida && vida.dias <= 7) {
    return { mood: 'worried', tone: 'coach', text: `Dormiste mal. Nos primeiros dias depois ${vida.da} é normal; hoje, descansar é o teu treino.` };
  }
  if (sono != null && sono <= 2) {
    // Na manhã da prova não se contam noites: a que conta é a de ontem, e é normal.
    if (prova) return { mood: 'worried', tone: 'coach', text: 'Dormir mal na noite antes da prova é normal. Não estraga a corrida.' };
    const n = noitesMas(checkins, today);
    const abertura = n > 7 ? 'Há mais de uma semana que dormes mal.'
      : n >= 2 ? `${n === 2 ? 'Segunda noite má seguida' : `${EXTENSO[n]} noites más seguidas`}.` : 'Dormiste mal.';
    let resto;
    if (provaFeita) resto = 'Esta noite, depois da prova, o sono é o que mais recupera.';
    else if (vespera) resto = 'Esta noite deita-te cedo. Se os nervos não te deixarem dormir, não estraga a corrida.';
    else if (treino) resto = n >= 2 ? 'Hoje não se força nada, e esta noite deitas-te mais cedo.'
      : `Hoje não se força nada${dia?.corrida ? ', nem se olha para o relógio' : ''}.`;
    else if (descanso) resto = n >= 2 ? 'Ainda bem que hoje é descanso. Esta noite, cama mais cedo.' : 'Ainda bem que hoje é descanso.';
    else resto = 'Esta noite deitas-te mais cedo.';
    return { mood: 'worried', tone: 'coach', text: `${abertura} ${resto}` };
  }
  if (stress != null && stress >= 4) {
    if (prova) return { mood: 'neutral', tone: 'coach', text: 'Nervos de dia de prova. São sinal de que isto te importa, e o aquecimento acalma-os.' };
    const resto = treino ? 'O treino de hoje faz-se, mas sem puxar.'
      : descanso ? 'Hoje é descanso, e ainda bem.'
        : feito ? 'O treino já está feito. O resto do dia é para abrandar.'
          : 'Hoje não se soma mais nada em cima dele.';
    return { mood: 'neutral', tone: 'coach', text: `O stress também pesa como carga. ${resto}` };
  }

  // 2. O raro: uma sequência redonda — mas não por cima de um dia em baixo.
  const seguidos = checkinStreak(checkins, today);
  if (MARCOS.has(seguidos) && dor === 0 && !(energia != null && energia <= 2)) {
    return { mood: 'happy', tone: 'coach', text: MARCOS.get(seguidos) };
  }

  // 3. O que mudou para melhor.
  if (ontem && num(ontem.sleep) != null && num(ontem.sleep) <= 2 && sono != null && sono >= 4 && dor === 0 && !(energia != null && energia <= 2)) {
    return { mood: 'happy', tone: 'coach', text: 'Melhor do que ontem. Era disto que precisavas.' };
  }
  if (energia === 5 && sono != null && sono >= 4 && dor === 0) {
    const resto = prova ? 'Para dia de prova, melhor não podia ser.'
      : vespera && !treino ? 'Guarda-a para amanhã.'
        : treino ? 'O treino de hoje apanha-te no dia certo.'
          : descanso ? 'Hoje descansas na mesma: guarda-a para o próximo treino.'
            : feito ? 'E o treino de hoje já está feito.'
              : 'Bom sinal.';
    return { mood: 'happy', tone: 'coach', text: `Energia em cheio e sono em dia. ${resto}` };
  }
  if (energia != null && energia <= 2 && vida) {
    return { mood: 'neutral', tone: 'coach', text: `Energia em baixo durante a recuperação ${vida.da} é normal. Hoje, sem pressas.` };
  }
  if (energia != null && energia <= 2) {
    const text = prova ? 'Energia em baixo ao acordar é comum no dia da prova. O aquecimento muda isso.'
      : provaFeita ? 'Energia em baixo. Depois da prova, o resto do dia é para recuperar.'
        : treino ? 'Energia em baixo. O treino de hoje faz-se leve, sem provar nada a ninguém.'
          : descanso ? 'Energia em baixo. Hoje é descanso, e é disso que precisas.'
            : feito ? 'Energia em baixo, e o treino de hoje já está feito. O resto do dia é para recuperar.'
              : 'Energia em baixo. Não é dia de provar nada a ninguém.';
    return { mood: 'neutral', tone: 'coach', text };
  }
  if (dor > 0) {
    return { mood: 'neutral', tone: 'coach', text: `Uma dor ligeira${noLocal}. Fica anotada; se subir, diz-me.` };
  }

  // 4. O dia normal: curto — é a centésima vez —, mas não seco (pedido
  // 2026-09-26: cordial, com energia), e diferente de um dia para o outro.
  // O dia da prova, a véspera e a recuperação não são dias normais.
  if (prova) return { mood: 'neutral', tone: 'coach', text: 'Obrigada. Hoje é dia de prova: vamos a isso.' };
  if (provaFeita) return { mood: 'neutral', tone: 'coach', text: 'Obrigada. Hoje foi dia de prova, e quero saber tudo.' };
  if (vespera) return { mood: 'neutral', tone: 'coach', text: 'Obrigada. Amanhã é dia de prova: hoje, pernas leves e cabeça tranquila.' };
  if (vida) return { mood: 'neutral', tone: 'coach', text: `Obrigada. Um dia de cada vez na recuperação ${vida.da}.` };
  return { mood: 'neutral', tone: 'coach', text: pelaData(DIA_NORMAL, today) };
}

/* O dia normal, dito de três maneiras — a frase muda de um dia para o
   outro e fica igual durante o dia, como nas boas-vindas. */
export const DIA_NORMAL = ['Anotado. Dia normal, e isso é bom sinal.', 'Obrigada. Tudo dentro do normal: é seguir.', 'Anotado. Nada a assinalar, e ainda bem.'];
const pelaData = (lista, iso) => lista[Math.abs(Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86400000)) % lista.length];
