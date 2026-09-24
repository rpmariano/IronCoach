/* A geometria do rosto da Carol — só números, sem React, para o avatar
   (CoachAvatar.jsx) e os testes partilharem exatamente o mesmo desenho.

   Um retrato de traço simples dentro do disco ciano dela: linha escura,
   cara clara, bochechas coradas, e o cabelo escuro com estrutura — franja
   varrida em madeixas, fios de luz a marcar o sentido do cabelo, rabo-de-
   -cavalo alto com as pontas desfiadas. Só
   a cabeça: o pescoço sai pelo fundo do disco e os ombros nunca entram. As
   linhas do cabelo, do rabo-de-cavalo e do contorno são a "assinatura" —
   desenham-se quando ela aparece, e só depois o desenho ganha cor.

   Coordenadas: a cabeça vive em 0–100 (olhos a 55, queixo a 79); o
   enquadramento (frameFor) põe o queixo perto do fundo do disco.

   Cada emoção é um "rig": a posição de cada traço como uma curva quadrática
   (x1 y1, controlo, x2 y2) e a sua espessura, mais a inclinação da cabeça e
   o corado das bochechas. Todas as emoções têm a mesma forma de rig, por isso
   passar de uma para outra é interpolar números — os olhos fecham-se num
   arco, a boca abre-se, a cabeça inclina — em vez de trocar um desenho por
   outro. */

/* ── O retrato (fixo) ───────────────────────────────────────────────────── */

/** O pescoço: continua até sair do disco — nunca acaba à vista. */
export const NECK_FILL_PATH = 'M 43.8 72 L 56.2 72 L 56.8 112 L 43.2 112 Z';
export const NECK_PATH = 'M 44 76 L 43.4 112 M 56 76 L 56.6 112';

/** A cara: o preenchimento (o topo fica debaixo do cabelo) e a linha do
 *  maxilar. */
export const FACE_FILL_PATH = 'M 30.6 52 C 30.6 34, 39.5 27, 50 27 C 60.5 27, 69.4 34, 69.4 52 C 69.4 69.5, 59.5 79, 50 79 C 40.5 79, 30.6 69.5, 30.6 52 Z';
export const JAW_PATH = 'M 30.8 55 C 31.6 70.5, 41 79, 50 79 C 59 79, 68.4 70.5, 69.2 55';
export const EARS_PATH = 'M 31 53.6 C 25.8 52, 25.2 61.4, 31.4 62.2 M 69 53.6 C 74.2 52, 74.8 61.4, 68.6 62.2';

/** O cabelo: silhueta escura com estrutura. Desce dos lados até ao alto
 *  das orelhas e acaba numa franja varrida para a esquerda, em madeixas com
 *  pontas — todas acima das sobrancelhas, que dizem metade das emoções. */
export const HAIR_PATH =
  'M 30.4 55 C 25.4 44, 25.8 28.4, 35.6 20.6 C 43.6 14.4, 59.6 13.2, 69.2 20.6 ' +
  'C 76.8 26.6, 77 44, 69.8 55 L 68.8 55 C 68.6 49, 68.2 45, 67.6 41.6 ' +
  'L 66.6 38.4 L 64 43 L 62.4 36 ' +
  'C 58.4 37.6, 53 39.4, 48.4 41.8 C 49.4 39.6, 50.2 37.6, 50.6 35.4 ' +
  'C 45.4 38, 40.2 40.2, 36.2 43 C 36.8 40.6, 37.4 38.4, 38 36.2 ' +
  'C 35.4 38.6, 33 42, 31.6 46 C 31.2 49, 31.1 52, 31.2 55 Z';

/** Os fios de luz que dão estrutura ao cabelo: partem da risca e seguem o
 *  sentido das madeixas. */
export const HAIR_STRANDS_PATH =
  'M 58.6 17.6 C 54.4 24, 51 30, 49.2 37.4 ' +
  'M 57.6 17.4 C 49.6 20.6, 42.6 27, 39.4 35 ' +
  'M 60.8 18.6 C 64 24, 65.4 30, 65.4 36.4 ' +
  'M 40.6 19.4 C 34 24.8, 30.6 33.4, 30.2 43';

