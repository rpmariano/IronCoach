import React, { useMemo, useState } from 'react';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChevronRight, Flag, Plus } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';
import { useAppStore } from '../../store';
import { CUP_EMPTY, __resetCupModuleState, cupEnrolledHintKey } from '../../store/cupSlice';
import { groupRaces, countdownLabel } from '../../utils/raceList';
import { raceDistanceLabel, formatDuration, formatTargetTimeLabel } from '../../utils/run';
import { CUP_STATUS_ICONS } from '../../utils/cupCalendar';
import GlassCard from '../shared/GlassCard';
import SectionLabel from '../shared/SectionLabel';
import { Sheet } from '../shared/Sheet';
import { AchievementIcon } from '../shared/AchievementCard';
import RaceListCard from './RaceListCard';
import * as F from '@formulas/cup.fixtures.ts';

/* "As tuas provas" no módulo Corrida (pedido 2026-09-13): todas as provas num
   sítio só, cada uma a um toque do hub.

   Fase 3 do Troféu (specs/trofeu.md §4.3, 2026-09-27): com inscrição, o
   bloco fixo da edição. Os testes de sempre correm com o relógio de verdade;
   os do Troféu fixam o dia (as jornadas das fixtures são de dez. a jul.). */

// O Supabase imitado: regista as tabelas lidas (nenhuma `cup_*` sem pista).
const net = vi.hoisted(() => ({ tables: {}, calls: [] }));
vi.mock('../../lib/supabase', () => {
  const builder = (table) => {
    const b = {};
    for (const m of ['select', 'eq', 'in', 'order', 'gte', 'lte', 'neq', 'limit', 'insert', 'delete', 'update']) b[m] = () => b;
    const result = () => Promise.resolve(net.tables[table] ?? { data: [], error: null });
    b.single = result;
    b.maybeSingle = result;
    b.then = (res, rej) => result().then(res, rej);
    return b;
  };
  return {
    supabase: {
      from: (t) => { net.calls.push(t); return builder(t); },
      rpc: (fn) => { net.calls.push(`rpc:${fn}`); return Promise.resolve({ data: null, error: null }); },
      functions: { invoke: () => Promise.resolve({ data: null, error: null }) },
    },
    invokeEdgeFunctionWithTimeout: () => Promise.resolve({ data: null, error: null }),
  };
});
// O dia: o do relógio (testes de sempre) ou um fixo (os do Troféu).
const clock = vi.hoisted(() => ({ today: null }));
vi.mock('../../lib/utils', async (importOriginal) => {
  const orig = await importOriginal();
  return {
    ...orig,
    todayISO: () => clock.today ?? orig.todayISO(),
    lisbonTodayISO: () => clock.today ?? orig.lisbonTodayISO(),
  };
});

const isoInDays = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const race = (id, days, extra = {}) => ({
  id, name: `Prova ${id}`, date: isoInDays(days), distance_km: 10, race_type: 'estrada', status: 'agendada', ...extra,
});

const montar = (raceEvents = [], runs = []) => {
  useAppStore.setState({ raceEvents, runs, profile: { id: 'user-1' }, editingRaceId: null, openCreationMode: null });
  return render(<RaceListCard />);
};

beforeEach(() => {
  clock.today = null;
  net.tables = {};
  net.calls = [];
  __resetCupModuleState();
  useAppStore.setState({ raceEvents: [], runs: [], editingRaceId: null, openCreationMode: null, session: null, cup: CUP_EMPTY, cupScreenRequest: null });
});

describe('RaceListCard', () => {
  it('sem provas, diz que não há nenhuma e deixa marcar a primeira', () => {
    montar();
    expect(screen.getByTestId('race-list-resumo')).toHaveTextContent('Ainda sem provas marcadas.');
    expect(screen.queryByTestId('race-list-ver-todas')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('race-list-nova'));
    expect(useAppStore.getState().openCreationMode).toBe('race');
  });

  it('mostra os três grupos com a contagem, e tocar numa prova abre o hub dela', () => {
    const runs = [{ id: 'run-1', race_id: 'feita', kind: 'competicao', date: isoInDays(-20), distance_km: 10, duration_seconds: 2950, details: { official_time_seconds: 2950 } }];
    montar([
      race('amanha', 1, { target_time: '50:00' }),
      race('esquecida', -3),
      race('feita', -20, { status: 'concluida' }),
    ], runs);

    expect(screen.getByTestId('race-list-resumo')).toHaveTextContent('1 por fazer · 1 por registar · 1 concluída');

    const proxima = screen.getByTestId('race-list-amanha');
    expect(proxima).toHaveTextContent('amanhã');
    expect(proxima).toHaveTextContent('objetivo 50:00');
    expect(screen.getByTestId('race-list-esquecida')).toHaveTextContent('Registar');
    expect(screen.getByTestId('race-list-feita')).toHaveTextContent('49:10');

    // Cada linha é um alvo de toque inteiro.
    expect(proxima).toHaveStyle({ minHeight: '56px' });

    fireEvent.click(screen.getByTestId('race-list-feita'));
    expect(useAppStore.getState().editingRaceId).toBe('feita');
  });

  // Relatado 2026-09-13: cinco provas agendadas, e as duas de 2027 só
  // apareciam em "Ver todas" — pareciam não existir.
  it('as próximas aparecem todas, por mais longe que estejam', () => {
    montar([1, 40, 80, 150, 180].map((d) => race(`p${d}`, d)));

    const cartao = screen.getByTestId('race-list-card');
    ['p1', 'p40', 'p80', 'p150', 'p180'].forEach((id) => expect(cartao).toHaveTextContent(`Prova ${id}`));
    expect(screen.getByTestId('race-list-resumo')).toHaveTextContent('5 por fazer');
    expect(screen.queryByTestId('race-list-ver-todas')).not.toBeInTheDocument();
  });

  // Regra do âmbar (redesenho 2026-09-15): neste separador só o cartão "Para
  // onde vou" é âmbar — a lista de provas fica em vidro neutro, datas
  // incluídas.
  it('as datas das próximas e por registar ficam em vidro neutro, não em âmbar', () => {
    montar([race('amanha', 1), race('esquecida', -3)]);
    const proxima = screen.getByTestId('race-list-amanha');
    const dateTile = proxima.querySelector('span[aria-hidden="true"]');
    expect(dateTile).toHaveStyle({ background: 'rgba(255, 255, 255, 0.06)', color: 'var(--text-2)' });
  });

  it('das concluídas ficam as três mais recentes, e o resto está em "Ver todas"', () => {
    montar([10, 20, 30, 40, 50].map((d) => race(`c${d}`, -d, { status: 'concluida' })));

    const cartao = screen.getByTestId('race-list-card');
    expect(cartao).toHaveTextContent('Prova c30');
    expect(cartao).not.toHaveTextContent('Prova c40');

    fireEvent.click(screen.getByTestId('race-list-ver-todas'));
    const persiana = screen.getByTestId('race-list-sheet');
    expect(within(persiana).getByText('Prova c50')).toBeInTheDocument();

    fireEvent.click(within(persiana).getByTestId('race-list-c50'));
    expect(useAppStore.getState().editingRaceId).toBe('c50');
  });
});

