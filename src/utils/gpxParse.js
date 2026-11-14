/* O percurso de uma prova a partir de um GPX (pedido do Rui, 2026-11-14): a Carol passa a conhecer
   o perfil do percurso. Aqui só se LÊ o ficheiro, no telemóvel: os pontos (lat, lon, ele) dos
   trkpt — ou dos rtept, se o GPX não tiver track. O ficheiro nunca sobe para o storage; o que se
   grava é o perfil resumido (@formulas/courseProfile.ts, do Backend).

   - Vários <trk>/<trkseg> leem-se em sequência, pela ordem do ficheiro.
   - Waypoints (<wpt>) não contam: são marcas soltas, não o percurso.
   - Não se lê nada além das coordenadas e da altitude — nem o nome, nem a descrição, nem tempos
     ou frequência cardíaca que o ficheiro possa trazer.
   - Só .gpx, até 15 MB (o limite do Backend), verificado antes de o ler. */

export const GPX_MAX_BYTES = 15 * 1024 * 1024;
export const GPX_ACCEPT = '.gpx,application/gpx+xml';

export const GPX_ERRORS = {
  notGpx: 'Este ficheiro não é um GPX.',
  tooLarge: 'O GPX é demasiado grande (máx. 15 MB).',
  noPoints: 'O GPX não tem pontos.',
  noElevation: 'O GPX não tem altitude.',
  unreadable: 'Não consegui ler este ficheiro.',
};

export class GpxError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GpxError';
  }
}

const finite = (v) => {
  if (v == null || String(v).trim() === '') return null;
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
};

/** O primeiro filho direto com este nome local (sem olhar ao namespace do GPX 1.0/1.1). */
function childByName(el, name) {
  for (let c = el.firstElementChild; c; c = c.nextElementSibling) {
    if (c.localName === name) return c;
  }
  return null;
}

function readPoints(doc, tag) {
  const out = [];
  const nodes = doc.getElementsByTagNameNS('*', tag);
  for (let i = 0; i < nodes.length; i += 1) {
    const el = nodes[i];
    const lat = finite(el.getAttribute('lat'));
    const lon = finite(el.getAttribute('lon'));
    if (lat == null || lon == null || lat < -90 || lat > 90 || lon < -180 || lon > 180) continue;
    const eleNode = childByName(el, 'ele');
    out.push({ lat, lon, ele: eleNode ? finite(eleNode.textContent) : null });
  }
  return out;
}

/**
 * Os pontos de um GPX em texto: { points: [{ lat, lon, ele }], source: 'trk' | 'rte' }.
 * Lança GpxError com a frase para o atleta.
 */
export function parseGpx(text) {
  if (typeof text !== 'string' || !text.trim()) throw new GpxError(GPX_ERRORS.notGpx);
  if (text.length > GPX_MAX_BYTES) throw new GpxError(GPX_ERRORS.tooLarge);
  let doc;
  try {
    doc = new DOMParser().parseFromString(text, 'application/xml');
  } catch {
    throw new GpxError(GPX_ERRORS.notGpx);
  }
  const root = doc?.documentElement;
  if (!root || doc.getElementsByTagName('parsererror').length || root.localName !== 'gpx') {
    throw new GpxError(GPX_ERRORS.notGpx);
  }
  let source = 'trk';
  let points = readPoints(doc, 'trkpt');
  if (!points.length) {
    source = 'rte';
    points = readPoints(doc, 'rtept');
  }
  if (!points.length) throw new GpxError(GPX_ERRORS.noPoints);
  if (!points.some((p) => p.ele != null)) throw new GpxError(GPX_ERRORS.noElevation);
  return { points, source };
}

/** O ficheiro escolhido no input: valida a extensão e o tamanho, lê-o e devolve parseGpx(texto). */
export async function readGpxFile(file) {
  if (!file) throw new GpxError(GPX_ERRORS.notGpx);
  const name = String(file.name || '').toLowerCase();
  const type = String(file.type || '').toLowerCase();
  // O iOS e alguns Android entregam um .gpx sem tipo, ou como octet-stream/xml: manda a extensão.
  if (!name.endsWith('.gpx') && type !== 'application/gpx+xml') throw new GpxError(GPX_ERRORS.notGpx);
  if (Number(file.size) > GPX_MAX_BYTES) throw new GpxError(GPX_ERRORS.tooLarge);
  let text;
  try {
    text = typeof file.text === 'function'
      ? await file.text()
      : await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result || ''));
        r.onerror = () => reject(r.error);
        r.readAsText(file);
      });
  } catch {
    throw new GpxError(GPX_ERRORS.unreadable);
  }
  return parseGpx(text);
}
