-- ============================================================================
-- Ninguém se promove a admin a partir da app (2026-09-26)
-- APLICADA EM PRODUÇÃO a 2026-09-26 07:27 UTC (version 20260926072714), com
-- autorização explícita. Ensaiada lá antes numa transação revertida, como o
-- atleta (role authenticated + request.jwt.claims): mudar is_admin → recusado;
-- mudar bug_reviewer → recusado; mandar os mesmos valores → grava; outra
-- coluna → grava; INSERT com is_admin a true → recusado (antes da PK); como
-- dono → pode mudar. Verificada depois de aplicar: trigger ativo (tgenabled
-- 'O'), sem EXECUTE para authenticated, auto-promoção recusada, perfil grava.
-- ============================================================================
--
-- A FALHA. A política "own profile" em public.profiles é `for all`, com
-- `using/with check (auth.uid() = id)` (supabase_schema.sql:32-33), e o papel
-- `authenticated` tem UPDATE em todas as colunas da tabela. Nada protegia as
-- duas colunas que dão privilégios: um atleta com sessão podia fazer
--
--   supabase.from('profiles').update({ is_admin: true }).eq('id', <o seu id>)
--
-- e passava a admin — e o `is_admin()` abre as políticas "admin read all" de
-- 30+ tabelas, dados de saúde incluídos. O mesmo com `bug_reviewer`
-- (can_review_bugs()). O "for all" também deixava apagar o próprio perfil e
-- voltar a inseri-lo já com a coluna a true.
--
-- Encontrada a 2026-09-26 ao desenhar o catálogo do Troféu (que seria escrito
-- por admins) e confirmada em produção, só com leituras:
-- has_column_privilege('authenticated','public.profiles','is_admin','UPDATE')
-- = true, sem trigger nenhum a guardar a coluna. Sem sinais de uso: os dois
-- privilégios existentes foram dados pelo dono.
--
-- A CORREÇÃO. Um trigger BEFORE INSERT OR UPDATE que recusa, a quem fala pela
-- API com sessão (`authenticated`) ou sem ela (`anon`), qualquer ALTERAÇÃO de
-- is_admin ou bug_reviewer — e, num INSERT, qualquer valor a true.
--
--   · "Alteração" é `is distinct from`: a app pode continuar a mandar o
--     perfil com o mesmo valor que já lá está (hoje manda sempre campos
--     explícitos, nunca estas duas colunas — mas não é isto que parte se um
--     dia mandar a linha toda).
--   · Porquê um trigger e não `revoke update` + `grant update(<colunas>)`:
--     com grants por coluna, cada coluna nova de profiles teria de ser
--     lembrada num grant, senão o Perfil deixava de gravar. Com o trigger,
--     a regra fica escrita uma vez, onde se lê.
--   · Quem pode continuar a mudar: o dono pelo SQL (postgres), o
--     service_role das Edge Functions e as funções SECURITY DEFINER (correm
--     como o dono). O trigger olha para `current_user`, que numa função
--     SECURITY INVOKER — esta — é o papel de quem fez o pedido.
--   · A função não fica exposta como RPC (molde de
--     20260918001600_revoke_execute_trigger_functions.sql: o EXECUTE de uma
--     função de trigger verifica-se quando se CRIA o trigger, não quando
--     dispara).
-- ============================================================================

create or replace function public.guard_profile_privilege_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if coalesce(new.is_admin, false) or coalesce(new.bug_reviewer, false) then
      raise exception 'is_admin e bug_reviewer não se definem a partir da app'
        using errcode = '42501';
    end if;
  elsif new.is_admin is distinct from old.is_admin
     or new.bug_reviewer is distinct from old.bug_reviewer then
    raise exception 'is_admin e bug_reviewer não se alteram a partir da app'
      using errcode = '42501';
  end if;

  return new;
end $$;

revoke execute on function public.guard_profile_privilege_columns() from public, anon, authenticated;

drop trigger if exists guard_profile_privilege_columns on public.profiles;
create trigger guard_profile_privilege_columns
  before insert or update on public.profiles
  for each row execute function public.guard_profile_privilege_columns();

comment on function public.guard_profile_privilege_columns() is
  'Recusa a authenticated/anon qualquer alteração de is_admin ou bug_reviewer em profiles (e valores a true num INSERT). '
  'O dono (SQL), o service_role e as funções SECURITY DEFINER continuam a poder mudá-las.';
