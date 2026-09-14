import { formatDuration } from './run';
import { MURAL_FORMATS, muralDateLabel } from './raceMural';

/* O estúdio do mural (pedido 2026-09-14). O mural automático não servia:
   a app escolhia por o atleta e nunca acertava. Agora é ele que monta — um
   modelo, as fotos nos espaços, os grafismos que quer — com peças prontas
   para a imagem sair sempre bem feita. Estes murais são publicidade que
   viaja com a foto, por isso a marca vai sempre. O enquadramento de cada
   foto é arrastar e ampliar (pedido 2026-09-14), e a composição inteira
   grava-se na prova (race_events.mural_composition), para aparecer em
   qualquer dispositivo e sobreviver a limpar o telemóvel.

   Este ficheiro é a parte pura: modelos, onde fica cada espaço, que dados
   há, a composição e as suas regras. O desenho está em muralStudioDraw.js,
   para isto se poder testar sem Canvas. */

export const STUDIO_FORMATS = MURAL_FORMATS;
export const DEFAULT_STUDIO_FORMAT = 'retrato';

export const STUDIO_TEMPLATES = [
  { key: 'capa', label: 'Capa', hint: 'Uma foto a ocupar tudo' },
  { key: 'mosaico4', label: 'Mosaico de 4', hint: 'Uma grande e três ao lado' },
  { key: 'mosaico6', label: 'Mosaico de 6', hint: 'Uma grande e cinco à volta' },
  { key: 'trofeu', label: 'Troféu', hint: 'A medalha ao centro' },
  { key: 'numeros', label: 'Só números', hint: 'Sem fotografia' },
];
export const DEFAULT_STUDIO_TEMPLATE = 'capa';

/* Três temas. O "claro" usa um âmbar escuro para o destaque manter o
   contraste sobre o fundo creme. `scrim` e `glow` vão em RGB para os
   gradientes. */
export const STUDIO_THEMES = {
  dourado: { label: 'Dourado', bg: '#0b1120', surface: '#16203a', accent: '#f4b400', accentInk: '#1a1200', text: '#f8fafc', muted: '#cbd5e1', faint: '#94a3b8', scrim: '11,17,32', glow: '244,180,0' },
  ciano: { label: 'Ciano', bg: '#061019', surface: '#0f2130', accent: '#22d3ee', accentInk: '#021318', text: '#f8fafc', muted: '#cbd5e1', faint: '#94a3b8', scrim: '6,16,25', glow: '34,211,238' },
  claro: { label: 'Claro', bg: '#f6f3ec', surface: '#e7e0d1', accent: '#b45309', accentInk: '#fffaf0', text: '#111827', muted: '#374151', faint: '#6b7280', scrim: '246,243,236', glow: '180,83,9' },
};
export const DEFAULT_STUDIO_THEME = 'dourado';

export const BRAND_CORNERS = {
  tl: 'Em cima à esquerda',
  tr: 'Em cima à direita',
  bl: 'Em baixo à esquerda',
  br: 'Em baixo à direita',
};
export const DEFAULT_BRAND_CORNER = 'tl';

/* O canto da medalha (pedido 2026-09-14, relatado: "a medalha estraga uma
   foto"): antes ficava sempre presa perto do início do texto, por cima do
   que estivesse na foto por baixo, sem se poder mudar. Um canto de verdade
   — a mesma ideia da marca, e por isso o mesmo conjunto de cantos e o mesmo
   picker — tira-a estruturalmente do centro de qualquer foto (onde o
   assunto quase sempre está), em vez de deslocá-la livremente e correr o
   risco de a voltar a pôr em cima de uma cara sem querer. */
export const DEFAULT_MEDAL_CORNER = 'br';

export const STUDIO_GRAPHICS = [
  { key: 'titulo', label: 'Nome e data da prova' },
  { key: 'tempo', label: 'Tempo em grande' },
  { key: 'numeros', label: 'Distância e ritmo' },
  { key: 'classificacao', label: 'Classificação do diploma' },
  { key: 'ritmo', label: 'Linha do ritmo por km' },
  { key: 'conquistas', label: 'Fichas das conquistas' },
  { key: 'diploma', label: 'Cartão do diploma' },
  { key: 'medalhao', label: 'Medalhão da medalha' },
];

