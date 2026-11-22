-- Interruptores por funcionalidade para a «v1 lite» do lançamento (aprovado
-- pelo Rui, 2026-11-22). O código não se apaga: esconde-se. Só o admin os
-- muda (Admin); a app e as Edge Functions leem-nos.
--
-- Estado no lançamento:
--   OFF: cup (Taça), race_memories (diploma/medalha/mural/fotos da prova),
--        badges (conquistas e medalhas), water (água e lembretes),
--        pantry_advanced (regras e modelos de refeição — os alimentos
--        frequentes ficam sempre), advanced_charts (análises cruzadas e
--        gráficos técnicos), tutorial.
--   ON:  shoes (armário de sapatilhas), load_profile_choice (Prudente /
--        Mais volume).
-- Uma chave que não esteja na tabela vale o defeito do código
-- (_shared/featureFlags.ts, src/…): nunca «tudo ligado» por acidente.

create table if not exists public.app_feature_flags (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  enabled boolean not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

comment on table public.app_feature_flags is
  'Interruptores por funcionalidade (v1 lite, 2026-11-22). Lidos pela app e pelas Edge Functions (_shared/featureFlags.ts); só o admin os muda.';

insert into public.app_feature_flags (key, enabled) values
  ('cup', false),
  ('race_memories', false),
  ('badges', false),
  ('water', false),
  ('pantry_advanced', false),
  ('advanced_charts', false),
  ('tutorial', false),
  ('shoes', true),
  ('load_profile_choice', true)
on conflict (key) do nothing;

-- updated_at e updated_by vêm do servidor.
create or replace function public.app_feature_flags_stamp()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $function$;

drop trigger if exists app_feature_flags_stamp on public.app_feature_flags;
create trigger app_feature_flags_stamp
  before insert or update on public.app_feature_flags
  for each row execute function public.app_feature_flags_stamp();

alter table public.app_feature_flags enable row level security;

revoke all on table public.app_feature_flags from public, anon, authenticated;
-- Ler: o anon só a chave e o estado (o arranque da app lê-os antes do login —
-- o tutorial, por exemplo); o authenticated tudo (o Admin mostra «quando e
-- por quem»). Sem DELETE: um interruptor desliga-se, não se apaga.
grant select (key, enabled) on table public.app_feature_flags to anon;
grant select on table public.app_feature_flags to authenticated;
grant insert, update on table public.app_feature_flags to authenticated;
grant all on table public.app_feature_flags to service_role;

drop policy if exists "anyone reads feature flags" on public.app_feature_flags;
create policy "anyone reads feature flags" on public.app_feature_flags
  for select to anon, authenticated
  using (true);

-- Mudar: só o admin, e sempre `to authenticated` (o anon não tem EXECUTE em
-- is_admin(): uma política «to public» com ela fazia as leituras anónimas
-- darem erro).
drop policy if exists "admin inserts feature flags" on public.app_feature_flags;
create policy "admin inserts feature flags" on public.app_feature_flags
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "admin updates feature flags" on public.app_feature_flags;
create policy "admin updates feature flags" on public.app_feature_flags
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

