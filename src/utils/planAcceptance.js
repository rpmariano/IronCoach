/* O que acontece a um plano ativo quando o atleta aceita uma proposta que se
   sobrepõe a ele — specs/plano-vinculado-a-prova.md §2.2.

   Há duas coisas diferentes que antes se tratavam como uma só:

   - AJUSTE do mesmo bloco (mesma prova-objetivo, ou os dois sem prova): a
     proposta funde-se no plano original — mantém o id, o histórico dos dias
     passados e o vínculo. É o "caso A" do respondToPlan, e está certo.

   - OBJETIVO NOVO (a prova-objetivo muda, ou o plano passa a ter uma, ou a
     deixa de ter): é um plano novo de raiz. O pedido do utilizador foi
     explícito — "assim que o atleta pedir novo plano, deverá ser criado um
     plano novo de raiz para o novo objetivo". O bloco antigo fecha na
     véspera do novo, com o histórico intacto, e o novo começa limpo.

   Porque é que isto tinha de ser separado: o caso A fundia TUDO, e ignorava
   o race_id da proposta. Quando a Carol resolvia um conflito de principais
   pela segunda saída ("o plano passa a preparar a intermédia") e o atleta
   aceitava, a proposta era fundida no plano antigo — ficava o race_id
   antigo e period_end = max(novo, antigo), ou seja, o dia da prova mais
   distante. A mudança de objetivo nunca acontecia, o conflito continuava lá
   e a Carol voltava a pedir a mesma conversa (apanhado 2026-09-18). */

/** Um plano com treino a sério (corrida ou ginásio), por oposição a um
 *  plano só de refeições — o save_meal_suggestions cria planos com dias de
 *  `descanso` e sem prova, para os dias que nenhum plano de treino cobre. */
export function isTrainingPlan(plan) {
  return (plan?.coach_plan_items || []).some((i) => i?.kind === 'corrida' || i?.kind === 'ginasio');
}

/** 'merge' (ajuste do mesmo bloco) ou 'new_block' (objetivo novo). */
export function planAcceptanceMode(original, proposal) {
  // Um plano de refeições não tem objetivo de prova nenhum: nunca abre nem
  // fecha um bloco. Sem esta guarda, aceitar sugestões de refeições (sem
  // race_id) por cima de um plano vinculado contava como "objetivo mudou" e
  // fechava o bloco da prova. Sem os itens carregados, na dúvida, funde —
  // é o comportamento que havia antes.
  if (!isTrainingPlan(original) || !isTrainingPlan(proposal)) return 'merge';
  const antes = original?.race_id || null;
  const depois = proposal?.race_id || null;
  return antes === depois ? 'merge' : 'new_block';
}

/** A véspera de um dia ISO, em dia local — o último dia do bloco antigo. */
export function dayBeforeISO(iso) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Como fechar o bloco antigo quando começa um objetivo novo.
 * - `close`: termina na véspera do novo, com o que já passou intacto;
 * - `reject`: o bloco antigo nem chegou a começar antes do novo (fechá-lo na
 *   véspera daria period_end < period_start, que a restrição
 *   coach_plans_period_order recusa) — sai como recusado.
 */
export function closeOldBlock(original, proposal) {
  const vespera = dayBeforeISO(proposal.period_start);
  if (vespera < original.period_start) return { action: 'reject' };
  // Fechar só encurta, nunca alarga: se o bloco antigo já acabava antes da
  // véspera do novo, fica como estava. Sem este min(), escolher por engano
  // um bloco já fechado esticava-o até à véspera do novo (observação da
  // terceira revisão pré-deploy de 2026-09-18).
  const end = original.period_end && original.period_end < vespera ? original.period_end : vespera;
  return { action: 'close', period_end: end, cancelFrom: proposal.period_start };
}

/**
 * Os pares (dia, tipo) dos treinos já feitos que passam para o bloco novo —
 * é por eles que se cancelam, no bloco novo, os treinos pendentes que ficam
 * redundantes: se o atleta já correu hoje, um "corrida" pendente para hoje no
 * plano novo só faria aparecer o "Registar sessão" de uma coisa já feita.
 * Só o MESMO tipo: um ginásio feito não apaga uma corrida planeada.
 */
export function doneItemKeys(items) {
  const seen = new Set();
  const out = [];
  for (const i of items || []) {
    if (!i?.planned_date || !i?.kind) continue;
    const k = `${i.planned_date}|${i.kind}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ planned_date: i.planned_date, kind: i.kind });
  }
  return out;
}
