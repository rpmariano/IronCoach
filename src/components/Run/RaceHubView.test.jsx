import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import RaceHubView from './RaceHubView';
import { useAppStore } from '../../store';
import { todayISO } from '../../lib/utils';

// A galeria assina as URLs do bucket privado race-memories na hora.
vi.mock('../../lib/supabase', () => ({
  supabase: {
    storage: {
      from: () => ({
        createSignedUrl: (path) => Promise.resolve({ data: { signedUrl: `https://signed/${path}` }, error: null }),
      }),
    },
  },
}));

/* Ponto 7 do redesenho 6c — mock "Hub de prova · depois da prova".
   Uma prova já corrida deixa de mostrar contagem decrescente, previsão e
   macrociclo por cumprir: mostra o tempo final, o balanço da Carol e o
   ciclo fechado. O estado não tem dados no modo demo (não há provas
   passadas com corrida de competição), por isso é aqui que se cobre. */

const pastDateISO = (daysAgo) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
};

const RACE_DATE = pastDateISO(10);

const RACE = {
  id: 'race-1',
  name: 'Meia de Lisboa',
  date: RACE_DATE,
  distance_km: 21.1,
  race_type: 'estrada',
  race_priority: 'a',
  target_time: '1:52:00',
  status: 'concluida',
};

const PROFILE = { experience_level: 'medio' };

// 6822 s = 1:53:42 sobre 21,1 km.
const RACE_RUN = {
  id: 'run-1',
  kind: 'competicao',
  date: RACE_DATE,
  name: 'Meia de Lisboa',
  distance_km: 21.1,
  duration_seconds: 6822,
};

describe('RaceHubView — hub depois da prova', () => {
  it('com a corrida da prova registada, mostra "Prova concluída" e o tempo final como número herói', () => {
    render(<RaceHubView race={RACE} runs={[RACE_RUN]} profile={PROFILE} />);

    expect(screen.getByTestId('race-hub-completed')).toBeInTheDocument();
    // O rótulo do herói — a conquista "Prova concluída" da secção das
    // conquistas repete o mesmo texto de propósito.
    expect(screen.getByTestId('race-hub-eyebrow')).toHaveTextContent('Prova concluída');
    expect(screen.getByText('Meia de Lisboa')).toBeInTheDocument();

    const hero = screen.getByTestId('race-final-time');
    expect(hero).toHaveTextContent('1:53:42');
    // Número herói: 44px (--text-num-lg), como o mock.
    expect(hero).toHaveStyle({ fontSize: 'var(--text-num-lg)' });

    // O objetivo fica ao lado do tempo, para se poderem comparar.
    expect(screen.getByText('Objetivo')).toBeInTheDocument();
    expect(screen.getByText('1:52:00')).toBeInTheDocument();

    // O balanço da Carol e o ciclo fechado.
    expect(screen.getByText('Balanço da Carol')).toBeInTheDocument();
    expect(screen.getByText(/^Ciclo de \d+ semanas$/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Marcar a próxima prova/ })).toBeInTheDocument();
  });

  it('sem corrida de competição nesse dia, convida a registá-la em vez de inventar um tempo', () => {
    render(<RaceHubView race={RACE} runs={[]} profile={PROFILE} />);

    expect(screen.getByTestId('race-hub-completed')).toBeInTheDocument();
    expect(screen.queryByTestId('race-final-time')).not.toBeInTheDocument();
    expect(screen.getByText(/Não tenho a corrida desta prova/)).toBeInTheDocument();

    const cta = screen.getByRole('button', { name: 'Registar a prova' });
    expect(cta).toBeInTheDocument();
    expect(cta).toHaveStyle({ minHeight: 'var(--tap)' });
  });

  it('uma corrida de TREINO no dia da prova não conta como o tempo final', () => {
    render(
      <RaceHubView
        race={RACE}
        runs={[{ ...RACE_RUN, kind: 'treino' }]}
        profile={PROFILE}
      />
    );

    expect(screen.queryByTestId('race-final-time')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Registar a prova' })).toBeInTheDocument();
  });

  it('o que só faz sentido antes da prova sai do ecrã: contagem, previsão e macrociclo por cumprir', () => {
    render(<RaceHubView race={RACE} runs={[RACE_RUN]} profile={PROFILE} />);

    expect(screen.queryByText('Contagem para a Prova')).not.toBeInTheDocument();
    expect(screen.queryByText('Fase de Treino')).not.toBeInTheDocument();
    expect(screen.queryByText(/Previsão \(VDOT\)/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Macrociclo de Treino/)).not.toBeInTheDocument();
  });

  it('uma prova ainda por correr continua no hub normal', () => {
    const future = new Date();
    future.setDate(future.getDate() + 120);
    const futureRace = { ...RACE, date: future.toISOString().slice(0, 10), status: 'planeada' };

    render(<RaceHubView race={futureRace} runs={[]} profile={PROFILE} />);

    expect(screen.queryByTestId('race-hub-completed')).not.toBeInTheDocument();
    expect(screen.getByText('Contagem para a Prova')).toBeInTheDocument();
    // Ainda falta correr — não há nada para registar.
    expect(screen.queryByTestId('race-hub-register')).not.toBeInTheDocument();
  });
});

