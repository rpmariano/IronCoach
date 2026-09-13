import { publicUrl } from '../lib/utils';
import { formatDuration, formatPace, raceDistanceLabel } from './run';

/* O mural da prova (pedido 2026-09-13): uma imagem para o Instagram com as
   fotos do dia, o nome da prova, a data, o tempo, o ritmo e a distância —
   e o logótipo da app, discreto mas legível, para se saber de onde vem.

   Compõe-se no próprio telemóvel com Canvas: instantâneo, sem custo, e as
   fotos ficam tal como o atleta as tirou (uma imagem gerada por IA não
   garante a cara nem a medalha). Só a legenda é da Carol (coach-chat,
   `race_caption`).

   A parte pura (que fotos, que texto, onde) está separada do desenho para
   se poder testar sem Canvas. */

export const MURAL_FORMATS = {
  quadrado: { label: 'Quadrado', hint: 'feed · 1:1', width: 1080, height: 1080 },
  retrato: { label: 'Retrato', hint: 'feed · 4:5', width: 1080, height: 1350 },
  story: { label: 'Story', hint: '9:16', width: 1080, height: 1920 },
};
export const DEFAULT_MURAL_FORMAT = 'retrato';
export const MURAL_MAX_PHOTOS = 4;

const COLORS = {
  bg: '#0b1120',
  race: '#fbbf24',
  raceDeep: '#d97706',
  coach: '#22d3ee',
  text1: '#f8fafc',
  text3: '#cbd5e1',
  text4: '#9aa5b4',
  brand: '#7fb3c7',
};

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function muralDateLabel(dateIso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateIso || ''));
  if (!m) return '';
  return `${Number(m[3])} ${MESES[Number(m[2]) - 1]} ${m[1]}`;
}

/** Os textos do mural, pela régua de sempre. */
export function muralTexts({ race, seconds, distanceKm, classification = '' }) {
  const km = Number(distanceKm) || Number(race?.distance_km) || 0;
  const time = seconds > 0 ? formatDuration(Math.round(seconds)) : '';
  const pace = seconds > 0 && km > 0 ? `${formatPace(Math.round(seconds / km))}/km` : '';
  return {
    eyebrow: ['PROVA CONCLUÍDA', muralDateLabel(race?.date).toUpperCase()].filter(Boolean).join(' · '),
    name: race?.name || 'A minha prova',
    time,
    stats: [km > 0 ? raceDistanceLabel(km) : '', pace].filter(Boolean).join(' · '),
    // A classificação (se o diploma a deu) e o local numa linha só.
    location: [classification, race?.location || ''].filter(Boolean).join(' · '),
  };
}

/** Todas as memórias que PODEM entrar no mural, com nome: as fotos do dia, a
 *  medalha, e o diploma se for imagem. É daqui que o atleta escolhe. */
export function muralCandidates({ photos = [], medal = null, diploma = null, diplomaPath = '' }) {
  const list = photos.filter(Boolean).map((url, i) => ({ id: `photo-${i}`, url, label: `Foto ${i + 1}` }));
  if (medal) list.push({ id: 'medal', url: medal, label: 'Medalha' });
  if (diploma && !/\.pdf$/i.test(diplomaPath || '')) list.push({ id: 'diploma', url: diploma, label: 'Diploma' });
  return list;
}

/** A escolha por omissão: as do dia primeiro, a medalha a fechar; o diploma
 *  só se não houver mais nada. Até MURAL_MAX_PHOTOS. */
export function defaultMuralSelection(candidates) {
  const withoutDiploma = candidates.filter((c) => c.id !== 'diploma');
  const base = withoutDiploma.length ? withoutDiploma : candidates;
  return base.slice(0, MURAL_MAX_PHOTOS).map((c) => c.id);
}

/** As fotos que entram e como (a escolha por omissão), em URLs. */
export function pickMuralPhotos(memories) {
  const candidates = muralCandidates(memories);
  const chosen = new Set(defaultMuralSelection(candidates));
  return candidates.filter((c) => chosen.has(c.id)).map((c) => c.url);
}

/** Onde fica cada foto, em fração da tela: o herói em cima, as outras
 *  numa fila por baixo dele; o texto vive no terço de baixo. */
export function muralLayout(format, photoCount) {
  const { width, height } = MURAL_FORMATS[format] || MURAL_FORMATS[DEFAULT_MURAL_FORMAT];
  const tall = height / width >= 1.5;
  const textBand = tall ? 0.30 : 0.36;
  const gap = 12;
  const pad = 36;
  const frames = [];
  if (photoCount > 0) {
    const heroBottom = photoCount === 1 ? height * (1 - textBand) : height * (1 - textBand) - (width - 2 * pad - (photoCount - 2) * gap) / (photoCount - 1) * 0.62 - gap;
    frames.push({ x: 0, y: 0, w: width, h: Math.max(height * 0.42, heroBottom), radius: 0, hero: true });
    if (photoCount > 1) {
      const n = photoCount - 1;
      const w = (width - 2 * pad - (n - 1) * gap) / n;
      const h = w * 0.62;
      const y = frames[0].h + gap;
      for (let i = 0; i < n; i += 1) frames.push({ x: pad + i * (w + gap), y, w, h, radius: 22, hero: false });
    }
  }
  return { width, height, pad, textTop: height * (1 - textBand), frames, hasPhotos: photoCount > 0 };
}

