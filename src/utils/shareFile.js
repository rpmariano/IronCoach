/* Guardar e partilhar um ficheiro gerado na app — o plano de ritmos como
   imagem (utils/racePlanImage.js) e o mural da prova (RaceMuralSheet). Os
   dois tinham a mesma lógica, cada um a sua cópia (terceira revisão
   pré-deploy, 2026-09-25). */

/** Descarrega o ficheiro (vai para as transferências / a galeria). */
export function downloadFile(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export function canShareFiles() {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

/** Abre a partilha do sistema com o ficheiro; sem suporte para ficheiros,
 *  descarrega-o. Um cancelamento do atleta (AbortError) propaga-se. */
export async function shareOrDownload(file, title) {
  if (canShareFiles() && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
    await navigator.share({ files: [file], title });
    return 'shared';
  }
  downloadFile(file);
  return 'downloaded';
}
