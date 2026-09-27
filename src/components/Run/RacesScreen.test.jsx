import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAppStore } from '../../store';
import { CUP_EMPTY, __resetCupModuleState } from '../../store/cupSlice';
import RacesScreen from './RacesScreen';
import RaceCard from '../Home/RaceCard';
import RaceListCard from './RaceListCard';
import SectionLabel from '../shared/SectionLabel';
import CoachInsightsDock from '../BI/CoachInsightsDock';
import * as F from '@formulas/cup.fixtures.ts';

/* O separador Provas (2026-09-13, opção A de "Onde vivem as provas"): a
   próxima prova e todas as provas por grupos. O Palmarés, que vivia aqui
   entre os dois, mudou-se para o separador "Vitrina" do Perfil (2026-09-22,
   fase 1 da reforma da gamificação — ver Perfil.test.jsx para a cobertura
   dos medalhões e das provas concluídas que este ficheiro tinha).

   Desde 2026-09-26 (specs/trofeu.md §4.1, Fase 1) o ecrã também monta
   useCup() e, no fim, o cartão do Troféu — SÓ quando o hook diz que a porta
   se aplica.

   INVARIÂNCIA (§10, revisão da Fase 1, 2026-09-26). Não chega confirmar que
   o cartão não aparece: uma mudança no DOM fora do cartão passava. Os testes
   de invariância comparam o HTML inteiro do ecrã com o de antes da Fase 1
   (RacesScreenAntesDoTrofeu, abaixo — cópia congelada do ecrã em 35913b9,
   com os MESMOS componentes filhos, para a régua não depender do que outras
   sessões mudarem neles) e deixam o hook correr a sério, com o Supabase
   imitado: idle → loading → ready/indisponivel. Mudar o ecrã de Provas por
   outra razão obriga a mudar a cópia no mesmo commit — é de propósito. */

// O Supabase imitado: cada tabela devolve o que o teste puser em `net`.
const net = { tables: {} };
function builder(table) {
  const b = {};
  for (const m of ['select', 'eq', 'in', 'order', 'gte', 'lte', 'neq', 'limit', 'insert', 'delete', 'update']) b[m] = () => b;
  const result = () => Promise.resolve(net.tables[table] ?? { data: [], error: null });
  b.single = result;
  b.maybeSingle = result;
  b.then = (res, rej) => result().then(res, rej);
  return b;
}
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (t) => builder(t),
    rpc: () => Promise.resolve({ data: null, error: null }),
    functions: { invoke: () => Promise.resolve({ data: null, error: null }) },
  },
  invokeEdgeFunctionWithTimeout: () => Promise.resolve({ data: null, error: null }),
}));

/* Fase 3 (2026-09-27): o ecrã do Troféu e o da inscrição são de outros
   testes (CupTrofeuScreen.test.jsx, CupEnrollmentScreen.test.jsx). Aqui só
   interessa QUE se abrem e COMO (os props): no lugar deles, uma marca. */
vi.mock('./CupTrofeuScreen', () => ({
  default: ({ initialMode, focusRoundId, onClose }) => (
    <div data-testid="cup-trofeu-screen" data-mode={initialMode ?? ''} data-round={focusRoundId ?? ''}>
      <button type="button" data-testid="cup-trofeu-fechar" onClick={onClose}>Fechar</button>
    </div>
  ),
}));
vi.mock('./CupEnrollmentScreen', () => ({
  SEASON_GOALS: [],
  default: ({ onEnrolled }) => (
    <div data-testid="cup-enrollment-screen">
      <button type="button" data-testid="cup-enrollment-feita" onClick={onEnrolled}>Inscrito</button>
    </div>
  ),
}));
// O dia: o do relógio, ou um fixo nos testes da Fase 3.
const clock = vi.hoisted(() => ({ today: null }));
vi.mock('../../lib/utils', async (importOriginal) => {
  const orig = await importOriginal();
  return {
    ...orig,
    todayISO: () => clock.today ?? orig.todayISO(),
    lisbonTodayISO: () => clock.today ?? orig.lisbonTodayISO(),
  };
});

