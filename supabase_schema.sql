-- IronHealth v2 · Schema Supabase (nutrição por foto)
-- Substitui por completo o schema v1. Corre no SQL Editor do projeto.

create extension if not exists pgcrypto;

-- ============ limpar schema v1 ============
drop table if exists coach_logs cascade;
drop table if exists checklist_days cascade;
drop table if exists body_metrics cascade;
drop table if exists meals cascade;
drop table if exists pain_logs cascade;

-- ============ profiles: metas individuais por utilizador ============
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  calorie_goal numeric not null default 2000,
  protein_goal numeric not null default 150,
  carbs_goal numeric not null default 200,
  fat_goal numeric not null default 70,
  accent_color text not null default 'amber'
    check (accent_color in ('orange','amber','coral','teal','sky','steel','plum','fuchsia','pink','green','lime','turquoise')),
  theme text not null default 'dark'
    check (theme in ('dark','light')),
  coach_context text not null default '',
  height_cm numeric,
  weight_kg numeric,
  gender text check (gender in ('F','M')),
  created_at timestamptz not null default now()
);
alter table profiles enable row level security;
create policy "own profile" on profiles for all
  using (auth.uid() = id) with check (auth.uid() = id);

-- objetivos do módulo "Corpo" — um por métrica de body_assessments, todos
-- opcionais. Adicionados depois da criação da tabela: idempotente para BDs
-- já existentes.
alter table profiles
  add column if not exists goal_weight_kg numeric,
  add column if not exists goal_bmi numeric,
  add column if not exists goal_body_fat_pct numeric,
  add column if not exists goal_skeletal_muscle_pct numeric,
  add column if not exists goal_muscle_mass_kg numeric,
  add column if not exists goal_body_water_pct numeric,
  add column if not exists goal_protein_pct numeric,
  add column if not exists goal_bone_mass_kg numeric,
  add column if not exists goal_bmr_kcal numeric,
  add column if not exists goal_visceral_fat numeric,
  add column if not exists goal_subcutaneous_fat_pct numeric,
  add column if not exists goal_metabolic_age numeric,
  add column if not exists goal_lean_body_mass_kg numeric;

-- disposição personalizável dos cartões de estatística no Início (o cartão
-- de calorias é sempre fixo/primeiro e não faz parte desta lista) — array
-- ordenado de chaves de HOME_CARD_DEFS (ver index.html); chaves fora da
-- lista ficam desativadas.
alter table profiles
  add column if not exists home_layout jsonb not null
    default '["weight_kg","body_fat_pct","gym_sessions","corrida_km","corrida_pace"]'::jsonb;

-- lembretes de água (módulo de hidratação + send-water-reminders). As horas de
-- início/fim são em hora local de Lisboa, não UTC — ver 5.3 do PRD.
alter table profiles
  add column if not exists water_goal_ml integer not null default 2000,
  add column if not exists water_reminder_enabled boolean not null default false,
  add column if not exists water_reminder_interval_minutes integer not null default 120,
  add column if not exists water_last_activity_at timestamptz,
  add column if not exists water_reminder_muted_date date,
  add column if not exists water_reminder_start_hour smallint not null default 8
    check (water_reminder_start_hour between 0 and 23),
  add column if not exists water_reminder_end_hour smallint not null default 22
    check (water_reminder_end_hour between 0 and 23);

-- flag de administrador, lida por public.is_admin() nas políticas "admin read all"
alter table profiles
  add column if not exists is_admin boolean not null default false;

-- Data de nascimento — nunca a idade: uma coluna `age` fica errada no primeiro
-- aniversário. A idade deriva-se em runtime. Necessária para zonas de FC e
-- ajuste de necessidades nutricionais.
alter table profiles
  add column if not exists birth_date date;

-- Nível GERAL do atleta como corredor — editável no Perfil, junto do nome,
-- género e data de nascimento. Distinto de race_events.experience_level (o
-- nível autodeclarado por prova, mais abaixo neste ficheiro): este é o que
-- calibra o que é comum a todos os treinos, não ligado a uma prova em concreto.
-- Ver supabase/migrations/20260809000000_experience_level.sql.
alter table profiles
  add column if not exists experience_level text
    check (experience_level is null or experience_level in ('iniciante', 'basico', 'medio', 'avancado'));

