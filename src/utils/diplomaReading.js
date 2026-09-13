import { invokeEdgeFunctionWithTimeout } from '../lib/supabase';
import { formatDuration } from './run';

/* A Carol lê o diploma (pedido 2026-09-13): ao juntar a imagem do diploma
   no registo da prova, a analyze-diploma extrai o que ele traz — tempo de
   chip e bruto, classificações, escalão, participantes, dorsal, parciais —
   e o registo mostra a leitura para o atleta aplicar. Nada se grava sem ele
   tocar em "Aplicar". */

/** Pede a leitura à analyze-diploma. `memory` é o diploma como o formulário
 *  o guarda ({ dataUrl, mime }); PDFs não se leem. Devolve a leitura ou
 *  lança com a mensagem do servidor. */
export async function readDiploma(memory) {
  const dataUrl = memory?.dataUrl;
  if (!dataUrl || memory?.isPdf) throw new Error('Só consigo ler o diploma em imagem.');
  const [head, base64] = String(dataUrl).split(',');
  const mime = (head.match(/data:([^;]+)/) || [])[1] || 'image/jpeg';
  const { data, error } = await invokeEdgeFunctionWithTimeout('analyze-diploma', {
    body: JSON.stringify({ image: base64, mime_type: mime }),
  });
  if (error) throw error;
  if (!data?.reading) throw new Error('Não consegui ler o diploma.');
  return data.reading;
}

/** O que a leitura vai pôr no formulário — o tempo oficial é o de CHIP; sem
 *  chip, o bruto. Só devolve o que a leitura trouxe, para não apagar o que
 *  o atleta já escreveu. */
export function diplomaFormValues(reading) {
  if (!reading) return {};
  const values = {};
  const official = reading.chip_time_seconds || reading.gun_time_seconds;
  if (official) values.officialTime = formatDuration(official);
  if (reading.position) values.position = String(reading.position);
  if (reading.age_group) values.ageGroup = reading.age_group;
  if (reading.age_group_position) values.ageGroupPosition = String(reading.age_group_position);
  if (reading.gender_position) values.genderPosition = String(reading.gender_position);
  if (reading.participants) values.participants = String(reading.participants);
  if (reading.bib_number) values.bibNumber = String(reading.bib_number);
  if (reading.chip_time_seconds && reading.gun_time_seconds && reading.gun_time_seconds !== reading.chip_time_seconds) {
    values.gunTimeSeconds = reading.gun_time_seconds;
  }
  if (Array.isArray(reading.splits) && reading.splits.length) values.officialSplits = reading.splits;
  return values;
}

/** "Tempo de chip 51:27 (bruto 51:51) · 1668.º geral · 226.º no escalão · passagem aos 5 km 25:15" */
export function describeDiplomaReading(reading) {
  if (!reading) return '';
  const parts = [];
  if (reading.chip_time_seconds) {
    parts.push(`tempo de chip ${formatDuration(reading.chip_time_seconds)}${reading.gun_time_seconds && reading.gun_time_seconds !== reading.chip_time_seconds ? ` (bruto ${formatDuration(reading.gun_time_seconds)})` : ''}`);
  } else if (reading.gun_time_seconds) {
    parts.push(`tempo ${formatDuration(reading.gun_time_seconds)}`);
  }
  if (reading.position) parts.push(`${reading.position}.º geral${reading.participants ? ` de ${reading.participants}` : ''}`);
  if (reading.age_group_position) parts.push(`${reading.age_group_position}.º ${reading.age_group || 'no escalão'}`);
  else if (reading.age_group) parts.push(`escalão ${reading.age_group}`);
  if (reading.gender_position) parts.push(`${reading.gender_position}.º no género`);
  if (reading.bib_number) parts.push(`dorsal ${reading.bib_number}`);
  (reading.splits || []).forEach((s) => parts.push(`passagem aos ${s.km} km ${formatDuration(s.seconds)}`));
  return parts.join(' · ');
}
