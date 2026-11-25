-- anon e authenticated sem TRUNCATE, TRIGGER, REFERENCES e MAINTAIN nas
-- tabelas de public (2.ª auditoria de segurança, 2026-11-14, B4, aprovada
-- pelo Rui). MAINTAIN existe desde o PG 17 (VACUUM, ANALYZE, REINDEX,
-- REFRESH MATERIALIZED VIEW, CLUSTER, LOCK TABLE) e está no ACL por omissão.
--
-- O Supabase dá ALL nas tabelas novas a anon e authenticated. A RLS não
-- cobre o TRUNCATE (a PostgREST não o expõe, mas uma ligação direta com esses
-- papéis apagava a tabela inteira), e TRIGGER/REFERENCES não servem à app.
-- SELECT/INSERT/UPDATE/DELETE ficam como estão — é a RLS que os governa.
--
-- Também para as tabelas que se criarem daqui em diante (privilégios por
-- omissão do papel postgres, o das migrations).

do $$
declare
  t record;
begin
  for t in
    select c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')
  loop
    execute format('revoke truncate, trigger, references, maintain on table public.%I from anon, authenticated', t.relname);
  end loop;
end $$;

alter default privileges for role postgres in schema public
  revoke truncate, trigger, references, maintain on tables from anon, authenticated;
