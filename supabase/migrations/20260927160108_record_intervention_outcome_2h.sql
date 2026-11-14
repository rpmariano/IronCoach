-- A janela do record_intervention_outcome passa de 12 h para 2 h, a mesma do
-- contexto que a Carol recebe sobre o aviso já falado (coach-chat,
-- TALKED_INTERVENTION_HOURS). Com 12 h, um resolve_intervention numa
-- conversa sem relação horas depois colava o desfecho ao aviso antigo e
-- torcia a calibração dos 60 dias (revisão pré-deploy de fc946764).

create or replace function public.record_intervention_outcome(p_outcome text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  n integer;
begin
  if auth.uid() is null or p_outcome is null
     or p_outcome not in ('plano_ajustado', 'atleta_ignorou', 'falso_positivo') then
    return false;
  end if;
  update public.coach_interventions set outcome = p_outcome
    where id = (
      select id from public.coach_interventions
        where user_id = auth.uid()
          and closed_at is not null
          and outcome = 'resolvido'
          and closed_at > now() - interval '2 hours'
        order by closed_at desc
        limit 1
    );
  get diagnostics n = row_count;
  return n > 0;
end $$;

revoke execute on function public.record_intervention_outcome(text) from public, anon;
grant execute on function public.record_intervention_outcome(text) to authenticated;
