import { invokeEdgeFunctionWithTimeout } from '../lib/supabase';
import { useAppStore } from '../store';
import { buildRaceAfterCandidate, markProactiveSent, wasProactiveSent, RACE_BALANCE_CACHE_PREFIX } from './coachProactive';

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

/* invokeEdgeFunctionWithTimeout devolve o erro como TEXTO (a mensagem já
   legível), não como Error — quem apanha lia `err.message` e ficava sem
   nada (apanhado pelo hook de pre-push, 2026-09-13). */
const asError = (error) => (error instanceof Error ? error : new Error(typeof error === 'string' ? error : error?.message || 'Falha na chamada ao servidor.'));

const CACHE_PREFIX = RACE_BALANCE_CACHE_PREFIX;

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

/* Exportada: o coachIntent 'race_balance' do Início (Coach.jsx) pede o
   balanço por este mesmo caminho (proactive_force), mas passando pelo fluxo
   normal do chat, não por requestRaceBalance — precisa de gravar a mesma
   cópia local para o hub, se aberto a seguir, mostrar logo o balanço já
   dado em vez de convidar a pedi-lo outra vez (specs/gamificacao-provas.md,
   "os dois sítios"). */
export function writeCachedBalance(raceId, entry) {
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
      proactive_key: candidate.key,
      race_outcome: candidate.raceOutcome,
      proactive_force: true,
      userData: profile || {},
    }),
  });
  if (error) throw asError(error);
  const text = data?.model_message?.content;
  if (!text) throw new Error('A Carol não respondeu.');
  const suggestions = Array.isArray(data?.suggestions) ? data.suggestions.filter((s) => typeof s === 'string' && s.trim()) : [];

  markProactiveSent(profile?.id, candidate);
  const entry = { text, suggestions, at: new Date().toISOString() };
  writeCachedBalance(race.id, entry);

  // Só o chat: escrever em raceEvents a partir daqui fazia o efeito de
  // carregamento do RunAgenda repor o rascunho por gravar dos "Detalhes"
  // (revisão pré-deploy 2026-09-13). A prova atualiza-se por quem monta o
  // hub (RaceBalanceCard → onSaved → writeRaceEventsLocally).
  useAppStore.getState().addCoachMessage({ id: data?.model_message?.id || `${Date.now()}`, role: 'assistant', content: text });
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
  if (error) throw asError(error);
  const caption = typeof data?.caption === 'string' ? data.caption.trim() : '';
  if (!caption) throw new Error('A Carol não escreveu a legenda.');
  return caption;
}
