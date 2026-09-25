import { describe, it, expect } from 'vitest';
import { pickProactiveTrigger, listProactiveTriggers, lastRecordDate } from './coachProactive';
import { pickServerProactive, listServerProactive } from '@formulas/proactiveTriggers.ts';

/* O servidor decide de hora a hora se a Carol deve chamar pelo atleta
   (ação P.3, coach-proactive-tick); o cliente decide quando o Coach abre.
   As CHAVES têm de ser as mesmas: é por elas que o coach_proactive_log sabe
   que a mensagem já foi entregue, e que a notificação do servidor não se
   repete depois de a conversa ter acontecido. Mesmos dados, mesma chave. */

const TODAY = '2026-09-18';
const now = new Date(`${TODAY}T12:00:00`);

function both(data) {
  const client = pickProactiveTrigger(data, now);
  const trainingPlanIds = new Set((data.coachPlanItems || []).filter((i) => i.kind === 'corrida' || i.kind === 'ginasio').map((i) => i.plan_id));
  const server = pickServerProactive(
    {
      raceEvents: data.raceEvents,
      runs: data.runs,
      lastRecordDate: lastRecordDate(data),
      plans: (data.coachPlans || []).map((p) => ({ ...p, hasTraining: trainingPlanIds.has(p.id) })),
      // P.10: o treino de ontem por registar lê os itens e as datas dos treinos.
      planItems: data.coachPlanItems || [],
      trainingDates: [...(data.runs || []), ...(data.gymSessions || [])].map((r) => r?.date ?? null),
    },
    TODAY,
  );
  return {
    client: client ? { trigger: client.trigger, key: client.key } : null,
    server: server ? { trigger: server.trigger, key: server.key } : null,
  };
}

/* A lista inteira, não só o primeiro (P.9): a intervenção passiva do Coach
   percorre-a para saber a que candidato uma notificação tocada corresponde,
   mesmo que não seja mais o primeiro (choosePush já lê a lista do lado do
   servidor pela mesma razão). O servidor tem dois momentos que o cliente não
   gera — intervention e race_conflict, tratados pelo Início (P.5) — por isso
   ficam de fora da comparação. */
function bothLists(data) {
  const client = listProactiveTriggers(data, now).map((c) => ({ trigger: c.trigger, key: c.key }));
  const trainingPlanIds = new Set((data.coachPlanItems || []).filter((i) => i.kind === 'corrida' || i.kind === 'ginasio').map((i) => i.plan_id));
  const server = listServerProactive(
    {
      raceEvents: data.raceEvents,
      runs: data.runs,
      lastRecordDate: lastRecordDate(data),
      plans: (data.coachPlans || []).map((p) => ({ ...p, hasTraining: trainingPlanIds.has(p.id) })),
      // P.10: o treino de ontem por registar lê os itens e as datas dos treinos.
      planItems: data.coachPlanItems || [],
      trainingDates: [...(data.runs || []), ...(data.gymSessions || [])].map((r) => r?.date ?? null),
    },
    TODAY,
  )
    .filter((c) => c.trigger !== 'intervention' && c.trigger !== 'race_conflict')
    .map((c) => ({ trigger: c.trigger, key: c.key }));
  return { client, server };
}

const base = { runs: [], meals: [], gymSessions: [], bodyAssessments: [], raceEvents: [], profile: { id: 'u1' } };

