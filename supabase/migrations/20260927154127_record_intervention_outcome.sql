-- O desfecho de um aviso que já fechou pela conversa (pedido 2026-09-27).
--
-- O aviso "Preciso de falar contigo" passou a fechar quando a Carol abre a
-- conversa (coach-chat, closeInterventionOnTalk): o trigger
-- track_coach_intervention grava-o como 'resolvido'. O desfecho a sério
-- (plano ajustado, ignorado, falso alarme) só se sabe depois, na conversa —
-- e aí o perfil já está fechado, o trigger não vê transição nenhuma e o
-- desfecho perdia-se. Esta função escreve-o na linha que a conversa fechou.
--
-- coach_interventions só tem política de SELECT para o dono: a escrita vai
-- por aqui, security definer, e só toca na linha do próprio (auth.uid()),
-- a mais recente fechada como 'resolvido' nas últimas 12 horas, e só com os
-- desfechos que a Carol pode dar no chat (CHAT_RESOLVE_OUTCOMES).

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
          and closed_at > now() - interval '12 hours'
        order by closed_at desc
        limit 1
    );
  get diagnostics n = row_count;
  return n > 0;
end $$;

revoke execute on function public.record_intervention_outcome(text) from public, anon;
grant execute on function public.record_intervention_outcome(text) to authenticated;
