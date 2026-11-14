-- Limites de tamanho e de tipo nos buckets que ainda não os tinham (2.ª
-- auditoria de segurança, 2026-11-14, M4, aprovada pelo Rui).
--
-- Sem file_size_limit nem allowed_mime_types, um cliente autenticado subia o
-- que quisesse para a sua pasta (`<user_id>/…`): ficheiros de qualquer tipo e
-- tamanho, a pagar em storage. Os valores vêm do que existe hoje (consulta de
-- 2026-11-14): todas as fotos são image/jpeg, comprimidas pelo cliente; a
-- maior por bucket anda entre 120 KB e 440 KB, e nos bug reports 1,9 MB.
--
-- - Fotos (5 buckets): 5 MB, jpeg/png/webp/heic/heif — os tipos que as
--   analyze-* já aceitam (o mesmo teto que _shared/imageLimits.ts põe no
--   base64 de cada imagem).
-- - bug-report-photos: 20 MB, e também gif, mp4 e webm — o ReportIssueButton
--   aceita «image/png,image/jpeg,image/gif,video/mp4,video/webm» (um vídeo
--   curto de um ecrã passa os 5 MB). Um anexo recusado não perde o report:
--   o botão grava-o e avisa que o anexo ficou por enviar.
-- - race-memories já tem 2 MB e a sua lista (com PDF): não muda.
--
-- Só vale para uploads novos: os objetos que já lá estão não são tocados.

update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
where id in ('body-photos', 'gym-photos', 'meal-photos', 'run-photos', 'unknown-app-photos');

update storage.buckets
set file_size_limit = 20971520,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif', 'video/mp4', 'video/webm']
where id = 'bug-report-photos';