/** O rabo-de-cavalo: preso no alto, à direita, sobe um pouco e cai por trás
 *  da cabeça até à altura do queixo, com as pontas desfiadas. */
export const PONYTAIL_PATH =
  'M 60.6 16.8 C 64.6 10.6, 74.4 10, 80.2 16.2 C 86.8 23.4, 88.2 36.4, 86.2 48 ' +
  'L 88.6 55.6 L 83.8 52.6 L 84.6 62.6 L 79.8 56.4 L 78.4 65.2 ' +
  'C 76.2 56, 74.8 46.4, 73 38.4 C 71.2 30.4, 66.6 22.8, 60.6 16.8 Z';
/** O elástico: um laço claro, alongado, na base do rabo-de-cavalo. E os
 *  fios de luz do rabo-de-cavalo, a seguir a queda. */
export const PONYTAIL_TIE_PATH = 'M 60.4 20 C 61.6 15.4, 69.6 12.8, 73.2 16.6 C 70.6 16.4, 63.8 17.2, 60.4 20 Z';
export const PONYTAIL_STRANDS_PATH = 'M 66.4 15.8 C 74.4 16.4, 81.4 26, 82.8 40.4 M 72.8 21.6 C 77.4 29.6, 79.4 41.6, 79.8 54.2';

/** O nariz: um gancho curto — só nos tamanhos grandes. */
export const NOSE_PATH = 'M 50.6 58.6 Q 49.2 62.4 51.2 63.2';

/** As bochechas: [cx, cy, rx, ry]. A cor e a intensidade vêm do rig. */
export const CHEEKS = [
  [36.6, 62.8, 4.3, 2.6],
  [63.4, 62.8, 4.3, 2.6],
];

/* O brilho de "orgulhosa": três traços curtos a irradiar, no canto de cima.
   Branco, não âmbar — o âmbar é da prova, e um recorde de ginásio também a
   deixa orgulhosa. */
export const SHINE_PATHS = [
  'M 21.5 31 L 15.5 28',
  'M 24.5 23 L 20 17.5',
  'M 31.5 16.5 L 30 10',
];

/* Olhos abertos: um traço muito curto e grosso de pontas redondas — um ponto
   alongado. Fechados de alegria: um arco fino. Mesma curva, números
   diferentes, e é isso que deixa a transição ser contínua. */
const EYE_OPEN_L = [41.5, 53.8, 41.5, 55, 41.5, 56.2];
const EYE_OPEN_R = [58.5, 53.8, 58.5, 55, 58.5, 56.2];
const EYE_OPEN_W = 5.4;

const mirror = ([x1, y1, cx, cy, x2, y2]) => [100 - x2, y2, 100 - cx, cy, 100 - x1, y1];

/* Boca: lábio de cima e lábio de baixo, cada um uma quadrática entre os
   mesmos dois cantos. Iguais, é uma linha; afastados, é uma boca aberta
   (preenchida). */
function mouth(x1, y1, x2, y2, upperCy, lowerCy, cxShift = 0) {
  const cx = (x1 + x2) / 2 + cxShift;
  return { m: [x1, y1, cx, upperCy, x2, y2], lowerCy };
}