/* ── Fase 3 do Troféu ─────────────────────────────────────────────────── */

/* A lista ANTES da Fase 3 do Troféu, tal e qual (git ef3c4af,
   src/components/Run/RaceListCard.jsx, sem os comentários), com os MESMOS
   componentes partilhados (GlassCard, SectionLabel, Sheet, AchievementIcon)
   e o mesmo groupRaces sem `cup` (que raceList.test.js prova igual ao de
   antes). NÃO atualizar para acompanhar o Troféu: é a régua da invariância
   (§10, "sem inscrição, a lista é a de hoje"). Mudar a lista por outra razão
   obriga a mudar a cópia no mesmo commit — é de propósito. */
function antesDayNumber(dateIso) {
  try { return format(parseISO(dateIso), 'd'); } catch { return ''; }
}
function antesMonthShort(dateIso) {
  try { return format(parseISO(dateIso), 'MMM', { locale: pt }).replace('.', ''); } catch { return ''; }
}
function antesYearOf(dateIso) {
  return String(dateIso || '').slice(0, 4);
}
function AntesDateTile({ date, muted }) {
  return (
    <span
      aria-hidden="true"
      className="flex flex-col items-center justify-center shrink-0"
      style={{
        width: 44, height: 44, borderRadius: 12,
        background: muted ? 'var(--surface-glass)' : 'rgba(255,255,255,.06)',
        border: `1px solid ${muted ? 'var(--border-glass)' : 'var(--border-glass-strong)'}`,
        color: muted ? 'var(--text-3)' : 'var(--text-2)',
      }}
    >
      <span className="text-[15px] font-black leading-none" style={{ fontVariantNumeric: 'tabular-nums' }}>{antesDayNumber(date)}</span>
      <span className="text-[11px] font-extrabold uppercase leading-none mt-[3px]">{antesMonthShort(date)}</span>
    </span>
  );
}
function AntesRaceRow({ race, meta, trailing, muted, onOpen, testId }) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={() => onOpen(race.id)}
      className="flex items-center gap-3 w-full text-left"
      style={{ minHeight: 56, borderRadius: 16, padding: '6px 8px 6px 6px', background: 'none', border: 'none', cursor: 'pointer' }}
    >
      <AntesDateTile date={race.date} muted={muted} />
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-extrabold truncate" style={{ color: muted ? 'var(--text-2)' : 'var(--text-1)' }}>
          {race.name || 'Prova sem nome'}
        </span>
        <span className="block text-[11.5px] mt-[2px] truncate" style={{ color: 'var(--text-4)' }}>{meta}</span>
      </span>
      {trailing}
      <ChevronRight size={15} aria-hidden="true" style={{ color: 'var(--text-4)', flexShrink: 0 }} />
    </button>
  );
}
function AntesGroup({ label, tone, items, max, render }) {
  if (!items.length) return null;
  const shown = max ? items.slice(0, max) : items;
  return (
    <div className="mt-3 first:mt-0">
      <SectionLabel tone={tone} style={{ margin: '0 2px 2px' }}>{label}</SectionLabel>
      <div className="flex flex-col">{shown.map(render)}</div>
    </div>
  );
}
function RaceListCardAntesDaFase3() {
  const { raceEvents, runs, profile, setEditingRaceId, setOpenCreationMode } = useAppStore();
  const [allOpen, setAllOpen] = useState(false);
  const today = clock.today;
  const { proximas, porRegistar, concluidas, total } = useMemo(
    () => groupRaces({ raceEvents, runs, profile, today }),
    [raceEvents, runs, profile, today],
  );
  const openRace = (raceId) => {
    setAllOpen(false);
    setEditingRaceId(raceId);
  };
  const renderProxima = ({ race, days }) => (
    <AntesRaceRow
      key={race.id}
      race={race}
      testId={`race-list-${race.id}`}
      onOpen={openRace}
      meta={[raceDistanceLabel(race.distance_km), race.target_time ? `objetivo ${formatTargetTimeLabel(race.target_time)}` : null].filter(Boolean).join(' · ')}
      trailing={(
        <span className="text-[11.5px] font-extrabold shrink-0" style={{ color: days <= 7 ? 'var(--race)' : 'var(--text-3)' }}>
          {countdownLabel(days)}
        </span>
      )}
    />
  );
  const renderPorRegistar = ({ race }) => (
    <AntesRaceRow
      key={race.id}
      race={race}
      testId={`race-list-${race.id}`}
      onOpen={openRace}
      meta={[raceDistanceLabel(race.distance_km), antesYearOf(race.date)].filter(Boolean).join(' · ')}
      trailing={(
        <span
          className="inline-flex items-center text-[11px] font-extrabold uppercase shrink-0"
          style={{ height: 24, padding: '0 8px', borderRadius: 99, letterSpacing: '.04em', background: 'var(--tint-warn-bg)', border: '1px solid var(--tint-warn-bd)', color: 'var(--warn)' }}
        >
          Registar
        </span>
      )}
    />
  );
  const renderConcluida = ({ race, outcome, achievements }) => (
    <AntesRaceRow
      key={race.id}
      race={race}
      muted
      testId={`race-list-${race.id}`}
      onOpen={openRace}
      meta={[
        raceDistanceLabel(race.distance_km),
        outcome?.officialSeconds ? formatDuration(outcome.officialSeconds) : 'sem registo',
        antesYearOf(race.date),
      ].filter(Boolean).join(' · ')}
      trailing={achievements.length ? (
        <span className="flex items-center gap-1 shrink-0">
          {achievements.slice(0, 3).map((a) => <AchievementIcon key={a.key} achievement={a} size={24} />)}
        </span>
      ) : null}
    />
  );
  const hidden = Math.max(0, concluidas.length - 3);
  const resumo = total
    ? [
        proximas.length ? `${proximas.length} por fazer` : null,
        porRegistar.length ? `${porRegistar.length} por registar` : null,
        concluidas.length ? `${concluidas.length} ${concluidas.length === 1 ? 'concluída' : 'concluídas'}` : null,
      ].filter(Boolean).join(' · ')
    : 'Ainda sem provas marcadas.';
  return (
    <>
      <SectionLabel>As tuas provas</SectionLabel>
      <GlassCard padding="14px 12px 12px" data-testid="race-list-card">
        <div className="flex items-center gap-2 px-1">
          <Flag size={15} style={{ color: 'var(--text-4)' }} aria-hidden="true" />
          <p className="text-[12px] font-bold flex-1" data-testid="race-list-resumo" style={{ color: 'var(--text-3)' }}>{resumo}</p>
        </div>
        {total > 0 && (
          <div className="mt-2">
            <AntesGroup label="Próximas" items={proximas} render={renderProxima} />
            <AntesGroup label="Por registar" tone="warn" items={porRegistar} render={renderPorRegistar} />
            <AntesGroup label="Concluídas" items={concluidas} max={3} render={renderConcluida} />
          </div>
        )}
        <div className="flex gap-2 mt-3">
          {hidden > 0 && (
            <button
              type="button"
              data-testid="race-list-ver-todas"
              onClick={() => setAllOpen(true)}
              className="flex-1 inline-flex items-center justify-center rounded-[11px] text-[12.5px] font-extrabold"
              style={{ minHeight: 44, background: 'rgba(255,255,255,.05)', border: '1px solid var(--border-glass-strong)', color: 'var(--text-2)' }}
            >
              Ver todas ({total})
            </button>
          )}
          <button
            type="button"
            data-testid="race-list-nova"
            onClick={() => setOpenCreationMode('race')}
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-[11px] text-[12.5px] font-extrabold"
            style={{ minHeight: 44, background: 'rgba(255,255,255,.05)', border: '1px solid var(--border-glass-strong)', color: 'var(--text-2)' }}
          >
            <Plus size={15} aria-hidden="true" /> Marcar prova
          </button>
        </div>
      </GlassCard>
      {allOpen && (
        <Sheet eyebrow="As tuas provas" eyebrowTone="race" title={<span className="text-[12px] font-bold" style={{ color: 'var(--text-3)' }}>{resumo}</span>} onClose={() => setAllOpen(false)} testId="race-list-sheet" maxHeight="88dvh">
          <div className="pt-2 pb-1">
            <AntesGroup label="Próximas" items={proximas} render={renderProxima} />
            <AntesGroup label="Por registar" tone="warn" items={porRegistar} render={renderPorRegistar} />
            <AntesGroup label="Concluídas" items={concluidas} render={renderConcluida} />
          </div>
        </Sheet>
      )}
    </>
  );
}

