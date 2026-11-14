-- ============================================================================
-- Adicionar suporte a respostas dos utilizadores às notificações de bugs
-- ============================================================================

-- Adicionar colunas para tracking de respostas
alter table bug_notifications add column if not exists response_status text check (response_status in ('ok', 'not_ok')) default null;
alter table bug_notifications add column if not exists response_message text default null;
alter table bug_notifications add column if not exists responded_at timestamptz default null;

-- Índice para tracking de respostas não lidas
create index if not exists bug_notifications_unresponded_idx on bug_notifications(bug_report_id) where response_status is null;