export const FACE_RIGS = {
  /* Por defeito: atenta, calma, um quase-sorriso. É a treinadora que está ali. */
  neutral: {
    tilt: 0,
    lift: 0,
    browL: [35.5, 46.6, 40.5, 44.6, 46, 45.8],
    browR: mirror([35.5, 46.6, 40.5, 44.6, 46, 45.8]),
    browW: 3.2,
    eyeL: EYE_OPEN_L,
    eyeR: EYE_OPEN_R,
    eyeW: EYE_OPEN_W,
    ...mouth(44, 67.6, 56, 67.6, 69.8, 69.8),
    mouthW: 3,
    blush: 0.5,
    shine: 0,
    blink: true,
  },
  /* Contente: sobrancelhas soltas, o sorriso abre-se um pouco. */
  happy: {
    tilt: 0,
    lift: -0.6,
    browL: [35.5, 45.4, 40.5, 42.8, 46, 44.4],
    browR: mirror([35.5, 45.4, 40.5, 42.8, 46, 44.4]),
    browW: 3.2,
    eyeL: [40.8, 54.2, 41.5, 53.2, 42.2, 54.2],
    eyeR: [57.8, 54.2, 58.5, 53.2, 59.2, 54.2],
    eyeW: 5.2,
    ...mouth(42.5, 66.2, 57.5, 66.2, 70.2, 73),
    mouthW: 3,
    blush: 0.85,
    shine: 0,
    blink: true,
  },
  /* Orgulhosa: olhos fechados em arco, boca aberta, o queixo sobe e o brilho
     acende. A expressão rara — recorde, prova, semana cumprida. */
  proud: {
    tilt: -2,
    lift: -1.4,
    browL: [35, 44.4, 40.5, 40.8, 46, 43],
    browR: mirror([35, 44.4, 40.5, 40.8, 46, 43]),
    browW: 3.2,
    eyeL: [37.6, 56, 41.5, 50.4, 45.4, 56],
    eyeR: [54.6, 56, 58.5, 50.4, 62.4, 56],
    eyeW: 3.1,
    ...mouth(41.5, 65.4, 58.5, 65.4, 66.2, 75),
    mouthW: 2.8,
    blush: 1,
    shine: 1,
    blink: false,
  },
  /* Preocupada: as pontas de dentro das sobrancelhas sobem, a boca desce.
     Séria, não assustada — ela chama, não alarma. */
  worried: {
    tilt: 0,
    lift: 0.4,
    browL: [35.5, 47.6, 41, 46.2, 46.2, 43.4],
    browR: mirror([35.5, 47.6, 41, 46.2, 46.2, 43.4]),
    browW: 3.2,
    eyeL: EYE_OPEN_L,
    eyeR: EYE_OPEN_R,
    eyeW: 5.2,
    ...mouth(44.2, 69.4, 55.8, 69.4, 66.8, 66.8),
    mouthW: 3,
    blush: 0.15,
    shine: 0,
    blink: true,
  },
  /* Empática: a cabeça inclina, as sobrancelhas amolecem, o sorriso é
     pequeno e fechado. Dia em baixo, dor, cansaço — "estou contigo". */
  caring: {
    tilt: -7,
    lift: 0.2,
    browL: [35.5, 47, 41, 45.6, 46.2, 44.2],
    browR: mirror([35.5, 47, 41, 45.6, 46.2, 44.2]),
    browW: 3.2,
    eyeL: [41.5, 54.4, 41.5, 55.2, 41.5, 56],
    eyeR: [58.5, 54.4, 58.5, 55.2, 58.5, 56],
    eyeW: 5,
    ...mouth(45, 67.6, 55, 67.6, 70, 70),
    mouthW: 3,
    blush: 0.65,
    shine: 0,
    blink: true,
  },
  /* A pensar: olhos para cima e para o lado, uma sobrancelha levantada, a
     boca de lado. Enquanto escreve ou analisa. */
  thinking: {
    tilt: 4,
    lift: 0,
    browL: [35.5, 45.8, 40.8, 43.8, 46, 45],
    browR: [54, 44.2, 59.4, 40.8, 64.8, 43],
    browW: 3.2,
    eyeL: [44, 50.8, 44, 51.9, 44, 53],
    eyeR: [61, 50.8, 61, 51.9, 61, 53],
    eyeW: EYE_OPEN_W,
    ...mouth(47, 68, 54, 67.6, 67.4, 69.6, 0.4),
    mouthW: 3,
    blush: 0.4,
    shine: 0,
    blink: true,
  },
};

export const FACE_MOODS = Object.keys(FACE_RIGS);

export function rigFor(mood) {
  return FACE_RIGS[mood] || FACE_RIGS.neutral;
}

