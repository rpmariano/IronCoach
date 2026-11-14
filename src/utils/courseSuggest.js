/* O GPX diz uma distância e um D+; a prova tem os seus (distance_km, elevation_gain_m). Quando
   não batem, o formulário SUGERE os do GPX e o atleta confirma — nunca se mudam sozinhos (decisão
   do Backend, 2026-11-14: é isso que mantém a previsão, o nível e a viabilidade coerentes entre o
   ecrã e o servidor).

   Diferença que conta: distância a mais de 2% (e pelo menos 200 m); D+ a mais de 10% (e pelo menos
   20 m) — um GPX de relógio nunca bate ao metro com a distância oficial. Sem valor na prova, o do
   GPX sugere-se sempre. */

const num = (v) => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** { distance_km?, elevation_gain_m? } a sugerir (só o que difere), ou null. */
export function courseSuggestions(profile, race) {
  if (!profile) return null;
  const out = {};
  const gpxKm = num(profile.distance_km);
  const raceKm = num(race?.distance_km);
  if (gpxKm && (!raceKm || Math.abs(gpxKm - raceKm) > Math.max(0.2, raceKm * 0.02))) {
    out.distance_km = Math.round(gpxKm * 10) / 10;
  }
  const gpxGain = Number(profile.gain_m);
  const raceGain = num(race?.elevation_gain_m);
  if (Number.isFinite(gpxGain) && gpxGain >= 0 && (raceGain == null ? gpxGain >= 20 : Math.abs(gpxGain - raceGain) > Math.max(20, raceGain * 0.1))) {
    out.elevation_gain_m = Math.round(gpxGain);
  }
  return Object.keys(out).length ? out : null;
}
