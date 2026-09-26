/* O percentil do atleta dentro do segmento — função pura (gamificação,
   Fase 5, ecrã "Onde estás").

   O servidor publica, por segmento (escalão × género × modalidade × janela),
   19 fronteiras de ventil: a 1.ª é o 5.º percentil, a 10.ª a mediana, a 19.ª
   o 95.º. Aqui só se conta quantas dessas fronteiras o atleta já passou.
   Nada disto fala com a rede e nada disto sabe quem é ninguém: recebe um
   número e um array.

   Espelha supabase/functions/_shared/formulas/percentileSegments.ts, que é
   quem CALCULA as fronteiras; a contagem de ventis vem de lá. */
import {
  AGE_BANDS_BY_GENDER,
  counterpartBand,
  neighbourSegments,
  PERCENTILE_CEILING,
  PERCENTILE_FLOOR,
  percentileFrom,
  VENTILE_COUNT,
} from '@formulas/percentileSegments.ts';

/* A faixa 5–95 e o próprio percentil vivem em @formulas/percentileSegments.ts
   desde 2026-09-25: a Carol passou a dizer o percentil ao próprio atleta, e o
   servidor tem de contar exatamente como este ecrã conta. */
export { PERCENTILE_CEILING, PERCENTILE_FLOOR, percentileFrom };

/** Quantas fronteiras há: os ventis, 5% a 95%. */
export { VENTILE_COUNT };

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

function validBoundaries(boundaries) {
  return Array.isArray(boundaries) && boundaries.length === VENTILE_COUNT && boundaries.every(isNum);
}

/** true quando o percentil foi truncado — a UI diz "ou mais"/"ou menos" em
 *  vez de fingir um número exato que não tem. */
export function isTruncated(percentile) {
  return percentile === PERCENTILE_FLOOR || percentile === PERCENTILE_CEILING;
}

/** A mediana do segmento (10.ª fronteira) e o patamar dos 10% do topo (18.ª).
 *  São as duas barras de comparação do cartão "Como se lê". */
export function segmentMedian(boundaries) {
  return validBoundaries(boundaries) ? Number(boundaries[9]) : null;
}
export function segmentTopDecile(boundaries) {
  return validBoundaries(boundaries) ? Number(boundaries[17]) : null;
}

/* A curva da distribuição: entre duas fronteiras há sempre 5% das pessoas, por
   isso quanto mais juntas estão, mais gente ali cabe. A densidade é o inverso
   da distância — é o desenho de uma curva de distribuição feito só com o que
   o segmento publica, sem histograma nenhum (um histograma com contagens por
   caixa era, outra vez, gente a ser contada). */
export function densityCurve(boundaries) {
  if (!validBoundaries(boundaries)) return [];
  const nums = boundaries.map(Number);
  const larguras = [];
  for (let i = 1; i < nums.length; i++) larguras.push(Math.max(nums[i] - nums[i - 1], 0.1));
  const maxDensidade = Math.max(...larguras.map((l) => 1 / l));
  return larguras.map((largura, i) => ({
    // O ponto fica a meio das duas fronteiras que o geraram.
    x: (nums[i] + nums[i + 1]) / 2,
    // 0..1, para a altura da curva.
    y: (1 / largura) / maxDensidade,
    percentile: (i + 1) * 5 + 5,
  }));
}

/* ── Os segmentos ─────────────────────────────────────────────────────────── */

// Os escalões por género e o equivalente no outro género vivem em
// @formulas/percentileSegments.ts (o servidor usa os mesmos vizinhos).
export { AGE_BANDS_BY_GENDER, counterpartBand };

export const AGE_BAND_LABELS = {
  sub23: 'até aos 22',
  '23-34': 'dos 23 aos 34',
  M35: 'M35', F35: 'F35',
  M40: 'M40', F40: 'F40',
  M45: 'M45', F45: 'F45',
  'M50+': 'M50+', 'F50+': 'F50+',
};

export const TERRAIN_LABELS = { estrada: 'estrada', trail: 'trail' };
export const GENDER_LABELS = { F: 'feminino', M: 'masculino' };

/** A linha do tamanho do segmento. Nunca o `n` exato — o servidor nem o
 *  chega a enviar (ver os GRANTs por coluna da migração). */
export const N_BAND_LABELS = {
  '20-49': 'entre 20 e 49 atletas neste segmento',
  '50-199': 'entre 50 e 199 atletas neste segmento',
  '200+': '200 ou mais atletas neste segmento',
};

const DIAS_SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** "terça, 29 set" — o dia da próxima atualização da média, como o ecrã o diz.
 *  A data vem de nextPublicationDate (@formulas/percentileSegments.ts). Na
 *  madrugada do próprio dia (antes do cron), é "hoje, de manhã". */
export function formatPublicationDate(iso, hojeISO = null) {
  if (!iso) return '';
  if (hojeISO && iso === hojeISO) return 'hoje, de manhã';
  const d = new Date(`${iso}T00:00:00Z`);
  return `${DIAS_SEMANA[d.getUTCDay()]}, ${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`;
}

