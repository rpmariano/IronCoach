-- ============================================================================
-- Leitura pela assistente executiva (specs/assistente-leitura-contrato.md).
--
-- Uma app de fora (a assistente executiva do atleta) lê os dados de UM
-- atleta, só leitura, pela Edge Function assistant-read. A autenticação é um
-- token pessoal (ih_…) que o atleta gera no Perfil:
--   a) assistant_tokens      — os tokens. Só o hash SHA-256, nunca em claro.
--   b) assistant_access_log  — um registo por pedido: limite por hora e
--                              auditoria. Nenhum cliente o lê nesta fase.
--   c) create_assistant_token / revoke_assistant_token — a única forma de
--      escrever em a). O cliente só faz select das suas linhas, e sem o hash.
--   d) privacy_consents.kind passa a aceitar 'assistant_read' — dar acesso a
--      uma app de fora é um consentimento, e fica no livro como os outros.
--
-- O utilizador de um pedido é SEMPRE o dono do token: a função nunca aceita
-- user_id no pedido e lê com a service role filtrando por esse dono.
--
-- Grants explícitos: neste projeto as tabelas novas ainda nascem expostas a
-- anon e authenticated com todos os privilégios (verificado a 2026-10-24 em
-- athlete_meal_templates). Por isso o revoke all vem antes de cada grant.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- a) assistant_tokens
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.assistant_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- SHA-256 hex do token inteiro (com o "ih_"). A função calcula o mesmo
  -- hash do cabeçalho e procura por ele.
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  -- Os primeiros 8 caracteres do token ("ih_" + 5), para o atleta o
  -- reconhecer na lista. Não chegam para adivinhar o resto.
  token_prefix text not null check (char_length(token_prefix) = 8),
  label text not null check (char_length(label) between 1 and 60),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create index if not exists assistant_tokens_user_active_idx
  on public.assistant_tokens (user_id) where revoked_at is null;

alter table public.assistant_tokens enable row level security;

drop policy if exists "own assistant tokens select" on public.assistant_tokens;
create policy "own assistant tokens select" on public.assistant_tokens
  for select to authenticated using (auth.uid() = user_id);

-- Sem token_hash na lista de colunas: um select que o peça falha, mesmo
-- sobre as linhas do próprio. A app pede as colunas pelo nome.
revoke all on table public.assistant_tokens from public, anon, authenticated;
grant select (id, user_id, token_prefix, label, created_at, last_used_at, revoked_at)
  on table public.assistant_tokens to authenticated;
grant all on table public.assistant_tokens to service_role;


-- ────────────────────────────────────────────────────────────────────────────
-- b) assistant_access_log
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.assistant_access_log (
  id bigint generated always as identity primary key,
  token_id uuid not null references public.assistant_tokens(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  resource text check (char_length(resource) <= 40),
  status integer not null,
  at timestamptz not null default now()
);

-- O limite de pedidos conta as linhas do token na última hora.
create index if not exists assistant_access_log_token_at_idx
  on public.assistant_access_log (token_id, at desc);

-- RLS ligada e nenhuma política: só a service role (que a ignora) lê e escreve.
alter table public.assistant_access_log enable row level security;

revoke all on table public.assistant_access_log from public, anon, authenticated;
grant all on table public.assistant_access_log to service_role;


-- ────────────────────────────────────────────────────────────────────────────
-- d) privacy_consents.kind
-- ────────────────────────────────────────────────────────────────────────────

alter table public.privacy_consents drop constraint if exists privacy_consents_kind_check;
alter table public.privacy_consents add constraint privacy_consents_kind_check
  check (kind in ('stats_pool', 'leaderboard', 'assistant_read'));


-- ────────────────────────────────────────────────────────────────────────────
-- c) RPCs
-- ────────────────────────────────────────────────────────────────────────────
--
-- O livro do consentimento regista as TRANSIÇÕES: a concessão quando o atleta
-- passa de zero tokens ativos para um, a retirada quando revoga o último. Um
-- segundo token com outro já ativo não é um ato novo de consentimento.
--
-- Erros (a app lê a mensagem): 'not_authenticated', 'bad_label',
-- 'max_tokens', 'not_found'.

create or replace function public.create_assistant_token(p_label text)
returns table (id uuid, token text, token_prefix text, created_at timestamptz)
language plpgsql security definer set search_path = public, extensions as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_label text := btrim(coalesce(p_label, ''));
  v_active integer;
  v_token text;
  v_row public.assistant_tokens%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if char_length(v_label) not between 1 and 60 then
    raise exception 'bad_label';
  end if;

  -- Dois pedidos ao mesmo tempo não passam ambos o limite de 3.
  perform pg_advisory_xact_lock(hashtextextended('assistant_tokens:' || v_uid::text, 0));

  select count(*) into v_active
  from public.assistant_tokens t
  where t.user_id = v_uid and t.revoked_at is null;
  if v_active >= 3 then
    raise exception 'max_tokens';
  end if;

  -- 32 bytes aleatórios em base64url, sem o '=' final: 43 caracteres.
  v_token := 'ih_' || translate(encode(gen_random_bytes(32), 'base64'), '+/=', '-_');

  insert into public.assistant_tokens (user_id, token_hash, token_prefix, label)
  values (v_uid, encode(digest(v_token, 'sha256'), 'hex'), left(v_token, 8), v_label)
  returning * into v_row;

  if v_active = 0 then
    insert into public.privacy_consents (user_id, kind, granted_at, source)
    values (v_uid, 'assistant_read', now(), 'app');
  end if;

  return query select v_row.id, v_token, v_row.token_prefix, v_row.created_at;
end;
$$;

create or replace function public.revoke_assistant_token(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_revoked integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('assistant_tokens:' || v_uid::text, 0));

  -- Um token de outro atleta é igual a um que não existe.
  if not exists (select 1 from public.assistant_tokens t where t.id = p_id and t.user_id = v_uid) then
    raise exception 'not_found';
  end if;

  -- Revogar outra vez um já revogado não faz nada (nem mexe no livro).
  update public.assistant_tokens t set revoked_at = now()
  where t.id = p_id and t.user_id = v_uid and t.revoked_at is null;
  get diagnostics v_revoked = row_count;

  if v_revoked > 0 and not exists (
    select 1 from public.assistant_tokens t where t.user_id = v_uid and t.revoked_at is null
  ) then
    insert into public.privacy_consents (user_id, kind, revoked_at, source)
    values (v_uid, 'assistant_read', now(), 'app');
  end if;
end;
$$;

revoke execute on function public.create_assistant_token(text) from public, anon;
revoke execute on function public.revoke_assistant_token(uuid) from public, anon;
grant execute on function public.create_assistant_token(text) to authenticated;
grant execute on function public.revoke_assistant_token(uuid) to authenticated;
