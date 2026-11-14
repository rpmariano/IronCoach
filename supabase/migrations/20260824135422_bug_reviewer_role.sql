-- ============================================================================
-- Adicionar role de "bug_reviewer" para utilizadores que só veem bug reports
-- ============================================================================

-- Adicionar coluna na tabela profiles
alter table profiles add column if not exists bug_reviewer boolean default false;

-- Índice para filtrar bug reviewers facilmente
create index if not exists profiles_bug_reviewer_idx on profiles(bug_reviewer) where bug_reviewer = true;
