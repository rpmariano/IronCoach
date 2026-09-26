import { describe, it, expect } from 'vitest';
import {
  classifyRaceOutcome, previousBestSeconds, raceResultSeconds, describeRaceOutcome,
  buildRaceOutcomePayload, formatDelta, NEAR_TARGET_RATIO, DISTANCE_MATCH_RATIO, GPS_OVERSHOOT_RATIO,
} from './raceOutcome';
import { expectCarolVoice } from '../test/carolVoice';

// A história do canvas: Meia de Lisboa, objetivo 1:52:00, final 1:53:42.
const RACE = { id: 'r1', name: 'Meia de Lisboa', date: '2027-03-08', race_type: 'estrada', distance_km: 21.1, target_time_seconds: 6720 };
const PROFILE = { experience_level: 'medio' };
const RACE_RUN = { id: 'run-race', race_id: 'r1', kind: 'competicao', date: '2027-03-08', distance_km: 21.1, duration_seconds: 6830, details: { official_time_seconds: 6822 } };
// Um 10 km a 55:00 três semanas antes: Riegel (medio, 1,06) prevê ~2:01:22
// para a meia — a prova correu ACIMA do que o treino perspetivava.
const SLOW_TENK = { id: 'run-10k', kind: 'treino', date: '2027-02-14', distance_km: 10, duration_seconds: 3300 };
// A meia anterior, 1:57:46 — o recorde a bater.
const OLD_HALF = { id: 'run-old', kind: 'competicao', date: '2026-10-11', distance_km: 21.1, duration_seconds: 7066 };