/* O ecrã de Provas ANTES da Fase 1 do Troféu, tal e qual (git 35913b9,
   src/components/Run/RacesScreen.jsx, sem os comentários). NÃO atualizar
   para acompanhar o Troféu: é a régua da invariância. */
function RacesScreenAntesDoTrofeu() {
  const { raceEvents, runs, profile, setEditingRaceId, setOpenCreationMode } = useAppStore();
  const createRace = () => setOpenCreationMode('race');
  const registerRace = (raceId) => useAppStore.getState().openRaceRun(raceId);
  return (
    <div className="flex flex-col gap-2 fade-in pb-2" data-testid="races-screen">
      <h2 className="sr-only">As tuas provas</h2>

      <SectionLabel>Para onde vou</SectionLabel>
      <RaceCard
        raceEvents={raceEvents}
        runs={runs}
        profile={profile}
        onOpenRace={setEditingRaceId}
        onCreateRace={createRace}
        onRegisterRace={registerRace}
      />

      <div className="flex flex-col gap-2" style={{ marginTop: 6 }}>
        <RaceListCard />
      </div>

      <CoachInsightsDock />
    </div>
  );
}

const PROFILE = { id: 'user-1', display_name: 'Atleta' };
const MEIA = {
  id: 'meia', user_id: PROFILE.id, name: 'Meia de Lisboa', date: '2027-03-21', race_priority: 'a',
  race_type: 'estrada', distance_km: 21.0975, status: 'agendada', location: 'Lisboa',
  target_time: '1:45:00', target_time_seconds: 6300, target_pace_seconds_per_km: 299,
};

function cupReady(overrides = {}) {
  return { ...CUP_EMPTY, status: 'ready', userId: PROFILE.id, editions: [], enrollments: [], dismissals: [], ...overrides };
}

// Os ids de useId mudam de uma montagem para a outra; o resto tem de ser igual.
const html = (container) => container.innerHTML.replace(/:r[0-9a-z]+:/g, ':id:');

function baseline() {
  const { container, unmount } = render(<RacesScreenAntesDoTrofeu />);
  const out = html(container);
  unmount();
  return out;
}

