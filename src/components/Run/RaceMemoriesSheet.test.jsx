import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import RaceMemoriesSheet from './RaceMemoriesSheet';
import RaceHubView from './RaceHubView';
import { useAppStore } from '../../store';

/* Memórias depois da prova (pedido 2026-09-13): concluir a prova é registar
   a corrida; o diploma, a medalha e as fotos juntam-se quando chegarem, no
   ecrã do hub — sem reabrir o registo da corrida. */

const mocks = vi.hoisted(() => ({ updates: [], uploads: [], removed: [], uploadError: null, diploma: null }));
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
  // O hub pede o balanço à Carol ao montar (RaceBalanceCard); a persiana
  // pede a leitura do diploma (analyze-diploma).
  invokeEdgeFunctionWithTimeout: (fn) => (fn === 'analyze-diploma'
    ? Promise.resolve(mocks.diploma || { data: null, error: 'Não consegui ler nada neste diploma.' })
    : Promise.resolve({ data: { model_message: { id: 'm1', content: 'Balanço de teste.' }, suggestions: [] }, error: null })),
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
  mocks.diploma = null;
  useAppStore.setState({ profile: PROFILE, raceEvents: [RACE], runs: [RACE_RUN] });
});

/* A Carol lê o diploma que chega depois (pedido 2026-09-13): o diploma
   junta-se aqui, dias depois da corrida registada pelos prints do relógio,
   e "Aplicar à corrida" grava o tempo de chip e a classificação na corrida
   já gravada — sem reabrir o registo. */
