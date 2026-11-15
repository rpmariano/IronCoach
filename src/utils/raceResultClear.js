import { supabase } from '../lib/supabase';
import { useAppStore } from '../store';
import { findRaceRun } from './run';
import { RACE_BALANCE_CACHE_PREFIX } from './coachProactive';

/* Apagar o RESULTADO de uma prova, sem apagar a prova (bug de 2026-11-15: a atleta queria refazer o
   tempo, tocou em «Eliminar» e a prova inteira foi-se — a corrida ficou órfã, race_id null pela FK).

   O que o registo da prova grava (RunRegistration, modo prova): na corrida, race_id e o resultado
   (runs.details: tempo oficial, posição…); na prova, status 'concluida', as memórias e, depois, o
   balanço da Carol (coach_balance/_at). As conquistas leem-se da corrida ligada.

   Apagar o resultado é o inverso, como o trigger de 20260928220705 faz ao apagar a corrida: a prova
   volta a 'agendada' sem o balanço; as memórias (diploma, medalha, fotos) ficam, são do atleta e
   voltam a aparecer ao registar outra vez. A corrida desliga-se (fica como treino) ou apaga-se — a
   escolha é do atleta. Todos os pedidos levam o user_id, por defesa (além da RLS). */

export const RESULT_CLEARED_PATCH = Object.freeze({ status: 'agendada', coach_balance: null, coach_balance_at: null });

/* As corridas que são o resultado desta prova: as ligadas por race_id e, para registos anteriores a
   essa coluna, a que findRaceRun encontra pela data. */
export function raceResultRuns(race, runs) {
  if (!race?.id) return [];
  const list = Array.isArray(runs) ? runs : [];
  const linked = list.filter((r) => r?.race_id === race.id);
  const found = findRaceRun(list, race);
  if (found && !linked.some((r) => r.id === found.id)) linked.push(found);
  return linked;
}

// Uma prova «tem resultado» quando está concluída ou já tem corrida ligada.
export function raceHasResult(race, runs) {
  if (!race) return false;
  return race.status === 'concluida' || raceResultRuns(race, runs).length > 0;
}

const isDemo = (userId) => userId === 'demo-user';

function dropBalanceCache(raceId) {
  try { window.localStorage.removeItem(`${RACE_BALANCE_CACHE_PREFIX}${raceId}`); } catch { /* sem storage */ }
}

/* deleteRuns: true apaga as corridas do resultado; false desliga-as (race_id null) e ficam como
   treino. Devolve { ok, message? }. Atualiza o store (provas, corridas e, se apagou, o plano). */
export async function clearRaceResult({ race, userId, deleteRuns }) {
  if (!race?.id || !userId) return { ok: false, message: 'Sem sessão.' };
  const store = useAppStore.getState();
  const resultRuns = raceResultRuns(race, store.runs);
  const linkedIds = resultRuns.filter((r) => r.race_id === race.id).map((r) => r.id);
  const runIds = deleteRuns ? resultRuns.map((r) => r.id) : linkedIds;

  if (!isDemo(userId)) {
    try {
      for (const id of runIds) {
        const q = deleteRuns
          ? supabase.from('runs').delete().eq('id', id).eq('user_id', userId)
          : supabase.from('runs').update({ race_id: null }).eq('id', id).eq('user_id', userId);
        const { error } = await q;
        if (error) throw error;
      }
      const { data, error } = await supabase.from('race_events').update(RESULT_CLEARED_PATCH)
        .eq('id', race.id).eq('user_id', userId).select('id').maybeSingle();
      if (error || !data) {
        // A prova não mudou: as corridas desligadas voltam a ela (apagadas já não voltam).
        if (!deleteRuns) {
          for (const id of linkedIds) {
            await Promise.resolve(supabase.from('runs').update({ race_id: race.id }).eq('id', id).eq('user_id', userId)).catch(() => {});
          }
        }
        throw error || new Error('Não encontrei a prova.');
      }
    } catch (err) {
      console.error('[apagar o resultado]', err);
      return { ok: false, message: 'Não consegui apagar o resultado. Tenta outra vez.' };
    }
  }

  const now = useAppStore.getState();
  const ids = new Set(runIds);
  now.setRaceEvents((now.raceEvents || []).map((e) => (e.id === race.id ? { ...e, ...RESULT_CLEARED_PATCH } : e)));
  if (typeof now.setRuns === 'function') {
    now.setRuns(deleteRuns
      ? (now.runs || []).filter((r) => !ids.has(r.id))
      : (now.runs || []).map((r) => (ids.has(r.id) ? { ...r, race_id: null } : r)));
  }
  dropBalanceCache(race.id);
  // Apagar corridas solta os treinos do plano que cumpriam (trigger na BD): relê-se o plano.
  if (deleteRuns && runIds.length && !isDemo(userId)) {
    Promise.resolve(now.reloadAfterRunDeleted?.()).catch(() => {});
  }
  return { ok: true };
}

// Eliminar a prova inteira. A corrida ligada fica (FK SET NULL) — como treino.
export async function deleteRaceEvent({ raceId, userId }) {
  if (!raceId || !userId) return { ok: false, message: 'Sem sessão.' };
  if (!isDemo(userId)) {
    const { error } = await supabase.from('race_events').delete().eq('id', raceId).eq('user_id', userId);
    if (error) {
      console.error('[eliminar prova]', error);
      return { ok: false, message: 'Não consegui eliminar a prova. Tenta outra vez.' };
    }
  }
  const now = useAppStore.getState();
  now.setRaceEvents((now.raceEvents || []).filter((e) => e.id !== raceId));
  if (typeof now.setRuns === 'function' && (now.runs || []).some((r) => r.race_id === raceId)) {
    now.setRuns((now.runs || []).map((r) => (r.race_id === raceId ? { ...r, race_id: null } : r)));
  }
  dropBalanceCache(raceId);
  return { ok: true };
}
