import { describe, it, expect } from 'vitest';
import { parseGpx, readGpxFile, GPX_ERRORS, GPX_MAX_BYTES, GPX_ACCEPT } from './gpxParse';

const gpx = (body, ns = 'http://www.topografix.com/GPX/1/1') =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="teste" xmlns="${ns}">${body}</gpx>`;
const pt = (tag, lat, lon, ele) => `<${tag} lat="${lat}" lon="${lon}">${ele == null ? '' : `<ele>${ele}</ele>`}<time>2026-11-14T09:00:00Z</time></${tag}>`;

const message = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };

describe('parseGpx', () => {
  it('um GPX válido: os pontos do track com lat, lon e ele', () => {
    const r = parseGpx(gpx(`<metadata><name>Meia de Lisboa — Rui</name></metadata>
      <trk><name>Percurso</name><desc>Privado</desc><trkseg>${pt('trkpt', 38.7, -9.1, 12.5)}${pt('trkpt', 38.71, -9.11, 20)}</trkseg></trk>`));
    expect(r).toEqual({ source: 'trk', points: [{ lat: 38.7, lon: -9.1, ele: 12.5 }, { lat: 38.71, lon: -9.11, ele: 20 }] });
    // Nem o nome nem a descrição entram no resultado.
    expect(JSON.stringify(r)).not.toMatch(/Rui|Percurso|Privado/);
  });

  it('vários trk e trkseg: em sequência, pela ordem do ficheiro', () => {
    const r = parseGpx(gpx(`
      <trk><trkseg>${pt('trkpt', 1, 1, 10)}${pt('trkpt', 2, 2, 11)}</trkseg><trkseg>${pt('trkpt', 3, 3, 12)}</trkseg></trk>
      <trk><trkseg>${pt('trkpt', 4, 4, 13)}</trkseg></trk>`));
    expect(r.points.map((p) => p.lat)).toEqual([1, 2, 3, 4]);
  });

  it('sem track: os pontos da rota (rtept); os waypoints não contam', () => {
    const r = parseGpx(gpx(`${pt('wpt', 9, 9, 99)}<rte>${pt('rtept', 5, 5, 50)}${pt('rtept', 6, 6, 60)}</rte>`));
    expect(r).toEqual({ source: 'rte', points: [{ lat: 5, lon: 5, ele: 50 }, { lat: 6, lon: 6, ele: 60 }] });
  });

  it('GPX 1.0 (outro namespace) e sem namespace também se leem', () => {
    expect(parseGpx(gpx(`<trk><trkseg>${pt('trkpt', 1, 1, 5)}</trkseg></trk>`, 'http://www.topografix.com/GPX/1/0')).points).toHaveLength(1);
    expect(parseGpx(`<gpx><trk><trkseg>${pt('trkpt', 1, 1, 5)}</trkseg></trk></gpx>`).points).toHaveLength(1);
  });

  it('sem altitude: «O GPX não tem altitude»; com alguns pontos sem ele, esses ficam com ele null', () => {
    expect(message(() => parseGpx(gpx(`<trk><trkseg>${pt('trkpt', 1, 1)}${pt('trkpt', 2, 2)}</trkseg></trk>`)))).toBe(GPX_ERRORS.noElevation);
    const r = parseGpx(gpx(`<trk><trkseg>${pt('trkpt', 1, 1, 10)}${pt('trkpt', 2, 2)}</trkseg></trk>`));
    expect(r.points[1]).toEqual({ lat: 2, lon: 2, ele: null });
  });

  it('vazio ou sem pontos válidos: «O GPX não tem pontos»', () => {
    expect(message(() => parseGpx(gpx('<trk><trkseg></trkseg></trk>')))).toBe(GPX_ERRORS.noPoints);
    expect(message(() => parseGpx(gpx(pt('wpt', 1, 1, 1))))).toBe(GPX_ERRORS.noPoints);
    expect(message(() => parseGpx(gpx(`<trk><trkseg>${pt('trkpt', 'x', 1, 1)}${pt('trkpt', 95, 1, 1)}</trkseg></trk>`)))).toBe(GPX_ERRORS.noPoints);
  });

  it('XML inválido, outro XML ou texto: «Este ficheiro não é um GPX»', () => {
    for (const t of ['<gpx><trk>', '<kml><Placemark/></kml>', 'lat,lon\n1,2', '', '   ', null]) {
      expect([t, message(() => parseGpx(t))]).toEqual([t, GPX_ERRORS.notGpx]);
    }
  });
});

describe('readGpxFile', () => {
  const file = (text, name = 'percurso.gpx', type = '') => new File([text], name, { type });
  const ok = gpx(`<trk><trkseg>${pt('trkpt', 1, 1, 10)}</trkseg></trk>`);

  it('lê um .gpx (com ou sem tipo — o iOS entrega-o sem)', async () => {
    await expect(readGpxFile(file(ok))).resolves.toMatchObject({ source: 'trk' });
    await expect(readGpxFile(file(ok, 'PERCURSO.GPX', 'application/octet-stream'))).resolves.toMatchObject({ source: 'trk' });
    await expect(readGpxFile(file(ok, 'percurso', 'application/gpx+xml'))).resolves.toMatchObject({ source: 'trk' });
  });

  it('só .gpx, até 10 MB', async () => {
    await expect(readGpxFile(file(ok, 'percurso.xml', 'text/xml'))).rejects.toThrow(GPX_ERRORS.notGpx);
    await expect(readGpxFile(file(ok, 'percurso.kml'))).rejects.toThrow(GPX_ERRORS.notGpx);
    const grande = { name: 'g.gpx', type: '', size: GPX_MAX_BYTES + 1, text: async () => ok };
    await expect(readGpxFile(grande)).rejects.toThrow(GPX_ERRORS.tooLarge);
    expect(GPX_ACCEPT).toBe('.gpx,application/gpx+xml');
  });
});