/* Quando o texto não cabe no espaço do modelo, encolhe-se primeiro e só
   depois saem grafismos, por esta ordem. O tempo nunca sai: é a imagem. */
export const DROP_ORDER = ['diploma', 'conquistas', 'ritmo', 'classificacao', 'numeros', 'titulo'];

/* O enquadramento de cada foto é arrastar e ampliar (pedido 2026-09-14):
   `zoom` é o quanto se aproxima além do mínimo que preenche o espaço (1 =
   sem ampliar), `fx`/`fy` o centro do que fica visível, em fração da foto
   inteira — arrastar move o centro, o zoom aperta o recorte à volta dele. */
export const MIN_STUDIO_ZOOM = 1;
export const MAX_STUDIO_ZOOM = 3;

const PAD = 48;
const GAP = 14;

const clamp01 = (n, fallback) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(1, Math.max(0, v));
};

const clampZoom = (n, fallback = MIN_STUDIO_ZOOM) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(MAX_STUDIO_ZOOM, Math.max(MIN_STUDIO_ZOOM, v));
};

// ── dados ──────────────────────────────────────────────────────────────────

/** "5:05" a partir de segundos por km. */
export function paceLabel(secondsPerKm) {
  const v = Math.round(Number(secondsPerKm) || 0);
  if (v <= 0) return '';
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
}

/** "10,11 km" — a distância real da corrida, com vírgula. */
export function distanceLabel(km) {
  const v = Number(km) || 0;
  if (v <= 0) return '';
  return `${String(Math.round(v * 100) / 100).replace('.', ',')} km`;
}

/** O ritmo de cada km a partir dos parciais do relógio (`details.splits`).
 *  Parciais com menos de meio km (o bocado final) ficam de fora: dão ritmos
 *  sem sentido e estragavam a linha. */
export function splitPaces(splits) {
  return (Array.isArray(splits) ? splits : [])
    .map((s) => {
      const km = Number(s?.distance_km);
      const secs = Number(s?.time_seconds);
      return km >= 0.5 && secs > 0 ? Math.round(secs / km) : null;
    })
    .filter((v) => v !== null);
}

/** Tudo o que o mural pode escrever, pela régua de sempre. */
export function muralData({ race, run, seconds, classification = '', achievements = [] }) {
  const details = run?.details || {};
  const km = Number(run?.distance_km) || Number(race?.distance_km) || 0;
  const time = seconds > 0 ? formatDuration(Math.round(seconds)) : '';
  const paces = splitPaces(details.splits);
  const cells = [];
  if (details.official_time_seconds) cells.push({ label: details.gun_time_seconds ? 'Tempo chip' : 'Tempo oficial', value: formatDuration(details.official_time_seconds) });
  if (details.gun_time_seconds) cells.push({ label: 'Tempo bruto', value: formatDuration(details.gun_time_seconds) });
  (Array.isArray(details.official_splits) ? details.official_splits : [])
    .filter((s) => Number(s?.km) > 0 && Number(s?.seconds) > 0)
    .forEach((s) => cells.push({ label: `${String(s.km).replace('.', ',')} km`, value: formatDuration(s.seconds) }));
  if (Number(details.position) > 0) cells.push({ label: 'Geral', value: `${details.position}.º` });
  if (Number(details.age_group_position) > 0) cells.push({ label: details.age_group || 'Escalão', value: `${details.age_group_position}.º` });
  // O cartão só vale a pena com o que o relógio não dá: um tempo oficial
  // sozinho repete o tempo em grande.
  const diplomaCells = cells.length >= 2 ? cells.slice(0, 6) : [];
  return {
    eyebrow: ['Prova concluída', muralDateLabel(race?.date), race?.location || ''].filter(Boolean).join(' · ').toUpperCase(),
    name: race?.name || 'A minha prova',
    time,
    distance: distanceLabel(km),
    pace: seconds > 0 && km > 0 ? `${paceLabel(seconds / km)} /km` : '',
    classification: classification || '',
    paces,
    fastestPace: paces.length ? paceLabel(Math.min(...paces)) : '',
    achievements: (achievements || []).map((a) => a?.name).filter(Boolean).slice(0, 4),
    diplomaCells,
  };
}

