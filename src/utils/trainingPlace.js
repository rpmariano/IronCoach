/* Onde o atleta treina (specs/carol-omnisciencia-omnipresenca.md, ação 5.6,
   push B). Procura-se uma vez, no Perfil, na geocodificação da Open-Meteo — a
   mesma casa da previsão que o servidor vai buscar, gratuita e sem chave — e
   o atleta escolhe o sítio certo. Ficam o nome, as coordenadas e a altitude
   (profiles.training_*); o servidor vai direto à previsão
   (supabase/functions/_shared/trainingWeatherFetch.ts) sem voltar a procurar.

   Portugal primeiro: a app é portuguesa, e "Viana" é a do Castelo. Mas corre
   ao lado uma segunda procura, no mundo todo — quem treina em Madrid encontra
   Madrid, e não só uma aldeia portuguesa com o mesmo nome.

   A altitude vem da API de elevação (modelo de terreno), não da
   geocodificação: esta dava 205 m à Covilhã, que está a 700 m. */

const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const ELEVATION_URL = 'https://api.open-meteo.com/v1/elevation';

export const MAX_PLACE_CHOICES = 4;
const MAX_PT_CHOICES = 3;
// Os limites dos checks da migration profile_training_place.
const CITY_MAX_CHARS = 120;
const MIN_ALTITUDE_M = -500;
const MAX_ALTITUDE_M = 9000;

function geocodingUrl(name, countryCode) {
  const params = new URLSearchParams({ name, count: '5', language: 'pt', format: 'json' });
  if (countryCode) params.set('countryCode', countryCode);
  return `${GEOCODING_URL}?${params}`;
}

async function getJson(url, fetchImpl) {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`open-meteo ${res.status}`);
  return res.json();
}

function toPlace(r) {
  const lat = Number(r?.latitude);
  const lon = Number(r?.longitude);
  if (!r?.name || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return {
    id: r.id != null ? String(r.id) : `${lat},${lon}`,
    name: String(r.name),
    region: r.admin1 ? String(r.admin1) : null,
    country: r.country ? String(r.country) : null,
    lat,
    lon,
    altitudeM: null,
  };
}

/** "Lisboa, Portugal"; com a região só quando dois sítios da lista se
    chamariam o mesmo ("Madrid, Iowa, EUA" e "Madrid, Nova Iorque, EUA"). */
export function labelPlaces(places) {
  const base = (p) => [p.name, p.country].filter(Boolean).join(', ');
  const counts = new Map();
  for (const p of places) counts.set(base(p), (counts.get(base(p)) || 0) + 1);
  return places.map((p) => {
    const ambiguous = counts.get(base(p)) > 1 && p.region && p.region !== p.name;
    const label = ambiguous ? [p.name, p.region, p.country].filter(Boolean).join(', ') : base(p);
    return { ...p, label: label.slice(0, CITY_MAX_CHARS) };
  });
}

function validAltitude(v) {
  return typeof v === 'number' && Number.isFinite(v) && v >= MIN_ALTITUDE_M && v <= MAX_ALTITUDE_M
    ? Math.round(v)
    : null;
}

/** Até quatro sítios para o atleta escolher, Portugal primeiro. Lança só se as
    duas procuras falharem; sem nada encontrado, devolve []. */
export async function searchTrainingPlaces(query, { fetchImpl = fetch } = {}) {
  const name = String(query ?? '').trim();
  if (name.length < 2) return [];
  const [pt, world] = await Promise.allSettled([
    getJson(geocodingUrl(name, 'PT'), fetchImpl),
    getJson(geocodingUrl(name), fetchImpl),
  ]);
  if (pt.status === 'rejected' && world.status === 'rejected') throw world.reason;
  // Sem nada encontrado, a Open-Meteo nem traz "results".
  const results = (s) => (s.status === 'fulfilled' && Array.isArray(s.value?.results) ? s.value.results : []);

  const seen = new Set();
  const places = [];
  const add = (r, limit) => {
    const p = toPlace(r);
    if (!p || seen.has(p.id) || places.length >= limit) return;
    seen.add(p.id);
    places.push(p);
  };
  for (const r of results(pt)) add(r, MAX_PT_CHOICES);
  for (const r of results(world)) add(r, MAX_PLACE_CHOICES);
  if (!places.length) return [];

  // A altitude de todos, num só pedido. Se falhar, fica por saber: o servidor
  // usa a da própria previsão.
  try {
    const params = new URLSearchParams({
      latitude: places.map((p) => p.lat).join(','),
      longitude: places.map((p) => p.lon).join(','),
    });
    const body = await getJson(`${ELEVATION_URL}?${params}`, fetchImpl);
    const elevations = Array.isArray(body?.elevation) ? body.elevation : [];
    places.forEach((p, i) => { p.altitudeM = validAltitude(elevations[i]); });
  } catch {
    // sem altitude
  }
  return labelPlaces(places);
}

/** As quatro colunas do perfil, que andam juntas: o sítio escolhido, ou tudo
    a null para o tirar. */
export function trainingPlaceFields(place) {
  if (!place) {
    return { training_city: null, training_lat: null, training_lon: null, training_altitude_m: null };
  }
  return {
    training_city: place.label,
    training_lat: place.lat,
    training_lon: place.lon,
    training_altitude_m: place.altitudeM ?? null,
  };
}
