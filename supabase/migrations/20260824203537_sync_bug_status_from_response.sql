-- ============================================================================
-- Fecha o ciclo entre a resposta do utilizador e o estado do bug.
--
-- Até aqui, responder "OK - Funciona" a uma notificação só gravava a
-- resposta em bug_notifications — o bug_report ficava no estado em que
-- estava. Quem confirmava a correção via o bug continuar aberto, e o
-- Admin tinha de ir marcá-lo à mão.
--
-- Porquê um trigger e não um update no cliente: o utilizador comum não
-- tem (nem deve ter) permissão de UPDATE em bug_reports — essa policy
-- exige can_review_bugs(). Um trigger SECURITY DEFINER mantém a
-- permissão fechada e garante a regra independentemente de quem grava
-- a resposta.
-- ============================================================================

create or replace function public.sync_bug_report_status_from_response()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Só reage à transição para uma resposta (ignora updates de read_at,
  -- ou re-gravações com o mesmo valor).
  if new.response_status is distinct from old.response_status
     and new.response_status is not null then

    if new.response_status = 'ok' then
      -- Confirmou que está corrigido: dá-se o bug por resolvido.
      -- resolved_by fica com quem confirmou, que é quem fechou o ciclo.
      update bug_reports
      set status = 'resolved',
          resolved_at = coalesce(resolved_at, now()),
          resolved_by = coalesce(resolved_by, new.user_id)
      where id = new.bug_report_id;

    elsif new.response_status = 'not_ok' then
      -- Continua avariado: reabre. Sem isto, um bug marcado como
      -- resolvido antes de pedir o teste ficaria fechado apesar de o
      -- utilizador ter dito que o problema persiste.
      update bug_reports
      set status = 'open',
          resolved_at = null,
          resolved_by = null
      where id = new.bug_report_id;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists bug_notifications_sync_report_status on bug_notifications;
create trigger bug_notifications_sync_report_status
  after update on bug_notifications
  for each row execute function public.sync_bug_report_status_from_response();