describe('Provas — o ecrã junta a próxima prova e a lista', () => {
  beforeEach(() => {
    net.tables = {};
    __resetCupModuleState();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    useAppStore.setState({
      session: null,
      profile: PROFILE, raceEvents: [], runs: [], coachPlans: [], coachPlanItems: [],
      editingRaceId: null, openCreationMode: null,
      cup: cupReady(),
      dismissCupEdition: vi.fn(),
    });
  });

  it('sem provas, convida a marcar a primeira', () => {
    render(<RacesScreen />);
    expect(screen.getByTestId('races-screen')).toBeInTheDocument();
    expect(screen.getByTestId('race-card-empty')).toBeInTheDocument();
    expect(screen.getByTestId('race-list-resumo')).toHaveTextContent('Ainda sem provas marcadas.');
    // Aqui não há "Todas as provas": já se está nelas.
    expect(screen.queryByTestId('race-card-all')).not.toBeInTheDocument();
    // A coleção não vive aqui — é a Vitrina, no Perfil.
    expect(screen.queryByTestId('badges-card')).not.toBeInTheDocument();
  });

  describe('invariância: sem inscrição nem porta, o HTML é o de antes da Fase 1', () => {
    for (const [nome, raceEvents] of [['sem provas', []], ['com uma principal', [MEIA]]]) {
      it(`${nome}: idle → loading → ready (sem edição aberta) — o hook corre a sério`, async () => {
        useAppStore.setState({ raceEvents, cup: CUP_EMPTY });
        const antes = baseline();
        net.tables.cup_editions = { data: [], error: null };
        const { container } = render(<RacesScreen />);
        // Logo ao montar: a fatia ainda está idle/loading.
        expect(['idle', 'loading']).toContain(useAppStore.getState().cup.status);
        expect(html(container)).toBe(antes);
        await waitFor(() => expect(useAppStore.getState().cup.status).toBe('ready'));
        expect(html(container)).toBe(antes);
        expect(screen.queryByTestId('cup-door-card')).not.toBeInTheDocument();
      });
    }

    it('M1 por aplicar (42P01): fica indisponivel e o ecrã igual', async () => {
      useAppStore.setState({ raceEvents: [MEIA], cup: CUP_EMPTY });
      const antes = baseline();
      net.tables.cup_editions = { data: null, error: { code: '42P01', message: 'relation "public.cup_editions" does not exist' } };
      const { container } = render(<RacesScreen />);
      expect(html(container)).toBe(antes);
      await waitFor(() => expect(useAppStore.getState().cup.status).toBe('indisponivel'));
      expect(html(container)).toBe(antes);
    });

    it('ready com a edição ainda por anunciar, ou aberta mas dispensada: ecrã igual', () => {
      // A régua com o MESMO perfil e as mesmas provas (o "Para onde vou" lê-os).
      useAppStore.setState({ raceEvents: [MEIA], profile: { ...PROFILE, ...F.PERSONAS.cascais, id: PROFILE.id } });
      const antes = baseline();

      useAppStore.setState({ cup: cupReady({ editions: [{ ...F.CASCAIS_34, competition: F.CASCAIS_COMPETITION }] }) });
      const a = render(<RacesScreen />);
      expect(html(a.container)).toBe(antes);
      a.unmount();

      const aberta = { ...F.CASCAIS_34_ABERTA, competition: F.CASCAIS_COMPETITION };
      useAppStore.setState({ cup: cupReady({ editions: [aberta], dismissals: [aberta.id] }) });
      const b = render(<RacesScreen />);
      expect(html(b.container)).toBe(antes);
    });
  });

  it('convite: com uma edição aberta na área, mostra o cartão do Troféu no fim do ecrã', () => {
    const editionId = F.CASCAIS_34_ABERTA.id;
    useAppStore.setState({
      profile: { ...PROFILE, ...F.PERSONAS.cascais, id: PROFILE.id },
      cup: cupReady({
        editions: [{ ...F.CASCAIS_34_ABERTA, competition: F.CASCAIS_COMPETITION }],
        catalog: {
          [editionId]: {
            status: 'ready', rounds: F.CASCAIS_ROUNDS, courses: F.CASCAIS_COURSES,
            overrides: F.CASCAIS_OVERRIDES, categories: F.CASCAIS_CATEGORIES, teams: F.CASCAIS_TEAMS,
          },
        },
      }),
    });
    render(<RacesScreen />);
    expect(screen.getByTestId('cup-door-card')).toBeInTheDocument();
    // §4.1: o nome completo com o número da edição.
    expect(screen.getByTestId('cup-door-card')).toHaveTextContent('34.º Troféu de Atletismo de Cascais');
    expect(screen.getByTestId('cup-door-inscrever')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('cup-door-nao-interessa'));
    expect(useAppStore.getState().dismissCupEdition).toHaveBeenCalledWith(editionId);
  });
});

/* Fase 3 do Troféu (specs/trofeu.md §4.3): o bloco fixo na lista, e o ecrã
   do Troféu aberto de outros ecrãs por um pedido no store. */
