/* O que a Carol sabe da vida do atleta, para o dizer na altura certa
   (pedido 2026-09-26).

   "Ela tem conhecimento disso": a Carol regista na memória dela
   (coach_notes) o que o atleta lhe conta no chat — por exemplo, "Cirurgia a
   rutura do bíceps direito a 2026-09-25; paragem de corrida de pelo menos 2
   semanas no pós-operatório.". As frases fixas da app não liam essa
   memória: às 03:53 da noite a seguir à cirurgia, as boas-vindas mandavam
   dormir como em qualquer outra noite, e de manhã não perguntavam como
   tinha corrido. Uma treinadora que sabe que o atleta foi operado ontem
   pergunta por isso antes de tudo o resto.

   Aqui procura-se na memória um acontecimento com data — uma cirurgia, uma
   lesão, uma doença — e diz-se, conforme o dia e a hora, o que ela diria:
   na véspera, no próprio dia, nos dias a seguir e durante a recuperação.

   Nunca inventa: sem uma data escrita na nota e uma palavra que diga o que
   foi, não há acontecimento. Puro, para os testes. */

const dayIndex = (iso) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86400000);

/* O que foi. `recupera`: os dias em que ela continua a falar disso, quando a
   nota não diz quanto tempo é (a nota manda: "pelo menos 2 semanas"). A
   cirurgia vem antes da lesão: "cirurgia a rutura do bíceps" é uma cirurgia. */
const TIPOS = [
  { tipo: 'cirurgia', re: /cirurgi|operad[oa](?!\p{L})|opera[çc][ãa]o|interven[çc][ãa]o cir[uú]rgica/iu, recupera: 14 },
  { tipo: 'lesao', re: /les[ãa]o|fratura|entorse|rutura|ruptura|rotura|distens|tendinite/iu, recupera: 10 },
  { tipo: 'doenca', re: /gripe|febre|covid|constipa|doente|virose|infe[çc][ãa]o/iu, recupera: 5 },
];

/* A parte do corpo, dita como se diz ("o braço", e não "o bíceps direito").
   Sem \b: o \b do JavaScript não conhece o "ã" nem o "é". */
const L = '(?<!\\p{L})';
const R = '(?!\\p{L})';
const PARTES = [
  [new RegExp(`${L}(b[ií]ceps|tr[ií]ceps|bra[çc]o)${R}`, 'iu'), 'o braço'],
  [new RegExp(`${L}ombro${R}`, 'iu'), 'o ombro'],
  [new RegExp(`${L}cotovelo${R}`, 'iu'), 'o cotovelo'],
  [new RegExp(`${L}(pulso|punho)${R}`, 'iu'), 'o pulso'],
  [new RegExp(`${L}m[ãa]o${R}`, 'iu'), 'a mão'],
  [new RegExp(`${L}(joelho|menisco|cruzado)${R}`, 'iu'), 'o joelho'],
  [new RegExp(`${L}tornozelo${R}`, 'iu'), 'o tornozelo'],
  [new RegExp(`${L}aquiles${R}`, 'iu'), 'o tendão de Aquiles'],
  [new RegExp(`${L}(pé|fascite plantar)${R}`, 'iu'), 'o pé'],
  [new RegExp(`${L}anca${R}`, 'iu'), 'a anca'],
  [new RegExp(`${L}(lombar|costas)${R}`, 'iu'), 'as costas'],
  [new RegExp(`${L}g[ée]meos?${R}`, 'iu'), 'o gémeo'],
];

const SEMANAS = { uma: 1, duas: 2, 'três': 3, tres: 3, quatro: 4, cinco: 5, seis: 6, oito: 8 };

/** A data do acontecimento escrita na nota: "2026-09-25" (como ela as
 *  escreve) ou "25/09/2026". Com mais do que uma ("retoma a 2026-10-09,
 *  depois da cirurgia de 2026-09-25"), a mais perto da palavra que diz o que
 *  foi. */
function dataDaNota(texto, onde = 0) {
  const datas = [];
  for (const m of texto.matchAll(/(\d{4})-(\d{2})-(\d{2})/g)) datas.push({ i: m.index, iso: `${m[1]}-${m[2]}-${m[3]}` });
  for (const m of texto.matchAll(/(?<!\d)(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?!\d)/g)) {
    datas.push({ i: m.index, iso: `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` });
  }
  if (!datas.length) return null;
  datas.sort((x, y) => Math.abs(x.i - onde) - Math.abs(y.i - onde));
  return datas[0].iso;
}

