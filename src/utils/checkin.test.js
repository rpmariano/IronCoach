import { describe, it, expect } from 'vitest';
import { canTrackCycle, checkinOptions, interventionReasonFor, mergeCheckin, newCheckinAlarms, scaleLabel, summarizeCheckin, todaysCheckin } from './checkin';

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
