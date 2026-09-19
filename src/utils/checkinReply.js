/* A resposta da Carol ao check-in de hoje.

   O check-in é uma conversa de dez segundos, não um formulário: depois de o
   atleta dizer como acordou, ela responde — e a resposta fica no cartão do
   "Como estou" o resto do dia, em vez de um "Check-in guardado" que ninguém
   lê. Uma frase, na voz de CAROL.md: o que preocupa primeiro, afirma, sem
   emoji nem exclamação, e nada que ela não saiba.

   Tem de aguentar a centésima vez: um dia normal tem uma resposta curta e
   seca ("Anotado."), e o reconhecimento é raro — só quando há motivo (dormiu
   bem depois de noites más, energia em cheio, uma sequência redonda de
   check-ins). Puro, para os testes. */

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

const MARCOS = new Set([7, 14, 30, 60, 100, 200, 365]);
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

/**
 * { text, mood, tone } para o check-in de hoje, ou null sem check-in.
 * mood: neutral | happy | worried (CAROL.md §4); tone: coach | warn.
 */
export function checkinReply(checkins, today) {
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

  // 1. O que preocupa, primeiro.
  if (dor >= 4) {
    return { mood: 'worried', tone: 'warn', text: `Uma dor de ${dor}${noLocal} não se ignora. Hoje não se força, e quero falar contigo sobre ela.` };
  }
  if (sono != null && sono <= 2) {
    const outraVez = ontem && num(ontem.sleep) != null && num(ontem.sleep) <= 2;
    return { mood: 'worried', tone: 'coach', text: outraVez
      ? 'Segunda noite má seguida. Hoje o treino fica leve, e esta noite deitas-te mais cedo.'
      : 'Dormiste mal. Hoje o treino fica leve, sem olhar para o relógio.' };
  }
  if (stress != null && stress >= 4) {
    return { mood: 'neutral', tone: 'coach', text: 'O stress também pesa como carga. Hoje não somo mais nada em cima dele.' };
  }

  // 2. O raro: uma sequência redonda.
  const seguidos = checkinStreak(checkins, today);
  if (MARCOS.has(seguidos)) {
    return { mood: 'happy', tone: 'coach', text: `${seguidos} dias seguidos de check-in. Já começo a conhecer os teus dias.` };
  }

  // 3. O que mudou para melhor.
  if (ontem && num(ontem.sleep) != null && num(ontem.sleep) <= 2 && sono != null && sono >= 4) {
    return { mood: 'happy', tone: 'coach', text: 'Melhor do que ontem. Era disto que precisavas.' };
  }
  if (energia === 5 && sono != null && sono >= 4) {
    return { mood: 'happy', tone: 'coach', text: 'Energia em cheio e sono em dia. Se o plano de hoje tem qualidade, é hoje.' };
  }
  if (energia != null && energia <= 2) {
    return { mood: 'neutral', tone: 'coach', text: 'Energia em baixo. Não é dia de provar nada a ninguém.' };
  }
  if (dor > 0) {
    return { mood: 'neutral', tone: 'coach', text: `Uma dor ligeira${noLocal}. Fica anotada; se subir, diz-me.` };
  }

  // 4. O dia normal: curto e seco — é a centésima vez.
  return { mood: 'neutral', tone: 'coach', text: 'Anotado. Dia normal, plano normal.' };
}
