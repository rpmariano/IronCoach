/* O que a Carol tem por falar com o atleta, dito por ela (pedido
   2026-09-23). O popup "A Carol precisa de falar contigo" dizia só "Tens 1
   assunto a resolver com ela" — sem dizer qual — e repetia "Carol" quatro
   vezes. Agora cada assunto diz-se na primeira pessoa, sem o motivo técnico
   (esse é escrito para ela, no chat). */
import { goalsInterventionKind } from '@formulas/goalsIntervention.ts';
import { runLoadInterventionKind } from '@formulas/runLoadAlert.ts';

const INTERVENCAO_PENDENTE = ['needed', 'in_progress'];

/** Uma frase por assunto por resolver, pela ordem em que interessam. */
export function pendingTopicLines({ profile, coachPlans = [], coachGoalProposals = [] } = {}) {
  const lines = [];
  if (INTERVENCAO_PENDENTE.includes(profile?.coach_intervention_status)) {
    const reason = profile?.coach_intervention_reason || '';
    const objetivos = goalsInterventionKind(reason);
    const carga = runLoadInterventionKind(reason);
    if (objetivos === 'definir') lines.push('Vi a tua avaliação corporal. Quero definir contigo os teus objetivos.');
    else if (objetivos === 'rever') lines.push('A tua última avaliação mostra que os teus objetivos já não servem. Quero revê-los contigo.');
    else if (reason.startsWith('Check-in de hoje:')) lines.push('O teu check-in de hoje deixou-me de pé atrás. Quero ver contigo o treino de hoje.');
    else if (carga === 'acima_do_plano') lines.push('Esta semana correste bem mais do que o plano previa. Quero ver contigo como ficam os próximos dias.');
    else if (carga === 'sem_plano') lines.push('A tua carga de corrida subiu muito face às últimas semanas. Quero ver contigo como ficam os próximos dias.');
    else lines.push('Vi o teu último registo e há uma coisa que quero ver contigo.');
  }
  const planos = (coachPlans || []).filter((p) => p?.status === 'proposto').length;
  if (planos === 1) lines.push('Tens um plano meu à espera que o aceites ou recuses.');
  else if (planos > 1) lines.push(`Tens ${planos} planos meus à espera que os aceites ou recuses.`);
  if ((coachGoalProposals || []).some((g) => g?.status === 'proposto')) lines.push('Tens objetivos meus à espera da tua decisão.');
  return lines;
}