const USER = 'u-lista';
const HOJE = '2027-01-20';
const EDITION = { ...F.CASCAIS_34_ABERTA, competition: F.CASCAIS_COMPETITION };
const CATALOG = {
  [EDITION.id]: {
    status: 'ready', rounds: F.CASCAIS_ROUNDS, courses: F.CASCAIS_COURSES,
    overrides: F.CASCAIS_OVERRIDES, categories: F.CASCAIS_CATEGORIES, teams: F.CASCAIS_TEAMS,
  },
};
// Treina em Cascais; M, 44 anos na J3 → M35, percurso longo (7,4 km às 9h30).
const CUP_PROFILE = { ...F.PERSONAS.cascais, id: USER };
const ENROLLMENT = { id: 'en-1', user_id: USER, edition_id: EDITION.id, status: 'ativa', season_goal: 'participar', team_id: 't-ccd', entry_by: 'atleta', bib: '4321' };
const part = (roundId, extra = {}) => ({ id: `pa-${roundId}`, enrollment_id: ENROLLMENT.id, round_id: roundId, decision: 'vou', decision_source: 'atleta', intent: null, intent_source: null, ...extra });
const PARTICIPATIONS = [
  part('r-c1'), part('r-c2'), part('r-c3', { intent: 'controlar', intent_source: 'atleta' }), part('r-c4'),
];

