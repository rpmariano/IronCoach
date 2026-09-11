import { hasAnyRecord } from './homeModels';

/* Regra de arranque do onboarding (ponto 8 do handoff 2026-09).

   `profiles.onboarding_done` nasce a `false` para toda a gente — inclusive
   para quem já usa a app há meses, porque a coluna só foi acrescentada agora
   (supabase/migrations/20260911180000_profile_onboarding_done.sql). Usá-la
   sozinha punha os seis passos à frente de quem já tem um ano de registos.

   Daí a regra ser conjunta:

     mostra o onboarding  ⇔  onboarding_done é falso
                           E  não há registo nenhum (corridas, refeições,
                              treinos, avaliações) nem prova marcada

   Quem já tem dados é considerado "feito" — e o cliente aproveita para gravar
   `true` em silêncio (ver markOnboardingDone), para a pergunta não se repetir
   a cada arranque.

   `hasAnyRecord` é o mesmo predicado que o Início usa para decidir entre o
   primeiro dia e o Início normal (utils/homeModels.js) — a definição de
   "atleta sem nada" é uma só, não duas parecidas. */

/* Fallback local, por utilizador: a coluna pode ainda não existir na base de
   dados quando este código chega ao browser (o deploy do frontend e o da
   migração são independentes). Sem isto, o atleta que termina o arranque
   voltava a apanhá-lo no recarregamento seguinte, para sempre.
   Chave por id para não vazar entre contas no mesmo dispositivo. */
export const onboardingLocalKey = (userId) => `ironcoach_onboarding_done_${userId || 'anon'}`;

export function isOnboardingDoneLocally(userId) {
  if (!userId) return false;
  try {
    return localStorage.getItem(onboardingLocalKey(userId)) === '1';
  } catch (_) {
    return false;
  }
}

export function markOnboardingDoneLocally(userId) {
  if (!userId) return;
  try {
    localStorage.setItem(onboardingLocalKey(userId), '1');
  } catch (_) {
    // Modo privado/quota — o pior caso é o onboarding reaparecer neste
    // dispositivo se o UPDATE também tiver falhado. Não vale um erro visível.
  }
}

/**
 * Decide se os seis passos devem correr no primeiro acesso.
 * Recebe o estado do store (profile + as listas de registos).
 */
export function shouldShowOnboarding({
  profile,
  runs,
  meals,
  gymSessions,
  bodyAssessments,
  raceEvents,
} = {}) {
  if (!profile) return false;
  // `undefined` (coluna ainda não existe na BD) conta como "por fazer", tal
  // como `false` — é o mesmo caso do ponto de vista do atleta.
  if (profile.onboarding_done === true) return false;
  if (isOnboardingDoneLocally(profile.id)) return false;

  const temRegistos = hasAnyRecord({ runs, meals, gymSessions, bodyAssessments });
  const temProva = Array.isArray(raceEvents) && raceEvents.length > 0;
  if (temRegistos || temProva) return false;

  return true;
}

/**
 * Verdadeiro quando o perfil ainda não tem a marca mas o atleta já tem dados —
 * o caso em que se grava `true` em silêncio, sem mostrar nada.
 */
export function shouldSilentlyMarkDone({
  profile,
  runs,
  meals,
  gymSessions,
  bodyAssessments,
  raceEvents,
} = {}) {
  if (!profile) return false;
  if (profile.onboarding_done === true) return false;
  const temRegistos = hasAnyRecord({ runs, meals, gymSessions, bodyAssessments });
  const temProva = Array.isArray(raceEvents) && raceEvents.length > 0;
  return temRegistos || temProva;
}
