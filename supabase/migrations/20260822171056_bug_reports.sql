-- ============================================================================
-- bug_reports — reports de erro submetidos pelos atletas a partir do botão
-- discreto disponível em todos os ecrãs (ver src/components/shared/
-- ReportIssueButton.jsx).
--
-- Ao contrário de unknown_app_image_logs (screenshots de apps de terceiros,
-- bucket público porque o conteúdo é sempre um ecrã de outra app), aqui a
-- captura é do PRÓPRIO IronCoach — pode conter dados pessoais do atleta
-- (refeições, avaliações corporais, conversa com o Coach, etc.) — por isso
-- o bucket é privado e só admins conseguem gerar signed URLs para o ver.
--
-- user_email/user_name ficam desnormalizados no momento da submissão: são
-- só para o ecrã de Admin conseguir identificar quem reportou sem precisar
-- de mais um join/RPC, e sobrevivem mesmo que o utilizador seja apagado
-- (user_id fica null nesse caso, on delete set null).
-- ============================================================================

create table if not exists bug_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  user_email text,
  user_name text,
  description text not null,
  page text not null,
  screenshot_path text,
  user_agent text,
  status text not null default 'open' check (status in ('open', 'resolved')),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists bug_reports_created_idx on bug_reports(created_at desc);
create index if not exists bug_reports_status_idx on bug_reports(status);

alter table bug_reports enable row level security;

drop policy if exists "insert own bug reports" on bug_reports;
create policy "insert own bug reports" on bug_reports
  for insert with check (auth.uid() = user_id);

drop policy if exists "admin read bug reports" on bug_reports;
create policy "admin read bug reports" on bug_reports
  for select using (public.is_admin());

drop policy if exists "admin update bug reports" on bug_reports;
create policy "admin update bug reports" on bug_reports
  for update using (public.is_admin());

-- Bucket para os screenshots dos reports (privado — ver nota acima).
insert into storage.buckets (id, name, public)
values ('bug-report-photos', 'bug-report-photos', false)
on conflict (id) do nothing;

-- Cada utilizador só pode escrever dentro da própria pasta ({user_id}/...,
-- ver ReportIssueButton.jsx) — mais restrito que o "authenticated insert"
-- da unknown-app-photos, porque aqui o conteúdo pode ser pessoal.
drop policy if exists "authenticated insert own bug report photos" on storage.objects;
create policy "authenticated insert own bug report photos" on storage.objects
  for insert with check (
    bucket_id = 'bug-report-photos'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "admin read bug report photos" on storage.objects;
create policy "admin read bug report photos" on storage.objects
  for select using (bucket_id = 'bug-report-photos' and public.is_admin());
