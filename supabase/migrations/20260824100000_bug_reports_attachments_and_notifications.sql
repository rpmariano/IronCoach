-- ============================================================================
-- Extensão ao schema de bug_reports para suportar:
-- 1. attachment_urls: URLs de imagens/vídeos anexados ao bug report
-- 2. bug_notifications: tabela para registar mensagens enviadas aos utilizadores
-- ============================================================================

-- Adicionar coluna de attachment URLs
alter table bug_reports add column if not exists attachment_urls text[] default null;

-- Criar tabela de notificações de bugs
create table if not exists bug_notifications (
  id uuid primary key default gen_random_uuid(),
  bug_report_id uuid not null references bug_reports(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  message text not null,
  notification_type text not null check (notification_type in ('status_update', 'request_testing', 'resolved')),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists bug_notifications_user_idx on bug_notifications(user_id, created_at desc);
create index if not exists bug_notifications_bug_idx on bug_notifications(bug_report_id);
create index if not exists bug_notifications_unread_idx on bug_notifications(user_id) where read_at is null;

-- RLS para bug_notifications
alter table bug_notifications enable row level security;

drop policy if exists "users can read own notifications" on bug_notifications;
create policy "users can read own notifications" on bug_notifications
  for select using (auth.uid() = user_id);

drop policy if exists "admin insert notifications" on bug_notifications;
create policy "admin insert notifications" on bug_notifications
  for insert with check (public.is_admin());

drop policy if exists "users mark own as read" on bug_notifications;
create policy "users mark own as read" on bug_notifications
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