-- FC em repouso — pedida por dois usos independentes: fórmula de Karvonen
-- (zonas de FC mais precisas que %FCmáx simples) e linha de base do sinal de
-- sobreuso (subida sustentada de 5-7 bpm precede lesão). Nullable: sem ela as
-- zonas caem para %FCmáx. Ver specs/coach-investigacao.md, Corrida 2.2 #4/2.4 #2
-- e supabase/migrations/20260809120000_resting_hr_race_priority.sql.
alter table profiles
  add column if not exists resting_hr_bpm integer
    check (resting_hr_bpm is null or (resting_hr_bpm between 25 and 120));

-- perfil criado automaticamente no signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)))
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- perfis para contas já existentes (criadas antes da trigger)
insert into public.profiles (id, display_name)
select id, split_part(email,'@',1) from auth.users
on conflict (id) do nothing;

-- ============ meals: uma refeição fotografada ============
create table meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  meal_type text not null check (meal_type in ('pequeno-almoco','lanche-manha','almoco','lanche','jantar','ceia')),
  photo_paths text[] not null default '{}',
  status text not null default 'ready' check (status in ('pending','analyzing','ready','failed')),
  notes text,
  created_at timestamptz not null default now()
);
create index meals_user_date_idx on meals(user_id, date);
alter table meals enable row level security;
create policy "own rows" on meals for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Análise escrita pelo especialista de nutrição (analyze-meal). Texto livre —
-- ver specs/coach-investigacao.md para a passagem a veredito estruturado.
alter table meals add column if not exists coach_notes text;

