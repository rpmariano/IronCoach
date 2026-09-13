import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAppStore } from '../../store';
import RaceMuralSheet from './RaceMuralSheet';

/* A persiana do mural (pedido 2026-09-13). O Canvas não existe no jsdom:
   o desenho é substituído por um canvas falso; a legenda vem do coach-chat
   (mock). */

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), render: vi.fn() }));
vi.mock('../../lib/supabase', () => ({
  supabase: {},
  invokeEdgeFunctionWithTimeout: (...args) => mocks.invoke(...args),
}));
vi.mock('../../utils/raceMural', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, renderRaceMural: (...args) => mocks.render(...args) };
});

const RACE = { id: 'race-1', name: 'Corrida do Tejo', date: '2026-09-13', distance_km: 10, status: 'concluida', target_time: '50:00', target_time_seconds: 3000, diploma_path: null };
const RUN = { id: 'run-1', kind: 'competicao', race_id: 'race-1', date: '2026-09-13', distance_km: 10.11, duration_seconds: 3088 };
const PROFILE = { id: 'user-1', display_name: 'Rui' };
const fakeCanvas = () => ({ toDataURL: () => 'data:image/jpeg;base64,AAA', toBlob: (cb) => cb(new Blob(['x'], { type: 'image/jpeg' })) });

beforeEach(() => {
  mocks.invoke.mockReset();
  mocks.render.mockReset().mockImplementation(async () => fakeCanvas());
  useAppStore.setState({ profile: PROFILE, raceEvents: [RACE], runs: [RUN] });
});

describe('RaceMuralSheet', () => {
  it('compõe o mural no formato escolhido com as fotos das memórias, o tempo e a distância', async () => {
    render(<RaceMuralSheet race={RACE} run={RUN} runs={[RUN]} profile={PROFILE} seconds={3088} memoryUrls={{ diploma: null, medal: 'https://s/medal.jpg', photos: ['https://s/p1.jpg'] }} onClose={() => {}} />);

    await screen.findByTestId('race-mural-preview');
    expect(mocks.render).toHaveBeenCalledWith(expect.objectContaining({
      format: 'retrato', seconds: 3088, distanceKm: 10.11, photoUrls: ['https://s/p1.jpg', 'https://s/medal.jpg'],
    }));
    expect(screen.getByText('2 fotografias das memórias, o teu tempo e a distância.')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('race-mural-format-story'));
    await waitFor(() => expect(mocks.render).toHaveBeenLastCalledWith(expect.objectContaining({ format: 'story' })));
    expect(screen.getByTestId('race-mural-format-story')).toHaveAttribute('aria-pressed', 'true');
  });

  it('a legenda pede-se à Carol e copia-se', async () => {
    mocks.invoke.mockResolvedValue({ data: { caption: 'Corrida do Tejo, 10 km em 51:28.\n\n#corrida #IronCoach' }, error: null });
    const writeText = vi.fn().mockResolvedValue();
    Object.assign(navigator, { clipboard: { writeText } });
    render(<RaceMuralSheet race={RACE} run={RUN} runs={[RUN]} profile={PROFILE} seconds={3088} memoryUrls={{ diploma: null, medal: null, photos: [] }} onClose={() => {}} />);

    fireEvent.click(screen.getByTestId('race-mural-ask-caption'));
    expect(await screen.findByTestId('race-mural-caption')).toHaveTextContent('#IronCoach');
    const body = JSON.parse(mocks.invoke.mock.calls[0][1].body);
    expect(body.race_caption).toBe(true);
    expect(body.race_outcome.official_seconds).toBe(3088);

    fireEvent.click(screen.getByTestId('race-mural-copy'));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining('#IronCoach')));
  });

  it('sem fotografias diz-o e compõe só com os números', async () => {
    render(<RaceMuralSheet race={RACE} run={RUN} runs={[RUN]} profile={PROFILE} seconds={3088} memoryUrls={{ diploma: null, medal: null, photos: [] }} onClose={() => {}} />);
    await screen.findByTestId('race-mural-preview');
    expect(screen.getByText(/Ainda sem fotografias nas memórias/)).toBeInTheDocument();
    expect(mocks.render).toHaveBeenCalledWith(expect.objectContaining({ photoUrls: [] }));
  });

  it('se o desenho falhar, avisa e não deixa partilhar', async () => {
    mocks.render.mockRejectedValue(new Error('rede'));
    render(<RaceMuralSheet race={RACE} run={RUN} runs={[RUN]} profile={PROFILE} seconds={3088} memoryUrls={{ diploma: null, medal: null, photos: ['https://s/p1.jpg'] }} onClose={() => {}} />);
    expect(await screen.findByText('Mural por compor')).toBeInTheDocument();
    expect(screen.getByTestId('race-mural-share')).toBeDisabled();
  });
});
