/* O dia fechado — "O que faço hoje" depois de feito.

   Antes, concluir o treino do dia mudava só a cor da data, e o "Concluído"
   vivia dentro da gaveta fechada do detalhe. O dia fechado é o gesto que
   mais se repete na app: merece ficar à vista, e dizer o que foi feito de
   facto contra o que estava pedido — "8,2 km a 5.31 por km. Cumprido." —
   sem aplauso (CAROL.md: o que é normal regista-se, não se celebra).

   Os itens concluídos guardam o registo que os fechou (completed_run_id,
   completed_session_id — store.completePlanItem); é daí que vêm os números.
   Puro, para os testes. */

import { formatPace } from '../../utils/run';
import { computeSessionVolumeKg } from '@formulas/sessionVolumeKg.ts';

const km = (v) => String(Math.round(Number(v) * 10) / 10).replace('.', ',');
const milhares = (n) => Math.round(n).toLocaleString('pt-PT');

/** Para um treino concluído: { text, verdict } — o feito e a leitura dele. */
export function doneLine(item, { runs = [], gymSessions = [] } = {}) {
  if (!item || item.status !== 'concluido') return null;

  if (item.kind === 'corrida') {
    const run = (runs || []).find((r) => r?.id === item.completed_run_id);
    const dist = Number(run?.distance_km);
    if (!run || !(dist > 0)) return { text: 'Feito.', verdict: null };
    const ritmo = Number(run.duration_seconds) > 0 ? formatPace(Number(run.duration_seconds) / dist) : null;
    const text = `${km(dist)} km${ritmo ? ` a ${ritmo} por km` : ''}.`;
    const alvo = Number(item.target_distance_km);
    if (!(alvo > 0)) return { text, verdict: null };
    const razao = dist / alvo;
    if (razao < 0.95) return { text, verdict: `Ficaste nos ${km(dist)} de ${km(alvo)} km.` };
    if (razao > 1.15) return { text, verdict: `Mais ${km(dist - alvo)} km do que o plano pedia.` };
    return { text, verdict: 'Cumprido.' };
  }

  if (item.kind === 'ginasio') {
    const s = (gymSessions || []).find((g) => g?.id === item.completed_session_id);
    const series = s?.workout_session_sets?.length || 0;
    const volume = s ? computeSessionVolumeKg(s) : 0;
    if (!s || !series) return { text: 'Feito.', verdict: null };
    return { text: `${series} ${series === 1 ? 'série' : 'séries'}${volume > 0 ? ` · ${milhares(volume)} kg levantados` : ''}.`, verdict: 'Cumprido.' };
  }
  return null;
}

const seenKey = (userId, dateISO) => `ironcoach_day_done_seen_${userId || 'anon'}_${dateISO}`;

export function wasDayDoneSeen(userId, dateISO, storage = globalThis.localStorage) {
  try { return storage?.getItem(seenKey(userId, dateISO)) === '1'; } catch { return true; }
}

export function markDayDoneSeen(userId, dateISO, storage = globalThis.localStorage) {
  try { storage?.setItem(seenKey(userId, dateISO), '1'); } catch { /* sem storage */ }
}
