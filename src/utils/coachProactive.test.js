import { describe, it, expect, beforeEach } from 'vitest';
import { pickProactiveTrigger, listProactiveTriggers, pendingRaceBalance, pendingRaceBalanceCandidate, pendingBlockEndAlert, endingBlock, lastRecordDate, wasProactiveSent, markProactiveSent, dismissProactiveAlert, SILENCE_DAYS, RACE_AFTER_DAYS_WITH_RUN, RACE_AFTER_DAYS_WITHOUT_RUN } from './coachProactive';

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

    it('pendingRaceBalanceCandidate: o candidato completo (details/raceOutcome) por trás de pendingRaceBalance — para o Início forçar o pedido', () => {
      window.localStorage.clear();
      const c = pendingRaceBalanceCandidate(data({ raceEvents: [race], runs: [raceRun], profile }), NOW);
      expect(c.trigger).toBe('race_after');
      expect(c.raceId).toBe('r1');
      expect(c.raceOutcome).toMatchObject({ race_id: 'r1', verdict: 'perto' });
      markProactiveSent('u1', { trigger: 'race_after', key: 'race_after:r1:run-race' });
      expect(pendingRaceBalanceCandidate(data({ raceEvents: [race], runs: [raceRun], profile }), NOW)).toBeNull();
    });

    it('um balanço já feito cala o aviso sem a marca deste dispositivo: a coluna da prova ou a cópia local do hub', () => {
      window.localStorage.clear();
      // Noutro dispositivo (ou pedido pelo Início sem a resposta chegar ao
      // ecrã): o servidor gravou-o na prova.
      expect(pendingRaceBalanceCandidate(data({ raceEvents: [{ ...race, coach_balance: 'Correste bem.' }], runs: [raceRun], profile }), NOW)).toBeNull();
      // Pedido no hub deste dispositivo, antes de a prova recarregar.
      window.localStorage.setItem('ironcoach:balanco:r1', JSON.stringify({ text: 'Correste bem.', suggestions: [] }));
      expect(pendingRaceBalanceCandidate(data({ raceEvents: [race], runs: [raceRun], profile }), NOW)).toBeNull();
      // Uma cópia vazia não conta.
      window.localStorage.setItem('ironcoach:balanco:r1', JSON.stringify({ text: '  ' }));
      expect(pendingRaceBalanceCandidate(data({ raceEvents: [race], runs: [raceRun], profile }), NOW)?.raceId).toBe('r1');
    });

    it('"Dispensar aviso" cala só o aviso do Início — o hub e o chat continuam a poder pedir o balanço', () => {
      window.localStorage.clear();
      const c = pendingRaceBalanceCandidate(data({ raceEvents: [race], runs: [raceRun], profile }), NOW);
      dismissProactiveAlert('u1', c);
      // O aviso sai.
      expect(pendingRaceBalanceCandidate(data({ raceEvents: [race], runs: [raceRun], profile }), NOW)).toBeNull();
      // Mas isto NÃO é o mesmo que markProactiveSent: wasProactiveSent (o
      // que o hub e o chat leem) continua false, achado 2026-09-15 — antes
      // "Dispensar" reutilizava markProactiveSent e calava também os dois.
      expect(wasProactiveSent('u1', c)).toBe(false);
    });

    it('dispensado noutro dispositivo (a impressão alert com a chave do candidato) cala o aviso; outra chave não', () => {
      window.localStorage.clear();
      const dispensado = new Set(['alert:race_after:r1:run-race']);
      expect(pendingRaceBalanceCandidate(data({ raceEvents: [race], runs: [raceRun], profile, impressionDismissed: dispensado }), NOW)).toBeNull();
      // Outra corrida, ou a chave 'balanco' que o chat lê: não é este candidato.
      const outra = new Set(['alert:race_after:r1:sem-registo', 'alert:balanco']);
      expect(pendingRaceBalanceCandidate(data({ raceEvents: [race], runs: [raceRun], profile, impressionDismissed: outra }), NOW)?.raceId).toBe('r1');
      // Sem o conjunto, nada muda.
      expect(pendingRaceBalanceCandidate(data({ raceEvents: [race], runs: [raceRun], profile }), NOW)?.raceId).toBe('r1');
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

describe('o aviso "O bloco está a acabar" (ação P.11)', () => {
  // Sexta, 11: um bloco sem prova que acaba no domingo, 13, sem outro a seguir.
  const bloco = {
    coachPlans: [{ id: 'b1', status: 'aceite', period_start: '2026-08-17', period_end: '2026-09-13' }],
    coachPlanItems: [{ id: 'i1', plan_id: 'b1', planned_date: '2026-09-12', kind: 'corrida', status: 'pendente' }],
    profile: { id: 'u1' },
  };

  beforeEach(() => window.localStorage.clear());

  it('o candidato é o do chat e da notificação, e o "quando" por extenso', () => {
    const b = pendingBlockEndAlert(bloco, NOW);
    expect(b.candidate).toEqual({
      trigger: 'block_end',
      key: 'block_end:b1',
      details: 'O bloco de treino acaba daqui a 2 dias (2026-09-13) e não há outro a seguir.',
    });
    expect(b.when).toBe('daqui a 2 dias');
    // O mesmo objeto que a lista do chat usa.
    expect(endingBlock(bloco, '2026-09-11').candidate).toEqual(b.candidate);
    expect(endingBlock(bloco, '2026-09-13').when).toBe('hoje');
    expect(endingBlock(bloco, '2026-09-12').when).toBe('amanhã');
  });

  it('um plano só de refeições não é um bloco', () => {
    expect(pendingBlockEndAlert({ ...bloco, coachPlanItems: [{ id: 'i1', plan_id: 'b1', planned_date: '2026-09-12', kind: 'refeicao' }] }, NOW)).toBeNull();
  });

  it('cala-se quando a conversa já aconteceu, ou quando foi dispensado — aqui ou noutro dispositivo', () => {
    const { candidate } = pendingBlockEndAlert(bloco, NOW);
    markProactiveSent('u1', candidate);
    expect(pendingBlockEndAlert(bloco, NOW)).toBeNull();

    window.localStorage.clear();
    dismissProactiveAlert('u1', candidate);
    expect(pendingBlockEndAlert(bloco, NOW)).toBeNull();

    window.localStorage.clear();
    expect(pendingBlockEndAlert({ ...bloco, impressionDismissed: new Set(['alert:block_end:b1']) }, NOW)).toBeNull();
  });
});

describe('P.10 — o treino de ontem e o silêncio com check-ins, no chat', () => {
  // NOW é sexta, 2026-09-11: não há balanço da semana.
  const plano = {
    coachPlans: [{ id: 'p1', status: 'aceite', race_id: null, period_start: '2026-09-01', period_end: '2026-09-30' }],
    coachPlanItems: [{ plan_id: 'p1', planned_date: '2026-09-10', kind: 'corrida', status: 'pendente', training_type: 'longo', target_distance_km: 16, created_at: '2026-09-01T10:00:00Z' }],
  };

  it('o treino de ontem por registar vai para o chat com o que o plano pedia', () => {
    const list = listProactiveTriggers(data({ ...plano, meals: [{ date: '2026-09-11' }] }), NOW);
    expect(list).toEqual([{
      trigger: 'missed_workout',
      key: 'missed_workout:2026-09-10',
      details: 'Treino de ontem (2026-09-10) por registar: corrida (longo, 16 km).',
    }]);
  });

  it('com uma sessão de ginásio registada ontem, o treino conta como feito', () => {
    const list = listProactiveTriggers(data({ ...plano, meals: [{ date: '2026-09-11' }], gymSessions: [{ date: '2026-09-10' }] }), NOW);
    expect(list.some((c) => c.trigger === 'missed_workout')).toBe(false);
  });

  it('com check-in depois do último registo, o silêncio diz ao chat que faltam os treinos', () => {
    const c = listProactiveTriggers(data({
      meals: [{ date: '2026-09-05' }], runs: [{ id: 'r', date: '2026-09-01' }], dailyCheckins: [{ date: '2026-09-10' }],
    }), NOW).find((x) => x.trigger === 'silence');
    expect(c.key).toBe('silence:2026-09-05');
    expect(c.details).toBe('Último registo: 2026-09-05 (há 6 dias). Fez check-in depois disso (último: 2026-09-10): está por cá, faltam os treinos — o último treino foi há 10 dias.');
    expect(c.details.length).toBeLessThanOrEqual(300);
  });

  it('sem check-in depois do último registo, o silêncio de sempre', () => {
    const c = listProactiveTriggers(data({ meals: [{ date: '2026-09-05' }], dailyCheckins: [{ date: '2026-09-04' }] }), NOW).find((x) => x.trigger === 'silence');
    expect(c.details).toBe('Último registo: 2026-09-05 (há 6 dias).');
  });
});
