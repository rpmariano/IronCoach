import { formatPaceMinKm as sharedFormatPaceMinKm } from '@formulas/paceFormat.ts';
// Conversões de tempo e ritmo da Corrida, e os tipos de prova.
//
// Vive aqui (e não dentro de um componente) porque o registo de corrida e a
// agenda de provas precisam exatamente das mesmas conversões — foi a
// divergência entre os dois que gerou o bug do target_time.

// ---------------------------------------------------------------------------
// Tipos e distâncias de prova (Agenda de Provas)
// ---------------------------------------------------------------------------
// AS CHAVES TÊM DE BATER CERTO com o check constraint de race_events.race_type
// no schema — só distingue o piso, porque é isso que muda o formulário (D+ só
// faz sentido em trail); a distância é um campo à parte (ver abaixo).
export const RACE_TERRAIN_TYPES = [
  { key: 'estrada', label: 'Estrada' },
  { key: 'trail', label: 'Trail' },
];

export function raceTerrainLabel(key) {
  return (RACE_TERRAIN_TYPES.find(t => t.key === key) || {}).label || key;
}

// Distâncias fixas que o utilizador escolhe — a mesma lista alimenta o select
// e a pílula do cartão em RunAgenda. 21.0975/42.195 usam a distância oficial
// (não 21/42 redondos) e têm o nome próprio da prova em vez de "X km".
export const RACE_DISTANCE_OPTIONS = [
  { km: 5, label: '5 km' },
  { km: 8, label: '8 km' },
  { km: 10, label: '10 km' },
  { km: 15, label: '15 km' },
  { km: 21.0975, label: 'Meia Maratona' },
  { km: 42.195, label: 'Maratona' },
  { km: 50, label: '50 km' },
  { km: 60, label: '60 km' },
  { km: 70, label: '70 km' },
  { km: 80, label: '80 km' },
  { km: 90, label: '90 km' },
  { km: 100, label: '100 km' },
];

// ---------------------------------------------------------------------------
// Prioridade da prova
// ---------------------------------------------------------------------------
// Decide o taper: uma prova principal leva 10-21 dias de polimento, uma prova
// de treino leva só 2-4. Sem esta distinção o coach aplicaria taper longo a
// tudo, prejudicando quem usa provas como treino.
// Chaves têm de bater certo com o check de race_events.race_priority — ver
// supabase/migrations/20260809120000_resting_hr_race_priority.sql.
export const RACE_PRIORITIES = [
  { key: 'a', label: 'Principal', description: 'Objetivo da época — leva taper completo.' },
  { key: 'b', label: 'Secundária', description: 'Importante, mas não é o foco — taper curto.' },
  { key: 'c', label: 'Treino', description: 'Corrida a sério dentro do plano — taper curto (2-4 dias).' },
];

export function racePriorityLabel(key) {
  return (RACE_PRIORITIES.find(p => p.key === key) || {}).label || key;
}

export function racePriorityDescription(key) {
  return (RACE_PRIORITIES.find(p => p.key === key) || {}).description || '';
}

// Etiqueta da pílula a partir da distância gravada — cai para "X km" numa
// prova antiga com uma distância fora da lista fixa (ex.: dados anteriores a
// esta reorganização).
export function raceDistanceLabel(km) {
  if (km == null) return '';
  const match = RACE_DISTANCE_OPTIONS.find(o => Math.abs(o.km - km) < 0.01);
  if (match) return match.label;
  const rounded = Math.round(km * 100) / 100;
  return `${rounded} km`;
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

// Delega em @formulas/paceFormat.ts (T1.5) — única implementação, partilhada
// com a Carol (specs/formulas-checklist.md Fase F). O formato de PONTO
// ("5.20") é o canónico da app desde a Fase D.
export function formatPace(secondsPerKm) {
  return sharedFormatPaceMinKm(secondsPerKm);
}