// ── desenho ────────────────────────────────────────────────────────────────

function loadImage(src, { crossOrigin = 'anonymous' } = {}) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = crossOrigin;
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Não consegui carregar a imagem: ${String(src).slice(0, 80)}`));
    img.src = src;
  });
}

/* O ícone da marca é um SVG com width="100%": para o Canvas o desenhar tem
   de ter medidas fixas — vai buscar-se o texto, ajusta-se e serve-se como
   blob. Same-origin, sem CORS. */
async function loadLogo() {
  const res = await fetch(publicUrl('brand/ironcoach-icon.svg'));
  if (!res.ok) throw new Error('Logótipo indisponível');
  const svg = (await res.text()).replace(/width="100%"\s+height="100%"/, 'width="512" height="512"');
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    return await loadImage(url, { crossOrigin: null });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function roundedRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawCover(ctx, img, { x, y, w, h, radius }) {
  const scale = Math.max(w / img.width, h / img.height);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (img.width - sw) / 2;
  const sy = (img.height - sh) / 2;
  ctx.save();
  roundedRect(ctx, x, y, w, h, radius);
  ctx.clip();
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  ctx.restore();
}

function fitFontSize(ctx, text, maxWidth, { max, min, weight = 900 }) {
  let size = max;
  while (size > min) {
    ctx.font = `${weight} ${size}px ${FONT}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 4;
  }
  return size;
}

function wrapLines(ctx, text, maxWidth, maxLines) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth || !current) {
      current = next;
    } else {
      lines.push(current);
      current = word;
    }
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && current) lines.push(current);
  if (lines.length === maxLines && words.join(' ') !== lines.join(' ')) {
    let last = lines[maxLines - 1];
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    lines[maxLines - 1] = `${last.trimEnd()}…`;
  }
  return lines;
}

function drawBackground(ctx, width, height) {
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, width, height);
  const glowA = ctx.createRadialGradient(width * 0.9, height * 0.05, 0, width * 0.9, height * 0.05, width * 0.7);
  glowA.addColorStop(0, 'rgba(46,224,255,.14)');
  glowA.addColorStop(1, 'rgba(46,224,255,0)');
  ctx.fillStyle = glowA;
  ctx.fillRect(0, 0, width, height);
  const glowB = ctx.createRadialGradient(width * 0.1, height, 0, width * 0.1, height, width * 0.8);
  glowB.addColorStop(0, 'rgba(251,191,36,.16)');
  glowB.addColorStop(1, 'rgba(251,191,36,0)');
  ctx.fillStyle = glowB;
  ctx.fillRect(0, 0, width, height);
}

function drawScrim(ctx, width, from, to) {
  const g = ctx.createLinearGradient(0, from, 0, to);
  g.addColorStop(0, 'rgba(11,17,32,0)');
  g.addColorStop(0.55, 'rgba(11,17,32,.82)');
  g.addColorStop(1, 'rgba(11,17,32,1)');
  ctx.fillStyle = g;
  ctx.fillRect(0, from, width, to - from);
}

function drawLogo(ctx, logo, { width, height, pad }) {
  // Discreto mas presente: canto inferior direito, ícone de 5% da largura e
  // o nome ao lado, em opacidade quase cheia.
  const size = Math.round(width * 0.052);
  const x = width - pad - size;
  const y = height - pad - size;
  ctx.save();
  ctx.globalAlpha = 0.92;
  ctx.drawImage(logo, x, y, size, size);
  ctx.font = `800 ${Math.round(size * 0.5)}px ${FONT}`;
  ctx.fillStyle = COLORS.brand;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  ctx.fillText('IronCoach', x - Math.round(size * 0.22), y + size / 2);
  ctx.restore();
}

/**
 * Desenha o mural e devolve o canvas.
 * @param format   'quadrado' | 'retrato' | 'story'
 * @param race     a prova (name, date, location, distance_km)
 * @param seconds  o tempo final
 * @param distanceKm  a distância da corrida registada (cai para a da prova)
 * @param photoUrls   URLs (assinadas) das fotos escolhidas, já pela ordem
 */
