import { supabase } from '../lib/supabase';
import { compressImage } from '../lib/image';

/* Memórias da prova — diploma, medalha e fotografias do dia. Vivem em
   race_events (diploma_path, medal_path, photo_paths), num bucket privado,
   e podem juntar-se em DOIS momentos (pedido 2026-09-13): ao registar a
   prova, ou mais tarde no hub, na persiana "Memórias" — concluir a prova é
   registar a corrida; as memórias são uma oferta, não uma condição.

   Este módulo é o que os dois sítios partilham: ler o ficheiro escolhido,
   assinar o que já está no bucket, e enviar/gravar. Cada memória é
   { dataUrl?, blob?, url?, path?, isPdf?, name?, mime? }: `blob` só existe
   enquanto o ficheiro é novo e está por enviar; `path`/`url` são o que já
   está no bucket (e a sua signed URL). */

// Fotografias do DIA da prova — não confundir com os prints do relógio, que
// são a matéria-prima da análise da Carol.
export const MAX_RACE_PHOTOS = 6;
// Espelha o file_size_limit do bucket race-memories
// (supabase/migrations/20260912171242_race_completion.sql): o cliente diz
// porque recusou em vez de deixar o upload falhar com um 413 sem explicação.
export const MAX_MEMORY_BYTES = 2097152;
export const RACE_MEMORIES_BUCKET = 'race-memories';

/* O Storage recebe bytes; a compressImage devolve um dataUrl. `fetch(dataUrl)`
   resolveria isto numa linha, mas não é fiável em todos os contextos (jsdom
   nos testes, WebViews antigas) — atob/Uint8Array é síncrono e funciona em
   qualquer lado. */
