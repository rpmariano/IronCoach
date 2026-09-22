/* A sincronização dos badges de treino — o par de `utils/medalAwards.js`
   para a tabela `user_badges` (migração 20260922120000_user_badges.sql).

   `computeBadges` (utils/badges.js) diz o que os dados provam estar ganho —
   a lista `due`. Aqui compara-se essa lista com o que já está gravado e
   escreve-se o que falta, para ficar a saber QUANDO se ganhou e se o atleta
   JÁ VIU. O nome e a frase não são colunas: reconstroem-se do `due` pela
   chave (badge, nível, período), para se poderem afinar sem migração.

   APPEND-ONLY. Nunca se apaga no caminho normal: recalcular com uma regra
   afinada pode deixar de PROPOR um badge, mas não pode RETIRAR um que o
   atleta já viu. É por isso que a escrita é `upsert(..., { ignoreDuplicates:
   true })` — um insert que não faz nada quando a linha já existe — e não um
   update.

   Best-effort em tudo, como as medalhas: a tabela pode ainda não existir (a
   migração só se aplica com pedido explícito) ou a rede falhar. Nesse caso
   devolve-se `available: false`, avisa-se UMA vez na consola e a app segue —
   um badge por gravar nunca pode partir a Vitrina.

   O momento da conquista (o ecrã/cartão que toca quando se ganha) é a fase 4
   e ainda não existe: `pending` já vem de cá calculado, mas ninguém o mostra
   e nada se marca como visto. Até lá, um badge ganho aparece na grelha — que
   é onde tem de estar de qualquer maneira. */

const COLUMNS = 'id, badge_key, tier, period_key, value, value_unit, race_id, awarded_at, seen_at';

/** O que tem mais de uma semana é história: grava-se já visto, para a fase 4
 *  não abrir a app com meses de animações de uma vez (é a mesma heurística,
 *  e a mesma janela, de `utils/medalAwards.js`). */
const HISTORICO_DIAS = 7;

let warned = false;

function warnOnce(message, error) {
  if (warned) return;
  warned = true;
  console.warn(`[user_badges] ${message}`, error?.message || error || '');
}

/** Só para os testes: volta a permitir o aviso. */
export function __resetBadgeAwardsWarning() {
  warned = false;
}

async function getClient() {
  const mod = await import('../lib/supabase');
  return mod.supabase;
}

const keyOf = (badgeKey, tier, periodKey) => `${badgeKey}|${tier ?? ''}|${periodKey ?? ''}`;

/** O dia do prémio como timestamptz: meio-dia local, para o dia nunca
 *  escorregar para o anterior ao passar a UTC. */
function awardedAtOf(day) {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return new Date().toISOString();
  return new Date(`${day}T12:00:00`).toISOString();
}

function decorate(rows, dueByKey) {
  return rows
    .map((row) => {
      const entry = dueByKey.get(keyOf(row.badge_key, row.tier, row.period_key));
      return {
        id: row.id,
        badge_key: row.badge_key,
        tier: row.tier || '',
        period_key: row.period_key,
        value: row.value == null ? null : Number(row.value),
        value_unit: row.value_unit ?? null,
        race_id: row.race_id ?? null,
        awarded_at: row.awarded_at,
        title: entry?.title ?? null,
        line: entry?.line ?? null,
      };
    })
    .sort((a, b) => String(b.awarded_at).localeCompare(String(a.awarded_at)));
}

/**
 * Grava os badges devidos que ainda não estão em `user_badges` e devolve os
 * que falta ver.
 * @returns {Promise<{ pending: object[], available: boolean }>}
 */
export async function syncBadgeAwards({ userId, due = [] } = {}) {
  const unavailable = { pending: [], available: false };
  if (!userId) return unavailable;
  try {
    const supabase = await getClient();
    const dueList = Array.isArray(due) ? due : [];
    const dueByKey = new Map(dueList.map((d) => [keyOf(d.badgeKey, d.tier, d.periodKey), d]));

    const { data: existing, error: readError } = await supabase
      .from('user_badges')
      .select(COLUMNS)
      .eq('user_id', userId);
    if (readError) {
      warnOnce('tabela indisponível — badges sem histórico nem momento.', readError);
      return unavailable;
    }
    const rows = existing || [];
    const have = new Set(rows.map((r) => keyOf(r.badge_key, r.tier, r.period_key)));
    const missing = dueList.filter((d) => !have.has(keyOf(d.badgeKey, d.tier, d.periodKey)));

    if (missing.length === 0) {
      return { pending: decorate(rows.filter((r) => !r.seen_at), dueByKey), available: true };
    }

    const now = new Date().toISOString();
    const historicoAte = new Date(Date.now() - HISTORICO_DIAS * 86400000).toISOString().slice(0, 10);
    const ehHistorico = (d) => !d.awardedOn || d.awardedOn < historicoAte;
    const payload = missing.map((d) => ({
      user_id: userId,
      badge_key: d.badgeKey,
      // '' é "sem nível", como o `period_key` de medal_awards: a coluna é
      // `not null` de propósito — em Postgres dois NULL são DISTINTOS numa
      // chave única, e a linha sem nível duplicava a cada sincronização (ver
      // o comentário da migração).
      tier: d.tier || '',
      period_key: d.periodKey ?? '',
      value: d.value ?? null,
      value_unit: d.valueUnit ?? null,
      race_id: d.raceId ?? null,
      awarded_at: awardedAtOf(d.awardedOn),
      seen_at: ehHistorico(d) ? now : null,
    }));

    const { error: writeError } = await supabase
      .from('user_badges')
      .upsert(payload, { onConflict: 'user_id,badge_key,tier,period_key', ignoreDuplicates: true });
    if (writeError) {
      warnOnce('não foi possível gravar os badges.', writeError);
      return unavailable;
    }

    // Relê o que falta ver: outro dispositivo pode ter gravado entretanto.
    const { data: unseen, error: unseenError } = await supabase
      .from('user_badges')
      .select(COLUMNS)
      .eq('user_id', userId)
      .is('seen_at', null);
    if (unseenError) {
      warnOnce('não foi possível ler os badges por ver.', unseenError);
      return unavailable;
    }
    return { pending: decorate(unseen || [], dueByKey), available: true };
  } catch (error) {
    warnOnce('falha na sincronização.', error);
    return unavailable;
  }
}

/** Marca os momentos como vistos. Best-effort, como a sincronização: se
 *  falhar, o pior caso é o badge voltar a tocar da próxima vez. Ainda sem
 *  chamador — é a fase 4 que o vai usar. */
export async function markBadgeAwardsSeen(ids) {
  const list = (Array.isArray(ids) ? ids : []).filter(Boolean);
  if (list.length === 0) return;
  try {
    const supabase = await getClient();
    const { error } = await supabase
      .from('user_badges')
      .update({ seen_at: new Date().toISOString() })
      .in('id', list);
    if (error) warnOnce('não foi possível marcar os badges como vistos.', error);
  } catch (error) {
    warnOnce('falha ao marcar os badges como vistos.', error);
  }
}
