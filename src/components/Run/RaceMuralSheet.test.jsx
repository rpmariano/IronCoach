import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import RaceMuralSheet from './RaceMuralSheet';
import { STUDIO_STORAGE_PREFIX } from '../../utils/muralStudio';

/* O estúdio do mural (pedido 2026-09-14): o atleta monta o mural — modelo,
   fotos nos espaços, grafismos. O Canvas não existe no jsdom: o desenho é
   substituído por um canvas falso e regista-se a composição pedida. */

const mocks = vi.hoisted(() => ({ render: vi.fn(), dropped: [] }));
vi.mock('../../utils/muralStudioDraw', () => ({
  loadStudioAssets: vi.fn(async () => ({ images: {}, logo: null })),
  renderMuralStudio: (...args) => mocks.render(...args),
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
  localStorage.clear();
  mocks.dropped = [];
  mocks.render.mockReset().mockImplementation(() => ({ canvas: fakeCanvas(), dropped: mocks.dropped }));
});

describe('RaceMuralSheet — o estúdio', () => {
  it('abre com a Capa e a primeira foto; a pré-visualização mostra os espaços; sem legenda da Carol', async () => {
    open();
    await screen.findByTestId('race-mural-preview');
    expect(lastComposition()).toMatchObject({ template: 'capa', format: 'retrato', slots: { s1: { id: 'photo-0' } } });
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

  it('Fotos: tocar num espaço na pré-visualização, escolher a medalha, mexer no foco com as setas', async () => {
    open();
    await screen.findByTestId('race-mural-preview');
    fireEvent.click(screen.getByTestId('race-mural-template-mosaico4'));
    fireEvent.click(screen.getByTestId('race-mural-slot-s2'));
    expect(screen.getByTestId('race-mural-panel-fotos')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('race-mural-candidate-medal'));
    await waitFor(() => expect(lastComposition().slots.s2.id).toBe('medal'));
    expect(screen.getByTestId('race-mural-candidate-medal')).toHaveAttribute('aria-pressed', 'true');

    fireEvent.keyDown(screen.getByTestId('race-mural-focus'), { key: 'ArrowRight' });
    await waitFor(() => expect(lastComposition().slots.s2.fx).toBeCloseTo(0.55));

    fireEvent.click(screen.getByRole('button', { name: 'Tirar deste espaço' }));
    await waitFor(() => expect(lastComposition().slots.s2).toBeUndefined());
    expect(screen.getByTestId('race-mural-slot-s2')).toHaveAttribute('aria-label', 'Espaço 2 · vazio');
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

  it('a composição fica guardada na prova e volta ao reabrir', async () => {
    const { unmount } = open();
    await screen.findByTestId('race-mural-preview');
    fireEvent.click(screen.getByTestId('race-mural-template-trofeu'));
    await waitFor(() => expect(JSON.parse(localStorage.getItem(`${STUDIO_STORAGE_PREFIX}race-1`)).template).toBe('trofeu'));
    unmount();

    mocks.render.mockClear();
    open();
    await screen.findByTestId('race-mural-preview');
    expect(mocks.render.mock.calls[0][0].composition).toMatchObject({ template: 'trofeu', slots: { s1: { id: 'medal' } } });
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
