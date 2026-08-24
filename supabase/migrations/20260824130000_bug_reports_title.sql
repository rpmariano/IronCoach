-- ============================================================================
-- Adicionar título obrigatório aos bug reports, para que se consiga
-- identificar de que bug se está a falar (título + id acompanham sempre o
-- bug — na lista do Admin, no detalhe e nas notificações enviadas ao
-- utilizador).
-- ============================================================================

alter table bug_reports add column if not exists title text;

-- Backfill dos reports já existentes (sem título): usa o início da
-- descrição como título provisório, para a coluna poder passar a not null.
update bug_reports
set title = left(description, 60)
where title is null;

alter table bug_reports alter column title set not null;

-- RLS: até agora só os admins liam bug_reports; para o modal de
-- notificações mostrar o título do bug junto da mensagem (join
-- bug_notifications → bug_reports), o próprio autor do report também
-- precisa de conseguir ler a linha do seu bug.
drop policy if exists "user read own bug reports" on bug_reports;
create policy "user read own bug reports" on bug_reports
  for select using (auth.uid() = user_id);