/* "Chegar à maratona sem lesões", "evitar lesões", "prevenir uma lesão":
   a palavra está lá, o acontecimento não. */
const NEGA = /(?<!\p{L})(sem|evitar|evita|prevenir|previne|preven[çc][ãa]o|risco)(?!\p{L})[^.;]{0,20}$/iu;

/** Quantos dias de recuperação a nota diz ("2 semanas", "duas semanas", "10 dias"). */
function recuperacaoDaNota(texto) {
  const sem = texto.match(/(\d+|uma|duas|três|tres|quatro|cinco|seis|oito)\s+semanas?/iu);
  if (sem) return (Number(sem[1]) || SEMANAS[sem[1].toLowerCase()] || 0) * 7 || null;
  const dias = texto.match(/(\d+)\s+dias/iu);
  return dias ? Number(dias[1]) : null;
}

/** Como se diz o acontecimento: { a: 'a cirurgia', da: 'da cirurgia' }. */
function nomeDe(tipo, texto) {
  if (tipo === 'cirurgia') return /opera/iu.test(texto) && !/cirurgi/iu.test(texto) ? { a: 'a operação', da: 'da operação' } : { a: 'a cirurgia', da: 'da cirurgia' };
  if (tipo === 'lesao') return { a: 'a lesão', da: 'da lesão' };
  if (/gripe/iu.test(texto)) return { a: 'a gripe', da: 'da gripe' };
  if (/covid/iu.test(texto)) return { a: 'a covid', da: 'da covid' };
  return { a: 'a doença', da: 'da doença' };
}

/**
 * O acontecimento da vida do atleta que interessa hoje, ou null.
 * `notes`: as linhas de coach_notes ({ category, note }); `hoje`: 'YYYY-MM-DD' (Lisboa).
 * Devolve { tipo, data, dias (hoje − data), recupera, a, da, parte, nota }.
 * Conta da véspera (só uma cirurgia se marca com antecedência) até ao fim da
 * recuperação; havendo mais do que um, o mais perto de hoje.
 */
export function eventoDaVida(notes, hoje) {
  if (!hoje) return null;
  const eventos = [];
  for (const n of notes || []) {
    const texto = String(n?.note || '').trim();
    if (!texto) continue;
    const t = TIPOS.find((x) => x.re.test(texto));
    if (!t) continue;
    const onde = texto.search(t.re);
    if (NEGA.test(texto.slice(0, onde))) continue;
    const data = dataDaNota(texto, onde);
    if (!data) continue;
    const dias = dayIndex(hoje) - dayIndex(data);
    const recupera = recuperacaoDaNota(texto) || t.recupera;
    if (dias < (t.tipo === 'cirurgia' ? -1 : 0) || dias > recupera) continue;
    const parte = PARTES.find(([re]) => re.test(texto))?.[1] || null;
    eventos.push({ tipo: t.tipo, data, dias, recupera, ...nomeDe(t.tipo, texto), parte, nota: texto });
  }
  eventos.sort((x, y) => Math.abs(x.dias) - Math.abs(y.dias) || y.dias - x.dias);
  return eventos[0] || null;
}

const maiuscula = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/**
 * O que ela diz sobre o acontecimento, como um conjunto de frases (a frase
 * escolhe-se pelo dia, como as outras), ou null quando não há nada a dizer.
 * `momento`: 'dia' (manhã, tarde, noite) | 'sono' (a madrugada, a mandar
 * dormir); `depoisDaMeiaNoite` só conta no sono.
 *
 * Voz de CAROL.md, com o pedido de 2026-09-26: cordial, empática e com
 * energia — sem exclamações, sem adjetivos com género, e sem prometer nada
 * sobre a cirurgia ("vai correr bem") que ela não sabe.
 */