-- ============ meal_items: itens detetados, valores por 100g ============
-- Guardar por 100g permite reescalar a quantidade no cliente por simples
-- multiplicação, sem nova chamada à IA.
create table meal_items (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null references meals(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  quantity_grams numeric not null check (quantity_grams >= 0),
  calories_per_100g numeric not null default 0,
  protein_per_100g numeric not null default 0,
  carbs_per_100g numeric not null default 0,
  fat_per_100g numeric not null default 0,
  fiber_per_100g numeric not null default 0,
  sugar_per_100g numeric not null default 0,
  sodium_per_100g numeric not null default 0,
  iron_mg_per_100g numeric,
  calcium_mg_per_100g numeric,
  vitamin_c_mg_per_100g numeric,
  potassium_mg_per_100g numeric,
  created_at timestamptz not null default now()
);
create index meal_items_meal_idx on meal_items(meal_id);
create index meal_items_user_idx on meal_items(user_id);
alter table meal_items enable row level security;
create policy "own rows" on meal_items for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============ coach_messages: histórico de conversa com o coach IA ============
create table coach_messages (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users(id) on delete cascade,
  role       text        not null check (role in ('user','model')),
  content    text        not null,
  created_at timestamptz not null default now()
);
create index coach_messages_user_time_idx on coach_messages(user_id, created_at);
alter table coach_messages enable row level security;
create policy "own rows" on coach_messages for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============ storage: bucket privado com pasta por utilizador ============
insert into storage.buckets (id, name, public)
values ('meal-photos', 'meal-photos', false)
on conflict (id) do nothing;

drop policy if exists "own folder select" on storage.objects;
drop policy if exists "own folder insert" on storage.objects;
drop policy if exists "own folder update" on storage.objects;
drop policy if exists "own folder delete" on storage.objects;

create policy "own folder select" on storage.objects for select
  using (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own folder insert" on storage.objects for insert
  with check (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own folder update" on storage.objects for update
  using (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own folder delete" on storage.objects for delete
  using (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ============ admin: menu escondido (duplo clique no logo), só para o email fixo abaixo ============
create or replace function public.is_admin()
returns boolean language sql stable as $$
  select (auth.jwt() ->> 'email') = 'rpmariano@gmail.com';
$$;

-- acesso de leitura total (além das políticas "own rows" já existentes, que se mantêm)
create policy "admin read all" on profiles for select using (public.is_admin());
create policy "admin read all" on meals for select using (public.is_admin());
create policy "admin read all" on meal_items for select using (public.is_admin());
create policy "admin read all" on coach_messages for select using (public.is_admin());

-- lista de utilizadores com email (auth.users não é exposto diretamente ao cliente)
create or replace function public.admin_list_users()
returns table(id uuid, email text, display_name text, created_at timestamptz, theme text, accent_color text)
language sql security definer set search_path = public as $$
  select u.id, u.email, p.display_name, u.created_at, p.theme, p.accent_color
  from auth.users u
  join public.profiles p on p.id = u.id
  where public.is_admin()
  order by u.created_at desc;
$$;
grant execute on function public.admin_list_users() to authenticated;

-- ============ app_logs: registo de sucesso/erro das operações principais ============
-- Eventos que chamam o Gemini (meal_analysis, meal_reanalysis,
-- meal_item_estimate, body_analysis, body_reanalysis, coach_message) gravam
-- também `meta.input_tokens`/`meta.output_tokens` (de usageMetadata da
-- resposta) — usados pelo painel admin (aba "Custos API") para estimar o
-- custo real da API a partir do preço por milhão de tokens do modelo.
create table app_logs (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        references auth.users(id) on delete set null,
  level      text        not null check (level in ('success','error')),
  event      text        not null,
  message    text,
  meta       jsonb,
  created_at timestamptz not null default now()
);
create index app_logs_created_idx on app_logs(created_at desc);
alter table app_logs enable row level security;
create policy "insert own logs" on app_logs for insert with check (auth.uid() = user_id);
create policy "admin read all logs" on app_logs for select using (public.is_admin());

-- ============ body_assessments: avaliação corporal a partir de prints Renpho ============
-- Cada linha é uma avaliação (1+ prints da app Renpho Health) analisada pelo
-- Gemini, que extrai as métricas de composição corporal e escreve um breve
-- resumo com comparação ao histórico. Uma métrica por coluna (todas opcionais)
-- para simplificar a leitura e os gráficos de evolução, à imagem da Nutrição.
-- Idempotente: pode correr numa BD já existente sem apagar dados.
create table if not exists body_assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  photo_paths text[] not null default '{}',
  status text not null default 'ready' check (status in ('pending','analyzing','ready','failed')),
  notes text,
  ai_summary text,
  -- classificação Renpho por métrica: { "weight_kg": "Ligeiramente alto", ... }
  classifications jsonb,
  -- métricas de composição corporal (Renpho) — todas opcionais
  weight_kg numeric,
  bmi numeric,
  body_fat_pct numeric,
  skeletal_muscle_pct numeric,
  muscle_mass_kg numeric,
  body_water_pct numeric,
  protein_pct numeric,
  bone_mass_kg numeric,
  bmr_kcal numeric,
  visceral_fat numeric,
  subcutaneous_fat_pct numeric,
  metabolic_age numeric,
  lean_body_mass_kg numeric,
  created_at timestamptz not null default now()
);
-- coluna adicionada mais tarde: garante que BDs já existentes a recebem.
alter table body_assessments add column if not exists classifications jsonb;
create index if not exists body_assessments_user_date_idx on body_assessments(user_id, date);
alter table body_assessments enable row level security;

drop policy if exists "own rows" on body_assessments;
create policy "own rows" on body_assessments for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "admin read all" on body_assessments;
create policy "admin read all" on body_assessments for select using (public.is_admin());

-- ============ storage: bucket privado para os prints de avaliação corporal ============
insert into storage.buckets (id, name, public)
values ('body-photos', 'body-photos', false)
on conflict (id) do nothing;

drop policy if exists "body own folder select" on storage.objects;
drop policy if exists "body own folder insert" on storage.objects;
drop policy if exists "body own folder update" on storage.objects;
drop policy if exists "body own folder delete" on storage.objects;

create policy "body own folder select" on storage.objects for select
  using (bucket_id = 'body-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "body own folder insert" on storage.objects for insert
  with check (bucket_id = 'body-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "body own folder update" on storage.objects for update
  using (bucket_id = 'body-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "body own folder delete" on storage.objects for delete
  using (bucket_id = 'body-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================================
-- ============ VERTICAL DE GINÁSIO ===========================================
-- ============================================================================
-- Sem biblioteca de exercícios nem planos — o Ginásio segue a mesma filosofia
-- da Nutrição (a app é só a superfície de registo; o Coach é que orienta):
-- uma sessão é registada por upload de print (a IA interpreta e grava) ou
-- manualmente, podendo conter vários exercícios, cada um com as suas séries.
-- O nome do exercício é texto livre (sem tabela de referência) — ver
-- exercise_name em workout_session_sets.

-- ---- sessões de treino (o "log"; ≈ "meals" da Nutrição) ----
create table workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  name text not null default '',
  status text not null default 'em-curso' check (status in ('em-curso','concluido')),
  notes text,
  photo_paths text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index workout_sessions_user_date_idx on workout_sessions(user_id, date);
alter table workout_sessions enable row level security;
create policy "own rows" on workout_sessions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "admin read all" on workout_sessions for select using (public.is_admin());

-- Métricas da sessão, todas opcionais (vêm do registo manual ou do print).
-- `categories` guarda os grupos musculares / tipo de aula escolhidos no cliente
-- (ver GYM_CATEGORIES em src/components/Gym/GymRegistration.jsx) — é o que
-- permite calcular volume semanal por grupo muscular.
-- `exertion` é o RPE 1-10 da sessão, equivalente a runs.effort_rpe.
alter table workout_sessions
  add column if not exists kind text not null default 'forca'
    check (kind in ('forca', 'aula')),
  add column if not exists duration_seconds integer
    check (duration_seconds is null or duration_seconds > 0),
  add column if not exists calories_kcal integer
    check (calories_kcal is null or calories_kcal >= 0),
  add column if not exists avg_hr integer
    check (avg_hr is null or (avg_hr > 0 and avg_hr < 300)),
  add column if not exists max_hr integer
    check (max_hr is null or (max_hr > 0 and max_hr < 300)),
  add column if not exists categories text[] not null default '{}',
  add column if not exists exertion smallint
    check (exertion is null or (exertion between 1 and 10)),
  add column if not exists coach_notes text;

-- ---- sets registados numa sessão (≈ "meal_items" da Nutrição) ----
create table workout_session_sets (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references workout_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_name text not null,
  set_index int not null default 0,
  reps int,
  weight numeric,
  created_at timestamptz not null default now()
);
create index workout_session_sets_session_idx on workout_session_sets(session_id);
alter table workout_session_sets enable row level security;
create policy "own rows" on workout_session_sets for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "admin read all" on workout_session_sets for select using (public.is_admin());

-- ============ storage: prints de sessões de ginásio (bucket privado) ============
insert into storage.buckets (id, name, public)
values ('gym-photos', 'gym-photos', false)
on conflict (id) do nothing;

drop policy if exists "gym own folder select" on storage.objects;
drop policy if exists "gym own folder insert" on storage.objects;
drop policy if exists "gym own folder update" on storage.objects;
drop policy if exists "gym own folder delete" on storage.objects;

create policy "gym own folder select" on storage.objects for select
  using (bucket_id = 'gym-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "gym own folder insert" on storage.objects for insert
  with check (bucket_id = 'gym-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "gym own folder update" on storage.objects for update
  using (bucket_id = 'gym-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "gym own folder delete" on storage.objects for delete
  using (bucket_id = 'gym-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ============ runs: registo de corridas (manual ou upload de prints) ============
-- kind: 'simples' (corrida normal) | 'treino' (com training_type) | 'competicao'.
-- distance_km/duration_seconds deixaram de ser sempre obrigatórias (um treino
-- de sprints pode não ter uma distância/duração total única) — a validação
-- passa a depender do kind no cliente/edge function.
create table runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  distance_km numeric check (distance_km is null or distance_km > 0),
  duration_seconds integer check (duration_seconds is null or duration_seconds > 0),
  notes text,
  created_at timestamptz not null default now(),
  photo_paths text[] not null default '{}',
  kind text not null default 'simples' check (kind in ('simples', 'treino', 'competicao')),
  -- 'sprints' mantido só por compatibilidade com registos antigos — já não é
  -- oferecido no ecrã (ver RUN_TRAINING_TYPES no cliente).
  training_type text check (training_type is null or training_type in (
    'continuo', 'longo', 'tempo', 'recuperacao', 'fartlek',
    'intervalos', 'subidas', 'trail', 'tecnico', 'sprints'
  )),
  details jsonb
);
create index runs_user_date_idx on runs(user_id, date desc);
alter table runs enable row level security;
create policy "own rows" on runs for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "admin read all" on runs for select using (public.is_admin());

-- Splits opcionais (tempo em segundos até essa distância, dentro da mesma
-- corrida) — usados no Início para o "melhor pace aos 5/10/21 km" refletir o
-- troço real em vez do pace médio da corrida inteira. Nunca obrigatórios:
-- sem split guardado, os cartões caem no pace médio como antes.
alter table runs add column if not exists split_5k_seconds integer check (split_5k_seconds is null or split_5k_seconds > 0);
alter table runs add column if not exists split_10k_seconds integer check (split_10k_seconds is null or split_10k_seconds > 0);
alter table runs add column if not exists split_21k_seconds integer check (split_21k_seconds is null or split_21k_seconds > 0);

-- Nível de esforço percebido (RPE 1-10), opcional, partilhado por registo
-- manual e por IA — sempre reportado pelo utilizador, nunca inferido.
alter table runs add column if not exists effort_rpe smallint check (effort_rpe is null or (effort_rpe between 1 and 10));

-- Nome da corrida (obrigatório na app, sugerido automaticamente a partir do
-- tipo de treino + período do dia — ex.: "Treino Contínuo matinal"). Nullable
-- na BD para não partir registos antigos sem nome.
alter table runs add column if not exists name text;

-- Análise escrita pelo especialista de corrida (analyze-run). Ver meals.coach_notes.
alter table runs add column if not exists coach_notes text;

-- ============ storage: prints de corridas (bucket privado) ============
insert into storage.buckets (id, name, public)
values ('run-photos', 'run-photos', false)
on conflict (id) do nothing;

drop policy if exists "run own folder select" on storage.objects;
drop policy if exists "run own folder insert" on storage.objects;
drop policy if exists "run own folder update" on storage.objects;
drop policy if exists "run own folder delete" on storage.objects;

create policy "run own folder select" on storage.objects for select
  using (bucket_id = 'run-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "run own folder insert" on storage.objects for insert
  with check (bucket_id = 'run-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "run own folder update" on storage.objects for update
  using (bucket_id = 'run-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "run own folder delete" on storage.objects for delete
  using (bucket_id = 'run-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ============ race_events: agenda de provas (sub-tab "Agenda" da Corrida) ============
-- `race_type` só distingue o piso (estrada/trail) — a distância é um campo à
-- parte (`distance_km`, ver abaixo) e o antigo enum de 8 valores (5k/10k/21k/
-- 42k/ultra/outro incluídos) foi apertado para estes dois diretamente na BD,
-- sem passar por `supabase/migrations/`. Ver src/utils/run.js:RACE_TERRAIN_TYPES.
create table race_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  name text not null,
  race_type text not null check (race_type in ('estrada', 'trail')),
  location text,
  equipment text,
  target_time text,
  notes text,
  status text not null default 'agendada' check (status in ('agendada', 'concluida')),
  created_at timestamptz not null default now()
);
create index race_events_user_date_idx on race_events(user_id, date);
alter table race_events enable row level security;
create policy "own rows" on race_events for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "admin read all" on race_events for select using (public.is_admin());

-- Objetivo da prova em formato computável. `target_time` (text) mantém-se como
-- o que o utilizador escreveu; estas três são o que o coach consegue calcular.
-- Ritmo e tempo total são objetivos distintos — daí colunas separadas.
-- Ver supabase/migrations/20260807120000_coach_data_model.sql.
alter table race_events
  add column if not exists target_time_seconds integer
    check (target_time_seconds is null or target_time_seconds > 0),
  add column if not exists target_pace_seconds_per_km integer
    check (target_pace_seconds_per_km is null or target_pace_seconds_per_km > 0),
  add column if not exists distance_km numeric
    check (distance_km is null or distance_km > 0);

-- `location`, `target_time`, `target_time_seconds`, `target_pace_seconds_per_km`
-- e `distance_km` passaram a NOT NULL diretamente na BD (RunAgenda.jsx exige os
-- cinco no formulário — ver 3.4 do PRD). Aplicado sem ficheiro de migração
-- próprio; registado aqui a posteriori, tal como o piso e o D+ acima.
alter table race_events
  alter column location set not null,
  alter column target_time set not null,
  alter column target_time_seconds set not null,
  alter column target_pace_seconds_per_km set not null,
  alter column distance_km set not null;

-- Site oficial e desnível acumulado (só relevante em trail — RunAgenda.jsx
-- só mostra o campo quando race_type = 'trail'). Aplicadas diretamente na BD,
-- sem ficheiro de migração próprio — registadas aqui a posteriori.
alter table race_events
  add column if not exists website text,
  add column if not exists elevation_gain_m numeric
    check (elevation_gain_m is null or elevation_gain_m >= 0);

-- Nível AUTODECLARADO do atleta para esta prova — não herda de
-- profiles.experience_level (ver abaixo). É a peça que resolve um avançado em
-- estrada que é iniciante na primeira prova de trail.
-- Ver supabase/migrations/20260809000000_experience_level.sql.
alter table race_events
  add column if not exists experience_level text
    check (experience_level is null or experience_level in ('iniciante', 'basico', 'medio', 'avancado'));

-- Prioridade da prova — decide o taper: principal leva 10-21 dias de
-- polimento, prova de treino leva só 2-4. Omissão 'a' porque errar por excesso
-- de taper é mais seguro que por defeito. Ver Corrida 2.3 #1 em
-- specs/coach-investigacao.md.
alter table race_events
  add column if not exists race_priority text not null default 'a'
    check (race_priority in ('a', 'b', 'c'));

-- ============ water_logs: registos de hidratação ============
-- Uma linha por adição de água (não um total diário) — o Início soma por dia.
create table if not exists water_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  date date not null,
  amount_ml integer not null,
  created_at timestamptz not null default now()
);
create index if not exists water_logs_user_date_idx on water_logs(user_id, date);
alter table water_logs enable row level security;
drop policy if exists "own rows" on water_logs;
create policy "own rows" on water_logs for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "admin read all" on water_logs;
create policy "admin read all" on water_logs for select using (public.is_admin());

-- ============ push_subscriptions: subscrições Web Push (PWA) ============
-- Escrita por save-push-subscription, lida por send-water-reminders.
-- `endpoint` é único: o browser reemite o mesmo endpoint para a mesma
-- instalação, portanto o upsert por endpoint evita duplicados.
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on push_subscriptions(user_id);
alter table push_subscriptions enable row level security;
drop policy if exists "own rows" on push_subscriptions;
create policy "own rows" on push_subscriptions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "admin read all" on push_subscriptions;
create policy "admin read all" on push_subscriptions for select using (public.is_admin());

-- ============ coach_plans / coach_plan_items: plano de treino acordado ============
-- Ver specs/plano-de-treino.md. Os objetivos de nutrição do dia NÃO são
-- gravados aqui — calculam-se a partir destes itens (src/utils/nutrition.js),
-- para uma mudança de data corrigir os dois dias sozinha.
create table if not exists coach_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'proposto' check (status in ('proposto', 'aceite', 'recusado')),
  period_start date not null,
  period_end date not null,
  summary text,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);
create index if not exists coach_plans_user_idx on coach_plans(user_id, period_start desc);
alter table coach_plans enable row level security;
create policy "own rows" on coach_plans for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "admin read all" on coach_plans for select using (public.is_admin());

-- Cada treino do plano. Nunca expira sozinho — fica 'pendente' até o atleta
-- confirmar ou cancelar. actual_date pode divergir de planned_date; é essa
-- divergência que corrige os objetivos de nutrição dos dois dias.
create table if not exists coach_plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references coach_plans(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  planned_date date not null,
  kind text not null check (kind in ('corrida', 'ginasio')),
  training_type text,
  categories text[] not null default '{}',
  target_distance_km numeric check (target_distance_km is null or target_distance_km > 0),
  target_duration_min integer check (target_duration_min is null or target_duration_min > 0),
  notes text,
  status text not null default 'pendente' check (status in ('pendente', 'concluido', 'cancelado')),
  actual_date date,
  completed_run_id uuid references runs(id) on delete set null,
  completed_session_id uuid references workout_sessions(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists coach_plan_items_plan_idx on coach_plan_items(plan_id);
create index if not exists coach_plan_items_user_date_idx on coach_plan_items(user_id, planned_date);
alter table coach_plan_items enable row level security;
create policy "own rows" on coach_plan_items for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "admin read all" on coach_plan_items for select using (public.is_admin());
