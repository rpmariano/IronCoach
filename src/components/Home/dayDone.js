/* O dia fechado — "O que faço hoje" depois de feito.

   Antes, concluir o treino do dia mudava só a cor da data, e o "Concluído"
   vivia dentro da gaveta fechada do detalhe. O dia fechado é o gesto que
   mais se repete na app: merece ficar à vista, e dizer o que foi feito de
   facto contra o que estava pedido — "8,2 km a 5.31 por km. Cumprido." —
   sem aplauso (CAROL.md: o que é normal regista-se, não se celebra).

   Os itens concluídos guardam o registo que os fechou (completed_run_id,
   completed_session_id — store.completePlanItem); é daí que vêm os números.
   Puro, para os testes.

   «Cumprido.» só quando é verdade (pedido 2026-09-26). Antes, o ginásio
   dizia-o sempre — pernas de 60 min registadas com 15 min de braços davam
   «3 séries. Cumprido.» a verde —, e a corrida olhava só para os km: 6 km
   de corrida contínua contra «Intervalos · 6 km» também era «Cumprido.».
   Uma treinadora que dá por cumprido o que não foi deixa de ser lida. O
   veredicto sai agora da mesma comparação que o torna verdadeiro: o tipo
   de corrida, os grupos musculares e a duração do ginásio. Sem nada que se
   possa comparar, não há veredicto — fica o que foi feito, sem nota. */

import { formatPace } from '../../utils/run';
import { computeSessionVolumeKg } from '@formulas/sessionVolumeKg.ts';

