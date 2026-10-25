import { describe, it, expect } from 'vitest';
import { planResumeNotice, intervaloFalado, PLAN_RESUME_TITLE } from './carolPlanResume';
import { expectCarolVoice } from '../test/carolVoice';

const BASE = { acceptedFrom: '2026-10-26', acceptedTo: '2026-11-01', nextFrom: '2026-11-02', nextTo: '2026-11-08', until: '2026-11-29', raceName: 'Meia de Lisboa' };

describe('o aviso "O plano ficou a meio" (plan_resume)', () => {
  it('as datas dizem-se como no chat: o mês uma vez quando é o mesmo', () => {
    expect(intervaloFalado('2026-10-26', '2026-11-01')).toBe('26/10 a 1/11');
    expect(intervaloFalado('2026-11-02', '2026-11-08')).toBe('2 a 8/11');
    expect(intervaloFalado('2026-11-02', null)).toBeNull();
  });

  it('(a) com a semana anterior aplicada, diz que ele já a tem no calendário', () => {
    const n = planResumeNotice({ ...BASE, applied: true });
    expect(n).toEqual({
      title: PLAN_RESUME_TITLE,
      message: 'Já tens a semana de 26/10 a 1/11 no calendário, mas faltam as seguintes até à Meia de Lisboa, a 29/11. Quero acabar o plano contigo.',
    });
  });

  it('(b) sem nada aplicado, diz que ainda não está no calendário e não diz "aceitaste"', () => {
    const { message } = planResumeNotice({ ...BASE, applied: false });
    expect(message).toBe('O teu plano até à Meia de Lisboa, a 29/11, ficou a meio e ainda não está no calendário. Quero acabá-lo contigo.');
    expect(message).not.toMatch(/aceitaste|já tens/i);
  });

  it('sem prova, o plano diz-se pela data em que acaba', () => {
    expect(planResumeNotice({ ...BASE, raceName: null, applied: true }).message)
      .toBe('Já tens a semana de 26/10 a 1/11 no calendário, mas faltam as seguintes até 29/11. Quero acabar o plano contigo.');
    expect(planResumeNotice({ ...BASE, raceName: '', applied: false }).message)
      .toBe('O teu plano até 29/11 ficou a meio e ainda não está no calendário. Quero acabá-lo contigo.');
  });

  it('sem o dado do calendário, não o promete nem o nega', () => {
    for (const applied of [null, undefined]) {
      expect(planResumeNotice({ ...BASE, applied }).message)
        .toBe('O teu plano até à Meia de Lisboa, a 29/11, ficou a meio. Quero acabá-lo contigo.');
    }
  });

  it('sem as datas de que precisa, não há aviso (nunca uma frase com buracos)', () => {
    expect(planResumeNotice()).toBeNull();
    expect(planResumeNotice({ ...BASE, until: null, applied: false })).toBeNull();
    expect(planResumeNotice({ ...BASE, acceptedFrom: null, applied: true })).toBeNull();
  });

  it('todas as variantes na voz dela', () => {
    for (const applied of [true, false]) {
      for (const raceName of ['Meia de Lisboa', null]) {
        const n = planResumeNotice({ ...BASE, applied, raceName });
        expectCarolVoice(n.title);
        expectCarolVoice(n.message);
      }
    }
  });
});