/** Que grafismos fazem sentido com estes dados — e porquê não, para o
 *  estúdio o dizer ao lado do interruptor. `null` = disponível. */
export function graphicUnavailableReason(key, { data, candidates = [], template }) {
  switch (key) {
    case 'tempo': return data.time ? null : 'Sem tempo registado';
    case 'numeros': return data.distance || data.pace ? null : 'Sem distância registada';
    case 'classificacao': return data.classification ? null : 'Sem classificação do diploma';
    case 'ritmo': return data.paces.length >= 2 ? null : 'Sem parciais por km';
    case 'conquistas': return data.achievements.length ? null : 'Sem conquistas nesta prova';
    case 'diploma': return data.diplomaCells.length ? null : 'Sem dados do diploma';
    case 'medalhao':
      if (template === 'trofeu') return 'O Troféu já tem a medalha ao centro';
      return candidates.some((c) => c.id === 'medal') ? null : 'Sem fotografia da medalha';
    default: return null;
  }
}

// ── modelos e espaços ──────────────────────────────────────────────────────

function cornerPoint(format, corner, w, h) {
  const { width, height } = STUDIO_FORMATS[format] || STUDIO_FORMATS[DEFAULT_STUDIO_FORMAT];
  const left = corner === 'tl' || corner === 'bl';
  const top = corner === 'tl' || corner === 'tr';
  return { x: left ? PAD : width - PAD - w, y: top ? PAD : height - PAD - h, left, top };
}

export function brandBox(format, corner) {
  const { width } = STUDIO_FORMATS[format] || STUDIO_FORMATS[DEFAULT_STUDIO_FORMAT];
  const size = Math.round(width * 0.05);
  const w = Math.round(size * 4.6);
  const { x, y, left, top } = cornerPoint(format, corner, w, size);
  return { x, y, w, h: size, size, left, top };
}

const MEDAL_SIZE_RATIO = 0.19;

/** O canto onde fica a medalha, com o mesmo desenho do canto da marca — só
 *  que redondo. Se calhar no mesmo canto que a marca, afasta-se dela ao
 *  longo do lado partilhado, em vez de lhe cair em cima. */
export function medalCornerBox(format, corner, brandCorner) {
  const { width } = STUDIO_FORMATS[format] || STUDIO_FORMATS[DEFAULT_STUDIO_FORMAT];
  const size = Math.round(width * MEDAL_SIZE_RATIO);
  const point = cornerPoint(format, corner, size, size);
  let y = point.y;
  if (brandCorner && corner === brandCorner) {
    const brand = brandBox(format, brandCorner);
    const gap = Math.round(width * 0.02);
    y = point.top ? brand.y + brand.h + gap : brand.y - size - gap;
  }
  return { x: point.x, y, w: size, h: size, size, shape: 'circle' };
}

const BAND = {
  mosaico4: { quadrado: 0.42, retrato: 0.38, story: 0.34 },
  mosaico6: { quadrado: 0.40, retrato: 0.36, story: 0.33 },
  trofeu: { quadrado: 0.44, retrato: 0.42, story: 0.40 },
};

/**
 * Onde fica cada espaço de foto e a zona do texto, em píxeis da imagem final.
 * `text.anchor`: 'bottom' (o bloco cresce para cima a partir do fundo),
 * 'top' (desce a partir do topo) ou 'center'.
 */
