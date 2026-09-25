import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildRacePacingPlan } from '@formulas/racePacing.ts';

/* "Guardar como imagem" (ação P.13): o cartão pede a imagem a
   utils/racePlanImage.js e guarda-a ou partilha-a. O desenho em si
   testa-se lá; aqui só o que o cartão faz com ele. */

const img = vi.hoisted(() => ({
  renderRacePlanFile: vi.fn(),
  downloadFile: vi.fn(),
  shareOrDownload: vi.fn(),
}));
vi.mock('../../utils/racePlanImage', async (importOriginal) => ({
  ...(await importOriginal()),
  renderRacePlanFile: img.renderRacePlanFile,
  downloadFile: img.downloadFile,
  shareOrDownload: img.shareOrDownload,
}));

const { default: RacePacingPlanCard } = await import('./RacePacingPlanCard');

const race = { id: 'r1', name: 'Meia de Lisboa', date: '2026-09-20', start_time: '09:30:00', distance_km: 21.0975 };
const plan = buildRacePacingPlan({ distanceKm: 21.0975, raceType: 'estrada', targetSeconds: 105 * 60, predictedSeconds: 106 * 60 });
const FILE = new File(['x'], 'ironcoach-meia-de-lisboa-plano.jpg', { type: 'image/jpeg' });

describe('RacePacingPlanCard — guardar o plano como imagem (ação P.13)', () => {
  const originalShare = navigator.share;

  beforeEach(() => {
    img.renderRacePlanFile.mockReset().mockResolvedValue(FILE);
    img.downloadFile.mockReset();
    img.shareOrDownload.mockReset().mockResolvedValue('shared');
    navigator.share = undefined;
  });
  afterEach(() => { navigator.share = originalShare; });

  it('sem plano não há nada para guardar', () => {
    render(<RacePacingPlanCard plan={null} race={race} />);
    expect(screen.queryByTestId('race-pacing-save-image')).not.toBeInTheDocument();
  });

  it('guarda a imagem do plano que o cartão mostra', async () => {
    render(<RacePacingPlanCard plan={plan} race={race} />);
    fireEvent.click(screen.getByTestId('race-pacing-save-image'));
    await waitFor(() => expect(img.downloadFile).toHaveBeenCalledWith(FILE));
    expect(img.renderRacePlanFile).toHaveBeenCalledWith(plan, race);
    // Sem partilha no browser, não há botão de partilhar.
    expect(screen.queryByTestId('race-pacing-share-image')).not.toBeInTheDocument();
  });

  it('com partilha no telemóvel, partilhar abre a folha do sistema', async () => {
    navigator.share = vi.fn();
    render(<RacePacingPlanCard plan={plan} race={race} />);
    fireEvent.click(screen.getByLabelText('Partilhar o plano'));
    await waitFor(() => expect(img.shareOrDownload).toHaveBeenCalledWith(FILE, 'Plano · Meia de Lisboa'));
    expect(img.downloadFile).not.toHaveBeenCalled();
  });

  it('cancelar a partilha não é erro', async () => {
    navigator.share = vi.fn();
    img.shareOrDownload.mockRejectedValue(Object.assign(new Error('cancelado'), { name: 'AbortError' }));
    render(<RacePacingPlanCard plan={plan} race={race} />);
    fireEvent.click(screen.getByLabelText('Partilhar o plano'));
    await waitFor(() => expect(img.shareOrDownload).toHaveBeenCalled());
    expect(screen.queryByText(/Não consegui/)).not.toBeInTheDocument();
  });

  it('se a imagem falhar, diz-o e deixa tentar outra vez', async () => {
    img.renderRacePlanFile.mockRejectedValueOnce(new Error('sem canvas'));
    render(<RacePacingPlanCard plan={plan} race={race} />);
    fireEvent.click(screen.getByTestId('race-pacing-save-image'));
    await waitFor(() => expect(screen.getByText('Não consegui guardar a imagem. Tenta outra vez.')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Guardar a imagem' }));
    await waitFor(() => expect(img.downloadFile).toHaveBeenCalledWith(FILE));
    expect(screen.queryByText(/Não consegui/)).not.toBeInTheDocument();
  });
});
