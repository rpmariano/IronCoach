import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import RaceCard from './RaceCard';
import RaceCardAntesDaFase3 from '../../test/RaceCardAntesDaFase3';
import { todayISO } from '../../lib/utils';
import { useAppStore } from '../../store';
import { CUP_EMPTY, __resetCupModuleState, cupEnrolledHintKey } from '../../store/cupSlice';
import * as F from '@formulas/cup.fixtures.ts';

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
// O dia: o do relógio (testes de sempre) ou um fixo (os do Troféu, cujas
// jornadas são de dezembro a julho).
const clock = vi.hoisted(() => ({ today: null }));
vi.mock('../../lib/utils', async (importOriginal) => {
  const orig = await importOriginal();
  return {
    ...orig,
    todayISO: () => clock.today ?? orig.todayISO(),
    lisbonTodayISO: () => clock.today ?? orig.lisbonTodayISO(),
  };
});

beforeEach(() => {
  clock.today = null;
  net.tables = {};
  net.calls = [];
  __resetCupModuleState();
  useAppStore.setState({ session: null, cup: CUP_EMPTY, cupScreenRequest: null, coachPlans: [] });
});

/* "Para onde vou" no Início. Até specs/prova-concluida.md, este cartão só
   olhava para a frente: a prova desaparecia no dia seguinte ao da corrida,
   registada ou não. A partir do dia da prova passa a ser o sítio onde se
   regista — e fica lá até 7 dias depois, enquanto não houver corrida
   ligada. */