const CASES = {
  'manhã da prova': { ...base, raceEvents: [{ id: 'r1', name: 'Meia', date: TODAY, status: 'agendada' }] },
  'véspera': { ...base, raceEvents: [{ id: 'r1', name: 'Meia', date: '2026-09-19', status: 'agendada' }], meals: [{ date: TODAY }] },
  'balanço com corrida ligada': {
    ...base,
    raceEvents: [{ id: 'r1', name: 'Meia', date: '2026-09-15', status: 'concluida', distance_km: 21.1, target_time_seconds: 6000 }],
    runs: [{ id: 'run1', date: '2026-09-15', race_id: 'r1', kind: 'competicao', distance_km: 21.1, duration_seconds: 5900 }],
  },
  'balanço por data, prova concluída sem ligação': {
    ...base,
    raceEvents: [{ id: 'r1', name: 'Meia', date: '2026-09-16', status: 'concluida', distance_km: 21.1 }],
    runs: [{ id: 'run2', date: '2026-09-16', race_id: null, kind: 'competicao', distance_km: 21.1, duration_seconds: 6000 }],
  },
  'balanço sem registo': { ...base, raceEvents: [{ id: 'r1', name: 'Meia', date: '2026-09-16', status: 'agendada' }], meals: [{ date: TODAY }] },
  'silêncio': { ...base, meals: [{ date: '2026-09-12' }], runs: [{ id: 'x', date: '2026-09-10', distance_km: 5, duration_seconds: 1500 }] },
  'nada a dizer': { ...base, meals: [{ date: TODAY }] },
  'fim de bloco': {
    ...base,
    meals: [{ date: TODAY }],
    coachPlans: [{ id: 'b1', status: 'aceite', race_id: null, period_start: '2026-09-06', period_end: '2026-09-19' }],
    coachPlanItems: [{ plan_id: 'b1', kind: 'corrida' }],
  },
  // P.10: o longo de ontem ficou pendente e sem corrida nesse dia.
  'treino de ontem por registar': {
    ...base,
    meals: [{ date: TODAY }],
    coachPlans: [{ id: 'p1', status: 'aceite', race_id: null, period_start: '2026-09-01', period_end: '2026-09-30' }],
    coachPlanItems: [{ plan_id: 'p1', planned_date: '2026-09-17', kind: 'corrida', status: 'pendente', training_type: 'longo', created_at: '2026-09-01T10:00:00Z' }],
  },
  'treino de ontem feito (corrida nesse dia) não conta': {
    ...base,
    meals: [{ date: TODAY }],
    runs: [{ id: 'r9', date: '2026-09-17', distance_km: 14, duration_seconds: 4800 }],
    coachPlans: [{ id: 'p1', status: 'aceite', race_id: null, period_start: '2026-09-01', period_end: '2026-09-30' }],
    coachPlanItems: [{ plan_id: 'p1', planned_date: '2026-09-17', kind: 'corrida', status: 'pendente', training_type: 'longo', created_at: '2026-09-01T10:00:00Z' }],
  },
  'fim de um plano só de refeições não conta': {
    ...base,
    meals: [{ date: TODAY }],
    coachPlans: [{ id: 'm1', status: 'aceite', race_id: null, period_start: '2026-09-06', period_end: '2026-09-19' }],
    coachPlanItems: [{ plan_id: 'm1', kind: 'descanso' }],
  },
};

describe('P.3 — o servidor e o cliente escolhem a mesma mensagem, com a mesma chave', () => {
  for (const [name, data] of Object.entries(CASES)) {
    it(name, () => {
      const { client, server } = both(data);
      expect(server).toEqual(client);
    });
  }
});

it('o fim de bloco é mesmo o momento escolhido, dos dois lados', () => {
  const { client, server } = both(CASES['fim de bloco']);
  expect(client).toEqual({ trigger: 'block_end', key: 'block_end:b1' });
  expect(server).toEqual(client);
  expect(both(CASES['fim de um plano só de refeições não conta']).client).toBeNull();
});

it('o treino de ontem por registar é o momento escolhido, dos dois lados (P.10)', () => {
  const { client, server } = both(CASES['treino de ontem por registar']);
  expect(client).toEqual({ trigger: 'missed_workout', key: 'missed_workout:2026-09-17' });
  expect(server).toEqual(client);
  expect(both(CASES['treino de ontem feito (corrida nesse dia) não conta']).client).toBeNull();
});

// Ação P.9: a lista inteira, não só o primeiro — para o efeito passivo do
// Coach encontrar um candidato tocado que já não é o primeiro da lista.
describe('P.9 — a lista inteira de momentos é a mesma, na mesma ordem', () => {
  for (const [name, data] of Object.entries(CASES)) {
    it(name, () => {
      const { client, server } = bothLists(data);
      expect(server).toEqual(client);
    });
  }

  it('dois momentos ao mesmo tempo — o silêncio e o fim de bloco — ficam os dois, pela ordem certa', () => {
    const data = {
      ...base,
      meals: [{ date: '2026-09-12' }],
      runs: [],
      coachPlans: [{ id: 'b1', status: 'aceite', race_id: null, period_start: '2026-08-20', period_end: '2026-09-19' }],
      coachPlanItems: [{ plan_id: 'b1', kind: 'corrida' }],
    };
    const { client, server } = bothLists(data);
    expect(client).toEqual([
      { trigger: 'block_end', key: 'block_end:b1' },
      { trigger: 'silence', key: 'silence:2026-09-12' },
    ]);
    expect(server).toEqual(client);
  });
});

/* O balanço da semana (2026-09-24): à segunda e à terça, a semana de segunda
   a domingo que acabou. A chave é a da notificação — cliente e servidor. */
