-- IronHealth · Migração de Mapeamento de Apps e Log de Imagens Desconhecidas

create extension if not exists pgcrypto;

-- 1. Tabela de Mapeamento de Ecrãs de Aplicações
create table if not exists app_screen_mappings (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('gym', 'run', 'body')),
  app_name text not null,
  screen_type text not null,
  detection_keywords text[] not null default '{}',
  field_mappings jsonb not null default '{}'::jsonb,
  is_trained boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table app_screen_mappings enable row level security;

drop policy if exists "anyone can read mappings" on app_screen_mappings;
create policy "anyone can read mappings" on app_screen_mappings for select using (true);

drop policy if exists "admin write mappings" on app_screen_mappings;
create policy "admin write mappings" on app_screen_mappings for all using (public.is_admin());

-- 2. Tabela de Logs para Imagens de Apps Não Treinadas / Desconhecidas
create table if not exists unknown_app_image_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  category text not null check (category in ('gym', 'run', 'body')),
  image_path text not null,
  detected_app_guess text,
  best_effort_result jsonb,
  status text not null default 'pending' check (status in ('pending', 'reviewed', 'mapped', 'ignored')),
  admin_notes text,
  created_at timestamptz not null default now()
);

create index if not exists unknown_app_logs_created_idx on unknown_app_image_logs(created_at desc);
create index if not exists unknown_app_logs_status_idx on unknown_app_image_logs(status);

alter table unknown_app_image_logs enable row level security;

drop policy if exists "insert own unknown logs" on unknown_app_image_logs;
create policy "insert own unknown logs" on unknown_app_image_logs for insert with check (auth.uid() = user_id);

drop policy if exists "admin read unknown logs" on unknown_app_image_logs;
create policy "admin read unknown logs" on unknown_app_image_logs for select using (public.is_admin());

drop policy if exists "admin update unknown logs" on unknown_app_image_logs;
create policy "admin update unknown logs" on unknown_app_image_logs for update using (public.is_admin());

drop policy if exists "admin delete unknown logs" on unknown_app_image_logs;
create policy "admin delete unknown logs" on unknown_app_image_logs for delete using (public.is_admin());

-- 3. Bucket para fotos de apps desconhecidas
insert into storage.buckets (id, name, public)
values ('unknown-app-photos', 'unknown-app-photos', true)
on conflict (id) do nothing;

drop policy if exists "authenticated insert unknown photos" on storage.objects;
create policy "authenticated insert unknown photos" on storage.objects
  for insert with check (bucket_id = 'unknown-app-photos' and auth.role() = 'authenticated');

drop policy if exists "public read unknown photos" on storage.objects;
create policy "public read unknown photos" on storage.objects
  for select using (bucket_id = 'unknown-app-photos');

