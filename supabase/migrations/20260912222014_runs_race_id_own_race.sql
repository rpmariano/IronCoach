-- ============================================================================
-- runs.race_id só pode apontar para uma prova do próprio atleta.
--
-- Porquê: a RLS "own rows" de runs valida user_id, mas a verificação da chave
-- estrangeira ignora RLS — um cliente podia gravar race_id de uma prova de
-- OUTRO utilizador (sem fuga de dados, porque não a consegue ler, mas fica
-- uma ligação que não devia existir). Apanhado na revisão pré-deploy de
-- 2026-09-12. Policy RESTRITIVA (soma-se à permissiva "own rows" em vez de a
-- alargar): `using (true)` não tira nada a leituras/apagamentos; o `with
-- check` é que fecha a porta em inserts e updates.
-- ============================================================================
drop policy if exists "runs race_id own race" on public.runs;
create policy "runs race_id own race" on public.runs
  as restrictive
  for all
  using (true)
  with check (
    race_id is null
    or exists (
      select 1 from public.race_events r
      where r.id = race_id and r.user_id = auth.uid()
    )
  );