const km = (v) => String(Math.round(Number(v) * 10) / 10).replace('.', ',');
const milhares = (n) => Math.round(n).toLocaleString('pt-PT');
const juntar = (xs) => (xs.length <= 1 ? (xs[0] || '') : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`);

/* ── A corrida: o tipo que o plano pedia contra o que ficou registado ──────
   Os tipos estruturados (o mesmo grupo «Estruturado» do registo, mais as
   subidas) são os que mudam o treino; entre dois tipos soltos — contínua
   por longa, recuperação por regenerativo — o que conta são os km, e isso
   já se compara abaixo. Um registo sem tipo (a prova, registos antigos)
   não se compara. */
const ESTRUTURADOS = new Set(['intervalos', 'tempo', 'fartlek', 'subidas']);
const TIPO_DITO = {
  intervalos: 'intervalos',
  tempo: 'treino de ritmo',
  fartlek: 'fartlek',
  subidas: 'subidas',
  continuo: 'corrida contínua',
  longo: 'rodagem longa',
  recuperacao: 'recuperação',
  regenerativo: 'corrida regenerativa',
  trail: 'trail',
  tecnico: 'técnico em trilho',
};

/** A frase do tipo trocado, ou null quando o tipo bate (ou não se sabe).
 *  "ficou registada como": é o que o registo diz, não uma acusação — quem
 *  registou pelo separador Corrida e não mexeu no tipo lê isto e corrige. */
function tipoTrocado(item, run) {
  const pedido = item?.training_type;
  const feito = run?.training_type;
  if (!pedido || !feito || pedido === feito) return null;
  if (!ESTRUTURADOS.has(pedido) && !ESTRUTURADOS.has(feito)) return null;
  if (!TIPO_DITO[pedido] || !TIPO_DITO[feito]) return null;
  return `O plano pedia ${TIPO_DITO[pedido]}; ficou registada como ${TIPO_DITO[feito]}.`;
}

/* ── O ginásio: a zona do corpo que o plano pedia contra a que foi feita ───
   Os grupos musculares vêm escritos de maneiras diferentes (o plano diz
   «Pernas», o registo «Pernas Inferiores» e «Glúteos»), por isso compara-se
   a zona: pernas, tronco, core, cardio. Um nome que não se sabe ler (uma
   modalidade de aula, «Outro») não se compara — sem veredicto em vez de um
   veredicto inventado. «Full Body» e afins servem qualquer zona. */
const ZONA = new Map([
  ...['pernas', 'pernas superiores', 'pernas inferiores', 'membros inferiores', 'glúteos', 'gluteos', 'posterior',
    'quadríceps', 'quadriceps', 'isquiotibiais', 'gémeos', 'gemeos', 'solear'].map((c) => [c, 'pernas']),
  ...['peito', 'costas', 'ombros', 'bíceps', 'biceps', 'tríceps', 'triceps', 'braços', 'bracos', 'antebraços',
    'antebracos', 'tronco', 'membros superiores'].map((c) => [c, 'tronco']),
  ...['core/abdominais', 'core', 'abdominais', 'abdominal'].map((c) => [c, 'core']),
  ['cardio', 'cardio'],
  ...['full body', 'corpo inteiro', 'geral', 'ginásio', 'ginasio', 'treino funcional', 'funcional', 'calistenia',
    'crossfit', 'levantamento olímpico', 'levantamento olimpico', 'powerlifting'].map((c) => [c, '*']),
]);
const nomeGrupo = (c) => String(c || '').trim().toLowerCase();

/** 'igual' | 'diferente' | null (sem dados, ou um nome que não se sabe ler). */
function compararGrupos(pedidos, feitos) {
  const a = (pedidos || []).map((c) => ZONA.get(nomeGrupo(c)) ?? null);
  const b = (feitos || []).map((c) => ZONA.get(nomeGrupo(c)) ?? null);
  if (!a.length || !b.length || a.includes(null) || b.includes(null)) return null;
  if (a.includes('*') || b.includes('*')) return 'igual';
  return a.some((z) => b.includes(z)) ? 'igual' : 'diferente';
}

/* Abaixo de 80% da duração pedida, a sessão ficou curta: 50 min numa hora
   ainda é a sessão da hora; 15 min já não é. */
const GINASIO_CURTO = 0.8;

/** Para um treino concluído: { text, verdict } — o feito e a leitura dele. */
export function doneLine(item, { runs = [], gymSessions = [] } = {}) {
  if (!item || item.status !== 'concluido') return null;

  if (item.kind === 'corrida') {
    const run = (runs || []).find((r) => r?.id === item.completed_run_id);
    const dist = Number(run?.distance_km);
    if (!run || !(dist > 0)) return { text: 'Feito.', verdict: null };
    const ritmo = Number(run.duration_seconds) > 0 ? formatPace(Number(run.duration_seconds) / dist) : null;
    const text = `${km(dist)} km${ritmo ? ` a ${ritmo} por km` : ''}.`;
    // O tipo primeiro: 6 km contínuos contra intervalos de 6 km batem nos
    // km e não são o treino que estava pedido.
    const trocado = tipoTrocado(item, run);
    if (trocado) return { text, verdict: trocado };
    const alvo = Number(item.target_distance_km);
    if (!(alvo > 0)) return { text, verdict: null };
    const razao = dist / alvo;
    if (razao < 0.95) return { text, verdict: `Ficaste nos ${km(dist)} de ${km(alvo)} km.` };
    if (razao > 1.15) return { text, verdict: `Mais ${km(dist - alvo)} km do que o plano pedia.` };
    return { text, verdict: 'Cumprido.' };
  }

  if (item.kind === 'ginasio') {
    const s = (gymSessions || []).find((g) => g?.id === item.completed_session_id);
    if (!s) return { text: 'Feito.', verdict: null };
    const series = s.workout_session_sets?.length || 0;
    const volume = computeSessionVolumeKg(s);
    // Os minutos que se dizem são os que se comparam (revisão de
    // 2026-09-26): uns segundos soltos — «0:20» lido como minutos:segundos
    // — davam «0 min.» e «Ficaste nos 0 de 60 min.»; e 47,6 min saíam
    // «Ficaste nos 48 de 60 min.», curto com o número de quem cumpriu.
    const feitoMin = Math.round(Number(s.duration_seconds) / 60) || 0;
    const alvoMin = Number(item.target_duration_min);
    const temDuracao = feitoMin > 0 && alvoMin > 0;
    // Uma aula sem séries tem, quase sempre, a duração: é isso que se diz.
    let text;
    if (series) text = `${series} ${series === 1 ? 'série' : 'séries'}${volume > 0 ? ` · ${milhares(volume)} kg levantados` : ''}.`;
    else if (feitoMin > 0) text = `${feitoMin} min.`;
    else return { text: 'Feito.', verdict: null };

    const grupos = compararGrupos(item.categories, s.categories);
    if (grupos === 'diferente') {
      const lista = (cs) => juntar([...new Set(cs.map(nomeGrupo))]);
      return { text, verdict: `O plano pedia ${lista(item.categories)}; fizeste ${lista(s.categories)}.` };
    }
    if (temDuracao && feitoMin / alvoMin < GINASIO_CURTO) {
      return { text, verdict: `Ficaste nos ${feitoMin} de ${Math.round(alvoMin)} min.` };
    }
    return { text, verdict: temDuracao || grupos === 'igual' ? 'Cumprido.' : null };
  }
  return null;
}

const seenKey = (userId, dateISO) => `ironcoach_day_done_seen_${userId || 'anon'}_${dateISO}`;

/** A chave deste momento em coach_impressions (kind 'moment', ação 5.1) — a
 *  mesma na escrita (DayPlanCard) e na leitura (wasDayDoneSeen). */
export const dayDoneMomentKey = (dateISO) => `daydone:${dateISO}`;

/* Visto neste telemóvel (localStorage) ou em qualquer outro: `shown` é o
   impressionShown do store (chaves `kind:key`), opcional. */
export function wasDayDoneSeen(userId, dateISO, shown = null, storage = globalThis.localStorage) {
  if (shown?.has(`moment:${dayDoneMomentKey(dateISO)}`)) return true;
  try { return storage?.getItem(seenKey(userId, dateISO)) === '1'; } catch { return true; }
}

export function markDayDoneSeen(userId, dateISO, storage = globalThis.localStorage) {
  try { storage?.setItem(seenKey(userId, dateISO), '1'); } catch { /* sem storage */ }
}
