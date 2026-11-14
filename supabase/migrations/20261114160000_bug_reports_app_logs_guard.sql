-- bug_reports e app_logs: o que a app não pode escolher, e tamanhos máximos
-- (2.ª auditoria de segurança, 2026-11-14, B3, aprovada pelo Rui).
--
-- bug_reports
--   - user_email e user_name vêm da conta, não do cliente: um trigger
--     preenche-os a partir do JWT (email) e de profiles.display_name. (O cliente
--     mandava profile.full_name, uma coluna que não existe — user_name ficava
--     sempre a null; agora fica com o nome.)
--   - status, bug_number, resolved_at e resolved_by deixam de se escolher ao
--     criar: privilégios por coluna — o INSERT da app só toca nas colunas do
--     report; o resto vem dos defaults.
--   - Ao mudar o estado (só quem pode rever, pela política «admin update bug
--     reports»), só status/resolved_at/resolved_by são atualizáveis, e
--     resolved_at/resolved_by vêm do servidor (now() e auth.uid()).
--   - Tamanhos: título 200, descrição 5000, página 200, user agent 500,
--     10 anexos (hoje: 60, 857, 28, 111 e 2 no máximo). Vindo da app, o
--     trigger CORTA ao limite em vez de deixar o report falhar (quem reporta
--     já tropeçou num problema — perder o report é o pior desfecho); as CHECK
--     ficam como rede para o resto.
-- app_logs
--   - Tamanhos: event 100, message 4000, meta 16000 caracteres em JSON (hoje:
--     22, 140 e 414 no máximo). Valem também para os registos do servidor.
--
-- As CHECK ficam NOT VALID: as linhas antigas não são verificadas (cabem
-- todas, mas assim aplicar a migration não depende disso).

-- ── bug_reports: privilégios por coluna ──────────────────────────────────
revoke insert, update on public.bug_reports from anon, authenticated;
grant insert (user_id, user_email, user_name, title, description, page, user_agent, attachment_urls)
  on public.bug_reports to authenticated;
grant update (status, resolved_at, resolved_by) on public.bug_reports to authenticated;

-- ── bug_reports: o que vem da conta e do servidor ────────────────────────
-- Sem security definer (como guard_profile_privilege_columns): current_user é
-- o papel de quem escreve. O email vem do JWT (o mesmo de auth.users) e o
-- nome do perfil do próprio, que a RLS o deixa ler.
create or replace function public.guard_bug_report_columns()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  -- A service role e a consola SQL escrevem o que quiserem.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Cortar, não recusar (os mesmos limites das CHECK em baixo).
    new.title := left(new.title, 200);
    new.description := left(new.description, 5000);
    new.page := left(new.page, 200);
    new.user_agent := left(new.user_agent, 500);
    new.attachment_urls := new.attachment_urls[1:10];
    new.user_email := nullif(auth.jwt() ->> 'email', '');
    new.user_name := (select p.display_name from public.profiles p where p.id = auth.uid());
    new.status := 'open';
    new.resolved_at := null;
    new.resolved_by := null;
  elsif new.status is distinct from old.status then
    if new.status = 'resolved' then
      new.resolved_at := now();
      new.resolved_by := auth.uid();
    else
      new.resolved_at := null;
      new.resolved_by := null;
    end if;
  else
    new.resolved_at := old.resolved_at;
    new.resolved_by := old.resolved_by;
  end if;
  return new;
end $function$;

drop trigger if exists guard_bug_report_columns on public.bug_reports;
create trigger guard_bug_report_columns
  before insert or update on public.bug_reports
  for each row execute function public.guard_bug_report_columns();

-- ── Tamanhos ─────────────────────────────────────────────────────────────
alter table public.bug_reports drop constraint if exists bug_reports_sizes;
alter table public.bug_reports add constraint bug_reports_sizes check (
  char_length(title) <= 200
  and char_length(description) <= 5000
  and char_length(page) <= 200
  and (user_agent is null or char_length(user_agent) <= 500)
  and (attachment_urls is null or coalesce(array_length(attachment_urls, 1), 0) <= 10)
) not valid;

alter table public.app_logs drop constraint if exists app_logs_sizes;
alter table public.app_logs add constraint app_logs_sizes check (
  char_length(event) <= 100
  and (message is null or char_length(message) <= 4000)
  and (meta is null or char_length(meta::text) <= 16000)
) not valid;