export function frasesDaVida(evento, { momento = 'dia', variant = 'manha', depoisDaMeiaNoite = false, jaFalouHoje = false } = {}) {
  if (!evento) return null;
  const { tipo, dias, a, da, parte, recupera } = evento;
  const cirurgia = tipo === 'cirurgia';
  const doenca = tipo === 'doenca';

  if (momento === 'sono') {
    // Depois da meia-noite, "amanhã" é ambíguo para quem ainda não dormiu:
    // a véspera só se diz antes dela.
    if (dias === -1) return depoisDaMeiaNoite ? null : [`Amanhã é ${a}. Vai dormir: uma noite bem dormida ajuda mais do que parece.`];
    // No dia da cirurgia não se sabe a hora dela (a do atleta foi à noite):
    // nada de "correu" nem de "foi" antes de ele o dizer.
    if (dias === 0 && cirurgia) {
      if (depoisDaMeiaNoite) return [`Hoje é o dia ${da}. Vai dormir, que é disso que o corpo precisa.`];
      return [`Hoje é o dia ${da}, e penso em ti. Descansa assim que puderes, e depois conta-me como correu.`];
    }
    // A primeira noite depois da cirurgia — o caso das 03:53 de 2026-09-26.
    if (dias === 1 && cirurgia && depoisDaMeiaNoite) {
      return [`Acabaste de passar por ${a === 'a operação' ? 'uma operação' : 'uma cirurgia'}: o que o corpo mais pede agora é sono. Vai descansar, e de manhã contas-me como correu.`];
    }
    if (doenca) return ['Ainda estás a recuperar: dormir é o melhor que podes fazer agora. Vai deitar-te.'];
    return [
      parte ? `O corpo recupera a dormir, e ${parte} agradece. Vai deitar-te.` : 'A recuperação também se faz a dormir. Vai deitar-te.',
      `Cada noite bem dormida encurta a recuperação ${da}. Vai deitar-te.`,
    ];
  }

  /* Já perguntou hoje (numa saudação anterior do mesmo dia): não repete a
     pergunta — uma pessoa não pergunta "como correu?" de manhã e outra vez à
     tarde. Diz que continua atenta, sem pedir outra vez. */
  if (jaFalouHoje && dias <= 3) {
    if (dias === -1) return [`Amanhã é ${a}. Hoje, descanso e cabeça tranquila; estou contigo.`];
    if (dias === 0 && cirurgia) return [`Continuo a pensar em ti. Quando puderes, conta-me como correu ${a === 'a operação' ? 'a operação' : 'a cirurgia'}.`];
    if (doenca) return ['Espero que o dia esteja a correr melhor. Descansa o que puderes.'];
    if (dias === 1 && cirurgia) {
      return variant === 'noite'
        ? [`O primeiro dia depois ${da} está quase feito. Esta noite, descanso a sério.`]
        : [`No primeiro dia depois ${da}, o teu único treino é recuperar.`];
    }
    return [parte ? `${maiuscula(parte)} continua a recuperar. Hoje, paciência e descanso.` : 'Estou a acompanhar a tua recuperação, um dia de cada vez.'];
  }

  if (dias === -1) {
    return [
      `Amanhã é ${a}. Hoje, calma e descanso; depois conta-me como correu.`,
      `Amanhã é ${a}. Estou contigo nisto: quando puderes, dá-me notícias.`,
    ];
  }
  if (dias === 0) {
    // Também à noite no presente: a cirurgia pode ainda não ter sido.
    if (cirurgia) return [`Hoje é o dia ${da}. Penso em ti: quando puderes, dá-me notícias.`];
    return doenca ? ['Soube que não estás bem. Como te sentes agora?'] : [`Soube ${da}. Como está ${parte || 'isso'} agora?`];
  }
  if (dias === 1 && cirurgia) {
    return [`Como correu ${a}? Conta-me quando puderes.`, `Como estás depois ${da}? Quero saber como correu.`];
  }
  if (dias <= 3) {
    if (doenca) return ['Como te sentes hoje? Quero saber se já estás melhor.', 'Estás melhor? Conta-me como te sentes.'];
    return [
      `Como está ${parte || 'a recuperação'} hoje, depois ${da}?`,
      'Estou a acompanhar a tua recuperação. Como te sentes hoje?',
    ];
  }
  /* Na recuperação, uma linha de manhã: ela não se esqueceu. Só nas duas
     primeiras semanas — uma imobilização de seis semanas não é assunto de
     todas as manhãs (à noite e no check-in, a recuperação conta toda). */
  if (variant !== 'manha' || dias > Math.min(recupera, 14)) return null;
  return [
    `Continuamos na recuperação ${da}. Um dia de cada vez.`,
    parte ? `${maiuscula(parte)} ainda está a recuperar. Cada dia de paciência conta.` : 'A recuperação também é treino. Cada dia de paciência conta.',
    `A recuperação ${da} também é treino, e estou a acompanhá-la contigo.`,
  ];
}
