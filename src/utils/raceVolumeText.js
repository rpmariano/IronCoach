import { raceVolumeOutlook } from '@formulas/raceVolumeOutlook.ts';
import { experienceLevelLabel } from './experience';

/* #113/#114 (2026-11-06, aprovado pelo Rui): o volume até à prova lê-se numa só linha, neutra —
   «Corres X km/semana · a meia pede Y · com o plano chegas a Z na semana da prova» — em vez dos
   avisos «Volume de treino insuficiente» (que pareciam acusar o atleta de falhar o plano, quando é
   o plano que não pode subir mais depressa sem passar o limite seguro da carga). Abaixo do que o
   nível pede, uma frase neutra («para completar, não para fazer tempo»); se o ritmo já é de um
   nível acima, di-lo como coisa boa. Os números são os de @formulas/raceVolumeOutlook.ts (dev-back
   e3901569), os mesmos que a Carol recebe. */

const CATEGORY_ASK = {
  '5k': 'os 5 km pedem',
  '10k': 'os 10 km pedem',
  meia: 'a meia pede',
  maratona: 'a maratona pede',
  ultra: 'o ultra pede',
};
const LEVEL_ORDER = ['iniciante', 'basico', 'medio', 'avancado'];

const km = (v) => String(Math.round(Number(v) * 10) / 10).replace('.', ',');

/** O outlook de uma prova com o plano aceite (os itens dos planos aceites; o raceVolumeOutlook só conta corrida). */
export function outlookForRace({ race, profile, runs, coachPlans, coachPlanItems, todayISO }) {
  if (!race?.date || !(Number(race?.distance_km) > 0)) return null;
  const accepted = new Set((coachPlans || []).filter((p) => p?.status === 'aceite').map((p) => p.id));
  const planItems = (coachPlanItems || []).filter((i) => accepted.has(i?.plan_id));
  return raceVolumeOutlook({
    race: { ...race, experience_level: race.experience_level || profile?.experience_level || null },
    runs: runs || [],
    planItems,
    todayISO,
  });
}

/** A linha: «Corres 12 km/semana · a meia pede 35 · com o plano chegas a 23 na semana da prova.» */
export function volumeReadingText(o) {
  if (!o || o.status === 'sem_dados') return null;
  const parts = [];
  if (o.currentWeeklyKm != null) parts.push(`Corres ${km(o.currentWeeklyKm)} km/semana`);
  if (o.recommendedWeeklyKm != null) {
    const ask = CATEGORY_ASK[o.category] || 'a prova pede';
    parts.push(parts.length ? `${ask} ${km(o.recommendedWeeklyKm)}` : `${ask.charAt(0).toUpperCase()}${ask.slice(1)} ${km(o.recommendedWeeklyKm)} km/semana`);
  }
  if (o.projectedWeeklyKm != null) parts.push(`com o plano chegas a ${km(o.projectedWeeklyKm)} na semana da prova`);
  return parts.length ? `${parts.join(' · ')}.` : null;
}

/** A frase de baixo, neutra: abaixo do nível, «para completar»; o ritmo acima do nível, como coisa boa. */
export function volumeReadingNote(o) {
  if (!o || o.status === 'sem_dados') return null;
  const notes = [];
  if (o.status === 'abaixo') notes.push('Com este volume, a prova é para completar, não para fazer tempo — por segurança, o plano não sobe mais depressa.');
  const lvl = LEVEL_ORDER.indexOf(o.level);
  const pace = LEVEL_ORDER.indexOf(o.paceLevel);
  if (o.status === 'abaixo' && pace > lvl && lvl >= 0) notes.push(`O teu ritmo já é de ${experienceLevelLabel(o.paceLevel)}; falta volume.`);
  return notes.length ? notes.join(' ') : null;
}