/* "Marcar como concluída" no hub (pedido 2026-09-12): no cartão "Prova &
   Recuperação", só ativo a partir do dia da prova, com confirmação; passada
   a data, no estado pós-prova. Some com corrida ligada. */
describe('RaceHubView — marcar como concluída', () => {
  const hoje = todayISO();
  // O nome da fase também aparece fora do cartão — clica-se no cartão.
  const expandRecovery = () => fireEvent.click(
    screen.getAllByText('Prova & Recuperação').find((el) => el.closest('.rh-phase-card')).closest('.rh-phase-card'),
  );

  it('antes do dia da prova o botão existe mas está desativado, com a pista de quando fica disponível', () => {
    const future = new Date();
    future.setDate(future.getDate() + 30);
    const onMarkCompleted = vi.fn();
    render(<RaceHubView race={{ ...RACE, date: future.toISOString().slice(0, 10), status: 'agendada' }} runs={[]} profile={PROFILE} onMarkCompleted={onMarkCompleted} />);

    expandRecovery();
    const btn = screen.getByTestId('race-hub-mark-completed');
    expect(btn).toBeDisabled();
    expect(screen.getByText('Disponível a partir do dia da prova.')).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onMarkCompleted).not.toHaveBeenCalled();
  });

  it('no dia da prova, pede confirmação e só depois avisa o pai', () => {
    useAppStore.setState({ activeTab: 'corrida', navGuard: null, runRacePrefill: null });
    const race = { ...RACE, date: hoje, status: 'agendada' };
    const onMarkCompleted = vi.fn();
    render(<RaceHubView race={race} runs={[]} profile={PROFILE} onMarkCompleted={onMarkCompleted} />);

    expandRecovery();
    const btn = screen.getByTestId('race-hub-mark-completed');
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    expect(screen.getByText('Marcar a prova como concluída?')).toBeInTheDocument();
    expect(onMarkCompleted).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Sim, concluída/i }));
    expect(onMarkCompleted).toHaveBeenCalledWith(race);
  });

  it('passada a data e ainda "agendada", a ação está no estado pós-prova, ao lado de "Registar a prova"', () => {
    const onMarkCompleted = vi.fn();
    render(<RaceHubView race={{ ...RACE, status: 'agendada' }} runs={[]} profile={PROFILE} onMarkCompleted={onMarkCompleted} />);

    expect(screen.getByTestId('race-hub-completed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Registar a prova' })).toBeInTheDocument();
    expect(screen.getByTestId('race-hub-mark-completed')).toBeEnabled();
  });

  it('com a corrida da prova ligada, ou já concluída, ou sem callback, não aparece', () => {
    const { unmount } = render(<RaceHubView race={{ ...RACE, date: hoje, status: 'agendada' }} runs={[{ ...RACE_RUN, date: hoje, race_id: 'race-1' }]} profile={PROFILE} onMarkCompleted={vi.fn()} />);
    expect(screen.queryByTestId('race-hub-mark-completed')).not.toBeInTheDocument();
    unmount();

    const second = render(<RaceHubView race={RACE} runs={[]} profile={PROFILE} onMarkCompleted={vi.fn()} />);
    expect(screen.queryByTestId('race-hub-mark-completed')).not.toBeInTheDocument();
    second.unmount();

    render(<RaceHubView race={{ ...RACE, date: hoje, status: 'agendada' }} runs={[]} profile={PROFILE} />);
    expandRecovery();
    expect(screen.queryByTestId('race-hub-mark-completed')).not.toBeInTheDocument();
  });
});

/* Prova concluída (specs/prova-concluida.md): a corrida encontra-se por
   runs.race_id — a data só serve para os registos anteriores a essa coluna —
   e as memórias do dia ganham galeria própria. */
