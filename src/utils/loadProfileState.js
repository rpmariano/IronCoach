import { loadVolumeState, LOAD_PROFILE_LABELS, RED_FLAG_LABELS } from '@formulas/loadProfile.ts';
import { addDaysISO } from '@formulas/calendarPeriod.ts';
import { format, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';

/* Perfil de carga por prova (2026-11-09, aprovado pelo Rui). A Patty recebeu no mesmo dia
   «estás a esforçar-te demasiado» (ACWR 1,31) e «fazes poucos km para a meia» (19 km/semana contra
   35) — cada um certo sozinho, incoerentes juntos. A escolha passa a ser dela, por prova:
   Prudente ou Mais volume (race_events.load_profile). O estado vem de @formulas/loadProfile.ts
   (loadVolumeState, o mesmo que o servidor usa); aqui ficam só a ligação ao store e os textos.

   Sem a migration (as colunas não existem), as provas chegam sem load_profile e tudo fica
   Prudente, por escolher. */

export { LOAD_PROFILE_LABELS };

/** O estado da carga e do volume, com os dados do store (só os itens dos planos aceites). */
export function loadStateFor({ raceEvents, runs, coachPlans, coachPlanItems, profile, todayISO }) {
  const acceptedPlans = (coachPlans || []).filter((p) => p?.status === 'aceite');
  const accepted = new Set(acceptedPlans.map((p) => p.id));
  // O horizonte do plano (dev-back 9befd682), como no raceVolumeText.js: as semanas depois do
  // period_end mais tardio estão por planear — «por_planear», nem «abaixo» nem conflito.
  const plannedUntilISO = acceptedPlans.reduce((m, p) => {
    const end = String(p?.period_end || '').slice(0, 10);
    return end && (!m || end > m) ? end : m;
  }, null);
  const planItems = (coachPlanItems || []).filter((i) => accepted.has(i?.plan_id));
  try {
    return loadVolumeState({
      races: raceEvents || [],
      runs: runs || [],
      planItems,
      todayISO,
      profileLevel: profile?.experience_level || null,
      plannedUntilISO,
    });
  } catch (err) {
    console.warn('[perfil de carga]', err);
    return null;
  }
}

/* Os avisos que o estado substitui (biEngine): os de ACWR e o «volume insuficiente» da prova
   que manda. Nunca os dois juntos:
   - conflito: nenhum (o cartão das duas opções diz tudo);
   - carga: só o da carga; volume: só o do volume;
   - perfil: a carga só se passou o limite do perfil escolhido; o volume nunca — a escolha é dele
     (com Prudente, a prova é para completar);
   - ok: a carga não; o volume fica como estava (sem o nível da prova o outlook não sabe, e a
     viabilidade do biEngine continua a ser quem fala). */
const ACWR_IDS = new Set(['acwr_caution', 'acwr_danger']);

/* Bug #123 (2026-11-17): a carga e o volume da prova que manda são agora UM assunto da Carol
   (utils/loadTopic.js), com a conversa no chat. Os avisos de ACWR e o «volume insuficiente» dessa
   prova fundem-se nele e já não aparecem soltos — nem depois de ele falar com ela: dizer o mesmo
   pelos dois lados era o que o Rui não percebia. Com tudo bem (ok), o volume fica como estava. */
export function filterLoadInsights(insights, state) {
  if (!state?.race) return insights;
  const allowAcwr = false;
  // Nas duas semanas antes da prova (state.taper, dev-back ec9fd50c) é afinação: o «volume
  // insuficiente» já não se mostra, nem com tudo bem.
  const allowVolume = state.state === 'ok' && !state.taper;
  return insights.filter((i) => {
    if (ACWR_IDS.has(i.id)) return allowAcwr;
    // O «volume insuficiente» de outra prova (a próxima não é a principal) fica como estava.
    if (i.id === 'race_volume' && (!i.raceId || i.raceId === state.race.id)) return allowVolume;
    return true;
  });
}

const km = (v) => (v == null ? '—' : String(Math.round(Number(v) * 10) / 10).replace('.', ','));

/** Os textos das duas opções do cartão de conflito (a decisão do Rui, palavra a palavra). */
export function conflictOptionTexts(state) {
  return {
    prudente: `A semana fica até ${km(state?.limits?.prudente)} km; a prova é para completar.`,
    // Linguagem simples (revisão do #123): o mesmo texto do servidor, palavra a palavra.
    mais_volume: `Até ${km(state?.limits?.mais_volume)} km, mais perto do que a prova pede, com mais risco. Volta sozinho a Prudente se aparecer uma dor, se duas corridas fáceis seguidas te custarem muito, ou se andares a recuperar mal.`,
  };
}

/** Os números do conflito: «Últimos 7 dias: 23,1 km (1,31× o habitual) · corres 19,1 km/semana; a prova pede 35.» */
export function conflictNumbersText(state) {
  if (!state) return null;
  const ratio = state.ratio != null ? ` (${String(state.ratio.toFixed(2)).replace('.', ',')}× o habitual)` : '';
  const parts = [`Últimos 7 dias: ${km(state.acuteKm)} km${ratio}`];
  if (state.currentWeeklyKm != null && state.recommendedWeeklyKm != null) {
    parts.push(`corres ${km(state.currentWeeklyKm)} km/semana; a prova pede ${km(state.recommendedWeeklyKm)}`);
  }
  return `${parts.join(' · ')}.`;
}

/** «Prudente · até 28,4 km nestes 7 dias (corridos: 23,1).» */
export function profileLimitText(state) {
  if (!state) return null;
  return `${LOAD_PROFILE_LABELS[state.profile]} · até ${km(state.safeLimitKm)} km nestes 7 dias (corridos: ${km(state.acuteKm)}).`;
}

/* ── O que é, em palavras (bug #123, 2026-11-17: o Rui perguntou «O que é esta informação?») ────
   Em todos os estados, a primeira frase diz o que se está a medir e porquê agora — sem «ACWR». */

const round = (v) => (v == null ? null : Math.round(Number(v)));

/** O habitual da semana (o crónico): os 7 dias divididos pela razão. null sem histórico. */
export function habitualWeeklyKm(state) {
  if (!state || !(state.ratio > 0) || !(state.acuteKm > 0)) return null;
  return state.acuteKm / state.ratio;
}

/** «Carga: comparo os teus últimos 7 dias (26,6 km) com o teu habitual (~17 km). A prova «X» (10 km)
 *  subiu a conta — esta semana, mais leve.» A prova vem de acuteFromRace (Backend), quando existir. */
export function loadSentence(state) {
  if (!state) return null;
  const habitual = habitualWeeklyKm(state);
  const head = habitual != null
    ? `Carga: comparo os teus últimos 7 dias (${km(state.acuteKm)} km) com o teu habitual (~${round(habitual)} km).`
    : `Carga: nos últimos 7 dias correste ${km(state.acuteKm)} km.`;
  const race = state.acuteFromRace;
  const why = race?.name
    ? ` A prova «${race.name}»${race.km != null ? ` (${km(race.km)} km)` : ''} subiu a conta — esta semana, mais leve.`
    : ' Subiu depressa — esta semana, mais leve.';
  return head + why;
}

/** «Volume: para a Meia dos Descobrimentos, o ideal são ~35 km/semana; corres 19.» */
export function volumeSentence(state) {
  if (!state || state.recommendedWeeklyKm == null) return null;
  const name = state.race?.name ? `para a ${state.race.name}` : 'para a prova';
  const cur = state.currentWeeklyKm != null ? `; corres ${round(state.currentWeeklyKm)}` : '';
  return `Volume: ${name}, o ideal são ~${round(state.recommendedWeeklyKm)} km/semana${cur}.`;
}

/** A frase do que é, conforme o estado: carga, volume, as duas (conflito) ou a do perfil escolhido
 *  (a que pesa agora: a carga, se passou o limite; senão o volume, se está abaixo). */
export function whatSentences(state) {
  if (!state) return [];
  const load = loadSentence(state);
  const volume = volumeSentence(state);
  switch (state.state) {
    case 'carga': return [load];
    case 'volume': return volume ? [volume] : [];
    case 'conflito': return [load, volume].filter(Boolean);
    case 'perfil':
      if (state.loadAlert) return [load];
      if (state.volumeBelow && volume) return [volume];
      return [`O perfil de carga diz quanto podes correr por semana até à ${state.race?.name || 'prova'}, sem subir depressa demais.`];
    default: return [];
  }
}

/** O «Porquê?»: os dois perfis, sem jargão. */
export const PROFILE_WHY = {
  prudente: 'Prudente: a semana fica perto do teu habitual. Menos risco de lesão; a prova é para completar.',
  mais_volume: 'Mais volume: deixa subir mais depressa, para chegares mais perto do que a prova pede. Tem mais risco — e volta sozinho a Prudente se aparecer um sinal (dor, corridas fáceis muito duras, recuperação má).',
  regra: 'Subir os km de repente é das causas mais comuns de lesão na corrida. Por isso comparo cada semana com o que tens feito, e não só com o que a prova pede.',
};

/** Dias em que a nota da volta a Prudente se vê (os mesmos da Carol). */
export const REVERT_NOTE_DAYS = 7;

/** A nota da volta sozinha a Prudente, nos 7 dias a seguir, ou null. */
export function revertNoteText(state, todayISO) {
  const rev = state?.reverted;
  if (!rev?.at || state.profile !== 'prudente') return null;
  const day = String(rev.at).slice(0, 10);
  if (addDaysISO(day, REVERT_NOTE_DAYS) < todayISO) return null;
  const reason = RED_FLAG_LABELS[rev.reason] || null;
  return `Voltou sozinho a Prudente em ${format(parseISO(day), 'd MMM', { locale: pt })}${reason ? ` (${reason})` : ''}, por segurança. Podes voltar a escolher Mais volume quando o sinal passar.`;
}

/** O update da escolha (secção 3 do Backend): limpa a volta sozinha. */
export function loadProfileUpdate(profile, nowISO = new Date().toISOString()) {
  return {
    load_profile: profile === 'mais_volume' ? 'mais_volume' : 'prudente',
    load_profile_at: nowISO,
    load_profile_reverted_at: null,
    load_profile_revert_reason: null,
  };
}
