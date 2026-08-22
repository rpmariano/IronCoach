-- Remove a capacidade de screenshot do report de erro (ver
-- ReportIssueButton.jsx) — decisão de recuar a funcionalidade pouco depois
-- de a introduzir (bug_reports estava vazia em produção, por isso é seguro
-- descartar a coluna sem perder dados de ninguém).
--
-- O bucket bug-report-photos em si NÃO é apagado aqui: o Postgres da
-- Supabase bloqueia DELETE direto em storage.buckets via SQL ("Direct
-- deletion from storage tables is not allowed. Use the Storage API
-- instead."). Sem as policies abaixo o bucket fica órfão — privado, vazio,
-- sem ninguém com permissão de inserir ou ler — e pode ser removido à mão
-- no dashboard (Storage) ou via Storage API sempre que for conveniente.

alter table bug_reports drop column if exists screenshot_path;

drop policy if exists "authenticated insert own bug report photos" on storage.objects;
drop policy if exists "admin read bug report photos" on storage.objects;
