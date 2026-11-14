/* O desenho do traçado de uma prova (o `track` do perfil do GPX: [lat, lon, dist_km, alt_m]) num
   SVG, sem mapas nem tiles: uma projeção local equirretangular — a longitude encolhe pelo cosseno
   da latitude média, que numa prova (dezenas de km) é exata o que chega para a forma do percurso.
   O norte fica para cima. A caixa do desenho respeita a proporção do percurso, com margem. */

const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/** O perfil de altitude do track: [dist_km, alt_m], reamostrado para no máximo `max` pontos (o
 *  track tem até 1000, a distâncias iguais; o Chart.js não precisa de tantos). Fica sempre o
 *  último ponto, para o eixo acabar na distância do percurso. */
export function elevationSeries(track, max = 300) {
  if (!Array.isArray(track)) return [];
  const pts = track
    .filter((p) => Array.isArray(p) && finite(p[2]) && finite(p[3]))
    .map((p) => [p[2], p[3]]);
  if (pts.length <= max) return pts;
  const step = (pts.length - 1) / (max - 1);
  const out = [];
  for (let i = 0; i < max; i += 1) out.push(pts[Math.round(i * step)]);
  return out;
}

/** Os pontos [lat, lon] válidos do track (os outros campos não interessam ao desenho). */
export function trackLatLon(track) {
  if (!Array.isArray(track)) return [];
  return track
    .filter((p) => Array.isArray(p) && finite(p[0]) && finite(p[1]) && Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180)
    .map((p) => [p[0], p[1]]);
}

/**
 * O caminho SVG do traçado numa caixa `width` × `height` (a altura ajusta-se à proporção do
 * percurso, entre minH e maxH). Devolve null com menos de 2 pontos.
 * @returns {{ d: string, width: number, height: number, start: [number, number], finish: [number, number], loop: boolean } | null}
 */
export function courseMapPath(track, { width = 320, minH = 140, maxH = 260, pad = 14, start = null, finish = null } = {}) {
  const pts = trackLatLon(track);
  if (pts.length < 2) return null;
  const lat0 = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const xy = pts.map(([lat, lon]) => [lon * k, lat]);
  const xs = xy.map((p) => p[0]);
  const ys = xy.map((p) => p[1]);
  const minX = Math.min(...xs); const maxX = Math.max(...xs);
  const minY = Math.min(...ys); const maxY = Math.max(...ys);
  const spanX = Math.max(maxX - minX, 1e-9);
  const spanY = Math.max(maxY - minY, 1e-9);
  const innerW = width - 2 * pad;
  const height = Math.round(Math.min(maxH, Math.max(minH, innerW * (spanY / spanX) + 2 * pad)));
  const innerH = height - 2 * pad;
  const scale = Math.min(innerW / spanX, innerH / spanY);
  // Centrado na caixa.
  const offX = pad + (innerW - spanX * scale) / 2;
  const offY = pad + (innerH - spanY * scale) / 2;
  const project = ([lat, lon]) => [
    +(offX + (lon * k - minX) * scale).toFixed(1),
    +(offY + (maxY - lat) * scale).toFixed(1),
  ];
  const proj = pts.map(project);
  const d = proj.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ');
  const s = Array.isArray(start) && finite(start[0]) && finite(start[1]) ? project(start) : proj[0];
  const f = Array.isArray(finish) && finite(finish[0]) && finite(finish[1]) ? project(finish) : proj[proj.length - 1];
  // Partida e chegada no mesmo sítio (um circuito): um só marcador, dito como tal.
  const loop = Math.hypot(s[0] - f[0], s[1] - f[1]) < 8;
  return { d, width, height, start: s, finish: f, loop };
}