describe('RaceMemoriesSheet — a Carol lê o diploma que chega depois', () => {
  const TEJO = { athlete_name: 'RUI MARIANO', chip_time_seconds: 3087, gun_time_seconds: 3111, position: 1668, age_group_position: 226, splits: [{ km: 5, seconds: 1515 }] };

  /* O diploma é o documento oficial da prova: o que se lê dele entra sozinho
     na corrida, por cima do que estava. Era preciso tocar em "Aplicar", e os
     números ficavam de fora quando ninguém tocava — foi o que aconteceu a
     quem o reportou, com três leituras bem sucedidas e nada aplicado. */
  it('ao juntar o diploma, lê-o e grava sozinho em runs.details, por cima do manual', async () => {
    mocks.diploma = { data: { reading: TEJO }, error: null };
    render(<RaceMemoriesSheet race={RACE} run={RACE_RUN} userId="user-1" onClose={() => {}} />);
    await screen.findByTestId('race-memories-save');
    await act(async () => {
      fireEvent.change(inputDaEtiqueta('Adicionar o diploma'), { target: { files: [ficheiroImagem('diploma.jpg')] } });
    });

    const leitura = await screen.findByTestId('diploma-reading');
    await waitFor(() => expect(leitura).toHaveAttribute('data-status', 'applied'));
    expect(leitura).toHaveTextContent('tempo de chip 51:27 (bruto 51:51) · 1668.º geral · 226.º no escalão · passagem aos 5 km 25:15');
    // O cartão está mesmo por baixo do diploma, não no fim da persiana.
    expect(screen.getByText('Diploma').parentElement).toContainElement(leitura);
    // Sem passar por nenhum botão.
    expect(screen.queryByRole('button', { name: 'Aplicar à corrida' })).not.toBeInTheDocument();

    expect(mocks.updates).toEqual([{ table: 'runs', id: 'run-1', payload: { details: {
      official_time_seconds: 3087, position: 1668, age_group_position: 226, gun_time_seconds: 3111, official_splits: [{ km: 5, seconds: 1515 }],
    } } }]);
    // A corrida no store já leva o tempo oficial — o hub redesenha sem recarregar.
    expect(useAppStore.getState().runs[0].details.official_time_seconds).toBe(3087);
    // O diploma em si ainda está por guardar.
    expect(screen.getByTestId('race-memories-save')).toBeEnabled();
    expect(leitura).toHaveTextContent('Guarda as memórias para ficares com o diploma');
  });

  it('sem corrida registada não há leitura; com a leitura falhada, diz porquê e deixa preencher à mão', async () => {
    mocks.diploma = { data: { reading: TEJO }, error: null };
    const { unmount } = render(<RaceMemoriesSheet race={RACE} run={null} userId="user-1" onClose={() => {}} />);
    await screen.findByTestId('race-memories-save');
    await act(async () => {
      fireEvent.change(inputDaEtiqueta('Adicionar o diploma'), { target: { files: [ficheiroImagem('diploma.jpg')] } });
    });
    expect(await screen.findByAltText('Diploma da prova')).toBeInTheDocument();
    expect(screen.queryByTestId('diploma-reading')).not.toBeInTheDocument();
    unmount();

    mocks.diploma = null; // a analyze-diploma responde com erro (texto)
    render(<RaceMemoriesSheet race={RACE} run={RACE_RUN} userId="user-1" onClose={() => {}} />);
    await screen.findByTestId('race-memories-save');
    await act(async () => {
      fireEvent.change(inputDaEtiqueta('Adicionar o diploma'), { target: { files: [ficheiroImagem('diploma.jpg')] } });
    });
    const leitura = await screen.findByTestId('diploma-reading');
    await waitFor(() => expect(leitura).toHaveAttribute('data-status', 'failed'));
    expect(leitura).toHaveTextContent('Não consegui ler nada neste diploma. Podes acrescentar à mão');
    expect(mocks.updates).toEqual([]);
  });
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

describe('RaceMemoriesSheet — quem monta trata do store', () => {
  it('com onSaved, entrega o patch e não escreve no store por conta própria', async () => {
    const onSaved = vi.fn();
    const onClose = vi.fn();
    render(<RaceMemoriesSheet race={RACE} userId="user-1" onSaved={onSaved} onClose={onClose} />);
    await screen.findByTestId('race-memories-save');
    await act(async () => {
      fireEvent.change(inputDaEtiqueta('Adicionar a medalha'), { target: { files: [ficheiroImagem()] } });
    });
    fireEvent.click(screen.getByTestId('race-memories-save'));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onSaved).toHaveBeenCalledWith({ diploma_path: null, medal_path: 'user-1/race-1/medal.jpg', photo_paths: [] });
    // O RunAgenda escreve pelo seu writeRaceEventsLocally; aqui o store fica igual.
    expect(useAppStore.getState().raceEvents[0].medal_path).toBeUndefined();
  });
});

describe('RaceHubView — memórias depois da prova', () => {
  it('o convite abre o ecrã aqui mesmo, sem reabrir o registo da corrida', async () => {
    render(<RaceHubView race={RACE} runs={[RACE_RUN]} profile={PROFILE} />);

    fireEvent.click(screen.getByTestId('race-memories-invite'));
    expect(await screen.findByTestId('race-memories-sheet')).toBeInTheDocument();
    expect(screen.getByText('Adicionar o diploma')).toBeInTheDocument();
    // Continua no hub: não se abriu o formulário da corrida.
    expect(useAppStore.getState().openCreationMode ?? null).toBeNull();
  });

  it('com galeria, o "Editar" abre o mesmo ecrã com o que já lá está', async () => {
    const race = { ...RACE, medal_path: 'user-1/race-1/medal.jpg' };
    render(<RaceHubView race={race} runs={[RACE_RUN]} profile={PROFILE} />);

    await screen.findByTestId('race-memories-gallery');
    fireEvent.click(screen.getByTestId('race-memories-edit'));
    const sheet = await screen.findByTestId('race-memories-sheet');
    await waitFor(() => expect(sheet.querySelector('img[alt="Medalha da prova"]')).toHaveAttribute('src', 'https://signed/user-1/race-1/medal.jpg'));
  });
});