-- 4. Inserção de dados de seed (Mapeamento inicial de apps principais)
insert into app_screen_mappings (category, app_name, screen_type, detection_keywords, field_mappings, is_trained)
values
  -- CORRIDA: Strava
  (
    'run', 'Strava', 'summary',
    array['strava', 'distância', 'tempo de movimento', 'ritmo médio', 'elevação'],
    '{
      "canonical": {
        "distance_km": "Distância (km)",
        "duration_seconds": "Tempo em movimento",
        "avg_pace": "Ritmo médio",
        "elevation_gain_m": "Ganho de elevação",
        "calories_kcal": "Calorias"
      },
      "enrichment_candidates": {
        "avg_watts": "Potência média (W)",
        "suffer_score": "Nível de esforço Strava",
        "estimated_fitness_impact": "Impacto de forma física"
      }
    }'::jsonb,
    true
  ),
  -- CORRIDA: Garmin Connect
  (
    'run', 'Garmin Connect', 'summary',
    array['garmin', 'connect', 'efeito do treino', 'cadência média', 'frequência cardíaca média', 'te aeróbico'],
    '{
      "canonical": {
        "distance_km": "Distância",
        "duration_seconds": "Tempo decorrido",
        "avg_heart_rate_bpm": "FC média",
        "max_heart_rate_bpm": "FC máxima",
        "cadence_spm": "Cadência média de corrida",
        "elevation_gain_m": "Total sob"
      },
      "enrichment_candidates": {
        "aerobic_te": "Efeito do Treino Aeróbico (0-5)",
        "anaerobic_te": "Efeito do Treino Anaeróbico (0-5)",
        "ground_contact_time_ms": "Tempo de contacto com o solo (ms)",
        "vertical_oscillation_cm": "Oscilação vertical (cm)",
        "stride_length_m": "Comprimento da passada (m)",
        "running_power_watts": "Potência de corrida (W)"
      }
    }'::jsonb,
    true
  ),
  -- CORRIDA: Nike Run Club (NRC)
  (
    'run', 'Nike Run Club', 'summary',
    array['nrc', 'nike run club', 'km', 'ritmo', 'bpm', 'nível de esforço'],
    '{
      "canonical": {
        "distance_km": "Quilómetros",
        "duration_seconds": "Duração",
        "avg_heart_rate_bpm": "Frequência cardíaca",
        "calories_kcal": "Calorias"
      },
      "enrichment_candidates": {
        "shoe_model": "Sapatilhas / Equipamento associado"
      }
    }'::jsonb,
    true
  ),
  -- CORRIDA: Apple Fitness
  (
    'run', 'Apple Fitness', 'summary',
    array['exercício de corrida', 'ritmo médio', 'calorias ativas', 'frequência cardíaca média', 'zonas de frequência cardíaca'],
    '{
      "canonical": {
        "distance_km": "Distância",
        "duration_seconds": "Tempo total",
        "avg_heart_rate_bpm": "Frequência cardíaca média",
        "calories_kcal": "Calorias ativas",
        "elevation_gain_m": "Ganho total de elevação",
        "hr_zones": "Zonas de FC"
      },
      "enrichment_candidates": {
        "potencia_media_watts": "Potência de corrida média (W)",
        "comprimento_passada_m": "Comprimento médio da passada",
        "tempo_contacto_solo_ms": "Tempo de contacto com o solo"
      }
    }'::jsonb,
    true
  ),
  -- GINÁSIO: Hevy
  (
    'gym', 'Hevy', 'set_details',
    array['hevy', 'exercício', 'séries', 'reps', 'kg', 'volume total', 'recorde pessoal'],
    '{
      "canonical": {
        "exercise_name": "Nome do exercício",
        "reps": "Repetições",
        "weight_kg": "Carga (kg)",
        "volume_total_kg": "Volume total levantado"
      },
      "enrichment_candidates": {
        "set_rpe": "RPE por série (1-10)",
        "rest_timer_seconds": "Tempo de descanso entre séries",
        "one_rep_max_est": "1RM estimado"
      }
    }'::jsonb,
    true
  ),
  -- GINÁSIO: Strong
  (
    'gym', 'Strong', 'set_details',
    array['strong', 'treino de força', 'série', 'peso', 'reps', '1rm'],
    '{
      "canonical": {
        "exercise_name": "Nome do exercício",
        "reps": "Repetições",
        "weight_kg": "Peso (kg)"
      },
      "enrichment_candidates": {
        "rpe": "RPE",
        "notes": "Notas da série"
      }
    }'::jsonb,
    true
  ),
  -- GINÁSIO: Apple Fitness / Garmin Strength
  (
    'gym', 'Garmin Strength', 'summary',
    array['treino de força', 'séries totais', 'reps totais', 'tempo de descanso', 'carga acumulada'],
    '{
      "canonical": {
        "duration_seconds": "Duração do treino",
        "calories_kcal": "Calorias queimadas",
        "avg_heart_rate_bpm": "FC média"
      },
      "enrichment_candidates": {
        "auto_detected_exercises": "Exercícios detetados automaticamente pelo relógio",
        "work_rest_ratio": "Rácio esforço/descanso"
      }
    }'::jsonb,
    true
  ),
  -- ANÁLISE CORPORAL: Renpho
  (
    'body', 'Renpho Health', 'body_composition',
    array['renpho', 'peso corporal', 'gordura corporal', 'massa muscular', 'água corporal', 'massa óssea', 'gordura visceral'],
    '{
      "canonical": {
        "weight_kg": "Peso",
        "bmi": "IMC",
        "body_fat_pct": "% Gordura Corporal",
        "skeletal_muscle_pct": "Massa Muscular / Músculo Esquelético",
        "muscle_mass_kg": "Massa Muscular (kg)",
        "body_water_pct": "% Água Corporal",
        "protein_pct": "% Proteína",
        "bone_mass_kg": "Massa Óssea",
        "bmr_kcal": "BMR / Metabolismo Basal",
        "visceral_fat": "Gordura Visceral",
        "subcutaneous_fat_pct": "% Gordura Subcutânea",
        "metabolic_age": "Idade Metabólica",
        "lean_body_mass_kg": "Massa Magra"
      },
      "enrichment_candidates": {
        "body_type_score": "Pontuação / Tipo de corpo",
        "skeletal_muscle_kg": "Músculo esquelético em kg"
      }
    }'::jsonb,
    true
  ),
  -- ANÁLISE CORPORAL: Xiaomi Mi Fitness / Zepp Life
  (
    'body', 'Xiaomi Zepp', 'body_composition',
    array['zepp', 'mi fit', 'pontuação de composição corporal', 'gordura corporal', 'músculo', 'água', 'gordura visceral'],
    '{
      "canonical": {
        "weight_kg": "Peso",
        "bmi": "IMC",
        "body_fat_pct": "Gordura Corporal (%)",
        "muscle_mass_kg": "Massa Muscular",
        "body_water_pct": "Água (%)",
        "visceral_fat": "Gordura Visceral",
        "bmr_kcal": "Metabolismo Basal",
        "bone_mass_kg": "Massa Óssea"
      },
      "enrichment_candidates": {
        "body_score": "Pontuação corporal Zepp (0-100)",
        "ideal_weight_kg": "Peso ideal sugerido"
      }
    }'::jsonb,
    true
  ),
  -- ANÁLISE CORPORAL: Withings / Tanita / Huawei
  (
    'body', 'Withings Health Mate', 'body_composition',
    array['withings', 'massa gorda', 'massa magra', 'hidratação', 'massa óssea'],
    '{
      "canonical": {
        "weight_kg": "Peso",
        "body_fat_pct": "% Massa Gorda",
        "lean_body_mass_kg": "Massa Magra",
        "body_water_pct": "Hidratação",
        "bone_mass_kg": "Massa Óssea"
      },
      "enrichment_candidates": {
        "vessel_age": "Idade Vascular",
        "nerve_health_score": "Saúde Nervosa"
      }
    }'::jsonb,
    true
  )
on conflict do nothing;
