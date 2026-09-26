import { describe, it, expect } from 'vitest';
import { canTrackCycle, checkinOptions, checkinReasonNow, interventionReasonFor, mergeCheckin, newCheckinAlarms, readCheckinReason, scaleLabel, summarizeCheckin, todaysCheckin } from './checkin';

const TODAY = '2026-09-18';

describe('checkin — o perfil decide se o ciclo existe', () => {
  it('só com perfil feminino; o consentimento vem do perfil', () => {
    expect(checkinOptions({ gender: 'feminino', cycle_tracking_consent_at: '2026-09-01' })).toEqual({ female: true, cycleConsentAt: '2026-09-01' });
    expect(checkinOptions({ gender: 'M' })).toEqual({ female: false, cycleConsentAt: null });
    expect(canTrackCycle({ gender: 'F' })).toBe(true);
    expect(canTrackCycle({ gender: 'masculino' })).toBe(false);
    expect(canTrackCycle(null)).toBe(false);
  });
});

describe('checkin — quando um check-in chama a Carol', () => {
  it('uma dor ≥ 4 nova chama; editar o mesmo dia sem mudar a dor não volta a chamar', () => {
    const before = [];
    const after = [{ date: TODAY, sleep: 3, energy: 3, stress: 3, pain: 5, pain_location: 'gémeo' }];
    const first = newCheckinAlarms(before, after, TODAY, { gender: 'M' });
    expect(first.map((a) => a.code)).toEqual(['G5']);
    const edited = [{ ...after[0], stress: 4 }];
    expect(newCheckinAlarms(after, edited, TODAY, { gender: 'M' })).toEqual([]);
  });

  it('G4 só chama no dia em que o atleta dormiu mal, não no primeiro dia bom', () => {
    const bad = [
      { date: '2026-09-15', sleep: 2, energy: 2, stress: 3 },
      { date: '2026-09-16', sleep: 1, energy: 2, stress: 3 },
    ];
    const todayBad = [...bad, { date: TODAY, sleep: 2, energy: 2, stress: 3 }];
    expect(newCheckinAlarms(bad, todayBad, TODAY, {}).map((a) => a.code)).toEqual(['G4']);
    const todayGood = [...bad, { date: '2026-09-17', sleep: 2, energy: 2, stress: 3 }, { date: TODAY, sleep: 5, energy: 5, stress: 1 }];
    // Chave nova (os dias maus chegaram de outro dispositivo), mas hoje dormiu bem: não chama.
    expect(newCheckinAlarms([], todayGood, TODAY, {})).toEqual([]);
  });

  it('dor abaixo de 4 não chama', () => {
    expect(newCheckinAlarms([], [{ date: TODAY, pain: 3 }], TODAY, {})).toEqual([]);
  });

  it('o motivo da intervenção junta as razões e fica abaixo de 500 caracteres', () => {
    const reason = interventionReasonFor([{ reason: 'Dor 5/10 (gémeo) no check-in de hoje.' }, { reason: 'x'.repeat(600) }]);
    expect(reason.startsWith('Check-in de hoje: Dor 5/10 (gémeo)')).toBe(true);
    expect(reason.length).toBe(500);
  });

  /* Pedido 2026-09-26: o motivo fica no perfil até a conversa acontecer, e
     "Check-in de hoje" deixava de ser verdade no dia seguinte — no popup e
     no chat. Com a data, o motivo diz de que dia é, e o "no check-in de
     hoje" das frases dos alarmes sai. O servidor só lê o início
     ('Check-in%', no trigger de coach_interventions): continua a bater. */
  it('com a data do check-in, o motivo diz o dia e deixa de dizer "hoje"', () => {
    const reason = interventionReasonFor([{ reason: 'Dor 6/10 (gémeo) no check-in de hoje, pelo segundo dia seguido.' }], '2026-09-22');
    expect(reason).toBe('Check-in de 2026-09-22: Dor 6/10 (gémeo), pelo segundo dia seguido.');
    expect(reason).not.toMatch(/hoje/);
    expect(reason.startsWith('Check-in')).toBe(true);
    // Uma data que não é uma data não entra no motivo.
    expect(interventionReasonFor([{ reason: 'x.' }], 'amanhã')).toBe('Check-in de hoje: x.');
  });

  it('readCheckinReason lê o dia e o alarme, nos motivos novos e nos antigos', () => {
    expect(readCheckinReason('Check-in de 2026-09-22: Dor 6/10 (gémeo), pelo segundo dia seguido.'))
      .toEqual({ date: '2026-09-22', dor: true, sono: false, repetida: true });
    expect(readCheckinReason('Check-in de hoje: Sono mau em 3 dos últimos 5 check-ins, com stress alto.'))
      .toEqual({ date: null, dor: false, sono: true, repetida: false });
    expect(readCheckinReason('[carga] Carga de corrida: 30 km nos últimos 7 dias.')).toBeNull();
    expect(readCheckinReason(null)).toBeNull();
  });

  /* Revisão de 2026-09-26: a régua do check-in corrigido, num sítio só —
     o popup (carolTopics.js) lê-a, e é a que o store deve usar para fechar a
     intervenção de um check-in corrigido. */
  it('checkinReasonNow: o alarme do motivo que ainda se verifica, e o check-in corrigido', () => {
    const dias = [
      { date: '2026-09-19', sleep: 2, energy: 2, stress: 3 },
      { date: '2026-09-20', sleep: 1, energy: 2, stress: 3 },
    ];
    const motivo = readCheckinReason('Check-in de 2026-09-22: Dor 5/10 (joelho). Sono mau em 3 dos últimos 3 check-ins, com energia em baixo.');
    const dia = (extra) => [...dias, { date: '2026-09-22', sleep: 2, energy: 2, stress: 3, ...extra }];
    expect(checkinReasonNow(motivo, dia({ pain: 5 }), '2026-09-22', {})).toEqual({ dor: true, sono: true, corrigido: false });
    // A dor corrigida para 0, as noites por corrigir: fica o sono.
    expect(checkinReasonNow(motivo, dia({ pain: 0 }), '2026-09-22', {})).toEqual({ dor: false, sono: true, corrigido: false });
    // Os dois corrigidos: o check-in foi corrigido.
    expect(checkinReasonNow(motivo, dia({ pain: 0, sleep: 4, energy: 4 }), '2026-09-22', {}).corrigido).toBe(true);
    // Sem o check-in desse dia, não se sabe: fica o que o motivo diz.
    expect(checkinReasonNow(motivo, dias, '2026-09-22', {})).toEqual({ dor: true, sono: true, corrigido: false });
    expect(checkinReasonNow(null, dias, '2026-09-22', {})).toEqual({ dor: false, sono: false, corrigido: false });
  });
});