const jornada = (id, roundId, date, extra = {}) => ({
  id, user_id: USER, date, cup_round_id: roundId, cup_link_origin: null, race_priority: 'b',
  race_type: 'estrada', status: 'agendada', ...extra,
});
const J1 = jornada('race-j1', 'r-c1', '2026-12-06', { name: 'Padroeira', distance_km: 7, status: 'concluida' });
const J2 = jornada('race-j2', 'r-c2', '2027-01-10', { name: 'Corta-mato do NAZA', distance_km: 8, race_type: 'corta_mato' });
const J3 = jornada('race-j3', 'r-c3', '2027-01-24', { name: 'Corrida CCD Cascais', distance_km: 7.4 });
const J4 = jornada('race-j4', 'r-c4', '2027-02-21', { name: 'GP Monte Real', distance_km: 10 });
const MEIA = { id: 'meia', user_id: USER, name: 'Meia de Lisboa', date: '2027-03-21', race_priority: 'a', race_type: 'estrada', distance_km: 21.0975, status: 'agendada', target_time: '1:45:00' };
const RUN_J1 = { id: 'run-j1', race_id: 'race-j1', kind: 'competicao', date: '2026-12-06', distance_km: 7, duration_seconds: 2100, details: { official_time_seconds: 2100 } };

function cupReady(overrides = {}) {
  return { ...CUP_EMPTY, status: 'ready', userId: USER, editions: [], enrollments: [], dismissals: [], ...overrides };
}
const enrolledCup = (overrides = {}) => cupReady({ editions: [EDITION], enrollments: [ENROLLMENT], catalog: CATALOG, participations: PARTICIPATIONS, ...overrides });

// Os ids de useId mudam de uma montagem para a outra; o resto tem de ser igual.
const html = (container) => container.innerHTML.replace(/(?::r|«r|_r_)[0-9a-z]+(?::|»|_)/g, ':id:');
const cupCalls = () => net.calls.filter((t) => /^(rpc:)?(cup_|enroll_cup|update_enrollment|leave_cup|set_participation)/.test(t));
// O texto que se vê (sem o que é só para o leitor de ecrã).
const visivel = (el) => {
  const c = el.cloneNode(true);
  c.querySelectorAll('.sr-only').forEach((n) => n.remove());
  return c.textContent.replace(/\s+/g, ' ');
};

describe('RaceListCard — invariância sem inscrição (Fase 3 do Troféu, §10)', () => {
  const CONCLUIDAS = [10, 20, 30, 40, 50].map((d, i) => ({
    id: `c${d}`, user_id: USER, name: `Concluída ${d}`, date: `2026-12-${String(31 - i * 5).padStart(2, '0')}`, distance_km: 10, race_type: 'estrada', status: 'concluida',
  }));
  const NORMAIS = [
    MEIA,
    { id: 'b-futura', user_id: USER, name: 'Corrida da Linha', date: '2027-02-07', race_priority: 'b', distance_km: 10, race_type: 'estrada', status: 'agendada' },
    { id: 'esquecida', user_id: USER, name: 'São Silvestre', date: '2027-01-02', distance_km: 10, race_type: 'estrada', status: 'agendada' },
    ...CONCLUIDAS,
  ];
  // Quem saiu: as provas das jornadas que correu continuam (concluídas, com
  // cup_round_id) — não são pista de inscrição.
  const DE_QUEM_SAIU = [...NORMAIS, J1];
  const RUNS = [RUN_J1, { id: 'run-c10', race_id: 'c10', kind: 'competicao', date: CONCLUIDAS[0].date, distance_km: 10, duration_seconds: 2950, details: { official_time_seconds: 2950 } }];

  const estados = [
    ['sem nada lido (idle)', () => CUP_EMPTY],
    ['lido, sem edição nenhuma', () => cupReady()],
    ['M1 por aplicar (indisponivel)', () => ({ ...CUP_EMPTY, status: 'indisponivel', userId: USER })],
    ['convite na área (edição aberta, catálogo lido)', () => cupReady({ editions: [EDITION], catalog: CATALOG })],
    ['saiu da edição', () => cupReady({ editions: [EDITION], enrollments: [{ ...ENROLLMENT, status: 'saiu' }], catalog: CATALOG })],
  ];

  for (const [nome, provas] of [['sem provas', []], ['provas normais', NORMAIS], ['com jornadas já concluídas de quem saiu', DE_QUEM_SAIU]]) {
    for (const [estado, cup] of estados) {
      it(`${nome} · ${estado}: o HTML é o da lista antes da Fase 3, e zero leituras cup_*`, () => {
        clock.today = HOJE;
        useAppStore.setState({ session: { user: { id: USER } }, profile: CUP_PROFILE, raceEvents: provas, runs: RUNS, cup: cup() });
        const antes = render(<RaceListCardAntesDaFase3 />);
        const esperado = html(antes.container);
        antes.unmount();

        const { container } = render(<RaceListCard />);
        expect(html(container)).toBe(esperado);
        expect(cupCalls()).toEqual([]);
      });
    }
  }

  it('"Ver todas" aberto: a persiana também é a de antes', () => {
    clock.today = HOJE;
    useAppStore.setState({ session: { user: { id: USER } }, profile: CUP_PROFILE, raceEvents: DE_QUEM_SAIU, runs: RUNS, cup: cupReady({ editions: [EDITION], catalog: CATALOG }) });
    const antes = render(<RaceListCardAntesDaFase3 />);
    fireEvent.click(screen.getByTestId('race-list-ver-todas'));
    const esperado = html(screen.getByTestId('race-list-sheet'));
    antes.unmount();

    render(<RaceListCard />);
    fireEvent.click(screen.getByTestId('race-list-ver-todas'));
    expect(html(screen.getByTestId('race-list-sheet'))).toBe(esperado);
  });
});

