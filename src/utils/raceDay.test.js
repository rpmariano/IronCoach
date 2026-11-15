import { describe, it, expect } from 'vitest';
import { raceLinkedRunIds, raceResultLine, runsWithoutRaceRuns } from './raceDay';

/* Bug #117: a corrida que registou uma prova vai no cartão da prova — não aparece à parte. */
describe('raceDay', () => {
  const race = { id: 'r1', date: '2026-11-08', status: 'concluida' };
  const linked = { id: 'a', date: '2026-11-08', kind: 'competicao', race_id: 'r1', distance_km: 10, duration_seconds: 2832, details: { official_time_seconds: 2830 } };
  const other = { id: 'b', date: '2026-11-08', kind: 'treino' };
  const legacy = { id: 'c', date: '2026-11-08', kind: 'competicao', created_at: '2026-11-08T10:00:00Z' };

  it('tira as corridas ligadas (race_id) e a escolhida por data numa prova antiga; deixa as outras', () => {
    expect(runsWithoutRaceRuns([linked, other], [race]).map((r) => r.id)).toEqual(['b']);
    // Sem race_id: numa prova concluída, a competição do dia é a dela (o recurso das provas antigas).
    expect(runsWithoutRaceRuns([legacy, other], [race]).map((r) => r.id)).toEqual(['b']);
    // Numa prova ainda agendada, uma competição sem ligação é outra coisa.
    expect(runsWithoutRaceRuns([legacy], [{ ...race, status: 'agendada' }]).map((r) => r.id)).toEqual(['c']);
    expect(runsWithoutRaceRuns([linked], [])).toEqual([linked]);
    expect([...raceLinkedRunIds([race], [linked, other])]).toEqual(['a']);
  });

  it('o resultado: o tempo oficial e o ritmo; sem tempo, nada', () => {
    expect(raceResultLine(linked)).toMatch(/^Resultado: 47:10 · .+\/km$/);
    expect(raceResultLine({ ...linked, details: {} })).toMatch(/^Resultado: 47:12/);
    expect(raceResultLine({ id: 'x' })).toBeNull();
    expect(raceResultLine(null)).toBeNull();
  });
});
