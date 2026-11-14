/* Auditoria de segurança M4 (2026-11-14): os anexos dos bug reports. Antes ia o File cru, com o
   content-type que o cliente dizia (até vídeos de 50 MB). Agora só imagens — JPEG, PNG, WebP e
   HEIC (o formato das fotos do iPhone) —, comprimidas para JPEG antes de subir
   (ReportIssueButton.jsx). O tipo vem do browser; um HEIC chega às vezes sem tipo, e aí vale a
   extensão. */

export const REPORT_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const REPORT_IMAGE_EXT = /\.(jpe?g|png|webp|heic|heif)$/i;
export const REPORT_IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif';
// Antes de comprimir: uma foto de câmara grande cabe; a que sobe tem umas centenas de KB.
export const REPORT_IMAGE_MAX_BYTES = 25 * 1024 * 1024;

export function isAcceptedReportImage(file) {
  if (!file) return false;
  const type = String(file.type || '').toLowerCase();
  if (type) return REPORT_IMAGE_TYPES.includes(type);
  return REPORT_IMAGE_EXT.test(String(file.name || ''));
}

/** Um anexo antigo em vídeo (antes de 2026-11-14 aceitavam-se MP4/WebM): mostra-se num <video>. */
export const isVideoAttachment = (path) => /\.(mp4|webm)$/i.test(String(path || ''));
