-- As fotos de apps desconhecidas podem ser apagadas (2.ª auditoria de
-- segurança, 2026-11-14, resíduo da 1.ª, aprovada pelo Rui).
--
-- O bucket unknown-app-photos tinha INSERT do dono e SELECT do dono/admin,
-- mas nenhuma política de DELETE: o Admin apagava a linha de
-- unknown_app_image_logs («admin delete unknown logs») e a imagem ficava no
-- storage para sempre, e o atleta também não a podia apagar. Agora:
--   - o dono apaga as da sua pasta (`<user_id>/…`);
--   - o admin apaga qualquer uma (o Admin.jsx passa a apagar a imagem junto
--     com o registo — mudança do Frontend).
-- `to authenticated`: o anon já não tem EXECUTE em is_admin().

drop policy if exists "own or admin delete unknown photos" on storage.objects;
create policy "own or admin delete unknown photos" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'unknown-app-photos'
    and ((storage.foldername(name))[1] = (auth.uid())::text or public.is_admin())
  );