export function studioLayout(template, format, brandCorner = DEFAULT_BRAND_CORNER) {
  const fmt = STUDIO_FORMATS[format] ? format : DEFAULT_STUDIO_FORMAT;
  const { width: W, height: H } = STUDIO_FORMATS[fmt];
  const brand = brandBox(fmt, brandCorner);
  const bottomReserve = brand.top ? 0 : brand.h + 22;
  const topReserve = brand.top ? brand.h + 22 : 0;
  const base = { width: W, height: H, pad: PAD, brand };

  if (template === 'mosaico4' || template === 'mosaico6') {
    const band = BAND[template][fmt] * H;
    const x0 = PAD; const y0 = PAD; const aw = W - 2 * PAD; const ah = H - band - PAD;
    let slots;
    if (template === 'mosaico4') {
      const heroW = (aw - GAP) * 0.64;
      const sideW = aw - GAP - heroW;
      const sideH = (ah - 2 * GAP) / 3;
      slots = [
        { id: 's1', x: x0, y: y0, w: heroW, h: ah },
        ...[0, 1, 2].map((i) => ({ id: `s${i + 2}`, x: x0 + heroW + GAP, y: y0 + i * (sideH + GAP), w: sideW, h: sideH })),
      ];
    } else {
      const cw = (aw - 2 * GAP) / 3;
      const ch = (ah - 2 * GAP) / 3;
      const cell = (c, r, cs = 1, rs = 1) => ({ x: x0 + c * (cw + GAP), y: y0 + r * (ch + GAP), w: cs * cw + (cs - 1) * GAP, h: rs * ch + (rs - 1) * GAP });
      slots = [
        { id: 's1', ...cell(0, 0, 2, 2) },
        { id: 's2', ...cell(2, 0) },
        { id: 's3', ...cell(2, 1) },
        { id: 's4', ...cell(0, 2) },
        { id: 's5', ...cell(1, 2) },
        { id: 's6', ...cell(2, 2) },
      ];
    }
    return {
      ...base,
      slots: slots.map((s) => ({ ...s, radius: 22, shape: 'rect' })),
      text: { x: PAD, w: aw, top: y0 + ah + 30, bottom: H - PAD - bottomReserve, anchor: 'top', align: 'left' },
      scrim: null,
    };
  }

  if (template === 'trofeu') {
    const band = BAND.trofeu[fmt] * H;
    const areaTop = PAD + topReserve;
    const areaH = H - band - areaTop;
    const d = Math.min(W * 0.6, areaH * 0.86);
    const cy = areaTop + areaH / 2;
    return {
      ...base,
      slots: [{ id: 's1', x: W / 2 - d / 2, y: cy - d / 2, w: d, h: d, radius: d / 2, shape: 'circle' }],
      text: { x: PAD, w: W - 2 * PAD, top: cy + d / 2 + 40, bottom: H - PAD - bottomReserve, anchor: 'top', align: 'center' },
      scrim: null,
    };
  }

  if (template === 'numeros') {
    return {
      ...base,
      slots: [],
      text: { x: PAD, w: W - 2 * PAD, top: PAD + topReserve + H * 0.06, bottom: H - PAD - bottomReserve, anchor: 'center', align: 'left' },
      scrim: null,
    };
  }

  // capa
  return {
    ...base,
    slots: [{ id: 's1', x: 0, y: 0, w: W, h: H, radius: 0, shape: 'rect' }],
    text: { x: PAD, w: W - 2 * PAD, top: H * 0.38, bottom: H - PAD - bottomReserve, anchor: 'bottom', align: 'left' },
    scrim: { from: H * 0.28, to: H },
  };
}

export function templateSlotIds(template) {
  return studioLayout(template, DEFAULT_STUDIO_FORMAT).slots.map((s) => s.id);
}

/** Recorte "cover" de uma imagem numa caixa, centrado no ponto de foco
 *  (fx, fy em 0–1), com `zoom` (1 = o mínimo que preenche a caixa; mais que
 *  isso aperta o recorte à volta do centro) — e sem sair da imagem. O
 *  recorte (sx,sy,sw,sh) é o que importa: é invariante ao tamanho absoluto
 *  da caixa, só à sua proporção, por isso serve tanto para desenhar no
 *  canvas final como para a pré-visualização do enquadramento no estúdio. */
export function coverCrop(imgW, imgH, boxW, boxH, fx = 0.5, fy = 0.5, zoom = MIN_STUDIO_ZOOM) {
  const scale = Math.max(boxW / imgW, boxH / imgH) * clampZoom(zoom);
  const sw = Math.min(imgW, boxW / scale);
  const sh = Math.min(imgH, boxH / scale);
  const sx = Math.min(Math.max(fx * imgW - sw / 2, 0), imgW - sw);
  const sy = Math.min(Math.max(fy * imgH - sh / 2, 0), imgH - sh);
  return { sx, sy, sw, sh };
}