describe('checkin — a lista e o resumo', () => {
  it('mergeCheckin substitui o dia e mantém a ordem', () => {
    const list = [{ date: '2026-09-16', sleep: 2 }, { date: TODAY, sleep: 2 }];
    expect(mergeCheckin(list, { date: TODAY, sleep: 5 })).toEqual([{ date: '2026-09-16', sleep: 2 }, { date: TODAY, sleep: 5 }]);
    expect(mergeCheckin(list, { date: '2026-09-17', sleep: 4 }).map((c) => c.date)).toEqual(['2026-09-16', '2026-09-17', TODAY]);
    expect(todaysCheckin(list, TODAY)).toEqual({ date: TODAY, sleep: 2 });
    expect(todaysCheckin([], TODAY)).toBeNull();
  });

  it('o resumo do cartão, com e sem dor', () => {
    expect(summarizeCheckin({ sleep: 4, energy: 3, stress: 1, pain: 0 })).toBe('Sono bom · Energia: normal · Stress: calmo · Sem dor');
    expect(summarizeCheckin({ sleep: 1, energy: 1, stress: 5, pain: 6, pain_location: 'canela' })).toBe('Sono péssimo · Energia: sem energia · Stress: muito tenso · Dor 6/10 (canela)');
    expect(summarizeCheckin(null)).toBe('');
    expect(scaleLabel('sleep', 6)).toBeNull();
  });
});
