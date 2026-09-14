import { publicUrl } from '../lib/utils';

/* O mural da prova — as peças partilhadas pelo estúdio (pedido 2026-09-14,
   utils/muralStudio.js e muralStudioDraw.js): os formatos do Instagram, as
   memórias que podem entrar, o carregamento das imagens e do logótipo, e o
   ficheiro final. O mural automático de 2026-09-13 saiu: a app escolhia pelo
   atleta e nunca acertava; agora é ele que monta. */

export const MURAL_FORMATS = {
  quadrado: { label: 'Quadrado', hint: 'feed · 1:1', width: 1080, height: 1080 },
  retrato: { label: 'Retrato', hint: 'feed · 4:5', width: 1080, height: 1350 },
  story: { label: 'Story', hint: '9:16', width: 1080, height: 1920 },
};

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function muralDateLabel(dateIso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateIso || ''));
  if (!m) return '';
  return `${Number(m[3])} ${MESES[Number(m[2]) - 1]} ${m[1]}`;
}

/** Todas as memórias que PODEM entrar no mural, com nome: as fotos do dia
 *  (até seis, as da prova), a medalha, e o diploma se for imagem. */
export function muralCandidates({ photos = [], medal = null, diploma = null, diplomaPath = '' }) {
  const list = photos.filter(Boolean).slice(0, 6).map((url, i) => ({ id: `photo-${i}`, url, label: `Foto ${i + 1}` }));
  if (medal) list.push({ id: 'medal', url: medal, label: 'Medalha' });
  if (diploma && !/\.pdf$/i.test(diplomaPath || '')) list.push({ id: 'diploma', url: diploma, label: 'Diploma' });
  return list;
}

export function loadImage(src, { crossOrigin = 'anonymous' } = {}) {
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
export async function loadLogo() {
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