describe('RaceListCard — com inscrição: o bloco fixo do Troféu (§4.3)', () => {
  const montarInscrito = ({ raceEvents = [J1, J2, J3, J4, MEIA], runs = [RUN_J1], cup = enrolledCup(), today = HOJE } = {}) => {
    clock.today = today;
    useAppStore.setState({
      session: { user: { id: USER } }, profile: CUP_PROFILE, raceEvents, runs, cup,
      markCupRoundNotAttended: vi.fn(async () => ({ ok: true, data: null })),
      openRaceRun: vi.fn(() => true),
    });
    return render(<RaceListCard />);
  };
  const ARIA_J3 = 'Jornada 3, Corrida CCD Cascais, domingo, 24 de janeiro. Próxima: Vou, controlar, daqui a 4 dias.';

  it('resumo: "por fazer" só das normais, "por registar" com as jornadas, e o progresso da edição', () => {
    montarInscrito();
    expect(screen.getByTestId('race-list-resumo')).toHaveTextContent('1 por fazer · 1 por registar · Troféu de Cascais 1 de 5 · 1 concluída');
  });

  it('as jornadas fixas saem das linhas normais; a próxima fica no bloco, no fim das "Próximas"', () => {
    montarInscrito();
    expect(screen.getByTestId('race-list-meia')).toBeInTheDocument();
    for (const id of ['race-j2', 'race-j3', 'race-j4']) expect(screen.queryByTestId(`race-list-${id}`)).not.toBeInTheDocument();

    const bloco = screen.getByTestId('cup-list-block');
    // No fim do grupo "Próximas", depois da principal.
    const proximas = bloco.parentElement;
    expect(proximas.lastElementChild).toBe(bloco);
    expect(proximas.firstElementChild).toBe(screen.getByTestId('race-list-meia'));

    const cabecalho = within(bloco).getByTestId('cup-list-cabecalho');
    expect(cabecalho).toHaveTextContent('Troféu de Cascais · 34.ª');
    expect(cabecalho).toHaveTextContent('1 de 5');
    // Abre o ecrã do Troféu sem modo (o calendário, ou a lista pré-marcada
    // com jornadas por decidir): "as jornadas", não "o calendário".
    expect(cabecalho).toHaveAttribute('aria-label', 'Troféu de Cascais · 34.ª: 1 de 5 jornadas feitas. Abrir as jornadas.');

    const proxima = within(bloco).getByTestId('cup-list-proxima');
    expect(visivel(proxima)).toContain('J3 · Corrida CCD Cascais');
    expect(proxima.querySelector('.sr-only')).toHaveTextContent('Jornada 3');
    expect(proxima).toHaveTextContent('daqui a 4 dias · 7,4 km às 9h30 · controlar');
    // O estado em texto, com o ícone ao lado (nunca só cor).
    const estado = within(proxima).getByTestId('cup-status');
    expect(estado).toHaveTextContent('Vou');
    expect(estado.querySelector('[aria-hidden="true"]')).toHaveTextContent('✓');

    // J3 é a próxima; J4 e J5 (sem data) estão no calendário.
    expect(within(bloco).getByTestId('cup-list-mais')).toHaveTextContent('+2 no calendário');
    expect(within(bloco).getByTestId('cup-list-mais')).toHaveAttribute('aria-label', 'Ver as outras 2 jornadas no calendário (Troféu de Cascais)');
  });

  it('acessibilidade: a linha lê-se pela frase da régua, e os alvos têm 56/44 px', () => {
    montarInscrito();
    const proxima = screen.getByRole('button', { name: ARIA_J3 });
    expect(proxima).toBe(screen.getByTestId('cup-list-proxima'));
    expect(proxima).toHaveStyle({ minHeight: '56px' });
    // O resto (quando, distância, papel) fica como descrição.
    expect(proxima).toHaveAccessibleDescription('daqui a 4 dias · 7,4 km às 9h30 · controlar');
    expect(screen.getByTestId('cup-list-cabecalho')).toHaveStyle({ minHeight: '44px' });
    expect(screen.getByTestId('cup-list-mais')).toHaveStyle({ minHeight: '44px' });
    expect(screen.getByTestId('cup-list-registar-race-j2-abrir')).toHaveStyle({ minHeight: '56px' });
    expect(screen.getByTestId('cup-list-registar-race-j2-registar')).toHaveStyle({ minHeight: '44px' });
    expect(screen.getByTestId('cup-list-registar-race-j2-nao-fui')).toHaveStyle({ minHeight: '44px' });
    // Só os quatro ícones da régua.
    for (const el of screen.getByTestId('cup-list-block').querySelectorAll('[data-testid="cup-status"] [aria-hidden="true"]')) {
      expect(CUP_STATUS_ICONS).toContain(el.textContent);
    }
    // O chip "J1" lê-se "Jornada 1".
    const chip = within(screen.getByTestId('race-list-race-j1')).getByTestId('cup-jornada-chip');
    expect(chip.querySelector('[aria-hidden="true"]')).toHaveTextContent('J1');
    expect(chip.querySelector('.sr-only')).toHaveTextContent('Jornada 1');
  });

  it('com a data mudada, a linha diz "mudou de 17 para 24 jan" (e o leitor de ecrã também)', () => {
    const rounds = F.CASCAIS_ROUNDS.map((r) => (r.id === 'r-c3' ? { ...r, previous_date: '2027-01-17' } : r));
    montarInscrito({ cup: enrolledCup({ catalog: { [EDITION.id]: { ...CATALOG[EDITION.id], rounds } } }) });
    expect(screen.getByTestId('cup-list-mudou')).toHaveTextContent('mudou de 17 para 24 jan');
    expect(screen.getByTestId('cup-list-proxima')).toHaveAccessibleDescription('daqui a 4 dias · 7,4 km às 9h30 · controlar mudou de 17 para 24 jan');
  });

  it('tocar na próxima abre o hub da prova dela; o cabeçalho pede o Troféu sem modo (o ecrã decide) e "+N" o calendário', () => {
    montarInscrito();
    fireEvent.click(screen.getByTestId('cup-list-proxima'));
    expect(useAppStore.getState().editingRaceId).toBe('race-j3');

    useAppStore.setState({ editingRaceId: null, openCreationMode: null });
    fireEvent.click(screen.getByTestId('cup-list-cabecalho'));
    // Revisão da Fase 3 (§4.3): com jornadas por decidir, o ecrã abre na
    // lista pré-marcada — o cabeçalho não o força ao calendário.
    expect(useAppStore.getState().cupScreenRequest).toMatchObject({ roundId: null, mode: null });

    useAppStore.setState({ cupScreenRequest: null });
    fireEvent.click(screen.getByTestId('cup-list-mais'));
    expect(useAppStore.getState().cupScreenRequest).toMatchObject({ roundId: null, mode: 'calendario' });
  });

  it('"Próximas" aparece só com o bloco quando não há outras provas por fazer', () => {
    montarInscrito({ raceEvents: [J3, J4] });
    expect(screen.getByText('Próximas')).toBeInTheDocument();
    expect(screen.getByTestId('cup-list-proxima')).toBeInTheDocument();
    expect(screen.getByTestId('race-list-resumo')).toHaveTextContent('Troféu de Cascais 0 de 5');
    expect(screen.getByTestId('race-list-resumo')).not.toHaveTextContent('por fazer');
  });

  it('inscrito e sem provas nenhumas: o bloco aparece na mesma', () => {
    montarInscrito({ raceEvents: [], runs: [] });
    expect(screen.getByTestId('cup-list-block')).toBeInTheDocument();
    expect(screen.getByTestId('race-list-resumo')).toHaveTextContent('Troféu de Cascais 0 de 5');
  });

  it('a próxima sem prova (sem data): azulejo "J5 / —", e o toque abre a jornada no Troféu', () => {
    // A 1 de março, J1–J4 já passaram; a próxima é a J5, sem data.
    montarInscrito({ today: '2027-03-01', raceEvents: [{ ...J1, status: 'agendada' }, J2, J3, J4], runs: [] });
    const proxima = screen.getByTestId('cup-list-proxima');
    expect(visivel(proxima)).toContain('J5 · GP Os Galgos Audazes');
    expect(proxima).toHaveTextContent('data por anunciar');
    expect(proxima).toHaveTextContent('Por decidir');
    expect(proxima.querySelector('span[aria-hidden="true"]')).toHaveTextContent('J5—');
    expect(screen.queryByTestId('cup-list-mais')).not.toBeInTheDocument();
    fireEvent.click(proxima);
    expect(useAppStore.getState().cupScreenRequest).toMatchObject({ roundId: 'r-c5', mode: 'calendario' });
    expect(useAppStore.getState().editingRaceId).toBeNull();
  });

  it('"Por registar": no máximo duas jornadas, a mais recente primeiro, e "+N por registar ›"', () => {
    montarInscrito({ today: '2027-03-01', raceEvents: [{ ...J1, status: 'agendada' }, J2, J3, J4, MEIA], runs: [] });
    const rows = screen.getAllByTestId(/^cup-list-registar-race-j\d$/);
    expect(rows.map((r) => r.dataset.testid)).toEqual(['cup-list-registar-race-j4', 'cup-list-registar-race-j3']);
    expect(visivel(rows[0])).toContain('J4 · GP Monte Real');
    // A linha lê-se pela frase da régua; os botões dizem de que jornada são.
    expect(screen.getByRole('button', { name: 'Jornada 4, GP Monte Real, domingo, 21 de fevereiro. Por registar.' })).toBe(screen.getByTestId('cup-list-registar-race-j4-abrir'));
    expect(screen.getByTestId('cup-list-registar-race-j4-registar')).toHaveAccessibleName('Registar: Jornada 4, GP Monte Real');
    expect(screen.getByTestId('cup-list-registar-race-j4-nao-fui')).toHaveAccessibleName('Não fui: Jornada 4, GP Monte Real');
    expect(rows[0]).toHaveTextContent('10 km · já passou');
    expect(screen.getByTestId('race-list-resumo')).toHaveTextContent('4 por registar');
    const mais = screen.getByTestId('cup-list-registar-mais');
    expect(mais).toHaveTextContent('+2 por registar');
    expect(mais).toHaveStyle({ minHeight: '44px' });
    fireEvent.click(mais);
    expect(useAppStore.getState().cupScreenRequest).toMatchObject({ mode: 'calendario' });
  });

  it('[Registar] abre o registo da prova da jornada; a linha abre o hub', () => {
    montarInscrito();
    fireEvent.click(screen.getByTestId('cup-list-registar-race-j2-registar'));
    expect(useAppStore.getState().openRaceRun).toHaveBeenCalledWith('race-j2');
    fireEvent.click(screen.getByTestId('cup-list-registar-race-j2-abrir'));
    expect(useAppStore.getState().editingRaceId).toBe('race-j2');
  });

  it('[Não fui] pede confirmação; só "Não fui" do diálogo grava, uma vez', async () => {
    montarInscrito();
    const markCupRoundNotAttended = useAppStore.getState().markCupRoundNotAttended;
    fireEvent.click(screen.getByTestId('cup-list-registar-race-j2-nao-fui'));
    const dialogo = screen.getByTestId('cup-nao-fui-dialog');
    expect(dialogo).toHaveTextContent('Não foste à jornada 2?');
    expect(markCupRoundNotAttended).not.toHaveBeenCalled();

    fireEvent.click(within(dialogo).getByTestId('cup-nao-fui-cancelar'));
    await waitFor(() => expect(screen.queryByTestId('cup-nao-fui-dialog')).not.toBeInTheDocument());
    expect(markCupRoundNotAttended).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('cup-list-registar-race-j2-nao-fui'));
    fireEvent.click(within(screen.getByTestId('cup-nao-fui-dialog')).getByTestId('cup-nao-fui-confirmar'));
    await waitFor(() => expect(markCupRoundNotAttended).toHaveBeenCalledTimes(1));
    expect(markCupRoundNotAttended).toHaveBeenCalledWith('r-c2');
    // Nada foi à rede por aqui: a ação é do store.
    expect(cupCalls()).toEqual([]);
  });

  it('com corrida ligada, não há "Não fui" (ele foi)', () => {
    const run = { id: 'run-j2', race_id: 'race-j2', kind: 'competicao', date: '2027-01-10', distance_km: 8, duration_seconds: 2400 };
    montarInscrito({ runs: [RUN_J1, run] });
    expect(screen.getByTestId('cup-list-registar-race-j2-registar')).toBeInTheDocument();
    expect(screen.queryByTestId('cup-list-registar-race-j2-nao-fui')).not.toBeInTheDocument();
  });

  it('concluídas: a jornada fica na linha dela com o chip, e o limite de três não muda', () => {
    const outras = ['2026-11-20', '2026-11-10', '2026-11-01'].map((date, i) => ({ id: `c${i}`, user_id: USER, name: `Concluída ${i}`, date, distance_km: 10, race_type: 'estrada', status: 'concluida' }));
    montarInscrito({ raceEvents: [J1, J3, ...outras] });
    const cartao = screen.getByTestId('race-list-card');
    // J1 (6 dez) é a mais recente: fica à vista, com o chip; a mais antiga vai para "Ver todas".
    expect(within(screen.getByTestId('race-list-race-j1')).getByTestId('cup-jornada-chip')).toBeInTheDocument();
    expect(cartao).toHaveTextContent('Concluída 1');
    expect(cartao).not.toHaveTextContent('Concluída 2');
    expect(screen.getByTestId('race-list-ver-todas')).toHaveTextContent('Ver todas (5)');
    // As normais não levam chip.
    expect(within(screen.getByTestId('race-list-c0')).queryByTestId('cup-jornada-chip')).not.toBeInTheDocument();
  });

  it('uma jornada promovida a principal fica nas "Próximas" normais, com o chip', () => {
    montarInscrito({ raceEvents: [J1, J2, { ...J3, race_priority: 'a' }, J4, MEIA] });
    const linha = screen.getByTestId('race-list-race-j3');
    expect(within(linha).getByTestId('cup-jornada-chip')).toHaveTextContent('J3');
    expect(screen.getByTestId('race-list-resumo')).toHaveTextContent('2 por fazer');
  });

  /* Revisão da Fase 3: a promovida aparecia duas vezes — na linha normal e
     outra vez como "a próxima" do bloco. O bloco passa à seguinte; o "+N"
     continua a contar todas as que faltam, a promovida incluída (também
     está no calendário). */
  it('a promovida não se repete no bloco: a próxima do bloco é a seguinte', () => {
    montarInscrito({ raceEvents: [J1, J2, { ...J3, race_priority: 'a' }, J4, MEIA] });
    const bloco = screen.getByTestId('cup-list-block');
    expect(within(bloco).queryByText(/Corrida CCD Cascais/)).not.toBeInTheDocument();
    expect(visivel(within(bloco).getByTestId('cup-list-proxima'))).toContain('J4 · GP Monte Real');
    expect(screen.getAllByText(/Corrida CCD Cascais/)).toHaveLength(1);
    // J3 (nas linhas), J4 (no bloco) e J5: +2 no calendário.
    expect(within(bloco).getByTestId('cup-list-mais')).toHaveTextContent('+2 no calendário');
  });

  it('todas as que faltam já estão nas linhas normais: o bloco não repete nenhuma, só o "+N"', () => {
    // A 1 de março a J5 (sem data) é a única que falta; promovida, está nas linhas.
    const j5 = jornada('race-j5', 'r-c5', '2027-06-20', { name: 'GP Os Galgos Audazes', distance_km: 10, race_priority: 'a' });
    const rounds = F.CASCAIS_ROUNDS.map((r) => (r.id === 'r-c5' ? { ...r, date: '2027-06-20', date_status: 'confirmada' } : r));
    montarInscrito({
      today: '2027-03-01', raceEvents: [{ ...J1, status: 'concluida' }, j5], runs: [RUN_J1],
      cup: enrolledCup({ catalog: { [EDITION.id]: { ...CATALOG[EDITION.id], rounds } }, participations: [...PARTICIPATIONS, part('r-c5')] }),
    });
    expect(screen.getByTestId('race-list-race-j5')).toBeInTheDocument();
    const bloco = screen.getByTestId('cup-list-block');
    expect(within(bloco).queryByTestId('cup-list-proxima')).not.toBeInTheDocument();
    // E não diz que não há mais (há: está logo acima).
    expect(within(bloco).queryByTestId('cup-list-sem-proxima')).not.toBeInTheDocument();
    expect(within(bloco).getByTestId('cup-list-mais')).toHaveTextContent('+1 no calendário');
  });

  it('"Ver todas": o mesmo agrupamento (bloco e limite de dois incluídos), e abrir o Troféu fecha a persiana', () => {
    const outras = ['2026-11-20', '2026-11-10', '2026-11-01', '2026-10-20'].map((date, i) => ({ id: `c${i}`, user_id: USER, name: `Concluída ${i}`, date, distance_km: 10, race_type: 'estrada', status: 'concluida' }));
    montarInscrito({ today: '2027-03-01', raceEvents: [{ ...J1, status: 'agendada' }, J2, J3, J4, MEIA, ...outras], runs: [] });
    fireEvent.click(screen.getByTestId('race-list-ver-todas'));
    const persiana = screen.getByTestId('race-list-sheet');
    expect(within(persiana).getByTestId('cup-list-block')).toBeInTheDocument();
    expect(within(persiana).getAllByTestId(/^cup-list-registar-race-j\d$/)).toHaveLength(2);
    fireEvent.click(within(persiana).getByTestId('cup-list-cabecalho'));
    expect(screen.queryByTestId('race-list-sheet')).not.toBeInTheDocument();
    expect(useAppStore.getState().cupScreenRequest).toMatchObject({ mode: null });
  });

  it('com a pista e a leitura a correr: as jornadas já não estão nas linhas normais e o bloco diz "A ler o calendário…"; sem inscrição afinal, tudo volta', async () => {
    clock.today = HOJE;
    localStorage.setItem(cupEnrolledHintKey(USER), '1');
    net.tables.cup_editions = { data: [], error: null };
    useAppStore.setState({ session: { user: { id: USER } }, profile: CUP_PROFILE, raceEvents: [J3, MEIA], runs: [], cup: CUP_EMPTY });
    render(<RaceListCard />);
    expect(screen.getByTestId('cup-list-sem-proxima')).toHaveTextContent('A ler o calendário…');
    // Um estado: o leitor de ecrã ouve-o (revisão da Fase 3, aviso [e]).
    expect(screen.getByRole('status')).toBe(screen.getByTestId('cup-list-sem-proxima'));
    expect(screen.queryByTestId('race-list-race-j3')).not.toBeInTheDocument();

    await waitFor(() => expect(useAppStore.getState().cup.status).toBe('ready'));
    // Pista velha: não está inscrito — a lista volta a ser a de sempre.
    await waitFor(() => expect(screen.queryByTestId('cup-list-block')).not.toBeInTheDocument());
    expect(screen.getByTestId('race-list-race-j3')).toBeInTheDocument();
  });

  it('catálogo em erro: nenhuma jornada fica presa no bloco, e o bloco di-lo', () => {
    montarInscrito({ cup: enrolledCup({ catalog: { [EDITION.id]: { status: 'erro', rounds: [], courses: [], overrides: [], categories: [], teams: [] } } }) });
    expect(screen.getByTestId('race-list-race-j3')).toBeInTheDocument();
    expect(screen.getByTestId('cup-list-sem-proxima')).toHaveTextContent('Não consegui ler o calendário.');
    expect(screen.getByTestId('cup-list-sem-proxima')).toHaveAttribute('role', 'status');
  });

  it('nunca mostra o dorsal', () => {
    montarInscrito();
    expect(document.body.textContent).not.toContain('4321');
  });
});
