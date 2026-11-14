-- push_subscriptions e water_logs endurecidas (auditoria de segurança,
-- 2026-11-14, item M2).
--
-- ORDEM DE APLICAÇÃO: o save-push-subscription novo (service role) tem de
-- estar em produção ANTES desta migração. O antigo grava com o JWT do atleta;
-- depois do revoke abaixo esse upsert falhava sempre (e ninguém conseguia
-- ligar as notificações). O novo funciona com e sem esta migração.
-- O frontend (src/lib/push.js) não grava diretamente nesta tabela: só lê
-- (select das suas) e apaga (delete das suas, ao terminar sessão) — as duas
-- políticas que ficam.
--
-- 1. CHECK no endpoint: https e só os serviços de push dos browsers. A mesma
--    expressão que PUSH_ENDPOINT_PATTERN em
--    supabase/functions/_shared/pushEndpoint.ts — se mudar lá, muda aqui.
--    Sem isto o envio do servidor (send-water-reminders, coach-proactive-tick)
--    ia para o URL que o cliente gravasse (SSRF).
--    NOT VALID: as linhas que já existem não são verificadas (não se pode
--    garantir daqui que nenhuma foge à lista); as novas e as alteradas sim.
--    Para validar depois, ver primeiro se alguma fica de fora:
--      select id, user_id, left(endpoint, 60) from public.push_subscriptions
--      where endpoint !~* '<a mesma expressão>';
--    apagá-las (ou deixá-las morrer no próximo 404/410) e então:
--      alter table public.push_subscriptions
--        validate constraint push_subscriptions_endpoint_allowed;
alter table public.push_subscriptions
  drop constraint if exists push_subscriptions_endpoint_allowed;
alter table public.push_subscriptions
  add constraint push_subscriptions_endpoint_allowed
  check (
    endpoint ~* '^https://(fcm\.googleapis\.com|jmt17\.google\.com|([a-z0-9-]+\.)+push\.apple\.com|updates\.push\.services\.mozilla\.com|([a-z0-9-]+\.)+notify\.windows\.com)/'
    and length(endpoint) <= 2048
  ) not valid;

-- 2. RLS: o cliente deixa de inserir e alterar subscrições. A política
--    "own rows" era `for all` — com ela qualquer autenticado gravava o
--    endpoint que quisesse, sem passar pela validação nem pelo limite de 10
--    por atleta do save-push-subscription. Fica o dono a ler e a apagar as
--    suas (o que o src/lib/push.js faz) e o "admin read all" como estava.
--    O revoke é a segunda tranca: mesmo que alguém volte a criar uma
--    política de insert/update, sem o privilégio não passa. A service role
--    (as Edge Functions) não é afetada.
drop policy if exists "own rows" on public.push_subscriptions;

drop policy if exists "own read" on public.push_subscriptions;
create policy "own read" on public.push_subscriptions
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "own delete" on public.push_subscriptions;
create policy "own delete" on public.push_subscriptions
  for delete to authenticated
  using (auth.uid() = user_id);

revoke insert, update on public.push_subscriptions from anon, authenticated;

-- 3. user_id → auth.users(id) com on delete cascade, em push_subscriptions e
--    em water_logs. Nenhuma das duas tinha chave estrangeira
--    (supabase_schema.sql): apagar uma conta deixava as subscrições (e o
--    servidor a enviar notificações de uma conta que já não existe para um
--    telemóvel que pode já ser de outra pessoa) e o histórico de água.
--    As linhas órfãs que já existam (de contas apagadas) apagam-se antes —
--    é exatamente o que o cascade teria feito, e sem isso a chave não entra.
--    O drop é para o caso de alguém a ter criado à mão (nome por omissão do
--    Postgres) sem o cascade.
delete from public.push_subscriptions ps
  where not exists (select 1 from auth.users u where u.id = ps.user_id);
alter table public.push_subscriptions
  drop constraint if exists push_subscriptions_user_id_fkey;
alter table public.push_subscriptions
  add constraint push_subscriptions_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

delete from public.water_logs wl
  where not exists (select 1 from auth.users u where u.id = wl.user_id);
alter table public.water_logs
  drop constraint if exists water_logs_user_id_fkey;
alter table public.water_logs
  add constraint water_logs_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

comment on constraint push_subscriptions_endpoint_allowed on public.push_subscriptions is
  'Só https e serviços de push conhecidos (FCM, Apple, Mozilla, WNS). Igual a _shared/pushEndpoint.ts. Auditoria de segurança 2026-11-14.';
comment on table public.push_subscriptions is
  'Subscrições Web Push (PWA). Escrita só pelo save-push-subscription (service role, máx. 10 por atleta); o dono lê e apaga as suas. Auditoria de segurança 2026-11-14.';
