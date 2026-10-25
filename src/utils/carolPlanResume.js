/* O aviso "O plano ficou a meio" (trigger plan_resume, 2026-10-25): um plano
   em partes em que uma semana chegou e as seguintes não. Recebe o que
   pendingPlanResumeAlert (utils/coachProactive.js) devolve e diz-o na voz
   dela.

   Dois casos, e a frase tem de ser verdadeira nos dois: com a semana
   anterior já no calendário (`applied`, há itens aceites antes do nextFrom —
   o cliente antigo aceitava cada parte como um plano normal), diz que ele a
   tem; sem nada aplicado (o tudo-ou-nada das partes), diz que ainda não
   está no calendário e não diz "aceitaste", que o dado não garante. */

export const PLAN_RESUME_TITLE = 'O plano ficou a meio';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const diaMes = (iso) => `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}`;

/** "26/10 a 1/11", "2 a 8/11" (mesmo mês, o mês diz-se uma vez). */
export function intervaloFalado(from, to) {
  if (!ISO.test(String(from)) || !ISO.test(String(to))) return null;
  return from.slice(5, 7) === to.slice(5, 7) && from.slice(0, 4) === to.slice(0, 4)
    ? `${Number(from.slice(8, 10))} a ${diaMes(to)}`
    : `${diaMes(from)} a ${diaMes(to)}`;
}

/** "até à Meia de Lisboa, a 29/11" ou "até 22/11"; null sem `until`. */
function ateOnde(raceName, until) {
  if (!ISO.test(String(until))) return null;
  const nome = String(raceName || '').trim();
  return nome ? `até à ${nome}, a ${diaMes(until)}` : `até ${diaMes(until)}`;
}

/** { title, message } do aviso, ou null quando faltam as datas. */
export function planResumeNotice({ applied, acceptedFrom, acceptedTo, until, raceName } = {}) {
  const ate = ateOnde(raceName, until);
  if (!ate) return null;
  if (applied === true) {
    // acceptedFrom/acceptedTo: a semana anterior à que falta (prevFrom/prevTo do detectPlanResume).
    const semana = intervaloFalado(acceptedFrom, acceptedTo);
    if (!semana) return null;
    return { title: PLAN_RESUME_TITLE, message: `Já tens a semana de ${semana} no calendário, mas faltam as seguintes ${ate}. Quero acabar o plano contigo.` };
  }
  // A meio da frase, "a 29/11" é um aposto: fecha com vírgula.
  const sujeito = String(raceName || '').trim() ? `${ate},` : ate;
  // Sem o dado (applied nem true nem false), não se promete nem se nega o calendário.
  const calendario = applied === false ? ' e ainda não está no calendário' : '';
  return { title: PLAN_RESUME_TITLE, message: `O teu plano ${sujeito} ficou a meio${calendario}. Quero acabá-lo contigo.` };
}
