// Conversões de tempo e ritmo da Corrida, e os tipos de prova.
//
// Vive aqui (e não dentro de um componente) porque o registo de corrida e a
// agenda de provas precisam exatamente das mesmas conversões — foi a
// divergência entre os dois que gerou o bug do target_time.

// ---------------------------------------------------------------------------
// Tipos de prova
// ---------------------------------------------------------------------------
// AS CHAVES TÊM DE BATER CERTO com o check constraint de race_events.race_type
// no schema. RunRegistration e RunAgenda tinham cada um a sua lista, ambas com
// 'meia'/'maratona' — valores que a BD rejeita, portanto criar uma meia ou uma
// maratona falhava em qualquer dos ecrãs. Daí a lista viver num sítio só.
//
// `distanceKm` é a distância oficial quando o tipo a determina; null quando não
// (uma prova de 'estrada' ou 'trail' pode ter qualquer distância) — nesses
// casos o utilizador tem de a indicar.
export const RACE_TYPES = [
  { key: '5k',      label: '5 km',                     distanceKm: 5 },
  { key: '10k',     label: '10 km',                    distanceKm: 10 },
  { key: '21k',     label: 'Meia Maratona (21.1 km)',  distanceKm: 21.0975 },
  { key: '42k',     label: 'Maratona (42.2 km)',       distanceKm: 42.195 },
  { key: 'estrada', label: 'Estrada (outra distância)', distanceKm: null },
  { key: 'trail',   label: 'Trail',                    distanceKm: null },
  { key: 'ultra',   label: 'Ultra Trail',              distanceKm: null },
  { key: 'outro',   label: 'Outro',                    distanceKm: null },
];

export function distanceForRaceType(key) {
  return (RACE_TYPES.find(t => t.key === key) || {}).distanceKm ?? null;
}

export function raceTypeLabel(key) {
  return (RACE_TYPES.find(t => t.key === key) || {}).label || key;
}

// Move-se de RunRegistration.jsx sem alteração de comportamento: além do
// tempo-alvo da prova, é isto que interpreta a duração das corridas.
export function parseDurationToSeconds(durStr) {
  if (!durStr) return null;
  const str = durStr.toString().trim().toLowerCase();
  let parts;
  if (str.endsWith('m')) {
    const mins = parseFloat(str.replace('m', ''));
    if (!isNaN(mins)) return Math.round(mins * 60);
  }
  if (str.includes(':')) {
    parts = str.split(':').map(Number);
    if (parts.length === 2) return parts[0] * 60 + parts[1]; // mm:ss
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]; // hh:mm:ss
  }
  const val = parseFloat(str);
  if (!isNaN(val)) return Math.round(val * 60); // assume minutos se for só um número
  return null;
}

export function formatDuration(totalSeconds) {
  if (!totalSeconds) return '';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Ritmo (min/km)
// ---------------------------------------------------------------------------
// Convenção da app: o ritmo é SEMPRE apresentado com ponto a separar minutos de
// segundos — "5.20" são 5min20s/km, não 5,2 minutos. Na entrada aceitamos ponto,
// vírgula ou dois-pontos, porque o utilizador escreve as três; à saída
// normalizamos sempre para ponto.

export function parsePaceToSeconds(paceStr) {
  if (!paceStr) return null;
  const str = paceStr.toString().trim().toLowerCase().replace(/[,:]/g, '.');
  const parts = str.split('.');

  const mins = parseInt(parts[0], 10);
  if (isNaN(mins) || mins < 0) return null;

  if (parts.length === 1) return mins * 60;

  // "5.2" é 5min20s, não 5min02s — o utilizador escreve as dezenas de segundos.
  const secsRaw = parts[1].padEnd(2, '0').slice(0, 2);
  const secs = parseInt(secsRaw, 10);
  if (isNaN(secs) || secs > 59) return null;

  return mins * 60 + secs;
}

export function formatPace(secondsPerKm) {
  if (!secondsPerKm) return '';
  const m = Math.floor(secondsPerKm / 60);
  const s = Math.round(secondsPerKm % 60);
  return `${m}.${s.toString().padStart(2, '0')}`;
}
