import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
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
    expect(screen.getByText('Prova concluída')).toBeInTheDocument();
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
