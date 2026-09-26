import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
