import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import RaceMemoriesSheet from './RaceMemoriesSheet';
import RaceHubView from './RaceHubView';
import { useAppStore } from '../../store';

/* Memórias depois da prova (pedido 2026-09-13): concluir a prova é registar
   a corrida; o diploma, a medalha e as fotos juntam-se quando chegarem, na
   persiana do hub — sem reabrir o registo da corrida. */

const mocks = vi.hoisted(() => ({ updates: [], uploads: [], removed: [], uploadError: null }));
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table) => ({
      update: (payload) => ({
        eq: (_col, id) => { mocks.updates.push({ table, payload, id }); return Promise.resolve({ error: null }); },
      }),
    }),
    storage: {
      from: (bucket) => ({
        upload: (path, _blob, options) => {
          mocks.uploads.push({ bucket, path, contentType: options?.contentType });
          return Promise.resolve({ data: { path }, error: mocks.uploadError });
        },
        remove: (paths) => { mocks.removed.push(...paths); return Promise.resolve({ error: null }); },
        createSignedUrl: (path) => Promise.resolve({ data: { signedUrl: `https://signed/${path}` }, error: null }),
      }),
    },
  },
}));
vi.mock('../../lib/image', () => ({
  compressImage: () => Promise.resolve({ dataUrl: 'data:image/jpeg;base64,AAA', base64: 'AAA' }),
}));

const pastDateISO = (daysAgo) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
};
const RACE_DATE = pastDateISO(3);
const RACE = { id: 'race-1', name: 'Meia de Lisboa', date: RACE_DATE, distance_km: 21.1, race_type: 'estrada', race_priority: 'a', target_time: '1:52:00', status: 'concluida' };
const RACE_RUN = { id: 'run-1', kind: 'competicao', race_id: 'race-1', date: RACE_DATE, name: 'Meia de Lisboa', distance_km: 21.1, duration_seconds: 6822 };
const PROFILE = { id: 'user-1', experience_level: 'medio' };

const ficheiroImagem = (nome = 'foto.jpg') => new File(['x'], nome, { type: 'image/jpeg' });
const inputDaEtiqueta = (texto) => screen.getByText(texto).closest('label').querySelector('input[type="file"]');

beforeEach(() => {
  mocks.updates.length = 0;
  mocks.uploads.length = 0;
  mocks.removed.length = 0;
  mocks.uploadError = null;
  useAppStore.setState({ profile: PROFILE, raceEvents: [RACE], runs: [RACE_RUN] });
});

describe('RaceMemoriesSheet', () => {
  it('abre vazia, aceita a medalha e grava só as memórias — o status da prova não se toca', async () => {
    const onClose = vi.fn();
    render(<RaceMemoriesSheet race={RACE} userId="user-1" onClose={onClose} />);

    const guardar = await screen.findByTestId('race-memories-save');
    expect(guardar).toBeDisabled(); // nada mudou ainda

    await act(async () => {
      fireEvent.change(inputDaEtiqueta('Adicionar a medalha'), { target: { files: [ficheiroImagem('medalha.jpg')] } });
    });
    expect(await screen.findByAltText('Medalha da prova')).toBeInTheDocument();
    expect(guardar).toBeEnabled();

    fireEvent.click(guardar);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));

    expect(mocks.uploads).toEqual([{ bucket: 'race-memories', path: 'user-1/race-1/medal.jpg', contentType: 'image/jpeg' }]);
    const prova = mocks.updates.find(u => u.table === 'race_events');
    expect(prova.id).toBe('race-1');
    expect(prova.payload).toEqual({ diploma_path: null, medal_path: 'user-1/race-1/medal.jpg', photo_paths: [] });
    expect(prova.payload).not.toHaveProperty('status');
    // O store fica com os caminhos novos — o hub redesenha a galeria sem recarregar.
    expect(useAppStore.getState().raceEvents[0].medal_path).toBe('user-1/race-1/medal.jpg');
  });

  it('com memórias já guardadas mostra-as, e remover uma apaga-a do bucket ao gravar', async () => {
    const race = { ...RACE, medal_path: 'user-1/race-1/medal.jpg', photo_paths: ['user-1/race-1/photo-1.jpg'] };
    useAppStore.setState({ raceEvents: [race] });
    render(<RaceMemoriesSheet race={race} userId="user-1" onClose={() => {}} />);

    expect(await screen.findByAltText('Medalha da prova')).toHaveAttribute('src', 'https://signed/user-1/race-1/medal.jpg');
    expect(screen.getByTestId('race-photos-counter')).toHaveTextContent('1 de 6');

    fireEvent.click(screen.getByRole('button', { name: 'Remover a fotografia 1' }));
    fireEvent.click(screen.getByTestId('race-memories-save'));

    await waitFor(() => expect(mocks.updates).toHaveLength(1));
    expect(mocks.updates[0].payload).toEqual({ diploma_path: null, medal_path: 'user-1/race-1/medal.jpg', photo_paths: [] });
    expect(mocks.uploads).toEqual([]); // a medalha já lá estava — não se reenvia
    expect(mocks.removed).toEqual(['user-1/race-1/photo-1.jpg']);
  });

  it('se o envio falhar, avisa e deixa tentar de novo sem fechar', async () => {
    const onClose = vi.fn();
    mocks.uploadError = { message: 'rede' };
    render(<RaceMemoriesSheet race={RACE} userId="user-1" onClose={onClose} />);
    await screen.findByTestId('race-memories-save');
    await act(async () => {
      fireEvent.change(inputDaEtiqueta('Adicionar a medalha'), { target: { files: [ficheiroImagem()] } });
    });
    fireEvent.click(screen.getByTestId('race-memories-save'));

    expect(await screen.findByText('Memórias por guardar')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    mocks.uploadError = null;
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});

describe('RaceHubView — memórias depois da prova', () => {
  it('o convite abre a persiana aqui mesmo, sem reabrir o registo da corrida', async () => {
    render(<RaceHubView race={RACE} runs={[RACE_RUN]} profile={PROFILE} />);

    fireEvent.click(screen.getByTestId('race-memories-invite'));
    expect(await screen.findByTestId('race-memories-sheet')).toBeInTheDocument();
    expect(screen.getByText('Adicionar o diploma')).toBeInTheDocument();
    // Continua no hub: não se abriu o formulário da corrida.
    expect(useAppStore.getState().openCreationMode ?? null).toBeNull();
  });

  it('com galeria, o "Editar" abre a mesma persiana com o que já lá está', async () => {
    const race = { ...RACE, medal_path: 'user-1/race-1/medal.jpg' };
    render(<RaceHubView race={race} runs={[RACE_RUN]} profile={PROFILE} />);

    await screen.findByTestId('race-memories-gallery');
    fireEvent.click(screen.getByTestId('race-memories-edit'));
    const sheet = await screen.findByTestId('race-memories-sheet');
    await waitFor(() => expect(sheet.querySelector('img[alt="Medalha da prova"]')).toHaveAttribute('src', 'https://signed/user-1/race-1/medal.jpg'));
  });
});
