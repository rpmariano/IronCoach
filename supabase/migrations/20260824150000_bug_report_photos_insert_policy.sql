-- ============================================================================
-- Repõe a política de INSERT no bucket bug-report-photos.
--
-- Ficou órfã desde 20260822200000_remove_bug_report_screenshot.sql, que a
-- apagou de propósito ao recuar a funcionalidade de screenshot. Quando os
-- anexos (imagens/vídeos) foram reintroduzidos em
-- 20260824100000_bug_reports_attachments_and_notifications.sql, só a
-- política de leitura (admin/revisor) foi recriada — esta de escrita
-- ficou esquecida, e sem ela nenhum upload passava (RLS bloqueava
-- silenciosamente, o que rebentava o submit inteiro do report).
-- ============================================================================

drop policy if exists "authenticated insert own bug report photos" on storage.objects;
create policy "authenticated insert own bug report photos" on storage.objects
  for insert with check (
    bucket_id = 'bug-report-photos'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
