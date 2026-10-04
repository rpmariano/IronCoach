/**
 * Veredicto do módulo Ginásio.
 *
 * 2026-10-04: refactoring mecânico de dashboardVerdicts.js para modularização
 * (fases 4–6 trabalhando em paralelo). Mesmo dia, fase 5 da Evolução (Ginásio
 * por períodos de calendário) — erro G2 de specs/evolucao-2026-10/erros-verificados.md.
 *
 * G2 (2026-10-04): o veredicto dividia as sessões do filtro pelas semanas
 * NOMINAIS do filtro ("Ano" = 52), sem olhar para quando começa o histórico:
 * 3 sessões em 10 dias davam "3 em 52 semanas" e "vais ao ginásio a menos". A
 * tendência incluía a semana em curso (parcial) e omitia as semanas sem
 * sessões. Agora:
 *  - a frequência é sobre semanas FECHADAS (seg–dom completas, de
 *    max(início do período, 1.º registo) até ontem), e numerador e
 *    denominador são das MESMAS semanas;
 *  - só conta treino de FORÇA — uma aula não é treino de força (as aulas
 *    entram à parte, nos números do ecrã);
 *  - com menos de 3 semanas fechadas diz "ainda é cedo" em vez de avaliar (R6);
 *  - a tendência da carga usa só semanas fechadas, com zeros explícitos;
 *  - em "Semana" não há semanas para dividir: usa as sessões da semana contra
 *    o alvo de 2 (fechada → avalia; em curso → só diz se já chegou lá).
 */

import { fmtNumber, spellFem, capitalize, countFem, NO_DATA, streakDirection } from './shared';

/** Alvo de sessões de força por semana (o mesmo que a Carol diz). */
export const GYM_TARGET_PER_WEEK = 2;
/** Semanas fechadas mínimas para avaliar frequência e tendência (R6). */
export const GYM_MIN_CLOSED_WEEKS = 3;
/** Abaixo disto a frequência fica aquém do alvo de duas por semana. */
export const GYM_FREQ_OK = 1.7;

const plural = (n, one, many) => (Number(n) === 1 ? one : many);
const semanasFechadas = (n) => `${n} ${plural(n, 'semana fechada', 'semanas fechadas')}`;

/** Estado de uma frequência por semana, para a cor da linha do resumo. */
export function gymFrequencyStatus(perWeek) {
  if (perWeek == null || !Number.isFinite(Number(perWeek)) || Number(perWeek) < 0) return null;
  return perWeek >= GYM_FREQ_OK ? 'ok' : 'below';
}

/**
 * @param {object} input
 * @param {'semana'|'mes'|'trimestre'} [input.kind] tipo de período
 * @param {boolean} [input.isCurrent] o período contém hoje
 * @param {string} [input.scope] "nesta semana" / "em setembro" / "neste trimestre"
 * @param {number} [input.periodStrength] sessões de força nos dias fechados do período
 * @param {number} [input.classes] aulas nos dias fechados do período
 * @param {number} [input.closedWeeks] semanas fechadas (seg–dom completas) do período
 * @param {number} [input.strengthInWeeks] sessões de força dentro dessas semanas
 * @param {number[]} [input.weeklyLoads] volume (kg) de cada semana fechada, por
 *   ordem, com zeros — a tendência só olha para estas
 * @param {number} [input.runCount] corridas dos dias fechados do período — sem
 *   nenhuma, o volume de corrida não entra na frase
 * @param {number} [input.observedDays] dias fechados do período já depois do 1.º
 *   registo. Com 0 não há nada observado (nunca registou, ou período antes do
 *   1.º registo): "ainda não tenho dados". Com 1+ e nenhuma sessão, o zero é um
 *   FACTO e diz-se (2026-10-04, revisão: agosto fechado com treinos em julho e
 *   setembro dizia "sem dados suficientes" por cima de "0 treinos").
 * @param {'ok'|'cedo'|'a_comecar'} [input.early] estado do período
 * @returns {{ text: string, tone: 'ok'|'warn'|'danger'|'neutral', early?: boolean }}
 */
export function gymVerdict({
  kind = 'mes',
  isCurrent = true,
  scope = 'neste mês',
  periodStrength = 0,
  classes = 0,
  closedWeeks = 0,
  strengthInWeeks = 0,
  weeklyLoads = [],
  runCount = 0,
  observedDays = 0,
  early: earlyState = 'ok',
} = {}) {
  const strengthTotal = Number(periodStrength) || 0;
  if (strengthTotal + (Number(classes) || 0) <= 0) {
    // Nada observado: NO_DATA só para quem nunca registou ou o período antes do 1.º registo.
    if (!(Number(observedDays) > 0)) return NO_DATA;
    // Zero observado é um facto. Fechado → aviso; em curso (ou ainda cedo) → neutro,
    // ainda dá para treinar (o ecrã troca o neutro de "cedo" pela frase de cedo).
    const closedOk = !isCurrent && earlyState === 'ok';
    return {
      text: closedOk
        ? `Nenhuma sessão de força ${scope} — o alvo são duas por semana.`
        : `Nenhuma sessão de força ${scope} até agora — o alvo são duas por semana.`,
      tone: closedOk ? 'warn' : 'neutral',
    };
  }
  // Um atleta só de ginásio não tem volume de corrida para aguentar
  // (revisão de 2026-09-26).
  const runs = Number(runCount) > 0;

  // Só aulas: sem treino de força não há carga nem frequência de força.
  if (strengthTotal <= 0) {
    return {
      text: `Só fizeste aulas ${scope}: sem treino de força não há carga para analisar.`,
      tone: 'neutral',
    };
  }

  // Semana: não há semanas para dividir, vale a própria semana contra o alvo.
  if (kind === 'semana') {
    const n = strengthTotal;
    if (n >= GYM_TARGET_PER_WEEK) {
      return {
        text: `${capitalize(spellFem(n))} sessões de força ${scope}: o alvo de duas está cumprido${runs ? ', o suficiente para aguentares o volume de corrida' : ''}.`,
        tone: 'ok',
      };
    }
    if (!isCurrent) {
      return {
        text: `Só ${spellFem(n)} sessão de força ${scope}${runs ? ', pouco para aguentares o volume de corrida' : ''}; o alvo são duas.`,
        tone: 'warn',
      };
    }
    // A semana ainda não acabou: ainda dá para chegar às duas.
    return {
      text: `${capitalize(spellFem(n))} sessão de força até agora ${scope} — a semana ainda não acabou e o alvo são duas.`,
      tone: 'neutral',
    };
  }

  const weeks = Math.max(0, Math.trunc(Number(closedWeeks) || 0));
  if (weeks < GYM_MIN_CLOSED_WEEKS) {
    return {
      // "Só 0 semanas fechadas" lê-se mal: sem nenhuma, diz-se que ainda não há.
      text: weeks === 0
        ? `Ainda não há semanas fechadas ${scope} — ainda é cedo para conclusões.`
        : `Só ${semanasFechadas(weeks)} ${scope} — ainda é cedo para conclusões.`,
      tone: 'neutral',
      early: true,
    };
  }

  const n = Math.max(0, Number(strengthInWeeks) || 0);
  const perWeek = n / weeks;
  const loads = (weeklyLoads || []).map((v) => Number(v) || 0);
  const load = streakDirection(loads);

  // 1. Frequência a menos — o ginásio só protege a corrida se for regular.
  if (perWeek < 1) {
    const quantas = n === 0 ? 'Nenhuma sessão' : `${n} ${plural(n, 'sessão', 'sessões')}`;
    const sustenta = runs
      ? (n === 0 ? ' segura o volume de corrida' : ` não ${n === 1 ? 'segura' : 'seguram'} o volume de corrida`)
      : '';
    return {
      text: `Vais ao ginásio a menos para isto contar. ${quantas} de força em ${spellFem(weeks)} semanas fechadas${sustenta}; o alvo são duas por semana.`,
      tone: 'warn',
    };
  }

  // 2. Carga a cair duas ou mais semanas seguidas (semanas fechadas, com zeros).
  if (load.direction < 0 && load.weeks >= 2) {
    const last = loads[loads.length - 1];
    const before = loads[loads.length - 1 - load.weeks];
    return {
      text: `A carga desceu ${spellFem(load.weeks)} semanas seguidas, de ${fmtNumber(before, 0)} para ${fmtNumber(last, 0)} kg. Sem carga a subir não ganhas força.`,
      tone: 'warn',
    };
  }

  // 3. Frequência entre uma e duas — vai lá, mas não chega.
  if (perWeek < GYM_FREQ_OK) {
    const c = countFem(perWeek);
    const vezes = c === 'uma' ? 'uma vez' : `${c} vezes`;
    return {
      text: `Vais ${vezes} por semana em média, em ${spellFem(weeks)} semanas fechadas${runs ? ', pouco para aguentares o volume de corrida' : ''}. O alvo são duas.`,
      tone: 'warn',
    };
  }

  // 4. Duas por semana com carga a subir — o cenário bom.
  if (load.direction > 0) {
    return {
      text: `${capitalize(countFem(perWeek))} sessões por semana com carga a subir${runs ? ' — suficiente para aguentar o volume de corrida.' : '. Podes manter o ritmo.'}`,
      tone: 'ok',
    };
  }

  // 5. Duas por semana, carga estável.
  return {
    text: `Vais ao ginásio o suficiente: ${fmtNumber(perWeek, Number.isInteger(perWeek) ? 0 : 1)} sessões de força por semana em ${spellFem(weeks)} semanas fechadas.`,
    tone: 'ok',
  };
}
