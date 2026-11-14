-- A quota do Gemini deixa de ser contornável (2.ª auditoria de segurança,
-- 2026-11-14, M1, aprovada pelo Rui).
--
-- 1. Reserva antes da chamada. A contagem por hora lia o ai_usage, que só se
--    grava DEPOIS da resposta: uma rajada de pedidos em paralelo passava
--    toda. Agora cada pedido reserva o seu lugar antes de chamar o Gemini,
--    com reserve_gemini_request — numa transação com um advisory lock por
--    atleta, conta a última hora e insere: dois pedidos ao mesmo tempo nunca
--    passam ambos o limite. Só a service role a chama (as Edge Functions).
-- 2. O lock do chat (profiles.coach_chat_busy_since) era uma coluna que a app
--    podia limpar (e assim correr pedidos em paralelo, saltando o lock):
--    entra no trigger guard_profile_privilege_columns — a app só a lê; o
--    coach-chat escreve-a com a service role.
-- 3. O teto global de tokens por dia (A1): ai_tokens_since, só para a service role.

create table if not exists public.ai_request_reservations (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  function text not null check (char_length(function) between 1 and 60),
  at timestamptz not null default now()
);

create index if not exists ai_request_reservations_user_at_idx
  on public.ai_request_reservations (user_id, at desc);
create index if not exists ai_request_reservations_at_idx
  on public.ai_request_reservations (at desc);

-- RLS ligada e nenhuma política: só a service role lê e escreve.
alter table public.ai_request_reservations enable row level security;
revoke all on table public.ai_request_reservations from public, anon, authenticated;
grant all on table public.ai_request_reservations to service_role;

comment on table public.ai_request_reservations is
  'Uma linha por pedido ao Gemini, reservada ANTES da chamada (_shared/geminiQuota.ts): a quota por hora conta-as. Limpa-se ao fim de 2 dias.';

create or replace function public.reserve_gemini_request(p_user uuid, p_function text, p_limit integer)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  -- Dois pedidos do mesmo atleta ao mesmo tempo esperam um pelo outro.
  perform pg_advisory_xact_lock(hashtextextended('gemini_quota:' || p_user::text, 0));

  select count(*) into v_count
  from public.ai_request_reservations r
  where r.user_id = p_user and r.at > now() - interval '1 hour';
  if v_count >= p_limit then
    return false;
  end if;

  insert into public.ai_request_reservations (user_id, function) values (p_user, left(coalesce(p_function, '?'), 60));

  -- A limpeza de cada atleta vai com os pedidos dele.
  delete from public.ai_request_reservations r
  where r.user_id = p_user and r.at < now() - interval '2 days';
  return true;
end;
$$;

revoke execute on function public.reserve_gemini_request(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.reserve_gemini_request(uuid, text, integer) to service_role;

-- 3. O teto global (A1): os tokens de todos os atletas desde p_since, numa
--    soma no servidor (sem trazer as linhas). Índice ai_usage_created_idx.
create or replace function public.ai_tokens_since(p_since timestamptz)
returns bigint
language sql stable security definer set search_path = public as $$
  select coalesce(sum(coalesce(input_tokens, 0) + coalesce(output_tokens, 0) + coalesce(thoughts_tokens, 0)), 0)::bigint
  from public.ai_usage where created_at >= p_since;
$$;

revoke execute on function public.ai_tokens_since(timestamptz) from public, anon, authenticated;
grant execute on function public.ai_tokens_since(timestamptz) to service_role;

-- O lock do chat: só a service role o mexe.
create or replace function public.guard_profile_privilege_columns()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if coalesce(new.is_admin, false) or coalesce(new.bug_reviewer, false) then
      raise exception 'is_admin e bug_reviewer não se definem a partir da app'
        using errcode = '42501';
    end if;
    -- Um perfil novo nasce sem o lock do chat.
    new.coach_chat_busy_since := null;
  elsif new.is_admin is distinct from old.is_admin
     or new.bug_reviewer is distinct from old.bug_reviewer then
    raise exception 'is_admin e bug_reviewer não se alteram a partir da app'
      using errcode = '42501';
  else
    -- 2.ª auditoria de segurança (2026-11-14): o lock do coach-chat só o
    -- coach-chat o escreve (service role); limpá-lo da app saltava-o. Em
    -- silêncio, sem erro: um perfil gravado inteiro com um valor antigo não
    -- falha — o lock fica como estava.
    new.coach_chat_busy_since := old.coach_chat_busy_since;
  end if;

  return new;
end $function$;
