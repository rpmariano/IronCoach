import { describe, it, expect, beforeEach } from 'vitest';
import { pickProactiveTrigger, lastRecordDate, wasProactiveSent, markProactiveSent, SILENCE_DAYS } from './coachProactive';

const NOW = new Date('2026-09-11T09:00:00Z'); // sexta-feira

function data(overrides = {}) {
  return { runs: [], meals: [], gymSessions: [], bodyAssessments: [], raceEvents: [], ...overrides };
}

describe('coachProactive — quando a Carol escreve primeiro (CAROL.md §3 e §7)', () => {
  it('sem registos e sem provas não há nada a dizer', () => {
    expect(pickProactiveTrigger(data(), NOW)).toBeNull();
  });

  it('3 dias sem qualquer registo → "Estás bem?"', () => {
    const c = pickProactiveTrigger(data({ meals: [{ date: '2026-09-08' }] }), NOW);
    expect(c.trigger).toBe('silence');
    expect(c.key).toBe('silence:2026-09-08');
    expect(c.details).toContain('há 3 dias');
  });

  it('um registo de ontem, seja de que módulo for, cala o silêncio', () => {
    expect(pickProactiveTrigger(data({ runs: [{ date: '2026-09-05' }], bodyAssessments: [{ date: '2026-09-10' }] }), NOW)).toBeNull();
    expect(pickProactiveTrigger(data({ gymSessions: [{ date: '2026-09-10' }] }), NOW)).toBeNull();
  });

  it('nunca pergunta "estás bem" a quem ainda não registou nada — isso é o primeiro dia, não silêncio', () => {
    expect(lastRecordDate(data())).toBeNull();
    expect(pickProactiveTrigger(data(), NOW)).toBeNull();
  });

  it('véspera da prova', () => {
    const c = pickProactiveTrigger(data({ raceEvents: [{ id: 'r1', name: 'Meia de Lisboa', date: '2026-09-12', status: 'agendada', distance_km: 21.1 }] }), NOW);
    expect(c.trigger).toBe('race_eve');
    expect(c.key).toBe('race_eve:r1');
    expect(c.details).toContain('Meia de Lisboa');
  });

  it('manhã da prova ganha à véspera de outra e ao silêncio', () => {
    const c = pickProactiveTrigger(data({
      meals: [{ date: '2026-09-01' }],
      raceEvents: [
        { id: 'r2', name: 'Trail da Serra', date: '2026-09-12', status: 'agendada' },
        { id: 'r1', name: 'Corrida do Tejo', date: '2026-09-11', status: 'agendada' },
      ],
    }), NOW);
    expect(c.trigger).toBe('race_morning');
    expect(c.key).toBe('race_morning:r1');
  });

  it('depois da prova (1 a 3 dias), concluída ou não', () => {
    const c = pickProactiveTrigger(data({ raceEvents: [{ id: 'r1', name: 'Corrida do Tejo', date: '2026-09-09', status: 'concluida' }] }), NOW);
    expect(c.trigger).toBe('race_after');
    expect(c.details).toContain('há 2 dias');
    expect(c.details).toContain('concluída');
    // 4 dias depois já não é "depois da prova"
    expect(pickProactiveTrigger(data({ raceEvents: [{ id: 'r1', name: 'X', date: '2026-09-07', status: 'concluida' }] }), NOW)).toBeNull();
  });

  it('uma prova já concluída não volta a ter véspera nem manhã', () => {
    expect(pickProactiveTrigger(data({ raceEvents: [{ id: 'r1', name: 'X', date: '2026-09-11', status: 'concluida' }] }), NOW)).toBeNull();
  });

  it('o limiar de silêncio é de 3 dias', () => {
    expect(SILENCE_DAYS).toBe(3);
    expect(pickProactiveTrigger(data({ runs: [{ date: '2026-09-09' }] }), NOW)).toBeNull();
  });

  describe('memória do que já foi enviado (por utilizador, neste dispositivo)', () => {
    beforeEach(() => window.localStorage.clear());

    it('a mesma chave não dispara duas vezes; outra chave do mesmo gatilho dispara', () => {
      const c = { trigger: 'silence', key: 'silence:2026-09-08' };
      expect(wasProactiveSent('u1', c)).toBe(false);
      markProactiveSent('u1', c);
      expect(wasProactiveSent('u1', c)).toBe(true);
      expect(wasProactiveSent('u2', c)).toBe(false);
      expect(wasProactiveSent('u1', { trigger: 'silence', key: 'silence:2026-09-20' })).toBe(false);
    });

    it('storage corrompido não rebenta', () => {
      window.localStorage.setItem('ironcoach:carol-proativa:u1', '{nope');
      expect(wasProactiveSent('u1', { trigger: 'silence', key: 'k' })).toBe(false);
      markProactiveSent('u1', { trigger: 'silence', key: 'k' });
      expect(wasProactiveSent('u1', { trigger: 'silence', key: 'k' })).toBe(true);
    });
  });
});