describe('RaceHubView — a corrida da prova e as memórias', () => {
  it('encontra a corrida por race_id mesmo registada noutro dia', () => {
    render(
      <RaceHubView
        race={RACE}
        // Registada três dias DEPOIS da prova: pela data, este hub nunca a
        // encontrava.
        runs={[{ ...RACE_RUN, date: pastDateISO(7), race_id: 'race-1' }]}
        profile={PROFILE}
      />
    );

    // Antes de haver race_id, isto não aparecia: a busca era pela data.
    expect(screen.getByTestId('race-final-time')).toHaveTextContent('1:53:42');
  });

  it('mostra a galeria: medalha, diploma em PDF e as fotografias', async () => {
    render(
      <RaceHubView
        race={{
          ...RACE,
          medal_path: 'u1/race-1/medal.jpg',
          diploma_path: 'u1/race-1/diploma.pdf',
          photo_paths: ['u1/race-1/photo-1.jpg', 'u1/race-1/photo-2.jpg'],
        }}
        runs={[RACE_RUN]}
        profile={PROFILE}
      />
    );

    const galeria = await screen.findByTestId('race-memories-gallery');
    await waitFor(() => expect(screen.getByAltText('A medalha da prova')).toHaveAttribute('src', 'https://signed/u1/race-1/medal.jpg'));
    // Um PDF não se mostra em miniatura — abre-se.
    const diploma = screen.getByRole('link', { name: /Abrir diploma/ });
    expect(diploma).toHaveAttribute('href', 'https://signed/u1/race-1/diploma.pdf');
    expect(galeria).toContainElement(diploma);

    const fotos = screen.getAllByRole('button', { name: /Ver a fotografia \d+ em ecrã inteiro/ });
    expect(fotos).toHaveLength(2);
    // Piso de toque em cada miniatura.
    expect(fotos[0]).toHaveStyle({ minHeight: 'var(--tap)', minWidth: 'var(--tap)' });
  });

  it('sem memórias nenhumas, convida a guardá-las em vez de mostrar uma galeria vazia', () => {
    render(<RaceHubView race={RACE} runs={[RACE_RUN]} profile={PROFILE} />);

    expect(screen.queryByTestId('race-memories-gallery')).not.toBeInTheDocument();
    expect(screen.getByTestId('race-memories-invite')).toHaveTextContent('Guardar as memórias da prova');
  });

  it('sem corrida ligada não há convite às memórias — primeiro regista-se a prova', () => {
    render(<RaceHubView race={RACE} runs={[]} profile={PROFILE} />);

    expect(screen.queryByTestId('race-memories-invite')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Registar a prova' })).toBeInTheDocument();
  });

  it('no dia da prova, o hub normal já oferece "Registar a prova"', () => {
    const hoje = todayISO();
    useAppStore.setState({ activeTab: 'corrida', navGuard: null, runRacePrefill: null });

    render(<RaceHubView race={{ ...RACE, date: hoje, status: 'agendada' }} runs={[]} profile={PROFILE} />);

    expect(screen.queryByTestId('race-hub-completed')).not.toBeInTheDocument();
    const cta = screen.getByTestId('race-hub-register');
    expect(cta).toHaveTextContent('Registar a prova');
    expect(cta).toHaveStyle({ minHeight: 'var(--tap)' });

    cta.click();
    expect(useAppStore.getState().runRacePrefill).toEqual({ raceId: 'race-1' });
    expect(useAppStore.getState().openCreationMode).toBe('run');
  });
});

/* Conquistas no hub (specs/gamificacao-provas.md §2): entre as memórias e o
   balanço, o que esta prova deu — e numa linha discreta o que ficou para a
   próxima. O balanço passa a ser o da prova em si (describeRaceOutcome), não
   o texto genérico do motor do plano. */
describe('RaceHubView — conquistas da prova', () => {
  const COM_OBJETIVO = { ...RACE, target_time_seconds: 6900 };

  it('mostra as conquistas desta prova entre as memórias e o balanço', () => {
    useAppStore.setState({ raceEvents: [COM_OBJETIVO] });
    render(<RaceHubView race={COM_OBJETIVO} runs={[{ ...RACE_RUN, race_id: 'race-1', details: { official_time_seconds: 6822 } }]} profile={PROFILE} />);

    const seccao = screen.getByTestId('race-hub-achievements');
    expect(seccao).toHaveTextContent('Prova concluída');
    expect(seccao).toHaveTextContent('1.ª prova');
    expect(seccao).toHaveTextContent('Objetivo batido');
    expect(seccao).toHaveTextContent('(objetivo 1:55:00)');
  });

  it('o que ficou por desbloquear fica numa linha discreta, com o número', () => {
    // 6900 + 102 = 7002 → ficou a 1:42 do objetivo.
    useAppStore.setState({ raceEvents: [COM_OBJETIVO] });
    render(<RaceHubView race={COM_OBJETIVO} runs={[{ ...RACE_RUN, race_id: 'race-1', duration_seconds: 7002, details: { official_time_seconds: 7002 } }]} profile={PROFILE} />);

    expect(screen.getByTestId('race-hub-achievements-missed'))
      .toHaveTextContent('Objetivo batido fica para a próxima: ficaste a 1:42');
  });

  it('o balanço é o da prova, com os números da régua única', () => {
    useAppStore.setState({ raceEvents: [COM_OBJETIVO] });
    render(<RaceHubView race={COM_OBJETIVO} runs={[{ ...RACE_RUN, race_id: 'race-1', details: { official_time_seconds: 6822 } }]} profile={PROFILE} />);

    const balanco = screen.getByTestId('race-hub-balance');
    expect(balanco).toHaveTextContent('1:53:42');
    expect(balanco).toHaveTextContent('Objetivo batido por 1:18');
  });

  it('sem corrida registada não há conquistas nenhumas para mostrar', () => {
    useAppStore.setState({ raceEvents: [COM_OBJETIVO] });
    render(<RaceHubView race={COM_OBJETIVO} runs={[]} profile={PROFILE} />);

    expect(screen.queryByTestId('race-hub-achievements')).not.toBeInTheDocument();
    expect(screen.queryByTestId('race-hub-achievements-missed')).not.toBeInTheDocument();
  });
});

/* Plano para o dia (specs/plano-de-prova.md §"Onde aparece" 1): o cartão só
   existe nos últimos 7 dias e no dia da prova, monta-se sobre a régua única
   (@formulas/racePacing.ts) e, sem objetivo nem previsão do treino, pede o
   objetivo em vez de inventar ritmos. */
describe('RaceHubView — plano para o dia', () => {
  const futureDateISO = (days) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  // A meia daqui a 3 dias, com objetivo de 1:52:00 gravado.
  const MEIA_PROXIMA = {
    ...RACE,
    date: futureDateISO(3),
    status: 'agendada',
    target_time: '1:52:00',
    target_time_seconds: 6720,
  };

  it('a 3 dias da prova, mostra a tabela com a chegada planeada, os troços e o abastecimento', () => {
    render(<RaceHubView race={MEIA_PROXIMA} runs={[]} profile={PROFILE} />);

    expect(screen.getByText('Plano para o dia')).toBeInTheDocument();
    const cartao = screen.getByTestId('race-pacing-card');

    // A chegada planeada é a soma dos troços — anda à volta do objetivo.
    expect(screen.getByTestId('race-pacing-finish')).toHaveTextContent(/^1:5\d:\d\d$/);
    expect(cartao).toHaveTextContent('sobre o objetivo 1:52:00');

    // Sete troços na meia, do km 0 ao 21,1, com ritmo e tempo de passagem.
    const linhas = screen.getByTestId('race-pacing-rows');
    expect(linhas).toHaveTextContent('km 0 a 1');
    // Os km consecutivos com o mesmo ritmo agrupam-se — o último troço fecha
    // na distância real, com vírgula decimal.
    expect(linhas).toHaveTextContent('km 17 a 21,1');
    expect(linhas).toHaveTextContent('5.26/km');
    // Os rótulos do plano, do arranque ao final.
    expect(linhas).toHaveTextContent('controlar');
    expect(linhas).toHaveTextContent('decidir');
    expect(linhas).toHaveTextContent('acelerar');

    // Abastecimento: água de 5 em 5 km a partir da meia.
    const fuel = screen.getByTestId('race-pacing-fuel');
    expect(fuel).toHaveTextContent('km 5 · água');
    expect(fuel).toHaveTextContent('hidratos');

    // Sem percurso, o plano diz que não o conhece em vez de o inventar.
    expect(screen.getByTestId('race-pacing-notes')).toHaveTextContent('Não conheço o percurso');
  });

  it('sem objetivo nem previsão do treino, pede o objetivo e leva à edição', () => {
    const onGoToEdit = vi.fn();
    const semObjetivo = { ...RACE, date: futureDateISO(2), status: 'agendada', target_time: null, target_time_seconds: null };

    render(<RaceHubView race={semObjetivo} runs={[]} profile={PROFILE} onGoToEdit={onGoToEdit} />);

    expect(screen.getByTestId('race-pacing-card')).toHaveTextContent('Marca um objetivo de tempo para eu montar o plano');
    expect(screen.queryByTestId('race-pacing-rows')).not.toBeInTheDocument();

    const botao = screen.getByTestId('race-pacing-edit');
    expect(botao).toHaveStyle({ minHeight: 'var(--tap)' });
    fireEvent.click(botao);
    expect(onGoToEdit).toHaveBeenCalled();
  });

  it('com o percurso do site, a subida cita o troço e ajusta o ritmo', () => {
    const comPercurso = {
      ...MEIA_PROXIMA,
      web_info: {
        route_summary: 'Percurso urbano, plano até Belém.',
        route_segments: [
          { km_marker: 6.2, description: 'subida da Calçada da Ajuda', elevation: 'sobe' },
          { km_marker: 9.5, description: 'descida para Belém', elevation: 'desce' },
        ],
      },
    };

    render(<RaceHubView race={comPercurso} runs={[]} profile={PROFILE} />);

    const linhas = screen.getByTestId('race-pacing-rows');
    expect(linhas).toHaveTextContent('km 6 a 7');
    expect(linhas).toHaveTextContent('subida da Calçada da Ajuda');
    expect(linhas).toHaveTextContent('descida para Belém');
    expect(linhas).toHaveTextContent('subida');
    expect(linhas).toHaveTextContent('descida');
    // Conhecendo o percurso, a nota de "não conheço" desaparece.
    expect(screen.queryByText(/Não conheço o percurso/)).not.toBeInTheDocument();
  });

  it('sem informação do site mas com site da prova, oferece buscar o percurso', () => {
    const onFetchWebInfo = vi.fn();
    render(
      <RaceHubView
        race={{ ...MEIA_PROXIMA, website: 'https://meiadelisboa.pt' }}
        runs={[]}
        profile={PROFILE}
        onFetchWebInfo={onFetchWebInfo}
      />
    );

    expect(screen.getByText('Sem o percurso o plano não ajusta subidas e descidas.')).toBeInTheDocument();
    const botao = screen.getByTestId('race-pacing-fetch-route');
    expect(botao).toHaveTextContent('Buscar o percurso');
    fireEvent.click(botao);
    expect(onFetchWebInfo).toHaveBeenCalled();
  });

  it('em trail o plano é por esforço e os ritmos ficam como referência', () => {
    const trail = {
      ...RACE,
      date: futureDateISO(1),
      status: 'agendada',
      race_type: 'trail',
      distance_km: 15,
      elevation_gain_m: 620,
      target_time: '1:45:00',
      target_time_seconds: 6300,
    };

    render(<RaceHubView race={trail} runs={[]} profile={PROFILE} />);

    expect(screen.getByTestId('race-pacing-card')).toHaveTextContent('por esforço');
    expect(screen.getByTestId('race-pacing-notes')).toHaveTextContent('Trail é por esforço, não por ritmo');
  });

  it('a mais de 7 dias da prova o cartão não existe — o que interessa ainda é o treino', () => {
    render(<RaceHubView race={{ ...MEIA_PROXIMA, date: futureDateISO(20) }} runs={[]} profile={PROFILE} />);

    expect(screen.queryByTestId('race-pacing-card')).not.toBeInTheDocument();
    expect(screen.queryByText('Plano para o dia')).not.toBeInTheDocument();
  });

  /* A hora de partida (specs/plano-de-prova.md, "A véspera e a hora"): sem
     ela a Carol planeia a véspera em abstrato, por isso o hub mostra-a junto
     à data e o cartão do plano pede-a quando falta. */
  it('com hora de partida, mostra-a a seguir à data no cabeçalho e "Partida às" no cartão do plano', () => {
    // A BD devolve 'HH:MM:SS' — o hub mostra 'HH:MM'.
    render(<RaceHubView race={{ ...MEIA_PROXIMA, start_time: '09:00:00' }} runs={[]} profile={PROFILE} />);

    expect(screen.getByTestId('race-hub-date')).toHaveTextContent(/· 09:00$/);
    expect(screen.getByTestId('race-pacing-start-time')).toHaveTextContent('Partida às 09:00');
    expect(screen.queryByTestId('race-pacing-start-time-missing')).not.toBeInTheDocument();
  });

  it('sem hora de partida, o cabeçalho fica só com a data e o cartão do plano pede-a, com atalho para a edição', () => {
    const onGoToEdit = vi.fn();
    render(<RaceHubView race={MEIA_PROXIMA} runs={[]} profile={PROFILE} onGoToEdit={onGoToEdit} />);

    expect(screen.getByTestId('race-hub-date').textContent).not.toContain('·');
    expect(screen.getByTestId('race-pacing-start-time-missing'))
      .toHaveTextContent('Sem hora de partida: marca-a para a Carol planear a véspera');

    fireEvent.click(screen.getByTestId('race-pacing-edit'));
    expect(onGoToEdit).toHaveBeenCalled();
  });
});
