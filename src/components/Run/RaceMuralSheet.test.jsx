import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import RaceMuralSheet from './RaceMuralSheet';
import { useAppStore } from '../../store';

/* O estúdio do mural (pedido 2026-09-14): o atleta monta o mural — modelo,
   fotos nos espaços (arrastar e ampliar), grafismos. O Canvas não existe no
   jsdom: o desenho é substituído por um canvas falso e regista-se a
   composição pedida; as imagens carregadas ganham um tamanho combinado,
   para o enquadramento ter com que calcular. */

const mocks = vi.hoisted(() => ({ render: vi.fn(), dropped: [], updates: [], updateError: null }));
vi.mock('../../utils/muralStudioDraw', () => ({
  loadStudioAssets: vi.fn(async (urls) => ({
    images: Object.fromEntries((urls || []).map((u) => [u, { naturalWidth: 1200, naturalHeight: 1600 }])),
    logo: null,
  })),
  renderMuralStudio: (...args) => mocks.render(...args),
}));
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table) => ({
      update: (payload) => ({
        eq: (_col, id) => { mocks.updates.push({ table, payload, id }); return Promise.resolve({ error: mocks.updateError }); },
      }),
    }),
  },
}));

const RACE = { id: 'race-1', name: 'Corrida do Tejo', date: '2026-09-13', location: 'Lisboa', distance_km: 10, status: 'concluida', diploma_path: 'u/race-1/diploma.jpg' };
const RUN = { id: 'run-1', distance_km: 10.11, details: { official_time_seconds: 3087, gun_time_seconds: 3111, position: 1668 } };
const PHOTOS = ['https://s/p1.jpg', 'https://s/p2.jpg', 'https://s/p3.jpg', 'https://s/p4.jpg', 'https://s/p5.jpg', 'https://s/p6.jpg'];
const MEMORIES = { photos: PHOTOS, medal: 'https://s/medal.jpg', diploma: 'https://s/diploma.jpg' };
const fakeCanvas = () => ({ toDataURL: () => 'data:image/jpeg;base64,AAA', toBlob: (cb) => cb(new Blob(['x'], { type: 'image/jpeg' })) });

const lastComposition = () => mocks.render.mock.calls[mocks.render.mock.calls.length - 1][0].composition;
const open = (props = {}) => render(
  <RaceMuralSheet race={RACE} run={RUN} seconds={3087} classification="1668.º geral" achievements={[{ name: 'Prova concluída' }]} memoryUrls={MEMORIES} onClose={() => {}} {...props} />,
);

beforeEach(() => {
  mocks.dropped = [];
  mocks.updates.length = 0;
  mocks.updateError = null;
  mocks.render.mockReset().mockImplementation(() => ({ canvas: fakeCanvas(), dropped: mocks.dropped }));
  useAppStore.setState({ raceEvents: [RACE], runs: [RUN] });
});

