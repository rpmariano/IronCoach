import { describe, it, expect } from 'vitest';
import { pickProactiveTrigger, lastRecordDate } from './coachProactive';
import { pickServerProactive } from '@formulas/proactiveTriggers.ts';

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
    },
    TODAY,
  );
  return {
    client: client ? { trigger: client.trigger, key: client.key } : null,
    server: server ? { trigger: server.trigger, key: server.key } : null,
  };
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
