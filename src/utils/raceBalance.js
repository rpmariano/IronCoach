import { invokeEdgeFunctionWithTimeout } from '../lib/supabase';
import { useAppStore } from '../store';
import { buildRaceAfterCandidate, markProactiveSent, wasProactiveSent } from './coachProactive';

/* O balanço completo da Carol no hub da prova (pedido 2026-09-13).

   O hub mostrava só a linha de números da régua ("ficaste a 1:28 do
   objetivo — foi por pouco"); o balanço a sério — duas ou três bolhas, a
   explicação pelos parciais, o levantar da cabeça e a pergunta "para a
   próxima é para fazer melhor?" — só existia no chat, e só se o atleta o
   abrisse depois da prova. Agora o hub pede-o ao coach-chat assim que a
   corrida está registada (o mesmo turno `race_after`, com `proactive_force`
   para não cair na regra "ela falou há pouco") e mostra-o ali.

   Onde fica guardado: o servidor escreve-o em race_events.coach_balance; a
   resposta vai também para o chat (o servidor grava-a em coach_messages) e
   para uma cópia local, para o hub o ter já sem esperar pelo recarregar da
   prova — e para funcionar mesmo antes de a coluna existir. */

const CACHE_PREFIX = 'ironcoach:balanco:';

export function readCachedBalance(raceId) {
  if (!raceId) return null;
  try {
    const raw = window.localStorage.getItem(`${CACHE_PREFIX}${raceId}`);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed.text === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

function writeCachedBalance(raceId, entry) {
  try {
    window.localStorage.setItem(`${CACHE_PREFIX}${raceId}`, JSON.stringify(entry));
  } catch {
    /* sem storage — o servidor tem a cópia */
  }
}

/** O balanço que já existe para esta prova: a coluna, senão a cópia local. */
export function existingRaceBalance(race) {
  if (race?.coach_balance) return { text: race.coach_balance, suggestions: [] };
  return readCachedBalance(race?.id);
}

/** True se a Carol já fez este balanço a partir do chat (neste dispositivo)
 *  — aí não se pede outra vez sem o atleta o mandar, para não duplicar. */
export function balanceAlreadyGivenInChat({ race, run, runs, raceEvents, profile }) {
  const candidate = buildRaceAfterCandidate({ race, run, runs, raceEvents, profile });
  return !!candidate && wasProactiveSent(profile?.id, candidate);
}

/**
 * Pede o balanço à Carol e devolve { text, suggestions }. Grava a cópia local,
 * marca o momento como dito (o chat não repete) e põe a mensagem no chat.
 * Lança em caso de erro — quem chama mostra o "Tentar de novo".
 */
export async function requestRaceBalance({ race, run, runs, raceEvents, profile }) {
  const candidate = buildRaceAfterCandidate({ race, run, runs, raceEvents, profile });
  if (!candidate) throw new Error('Sem corrida registada para esta prova.');
  const { data, error } = await invokeEdgeFunctionWithTimeout('coach-chat', {
    body: JSON.stringify({
      message: '',
      proactive_trigger: 'race_after',
      proactive_details: candidate.details,
      race_outcome: candidate.raceOutcome,
      proactive_force: true,
      userData: profile || {},
    }),
  });
  if (error) throw error;
  const text = data?.model_message?.content;
  if (!text) throw new Error('A Carol não respondeu.');
  const suggestions = Array.isArray(data?.suggestions) ? data.suggestions.filter((s) => typeof s === 'string' && s.trim()) : [];

  markProactiveSent(profile?.id, candidate);
  const entry = { text, suggestions, at: new Date().toISOString() };
  writeCachedBalance(race.id, entry);

  const store = useAppStore.getState();
  store.addCoachMessage({ id: data?.model_message?.id || `${Date.now()}`, role: 'assistant', content: text });
  store.setRaceEvents((store.raceEvents || []).map((e) => (e.id === race.id ? { ...e, coach_balance: text, coach_balance_at: entry.at } : e)));
  return entry;
}

/** O balanço em parágrafos — o servidor separa as "bolhas" por linha em branco. */
export function balanceParagraphs(text) {
  return String(text || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
}

/** A legenda do mural, pela Carol (coach-chat, `race_caption`): na primeira
 *  pessoa do atleta, com os números da régua. Sem histórico e sem gravar
 *  mensagem nenhuma. */
export async function requestRaceCaption({ race, run, runs, raceEvents, profile }) {
  const candidate = buildRaceAfterCandidate({ race, run, runs, raceEvents, profile });
  if (!candidate) throw new Error('Sem corrida registada para esta prova.');
  const { data, error } = await invokeEdgeFunctionWithTimeout('coach-chat', {
    body: JSON.stringify({ message: '', race_caption: true, race_outcome: candidate.raceOutcome }),
  });
  if (error) throw error;
  const caption = typeof data?.caption === 'string' ? data.caption.trim() : '';
  if (!caption) throw new Error('A Carol não escreveu a legenda.');
  return caption;
}