export function dataUrlToBlob(dataUrl) {
  const [head, body] = String(dataUrl).split(',');
  const mime = (head.match(/data:([^;]+)/) || [])[1] || 'image/jpeg';
  const binary = atob(body || '');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

// As imagens passam pela mesma compressImage dos prints (JPEG, 1600px,
// ~300 KB). O PDF do diploma vai inteiro — comprimir um PDF não é coisa
// que se faça no browser —, e por isso é o único que precisa da verificação
// do limite de 2 MB do bucket.
export async function readMemoryImage(file) {
  const { dataUrl } = await compressImage(file);
  return { dataUrl, blob: dataUrlToBlob(dataUrl), mime: 'image/jpeg' };
}

/** Diploma escolhido: imagem ou PDF. Devolve { memory } ou { error }. */
export async function pickDiploma(file) {
  if (!file) return { memory: null, error: '' };
  if (file.type === 'application/pdf') {
    if (file.size > MAX_MEMORY_BYTES) {
      return { memory: null, error: 'O diploma em PDF tem mais de 2 MB. Escolhe um ficheiro mais pequeno ou uma fotografia dele.' };
    }
    return { memory: { blob: file, mime: 'application/pdf', isPdf: true, name: file.name }, error: '' };
  }
  try {
    const img = await readMemoryImage(file);
    return { memory: { ...img, isPdf: false, name: file.name }, error: '' };
  } catch (err) {
    console.warn('Falha a processar o diploma', err);
    return { memory: null, error: 'Não consegui ler esse ficheiro. Tenta uma imagem ou um PDF.' };
  }
}

/** Medalha escolhida: só imagem. Devolve { memory } ou { error }. */
export async function pickMedal(file) {
  if (!file) return { memory: null, error: '' };
  try {
    return { memory: await readMemoryImage(file), error: '' };
  } catch (err) {
    console.warn('Falha a processar a medalha', err);
    return { memory: null, error: 'Não consegui ler essa imagem. Tenta outra.' };
  }
}

/** Fotografias escolhidas, respeitando o teto de MAX_RACE_PHOTOS sobre as
 *  que já lá estão. Devolve { added, error } — `error` é aviso, não recusa
 *  total (as primeiras que cabem ficam). */
export async function pickPhotos(files, currentCount) {
  const list = Array.from(files || []);
  if (!list.length) return { added: [], error: '' };
  const remaining = MAX_RACE_PHOTOS - currentCount;
  if (remaining <= 0) return { added: [], error: `Já tens ${MAX_RACE_PHOTOS} fotografias. Remove uma para acrescentar outra.` };
  let error = list.length > remaining ? `Guardei as primeiras ${remaining} — o limite é de ${MAX_RACE_PHOTOS} fotografias.` : '';
  const added = [];
  for (const file of list.slice(0, remaining)) {
    try {
      added.push(await readMemoryImage(file));
    } catch (err) {
      console.warn('Falha a processar a fotografia da prova', err);
      error = 'Não consegui ler uma das imagens.';
    }
  }
  return { added, error };
}

export function raceHasMemories(race) {
  return !!(race?.diploma_path || race?.medal_path || (race?.photo_paths || []).length);
}

async function signPath(path) {
  if (!path) return null;
  try {
    const { data, error } = await supabase.storage.from(RACE_MEMORIES_BUCKET).createSignedUrl(path, 3600);
    return error ? null : (data?.signedUrl || null);
  } catch {
    return null;
  }
}

/** As memórias JÁ guardadas numa prova, com as URLs assinadas na hora (o
 *  bucket é privado). Devolve { diploma, medal, photos } prontos a entrar
 *  no estado de quem edita. */
export async function signRaceMemories(race) {
  const paths = race?.photo_paths || [];
  if (!raceHasMemories(race)) return { diploma: null, medal: null, photos: [] };
  const [diplomaUrl, medalUrl, ...photoUrls] = await Promise.all([
    signPath(race.diploma_path), signPath(race.medal_path), ...paths.map(signPath),
  ]);
  return {
    diploma: race.diploma_path ? {
      path: race.diploma_path,
      url: diplomaUrl,
      isPdf: race.diploma_path.toLowerCase().endsWith('.pdf'),
      name: race.diploma_path.split('/').pop(),
    } : null,
    medal: race.medal_path ? { path: race.medal_path, url: medalUrl, dataUrl: medalUrl } : null,
    photos: paths.map((path, i) => ({ path, url: photoUrls[i], dataUrl: photoUrls[i] })),
  };
}

/* Envia o que é novo para race-memories/<uid>/<raceId>/… e grava os
   caminhos na prova (mais o que vier em `extraPatch`, p.ex. o status).
   Diploma e medalha têm nome fixo (é uma de cada; upsert substitui). As
   fotografias levam nome ÚNICO: com nomes por posição, remover a 1.ª de três
   e juntar uma nova enviava-a como photo-3.jpg por cima da antiga e a
   galeria ficava com a mesma foto duas vezes (apanhado na revisão
   pré-deploy). O que deixou de ser referenciado apaga-se do bucket no fim,
   para nada ficar a ocupar espaço para sempre — best-effort: se falhar,
   fica só no log. Devolve o patch gravado. */
export async function persistRaceMemories({ userId, raceId, current, diploma, medal, photos, extraPatch = {} }) {
  const base = `${userId}/${raceId}`;
  const bucket = supabase.storage.from(RACE_MEMORIES_BUCKET);
  const before = new Set([current?.diploma_path, current?.medal_path, ...(current?.photo_paths || [])].filter(Boolean));

  const send = async (path, memory) => {
    const { error } = await bucket.upload(path, memory.blob, {
      upsert: true,
      contentType: memory.mime || 'image/jpeg',
    });
    if (error) throw error;
    return path;
  };

  const patch = { ...extraPatch };
  patch.diploma_path = diploma
    ? (diploma.blob ? await send(`${base}/diploma.${diploma.isPdf ? 'pdf' : 'jpg'}`, diploma) : diploma.path || null)
    : null;
  patch.medal_path = medal
    ? (medal.blob ? await send(`${base}/medal.jpg`, medal) : medal.path || null)
    : null;

  const photoPaths = [];
  const stamp = Date.now();
  for (let i = 0; i < (photos || []).length; i += 1) {
    const photo = photos[i];
    photoPaths.push(photo.blob ? await send(`${base}/photo-${stamp}-${i + 1}.jpg`, photo) : photo.path);
  }
  patch.photo_paths = photoPaths.filter(Boolean);

  const { error } = await supabase.from('race_events').update(patch).eq('id', raceId);
  if (error) throw error;

  const kept = new Set([patch.diploma_path, patch.medal_path, ...patch.photo_paths].filter(Boolean));
  const orphans = [...before].filter(p => !kept.has(p));
  if (orphans.length && typeof bucket.remove === 'function') {
    const { error: removeError } = await bucket.remove(orphans);
    if (removeError) console.warn('Memórias antigas da prova não apagadas do bucket', removeError);
  }
  return patch;
}
