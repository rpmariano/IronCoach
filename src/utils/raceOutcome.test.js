import { describe, it, expect } from 'vitest';
import {
  classifyRaceOutcome, previousBestSeconds, raceResultSeconds, describeRaceOutcome,
  buildRaceOutcomePayload, formatDelta, raceDistancePhrase, NEAR_TARGET_RATIO, DISTANCE_MATCH_RATIO, GPS_OVERSHOOT_RATIO,
} from './raceOutcome';
import { bateuObjetivo } from './premios';
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
    expect(text).toContain('Recorde pessoal na meia maratona, por 4:04');
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

/* A prova criada sozinha para uma competição fora da agenda
   (autoCreateRaceForCompetition) grava como objetivo a duração da própria
   corrida: 47:30 no relógio dá uma prova com objetivo 47:30. */
const AUTO_RUN = { id: 'run-auto', race_id: 'r-auto', kind: 'competicao', date: '2027-05-02', distance_km: 10, duration_seconds: 2850, details: { race_type: 'estrada' } };
const AUTO_RACE = { id: 'r-auto', name: 'Corrida de São João', date: '2027-05-02', race_type: 'estrada', distance_km: 10, target_time: '47:30', target_time_seconds: 2850, target_pace_seconds_per_km: 285, status: 'concluida' };

describe('raceOutcome — o objetivo sintético da prova automática não é objetivo', () => {
  it('sem tempo oficial: não há "objetivo cumprido" nem prémio de objetivo batido', () => {
    const out = classifyRaceOutcome({ race: AUTO_RACE, runs: [AUTO_RUN], profile: PROFILE });
    expect(out.runId).toBe('run-auto');
    expect(out.targetSeconds).toBeNull();
    expect(out.deltaTargetSeconds).toBeNull();
    expect(out.basis).toBeNull();
    expect(out.verdict).toBe('concluida');
    expect(bateuObjetivo(out)).toBe(false);
    const text = describeRaceOutcome(out, AUTO_RACE);
    expect(text).toMatch(/^47:30 \(.+\/km\)\. Prova concluída\.$/);
    expect(text).not.toContain('Objetivo');
    expect(text).not.toContain('em cima da hora');
    expect(buildRaceOutcomePayload(out, AUTO_RACE, AUTO_RUN).target_seconds).toBeNull();
  });

  it('o objetivo em texto (target_time) também se reconhece como sintético', () => {
    const out = classifyRaceOutcome({ race: { ...AUTO_RACE, target_time_seconds: null }, run: AUTO_RUN, runs: [AUTO_RUN], profile: PROFILE });
    expect(out.targetSeconds).toBeNull();
    expect(out.basis).toBeNull();
  });

  it('com tempo oficial 47:22 e relógio 47:30: nada de "objetivo batido por 0:08" — cai para "Prova concluída." ou para a previsão', () => {
    const run = { ...AUTO_RUN, details: { race_type: 'estrada', official_time_seconds: 2842 } };
    const bare = classifyRaceOutcome({ race: AUTO_RACE, run, runs: [run], profile: PROFILE });
    expect(bare.officialSeconds).toBe(2842);
    expect(bare.targetSeconds).toBeNull();
    expect(bare.verdict).toBe('concluida');
    expect(bateuObjetivo(bare)).toBe(false);
    const bareText = describeRaceOutcome(bare, AUTO_RACE);
    expect(bareText).toMatch(/^47:22 \(.+\/km\)\. Prova concluída\.$/);

    // Com treino anterior, a régua passa a ser a previsão, como em qualquer
    // prova sem objetivo marcado.
    const withTraining = classifyRaceOutcome({ race: AUTO_RACE, run, runs: [run, { ...SLOW_TENK, date: '2027-04-10' }], profile: PROFILE });
    expect(withTraining.basis).toBe('previsao');
    expect(bateuObjetivo(withTraining)).toBe(false);
    const text = describeRaceOutcome(withTraining, AUTO_RACE);
    expect(text).toContain('Sem objetivo marcado');
    expect(text).not.toContain('Objetivo batido');
    expect(text).not.toContain('do objetivo');
    expectCarolVoice(text);
  });

  it('um objetivo verdadeiro batido ao segundo diz-se assim, e conta como objetivo batido', () => {
    const race = { ...AUTO_RACE, target_time: '47:00', target_time_seconds: 2820 };
    const run = { ...AUTO_RUN, duration_seconds: 2826, details: { race_type: 'estrada', official_time_seconds: 2820 } };
    const out = classifyRaceOutcome({ race, run, runs: [run], profile: PROFILE });
    expect(out.targetSeconds).toBe(2820);
    expect(out.basis).toBe('objetivo');
    expect(out.verdict).toBe('superado');
    expect(out.deltaTargetSeconds).toBe(0);
    expect(bateuObjetivo(out)).toBe(true);
    const text = describeRaceOutcome(out, race);
    expect(text).toContain('Objetivo cumprido ao segundo.');
    expect(text).not.toContain('em cima da hora');
    expectCarolVoice(text);
  });
});

