/* O percentil do atleta dentro do segmento — função pura (gamificação,
   Fase 5, ecrã "Onde estás").

   O servidor publica, por segmento (escalão × género × modalidade × janela),
   19 fronteiras de ventil: a 1.ª é o 5.º percentil, a 10.ª a mediana, a 19.ª
   o 95.º. Aqui só se conta quantas dessas fronteiras o atleta já passou.
   Nada disto fala com a rede e nada disto sabe quem é ninguém: recebe um
   número e um array.

   Espelha supabase/functions/_shared/formulas/percentileSegments.ts, que é
   quem CALCULA as fronteiras; a contagem de ventis vem de lá. */
import { VENTILE_COUNT } from '@formulas/percentileSegments.ts';

/* A faixa 5–95, e a truncatura é de propósito.
   "Estás no 100.º percentil" não descreve o atleta: descreve toda a gente que
   está abaixo dele — e num segmento de 20 pessoas o 100.º percentil é uma
   pessoa só, identificável por quem esteja atento. O mesmo em baixo: o 0.º
   percentil não é um número, é um dedo apontado. Por isso os extremos
   dizem-se "5% ou menos" / "95% ou mais", e o número nunca sai daqui. */
export const PERCENTILE_FLOOR = 5;
export const PERCENTILE_CEILING = 95;

/** Quantas fronteiras há: os ventis, 5% a 95%. */
export { VENTILE_COUNT };

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

function validBoundaries(boundaries) {
  return Array.isArray(boundaries) && boundaries.length === VENTILE_COUNT && boundaries.every(isNum);
}

/**
 * O percentil do atleta, truncado à faixa 5–95.
 * @param {number} value  o índice do atleta (0-100)
 * @param {number[]} boundaries  as 19 fronteiras de ventil do segmento
 * @returns {number|null} 5..95 em degraus de 5, ou null sem segmento válido
 */
export function percentileFrom(value, boundaries) {
  const nums = Array.isArray(boundaries) ? boundaries.map(Number) : null;
  if (!isNum(value) || !validBoundaries(nums)) return null;
  const passadas = nums.filter((b) => value >= b).length;
  return Math.min(PERCENTILE_CEILING, Math.max(PERCENTILE_FLOOR, passadas * 5));
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

export const AGE_BANDS_BY_GENDER = {
  M: ['sub23', '23-34', 'M35', 'M40', 'M45', 'M50+'],
  F: ['sub23', '23-34', 'F35', 'F40', 'F45', 'F50+'],
};

export const AGE_BAND_LABELS = {
  sub23: 'até aos 22',
  '23-34': 'dos 23 aos 34',
  M35: 'M35', F35: 'F35',
  M40: 'M40', F40: 'F40',
  M45: 'M45', F45: 'F45',
  'M50+': 'M50+', 'F50+': 'F50+',
};

export const TERRAIN_LABELS = { estrada: 'estrada', trail: 'trail' };
export const GENDER_LABELS = { F: 'femininos', M: 'masculinos' };

/** A linha do tamanho do segmento. Nunca o `n` exato — o servidor nem o
 *  chega a enviar (ver os GRANTs por coluna da migração). */
export const N_BAND_LABELS = {
  '20-49': 'entre 20 e 49 atletas neste segmento',
  '50-199': 'entre 50 e 199 atletas neste segmento',
  '200+': '200 ou mais atletas neste segmento',
};

export function ageBandLabel(band) {
  return AGE_BAND_LABELS[band] || band || '';
}

/** O escalão equivalente no outro género — sub23 e 23-34 não têm letra. */
export function counterpartBand(band, gender) {
  if (band === 'sub23' || band === '23-34') return band;
  return `${gender}${String(band).slice(1)}`;
}

const otherGender = (g) => (g === 'F' ? 'M' : 'F');
const otherTerrain = (t) => (t === 'estrada' ? 'trail' : 'estrada');

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
export function widerSegments({ ageBand, gender, terrain }) {
  if (!ageBand || !gender || !terrain) return [];
  const bands = AGE_BANDS_BY_GENDER[gender] || [];
  const i = bands.indexOf(ageBand);
  const vizinhos = [bands[i - 1], bands[i + 1]].filter(Boolean);
  const outroGenero = otherGender(gender);

  return [
    {
      step: 'modalidade',
      segment: { ageBand, gender, terrain: otherTerrain(terrain) },
      label: `Quem prepara provas de ${TERRAIN_LABELS[otherTerrain(terrain)]}`,
      detail: `Mesmo escalão, mas a modalidade muda — ${TERRAIN_LABELS[otherTerrain(terrain)]} em vez de ${TERRAIN_LABELS[terrain]}.`,
    },
    ...vizinhos.map((band) => ({
      step: 'escalao',
      segment: { ageBand: band, gender, terrain },
      label: `O escalão ${ageBandLabel(band)}`,
      detail: `O escalão ao lado do teu, na mesma modalidade.`,
    })),
    {
      step: 'genero',
      segment: { ageBand: counterpartBand(ageBand, outroGenero), gender: outroGenero, terrain },
      label: `O escalão ${ageBandLabel(counterpartBand(ageBand, outroGenero))}`,
      detail: `Os atletas ${GENDER_LABELS[outroGenero]} da tua idade, na mesma modalidade.`,
    },
  ];
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
export const TABELAS_POLICY_VERSION = 'v2';

export function shortDisplayName(full) {
  const partes = String(full || '').trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return '';
  if (partes.length === 1) return partes[0];
  return `${partes[0]} ${partes[partes.length - 1][0].toUpperCase()}.`;
}
