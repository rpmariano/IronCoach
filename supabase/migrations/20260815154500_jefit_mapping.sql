-- IronHealth · Adição de Mapeamento Jefit (Ginásio)

insert into app_screen_mappings (category, app_name, screen_type, detection_keywords, field_mappings, is_trained)
values (
  'gym',
  'Jefit',
  'set_details',
  array[
    'jefit',
    'add exercise',
    'volume (kg)',
    'weight x reps',
    '1rm',
    'exertion',
    'body stats'
  ],
  '{
    "canonical": {
      "exercise_name": "Nome do exercício",
      "reps": "Repetições",
      "weight_kg": "Peso (kg)"
    },
    "enrichment_candidates": {
      "duration_seconds": "Duração do treino (ex: 57m)",
      "exertion": "Nível de esforço / Exertion (ex: 7/10)",
      "volume_total_kg": "Volume total (kg)",
      "one_rep_max_est": "1RM estimado (coluna 1RM)"
    }
  }'::jsonb,
  true
);