describe('raceOutcome — o recorde pessoal só contra a mesma distância e o mesmo terreno', () => {
  const RACE_15 = { id: 'r15', name: 'Corrida das Pontes', date: '2027-04-10', race_type: 'estrada', distance_km: 15, target_time_seconds: 4800 };
  const RUN_15 = { id: 'run-15', race_id: 'r15', kind: 'competicao', date: '2027-04-10', distance_km: 15, duration_seconds: 4700 };

  it('um 15 km não bate recorde nenhum contra uma meia, embora caiam na mesma categoria', () => {
    expect(previousBestSeconds([RUN_15, OLD_HALF], RACE_15, RUN_15)).toBeNull();
    const out = classifyRaceOutcome({ race: RACE_15, run: RUN_15, runs: [RUN_15, OLD_HALF], profile: PROFILE });
    expect(out.category).toBe('meia');
    expect(out.isPersonalRecord).toBe(false);
    expect(out.previousBestSeconds).toBeNull();
    expect(describeRaceOutcome(out, RACE_15)).not.toContain('Recorde pessoal');
  });

  // Sem prova ligada, a distância é a do GPS: -2% para baixo e a folga do
  // relógio para cima (GPS_OVERSHOOT_RATIO, a regra da Fase 0 do Troféu).
  it('sem prova ligada, a distância do GPS conta com a folga do relógio; fora dela, não', () => {
    const race = { ...RACE, distance_km: 21.0975 };
    const gpsLonga = { id: 'w', kind: 'competicao', date: '2026-11-01', distance_km: 21.6, duration_seconds: 7000 };  // +2,4%: o relógio mede a mais
    const muitoLonga = { id: 'o', kind: 'competicao', date: '2026-11-08', distance_km: 22.3, duration_seconds: 6800 }; // +5,7%: outra distância
    const curta = { id: 'c', kind: 'competicao', date: '2026-11-15', distance_km: 20.6, duration_seconds: 6700 };     // -2,4%: outra distância
    expect(previousBestSeconds([RACE_RUN, gpsLonga, muitoLonga, curta], race, RACE_RUN)).toEqual({ seconds: 7000, date: '2026-11-01', distanceKm: 21.6 });
  });

  it('um trail não se compara com a estrada, na mesma distância', () => {
    const trailRace = { id: 'rt', name: 'Trail da Serra', date: '2027-06-05', race_type: 'trail', distance_km: 25, target_time_seconds: 12000 };
    const trailRun = { id: 'run-t', race_id: 'rt', kind: 'competicao', date: '2027-06-05', distance_km: 25, duration_seconds: 11000, details: { race_type: 'trail' } };
    const roadSame = { id: 'road-25', kind: 'competicao', date: '2026-12-01', distance_km: 25, duration_seconds: 7500, details: { race_type: 'estrada' } };
    const roadMarathon = { id: 'road-42', kind: 'competicao', date: '2026-11-01', distance_km: 42.195, duration_seconds: 14400 };
    expect(previousBestSeconds([trailRun, roadSame, roadMarathon], trailRace, trailRun)).toBeNull();
    const out = classifyRaceOutcome({ race: trailRace, run: trailRun, runs: [trailRun, roadSame, roadMarathon], profile: PROFILE });
    expect(out.isPersonalRecord).toBe(false);

    const oldTrail = { id: 'trail-old', kind: 'competicao', date: '2026-10-04', distance_km: 25.3, duration_seconds: 11600, details: { race_type: 'trail' } };
    const record = classifyRaceOutcome({ race: trailRace, run: trailRun, runs: [trailRun, roadSame, oldTrail], profile: PROFILE });
    expect(record.isPersonalRecord).toBe(true);
    expect(record.previousBestSeconds).toBe(11600);
    expect(describeRaceOutcome(record, trailRace)).toContain('Recorde pessoal nos 25 km, por 10:00.');

    // E ao contrário: a estrada não se compara com um trail anterior.
    const roadRace = { ...trailRace, id: 'rr', race_type: 'estrada' };
    const roadRun = { ...trailRun, id: 'run-r', race_id: 'rr', details: { race_type: 'estrada' } };
    expect(previousBestSeconds([roadRun, oldTrail], roadRace, roadRun)).toBeNull();
  });

  it('o rótulo é a distância real: "nos 10 km", "na meia maratona", "nos 12,5 km"', () => {
    expect(raceDistancePhrase(10)).toBe('nos 10 km');
    expect(raceDistancePhrase(10.12)).toBe('nos 10 km');
    expect(raceDistancePhrase(15)).toBe('nos 15 km');
    expect(raceDistancePhrase(21.0975)).toBe('na meia maratona');
    expect(raceDistancePhrase(21.1)).toBe('na meia maratona');
    expect(raceDistancePhrase(42.195)).toBe('na maratona');
    expect(raceDistancePhrase(12.5)).toBe('nos 12,5 km');
    expect(raceDistancePhrase(13.04)).toBe('nos 13 km');

    const tenk = { id: 'r10', name: 'São Silvestre', date: '2027-12-31', race_type: 'estrada', distance_km: 10, target_time_seconds: 3000 };
    const run = { id: 'run-10', race_id: 'r10', kind: 'competicao', date: '2027-12-31', distance_km: 10.05, duration_seconds: 2700 };
    const old = { id: 'old-10', kind: 'competicao', date: '2027-06-01', distance_km: 9.95, duration_seconds: 2760 };
    const text = describeRaceOutcome(classifyRaceOutcome({ race: tenk, run, runs: [run, old], profile: PROFILE }), tenk);
    expect(text).toContain('Recorde pessoal nos 10 km, por 1:00.');
    expectCarolVoice(text);
  });
});

describe('raceOutcome — prova com a corrida ligada mas sem tempo', () => {
  it('a corrida existe e está ligada: pede o tempo oficial, não o registo', () => {
    const noTime = { id: 'run-sem-tempo', race_id: 'r1', kind: 'competicao', date: '2027-03-08', distance_km: 21.1, duration_seconds: null, details: {} };
    const out = classifyRaceOutcome({ race: RACE, runs: [noTime, SLOW_TENK], profile: PROFILE });
    expect(out.verdict).toBe('sem_registo');
    expect(out.runId).toBe('run-sem-tempo');
    const text = describeRaceOutcome(out, RACE);
    expect(text).toBe('Falta o tempo oficial desta prova. Põe-no na corrida e eu faço as contas.');
    expect(text).not.toContain('ainda não tem a corrida registada');
    expectCarolVoice(text);
  });

  it('sem corrida nenhuma, mantém o pedido de registo', () => {
    const text = describeRaceOutcome(classifyRaceOutcome({ race: RACE, runs: [SLOW_TENK], profile: PROFILE }), RACE);
    expect(text).toBe('Meia de Lisboa ainda não tem a corrida registada. Regista-a para fecharmos o ciclo com números reais.');
  });
});