const lerp = (a, b, t) => a + (b - a) * t;
const lerpArr = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));

/** O rig a meio caminho entre `a` e `b` (t de 0 a 1). O `blink` só passa a
 *  valer no fim — um olho a meio de fechar não pisca. */
export function lerpRig(a, b, t) {
  if (t <= 0) return a;
  if (t >= 1) return b;
  return {
    tilt: lerp(a.tilt, b.tilt, t),
    lift: lerp(a.lift, b.lift, t),
    browL: lerpArr(a.browL, b.browL, t),
    browR: lerpArr(a.browR, b.browR, t),
    browW: lerp(a.browW, b.browW, t),
    eyeL: lerpArr(a.eyeL, b.eyeL, t),
    eyeR: lerpArr(a.eyeR, b.eyeR, t),
    eyeW: lerp(a.eyeW, b.eyeW, t),
    m: lerpArr(a.m, b.m, t),
    lowerCy: lerp(a.lowerCy, b.lowerCy, t),
    mouthW: lerp(a.mouthW, b.mouthW, t),
    shine: lerp(a.shine, b.shine, t),
    blush: lerp(a.blush, b.blush, t),
    blink: false,
  };
}

const r = (n) => Math.round(n * 100) / 100;
const quad = ([x1, y1, cx, cy, x2, y2]) => `M ${r(x1)} ${r(y1)} Q ${r(cx)} ${r(cy)} ${r(x2)} ${r(y2)}`;

/** Os `d` de cada traço para um rig. A boca é um caminho fechado (lábio de
 *  cima para a direita, lábio de baixo de volta): com os dois lábios iguais
 *  a área é zero e vê-se só a linha. */
export function rigPaths(rig) {
  const [x1, y1, cx, cy, x2, y2] = rig.m;
  return {
    browL: quad(rig.browL),
    browR: quad(rig.browR),
    eyeL: quad(rig.eyeL),
    eyeR: quad(rig.eyeR),
    mouth: `${quad(rig.m)} Q ${r(cx)} ${r(rig.lowerCy)} ${r(x1)} ${r(y1)} Z`,
    // A boca abre-se quando os lábios se afastam — é aí que ganha cor.
    mouthOpen: Math.max(0, Math.min(1, (rig.lowerCy - cy - 3) / 5)),
  };
}

/* O enquadramento muda com o tamanho, como um retrato próximo: a cabeça
   enche o disco e o queixo fica perto do fundo, para o pescoço sair pelo
   círculo — os ombros nunca entram. Pequeno, aproxima-se ainda mais da cara
   (os olhos ganham espaço); grande, entra o nariz.
   `strokePx` é a espessura da linha principal em píxeis. `featBoost`
   engrossa as sobrancelhas e a boca (e, a meio, os olhos): são elas que
   distinguem as emoções, e à escala do traço principal ficavam abaixo de
   1 px nos tamanhos pequenos — a neutra, a empática e a "a pensar" liam-se
   iguais. No grande, compensa a descida do traço principal aos 56 px: as
   feições ficam com a espessura que tinham aos 55 até o desenho, a crescer,
   as alcançar (81 px) — nunca afinam ao mudar de enquadramento.
   O enquadramento 'min' fica abaixo de 32 px: cortava o rabo-de-cavalo, e
   a 36 px a Carol aparecia sem ele ao lado de uma com ele (CAROL.md §4:
   muda a expressão, nunca a pessoa). */
export function frameFor(size) {
  if (size < 32) return { viewBox: '15 11 72 72', detail: 'min', strokePx: 1.25, featBoost: 1.45 };
  if (size < 56) return { viewBox: '11 6 80 80', detail: 'mid', strokePx: Math.max(1.4, size * 0.034), featBoost: 1.3 };
  return { viewBox: '12 6 78 78', detail: 'full', strokePx: Math.min(3, size * 0.03), featBoost: Math.max(1, (55 * 0.034 * 1.3) / (size * 0.03)) };
}
