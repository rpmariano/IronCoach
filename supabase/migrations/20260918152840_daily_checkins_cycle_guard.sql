-- ============================================================================
-- O ciclo só se grava com consentimento — imposto na base de dados
-- (revisão pré-deploy 2026-09-18 da Fase 2, specs/carol-omnisciencia-
-- omnipresenca.md)
-- APLICADA EM PRODUÇÃO a 2026-09-18 15:28 UTC (version 20260918152840).
-- Testada lá numa transação revertida: sem consentimento o period_today fica
-- null; com consentimento e perfil feminino, grava.
-- ============================================================================
--
-- Até aqui só o cliente garantia que period_today não saía sem o "aceito".
-- Um cliente antigo ou uma escrita direta à API gravava-o na mesma. Agora um
-- trigger limpa-o antes de gravar, se o perfil não tiver consentimento ou
-- não for feminino.
--
-- E os check-ins deixam de ser lidos pelo painel de admin: são dados de
-- saúde, e o texto do consentimento diz que servem só para a Carol
-- acompanhar o atleta. Fica só a política "own rows".
-- ============================================================================

drop policy if exists "admin read all daily_checkins" on public.daily_checkins;

create or replace function public.enforce_cycle_consent()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.period_today is not null and not exists (
    select 1 from public.profiles p
    where p.id = new.user_id and p.cycle_tracking_consent_at is not null and p.gender in ('F', 'f', 'feminino')
  ) then
    new.period_today := null;
  end if;
  return new;
end $$;

revoke execute on function public.enforce_cycle_consent() from public, anon, authenticated;

drop trigger if exists enforce_cycle_consent on public.daily_checkins;
create trigger enforce_cycle_consent before insert or update on public.daily_checkins
  for each row execute function public.enforce_cycle_consent();
