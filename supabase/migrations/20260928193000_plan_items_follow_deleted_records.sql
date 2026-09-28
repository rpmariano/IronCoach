-- ============================================================================
-- Apagar o registo que cumpriu um treino do plano (2026-09-28)
-- ============================================================================
--
-- A FALHA. coach_plan_items.completed_run_id / completed_session_id são
-- `on delete set null` (20260810000000_coach_plans.sql:53-54). Apagar a
-- corrida (Calendário, Corridas, cartão da corrida) ou a sessão de ginásio
-- que cumpriu um treino deixava o item `concluido`, com actual_date e sem
-- registo nenhum: o Início dizia "Feito." e a adesão
-- (prescriptionAdherence.ts) contava "marcado como feito" — um treino que,
-- para a app, já não aconteceu. Apontado na revisão pré-deploy de baab334,
-- que passou a ligar o treino logo que a análise por foto grava a corrida.
--
-- A CORREÇÃO. Um trigger BEFORE DELETE em runs e em workout_sessions. Para
-- cada item CONCLUÍDO ligado ao registo apagado:
--   · havendo outro registo do mesmo tipo nesse dia (actual_date), ainda sem
--     item, passa para ele — a mesma regra da ligação por dia da app
--     (RunRegistration/GymRegistration, specs/plano-de-treino.md §5.4), e o
--     caso típico é apagar um duplicado;
--   · senão, volta a `pendente` (actual_date e ligações a null) — o estado de
--     que saiu ao ser ligado.
--   · O item de prova (training_type prova/competicao) nunca passa para
--     outra corrida: volta a pendente. Fecha-se pelo registo da prova.
--   · Um item cancelado com ligação fica como está (o `set null` da FK
--     trata-lhe da ligação): cancelado não volta a pendente.
--
--   · BEFORE e não AFTER: os triggers da FK (AFTER, "RI_ConstraintTrigger_…")
--     disparam primeiro e punham a ligação a null — depois já não se sabia
--     que itens eram deste registo.
--   · SECURITY DEFINER com search_path vazio: só mexe em itens que apontam
--     para o registo apagado (logo do mesmo atleta), e a procura de outro
--     registo fica presa a old.user_id. Não depende das políticas RLS de
--     quem apaga (a app, o service_role, o SQL).
--   · A função não fica exposta como RPC (molde de
--     20260918001600_revoke_execute_trigger_functions.sql).
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
  if tg_table_name = 'runs' then
    for it in
      select i.id, coalesce(i.actual_date, i.planned_date) as done_on, i.training_type
        from public.coach_plan_items i
       where i.completed_run_id = old.id and i.status = 'concluido'
    loop
      other := null;
      if coalesce(it.training_type, '') not in ('prova', 'competicao') then
        select r.id into other
          from public.runs r
         where r.user_id = old.user_id and r.date = it.done_on and r.id <> old.id
           and not exists (select 1 from public.coach_plan_items x where x.completed_run_id = r.id)
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
  else
    for it in
      select i.id, coalesce(i.actual_date, i.planned_date) as done_on
        from public.coach_plan_items i
       where i.completed_session_id = old.id and i.status = 'concluido'
    loop
      select g.id into other
        from public.workout_sessions g
       where g.user_id = old.user_id and g.date = it.done_on and g.id <> old.id
         and not exists (select 1 from public.coach_plan_items x where x.completed_session_id = g.id)
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

revoke execute on function public.release_plan_items_of_deleted_record() from public, anon, authenticated;

drop trigger if exists release_plan_items_of_deleted_run on public.runs;
create trigger release_plan_items_of_deleted_run
  before delete on public.runs
  for each row execute function public.release_plan_items_of_deleted_record();

drop trigger if exists release_plan_items_of_deleted_session on public.workout_sessions;
create trigger release_plan_items_of_deleted_session
  before delete on public.workout_sessions
  for each row execute function public.release_plan_items_of_deleted_record();

comment on function public.release_plan_items_of_deleted_record() is
  'Ao apagar uma corrida/sessão: os itens do plano concluídos por ela passam para outro registo livre desse dia, ou voltam a pendente. '
  'Ver specs/plano-de-treino.md §5.4.';