describe('raceOutcome — a régua única do resultado da prova', () => {
  it('sem prova não há nada a classificar; sem corrida ligada é "sem_registo"', () => {
    expect(classifyRaceOutcome({ race: null })).toBeNull();
    const out = classifyRaceOutcome({ race: RACE, runs: [SLOW_TENK], profile: PROFILE });
    expect(out.verdict).toBe('sem_registo');
    expect(out.officialSeconds).toBeNull();
    expect(out.targetSeconds).toBe(6720);
  });

  it('encontra a corrida da prova sozinho (findRaceRun) quando não lha dão', () => {
    const out = classifyRaceOutcome({ race: RACE, runs: [RACE_RUN, SLOW_TENK], profile: PROFILE });
    expect(out.runId).toBe('run-race');
    expect(out.officialSeconds).toBe(6822);
  });

  it('o tempo é o oficial (details.official_time_seconds), não a duração do relógio', () => {
    expect(raceResultSeconds(RACE_RUN)).toBe(6822);
    expect(raceResultSeconds({ duration_seconds: 6830 })).toBe(6830);
    expect(raceResultSeconds(null)).toBeNull();
  });

  it('perto do objetivo, acima do que o treino perspetivava, e recorde pessoal', () => {
    const out = classifyRaceOutcome({ race: RACE, run: RACE_RUN, runs: [RACE_RUN, SLOW_TENK, OLD_HALF], profile: PROFILE });
    expect(out.verdict).toBe('perto');
    expect(out.basis).toBe('objetivo');
    expect(out.deltaTargetSeconds).toBe(102);
    expect(out.predictedSeconds).toBeGreaterThan(6822 / (1 - 0.02));
    expect(out.vsTraining).toBe('acima');
    expect(out.deltaPredictionSeconds).toBeLessThan(0);
    expect(out.isPersonalRecord).toBe(true);
    expect(out.previousBestSeconds).toBe(7066);
    expect(out.deltaBestSeconds).toBe(6822 - 7066);
    expect(out.category).toBe('meia');
  });

  it('sem target_time_seconds, o objetivo lê-se do texto que o atleta escreveu (o rascunho da agenda só converte ao gravar)', () => {
    const draft = { ...RACE, target_time_seconds: undefined, target_time: '1:52:00' };
    const out = classifyRaceOutcome({ race: draft, run: RACE_RUN, runs: [RACE_RUN], profile: PROFILE });
    expect(out.targetSeconds).toBe(6720);
    expect(out.verdict).toBe('perto');
    // "47" são 47 minutos, como em parseDurationToSeconds
    const short = classifyRaceOutcome({ race: { ...RACE, distance_km: 10, target_time_seconds: null, target_time: '47' }, run: { ...RACE_RUN, distance_km: 10, details: { official_time_seconds: 2766 } }, runs: [], profile: PROFILE });
    expect(short.targetSeconds).toBe(2820);
    expect(short.verdict).toBe('superado');
  });

  it('a fronteira do "perto" é NEAR_TARGET_RATIO acima do objetivo', () => {
    const limit = Math.floor(6720 * (1 + NEAR_TARGET_RATIO));
    const at = classifyRaceOutcome({ race: RACE, run: { ...RACE_RUN, details: { official_time_seconds: limit } }, runs: [], profile: PROFILE });
    const past = classifyRaceOutcome({ race: RACE, run: { ...RACE_RUN, details: { official_time_seconds: limit + 2 } }, runs: [], profile: PROFILE });
    expect(at.verdict).toBe('perto');
    expect(past.verdict).toBe('aquem');
  });

  it('objetivo superado, dentro do que o treino perspetivava', () => {
    const race = { ...RACE, target_time_seconds: 6900 };
    // 10 km a 52:30 → previsão ~1:55:51; 1:53:42 fica dentro da banda de ±2%.
    const tenk = { ...SLOW_TENK, duration_seconds: 3150 };
    const out = classifyRaceOutcome({ race, run: RACE_RUN, runs: [RACE_RUN, tenk], profile: PROFILE });
    expect(out.verdict).toBe('superado');
    expect(out.vsTraining).toBe('dentro');
    expect(out.deltaTargetSeconds).toBe(-78);
    expect(out.isPersonalRecord).toBe(false);
    expect(out.previousBestSeconds).toBeNull();
  });

  it('objetivo superado mas abaixo da previsão — o objetivo era conservador', () => {
    const race = { ...RACE, target_time_seconds: 7200 };
    const fastTenk = { ...SLOW_TENK, duration_seconds: 2900 }; // previsão ~1:46:39
    const out = classifyRaceOutcome({ race, run: RACE_RUN, runs: [RACE_RUN, fastTenk], profile: PROFILE });
    expect(out.verdict).toBe('superado');
    expect(out.vsTraining).toBe('abaixo');
  });

  it('aquém do objetivo', () => {
    const race = { ...RACE, target_time_seconds: 6300 };
    const out = classifyRaceOutcome({ race, run: RACE_RUN, runs: [RACE_RUN], profile: PROFILE });
    expect(out.verdict).toBe('aquem');
    expect(out.deltaTargetSeconds).toBe(522);
    expect(out.predictedSeconds).toBeNull();
    expect(out.vsTraining).toBeNull();
  });

  it('a previsão do treino nunca inclui a própria prova nem corridas posteriores', () => {
    const later = { id: 'run-later', kind: 'treino', date: '2027-03-12', distance_km: 10, duration_seconds: 2400 };
    const out = classifyRaceOutcome({ race: RACE, run: RACE_RUN, runs: [RACE_RUN, later], profile: PROFILE });
    expect(out.predictedSeconds).toBeNull();
    const withTraining = classifyRaceOutcome({ race: RACE, run: RACE_RUN, runs: [RACE_RUN, later, SLOW_TENK], profile: PROFILE });
    expect(withTraining.predictedSeconds).toBeGreaterThan(7000);
  });

  it('o melhor anterior só conta competições da mesma categoria, antes do dia da prova', () => {
    const runs = [
      RACE_RUN,
      OLD_HALF,
      { id: 'a', kind: 'treino', date: '2026-11-01', distance_km: 21.1, duration_seconds: 6000 },      // treino: não conta
      { id: 'b', kind: 'competicao', date: '2026-11-15', distance_km: 10, duration_seconds: 2500 },     // 10 km: outra categoria
      { id: 'c', kind: 'competicao', date: '2027-03-08', distance_km: 21.1, duration_seconds: 6500 },   // no próprio dia: não é "anterior"
      { id: 'd', kind: 'competicao', date: '2027-04-01', distance_km: 21.1, duration_seconds: 6400 },   // depois: não conta
    ];
    expect(previousBestSeconds(runs, RACE, RACE_RUN)).toEqual({ seconds: 7066, date: '2026-10-11', distanceKm: 21.1 });
    expect(previousBestSeconds([], RACE, RACE_RUN)).toBeNull();
    expect(previousBestSeconds(runs, { ...RACE, distance_km: null }, RACE_RUN)).toBeNull();
  });

  // Fase 0 do Troféu (2026-09-26): "recorde pessoal" caía numa categoria
  // larga ("10k" = 5,5 a 11 km) — um 8 km dava "recorde nos 10 km" contra
  // uma prova de 10 km. Passa a exigir distância equivalente (±2%).
  it('recorde pessoal só compara distâncias equivalentes (±2%), não a categoria larga inteira', () => {
    const race10k = { id: 'r10k', date: '2027-01-10', distance_km: 10 };
    const run10k = { id: 'run-10k-race', race_id: 'r10k', kind: 'competicao', date: '2027-01-10', distance_km: 10, duration_seconds: 3000 };
    const old8k = { id: 'a', kind: 'competicao', date: '2026-12-01', distance_km: 8, duration_seconds: 2000 };
    // 8 km está dentro da mesma categoria larga ("10k": 5,5-11 km) que uma
    // prova de 10 km, mas 8 vs 10 é 20% de diferença — bem acima do ±2%.
    expect(previousBestSeconds([run10k, old8k], race10k, run10k)).toBeNull();

    const old98 = { id: 'b', kind: 'competicao', date: '2026-12-05', distance_km: 9.8, duration_seconds: 2900 };
    // 9,8 vs 10 km é 2% — na fronteira, ainda equivalente.
    expect(previousBestSeconds([run10k, old98], race10k, run10k)).toEqual({ seconds: 2900, date: '2026-12-05', distanceKm: 9.8 });

    const old89 = { id: 'c', kind: 'competicao', date: '2026-12-08', distance_km: 8.9, duration_seconds: 2500 };
    // 8,9 vs 10 km é 11% — mesma categoria larga, mas fora do ±2%.
    expect(previousBestSeconds([run10k, old89], race10k, run10k)).toBeNull();
  });

  it('DISTANCE_MATCH_RATIO é 2%', () => {
    expect(DISTANCE_MATCH_RATIO).toBe(0.02);
    expect(GPS_OVERSHOOT_RATIO).toBe(0.05);
  });

  // Revisão da Fase 0 (2026-09-26): o distance_km de uma corrida é o do GPS,
  // e num 10 km o relógio mede 10,2-10,4 km. Com ±2% simétrico esse 10 km
  // anterior deixava de contar e o recorde pessoal desaparecia.
  it('um 10 km anterior medido a 10,3 km pelo GPS continua a contar para o recorde', () => {
    const race10k = { id: 'r10k', date: '2027-01-10', distance_km: 10 };
    const run10k = { id: 'run-10k-race', race_id: 'r10k', kind: 'competicao', date: '2027-01-10', distance_km: 10.25, duration_seconds: 2900 };
    // Sem prova ligada: vale a distância do GPS, com folga de +5% para cima.
    const gpsOnly = { id: 'g', kind: 'competicao', date: '2026-11-01', distance_km: 10.3, duration_seconds: 3000 };
    expect(previousBestSeconds([run10k, gpsOnly], race10k, run10k)).toEqual({ seconds: 3000, date: '2026-11-01', distanceKm: 10.3 });
    const out = classifyRaceOutcome({ race: race10k, run: run10k, runs: [run10k, gpsOnly], profile: PROFILE });
    expect(out.isPersonalRecord).toBe(true);
    expect(out.deltaBestSeconds).toBe(-100);
    // Para baixo a folga continua a ser 2%: 9,7 km não é um 10 km.
    const short = { ...gpsOnly, id: 's', distance_km: 9.7 };
    expect(previousBestSeconds([run10k, short], race10k, run10k)).toBeNull();
    // E +5% é o teto: 10,6 km já não é o mesmo 10 km.
    const long = { ...gpsOnly, id: 'l', distance_km: 10.6 };
    expect(previousBestSeconds([run10k, long], race10k, run10k)).toBeNull();
  });

  it('uma prova criada pelo registo (local vazio, distância do GPS) compara-se com a folga do GPS, nos dois sentidos', () => {
    // A prova de agora foi criada pelo registo com os 10,3 km do relógio; a
    // anterior é um 10 km oficial da agenda.
    const measured = { id: 'm', date: '2027-01-10', distance_km: 10.3, location: '' };
    const runNow = { id: 'now', race_id: 'm', kind: 'competicao', date: '2027-01-10', distance_km: 10.3, duration_seconds: 2900 };
    const oldRace = { id: 'old', date: '2026-11-01', distance_km: 10, location: 'Lisboa' };
    const oldRun = { id: 'o', race_id: 'old', kind: 'competicao', date: '2026-11-01', distance_km: 10.2, duration_seconds: 3000 };
    expect(previousBestSeconds([runNow, oldRun], measured, runNow, [measured, oldRace])?.seconds).toBe(3000);
    // E ao contrário: a anterior foi criada pelo registo, a de agora é oficial.
    const official = { id: 'n', date: '2027-01-10', distance_km: 10, location: 'Cascais' };
    const runOff = { id: 'now2', race_id: 'n', kind: 'competicao', date: '2027-01-10', distance_km: 10.1, duration_seconds: 2900 };
    const oldMeasured = { id: 'old2', date: '2026-11-01', distance_km: 10.3, location: '' };
    const oldRun2 = { id: 'o2', race_id: 'old2', kind: 'competicao', date: '2026-11-01', distance_km: 10.3, duration_seconds: 3000 };
    expect(previousBestSeconds([runOff, oldRun2], official, runOff, [official, oldMeasured])?.seconds).toBe(3000);
    // Entre duas oficiais continua a ser ±2%.
    const off103 = { ...oldMeasured, location: 'Oeiras' };
    expect(previousBestSeconds([runOff, oldRun2], official, runOff, [official, off103])).toBeNull();
  });

  it('numa corrida ligada a uma prova manda a distância OFICIAL dessa prova, não a do GPS', () => {
    const race10k = { id: 'r10k', date: '2027-01-10', distance_km: 10 };
    const run10k = { id: 'run-10k-race', race_id: 'r10k', kind: 'competicao', date: '2027-01-10', distance_km: 10, duration_seconds: 2900 };
    const oldRace = { id: 'old10k', date: '2026-11-01', distance_km: 10 };
    // O relógio mediu 10,8 km (+8%, fora até da folga do GPS), mas a prova
    // era um 10 km oficial.
    const linked = { id: 'o', race_id: 'old10k', kind: 'competicao', date: '2026-11-01', distance_km: 10.8, duration_seconds: 3000 };
    expect(previousBestSeconds([run10k, linked], race10k, run10k)).toBeNull();
    expect(previousBestSeconds([run10k, linked], race10k, run10k, [race10k, oldRace]))
      .toEqual({ seconds: 3000, date: '2026-11-01', distanceKm: 10 });
    expect(classifyRaceOutcome({ race: race10k, run: run10k, runs: [run10k, linked], profile: PROFILE, races: [race10k, oldRace] }).isPersonalRecord).toBe(true);
    // E a oficial também exclui: um 8 km oficial medido a 10,1 km pelo GPS
    // não passa a contar como 10 km.
    const race8k = { id: 'r8k', date: '2026-10-01', distance_km: 8 };
    const linked8 = { id: 'e', race_id: 'r8k', kind: 'competicao', date: '2026-10-01', distance_km: 10.1, duration_seconds: 2400 };
    expect(previousBestSeconds([run10k, linked8], race10k, run10k, [race10k, race8k])).toBeNull();
  });

  it('sem objetivo, a régua passa a ser a previsão; sem previsão, é só "concluída"', () => {
    const race = { ...RACE, target_time_seconds: null };
    const byPrediction = classifyRaceOutcome({ race, run: RACE_RUN, runs: [RACE_RUN, SLOW_TENK], profile: PROFILE });
    expect(byPrediction.basis).toBe('previsao');
    expect(byPrediction.verdict).toBe('superado');
    const bare = classifyRaceOutcome({ race, run: RACE_RUN, runs: [RACE_RUN], profile: PROFILE });
    expect(bare.basis).toBeNull();
    expect(bare.verdict).toBe('concluida');
  });

  it('o balanço curto diz os números e o veredicto, sem pontos de exclamação', () => {
    const near = classifyRaceOutcome({ race: RACE, run: RACE_RUN, runs: [RACE_RUN, SLOW_TENK, OLD_HALF], profile: PROFILE });
    const text = describeRaceOutcome(near, RACE);
    expect(text).toContain('1:53:42');
    expect(text).toContain('Ficaste a 1:42 do objetivo');
    expect(text).toContain('Acima do que o treino perspetivava');
    expect(text).toContain('Recorde pessoal na meia, por 4:04');
    expectCarolVoice(text);

    const beaten = classifyRaceOutcome({ race: { ...RACE, target_time_seconds: 6900 }, run: RACE_RUN, runs: [RACE_RUN], profile: PROFILE });
    expect(describeRaceOutcome(beaten, RACE)).toContain('Objetivo batido por 1:18');

    const short = classifyRaceOutcome({ race: { ...RACE, target_time_seconds: 6300 }, run: RACE_RUN, runs: [RACE_RUN], profile: PROFILE });
    expect(describeRaceOutcome(short, RACE)).toContain('Ficaste a 8:42 do objetivo.');

    expect(describeRaceOutcome(classifyRaceOutcome({ race: RACE, runs: [] }), RACE)).toContain('ainda não tem a corrida registada');
    expect(describeRaceOutcome(null)).toBe('');
  });

  it('formatDelta é sempre positivo e sem sinal', () => {
    expect(formatDelta(-102)).toBe('1:42');
    expect(formatDelta(102)).toBe('1:42');
    expect(formatDelta(3661)).toBe('1:01:01');
  });

  it('o payload para o coach-chat leva só números e chaves', () => {
    const out = classifyRaceOutcome({ race: RACE, run: { ...RACE_RUN, effort_rpe: 8, details: { official_time_seconds: 6822, position: 412 } }, runs: [RACE_RUN, SLOW_TENK, OLD_HALF], profile: PROFILE });
    const payload = buildRaceOutcomePayload(out, RACE, { effort_rpe: 8, details: { official_time_seconds: 6822, position: 412 } });
    expect(payload).toMatchObject({
      race_id: 'r1', name: 'Meia de Lisboa', date: '2027-03-08', race_type: 'estrada', distance_km: 21.1, category: 'meia',
      official_seconds: 6822, target_seconds: 6720, previous_best_seconds: 7066, previous_best_date: '2026-10-11',
      position: 412, effort_rpe: 8, verdict: 'perto', basis: 'objetivo', vs_training: 'acima', is_personal_record: true,
    });
    expect(typeof payload.predicted_seconds).toBe('number');
    expect(payload.splits).toEqual([]);
    expect(buildRaceOutcomePayload(null, RACE)).toBeNull();
  });

  it('os parciais registados seguem no payload, limpos', () => {
    const run = { ...RACE_RUN, details: { official_time_seconds: 6822, splits: [{ distance_km: 5, time_seconds: 1600 }, { distance_km: '10', time_seconds: '3210' }, { distance_km: null, time_seconds: 100 }, { distance_km: 15, time_seconds: 0 }] } };
    const out = classifyRaceOutcome({ race: RACE, run, runs: [run], profile: PROFILE });
    expect(buildRaceOutcomePayload(out, RACE, run).splits).toEqual([{ distance_km: 5, time_seconds: 1600 }, { distance_km: 10, time_seconds: 3210 }]);
  });
});
