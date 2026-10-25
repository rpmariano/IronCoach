/* A despensa do modo ?demo=true (bug #87): sem Supabase, um alimento normal e
   um genérico com duas variantes ("coxa de frango": com pele, sem pele). */
const base = { in_pantry: true, source: 'manual', edited_by_athlete: false, times_seen: 0, portion_label: null };
export const DEMO_PANTRY_FOODS = [
  { ...base, id: 'demo-f-aveia', name: 'Aveia em flocos', name_key: 'aveia em flocos', times_seen: 5, portion_grams: 40, calories_per_100g: 372, protein_per_100g: 13, carbs_per_100g: 60, fat_per_100g: 7 },
  // O genérico traz os valores da variante mais comum (a com pele).
  { ...base, id: 'demo-f-coxa', name: 'Coxa de frango', name_key: 'coxa de frango', times_seen: 8, portion_grams: 120, calories_per_100g: 216, protein_per_100g: 17, carbs_per_100g: 0, fat_per_100g: 16 },
  { ...base, id: 'demo-f-coxa-com', name: 'Coxa de frango com pele', name_key: 'coxa de frango com pele', parent_id: 'demo-f-coxa', variant_label: 'com pele', times_seen: 6, portion_grams: 120, calories_per_100g: 216, protein_per_100g: 17, carbs_per_100g: 0, fat_per_100g: 16 },
  { ...base, id: 'demo-f-coxa-sem', name: 'Coxa de frango sem pele', name_key: 'coxa de frango sem pele', parent_id: 'demo-f-coxa', variant_label: 'sem pele', times_seen: 2, portion_grams: 100, calories_per_100g: 144, protein_per_100g: 19.7, carbs_per_100g: 0, fat_per_100g: 7.2 },
];
