/* A Carol reage ao que o atleta responde no arranque.

   CAROL.md: "uma treinadora tem memória, tem opinião e reage ao que
   aconteceu". No arranque isso quer dizer que a nota de cada passo deixa de
   ser um texto fixo assim que há uma resposta — passa a ser o que ELA acha
   dessa resposta. É o primeiro sinal de que do outro lado há alguém a ler.

   Regras de voz (CAROL.md §2 e "O que evitar"): afirma, não suaviza; sem
   emojis, sem pontos de exclamação, sem frases de manual; e nada que ela
   ainda não saiba — a viabilidade da prova, por exemplo, só se calcula com a
   prova gravada (ver o comentário de `notaProva` em Onboarding.jsx).

   Cada função devolve `{ text, mood }` ou null (fica a nota por omissão do
   passo). `mood` segue CAROL.md §4: neutral, happy ou worried. */

const num = (v) => {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
// Os números na boca dela vão em português: 35,5 e não 35.5.
const pt = (n) => String(n).replace('.', ',');
const POR_EXTENSO = { 2: 'As duas', 3: 'As três', 4: 'As quatro' };

/** O primeiro nome, para ela tratar o atleta por ele. */
export function firstName(displayName) {
  const nome = String(displayName || '').trim().split(/\s+/)[0] || '';
  return nome.length > 24 ? '' : nome;
}

/* ── 3 · o objetivo ─────────────────────────────────────────────────────── */

const SOBRE_OBJETIVO = {
  prova: { mood: 'happy', text: 'Com uma data marcada, cada semana tem uma função. Daqui a três passos pergunto-te qual é.' },
  ritmo: { mood: 'neutral', text: 'Correr mais rápido começa por correr devagar a maior parte do tempo. Vais estranhar ao início. É de propósito.' },
  saude: { mood: 'neutral', text: 'Então a regularidade conta mais do que qualquer treino. Prefiro três corridas por semana que duram o ano a cinco que duram um mês.' },
  regresso: { mood: 'worried', text: 'Voltar é quando mais gente se lesiona: a cabeça lembra-se do ritmo antigo, as pernas não. Começamos abaixo do que achas que aguentas.' },
};

export function reactToGoal(draft) {
  return SOBRE_OBJETIVO[draft?.goal] || null;
}

/* ── 4 · como corres ────────────────────────────────────────────────────── */

export function reactToRunning(draft) {
  const km = num(draft?.weekly_km);
  const dias = num(draft?.days_per_week);
  const nivel = draft?.experience_level;

  // Primeiro o que preocupa — é isso que uma treinadora diz primeiro.
  if (dias != null && dias >= 7) {
    return { mood: 'worried', text: 'Sete dias por semana não deixa espaço para recuperar, e é na recuperação que o treino rende. Vou propor-te pelo menos um de descanso.' };
  }
  if (nivel === 'iniciante' && km != null && km >= 35) {
    return { mood: 'worried', text: `${pt(km)} km por semana com menos de um ano a correr é muito. Guardo o número, mas confirmo-o com as tuas primeiras corridas antes de construir em cima dele.` };
  }
  if (km != null && dias != null && dias > 0 && km / dias >= 25) {
    return { mood: 'neutral', text: `Dá ${Math.round(km / dias)} km por saída, em média. São saídas longas. Vou olhar para elas antes de te pedir mais volume.` };
  }

  if (nivel === 'avancado') {
    return { mood: 'happy', text: 'Então já sabes o que é um bloco e uma semana de descarga. Vou falar contigo nessa língua.' };
  }
  if (nivel === 'medio') {
    return { mood: 'neutral', text: 'Dá para misturar séries com rodagens longas. Começo pela semana que já fazes e só depois mexo.' };
  }
  if (nivel === 'iniciante') {
    return { mood: 'neutral', text: 'A base primeiro. Nas primeiras semanas vais achar que é fácil demais. É assim que se chega à décima sem dores.' };
  }
  return null;
}

/* ── 5 · como comes ─────────────────────────────────────────────────────── */

const SOBRE_RESTRICAO = {
  vegano: 'Vegano, anotado. Vou estar atenta à proteína e à B12, que é onde um plano vegano de corrida costuma falhar.',
  vegetariano: 'Vegetariano, anotado. Nas sugestões, a proteína passa a vir dos ovos, dos lacticínios e das leguminosas.',
  sem_gluten: 'Sem glúten, anotado. O pão e a massa das sugestões dão lugar ao arroz, à batata e à aveia sem glúten.',
  sem_lactose: 'Sem lactose, anotado. O leite e os iogurtes das sugestões passam a ser sem lactose ou vegetais.',
};
const ORDEM = ['vegano', 'vegetariano', 'sem_gluten', 'sem_lactose'];

export function reactToFood(draft) {
  const ativas = ORDEM.filter((k) => (draft?.dietary_restrictions || []).includes(k));
  const notas = String(draft?.dietary_notes || '').trim();

  if (ativas.length > 1) {
    return { mood: 'neutral', text: `${POR_EXTENSO[ativas.length] || 'Todas'} ficam como regra. Nenhuma sugestão minha vai falhar uma delas${notas ? ', nem o que escreveste por baixo' : ''}.` };
  }
  if (ativas.length === 1) {
    return { mood: 'neutral', text: SOBRE_RESTRICAO[ativas[0]] };
  }
  if (notas) {
    return { mood: 'neutral', text: 'Anotado. O que escreves aqui pesa tanto como os botões lá em cima.' };
  }
  return null;
}

/* ── 6 · a prova ────────────────────────────────────────────────────────── */

/** Só o caso em que ela tem mesmo de avisar: pouco tempo. O resto fica com a
 *  nota que conta as semanas (Onboarding.jsx), que já reage à data. */
export function reactToRace(draft, semanas) {
  const temProva = String(draft?.race_name || '').trim() && draft?.race_date && num(draft?.race_distance_km);
  if (!temProva || semanas == null) return null;
  if (semanas < 4) {
    return { mood: 'worried', text: `Com ${semanas === 0 ? 'menos de uma semana' : semanas === 1 ? 'uma semana' : `${semanas} semanas`} não dá para construir forma nova. Dá para lá chegares fresco, e é nisso que o plano se vai concentrar.` };
  }
  return null;
}
