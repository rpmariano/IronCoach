-- Os tokens da assistente passam a expirar (auditoria de segurança,
-- 2026-11-13, aprovada pelo Rui).
--
--   - assistant_tokens.expires_at (opcional): os tokens novos expiram 90 dias
--     depois de criados; os que já existem ficam sem prazo (null) — não se
--     corta o acesso de quem já o deu. O assistant-read recusa um expirado.
--   - Um expirado deixa de contar para o máximo de 3 ativos.
--   - O limite de 120 pedidos por hora passa a ser por atleta (user_id), não
--     por token: 3 tokens já não dão 360 por hora. Índice para a contagem.
--
-- create_assistant_token mantém a assinatura (o cliente não muda); a app lê
-- expires_at com o select das colunas (grant abaixo).

alter table public.assistant_tokens
  add column if not exists expires_at timestamptz;

comment on column public.assistant_tokens.expires_at is
  'Quando o token deixa de valer (90 dias depois de criado; null nos criados antes de 2026-11-13). O assistant-read recusa os expirados.';

grant select (id, user_id, token_prefix, label, created_at, last_used_at, revoked_at, expires_at)
  on table public.assistant_tokens to authenticated;

create index if not exists assistant_access_log_user_at_idx
  on public.assistant_access_log (user_id, at desc);

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

  perform pg_advisory_xact_lock(hashtextextended('assistant_tokens:' || v_uid::text, 0));

  -- Um expirado já não é ativo.
  select count(*) into v_active
  from public.assistant_tokens t
  where t.user_id = v_uid and t.revoked_at is null and (t.expires_at is null or t.expires_at > now());
  if v_active >= 3 then
    raise exception 'max_tokens';
  end if;

  v_token := 'ih_' || translate(encode(gen_random_bytes(32), 'base64'), '+/=', '-_');

  insert into public.assistant_tokens (user_id, token_hash, token_prefix, label, expires_at)
  values (v_uid, encode(digest(v_token, 'sha256'), 'hex'), left(v_token, 8), v_label, now() + interval '90 days')
  returning * into v_row;

  if v_active = 0 then
    insert into public.privacy_consents (user_id, kind, granted_at, source)
    values (v_uid, 'assistant_read', now(), 'app');
  end if;

  return query select v_row.id, v_token, v_row.token_prefix, v_row.created_at;
end;
$$;

revoke execute on function public.create_assistant_token(text) from public, anon;
grant execute on function public.create_assistant_token(text) to authenticated;
