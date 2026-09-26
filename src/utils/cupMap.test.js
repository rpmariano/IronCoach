import { describe, it, expect, beforeEach, vi } from 'vitest';
import { cupMapCandidate, cupMapSignature, wasCupMapHandled, markCupMapHandled, CUP_MAP_TITLE } from './cupMap';
import { buildCupView } from './useCup';
import { CUP_EMPTY } from '../store/cupSlice';
import * as F from '@formulas/cup.fixtures.ts';

/* O mapa da época no Início (specs/trofeu.md §5, "Momentos", Fase 2). Só
   para inscritos; ao inscrever (`first`) e quando sai o calendário com
   jornadas por decidir. "Hoje" é injetado: as datas são fixas. */

const TODAY = '2026-11-20';
const USER = 'u-mapa';
const ED = 'ed-teste';

const round = (id, over = {}) => ({ id, round_no: Number(id.replace(/\D/g, '')) || 1, date: null, date_status: 'provavel', participation: null, ...over });
const view = (over = {}) => ({
  edition: { id: ED },
  competition: { short_name: 'Troféu de Teste', round_label: 'Jornada' },
  enrollment: { id: 'enr1', status: 'ativa', season_goal: 'participar' },
  catalogReady: true,
  rounds: [],
  ...over,
});
const conf = (id, date, over = {}) => round(id, { date, date_status: 'confirmada', ...over });
const candidate = (v, over = {}) => cupMapCandidate({ view: v, userId: USER, impressionShown: new Set(), impressionDismissed: new Set(), today: TODAY, ...over });

const COM_CALENDARIO = 'Troféu de Teste: já há datas no calendário. Quero ver contigo o papel de cada jornada ao lado das tuas provas principais.';
const SEM_CALENDARIO = 'Troféu de Teste: quero ver contigo como a época encaixa nas tuas provas principais.';

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('cupMapSignature', () => {
  it('a edição e as datas confirmadas; a ordem das jornadas não conta', () => {
    const a = view({ rounds: [conf('j1', '2026-12-06'), conf('j2', '2027-01-10'), round('j3')] });
    const b = view({ rounds: [round('j3'), conf('j2', '2027-01-10'), conf('j1', '2026-12-06')] });
    expect(cupMapSignature(a)).toMatch(/^cup_map:ed-teste:[0-9a-z]+$/);
    expect(cupMapSignature(a)).toBe(cupMapSignature(b));
  });

  it('muda com uma data nova ou uma jornada confirmada a mais; provável e cancelada não contam', () => {
    const base = view({ rounds: [conf('j1', '2026-12-06')] });
    expect(cupMapSignature(view({ rounds: [conf('j1', '2026-12-13')] }))).not.toBe(cupMapSignature(base));
    expect(cupMapSignature(view({ rounds: [conf('j1', '2026-12-06'), conf('j2', '2027-01-10')] }))).not.toBe(cupMapSignature(base));
    expect(cupMapSignature(view({ rounds: [conf('j1', '2026-12-06'), round('j2', { date: '2027-01-10' }), round('j3', { date: '2027-01-24', date_status: 'cancelada' })] })))
      .toBe(cupMapSignature(base));
  });

  it('sem nenhuma jornada confirmada: "0"; sem edição, null', () => {
    expect(cupMapSignature(view({ rounds: [round('j1', { date: '2026-12-06' })] }))).toBe('cup_map:ed-teste:0');
    expect(cupMapSignature(view({ edition: null }))).toBeNull();
    expect(cupMapSignature(null)).toBeNull();
  });
});

describe('cupMapCandidate — sem inscrição, nada', () => {
  it('sem vista, sem inscrição ativa ou com o catálogo por ler: null', () => {
    expect(candidate(null)).toBeNull();
    expect(candidate(view({ enrollment: null }))).toBeNull();
    expect(candidate(view({ catalogReady: false }))).toBeNull();
    expect(cupMapCandidate()).toBeNull();
  });

  it('a vista da porta de convite (não inscrito) não dá mapa nenhum', () => {
    const cup = {
      ...CUP_EMPTY, status: 'ready', userId: USER,
      editions: [{ ...F.CASCAIS_34_ABERTA, competition: F.CASCAIS_COMPETITION }],
      catalog: { [F.CASCAIS_34.id]: { status: 'ready', rounds: F.CASCAIS_ROUNDS, courses: F.CASCAIS_COURSES, overrides: F.CASCAIS_OVERRIDES, categories: F.CASCAIS_CATEGORIES, teams: F.CASCAIS_TEAMS } },
    };
    const profile = { id: USER, gender: 'M', birth_date: '1982-01-24', training_lat: 38.6979, training_lon: -9.4215 };
    const v = buildCupView({ cup, profile, raceEvents: [], runs: [], today: '2027-01-11' });
    expect(v?.door?.kind).toBe('convite');
    expect(cupMapCandidate({ view: v, userId: USER, today: '2027-01-11' })).toBeNull();
  });
});

