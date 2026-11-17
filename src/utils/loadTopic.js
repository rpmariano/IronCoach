/* A carga e o volume como assunto da Carol (bug #123, 2026-11-17, pedido do Rui: «não seria melhor
   ser um alerta da Carol e ir ao chat falar com ela?»).

   No Início deixa de haver o LoadProfileCard: fica um alerta dela, curto e na voz dela, que diz o
   que se passa e porquê agora; «Falar com a Carol» abre o chat com o assunto (coachIntent
   'load_topic'), e é lá que ela explica a carga e o volume com os números e oferece a escolha. No
   hub da prova, a linha «Perfil de carga · mudar» fica.

   Uma vez por mudança de estado: cada estado tem uma assinatura (a prova que manda, o estado e, se
   houver, a prova concluída que subiu a carga). Sai quando a conversa aconteceu (o servidor diz
   load_topic_shown) ou quando ele escolhe o perfil (o estado muda), ou com «Dispensar». A marca
   fica neste dispositivo (localStorage) e, pela impressão 'moment', nos outros. */

export const LOAD_TOPIC_TITLE = 'A tua carga de corrida';
const STORAGE_PREFIX = 'ironcoach:carga-tratada:';
const MAX_HANDLED = 30;

const storageKey = (userId) => `${STORAGE_PREFIX}${userId || 'anon'}`;

/** O estado pede conversa? carga, volume e conflito; com o perfil escolhido, só se passou o limite. */
export function loadTopicApplies(state) {
  if (!state?.race?.id) return false;
  if (state.state === 'carga' || state.state === 'volume' || state.state === 'conflito') return true;
  return state.state === 'perfil' && !!state.loadAlert;
}

/** A assinatura deste estado (o que já foi falado não volta enquanto não mudar). */
export function loadTopicSignature(state) {
  if (!loadTopicApplies(state)) return null;
  const race = state.acuteFromRace?.name ? `:${state.acuteFromRace.name}` : '';
  return `load:${state.race.id}:${state.state}${race}`;
}

/** A frase do alerta, na voz dela: o que se passa e porquê agora (sem números — esses vão no chat). */
export function loadTopicMessage(state) {
  if (!loadTopicApplies(state)) return null;
  const prova = state.race?.name || 'a prova';
  const subiu = state.acuteFromRace?.name
    ? `A ${state.acuteFromRace.name} subiu a tua carga desta semana.`
    : 'Nestes 7 dias correste bem mais do que o teu habitual.';
  switch (state.state) {
    case 'carga': return `${subiu} Quero falar contigo sobre os próximos dias.`;
    case 'volume': return `Para ${prova} ainda corres menos do que ela pede. Quero ver contigo como chegar lá.`;
    case 'conflito': return `${subiu} Mas para ${prova} ainda corres pouco. Quero decidir contigo o que pesa mais.`;
    default: return 'Passaste o limite de carga que escolheste para esta semana. Quero falar contigo sobre os próximos dias.';
  }
}

function readHandled(userId) {
  try {
    const raw = globalThis.localStorage?.getItem(storageKey(userId));
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((s) => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

/** Já falado (ou dispensado) — aqui ou, pela impressão, noutro dispositivo. */
export function wasLoadTopicHandled(userId, signature, { impressionShown, impressionDismissed } = {}) {
  if (!signature) return true;
  if (readHandled(userId).includes(signature)) return true;
  // Falado noutro dispositivo (impressão 'moment', posta quando o servidor confirma o turno) ou
  // dispensado lá (o alerta com dismissed_at).
  if (impressionShown instanceof Set && impressionShown.has(`moment:${signature}`)) return true;
  return impressionDismissed instanceof Set && impressionDismissed.has(`alert:${signature}`);
}

export function markLoadTopicHandled(userId, signature) {
  if (!signature) return;
  try {
    const list = readHandled(userId).filter((s) => s !== signature);
    list.push(signature);
    globalThis.localStorage?.setItem(storageKey(userId), JSON.stringify(list.slice(-MAX_HANDLED)));
  } catch { /* sem storage: vale a impressão */ }
}

/** O alerta do Início, ou null: o estado aplica-se e esta assinatura ainda não foi tratada. */
export function loadTopicCandidate(state, { userId, impressionShown, impressionDismissed } = {}) {
  const signature = loadTopicSignature(state);
  if (!signature) return null;
  if (wasLoadTopicHandled(userId, signature, { impressionShown, impressionDismissed })) return null;
  return { signature, state: state.state, raceId: state.race.id, message: loadTopicMessage(state) };
}
