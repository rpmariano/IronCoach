-- IronHealth · Adição de Mapeamento Renpho Health (Análise Corporal)

insert into app_screen_mappings (category, app_name, screen_type, detection_keywords, field_mappings, is_trained)
values (
  'body',
  'Renpho Health',
  'body_composition',
  array[
    'renpho health',
    'composição corporal',
    'peso corporal sem gordura',
    'gordura subcutânea',
    'idade metabólica',
    'água corporal'
  ],
  '{
    "canonical": {
      "weight_kg": "Peso",
      "bmi": "IMC",
      "body_fat_pct": "Gordura corporal",
      "skeletal_muscle_pct": "Músculo esquelético",
      "muscle_mass_kg": "Massa Muscular",
      "body_water_pct": "Água corporal",
      "protein_pct": "Proteína",
      "bone_mass_kg": "Massa óssea",
      "bmr_kcal": "TMB",
      "visceral_fat": "Gordura Visceral",
      "subcutaneous_fat_pct": "Gordura subcutânea",
      "metabolic_age": "Idade Metabólica",
      "lean_body_mass_kg": "Peso corporal sem gordura"
    }
  }'::jsonb,
  true
);