describe('RaceMuralSheet — o estúdio', () => {
  it('abre com a Capa e a primeira foto; a pré-visualização mostra os espaços; sem legenda da Carol', async () => {
    open();
    await screen.findByTestId('race-mural-preview');
    expect(lastComposition()).toMatchObject({ template: 'capa', format: 'retrato', slots: { s1: { id: 'photo-0', zoom: 1 } } });
    expect(mocks.render.mock.calls[0][0]).toMatchObject({ scale: 0.4, placeholders: true });
    expect(screen.getByTestId('race-mural-slot-s1')).toHaveAttribute('aria-label', 'Espaço 1 · Foto 1');
    expect(screen.queryByText(/Legenda da Carol/)).not.toBeInTheDocument();
  });

  it('Modelo: o Mosaico de 6 leva as seis fotos; o formato muda', async () => {
    open();
    await screen.findByTestId('race-mural-preview');
    fireEvent.click(screen.getByTestId('race-mural-template-mosaico6'));
    await waitFor(() => expect(lastComposition().template).toBe('mosaico6'));
    expect(Object.values(lastComposition().slots).map((s) => s.id)).toEqual(['photo-0', 'photo-1', 'photo-2', 'photo-3', 'photo-4', 'photo-5']);
    expect(screen.getByTestId('race-mural-slot-s6')).toHaveAttribute('aria-label', 'Espaço 6 · Foto 6');

    fireEvent.click(screen.getByTestId('race-mural-format-story'));
    await waitFor(() => expect(lastComposition().format).toBe('story'));
    expect(screen.getByTestId('race-mural-format-story')).toHaveAttribute('aria-pressed', 'true');
  });

  it('Fotos: tocar num espaço na pré-visualização e escolher a medalha; "Tirar deste espaço" esvazia', async () => {
    open();
    await screen.findByTestId('race-mural-preview');
    fireEvent.click(screen.getByTestId('race-mural-template-mosaico4'));
    fireEvent.click(screen.getByTestId('race-mural-slot-s2'));
    expect(screen.getByTestId('race-mural-panel-fotos')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('race-mural-candidate-medal'));
    await waitFor(() => expect(lastComposition().slots.s2.id).toBe('medal'));
    expect(screen.getByTestId('race-mural-candidate-medal')).toHaveAttribute('aria-pressed', 'true');
    await screen.findByTestId('race-mural-crop');

    fireEvent.click(screen.getByRole('button', { name: 'Tirar deste espaço' }));
    await waitFor(() => expect(lastComposition().slots.s2).toBeUndefined());
    expect(screen.getByTestId('race-mural-slot-s2')).toHaveAttribute('aria-label', 'Espaço 2 · vazio');
    expect(screen.queryByTestId('race-mural-crop')).not.toBeInTheDocument();
  });

  it('arrastar a foto move o enquadramento; ampliar aperta o recorte; as setas ajustam', async () => {
    open();
    await screen.findByTestId('race-mural-preview');
    fireEvent.click(screen.getByTestId('race-mural-slot-s1'));
    const crop = await screen.findByTestId('race-mural-crop');

    // Arrasta para a direita: revela mais do lado esquerdo da foto, fx desce.
    fireEvent.pointerDown(crop, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(crop, { pointerId: 1, clientX: 140, clientY: 100 });
    fireEvent.pointerUp(crop, { pointerId: 1, clientX: 140, clientY: 100 });
    await waitFor(() => expect(lastComposition().slots.s1.fx).toBeLessThan(0.5));

    fireEvent.change(screen.getByTestId('race-mural-zoom'), { target: { value: '2' } });
    await waitFor(() => expect(lastComposition().slots.s1.zoom).toBe(2));

    const antes = lastComposition().slots.s1.fx;
    fireEvent.keyDown(crop, { key: 'ArrowRight' });
    await waitFor(() => expect(lastComposition().slots.s1.fx).toBeGreaterThan(antes));
  });

  it('Grafismos: sem parciais o ritmo não se liga e diz porquê; desligar, mudar a cor e o canto da marca', async () => {
    open();
    await screen.findByTestId('race-mural-preview');
    fireEvent.click(screen.getByTestId('race-mural-step-grafismos'));

    const ritmo = screen.getByTestId('race-mural-graphic-ritmo');
    expect(ritmo).toBeDisabled();
    expect(ritmo).toHaveTextContent('Sem parciais por km');
    expect(screen.getByTestId('race-mural-graphic-classificacao')).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(screen.getByTestId('race-mural-graphic-classificacao'));
    fireEvent.click(screen.getByTestId('race-mural-graphic-diploma'));
    fireEvent.click(screen.getByTestId('race-mural-theme-claro'));
    fireEvent.click(screen.getByTestId('race-mural-corner-br'));
    await waitFor(() => expect(lastComposition()).toMatchObject({ theme: 'claro', brandCorner: 'br', graphics: { classificacao: false, diploma: true } }));
  });

  it('o que não cabe diz-se por baixo da pré-visualização', async () => {
    mocks.dropped = ['diploma', 'ritmo'];
    open();
    expect(await screen.findByTestId('race-mural-dropped')).toHaveTextContent('Não coube neste formato: Cartão do diploma, Linha do ritmo por km');
  });

  it('partilhar compõe a imagem final, sem marcas de edição, e abre a partilha do telemóvel', async () => {
    const shareFn = vi.fn().mockResolvedValue();
    Object.assign(navigator, { share: shareFn, canShare: () => true });
    try {
      open();
      await screen.findByTestId('race-mural-preview');
      fireEvent.click(screen.getByTestId('race-mural-share'));
      await waitFor(() => expect(shareFn).toHaveBeenCalledTimes(1));
      expect(shareFn.mock.calls[0][0].files[0].name).toBe('ironcoach-corrida-do-tejo-retrato.jpg');
      expect(mocks.render).toHaveBeenLastCalledWith(expect.objectContaining({ scale: 1, placeholders: false }));
    } finally {
      delete navigator.share;
      delete navigator.canShare;
    }
  });
});

/* A composição grava-se na prova (pedido 2026-09-14), não mais no telemóvel:
   update à parte com debounce (600ms reais — curto o suficiente para
   esperar sem simular o relógio), como a hora da corrida. */
describe('RaceMuralSheet — a composição grava-se na prova', () => {
  it('lê a composição já gravada na prova (race.mural_composition), sem pedido à parte', async () => {
    const guardada = { version: 1, format: 'quadrado', template: 'trofeu', theme: 'ciano', brandCorner: 'br', slots: { s1: { id: 'medal', fx: 0.5, fy: 0.5, zoom: 1.5 } }, graphics: { titulo: true, tempo: true } };
    open({ race: { ...RACE, mural_composition: guardada } });
    await screen.findByTestId('race-mural-preview');
    expect(lastComposition()).toMatchObject({ format: 'quadrado', template: 'trofeu', theme: 'ciano' });
  });

  it('uma alteração grava-se por update à parte; onSaved recebe o patch e o store não é tocado diretamente', async () => {
    const onSaved = vi.fn();
    open({ onSaved });
    await screen.findByTestId('race-mural-preview');
    fireEvent.click(screen.getByTestId('race-mural-template-trofeu'));
    await waitFor(() => expect(lastComposition().template).toBe('trofeu'));

    expect(mocks.updates).toEqual([]); // ainda dentro do debounce
    await waitFor(() => expect(mocks.updates).toHaveLength(1), { timeout: 2000 });
    expect(mocks.updates[0]).toMatchObject({ table: 'race_events', id: 'race-1' });
    expect(mocks.updates[0].payload.mural_composition.template).toBe('trofeu');
    expect(onSaved).toHaveBeenCalledWith({ mural_composition: mocks.updates[0].payload.mural_composition });
    // Sem onSaved, escreveria direto no store — com onSaved, o store fica como estava.
    expect(useAppStore.getState().raceEvents[0].mural_composition).toBeUndefined();
  });

  it('sem onSaved, escreve direto no store ao gravar', async () => {
    open();
    await screen.findByTestId('race-mural-preview');
    fireEvent.click(screen.getByTestId('race-mural-template-trofeu'));
    await waitFor(() => expect(useAppStore.getState().raceEvents[0].mural_composition?.template).toBe('trofeu'), { timeout: 2000 });
  });

  it('fechar com uma alteração ainda por gravar (dentro do debounce) grava logo, em vez de a perder', async () => {
    const onSaved = vi.fn();
    const onClose = vi.fn();
    open({ onSaved, onClose });
    await screen.findByTestId('race-mural-preview');
    fireEvent.click(screen.getByTestId('race-mural-template-mosaico4'));
    await waitFor(() => expect(lastComposition().template).toBe('mosaico4'));
    expect(mocks.updates).toEqual([]);

    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    await waitFor(() => expect(mocks.updates).toHaveLength(1));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('uma falha ao gravar fica só na consola — não bloqueia a composição em ecrã', async () => {
    mocks.updateError = { message: 'rede' };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      open();
      await screen.findByTestId('race-mural-preview');
      fireEvent.click(screen.getByTestId('race-mural-template-trofeu'));
      await waitFor(() => expect(warn).toHaveBeenCalledWith('Composição do mural não gravada', expect.anything()), { timeout: 2000 });
      expect(lastComposition().template).toBe('trofeu');
    } finally {
      warn.mockRestore();
    }
  });
});