describe('Provas — o Troféu com inscrição (Fase 3)', () => {
  const EDITION = { ...F.CASCAIS_34_ABERTA, competition: F.CASCAIS_COMPETITION };
  const CATALOG = {
    [EDITION.id]: {
      status: 'ready', rounds: F.CASCAIS_ROUNDS, courses: F.CASCAIS_COURSES,
      overrides: F.CASCAIS_OVERRIDES, categories: F.CASCAIS_CATEGORIES, teams: F.CASCAIS_TEAMS,
    },
  };
  const ENROLLMENT = { id: 'en-1', user_id: PROFILE.id, edition_id: EDITION.id, status: 'ativa', season_goal: 'participar', team_id: 't-ccd', entry_by: 'atleta' };
  const CUP_PROFILE = { ...PROFILE, ...F.PERSONAS.cascais, id: PROFILE.id };
  const J3 = {
    id: 'race-j3', user_id: PROFILE.id, name: 'Corrida CCD Cascais', date: '2027-01-24', cup_round_id: 'r-c3',
    race_priority: 'b', race_type: 'estrada', distance_km: 7.4, status: 'agendada',
  };
  const inscrito = (overrides = {}) => cupReady({
    editions: [EDITION], enrollments: [ENROLLMENT], catalog: CATALOG,
    participations: [{ id: 'pa-3', enrollment_id: ENROLLMENT.id, round_id: 'r-c3', decision: 'vou', decision_source: 'atleta' }],
    ...overrides,
  });
  const convite = () => cupReady({ editions: [EDITION], catalog: CATALOG });
  // Um pedido de outro ecrã, como o store o grava (requestCupScreen): com o
  // instante e o dono.
  const pedido = (extra = {}) => ({ roundId: 'r-c3', mode: 'calendario', at: Date.now(), userId: PROFILE.id, ...extra });

  beforeEach(() => {
    net.tables = {};
    __resetCupModuleState();
    clock.today = '2027-01-20';
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    useAppStore.setState({
      session: null, profile: CUP_PROFILE, raceEvents: [MEIA, J3], runs: [], coachPlans: [], coachPlanItems: [],
      editingRaceId: null, openCreationMode: null, cupScreenRequest: null,
      cup: inscrito(), dismissCupEdition: vi.fn(),
    });
  });

  it('inscrito: a lista tem o bloco fixo e a porta do fim do ecrã sai (seria a mesma jornada duas vezes)', () => {
    render(<RacesScreen />);
    expect(screen.getByTestId('cup-list-block')).toBeInTheDocument();
    expect(screen.queryByTestId('cup-door-card')).not.toBeInTheDocument();
    // A jornada não aparece nas linhas normais nem no carrossel.
    expect(screen.queryByTestId('race-list-race-j3')).not.toBeInTheDocument();
    expect(screen.getByTestId('race-card')).toHaveTextContent('Meia de Lisboa');
    expect(screen.getByTestId('race-card-cup-line')).toHaveTextContent('J3 Corrida CCD Cascais');
  });

  it('o convite continua igual: a porta no fim, sem bloco', () => {
    useAppStore.setState({ cup: convite() });
    render(<RacesScreen />);
    expect(screen.getByTestId('cup-door-card')).toHaveTextContent('34.º Troféu de Atletismo de Cascais');
    expect(screen.queryByTestId('cup-list-block')).not.toBeInTheDocument();
    expect(screen.queryByTestId('race-card-cup-line')).not.toBeInTheDocument();
  });

  it('um pedido de outro ecrã (a migalha do hub, a linha do Início) abre o Troféu onde foi pedido e limpa-se', async () => {
    useAppStore.setState({ cupScreenRequest: pedido() });
    render(<RacesScreen />);
    const ecra = await screen.findByTestId('cup-trofeu-screen');
    expect(ecra).toHaveAttribute('data-mode', 'calendario');
    expect(ecra).toHaveAttribute('data-round', 'r-c3');
    expect(useAppStore.getState().cupScreenRequest).toBeNull();

    fireEvent.click(screen.getByTestId('cup-trofeu-fechar'));
    expect(screen.queryByTestId('cup-trofeu-screen')).not.toBeInTheDocument();
  });

  /* Revisão da Fase 3 (§4.3: a lista pré-marcada "logo a seguir à
     inscrição e sempre que sai o calendário"): o cabeçalho do bloco abre o
     Troféu SEM modo — o ecrã decide, e com jornadas por decidir é a lista
     pré-marcada. Só o "+N no calendário" força o calendário. */
  it('o cabeçalho do bloco abre o Troféu sem modo (o ecrã decide); "+N no calendário" abre-o no calendário', async () => {
    render(<RacesScreen />);
    fireEvent.click(screen.getByTestId('cup-list-cabecalho'));
    const ecra = await screen.findByTestId('cup-trofeu-screen');
    expect(ecra).toHaveAttribute('data-mode', '');
    expect(ecra).toHaveAttribute('data-round', '');
    expect(useAppStore.getState().cupScreenRequest).toBeNull();

    fireEvent.click(screen.getByTestId('cup-trofeu-fechar'));
    fireEvent.click(screen.getByTestId('cup-list-mais'));
    expect(await screen.findByTestId('cup-trofeu-screen')).toHaveAttribute('data-mode', 'calendario');
  });

  /* Revisão da Fase 3: o pedido não fica pendurado. Um toque no Início de
     quem saiu de Provas antes de a leitura acabar abria o Troféu sozinho
     horas depois; e a conta seguinte no mesmo telemóvel herdava-o. */
  it('um pedido velho (mais de 30 s) ou de outra conta deita-se fora sem abrir nada', async () => {
    useAppStore.setState({ cupScreenRequest: pedido({ at: Date.now() - 31 * 1000 }) });
    const { unmount } = render(<RacesScreen />);
    await waitFor(() => expect(useAppStore.getState().cupScreenRequest).toBeNull());
    expect(screen.queryByTestId('cup-trofeu-screen')).not.toBeInTheDocument();
    unmount();

    useAppStore.setState({ cupScreenRequest: pedido({ userId: 'outra-conta' }) });
    render(<RacesScreen />);
    await waitFor(() => expect(useAppStore.getState().cupScreenRequest).toBeNull());
    expect(screen.queryByTestId('cup-trofeu-screen')).not.toBeInTheDocument();
  });

  it('sem inscrição, lida a competição, o pedido limpa-se e nada abre', async () => {
    useAppStore.setState({ cup: convite(), cupScreenRequest: pedido() });
    render(<RacesScreen />);
    await waitFor(() => expect(useAppStore.getState().cupScreenRequest).toBeNull());
    expect(screen.queryByTestId('cup-trofeu-screen')).not.toBeInTheDocument();
  });

  it('com a leitura ainda a correr, o pedido espera por ela', async () => {
    net.tables.cup_editions = { data: [EDITION], error: null };
    net.tables.cup_enrollments = { data: [ENROLLMENT], error: null };
    net.tables.cup_participations = { data: [], error: null };
    net.tables.cup_rounds = { data: F.CASCAIS_ROUNDS, error: null };
    net.tables.cup_categories = { data: F.CASCAIS_CATEGORIES, error: null };
    net.tables.cup_teams = { data: F.CASCAIS_TEAMS, error: null };
    net.tables.cup_round_courses = { data: F.CASCAIS_COURSES, error: null };
    net.tables.cup_round_course_overrides = { data: F.CASCAIS_OVERRIDES, error: null };
    useAppStore.setState({ cup: CUP_EMPTY, cupScreenRequest: pedido({ roundId: null }) });
    render(<RacesScreen />);
    expect(useAppStore.getState().cupScreenRequest).not.toBeNull();
    expect(await screen.findByTestId('cup-trofeu-screen')).toHaveAttribute('data-mode', 'calendario');
    expect(useAppStore.getState().cupScreenRequest).toBeNull();
  });

  it('logo a seguir à inscrição, o Troféu abre em "decidir" (§4.2)', () => {
    useAppStore.setState({ cup: convite() });
    render(<RacesScreen />);
    fireEvent.click(screen.getByTestId('cup-door-inscrever'));
    expect(screen.getByTestId('cup-enrollment-screen')).toBeInTheDocument();
    // A inscrição gravou-se (o store já a tem) e o ecrã da inscrição avisa.
    act(() => { useAppStore.setState({ cup: inscrito() }); });
    fireEvent.click(screen.getByTestId('cup-enrollment-feita'));
    expect(screen.getByTestId('cup-trofeu-screen')).toHaveAttribute('data-mode', 'decidir');
  });
});
