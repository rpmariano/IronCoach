-- O bucket unknown-app-photos deixa de ser público (auditoria de segurança,
-- 2026-11-13, aprovada pelo Rui).
--
-- Era público desde 20260814000000: qualquer anónimo lia e listava os prints
-- das apps desconhecidas (ecrãs de treino com nomes, ritmos, por vezes a cara
-- de quem os tirou), e qualquer autenticado gravava em QUALQUER caminho.
-- Agora:
--   - o bucket é privado (sem URL pública);
--   - cada um grava só na própria pasta ({user_id}/…), como já fazem o
--     analyze-gym, o analyze-run e o analyze-body (checkAndLogAppImage);
--   - lê o dono e o admin (o Admin.jsx mostra estas fotos — passa a pedir um
--     URL assinado com createSignedUrl em vez do getPublicUrl).
-- As políticas com is_admin() são `to authenticated`: o anon já não tem
-- EXECUTE sobre a função (20260924235403_security_definer_rpc.sql).

update storage.buckets set public = false where id = 'unknown-app-photos';

drop policy if exists "public read unknown photos" on storage.objects;
drop policy if exists "authenticated insert unknown photos" on storage.objects;

drop policy if exists "own insert unknown photos" on storage.objects;
create policy "own insert unknown photos" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'unknown-app-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "own or admin read unknown photos" on storage.objects;
create policy "own or admin read unknown photos" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'unknown-app-photos'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );
