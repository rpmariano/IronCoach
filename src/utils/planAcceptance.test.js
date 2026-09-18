import { describe, it, expect } from 'vitest';
import { planAcceptanceMode, closeOldBlock, dayBeforeISO, isTrainingPlan } from './planAcceptance';

/* specs/plano-vinculado-a-prova.md §2.2 — "assim que o atleta pedir novo
   plano, deverá ser criado um plano novo de raiz para o novo objetivo". */

const treino = [{ kind: 'corrida' }];
const refeicoes = [{ kind: 'descanso' }];
const plano = (over = {}) => ({ id: 'p', period_start: '2026-09-01', period_end: '2026-10-04', race_id: null, coach_plan_items: treino, ...over });

describe('planAcceptanceMode — ajuste do mesmo bloco ou objetivo novo', () => {
  it('a mesma prova-objetivo é um ajuste: funde no plano original', () => {
    expect(planAcceptanceMode(plano({ race_id: 'r1' }), plano({ race_id: 'r1' }))).toBe('merge');
  });

  it('dois planos sem prova também são um ajuste', () => {
    expect(planAcceptanceMode(plano(), plano())).toBe('merge');
  });

  /* O bug que isto corrige: a Carol resolvia um conflito de principais pela
     segunda saída (o plano passa a preparar a intermédia), o atleta aceitava,
     e a proposta era fundida no plano antigo — ficava o race_id antigo e o fim
     no dia da prova mais distante. A mudança de objetivo nunca acontecia. */
  it('outra prova-objetivo é um bloco novo — é o que faltava', () => {
    expect(planAcceptanceMode(plano({ race_id: 'r-longe' }), plano({ race_id: 'r-perto' }))).toBe('new_block');
  });

  it('um plano de base que passa a ter prova também começa de raiz', () => {
    expect(planAcceptanceMode(plano(), plano({ race_id: 'r1' }))).toBe('new_block');
  });

  it('um plano de refeições nunca abre nem fecha um bloco', () => {
    const vinculado = plano({ race_id: 'r1' });
    const soRefeicoes = plano({ coach_plan_items: refeicoes });
    // Aceitar refeições por cima do plano da prova não o pode fechar.
    expect(planAcceptanceMode(vinculado, soRefeicoes)).toBe('merge');
    expect(planAcceptanceMode(soRefeicoes, vinculado)).toBe('merge');
  });

  it('sem os itens carregados, na dúvida, funde — como antes', () => {
    expect(planAcceptanceMode({ race_id: 'r1' }, { race_id: 'r2' })).toBe('merge');
  });
});

describe('closeOldBlock — o bloco antigo fecha na véspera do novo', () => {
  it('termina na véspera e cancela os treinos a partir do primeiro dia do novo', () => {
    expect(closeOldBlock(plano(), plano({ period_start: '2026-09-18' })))
      .toEqual({ action: 'close', period_end: '2026-09-17', cancelFrom: '2026-09-18' });
  });

  it('um bloco que nem chegou a começar antes do novo sai como recusado', () => {
    // Fechá-lo na véspera daria period_end < period_start, que a restrição
    // coach_plans_period_order agora recusa.
    expect(closeOldBlock(plano({ period_start: '2026-09-18' }), plano({ period_start: '2026-09-18' })))
      .toEqual({ action: 'reject' });
  });

  it('a véspera atravessa meses e anos sem escorregar um dia', () => {
    expect(dayBeforeISO('2026-10-01')).toBe('2026-09-30');
    expect(dayBeforeISO('2027-01-01')).toBe('2026-12-31');
    // A mudança de hora de outubro não empurra o dia.
    expect(dayBeforeISO('2026-10-26')).toBe('2026-10-25');
  });
});

describe('isTrainingPlan', () => {
  it('só corrida ou ginásio contam como treino', () => {
    expect(isTrainingPlan(plano())).toBe(true);
    expect(isTrainingPlan(plano({ coach_plan_items: [{ kind: 'ginasio' }] }))).toBe(true);
    expect(isTrainingPlan(plano({ coach_plan_items: refeicoes }))).toBe(false);
    expect(isTrainingPlan({})).toBe(false);
  });
});

describe('closeOldBlock — fechar só encurta', () => {
  it('um bloco que já acabava antes da véspera do novo fica como estava', () => {
    const jaFechado = plano({ period_start: '2026-09-01', period_end: '2026-09-10' });
    expect(closeOldBlock(jaFechado, plano({ period_start: '2026-09-18' })))
      .toEqual({ action: 'close', period_end: '2026-09-10', cancelFrom: '2026-09-18' });
  });
});
