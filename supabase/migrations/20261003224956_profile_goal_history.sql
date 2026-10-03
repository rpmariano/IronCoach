-- ============================================================================
-- O histórico dos objetivos de nutrição (bug #51, 2026-10-02)
-- APLICADA EM PRODUÇÃO a 2026-10-03 22:49 UTC (version 20261003224956), depois
-- de ensaiada numa transação revertida (o ponto de partida dava 4 linhas; o
-- trigger ignorava um update sem objetivos e gravava um com). Verificada:
-- trigger ativo, função sem EXECUTE para authenticated, RLS ligado.
-- ============================================================================
--
-- «Se quiser saber qual era o objetivo de calorias ou outro macro, no dia de
-- ontem, e saber se atingi objetivos, não temos como saber.» Os objetivos
-- viviam só em colunas de profiles, reescritas por cada edição no Perfil e
-- por cada proposta aceite: um dia passado comparava-se sempre com os
-- objetivos de HOJE — errado se tinham mudado entretanto.
--
-- profile_goal_history guarda cada estado dos cinco objetivos diários
-- (calorias, proteína, hidratos, gordura, água) e a partir de quando vale.
-- O objetivo de um dia é o da última linha que começou até ao fim desse dia
-- (hora de Lisboa) — src/utils/goalHistory.js.
--
--   · Escreve-o um trigger em profiles (INSERT, ou UPDATE que mude algum dos
--     cinco): o Perfil, uma proposta aceite (store/index.js) e qualquer
--     outro caminho ficam registados sem a app ter de se lembrar.
--   · Ninguém escreve aqui pela API: só há política de leitura das próprias
--     linhas. A função do trigger é SECURITY DEFINER e não fica exposta como
--     RPC (molde de 20260918001600_revoke_execute_trigger_functions.sql).
--
-- PONTO DE PARTIDA. Não havia histórico nenhum; o que se sabe ao certo é o
-- valor de hoje e o que cada proposta aceite mudou (coach_goal_proposals:
-- goals + accepted_at). Por atleta:
--   1. uma linha 'inicial' na criação do perfil com os valores de HOJE — é
--      uma estimativa (não se sabe o que lá estava antes da primeira
--      proposta); a app di-lo nesses dias;
--   2. uma linha 'proposta' por cada proposta aceite, com os valores que
--      ficaram depois dela (os que ela não mexia passam da linha anterior);
--   3. se o perfil de hoje já não bate com o fim dessa cadeia (uma edição à
--      mão depois da última proposta), uma linha 'perfil' agora.
-- ============================================================================

create table if not exists public.profile_goal_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  valid_from timestamptz not null default now(),
  calorie_goal numeric,
  protein_goal numeric,
  carbs_goal numeric,
  fat_goal numeric,
  water_goal_ml integer,
  -- 'inicial' (estimativa do ponto de partida) | 'proposta' | 'perfil'
  source text not null default 'perfil' check (source in ('inicial', 'proposta', 'perfil'))
);

create index if not exists profile_goal_history_user_idx on public.profile_goal_history (user_id, valid_from);

alter table public.profile_goal_history enable row level security;

drop policy if exists "own goal history" on public.profile_goal_history;
create policy "own goal history" on public.profile_goal_history
  for select to authenticated using (auth.uid() = user_id);

-- ── O trigger ────────────────────────────────────────────────────────────
create or replace function public.record_profile_goal_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and new.calorie_goal is not distinct from old.calorie_goal
     and new.protein_goal is not distinct from old.protein_goal
     and new.carbs_goal is not distinct from old.carbs_goal
     and new.fat_goal is not distinct from old.fat_goal
     and new.water_goal_ml is not distinct from old.water_goal_ml then
    return new;
  end if;
  insert into public.profile_goal_history (user_id, calorie_goal, protein_goal, carbs_goal, fat_goal, water_goal_ml, source)
  values (new.id, new.calorie_goal, new.protein_goal, new.carbs_goal, new.fat_goal, new.water_goal_ml, 'perfil');
  return new;
end $$;

revoke execute on function public.record_profile_goal_history() from public, anon, authenticated;

drop trigger if exists record_profile_goal_history on public.profiles;
create trigger record_profile_goal_history
  after insert or update of calorie_goal, protein_goal, carbs_goal, fat_goal, water_goal_ml on public.profiles
  for each row execute function public.record_profile_goal_history();

-- ── O ponto de partida ───────────────────────────────────────────────────
do $$
declare
  p record;
  g record;
  cur jsonb;
  hoje jsonb;
begin
  for p in
    select id, created_at, calorie_goal, protein_goal, carbs_goal, fat_goal, water_goal_ml
    from public.profiles
    where not exists (select 1 from public.profile_goal_history h where h.user_id = profiles.id)
  loop
    hoje := jsonb_build_object(
      'calorie_goal', p.calorie_goal, 'protein_goal', p.protein_goal, 'carbs_goal', p.carbs_goal,
      'fat_goal', p.fat_goal, 'water_goal_ml', p.water_goal_ml);
    cur := hoje;

    insert into public.profile_goal_history (user_id, valid_from, calorie_goal, protein_goal, carbs_goal, fat_goal, water_goal_ml, source)
    values (p.id, coalesce(p.created_at, now()), p.calorie_goal, p.protein_goal, p.carbs_goal, p.fat_goal, p.water_goal_ml, 'inicial');

    for g in
      select accepted_at, goals from public.coach_goal_proposals
      where user_id = p.id and status = 'aceite' and accepted_at is not null
      order by accepted_at
    loop
      cur := cur || coalesce((
        select jsonb_object_agg(k, v) from jsonb_each(g.goals) as e(k, v)
        where k in ('calorie_goal', 'protein_goal', 'carbs_goal', 'fat_goal', 'water_goal_ml')
      ), '{}'::jsonb);
      insert into public.profile_goal_history (user_id, valid_from, calorie_goal, protein_goal, carbs_goal, fat_goal, water_goal_ml, source)
      values (p.id, g.accepted_at, (cur->>'calorie_goal')::numeric, (cur->>'protein_goal')::numeric,
              (cur->>'carbs_goal')::numeric, (cur->>'fat_goal')::numeric, (cur->>'water_goal_ml')::numeric::integer, 'proposta');
    end loop;

    -- Comparação numérica (o jsonb de numeric pode trazer "2000" vs 2000.0).
    if (cur->>'calorie_goal')::numeric is distinct from p.calorie_goal
       or (cur->>'protein_goal')::numeric is distinct from p.protein_goal
       or (cur->>'carbs_goal')::numeric is distinct from p.carbs_goal
       or (cur->>'fat_goal')::numeric is distinct from p.fat_goal
       or (cur->>'water_goal_ml')::numeric::integer is distinct from p.water_goal_ml then
      insert into public.profile_goal_history (user_id, calorie_goal, protein_goal, carbs_goal, fat_goal, water_goal_ml, source)
      values (p.id, p.calorie_goal, p.protein_goal, p.carbs_goal, p.fat_goal, p.water_goal_ml, 'perfil');
    end if;
  end loop;
end $$;
