export const BODY_METRICS = [
  { key: 'weight_kg', label: 'Peso', unit: 'kg', dec: 1, color: '#dd3c71', good: null },
  { key: 'bmi', label: 'IMC', unit: '', dec: 1, color: '#da2fd7', good: 'down' },
  { key: 'body_fat_pct', label: 'Gordura corporal', unit: '%', dec: 1, color: '#dd3c94', good: 'down' },
  { key: 'skeletal_muscle_pct', label: 'Músculo esquelético', unit: '%', dec: 1, color: '#468f19', good: 'up' },
  { key: 'muscle_mass_kg', label: 'Massa muscular', unit: 'kg', dec: 1, color: '#2c931a', good: 'up' },
  { key: 'body_water_pct', label: 'Água corporal', unit: '%', dec: 1, color: '#2b82da', good: 'up' },
  { key: 'protein_pct', label: 'Proteína', unit: '%', dec: 1, color: '#5f8b18', good: 'up' },
  { key: 'bone_mass_kg', label: 'Massa óssea', unit: 'kg', dec: 1, color: '#643cdd', good: null },
  { key: 'bmr_kcal', label: 'Metabolismo basal', unit: 'kcal', dec: 0, color: '#768618', good: 'up' },
  { key: 'visceral_fat', label: 'Gordura visceral', unit: '', dec: 0, color: '#bc3cdd', good: 'down' },
  { key: 'subcutaneous_fat_pct', label: 'Gordura subcutânea', unit: '%', dec: 1, color: '#1a9324', good: 'down' },
  { key: 'metabolic_age', label: 'Idade metabólica', unit: 'anos', dec: 0, color: '#1a9340', good: 'down' },
  { key: 'lean_body_mass_kg', label: 'Massa magra', unit: 'kg', dec: 1, color: '#198f89', good: 'up' }
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
