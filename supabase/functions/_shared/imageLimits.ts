// O tamanho máximo de cada imagem que as analyze-* aceitam (2.ª auditoria de
// segurança, 2026-11-14, M4).
//
// As imagens chegam em base64 no corpo do pedido e vão inteiras para o Gemini
// (que cobra cada token da imagem) e para o storage. Sem limite, um cliente
// mandava dezenas de MB por foto. O cliente comprime antes de enviar: nas
// fotos guardadas até hoje, a maior tem 440 KB (meal-photos). 6 990 000
// caracteres de base64 são ~5 MB de imagem — o mesmo teto que os buckets
// passam a ter (20261114140000_storage_bucket_limits.sql).

export const MAX_IMAGE_B64_CHARS = 6_990_000; // ≤ 5 MiB (5 242 880 bytes) depois de descodificado

/** A mesma frase do analyze-diploma. */
export const IMAGE_TOO_LARGE_TEXT = "Imagem demasiado grande.";

/** Alguma imagem do corpo (`images[]` ou `image`) passa do limite? */
// deno-lint-ignore no-explicit-any
export function hasOversizedImage(body: any, max = MAX_IMAGE_B64_CHARS): boolean {
  if (!body || typeof body !== "object") return false;
  // deno-lint-ignore no-explicit-any
  const sizeOf = (x: any): number =>
    typeof x === "string" ? x.length : typeof x?.data === "string" ? x.data.length : 0;
  const list = Array.isArray(body.images) ? body.images : [];
  return list.some((x: unknown) => sizeOf(x) > max) || sizeOf(body.image) > max;
}
