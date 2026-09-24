import { supabase, invokeEdgeFunctionWithTimeout } from '../lib/supabase';
import { ANALYZE_TIMEOUT_MS } from '../lib/edgeTimeouts';
import { formatDuration } from './run';

/* invokeEdgeFunctionWithTimeout devolve o erro como TEXTO (a mensagem já
   legível), não como Error — quem apanha lia `err.message` e ficava sem
   nada (apanhado pelo hook de pre-push, 2026-09-13). */
const asError = (error) => (error instanceof Error ? error : new Error(typeof error === 'string' ? error : error?.message || 'Falha na chamada ao servidor.'));

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
  }, ANALYZE_TIMEOUT_MS);
  if (error) throw asError(error);
  if (!data?.reading) throw new Error('Não consegui ler o diploma.');
  return data.reading;
}

/** A leitura nas chaves de `runs.details` — a única regra campo a campo:
 *  o tempo oficial é o de CHIP (sem chip, o bruto); o bruto guarda-se só
 *  se for diferente; só entra o que a leitura trouxe, para não apagar o
 *  que o atleta já escreveu. O formulário e o update ao hub derivam daqui. */
export function diplomaDetails(reading) {
  if (!reading) return {};
  const d = {};
  const official = reading.chip_time_seconds || reading.gun_time_seconds;
  if (official) d.official_time_seconds = official;
  if (reading.position) d.position = reading.position;
  if (reading.age_group) d.age_group = reading.age_group;
  if (reading.age_group_position) d.age_group_position = reading.age_group_position;
  if (reading.gender_position) d.gender_position = reading.gender_position;
  if (reading.participants) d.participants = reading.participants;
  if (reading.bib_number) d.bib_number = String(reading.bib_number);
  if (reading.chip_time_seconds && reading.gun_time_seconds && reading.gun_time_seconds !== reading.chip_time_seconds) {
    d.gun_time_seconds = reading.gun_time_seconds;
  }
  if (Array.isArray(reading.splits) && reading.splits.length) d.official_splits = reading.splits;
  return d;
}

/** O que a leitura vai pôr no formulário do registo (campos de texto). */
export function diplomaFormValues(reading) {
  const d = diplomaDetails(reading);
  const values = {};
  if (d.official_time_seconds) values.officialTime = formatDuration(d.official_time_seconds);
  if (d.position) values.position = String(d.position);
  if (d.age_group) values.ageGroup = d.age_group;
  if (d.age_group_position) values.ageGroupPosition = String(d.age_group_position);
  if (d.gender_position) values.genderPosition = String(d.gender_position);
  if (d.participants) values.participants = String(d.participants);
  if (d.bib_number) values.bibNumber = d.bib_number;
  if (d.gun_time_seconds) values.gunTimeSeconds = d.gun_time_seconds;
  if (d.official_splits) values.officialSplits = d.official_splits;
  return values;
}

/** O mesmo que diplomaFormValues, mas direto em `runs.details` — para o
 *  diploma que chega DEPOIS da corrida registada (persiana "Memórias" do
 *  hub): o tempo oficial (chip), a posição e o resto dos campos do diploma
 *  entram na corrida já gravada. Só toca no que a leitura trouxe. */
export function diplomaDetailsPatch(details, reading) {
  const current = details && typeof details === 'object' ? details : {};
  const next = { ...current, ...diplomaDetails(reading) };
  return { details: next, changed: JSON.stringify(next) !== JSON.stringify(current) };
}

/** Grava a leitura na corrida (update a runs.details, sob a RLS "own rows")
 *  e devolve a corrida com os detalhes novos. Sem corrida não há onde
 *  aplicar. */
export async function applyDiplomaToRun(run, reading) {
  if (!run?.id) throw new Error('A prova ainda não tem a corrida registada.');
  const { details, changed } = diplomaDetailsPatch(run.details, reading);
  if (!changed) return run;
  const { error } = await supabase.from('runs').update({ details }).eq('id', run.id);
  if (error) throw asError(error);
  return { ...run, details };
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
