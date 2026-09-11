/* Cores das métricas de corpo — ponto 6 do redesenho ("paleta das séries
   de dados"). Eram treze cores avulsas (verdes, azuis, magentas) sem
   relação com as oito com significado; nenhuma delas dizia "corpo". Passam
   a duas, as mesmas que o mock "Dashboard · Corpo" usa na barra de
   composição: rosa (--body) para peso e gordura, violeta (--nutrition)
   para tudo o que é massa magra, músculo, água e osso. Nunca aparecem duas
   ao mesmo tempo no mesmo gráfico — só se vê uma métrica de cada vez — por
   isso não há ambiguidade. Em hexadecimal porque o Chart.js pinta em
   <canvas> e não resolve var(--x); os valores são os de tokens/colors.css. */
const C_MASSA = '#ff5fa8';  // --body
const C_MAGRA = '#c77dff';  // --nutrition

export const BODY_METRICS = [
  { key: 'weight_kg', label: 'Peso', unit: 'kg', dec: 1, color: C_MASSA, good: null },
  { key: 'bmi', label: 'IMC', unit: '', dec: 1, color: C_MASSA, good: 'down' },
  { key: 'body_fat_pct', label: 'Gordura corporal', unit: '%', dec: 1, color: C_MASSA, good: 'down' },
  { key: 'skeletal_muscle_pct', label: 'Músculo esquelético', unit: '%', dec: 1, color: C_MAGRA, good: 'up' },
  { key: 'muscle_mass_kg', label: 'Massa muscular', unit: 'kg', dec: 1, color: C_MAGRA, good: 'up' },
  { key: 'body_water_pct', label: 'Água corporal', unit: '%', dec: 1, color: C_MAGRA, good: 'up' },
  { key: 'protein_pct', label: 'Proteína', unit: '%', dec: 1, color: C_MAGRA, good: 'up' },
  { key: 'bone_mass_kg', label: 'Massa óssea', unit: 'kg', dec: 1, color: C_MAGRA, good: null },
  { key: 'bmr_kcal', label: 'Metabolismo basal', unit: 'kcal', dec: 0, color: C_MASSA, good: 'up' },
  { key: 'visceral_fat', label: 'Gordura visceral', unit: '', dec: 0, color: C_MASSA, good: 'down' },
  { key: 'subcutaneous_fat_pct', label: 'Gordura subcutânea', unit: '%', dec: 1, color: C_MASSA, good: 'down' },
  { key: 'metabolic_age', label: 'Idade metabólica', unit: 'anos', dec: 0, color: C_MASSA, good: 'down' },
  { key: 'lean_body_mass_kg', label: 'Massa magra', unit: 'kg', dec: 1, color: C_MAGRA, good: 'up' }
];

// Idade cronológica a partir da data de nascimento. Deriva-se sempre — nunca
// guardamos a idade, que ficaria errada no primeiro aniversário.
// Serve também para dar sentido a `metabolic_age`: sozinha não diz nada, é a
// diferença face à idade real que interessa.
export function ageFromBirthDate(birthDate) {
  if (!birthDate) return null;
  const born = new Date(birthDate);
  if (isNaN(born.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - born.getFullYear();
  const monthDiff = today.getMonth() - born.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < born.getDate())) age--;

  return age >= 0 && age < 130 ? age : null;
}

export function fmtMetric(metric, val) {
  if (val === null || val === undefined) return '—';
  const num = Number(val);
  return num.toFixed(metric.dec) + (metric.unit ? ` ${metric.unit}` : '');
}
