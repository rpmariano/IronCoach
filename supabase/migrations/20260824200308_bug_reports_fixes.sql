-- ============================================================================
-- Correções ao sistema de bug reports:
--
-- 1. bug_number: identificador curto e sequencial ("Bug-001") em vez do
--    uuid truncado que era mostrado no Admin e nas notificações — pedido
--    explícito do utilizador, o uuid não é fácil de comunicar verbalmente.
--
-- 2. can_review_bugs(): admin OU bug_reviewer. As policies criadas nas
--    migrações anteriores só deixavam is_admin() ler bug_reports/
--    bug_notifications/anexos — um bug_reviewer via a aba no Admin mas as
--    queries voltavam vazias (RLS a bloquear), e o próprio admin não
--    conseguia ler o histórico de notificações de reports de outros
--    utilizadores (só havia policy para o próprio autor da notificação).
-- ============================================================================

-- 1. Numeração sequencial e legível dos bugs ---------------------------------
alter table bug_reports add column if not exists bug_number integer;

with numbered as (
  select id, row_number() over (order by created_at asc) as rn
  from bug_reports
)
update bug_reports br
set bug_number = numbered.rn
from numbered
where br.id = numbered.id and br.bug_number is null;

create sequence if not exists bug_reports_bug_number_seq;
select setval('bug_reports_bug_number_seq', coalesce((select max(bug_number) from bug_reports), 1), coalesce((select max(bug_number) is not null from bug_reports), false));


alter table bug_reports alter column bug_number set default nextval('bug_reports_bug_number_seq');
alter table bug_reports alter column bug_number set not null;
alter sequence bug_reports_bug_number_seq owned by bug_reports.bug_number;

alter table bug_reports drop constraint if exists bug_reports_bug_number_key;
alter table bug_reports add constraint bug_reports_bug_number_key unique (bug_number);

-- 2. Acesso de revisão (admin ou bug_reviewer) -------------------------------
create or replace function public.can_review_bugs()
returns boolean language sql security definer set search_path = public as $$
  select coalesce(
    (select is_admin or bug_reviewer from public.profiles where id = auth.uid()),
    false
  );
$$;

drop policy if exists "admin read bug reports" on bug_reports;
create policy "admin read bug reports" on bug_reports
  for select using (public.can_review_bugs());

drop policy if exists "admin update bug reports" on bug_reports;
create policy "admin update bug reports" on bug_reports
  for update using (public.can_review_bugs());

drop policy if exists "admin insert notifications" on bug_notifications;
create policy "admin insert notifications" on bug_notifications
  for insert with check (public.can_review_bugs());

drop policy if exists "admin read notifications" on bug_notifications;
create policy "admin read notifications" on bug_notifications
  for select using (public.can_review_bugs());

drop policy if exists "admin read bug report photos" on storage.objects;
create policy "admin read bug report photos" on storage.objects
  for select using (bucket_id = 'bug-report-photos' and public.can_review_bugs());
