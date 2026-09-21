/* A sincronização das medalhas (specs/palmares-medalhoes.md, "Dados" e
   "O momento da medalha").

   `computeMedalhoes` (utils/medalhoes.js) diz que medalhas os dados provam —
   a lista `due`. Aqui compara-se essa lista com `medal_awards` e grava-se o
   que falta, para ficar a saber QUANDO se ganhou e se o atleta JÁ VIU o
   momento. O título e a frase não são colunas: reconstroem-se do `due` pela
   chave (medalhão, encaixe, período), para a Carol poder afinar o texto sem
   migração.

   Best-effort em tudo: a tabela pode ainda não existir (a migração só se
   aplica com pedido explícito) ou a rede falhar. Nesse caso devolve-se
   `available: false`, avisa-se UMA vez na consola e a app segue — uma
   medalha por mostrar nunca pode partir o arranque.

   O cliente do Supabase importa-se tarde (`await import`), como convém a
   algo que corre depois do `loadInitialData` e não no primeiro ecrã. */

/** Quando há várias por ver, mostra-se a mais significativa primeiro: as das
 *  provas antes das do volume — um recorde numa prova pesa mais do que o mês
 *  em quilómetros, que se ganha só por acumular. */
export const MEDALHAO_SIGNIFICANCE = ['recordes', 'distancias', 'superacao', 'terreno', 'sequencia', 'ano_km'];

const COLUMNS = 'id, medalhao, slot, period_key, value, race_id, awarded_at, seen_at';
const HISTORICO_DIAS = 7;

let warned = false;

function warnOnce(message, error) {
  if (warned) return;
  warned = true;
  console.warn(`[medal_awards] ${message}`, error?.message || error || '');
}

/** Só para os testes: volta a permitir o aviso. */
export function __resetMedalAwardsWarning() {
  warned = false;
}

async function getClient() {
  const mod = await import('../lib/supabase');
  return mod.supabase;
}

const keyOf = (medalhao, slot, periodKey) => `${medalhao}|${slot}|${periodKey ?? ''}`;

/** O dia do prémio como timestamptz: meio-dia local, para o dia nunca
 *  escorregar para o anterior ao passar a UTC. */
function awardedAtOf(day) {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return new Date().toISOString();
  return new Date(`${day}T12:00:00`).toISOString();
}

function rank(medalhao) {
  const i = MEDALHAO_SIGNIFICANCE.indexOf(medalhao);
  return i < 0 ? MEDALHAO_SIGNIFICANCE.length : i;
}

function decorate(rows, dueByKey) {
  return rows
    .map((row) => {
      const entry = dueByKey.get(keyOf(row.medalhao, row.slot, row.period_key));
      return {
        id: row.id,
        medalhao: row.medalhao,
        slot: row.slot,
        period_key: row.period_key,
        value: row.value == null ? null : Number(row.value),
        race_id: row.race_id ?? null,
        awarded_at: row.awarded_at,
        title: entry?.title ?? null,
        line: entry?.line ?? null,
      };
    })
    .sort((a, b) => rank(a.medalhao) - rank(b.medalhao) || String(b.awarded_at).localeCompare(String(a.awarded_at)));
}

/**
 * Grava as medalhas devidas que ainda não estão em `medal_awards` e devolve
 * as que falta ver.
 * @returns {Promise<{ pending: object[], available: boolean }>}
 */
export async function syncMedalAwards({ userId, due = [] } = {}) {
  const unavailable = { pending: [], available: false };
  if (!userId) return unavailable;
  try {
    const supabase = await getClient();
    const dueList = Array.isArray(due) ? due : [];
    const dueByKey = new Map(dueList.map((d) => [keyOf(d.medalhao, d.slot, d.periodKey), d]));

    const { data: existing, error: readError } = await supabase
      .from('medal_awards')
      .select(COLUMNS)
      .eq('user_id', userId);
    if (readError) {
      warnOnce('tabela indisponível — medalhas sem histórico nem momento.', readError);
      return unavailable;
    }
    const rows = existing || [];
    const have = new Set(rows.map((r) => keyOf(r.medalhao, r.slot, r.period_key)));
    const missing = dueList.filter((d) => !have.has(keyOf(d.medalhao, d.slot, d.periodKey)));

    if (missing.length === 0) {
      return { pending: decorate(rows.filter((r) => !r.seen_at), dueByKey), available: true };
    }

    /* O que já estava ganho é histórico — grava-se como visto, para não
       animar meses de corridas de uma vez. Só o que tem mais de uma semana:
       a medalha que o atleta acabou de ganhar tem de a ver a tocar.

       A guarda era `firstSync && ehHistorico(d)`, e isso só protegia a
       primeiríssima sincronização. Quando uma regra nova passa a cunhar
       medalhas com data antiga — foi o que a escala bronze/prata/ouro
       d'Os Recordes fez, até 18 de uma vez por corridas de há meses —,
       toda a gente que já tinha UMA linha na tabela caía fora da guarda e
       abria a app com a tempestade de animações que este código existe
       precisamente para evitar. A data do feito é que decide, não o estado
       da tabela. */
    const now = new Date().toISOString();
    const historicoAte = new Date(Date.now() - HISTORICO_DIAS * 86400000).toISOString().slice(0, 10);
    const ehHistorico = (d) => !d.awardedOn || d.awardedOn < historicoAte;
    const payload = missing.map((d) => ({
      user_id: userId,
      medalhao: d.medalhao,
      slot: d.slot,
      period_key: d.periodKey ?? '',
      value: d.value ?? null,
      race_id: d.raceId ?? null,
      awarded_at: awardedAtOf(d.awardedOn),
      seen_at: ehHistorico(d) ? now : null,
    }));

    const { error: writeError } = await supabase
      .from('medal_awards')
      .upsert(payload, { onConflict: 'user_id,medalhao,slot,period_key', ignoreDuplicates: true });
    if (writeError) {
      warnOnce('não foi possível gravar as medalhas.', writeError);
      return unavailable;
    }

    // Relê o que falta ver: outro dispositivo pode ter gravado entretanto.
    const { data: unseen, error: unseenError } = await supabase
      .from('medal_awards')
      .select(COLUMNS)
      .eq('user_id', userId)
      .is('seen_at', null);
    if (unseenError) {
      warnOnce('não foi possível ler as medalhas por ver.', unseenError);
      return unavailable;
    }
    return { pending: decorate(unseen || [], dueByKey), available: true };
  } catch (error) {
    warnOnce('falha na sincronização.', error);
    return unavailable;
  }
}

/** Marca o momento como visto. Best-effort, como a sincronização: se falhar,
 *  o pior caso é a medalha voltar a tocar da próxima vez. */
export async function markMedalAwardsSeen(ids) {
  const list = (Array.isArray(ids) ? ids : []).filter(Boolean);
  if (list.length === 0) return;
  try {
    const supabase = await getClient();
    const { error } = await supabase
      .from('medal_awards')
      .update({ seen_at: new Date().toISOString() })
      .in('id', list);
    if (error) warnOnce('não foi possível marcar as medalhas como vistas.', error);
  } catch (error) {
    warnOnce('falha ao marcar as medalhas como vistas.', error);
  }
}
