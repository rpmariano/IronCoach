import { describe, it, expect, beforeEach } from 'vitest';
import { pickProactiveTrigger, pendingRaceBalance, lastRecordDate, wasProactiveSent, markProactiveSent, SILENCE_DAYS, RACE_AFTER_DAYS_WITH_RUN, RACE_AFTER_DAYS_WITHOUT_RUN } from './coachProactive';

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

  it('depois da prova SEM corrida registada (1 a 3 dias): pergunta como correu e pede o registo', () => {
    const c = pickProactiveTrigger(data({ raceEvents: [{ id: 'r1', name: 'Corrida do Tejo', date: '2026-09-09', status: 'concluida' }] }), NOW);
    expect(c.trigger).toBe('race_after');
    expect(c.key).toBe('race_after:r1:sem-registo');
    expect(c.details).toContain('há 2 dias');
    expect(c.details).toContain('concluída');
    expect(c.details).toContain('Ainda não tem a corrida registada');
    expect(c.raceOutcome).toBeNull();
    // no próprio dia sem registo não há balanço (a manhã já falou; a prova
    // ainda pode estar a decorrer); 4 dias depois já não é "depois da prova"
    expect(pickProactiveTrigger(data({ raceEvents: [{ id: 'r1', name: 'X', date: '2026-09-11', status: 'concluida' }] }), NOW)).toBeNull();
    expect(pickProactiveTrigger(data({ raceEvents: [{ id: 'r1', name: 'X', date: '2026-09-07', status: 'concluida' }] }), NOW)).toBeNull();
    expect(RACE_AFTER_DAYS_WITHOUT_RUN).toBe(3);
  });

  describe('depois da prova COM a corrida registada — o balanço com veredicto', () => {
    const race = { id: 'r1', name: 'Meia de Lisboa', date: '2026-09-11', status: 'concluida', race_type: 'estrada', distance_km: 21.1, target_time_seconds: 6720 };
    const raceRun = { id: 'run-race', race_id: 'r1', kind: 'competicao', date: '2026-09-11', distance_km: 21.1, duration_seconds: 6822, details: { official_time_seconds: 6822 } };
    const profile = { id: 'u1', experience_level: 'medio' };

    it('dispara no próprio dia da prova, mal a corrida fique ligada, com o veredicto', () => {
      const c = pickProactiveTrigger(data({ raceEvents: [race], runs: [raceRun], profile }), NOW);
      expect(c.trigger).toBe('race_after');
      expect(c.key).toBe('race_after:r1:run-race');
      expect(c.raceId).toBe('r1');
      expect(c.details).toContain('foi hoje');
      expect(c.details).toContain('1:53:42');
      expect(c.raceOutcome).toMatchObject({ race_id: 'r1', name: 'Meia de Lisboa', official_seconds: 6822, target_seconds: 6720, verdict: 'perto', basis: 'objetivo' });
      // a prova de hoje acabou de ser registada: "prova concluída" é nova
      expect(c.raceOutcome.achievements_new).toEqual(['prova_concluida']);
    });

    it('vale 7 dias, e a chave muda com a corrida — o "como correu?" anterior não cala o balanço', () => {
      const later = new Date('2026-09-18T09:00:00Z');
      const c = pickProactiveTrigger(data({ raceEvents: [race], runs: [raceRun], profile }), later);
      expect(c.trigger).toBe('race_after');
      expect(c.details).toContain('há 7 dias');
      expect(pickProactiveTrigger(data({ raceEvents: [race], runs: [raceRun], profile }), new Date('2026-09-19T09:00:00Z'))?.trigger).not.toBe('race_after');
      expect(RACE_AFTER_DAYS_WITH_RUN).toBe(7);
      window.localStorage.clear();
      markProactiveSent('u1', { trigger: 'race_after', key: 'race_after:r1:sem-registo' });
      expect(wasProactiveSent('u1', c)).toBe(false);
    });

    it('a corrida ligada só por data (registos antigos, sem race_id) também conta', () => {
      const c = pickProactiveTrigger(data({ raceEvents: [race], runs: [{ ...raceRun, id: 'old', race_id: undefined }], profile }), NOW);
      expect(c.key).toBe('race_after:r1:old');
    });

    it('a manhã de OUTRA prova continua a ganhar ao balanço', () => {
      const c = pickProactiveTrigger(data({ raceEvents: [{ ...race, date: '2026-09-10' }, { id: 'r2', name: 'Trail', date: '2026-09-11', status: 'agendada' }], runs: [{ ...raceRun, date: '2026-09-10' }], profile }), NOW);
      expect(c.trigger).toBe('race_morning');
    });

    it('pendingRaceBalance: a prova cujo balanço ainda não foi dito, ou null', () => {
      window.localStorage.clear();
      expect(pendingRaceBalance(data({ raceEvents: [race], runs: [raceRun], profile }), NOW)?.id).toBe('r1');
      // sem corrida registada não há balanço pendente (há uma pergunta, que é outra coisa)
      expect(pendingRaceBalance(data({ raceEvents: [{ ...race, date: '2026-09-09' }], profile }), NOW)).toBeNull();
      markProactiveSent('u1', { trigger: 'race_after', key: 'race_after:r1:run-race' });
      expect(pendingRaceBalance(data({ raceEvents: [race], runs: [raceRun], profile }), NOW)).toBeNull();
    });
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