describe('balanço da semana — cliente e servidor, a mesma chave', () => {
  const MONDAY = '2026-09-28';
  const at = (iso) => new Date(`${iso}T12:00:00`);
  const semana = {
    runs: [
      { id: 'r1', date: '2026-09-22', distance_km: 8 },
      { id: 'r2', date: '2026-09-26', distance_km: 12.5 },
      { id: 'r0', date: '2026-09-16', distance_km: 6 },
    ],
    meals: [{ id: 'm1', date: '2026-09-27' }, { id: 'm2', date: '2026-09-27' }, { id: 'm3', date: '2026-09-23' }],
    gymSessions: [{ id: 'g1', date: '2026-09-24' }],
    bodyAssessments: [],
    raceEvents: [],
    dailyCheckins: [{ date: '2026-09-22', sleep: 4, energy: 3 }, { date: '2026-09-25', sleep: 2, energy: 3 }],
  };

  const weekDates = (d) => [...d.runs, ...d.meals, ...d.gymSessions].map((r) => r.date);

  it('segunda-feira: a semana de 21 a 27, com a chave do servidor', () => {
    const client = listProactiveTriggers(semana, at(MONDAY)).find((c) => c.trigger === 'week_review');
    const server = listServerProactive({ raceEvents: [], runs: semana.runs, lastRecordDate: lastRecordDate(semana), weekRecordDates: weekDates(semana) }, MONDAY)
      .find((c) => c.trigger === 'week_review');
    expect(client.key).toBe('week_review:2026-09-21');
    expect(server.key).toBe(client.key);
    expect(server.weekEnd).toBe('2026-09-27');
  });

  it('o Contexto leva as contagens da semana e as da anterior, com vírgula decimal', () => {
    const comMeio = { ...semana, dailyCheckins: [{ date: '2026-09-22', sleep: 4, energy: 3 }, { date: '2026-09-25', sleep: 3, energy: 4 }] };
    const { details } = listProactiveTriggers(comMeio, at(MONDAY)).find((c) => c.trigger === 'week_review');
    expect(details).toContain('Semana de 2026-09-21 a 2026-09-27: 2 corridas (20,5 km)');
    expect(details).toContain('1 sessão de ginásio');
    expect(details).toContain('refeições registadas em 2 de 7 dias');
    expect(details).toContain('2 check-ins');
    expect(details).toContain('sono médio 3,5/5, energia média 3,5/5');
    expect(details).toContain('Semana anterior: 1 corrida (6 km), 0 de ginásio.');
    expect(details.length).toBeLessThanOrEqual(300);
  });

  it('terça ainda vale; quarta já não', () => {
    expect(listProactiveTriggers(semana, at('2026-09-29')).some((c) => c.key === 'week_review:2026-09-21')).toBe(true);
    expect(listProactiveTriggers(semana, at('2026-09-30')).some((c) => c.trigger === 'week_review')).toBe(false);
  });

  it('só um registo de hoje não chega — a semana revista tem de ter registos', () => {
    const soHoje = { ...semana, runs: [{ id: 'r9', date: MONDAY, distance_km: 5 }], meals: [], gymSessions: [] };
    expect(listProactiveTriggers(soHoje, at(MONDAY)).some((c) => c.trigger === 'week_review')).toBe(false);
    expect(listServerProactive({ raceEvents: [], runs: soHoje.runs, lastRecordDate: MONDAY, weekRecordDates: [] }, MONDAY)).toEqual([]);
  });

  it('num dia com "Estás bem?", fica só o silêncio — nos dois lados', () => {
    const calado = { ...semana, runs: [{ id: 'r1', date: '2026-09-23', distance_km: 8 }], meals: [], gymSessions: [] };
    expect(listProactiveTriggers(calado, at(MONDAY)).map((c) => c.trigger)).toEqual(['silence']);
    expect(listServerProactive({ raceEvents: [], runs: calado.runs, lastRecordDate: '2026-09-23', weekRecordDates: ['2026-09-23'] }, MONDAY).map((c) => c.trigger)).toEqual(['silence']);
  });

  it('no dia da prova, fica só a prova', () => {
    const prova = { ...semana, raceEvents: [{ id: 'p1', name: 'Corrida', date: '2026-09-29', status: 'agendada' }] };
    expect(listProactiveTriggers(prova, at('2026-09-29')).map((c) => c.trigger)).toEqual(['race_morning']);
  });

  it('com um assunto por resolver, não há balanço — também no chat, onde o assunto não aparece na lista', () => {
    const comDor = { ...semana, profile: { coach_intervention_status: 'needed', coach_intervention_reason: 'dor no joelho' } };
    expect(listProactiveTriggers(comDor, at(MONDAY)).some((c) => c.trigger === 'week_review')).toBe(false);
  });

  it('o "Estás bem?" desligado continua a ficar com o dia: nem balanço na notificação, nem conversa diferente no chat', () => {
    const calado = { ...semana, runs: [{ id: 'r1', date: '2026-09-23', distance_km: 8 }], meals: [], gymSessions: [] };
    const server = listServerProactive({ raceEvents: [], runs: calado.runs, lastRecordDate: '2026-09-23', weekRecordDates: ['2026-09-23'], allowed: ['week_review'] }, MONDAY);
    expect(server).toEqual([]);
    expect(listProactiveTriggers(calado, at(MONDAY)).map((c) => c.trigger)).toEqual(['silence']);
  });

  it('desligado no Perfil, não aparece no servidor', () => {
    expect(listServerProactive({ raceEvents: [], runs: [], lastRecordDate: '2026-09-27', weekRecordDates: ['2026-09-25'], allowed: ['silence'] }, MONDAY)).toEqual([]);
  });
});