export function ageBandLabel(band) {
  return AGE_BAND_LABELS[band] || band || '';
}

/** O escalão com o género quando o nome não o traz: "M35" já diz tudo, mas
 *  "dos 23 aos 34" é igual nos dois — e a opção "o escalão dos 23 aos 34" no
 *  outro género lia-se como o escalão em que o atleta já estava. */
export function ageBandWithGender(band, gender) {
  if ((band === 'sub23' || band === '23-34') && GENDER_LABELS[gender]) return `${GENDER_LABELS[gender]} ${ageBandLabel(band)}`;
  return ageBandLabel(band);
}

/** "o escalão M35, em estrada" — o segmento por extenso, para as frases do
 *  ecrã. Antes: "para dos 23 aos 34 em estrada". */
export function segmentPhrase({ ageBand, gender, terrain } = {}) {
  if (!ageBand) return '';
  const modalidade = TERRAIN_LABELS[terrain] || terrain;
  return `o escalão ${ageBandWithGender(ageBand, gender)}${modalidade ? `, em ${modalidade}` : ''}`;
}

export function sameSegment(a, b) {
  return !!a && !!b && a.ageBand === b.ageBand && a.gender === b.gender && a.terrain === b.terrain;
}


/* SEGMENTO PEQUENO — o que se oferece quando não há snapshot.
   Por ordem: largar a modalidade, alargar o escalão, largar o género. Cada
   passo é um segmento CONCRETO e DITO POR EXTENSO: a app nunca troca o
   denominador em silêncio para ter um número bonito para mostrar. Quem lê tem
   de saber sempre contra quem se está a comparar — se o passo seguinte é
   "os do escalão ao lado", o ecrã diz "os do escalão ao lado".

   Não há segmentos "todos" na base de dados, e é de propósito: uma linha
   agregada por cima de vários segmentos seria uma segunda publicação dos
   mesmos dados com outro recorte, e é entre dois recortes do mesmo universo
   que a diferença entrega o indivíduo. Alargar aqui é MUDAR de segmento,
   não fundir segmentos. */
export function widerSegments(own) {
  // Os segmentos vêm de @formulas (neighbourSegments) — os mesmos que o
  // servidor usa para decidir o aviso "já há dados ao lado do teu". Aqui só
  // se lhes dá nome.
  return neighbourSegments(own || {}).map(({ step, segment }) => {
    if (step === 'modalidade') {
      return {
        step, segment,
        label: `Quem prepara provas de ${TERRAIN_LABELS[segment.terrain]}`,
        detail: `Mesmo escalão, mas a modalidade muda — ${TERRAIN_LABELS[segment.terrain]} em vez de ${TERRAIN_LABELS[own.terrain]}.`,
      };
    }
    if (step === 'escalao') {
      return {
        step, segment,
        label: `O escalão ${ageBandLabel(segment.ageBand)}`,
        detail: 'O escalão ao lado do teu, na mesma modalidade.',
      };
    }
    return {
      step, segment,
      label: `O escalão ${ageBandWithGender(segment.ageBand, segment.gender)}`,
      detail: `O escalão ${GENDER_LABELS[segment.gender]} da tua idade, na mesma modalidade.`,
    };
  });
}

/** "Cumpres mais do plano que 70% dos atletas M40 que preparam provas de
 *  estrada" — a frase do cartão, num sítio só. */
export function percentileSentence(percentile, { ageBand, terrain }) {
  if (percentile == null) return null;
  const escalao = ageBandLabel(ageBand);
  const modalidade = TERRAIN_LABELS[terrain] || terrain;
  const quantos = percentile === PERCENTILE_CEILING ? '95% ou mais'
    : percentile === PERCENTILE_FLOOR ? '5% ou menos'
      : `${percentile}%`;
  return `Cumpres mais do plano que ${quantos} dos atletas ${escalao} que preparam provas de ${modalidade}`;
}

/* O nome abreviado das tabelas: primeiro nome + inicial do último.
   "Rui Pedro Mariano" → "Rui M.". É o máximo que sai — nunca o nome
   completo, nunca o email. Um nome só fica como está; sem nome, nada. */
/* A versão do texto de "Entrar nas tabelas", gravada com cada decisão no
   livro de consentimentos (privacy_consents.policy_version). Sobe sempre que
   o texto que o atleta lê mudar. v2 (2026-09-22, bug #43): o mesmo conteúdo
   em linguagem simples. É também o valor por omissão de setPrivacyConsent,
   para uma chamada sem versão nunca gravar um texto que já não existe. */
// v3 (2026-09-25): as tabelas passaram a existir — o top 10 de cada escalão
// por quinzena, e só as vê quem aparece nelas. O texto diz isso agora.
export const TABELAS_POLICY_VERSION = 'v3';

export function shortDisplayName(full) {
  const partes = String(full || '').trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return '';
  if (partes.length === 1) return partes[0];
  return `${partes[0]} ${partes[partes.length - 1][0].toUpperCase()}.`;
}