export async function renderRaceMural({ format = DEFAULT_MURAL_FORMAT, race, seconds, distanceKm, classification = '', photoUrls = [] }) {
  // Uma foto que falhe (rede, CORS) sai do mural em vez de o derrubar.
  const [settled, logo] = await Promise.all([
    Promise.allSettled(photoUrls.slice(0, MURAL_MAX_PHOTOS).map((u) => loadImage(u))),
    loadLogo(),
  ]);
  const images = settled.filter((r) => r.status === 'fulfilled').map((r) => r.value);
  const layout = muralLayout(format, images.length);
  const { width, height, pad, textTop, frames } = layout;
  const texts = muralTexts({ race, seconds, distanceKm, classification });

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  drawBackground(ctx, width, height);
  frames.forEach((frame, i) => drawCover(ctx, images[i], frame));
  if (frames.length) drawScrim(ctx, width, frames[0].h * 0.55, Math.max(frames[0].h + 2, textTop + 40));

  // ── texto ──
  // O bloco tem de caber entre o topo do texto e o logótipo: mede-se
  // primeiro e, se não couber (o quadrado com fotos e um nome a duas
  // linhas), encolhe-se a escala e cai o local — revisão pré-deploy.
  const maxW = width - 2 * pad;
  const startY = layout.hasPhotos ? Math.max(textTop, (frames[frames.length - 1].y + frames[frames.length - 1].h) + 40) : height * 0.30;
  const logoSize = Math.round(width * 0.052);
  const available = height - pad - logoSize - 16 - startY;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  const measure = (scale, withLocation) => {
    const eyebrowSize = Math.round(width * 0.024 * scale);
    const nameSize = fitFontSize(ctx, texts.name, maxW, { max: Math.round(width * 0.09 * scale), min: Math.round(width * 0.05 * scale) });
    ctx.font = `900 ${nameSize}px ${FONT}`;
    const nameLines = wrapLines(ctx, texts.name, maxW, 2);
    const timeSize = Math.round(width * 0.135 * scale);
    const statsSize = Math.round(width * 0.03 * scale);
    ctx.font = `900 ${timeSize}px ${FONT}`;
    const timeW = ctx.measureText(texts.time).width;
    ctx.font = `700 ${statsSize}px ${FONT}`;
    const statsFit = !!texts.stats && ctx.measureText(texts.stats).width <= width - pad - (pad + timeW + 24);
    const statsBelow = !!texts.stats && !statsFit;
    const total = Math.round(width * 0.03 * scale) + nameLines.length * nameSize * 1.02 + Math.round(width * 0.028 * scale) + timeSize
      + (statsBelow ? Math.round(width * 0.045 * scale) : 0) + (withLocation && texts.location ? Math.round(width * 0.04 * scale) : 0);
    return { eyebrowSize, nameSize, nameLines, timeSize, statsSize, timeW, statsFit, statsBelow, total, withLocation };
  };
  let m = measure(1, true);
  if (m.total > available) m = measure(1, false);
  let scale = 1;
  while (m.total > available && scale > 0.7) { scale -= 0.05; m = measure(scale, false); }

  let y = startY;
  // eyebrow âmbar com uma barra à esquerda
  ctx.font = `800 ${m.eyebrowSize}px ${FONT}`;
  ctx.fillStyle = COLORS.race;
  ctx.fillRect(pad, y - Math.round(m.eyebrowSize * 0.83), 6, Math.round(m.eyebrowSize * 1.08));
  ctx.fillText(texts.eyebrow, pad + 18, y);
  y += Math.round(width * 0.03 * scale);

  // nome, até duas linhas
  ctx.font = `900 ${m.nameSize}px ${FONT}`;
  ctx.fillStyle = COLORS.text1;
  m.nameLines.forEach((line) => { y += m.nameSize * 1.02; ctx.fillText(line, pad, y); });

  // tempo grande em âmbar e os números ao lado
  y += Math.round(width * 0.028 * scale);
  ctx.font = `900 ${m.timeSize}px ${FONT}`;
  ctx.fillStyle = COLORS.race;
  y += m.timeSize;
  ctx.fillText(texts.time, pad, y);
  ctx.font = `700 ${m.statsSize}px ${FONT}`;
  ctx.fillStyle = COLORS.text3;
  if (m.statsFit) {
    ctx.fillText(texts.stats, pad + m.timeW + 24, y - Math.round(m.timeSize * 0.12));
  } else if (m.statsBelow) {
    y += Math.round(width * 0.045 * scale);
    ctx.fillText(texts.stats, pad, y);
  }
  if (m.withLocation && texts.location) {
    y += Math.round(width * 0.04 * scale);
    ctx.font = `600 ${Math.round(width * 0.026 * scale)}px ${FONT}`;
    ctx.fillStyle = COLORS.text4;
    ctx.fillText(texts.location, pad, y);
  }

  drawLogo(ctx, logo, layout);
  return canvas;
}

/** O ficheiro pronto a partilhar ou guardar. */
export function canvasToFile(canvas, name) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) { reject(new Error('Não consegui gerar a imagem.')); return; }
      resolve(new File([blob], name, { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.92);
  });
}

export function muralFileName(race, format) {
  const slug = String(race?.name || 'prova').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `ironcoach-${slug || 'prova'}-${format}.jpg`;
}
