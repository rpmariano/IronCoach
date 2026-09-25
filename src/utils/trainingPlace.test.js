import { describe, it, expect } from 'vitest';
import { searchTrainingPlaces, labelPlaces, trainingPlaceFields, MAX_PLACE_CHOICES } from './trainingPlace';

// 5.6, push B: a cidade de treino, procurada uma vez no Perfil.

const LISBOA = { id: 2267057, name: 'Lisboa', latitude: 38.72509, longitude: -9.1498, elevation: 68, country: 'Portugal', admin1: 'Distrito de Lisboa' };
const madrid = (id, admin1, country, lat) => ({ id, name: 'Madrid', latitude: lat, longitude: -3.7, country, admin1 });

/** Responde por URL: a procura em Portugal, a do mundo e a da elevação. */
function fakeFetch({ pt = [], world = [], elevation = null, fail = [] } = {}) {
  const calls = [];
  const impl = (url) => {
    calls.push(url);
    const kind = url.includes('/elevation') ? 'elevation' : url.includes('countryCode=PT') ? 'pt' : 'world';
    if (fail.includes(kind)) return Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({}) });
    const body = kind === 'elevation'
      ? { elevation: elevation ?? [] }
      // Sem nada encontrado, a Open-Meteo não traz "results".
      : (kind === 'pt' ? pt : world).length ? { results: kind === 'pt' ? pt : world } : { generationtime_ms: 0.1 };
    return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
  };
  return { impl, calls };
}

describe('searchTrainingPlaces', () => {
  it('Portugal primeiro, sem repetir, com a altitude do terreno num só pedido', async () => {
    const { impl, calls } = fakeFetch({
      pt: [LISBOA],
      world: [LISBOA, madrid(1, 'Cundinamarca', 'Colômbia', 4.7)],
      elevation: [54, 2547],
    });
    const places = await searchTrainingPlaces(' Lisboa ', { fetchImpl: impl });
    expect(places.map((p) => p.label)).toEqual(['Lisboa, Portugal', 'Madrid, Colômbia']);
    // A altitude é a da API de elevação (54), não a da geocodificação (68).
    expect(places[0]).toMatchObject({ lat: 38.72509, lon: -9.1498, altitudeM: 54 });
    expect(calls.filter((u) => u.includes('/elevation'))).toHaveLength(1);
    expect(calls.find((u) => u.includes('/elevation'))).toContain('latitude=38.72509%2C4.7');
    expect(calls.find((u) => u.includes('countryCode=PT'))).toContain('name=Lisboa&count=5&language=pt');
  });

  it('no máximo três de Portugal e quatro ao todo', async () => {
    const pt = [1, 2, 3, 4].map((i) => ({ id: `pt${i}`, name: `Aldeia ${i}`, latitude: 40, longitude: -8, country: 'Portugal' }));
    const world = [5, 6].map((i) => ({ id: `w${i}`, name: `Vila ${i}`, latitude: 41, longitude: 2, country: 'Espanha' }));
    const places = await searchTrainingPlaces('aldeia', { fetchImpl: fakeFetch({ pt, world }).impl });
    expect(places).toHaveLength(MAX_PLACE_CHOICES);
    expect(places.map((p) => p.id)).toEqual(['pt1', 'pt2', 'pt3', 'w5']);
  });

  it('dois sítios com o mesmo nome no mesmo país levam a região', () => {
    const labels = labelPlaces([
      { name: 'Madrid', region: 'Iowa', country: 'EUA' },
      { name: 'Madrid', region: 'Nova Iorque', country: 'EUA' },
      { name: 'Madrid', region: 'Comunidade de Madrid', country: 'Espanha' },
    ]).map((p) => p.label);
    expect(labels).toEqual(['Madrid, Iowa, EUA', 'Madrid, Nova Iorque, EUA', 'Madrid, Espanha']);
  });

  it('sem nada encontrado devolve []; com menos de duas letras nem procura', async () => {
    const { impl, calls } = fakeFetch();
    expect(await searchTrainingPlaces('xqzwv', { fetchImpl: impl })).toEqual([]);
    expect(calls.some((u) => u.includes('/elevation'))).toBe(false);
    calls.length = 0;
    expect(await searchTrainingPlaces(' L ', { fetchImpl: impl })).toEqual([]);
    expect(calls).toEqual([]);
  });

  it('uma procura a falhar não estraga a outra; as duas a falhar lançam', async () => {
    const soMundo = await searchTrainingPlaces('lisboa', { fetchImpl: fakeFetch({ world: [LISBOA], fail: ['pt'] }).impl });
    expect(soMundo.map((p) => p.label)).toEqual(['Lisboa, Portugal']);
    await expect(searchTrainingPlaces('lisboa', { fetchImpl: fakeFetch({ fail: ['pt', 'world'] }).impl })).rejects.toThrow('open-meteo 503');
  });

  it('sem a elevação (ou fora dos limites da coluna), a altitude fica por saber', async () => {
    const semElevacao = await searchTrainingPlaces('lisboa', { fetchImpl: fakeFetch({ pt: [LISBOA], fail: ['elevation'] }).impl });
    expect(semElevacao[0].altitudeM).toBeNull();
    const foraDosLimites = await searchTrainingPlaces('lisboa', { fetchImpl: fakeFetch({ pt: [LISBOA], elevation: [12000] }).impl });
    expect(foraDosLimites[0].altitudeM).toBeNull();
  });
});

describe('trainingPlaceFields', () => {
  it('as quatro colunas andam juntas: o sítio escolhido, ou tudo a null', () => {
    expect(trainingPlaceFields({ label: 'Covilhã, Portugal', lat: 40.28106, lon: -7.50504, altitudeM: 703 })).toEqual({
      training_city: 'Covilhã, Portugal', training_lat: 40.28106, training_lon: -7.50504, training_altitude_m: 703,
    });
    expect(trainingPlaceFields(null)).toEqual({
      training_city: null, training_lat: null, training_lon: null, training_altitude_m: null,
    });
  });
});
