import { describe, it, expect } from 'vitest';
import { groupRaces, countdownLabel, daysUntil } from './raceList';

/* Todas as provas num sítio só (pedido 2026-09-13): três grupos, pela mesma
   régua do hub, da agenda e do Palmarés. */

const TODAY = '2026-09-13';

const race = (id, date, extra = {}) => ({
  id, name: `Prova ${id}`, date, distance_km: 10, race_type: 'estrada', status: 'agendada', ...extra,
});

describe('groupRaces', () => {
  it('separa próximas, por registar e concluídas, cada grupo pela ordem que se lê', () => {
    const raceEvents = [
      race('longe', '2026-12-01'),
      race('hoje', TODAY),
      race('perto', '2026-09-20'),
      race('esquecida', '2026-08-01'),
      race('ontem', '2026-09-12'),
      race('antiga', '2026-04-10', { status: 'concluida' }),
      race('recente', '2026-08-30', { status: 'concluida' }),
    ];
    const { proximas, porRegistar, concluidas, total } = groupRaces({ raceEvents, runs: [], today: TODAY });

    expect(proximas.map((p) => p.race.id)).toEqual(['hoje', 'perto', 'longe']);
    expect(proximas.map((p) => p.days)).toEqual([0, 7, 79]);
    // As por registar vêm da mais recente para trás, sem limite de dias.
    expect(porRegistar.map((p) => p.race.id)).toEqual(['ontem', 'esquecida']);
    expect(concluidas.map((c) => c.race.id)).toEqual(['recente', 'antiga']);
    expect(total).toBe(7);
  });

  it('uma concluída com corrida ligada traz o tempo e as conquistas; fechada à mão fica sem números', () => {
    const raceEvents = [
      race('com', '2026-08-30', { status: 'concluida', target_time: '50:00' }),
      race('sem', '2026-07-01', { status: 'concluida' }),
    ];
    const runs = [{
      id: 'run-1', race_id: 'com', kind: 'competicao', date: '2026-08-30',
      distance_km: 10, duration_seconds: 2950, details: { official_time_seconds: 2950 },
    }];
    const { concluidas } = groupRaces({ raceEvents, runs, today: TODAY });

    const com = concluidas.find((c) => c.race.id === 'com');
    expect(com.run.id).toBe('run-1');
    expect(com.outcome.officialSeconds).toBe(2950);
    expect(com.achievements.map((a) => a.key)).toContain('prova_concluida');

    const sem = concluidas.find((c) => c.race.id === 'sem');
    expect(sem.run).toBeNull();
    expect(sem.outcome).toBeNull();
    expect(sem.achievements).toEqual([]);
  });

  it('ignora provas sem id ou sem data, e aguenta listas vazias', () => {
    expect(groupRaces({ raceEvents: [{ name: 'x' }, race('ok', '2026-10-01'), { id: 'y' }], today: TODAY }).total).toBe(1);
    expect(groupRaces({ today: TODAY })).toEqual({ proximas: [], porRegistar: [], concluidas: [], total: 0 });
  });
});

describe('contagem', () => {
  it('diz hoje, amanhã e daqui a N dias', () => {
    expect(daysUntil('2026-09-20', TODAY)).toBe(7);
    expect(countdownLabel(0)).toBe('hoje');
    expect(countdownLabel(1)).toBe('amanhã');
    expect(countdownLabel(12)).toBe('daqui a 12 dias');
  });
});