describe('cupMapCandidate — o mapa da inscrição (first)', () => {
  it('sem calendário: aparece na mesma, com o texto sem datas', () => {
    const c = candidate(view({ rounds: [round('j1', { date: '2026-12-06' })] }));
    expect(c).toEqual({
      signature: 'cup_map:ed-teste:0', first: true, editionId: ED, hasCalendar: false,
      title: CUP_MAP_TITLE, message: SEM_CALENDARIO,
    });
    expect(CUP_MAP_TITLE).toBe('O mapa da época');
  });

  it('com calendário: o texto das datas — mesmo com tudo já decidido', () => {
    const c = candidate(view({ rounds: [conf('j1', '2026-12-06', { participation: { decision: 'vou', intent: 'controlar' } })] }));
    expect(c).toMatchObject({ first: true, hasCalendar: true, message: COM_CALENDARIO });
  });

  it('uma jornada confirmada já passada não é calendário', () => {
    expect(candidate(view({ rounds: [conf('j1', '2026-11-15')] }))).toMatchObject({ first: true, hasCalendar: false, message: SEM_CALENDARIO });
  });

  it('o rótulo da competição vai em minúsculas ("Etapa" → "etapa")', () => {
    const c = candidate(view({ competition: { short_name: 'Circuito X', round_label: 'Etapa' }, rounds: [conf('j1', '2026-12-06')] }));
    expect(c.message).toBe('Circuito X: já há datas no calendário. Quero ver contigo o papel de cada etapa ao lado das tuas provas principais.');
  });

  it('com a vista montada das fixtures (buildCupView, inscrito): a mesma forma', () => {
    const cup = {
      ...CUP_EMPTY, status: 'ready', userId: USER,
      editions: [{ ...F.CASCAIS_34_ABERTA, competition: F.CASCAIS_COMPETITION }],
      enrollments: [{ id: 'enr1', user_id: USER, edition_id: F.CASCAIS_34.id, team_id: 't-naza', season_goal: 'premio', status: 'ativa' }],
      catalog: { [F.CASCAIS_34.id]: { status: 'ready', rounds: F.CASCAIS_ROUNDS, courses: F.CASCAIS_COURSES, overrides: F.CASCAIS_OVERRIDES, categories: F.CASCAIS_CATEGORIES, teams: F.CASCAIS_TEAMS } },
    };
    const profile = { id: USER, gender: 'M', birth_date: '1982-01-24' };
    const v = buildCupView({ cup, profile, raceEvents: [], runs: [], today: '2027-01-11' });
    const c = cupMapCandidate({ view: v, userId: USER, today: '2027-01-11' });
    expect(c).toMatchObject({ first: true, hasCalendar: true, editionId: F.CASCAIS_34.id });
    expect(c.message).toBe('Troféu de Cascais: já há datas no calendário. Quero ver contigo o papel de cada jornada ao lado das tuas provas principais.');
    expect(c.signature.startsWith(`cup_map:${F.CASCAIS_34.id}:`)).toBe(true);
  });
});