// ── composição ─────────────────────────────────────────────────────────────

const DEFAULT_FOCUS = { fx: 0.5, fy: 0.42, zoom: MIN_STUDIO_ZOOM };

/** Enche os espaços do modelo: primeiro as que já estavam escolhidas (pela
 *  ordem), depois as fotos do dia, a medalha, e o diploma por último. No
 *  Troféu o espaço é da medalha. */
export function fillSlots(template, candidates = [], carried = []) {
  const ids = templateSlotIds(template);
  const known = new Map(candidates.map((c) => [c.id, c]));
  const photos = candidates.filter((c) => c.id !== 'medal' && c.id !== 'diploma').map((c) => c.id);
  const order = template === 'trofeu'
    ? ['medal', ...carried.map((s) => s.id), ...photos, 'diploma']
    : [...carried.map((s) => s.id), ...photos, 'medal', 'diploma'];
  const focusOf = new Map(carried.map((s) => [s.id, s]));
  const seen = new Set();
  const queue = order.filter((id) => known.has(id) && !seen.has(id) && seen.add(id));
  const slots = {};
  ids.forEach((slotId, i) => {
    const id = queue[i];
    if (!id) return;
    const prev = focusOf.get(id);
    slots[slotId] = { id, fx: prev?.fx ?? DEFAULT_FOCUS.fx, fy: prev?.fy ?? DEFAULT_FOCUS.fy, zoom: prev?.zoom ?? DEFAULT_FOCUS.zoom };
  });
  return slots;
}

export function defaultComposition({ candidates = [], data, template = DEFAULT_STUDIO_TEMPLATE, format = DEFAULT_STUDIO_FORMAT } = {}) {
  const on = (key) => !graphicUnavailableReason(key, { data, candidates, template });
  return {
    version: 1,
    format,
    template,
    theme: DEFAULT_STUDIO_THEME,
    brandCorner: DEFAULT_BRAND_CORNER,
    medalCorner: DEFAULT_MEDAL_CORNER,
    slots: fillSlots(template, candidates),
    graphics: {
      titulo: true,
      tempo: true,
      numeros: on('numeros'),
      classificacao: on('classificacao'),
      ritmo: on('ritmo'),
      conquistas: false,
      diploma: template === 'trofeu' && on('diploma'),
      medalhao: template !== 'trofeu' && on('medalhao'),
    },
  };
}

const orderedSlots = (composition) => templateSlotIds(composition.template)
  .map((slotId) => composition.slots?.[slotId])
  .filter(Boolean);

/** Trocar de modelo mantém as fotos escolhidas, pela ordem, e os focos. */
export function switchTemplate(composition, template, candidates = []) {
  if (!STUDIO_TEMPLATES.some((t) => t.key === template)) return composition;
  const graphics = { ...composition.graphics };
  if (template === 'trofeu') graphics.medalhao = false;
  return { ...composition, template, graphics, slots: fillSlots(template, candidates, orderedSlots(composition)) };
}

/** Pôr uma memória num espaço. Se já estava noutro, trocam de lugar. */
export function assignSlot(composition, slotId, candidateId) {
  const slots = { ...(composition.slots || {}) };
  const current = slots[slotId];
  const otherKey = Object.keys(slots).find((k) => k !== slotId && slots[k]?.id === candidateId);
  if (otherKey) {
    if (current) slots[otherKey] = current; else delete slots[otherKey];
  }
  const keepFocus = current?.id === candidateId ? current : (otherKey ? composition.slots[otherKey] : null);
  slots[slotId] = { id: candidateId, fx: keepFocus?.fx ?? DEFAULT_FOCUS.fx, fy: keepFocus?.fy ?? DEFAULT_FOCUS.fy, zoom: keepFocus?.zoom ?? DEFAULT_FOCUS.zoom };
  return { ...composition, slots };
}

export function clearSlot(composition, slotId) {
  const slots = { ...(composition.slots || {}) };
  delete slots[slotId];
  return { ...composition, slots };
}

