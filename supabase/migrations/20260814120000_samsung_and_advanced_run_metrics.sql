-- IronHealth · Adição de Mapeamento Samsung Health e Suporte a Métricas Avançadas de Corrida (Biomecânica, Limiares Fisiológicos e Hidratação)

insert into app_screen_mappings (category, app_name, screen_type, detection_keywords, field_mappings, is_trained)
values (
  'run',
  'Samsung Health',
  'summary_and_advanced',
  array[
    'samsung health',
    'galaxy watch',
    'ritmo da passada',
    'detalhes prog. exercícios',
    'métrica de corrida avançada',
    'perda por transpiração estimada',
    'zonas de frequência cardíaca fc la/lan',
    'limiar aeróbio',
    'limiar anaeróbio',
    'tempo contacto',
    'tempo de voo',
    'oscilação vertical',
    'assimetria',
    'rigidez'
  ],
  '{
    "canonical": {
      "distance_km": "Distância (km)",
      "duration_seconds": "Duração exercício / Duração total",
      "avg_heart_rate_bpm": "Freq card média",
      "max_heart_rate_bpm": "Freq card máx",
      "cadence_spm": "Cadência méd.",
      "max_cadence_spm": "Cadência máx.",
      "calories_kcal": "Calorias perdidas em treino",
      "elevation_gain_m": "Ganho elevação",
      "vo2_max": "VO2 máx."
    },
    "enrichment_candidates": {
      "sweat_loss_ml": "Perda por transpiração estimada (ml)",
      "recommended_hydration_ml": "Recomendação de reposição hídrica (ml)",
      "total_steps": "Passos totais",
      "max_pace_seconds_per_km": "Passada máx. / Ritmo máximo",
      "elevation_loss_m": "Descida total de elevação (m)",
      "aerobic_threshold_bpm": "FC LA - Limiar Aeróbio (bpm)",
      "anaerobic_threshold_bpm": "FC LAn - Limiar Anaeróbio (bpm)",
      "hr_recovery_bpm": "Recuperação da frequência cardíaca",
      "ground_contact_time_ms": "Tempo contacto (ms)",
      "flight_time_ms": "Tempo de voo (ms)",
      "vertical_oscillation_cm": "Oscilação vertical (cm)",
      "asymmetry_pct": "Assimetria (% Ótimo/Bom)",
      "leg_stiffness_kn_m": "Rigidez (kN/m)",
      "regularity_score": "Regularidade"
    }
  }'::jsonb,
  true
)
on conflict do nothing;
