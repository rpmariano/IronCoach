-- ============================================================================
-- Apagar a corrida de uma prova põe a prova de volta a agendada (2026-09-28)
-- ============================================================================
--
-- Pedido do Rui (2026-09-28), a seguir a 20260928205037: apagar a corrida
-- que concluiu uma prova já devolvia o item de prova do plano a pendente, mas
-- a prova (race_events.status) continuava 'concluida' — o Início mostrava-a
-- feita (CarolCard provaFeita), as conquistas e o Troféu
-- (cup_race_is_done) contavam-na, sem corrida nenhuma.
--
-- A CORREÇÃO. No mesmo trigger BEFORE DELETE de runs: se a corrida apagada
-- tinha race_id e a prova não fica com outra corrida, a prova volta a
-- 'agendada' — o estado em que estava antes de ser registada. É o estado de
-- uma prova passada "por registar", que a app já conhece (lista de provas,
-- alerta "ainda não tem a corrida registada").
--
--   · As memórias (diploma, medalha, fotos) ficam na prova: são do atleta, e
--     registar a prova outra vez volta a mostrá-las.
--   · Uma prova criada pela "Prova fora da agenda" também volta a agendada,
--     não é apagada: apagar dados sozinho não é papel de um trigger. O
--     atleta apaga-a se quiser.
--   · Só o estado muda. Nenhum dos triggers de race_events dispara com isso
--     (cup_principal_collision, guard_cup_race_columns e sync_plan_end só
--     olham para date, race_priority, distance_km, location e cup_*).
--   · Numa conta a ser apagada, nada (a guarda do início da função).
--   · Várias corridas da mesma prova apagadas num só DELETE: cada linha já
--     não vê as anteriores (snapshot novo por query do trigger) — a última
--     põe a prova a agendada.
-- ============================================================================

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
        update public.coach_plan_items set completed_run_id = other where id = it.id;
      else
        update public.coach_plan_items
           set status = 'pendente', actual_date = null, completed_run_id = null, completed_session_id = null
         where id = it.id;
      end if;
    end loop;
    -- A prova que esta corrida concluía volta a agendada, se não lhe ficar
    -- outra corrida. As memórias (diploma, medalha, fotos) ficam.
    if old.race_id is not null
       and not exists (select 1 from public.runs r where r.race_id = old.race_id and r.id <> old.id) then
      update public.race_events
         set status = 'agendada'
       where id = old.race_id and user_id = old.user_id and status = 'concluida';
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
        update public.coach_plan_items set completed_session_id = other where id = it.id;
      else
        update public.coach_plan_items
           set status = 'pendente', actual_date = null, completed_run_id = null, completed_session_id = null
         where id = it.id;
      end if;
    end loop;
  end if;
  return old;
end $$;

-- CREATE OR REPLACE mantém os privilégios; repete-se por clareza.
revoke execute on function public.release_plan_items_of_deleted_record() from public, anon, authenticated;

comment on function public.release_plan_items_of_deleted_record() is
  'Ao apagar uma corrida/sessão: os itens do plano concluídos por ela passam para outro registo livre desse dia, ou voltam a pendente; '
  'a prova que a corrida concluía volta a agendada se não lhe ficar outra corrida. Ver specs/plano-de-treino.md §5.4.';