describe('cupMapCandidate — quando sai o calendário (depois do primeiro)', () => {
  const semCalendario = view({ rounds: [round('j1', { date: '2026-12-06' })] });
  beforeEach(() => markCupMapHandled(USER, cupMapSignature(semCalendario)));

  it('a mesma assinatura já tratada não volta', () => {
    expect(candidate(semCalendario)).toBeNull();
  });

  it('calendário novo com jornadas por decidir: volta, já sem ser o primeiro', () => {
    const c = candidate(view({ rounds: [conf('j1', '2026-12-06')] }));
    expect(c).toMatchObject({ first: false, hasCalendar: true, message: COM_CALENDARIO });
  });

  it('"não sei" e "vou" sem papel também pedem conversa', () => {
    expect(candidate(view({ rounds: [conf('j1', '2026-12-06', { participation: { decision: 'nao_sei' } })] }))).not.toBeNull();
    expect(candidate(view({ rounds: [conf('j1', '2026-12-06', { participation: { decision: 'vou', intent: null } })] }))).not.toBeNull();
    expect(candidate(view({ rounds: [conf('j1', '2026-12-06', { participation: { decision: null, decision_source: 'colisao' } })] }))).not.toBeNull();
  });

  it('tudo decidido (ou só jornadas passadas por decidir): nada', () => {
    expect(candidate(view({ rounds: [
      conf('j1', '2026-12-06', { participation: { decision: 'vou', intent: 'atacar' } }),
      conf('j2', '2027-01-10', { participation: { decision: 'nao_vou' } }),
      conf('j0', '2026-11-01'),
    ] }))).toBeNull();
  });

  it('sem calendário e sem ser o primeiro: nada', () => {
    expect(candidate(view({ rounds: [round('j1', { date: '2026-12-13' }), round('j2')] }))).toBeNull();
  });
});

describe('cupMapCandidate — o que se tratou noutro dispositivo (impressões)', () => {
  const v = view({ rounds: [conf('j1', '2026-12-06')] });
  const sig = cupMapSignature(v);

  it('a conversa tida noutro dispositivo (moment) cala esta assinatura', () => {
    expect(candidate(v, { impressionShown: new Set([`moment:${sig}`]) })).toBeNull();
  });

  it('dispensado noutro dispositivo (alert) também', () => {
    expect(candidate(v, { impressionDismissed: new Set([`alert:${sig}`]) })).toBeNull();
  });

  it('só ter aberto a janela dos avisos (alert mostrado) não conta como tratado', () => {
    expect(candidate(v, { impressionShown: new Set([`alert:${sig}`, 'alert:mapa-epoca']) })).toMatchObject({ first: true });
  });

  it('outro mapa desta edição tratado noutro dispositivo: já não é o primeiro', () => {
    expect(candidate(v, { impressionShown: new Set([`moment:cup_map:${ED}:0`]) })).toMatchObject({ first: false });
    expect(candidate(v, { impressionDismissed: new Set([`alert:cup_map:${ED}:0`]) })).toMatchObject({ first: false });
    // De outra edição não conta.
    expect(candidate(v, { impressionShown: new Set(['moment:cup_map:outra:0']) })).toMatchObject({ first: true });
  });

  it('as impressões podem vir como lista', () => {
    expect(candidate(v, { impressionShown: [`moment:${sig}`] })).toBeNull();
  });
});

describe('wasCupMapHandled / markCupMapHandled', () => {
  it('por conta, e só a assinatura exata', () => {
    markCupMapHandled(USER, 'cup_map:a:1');
    expect(wasCupMapHandled(USER, 'cup_map:a:1')).toBe(true);
    expect(wasCupMapHandled(USER, 'cup_map:a:2')).toBe(false);
    expect(wasCupMapHandled('outro', 'cup_map:a:1')).toBe(false);
    expect(wasCupMapHandled(USER, null)).toBe(false);
    markCupMapHandled(USER, null);
    expect(JSON.parse(window.localStorage.getItem('ironcoach:mapa-epoca:u-mapa'))).toEqual(['cup_map:a:1']);
  });

  it('guarda as 20 mais recentes, sem repetidas', () => {
    for (let i = 0; i < 25; i += 1) markCupMapHandled(USER, `cup_map:a:${i}`);
    markCupMapHandled(USER, 'cup_map:a:24');
    const list = JSON.parse(window.localStorage.getItem('ironcoach:mapa-epoca:u-mapa'));
    expect(list).toHaveLength(20);
    expect(list[0]).toBe('cup_map:a:5');
    expect(list[19]).toBe('cup_map:a:24');
  });

  it('lixo no storage ou storage bloqueado: não rebenta', () => {
    window.localStorage.setItem('ironcoach:mapa-epoca:u-mapa', '{nao é json');
    expect(wasCupMapHandled(USER, 'cup_map:a:1')).toBe(false);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('bloqueado'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('bloqueado'); });
    expect(() => markCupMapHandled(USER, 'cup_map:a:1')).not.toThrow();
    expect(candidate(view({ rounds: [conf('j1', '2026-12-06')] }))).toMatchObject({ first: true });
  });
});