export function setSlotFocus(composition, slotId, fx, fy) {
  const slot = composition.slots?.[slotId];
  if (!slot) return composition;
  return { ...composition, slots: { ...composition.slots, [slotId]: { ...slot, fx: clamp01(fx, slot.fx), fy: clamp01(fy, slot.fy) } } };
}

/** Ampliar (ou reduzir até ao mínimo que preenche o espaço), mantendo o
 *  centro. É o "belisca para ampliar" do arrastar e ampliar. */
export function setSlotZoom(composition, slotId, zoom) {
  const slot = composition.slots?.[slotId];
  if (!slot) return composition;
  return { ...composition, slots: { ...composition.slots, [slotId]: { ...slot, zoom: clampZoom(zoom, slot.zoom) } } };
}

export function toggleGraphic(composition, key) {
  if (!STUDIO_GRAPHICS.some((g) => g.key === key)) return composition;
  return { ...composition, graphics: { ...composition.graphics, [key]: !composition.graphics?.[key] } };
}

/** O que vem gravado na prova (ou de uma versão antiga) só entra validado:
 *  enums conhecidos, espaços do modelo, foco entre 0 e 1, zoom no intervalo. */
export function sanitizeComposition(raw, fallback) {
  if (!raw || typeof raw !== 'object') return fallback;
  const pick = (value, allowed, def) => (allowed.includes(value) ? value : def);
  const template = pick(raw.template, STUDIO_TEMPLATES.map((t) => t.key), fallback.template);
  const slotIds = templateSlotIds(template);
  const slots = {};
  Object.entries(raw.slots && typeof raw.slots === 'object' ? raw.slots : {}).forEach(([slotId, s]) => {
    if (!slotIds.includes(slotId) || typeof s?.id !== 'string' || !s.id) return;
    slots[slotId] = { id: s.id, fx: clamp01(s.fx, DEFAULT_FOCUS.fx), fy: clamp01(s.fy, DEFAULT_FOCUS.fy), zoom: clampZoom(s.zoom) };
  });
  const graphics = { ...fallback.graphics };
  STUDIO_GRAPHICS.forEach(({ key }) => { if (typeof raw.graphics?.[key] === 'boolean') graphics[key] = raw.graphics[key]; });
  return {
    version: 1,
    format: pick(raw.format, Object.keys(STUDIO_FORMATS), fallback.format),
    template,
    theme: pick(raw.theme, Object.keys(STUDIO_THEMES), fallback.theme),
    brandCorner: pick(raw.brandCorner, Object.keys(BRAND_CORNERS), fallback.brandCorner),
    medalCorner: pick(raw.medalCorner, Object.keys(BRAND_CORNERS), fallback.medalCorner),
    slots,
    graphics,
  };
}

/**
 * Cabe? Com `blocks` = [{ key, height(scale) }] e a altura disponível,
 * encolhe de 1 até 0,7; se ainda não couber, tira grafismos pela
 * DROP_ORDER e volta a tentar. O tempo nunca sai.
 */
export function planBlocks(blocks, available) {
  let kept = blocks.map((b) => b.key);
  const dropped = [];
  const total = (scale) => blocks.filter((b) => kept.includes(b.key)).reduce((sum, b) => sum + b.height(scale), 0);
  for (;;) {
    for (let scale = 1; scale >= 0.7 - 1e-9; scale -= 0.05) {
      if (total(scale) <= available) return { scale: Math.round(scale * 100) / 100, kept, dropped };
    }
    const next = DROP_ORDER.find((key) => kept.includes(key));
    if (!next) return { scale: 0.7, kept, dropped };
    kept = kept.filter((k) => k !== next);
    dropped.push(next);
  }
}

/** Os pontos da linha do ritmo numa caixa w×h: mais rápido = mais alto. */
export function pacePoints(paces, w, h) {
  if (!paces || paces.length < 2) return [];
  const min = Math.min(...paces);
  const max = Math.max(...paces);
  return paces.map((p, i) => ({
    x: (i / (paces.length - 1)) * w,
    y: max === min ? h / 2 : ((p - min) / (max - min)) * h,
  }));
}