// Datas em hora LOCAL, como o todayISO da app: passar por toISOString num
// fuso a leste de Greenwich devolve o dia anterior.
const emDias = (n) => {
  const d = new Date(`${todayISO()}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const PROVA = {
  id: 'race-1',
  name: 'Meia de Lisboa',
  location: 'Lisboa',
  distance_km: 21.0975,
  race_type: 'estrada',
  race_priority: 'a',
  target_time: '1:52:00',
  status: 'agendada',
};

const PROFILE = { experience_level: 'medio' };

describe('Home/RaceCard — o CTA do dia da prova', () => {
  it('no dia da prova mostra "Registar a prova" e leva o id da prova', () => {
    const onRegisterRace = vi.fn();
    render(
      <RaceCard
        raceEvents={[{ ...PROVA, date: todayISO() }]}
        runs={[]}
        profile={PROFILE}
        onRegisterRace={onRegisterRace}
      />
    );

    const cta = screen.getByTestId('race-card-register');
    expect(cta).toHaveTextContent('Registar a prova');
    expect(cta).toHaveStyle({ minHeight: '44px' });

    fireEvent.click(cta);
    expect(onRegisterRace).toHaveBeenCalledWith('race-1');
  });

  it('dois dias depois, a prova por registar continua no cartão', () => {
    render(
      <RaceCard
        raceEvents={[{ ...PROVA, date: emDias(-2) }]}
        runs={[]}
        profile={PROFILE}
        onRegisterRace={() => {}}
      />
    );

    expect(screen.getByText('Prova por registar')).toBeInTheDocument();
    // Sem corrida ligada (é isso que "por registar" quer dizer): não se
    // afirma que ele correu, só que a prova foi há 2 dias.
    expect(screen.getByText('a prova foi há 2 dias')).toBeInTheDocument();
    expect(screen.queryByText(/correste/)).not.toBeInTheDocument();
    expect(screen.getByTestId('race-card-register')).toBeInTheDocument();
  });

  /* Quando está errado: um dia só ("ontem"), com rotuloDoDia, e nunca a
     afirmação "correste" sem corrida ligada (pedido 2026-09-26). */
  it('um dia depois, sem corrida ligada, diz "ontem" e não afirma que correu', () => {
    render(
      <RaceCard
        raceEvents={[{ ...PROVA, date: emDias(-1) }]}
        runs={[]}
        profile={PROFILE}
        onRegisterRace={() => {}}
      />
    );

    expect(screen.getByText('a prova foi ontem')).toBeInTheDocument();
    expect(screen.queryByText(/correste/)).not.toBeInTheDocument();
    expect(screen.queryByText(/há 1 dia/)).not.toBeInTheDocument();
  });

  it('passados mais de 7 dias sem registo, o Início desiste — o sítio dela é o hub', () => {
    render(
      <RaceCard
        raceEvents={[{ ...PROVA, date: emDias(-10) }]}
        runs={[]}
        profile={PROFILE}
        onRegisterRace={() => {}}
      />
    );

    expect(screen.getByTestId('race-card-empty')).toBeInTheDocument();
  });

  it('uma prova ainda por correr não pede registo nenhum', () => {
    render(
      <RaceCard
        raceEvents={[{ ...PROVA, date: emDias(21) }]}
        runs={[]}
        profile={PROFILE}
        onRegisterRace={() => {}}
      />
    );

    expect(screen.getByTestId('race-card')).toBeInTheDocument();
    expect(screen.queryByTestId('race-card-register')).not.toBeInTheDocument();
  });

  // Regra do âmbar (redesenho 2026-09-15): por cartão, no máximo dois
  // elementos âmbar — o nome da prova e o trilho. A contagem de dias passa
  // a branco/neutro.
  it('a contagem de dias fica em --text-1/--text-4, não em âmbar', () => {
    render(
      <RaceCard
        raceEvents={[{ ...PROVA, date: emDias(21) }]}
        runs={[]}
        profile={PROFILE}
        onRegisterRace={() => {}}
      />
    );
    const dias = screen.getByTestId('race-card-days');
    expect(dias.firstChild).toHaveStyle({ color: 'var(--text-1)' });
    expect(dias.lastChild).toHaveStyle({ color: 'var(--text-4)' });
  });
});

/* O dia a seguir à prova (specs/gamificacao-provas.md §3). Com a corrida
   ligada já não há nada a registar: o cartão olha para trás — tempo, ordem
   no palmarés, conquistas — até se marcar a próxima prova ou passarem 7
   dias. */
const CONCLUIDA = {
  ...PROVA,
  status: 'concluida',
  target_time_seconds: 6720,
};

const CORRIDA = (date) => ({
  id: 'run-1',
  kind: 'competicao',
  race_id: 'race-1',
  date,
  distance_km: 21.0975,
  duration_seconds: 6642,
  details: { official_time_seconds: 6642 },
});

describe('Home/RaceCard — o dia a seguir à prova', () => {
  const renderDiaASeguir = (props = {}) => render(
    <RaceCard
      raceEvents={[{ ...CONCLUIDA, date: emDias(-1) }]}
      runs={[CORRIDA(emDias(-1))]}
      profile={PROFILE}
      {...props}
    />
  );

  it('mostra a prova concluída com o dia, o tempo e o objetivo', () => {
    renderDiaASeguir();

    const cartao = screen.getByTestId('race-card-completed');
    expect(cartao).toHaveTextContent('Prova concluída · ontem');
    expect(cartao).toHaveTextContent('Meia de Lisboa');
    expect(cartao).toHaveTextContent('1:50:42');
    expect(cartao).toHaveTextContent('objetivo 1:52:00');
    // O ciclo fechou — o trilho do macrociclo não tem o que dizer aqui.
    expect(screen.queryByTestId('race-card')).not.toBeInTheDocument();
  });

  it('mostra a ordem da prova no palmarés', () => {
    renderDiaASeguir();
    expect(screen.getByTestId('race-card-completed')).toHaveTextContent('1.ª');
  });

  it('mostra as conquistas desta prova em chips', () => {
    renderDiaASeguir();
    expect(screen.getByTestId('race-card-chip-prova_concluida')).toBeInTheDocument();
    expect(screen.getByTestId('race-card-chip-objetivo_batido')).toHaveTextContent('Objetivo batido');
    // Sem histórico de treino não há previsão — e sem previsão não há chip.
    expect(screen.queryByTestId('race-card-chip-previsao_batida')).not.toBeInTheDocument();
  });

  /* Era "Previsão batida", um pseudo-chip do próprio RaceCard. Desde
     2026-09-21 quem o diz é a conquista `acima_do_treino` do palmarés, com a
     mesma condição — tinham passado a aparecer os dois para o mesmo facto. */
  it('com o treino a apontar para bem mais, a prova mostra "Acima do treino" — e uma só vez', () => {
    render(
      <RaceCard
        raceEvents={[{ ...CONCLUIDA, date: emDias(-1) }]}
        runs={[
          { id: 'treino-1', date: emDias(-40), distance_km: 10, duration_seconds: 3600, kind: 'treino' },
          { id: 'treino-2', date: emDias(-20), distance_km: 14, duration_seconds: 5200, kind: 'treino' },
          CORRIDA(emDias(-1)),
        ]}
        profile={PROFILE}
      />
    );
    expect(screen.getByTestId('race-card-chip-acima_do_treino')).toHaveTextContent('Acima do treino');
    expect(screen.queryByTestId('race-card-chip-previsao_batida')).not.toBeInTheDocument();
  });

  it('"Ver memórias" abre o hub e "Próxima prova" marca a seguinte', () => {
    const onOpenRace = vi.fn();
    const onCreateRace = vi.fn();
    renderDiaASeguir({ onOpenRace, onCreateRace });

    const memorias = screen.getByTestId('race-card-memories');
    expect(memorias).toHaveStyle({ minHeight: '44px' });
    // Regra do âmbar: "Ver memórias" deixa de ser âmbar cheio, igual a
    // "Próxima prova" — o troféu ao lado é que fica em tinta (âmbar).
    expect(memorias).toHaveStyle({ color: 'var(--text-2)' });
    fireEvent.click(memorias);
    expect(onOpenRace).toHaveBeenCalledWith('race-1');

    fireEvent.click(screen.getByTestId('race-card-next'));
    expect(onCreateRace).toHaveBeenCalled();
  });

  it('as conquistas ficam em chips neutros — só o glifo guarda a cor do significado', () => {
    renderDiaASeguir();
    const chip = screen.getByTestId('race-card-chip-prova_concluida');
    expect(chip).toHaveStyle({ background: 'rgba(255, 255, 255, 0.06)', color: 'var(--text-2)' });
  });

  it('a ordem da prova fica em --text-1/--text-4, sem ser âmbar', () => {
    renderDiaASeguir();
    expect(screen.getByText('1.ª')).toHaveStyle({ color: 'var(--text-1)' });
    expect(screen.getByText('prova')).toHaveStyle({ color: 'var(--text-4)' });
  });

  it('marcada a próxima prova, o Início volta a olhar para a frente', () => {
    render(
      <RaceCard
        raceEvents={[
          { ...CONCLUIDA, date: emDias(-1) },
          { ...PROVA, id: 'race-2', name: 'Maratona do Porto', date: emDias(30) },
        ]}
        runs={[CORRIDA(emDias(-1))]}
        profile={PROFILE}
      />
    );

    expect(screen.queryByTestId('race-card-completed')).not.toBeInTheDocument();
    expect(screen.getByTestId('race-card')).toBeInTheDocument();
  });

  it('passados mais de 7 dias, sai — o sítio dela é o hub', () => {
    render(
      <RaceCard
        raceEvents={[{ ...CONCLUIDA, date: emDias(-9) }]}
        runs={[CORRIDA(emDias(-9))]}
        profile={PROFILE}
      />
    );

    expect(screen.queryByTestId('race-card-completed')).not.toBeInTheDocument();
    expect(screen.getByTestId('race-card-empty')).toBeInTheDocument();
  });
});

/* Bug #39 (2026-09-21): com mais de uma prova, o cartão tinha pontos e setas
   mas não deslizava com o dedo nem dava o tique tátil dos outros carrosséis. */
describe('Home/RaceCard — deslizar entre provas', () => {
  const DUAS = [
    { ...PROVA, id: 'race-1', name: 'Meia de Lisboa', date: emDias(30) },
    { ...PROVA, id: 'race-2', name: 'Maratona do Porto', date: emDias(60) },
  ];
  const swipe = (el, fromX, toX, fromY = 100, toY = 100) => {
    fireEvent.touchStart(el, { touches: [{ clientX: fromX, clientY: fromY }] });
    fireEvent.touchEnd(el, { changedTouches: [{ clientX: toX, clientY: toY }] });
  };

  let vibrate;
  beforeEach(() => {
    vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true, writable: true });
  });

  it('swipe para a esquerda passa à prova seguinte e vibra; para a direita volta', () => {
    render(<RaceCard raceEvents={DUAS} runs={[]} profile={PROFILE} />);
    const body = screen.getByTestId('race-card-body');
    expect(screen.getByText('Meia de Lisboa')).toBeInTheDocument();

    swipe(body, 250, 100);
    expect(screen.getByText('Maratona do Porto')).toBeInTheDocument();
    expect(vibrate).toHaveBeenCalledTimes(1);

    swipe(body, 100, 250);
    expect(screen.getByText('Meia de Lisboa')).toBeInTheDocument();
    expect(vibrate).toHaveBeenCalledTimes(2);
  });

  it('no fim da lista não passa além da última nem vibra', () => {
    render(<RaceCard raceEvents={DUAS} runs={[]} profile={PROFILE} />);
    swipe(screen.getByTestId('race-card-body'), 100, 250);
    expect(screen.getByText('Meia de Lisboa')).toBeInTheDocument();
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('um gesto sobretudo vertical é scroll da página, não troca de prova', () => {
    render(<RaceCard raceEvents={DUAS} runs={[]} profile={PROFILE} />);
    swipe(screen.getByTestId('race-card-body'), 200, 140, 100, 300);
    expect(screen.getByText('Meia de Lisboa')).toBeInTheDocument();
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('o swipe não abre o hub; um toque simples continua a abrir', () => {
    const onOpenRace = vi.fn();
    render(<RaceCard raceEvents={DUAS} runs={[]} profile={PROFILE} onOpenRace={onOpenRace} />);
    const body = screen.getByTestId('race-card-body');
    swipe(body, 250, 100);
    fireEvent.click(body);
    expect(onOpenRace).not.toHaveBeenCalled();
    fireEvent.click(body);
    expect(onOpenRace).toHaveBeenCalledWith('race-2');
  });

  it('as setas e os pontos também dão o tique', () => {
    render(<RaceCard raceEvents={DUAS} runs={[]} profile={PROFILE} />);
    fireEvent.click(screen.getByLabelText('Prova seguinte'));
    expect(screen.getByText('Maratona do Porto')).toBeInTheDocument();
    expect(vibrate).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByLabelText('Prova anterior'));
    expect(vibrate).toHaveBeenCalledTimes(2);
  });

  // Revisão pré-deploy: a marca do swipe tinha de caducar — sem prazo, o
  // próximo clique de rato (aparelho híbrido) era engolido.
  it('passado um instante, o clique a seguir a um swipe já abre o hub', () => {
    const onOpenRace = vi.fn();
    const agora = vi.spyOn(Date, 'now');
    agora.mockReturnValue(1000);
    render(<RaceCard raceEvents={DUAS} runs={[]} profile={PROFILE} onOpenRace={onOpenRace} />);
    swipe(screen.getByTestId('race-card-body'), 250, 100);
    agora.mockReturnValue(2000);
    fireEvent.click(screen.getByTestId('race-card-body'));
    expect(onOpenRace).toHaveBeenCalledWith('race-2');
    agora.mockRestore();
  });
});


/* ── Fase 3 do Troféu (specs/trofeu.md §4.3) ──────────────────────────────
   "Para onde vou" tira as jornadas do carrossel e mostra uma linha "Troféu ·
   próxima jornada" (o conteúdo do cartão, se não houver outras provas). Sem
   inscrição, o cartão é o de sempre — no Início e em Provas. */

const USER = 'u-cartao';
const HOJE = '2027-01-20';
const EDITION = { ...F.CASCAIS_34_ABERTA, competition: F.CASCAIS_COMPETITION };
const CATALOG = {
  [EDITION.id]: {
    status: 'ready', rounds: F.CASCAIS_ROUNDS, courses: F.CASCAIS_COURSES,
    overrides: F.CASCAIS_OVERRIDES, categories: F.CASCAIS_CATEGORIES, teams: F.CASCAIS_TEAMS,
  },
};
const CUP_PROFILE = { ...F.PERSONAS.cascais, id: USER, experience_level: 'medio' };
const ENROLLMENT = { id: 'en-1', user_id: USER, edition_id: EDITION.id, status: 'ativa', season_goal: 'participar', team_id: 't-ccd', entry_by: 'atleta', bib: '4321' };
const part = (roundId, extra = {}) => ({ id: `pa-${roundId}`, enrollment_id: ENROLLMENT.id, round_id: roundId, decision: 'vou', decision_source: 'atleta', intent: null, intent_source: null, ...extra });
const PARTICIPATIONS = [part('r-c2'), part('r-c3', { intent: 'controlar', intent_source: 'atleta' }), part('r-c4')];
const jornada = (id, roundId, date, extra = {}) => ({
  id, user_id: USER, date, cup_round_id: roundId, cup_link_origin: null, race_priority: 'b',
  race_type: 'estrada', status: 'agendada', ...extra,
});
const J2 = jornada('race-j2', 'r-c2', '2027-01-10', { name: 'Corta-mato do NAZA', distance_km: 8, race_type: 'corta_mato' });
const J3 = jornada('race-j3', 'r-c3', '2027-01-24', { name: 'Corrida CCD Cascais', distance_km: 7.4 });
const J4 = jornada('race-j4', 'r-c4', '2027-02-21', { name: 'GP Monte Real', distance_km: 10 });
const MEIA = { ...PROVA, id: 'meia', user_id: USER, date: '2027-03-21' };
const ARIA_J3 = 'Jornada 3, Corrida CCD Cascais, domingo, 24 de janeiro. Próxima: Vou, controlar, daqui a 4 dias.';

function cupReady(overrides = {}) {
  return { ...CUP_EMPTY, status: 'ready', userId: USER, editions: [], enrollments: [], dismissals: [], ...overrides };
}
const enrolledCup = (overrides = {}) => cupReady({ editions: [EDITION], enrollments: [ENROLLMENT], catalog: CATALOG, participations: PARTICIPATIONS, ...overrides });
const html = (container) => container.innerHTML.replace(/(?::r|«r|_r_)[0-9a-z]+(?::|»|_)/g, ':id:');
const cupCalls = () => net.calls.filter((t) => /^(rpc:)?(cup_|enroll_cup|update_enrollment|leave_cup|set_participation)/.test(t));

// O cartão como o Início o monta (com "Todas as provas") e como Provas o
// monta (sem ele).
const ONDE = [
  ['Início', { onOpenAllRaces: () => {} }],
  ['Provas', {}],
];

/* INVARIÂNCIA (§10; revisão da Fase 3). A régua é o cartão de ANTES da
   Fase 3 (RaceCardAntesDaFase3, src/test/ — cópia congelada de ef3c4af com
   os mesmos componentes partilhados), não o cartão novo com CUP_EMPTY: uma
   mudança igual para todos os não inscritos (um invólucro a mais, uma linha
   a mais) passava numa comparação do cartão novo consigo próprio. */
describe('Home/RaceCard — invariância sem inscrição (Fase 3 do Troféu)', () => {
  const J_SAIU = jornada('j-saiu', 'r-c2', '2027-01-18', { name: 'Jornada de quem saiu', distance_km: 8, status: 'concluida' });
  const RUN_SAIU = { id: 'run-saiu', race_id: 'j-saiu', kind: 'competicao', date: '2027-01-18', distance_km: 8, duration_seconds: 2400, details: { official_time_seconds: 2400 } };
  const LINHA = { ...PROVA, id: 'b-futura', name: 'Corrida da Linha', race_priority: 'b', distance_km: 10, date: '2027-02-07' };
  // Cada caso diz também o que o cartão de sempre mostra (a régua não pode
  // ser um cartão vazio por engano).
  const PROVAS = [
    ['sem provas', [], [], () => expect(screen.getByTestId('race-card-empty')).toBeInTheDocument()],
    ['uma principal', [MEIA], [], () => expect(screen.getByTestId('race-card')).toHaveTextContent('Meia de Lisboa')],
    ['duas provas (carrossel)', [MEIA, LINHA], [], () => expect(screen.getByLabelText('Prova seguinte')).toBeInTheDocument()],
    ['o dia a seguir a uma jornada de quem saiu', [J_SAIU], [RUN_SAIU],
      () => expect(screen.getByTestId('race-card-completed')).toHaveTextContent('Jornada de quem saiu')],
  ];
  const ESTADOS = [
    ['nada lido (idle)', () => CUP_EMPTY],
    ['lido, sem edição', () => cupReady()],
    ['M1 por aplicar', () => ({ ...CUP_EMPTY, status: 'indisponivel', userId: USER })],
    ['convite na área', () => cupReady({ editions: [EDITION], catalog: CATALOG })],
    ['saiu da edição', () => cupReady({ editions: [EDITION], enrollments: [{ ...ENROLLMENT, status: 'saiu' }], catalog: CATALOG })],
  ];

  beforeEach(() => { localStorage.removeItem(cupEnrolledHintKey(USER)); });

  for (const [onde, props] of ONDE) {
    for (const [nome, raceEvents, runs, comoSempre] of PROVAS) {
      it(`${onde} · ${nome}: em todos os estados da competição, o HTML é o do cartão antes da Fase 3 — e zero leituras cup_*`, () => {
        clock.today = HOJE;
        for (const [estado, cup] of ESTADOS) {
          useAppStore.setState({ session: { user: { id: USER } }, profile: CUP_PROFILE, cup: cup(), raceEvents, runs });
          const antes = render(<RaceCardAntesDaFase3 raceEvents={raceEvents} runs={runs} profile={CUP_PROFILE} {...props} />);
          comoSempre();
          const esperado = html(antes.container);
          antes.unmount();

          const { container, unmount } = render(<RaceCard raceEvents={raceEvents} runs={runs} profile={CUP_PROFILE} {...props} />);
          expect(html(container), estado).toBe(esperado);
          comoSempre();
          expect(screen.queryByTestId('race-card-cup-line')).not.toBeInTheDocument();
          unmount();
        }
        expect(cupCalls()).toEqual([]);
      });
    }
  }

  /* O único caminho em que o código novo corre para quem não está inscrito:
     a pista local velha ("inscrito" neste telemóvel, de uma época ou de uma
     conta que já saiu). Enquanto a leitura corre, o cartão diz "a ler o
     calendário…"; acabada a leitura sem inscrição, a pista apaga-se e o HTML
     volta a ser o de antes. */
  it('pista local velha: a ler, a linha "a ler o calendário…"; lida a competição sem inscrição, o HTML volta a ser o de antes', async () => {
    clock.today = HOJE;
    net.tables.cup_editions = { data: [], error: null };
    const raceEvents = [MEIA, LINHA];
    useAppStore.setState({ session: { user: { id: USER } }, profile: CUP_PROFILE, cup: cupReady(), raceEvents, runs: [] });
    const antes = render(<RaceCardAntesDaFase3 raceEvents={raceEvents} runs={[]} profile={CUP_PROFILE} onOpenAllRaces={() => {}} />);
    const esperado = html(antes.container);
    antes.unmount();

    localStorage.setItem(cupEnrolledHintKey(USER), '1');
    useAppStore.setState({ cup: CUP_EMPTY });
    const { container } = render(<RaceCard raceEvents={raceEvents} runs={[]} profile={CUP_PROFILE} onOpenAllRaces={() => {}} />);
    expect(screen.getByTestId('race-card-cup-line')).toHaveTextContent('Troféu · a ler o calendário…');
    expect(screen.getByLabelText('Prova seguinte')).toBeInTheDocument();

    await waitFor(() => expect(useAppStore.getState().cup.status).toBe('ready'));
    await waitFor(() => expect(screen.queryByTestId('race-card-cup-line')).not.toBeInTheDocument());
    expect(html(container)).toBe(esperado);
    expect(localStorage.getItem(cupEnrolledHintKey(USER))).toBeNull();
  });
});

describe('Home/RaceCard — com inscrição no Troféu', () => {
  const montar = ({ raceEvents = [J2, J3, J4, MEIA], runs = [], cup = enrolledCup(), today = HOJE, ...props } = {}) => {
    clock.today = today;
    // As provas também no store: é de lá que a vista do Troféu as lê (o
    // Início e Provas passam ao cartão as mesmas).
    useAppStore.setState({ session: { user: { id: USER } }, profile: CUP_PROFILE, cup, raceEvents, runs });
    const handlers = { onOpenRace: vi.fn(), onRegisterRace: vi.fn(), onCreateRace: vi.fn(), ...props };
    render(<RaceCard raceEvents={raceEvents} runs={runs} profile={CUP_PROFILE} {...handlers} />);
    return handlers;
  };

  it('as jornadas secundárias saem do carrossel; a linha "próxima jornada" fica no fundo, acima de "Todas as provas"', () => {
    const { onOpenRace } = montar({ onOpenAllRaces: vi.fn() });
    const cartao = screen.getByTestId('race-card');
    expect(cartao).toHaveTextContent('Meia de Lisboa');
    // Só a principal: sem setas nem pontos.
    expect(screen.queryByLabelText('Prova seguinte')).not.toBeInTheDocument();

    const linha = screen.getByTestId('race-card-cup-line');
    expect(linha).toHaveTextContent('Troféu de Cascais · próxima jornada');
    expect(linha).toHaveTextContent('J3 Corrida CCD Cascais · dom 24 jan');
    expect(linha).toHaveTextContent('Vou · controlar · 7,4 km às 9h30');
    expect(linha).toHaveStyle({ minHeight: '56px' });
    expect(linha.nextElementSibling).toBe(screen.getByTestId('race-card-all'));
    // Acessibilidade: a frase inteira, e o estado em texto com o ícone escondido.
    expect(screen.getByRole('button', { name: `Troféu de Cascais, próxima jornada: ${ARIA_J3}` })).toBe(linha);
    expect(linha.querySelector('[data-testid="cup-status"] [aria-hidden="true"]')).toHaveTextContent('✓');
    // A regra do âmbar do cartão (o nome e o trilho) não ganha um terceiro.
    expect(linha.querySelector('span > span')).toHaveTextContent('Troféu de Cascais · próxima jornada');
    expect(linha.querySelector('span > span')).toHaveStyle({ color: 'var(--text-4)' });

    fireEvent.click(linha);
    expect(onOpenRace).toHaveBeenCalledWith('race-j3');
  });

  it('uma jornada promovida a principal fica no carrossel', () => {
    montar({ raceEvents: [J2, { ...J3, race_priority: 'a' }, J4, MEIA] });
    expect(screen.getByLabelText('Prova seguinte')).toBeInTheDocument();
    expect(screen.getByTestId('race-card')).toHaveTextContent('Corrida CCD Cascais');
  });

  /* Revisão da Fase 3: a promovida aparecia duas vezes no mesmo cartão — no
     carrossel e outra vez na linha "Troféu · próxima jornada". A linha passa
     à seguinte. */
  it('a promovida não se repete na linha: a linha mostra a jornada seguinte', () => {
    montar({ raceEvents: [J2, { ...J3, race_priority: 'a' }, J4, MEIA] });
    const linha = screen.getByTestId('race-card-cup-line');
    expect(linha).toHaveTextContent('J4 GP Monte Real');
    expect(linha).not.toHaveTextContent('Corrida CCD');
    expect(screen.getAllByText(/Corrida CCD Cascais/)).toHaveLength(1);
  });

  /* Revisão da Fase 3: a jornada do PRÓPRIO dia saía do carrossel (o filtro
     das fixas apanhava `date >= hoje`) e com ela o "Registar a prova" do
     dia da prova, que qualquer outra prova tem. Fica no carrossel; só as
     futuras saem. E a linha não a repete. */
  it('no dia da jornada, ela fica no carrossel com o "Registar a prova"; a linha passa à seguinte', () => {
    const { onRegisterRace } = montar({ today: '2027-01-24' });
    const cartao = screen.getByTestId('race-card');
    // A J3 é hoje: primeira do carrossel (a Meia é em março).
    expect(cartao).toHaveTextContent('Corrida CCD Cascais');
    expect(screen.getByLabelText('Prova seguinte')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('race-card-register'));
    expect(onRegisterRace).toHaveBeenCalledWith('race-j3');
    const linha = screen.getByTestId('race-card-cup-line');
    expect(linha).toHaveTextContent('J4 GP Monte Real');
    expect(linha).not.toHaveTextContent('Corrida CCD');
    // A J4 (futura) continua fora do carrossel: são só a J3 e a Meia.
    fireEvent.click(screen.getByLabelText('Prova seguinte'));
    expect(screen.getByTestId('race-card-body')).toHaveTextContent('Meia de Lisboa');
    expect(screen.getByLabelText('Prova seguinte')).toBeDisabled();
  });

  it('só jornadas, no dia de uma: o cartão é a de hoje (com "Registar a prova"), não o cartão da próxima', () => {
    const { onRegisterRace } = montar({ today: '2027-01-24', raceEvents: [J3, J4] });
    expect(screen.queryByTestId('race-card-cup')).not.toBeInTheDocument();
    expect(screen.getByTestId('race-card')).toHaveTextContent('Corrida CCD Cascais');
    fireEvent.click(screen.getByTestId('race-card-register'));
    expect(onRegisterRace).toHaveBeenCalledWith('race-j3');
    expect(screen.getByTestId('race-card-cup-line')).toHaveTextContent('J4 GP Monte Real');
  });

  it('todas as que faltam já estão no cartão: não há linha a repeti-las', () => {
    // Só a J3 (promovida) e a Meia pela frente, e já sem mais jornadas com data.
    const rounds = F.CASCAIS_ROUNDS.filter((r) => r.id !== 'r-c4' && r.id !== 'r-c5');
    const cup = enrolledCup({ catalog: { [EDITION.id]: { ...CATALOG[EDITION.id], rounds } } });
    montar({ raceEvents: [{ ...J3, race_priority: 'a' }, MEIA], cup, onOpenAllRaces: vi.fn() });
    expect(screen.getByTestId('race-card')).toHaveTextContent('Corrida CCD Cascais');
    expect(screen.queryByTestId('race-card-cup-line')).not.toBeInTheDocument();
    expect(screen.getByTestId('race-card-all')).toBeInTheDocument();
  });

  it('só jornadas: o cartão é a próxima jornada, com os dias e o estado', () => {
    const { onOpenRace } = montar({ raceEvents: [J3, J4], onOpenAllRaces: vi.fn() });
    expect(screen.queryByTestId('race-card')).not.toBeInTheDocument();
    expect(screen.queryByTestId('race-card-empty')).not.toBeInTheDocument();
    const cartao = screen.getByTestId('race-card-cup');
    expect(cartao).toHaveTextContent('Troféu de Cascais · próxima jornada');
    expect(cartao).toHaveTextContent('J3 · Corrida CCD Cascais');
    expect(cartao).toHaveTextContent('dom 24 jan · 7,4 km às 9h30');
    expect(screen.getByTestId('race-card-cup-days')).toHaveTextContent('4dias');
    expect(cartao).toHaveTextContent('Vou · controlar');
    expect(screen.getByTestId('race-card-all')).toBeInTheDocument();
    const corpo = screen.getByRole('button', { name: `Troféu de Cascais, próxima jornada: ${ARIA_J3}` });
    expect(corpo).toHaveStyle({ minHeight: '56px' });
    fireEvent.click(corpo);
    expect(onOpenRace).toHaveBeenCalledWith('race-j3');
  });

  it('a próxima jornada sem prova: o toque abre-a no ecrã do Troféu, em Provas', () => {
    const cup = enrolledCup({ participations: [part('r-c3', { decision: 'nao_sei' })] });
    const { onOpenRace } = montar({ raceEvents: [], cup });
    const cartao = screen.getByTestId('race-card-cup');
    expect(cartao).toHaveTextContent('Ainda não sei');
    fireEvent.click(screen.getByTestId('race-card-cup-body'));
    expect(onOpenRace).not.toHaveBeenCalled();
    expect(useAppStore.getState().activeTab).toBe('provas');
    expect(useAppStore.getState().cupScreenRequest).toMatchObject({ roundId: 'r-c3', mode: 'calendario' });
  });

  it('sem mais jornadas pela frente: a linha di-lo e abre o Troféu; sem outras provas, é o estado vazio com a linha', () => {
    const rounds = F.CASCAIS_ROUNDS.filter((r) => r.date);
    const cup = enrolledCup({ catalog: { [EDITION.id]: { ...CATALOG[EDITION.id], rounds } } });
    montar({ today: '2027-06-01', raceEvents: [], cup, onOpenAllRaces: vi.fn() });
    expect(screen.getByTestId('race-card-empty')).toBeInTheDocument();
    const linha = screen.getByTestId('race-card-cup-line');
    expect(linha).toHaveTextContent('Troféu de Cascais · sem mais jornadas esta época');
    expect(linha.nextElementSibling).toBe(screen.getByTestId('race-card-all'));
    fireEvent.click(linha);
    // Sem jornada, sem modo: o ecrã do Troféu decide (a lista pré-marcada
    // quando há jornadas por decidir, §4.3).
    expect(useAppStore.getState().cupScreenRequest).toMatchObject({ roundId: null, mode: null });
  });

  it('calendário por sair: a linha di-lo, por baixo da prova que há', () => {
    const cup = enrolledCup({ catalog: { [EDITION.id]: { ...CATALOG[EDITION.id], rounds: [] } } });
    montar({ raceEvents: [MEIA], cup });
    expect(screen.getByTestId('race-card')).toBeInTheDocument();
    expect(screen.getByTestId('race-card-cup-line')).toHaveTextContent('Troféu de Cascais · calendário por sair');
  });

  it('com a pista e a vista ainda a chegar: as jornadas já saíram do carrossel e a linha diz "a ler o calendário…" (sem piscar)', async () => {
    clock.today = HOJE;
    localStorage.setItem(cupEnrolledHintKey(USER), '1');
    net.tables.cup_editions = { data: [EDITION], error: null };
    net.tables.cup_enrollments = { data: [ENROLLMENT], error: null };
    net.tables.cup_participations = { data: PARTICIPATIONS, error: null };
    net.tables.cup_rounds = { data: F.CASCAIS_ROUNDS, error: null };
    net.tables.cup_categories = { data: F.CASCAIS_CATEGORIES, error: null };
    net.tables.cup_teams = { data: F.CASCAIS_TEAMS, error: null };
    net.tables.cup_round_courses = { data: F.CASCAIS_COURSES, error: null };
    net.tables.cup_round_course_overrides = { data: F.CASCAIS_OVERRIDES, error: null };
    useAppStore.setState({ session: { user: { id: USER } }, profile: CUP_PROFILE, cup: CUP_EMPTY, raceEvents: [J3, MEIA], runs: [] });
    render(<RaceCard raceEvents={[J3, MEIA]} runs={[]} profile={CUP_PROFILE} />);
    // Logo ao montar: a Meia sozinha no carrossel, e a linha a ler.
    expect(screen.getByTestId('race-card')).toHaveTextContent('Meia de Lisboa');
    expect(screen.queryByLabelText('Prova seguinte')).not.toBeInTheDocument();
    expect(screen.getByTestId('race-card-cup-line')).toHaveTextContent('Troféu · a ler o calendário…');
    // Lida a inscrição, a linha passa a ser a jornada — o carrossel não mexeu.
    await waitFor(() => expect(screen.getByTestId('race-card-cup-line')).toHaveTextContent('J3 Corrida CCD Cascais'));
    expect(screen.queryByLabelText('Prova seguinte')).not.toBeInTheDocument();
  });

  it('uma jornada que passou e está por registar fica no carrossel — o "Registar a prova" do Início não se perde', () => {
    const { onRegisterRace } = montar({ today: '2027-01-12', raceEvents: [J2, J3, J4] });
    const cartao = screen.getByTestId('race-card');
    expect(cartao).toHaveTextContent('Corta-mato do NAZA');
    expect(cartao).toHaveTextContent('Prova por registar');
    fireEvent.click(screen.getByTestId('race-card-register'));
    expect(onRegisterRace).toHaveBeenCalledWith('race-j2');
    // E a linha continua a apontar para a próxima.
    expect(screen.getByTestId('race-card-cup-line')).toHaveTextContent('J3 Corrida CCD Cascais');
  });

  it('o dia a seguir a uma jornada já registada: o cartão olha para a próxima jornada, não para trás', () => {
    const feita = { ...J2, status: 'concluida' };
    const run = { id: 'run-j2', race_id: 'race-j2', kind: 'competicao', date: '2027-01-10', distance_km: 8, duration_seconds: 2400, details: { official_time_seconds: 2400 } };
    montar({ today: '2027-01-11', raceEvents: [feita, J3, J4], runs: [run] });
    expect(screen.queryByTestId('race-card-completed')).not.toBeInTheDocument();
    expect(screen.getByTestId('race-card-cup')).toHaveTextContent('J3 · Corrida CCD Cascais');
  });

  it('no dia a seguir a uma principal, a linha do Troféu aparece por baixo', () => {
    const meiaFeita = { ...MEIA, date: '2027-01-17', status: 'concluida' };
    const run = { id: 'run-meia', race_id: 'meia', kind: 'competicao', date: '2027-01-17', distance_km: 21.0975, duration_seconds: 6642, details: { official_time_seconds: 6642 } };
    montar({ raceEvents: [meiaFeita, J3, J4], runs: [run] });
    expect(screen.getByTestId('race-card-completed')).toBeInTheDocument();
    expect(screen.getByTestId('race-card-cup-line')).toHaveTextContent('J3 Corrida CCD Cascais');
  });

  it('nunca mostra o dorsal', () => {
    montar();
    expect(document.body.textContent).not.toContain('4321');
  });
});
