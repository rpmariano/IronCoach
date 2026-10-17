-- ============================================================================
-- Registo unificado ligado ao plano da Carol — Fase 0, dados
-- (specs/plano-registo-plano-coach.md §2). Só colunas e tabelas NOVAS, todas
-- nuláveis ou com default: nenhuma leitura nem escrita de hoje muda.
-- APLICADA EM PRODUÇÃO a 2026-10-17 23:36 UTC (version 20261017233601), com
-- autorização explícita, antes do push a dev das funções que a usam. Ensaiada
-- antes num bloco DO revertido. Verificada: 8 colunas novas, RLS ligado em
-- athlete_exercises com uma política, função SECURITY DEFINER sem EXECUTE
-- para authenticated, com o bloco da prova, triggers ativos ('O').
-- ============================================================================

-- ---- §2.1 Prescrição por exercício no item do plano ------------------------
-- { "blocks": [ { "type": "forca", "name", "sets", "reps", "goal" },
--               { "type": "cardio", "name", "fields": [...], "duration_min",
--                 "distance_km", "laps", "goal" } ] }
-- Sem kg (decisão 5: o peso vem da última execução). A forma valida-se em
-- código (propose_training_plan), não aqui — só se garante que é um objeto.
-- §2.3 completion_source: 'plano' (ligado de propósito: "Usar o plano" ou
-- "Registar sessão") | 'auto' (treino livre que riscou o item do dia —
-- decisão 3). Nulo em itens não concluídos e nos concluídos antes disto.
-- execution_note: a nota da Carol sobre a execução, gravada pela análise (F4).
alter table public.coach_plan_items
  add column if not exists prescription jsonb
    check (prescription is null or jsonb_typeof(prescription) = 'object'),
  add column if not exists completion_source text
    check (completion_source is null or completion_source in ('plano', 'auto')),
  add column if not exists execution_note text;

-- ---- §2.2 Execução no registo ----------------------------------------------
-- O objetivo vive por exercício, não por série:
-- [{ "name", "goal", "block_type", "plan_block_index", "goal_met" }].
-- workout_session_sets mantém a forma; ganha só as colunas de cardio.
alter table public.workout_sessions
  add column if not exists exercises_meta jsonb
    check (exercises_meta is null or jsonb_typeof(exercises_meta) = 'array');

alter table public.workout_session_sets
  add column if not exists duration_seconds integer
    check (duration_seconds is null or duration_seconds > 0),
  add column if not exists distance_km numeric
    check (distance_km is null or distance_km > 0),
  add column if not exists laps integer
    check (laps is null or laps > 0);

-- Uma corrida é "um exercício": o seu objetivo.
alter table public.runs
  add column if not exists goal text;

-- ---- §2.5 O Armário de Exercícios (decisão 7) -------------------------------
-- Catálogo pessoal: um exercício entra à primeira vez que é registado, com a
-- última carga, reps e afinação da máquina. Sem favoritos manuais.
-- Quem escreve: analyze-gym (JWT do atleta) e, mais tarde, o editor no Perfil.
create table if not exists public.athlete_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  -- _shared/formulas/foodKey.ts: sem acentos, minúsculas, um espaço.
  name_key text not null,
  -- Grupo muscular, da lista MUSCLE_GROUPS do Ginásio; 'Outro' se não se sabe.
  category text not null default 'Outro',
  block_type text not null default 'forca' check (block_type in ('forca', 'cardio')),
  -- Campos de cardio deste exercício (src/utils/cardioFields.js); nulo na força.
  cardio_fields text[]
    check (cardio_fields is null or cardio_fields <@ array['duration', 'distance', 'laps']::text[]),
  -- Afinações pessoais ("banco furo 3, pino 6").
  machine_settings text,
  last_weight numeric check (last_weight is null or last_weight >= 0),
  last_reps integer check (last_reps is null or last_reps > 0),
  personal_record_weight numeric check (personal_record_weight is null or personal_record_weight >= 0),
  times_performed integer not null default 1 check (times_performed >= 0),
  last_performed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name_key)
);

create index if not exists athlete_exercises_user_recent_idx
  on public.athlete_exercises (user_id, last_performed_at desc nulls last);

alter table public.athlete_exercises enable row level security;

drop policy if exists "own exercises" on public.athlete_exercises;
create policy "own exercises" on public.athlete_exercises
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---- Registo apagado: a ligação nova segue o item --------------------------
-- Mesma função de 20260928220705_race_reverts_when_its_run_is_deleted.sql
-- (a última versão; inclui a prova que volta a agendada), com duas linhas a
-- mais por ramo:
--   · passa para outro registo livre do dia → completion_source = 'auto'
--     (já não foi o atleta a escolhê-lo) e execution_note a null (falava do
--     registo apagado);
--   · volta a pendente → completion_source e execution_note a null.
create or replace function public.release_plan_items_of_deleted_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  it record;
  other uuid;
begin
  if not exists (select 1 from auth.users u where u.id = old.user_id) then
    return old;
  end if;
  if tg_table_name = 'runs' then
    for it in
      select i.id, coalesce(i.actual_date, i.planned_date) as done_on, i.training_type
        from public.coach_plan_items i
       where i.completed_run_id = old.id and i.user_id = old.user_id and i.status = 'concluido'
    loop
      other := null;
      if coalesce(it.training_type, '') not in ('prova', 'competicao') then
        select r.id into other
          from public.runs r
         where r.user_id = old.user_id and r.date = it.done_on and r.id <> old.id and r.race_id is null
           and not exists (select 1 from public.coach_plan_items x where x.user_id = old.user_id and x.completed_run_id = r.id)
         order by r.created_at, r.id
         limit 1;
      end if;
      if other is not null then
        update public.coach_plan_items
           set completed_run_id = other, completion_source = 'auto', execution_note = null
         where id = it.id;
      else
        update public.coach_plan_items
           set status = 'pendente', actual_date = null, completed_run_id = null, completed_session_id = null,
               completion_source = null, execution_note = null
         where id = it.id;
      end if;
    end loop;
    -- A prova que esta corrida concluía volta a agendada, se não lhe ficar
    -- outra corrida — sem o balanço da Carol, que era sobre ela. As memórias
    -- (diploma, medalha, fotos) ficam. Jornadas do Troféu não (ver acima).
    if old.race_id is not null
       and not exists (select 1 from public.runs r where r.race_id = old.race_id and r.id <> old.id) then
      update public.race_events
         set status = 'agendada', coach_balance = null, coach_balance_at = null
       where id = old.race_id and user_id = old.user_id and status = 'concluida'
         and cup_round_id is null;
    end if;
  else
    for it in
      select i.id, coalesce(i.actual_date, i.planned_date) as done_on
        from public.coach_plan_items i
       where i.completed_session_id = old.id and i.user_id = old.user_id and i.status = 'concluido'
    loop
      select g.id into other
        from public.workout_sessions g
       where g.user_id = old.user_id and g.date = it.done_on and g.id <> old.id
         and not exists (select 1 from public.coach_plan_items x where x.user_id = old.user_id and x.completed_session_id = g.id)
       order by g.created_at, g.id
       limit 1;
      if other is not null then
        update public.coach_plan_items
           set completed_session_id = other, completion_source = 'auto', execution_note = null
         where id = it.id;
      else
        update public.coach_plan_items
           set status = 'pendente', actual_date = null, completed_run_id = null, completed_session_id = null,
               completion_source = null, execution_note = null
         where id = it.id;
      end if;
    end loop;
  end if;
  return old;
end $$;

revoke execute on function public.release_plan_items_of_deleted_record() from public, anon, authenticated;
