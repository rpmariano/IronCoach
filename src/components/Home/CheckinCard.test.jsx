import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAppStore } from '../../store';
import { ToastProvider } from '../shared/ToastProvider';
import { todayISO } from '../../lib/utils';
import CheckinCard from './CheckinCard';
import { DIA_NORMAL } from '../../utils/checkinReply';

/* O check-in diário no Início (Fase 2 da omnisciência): dez segundos, três
   escalas, a dor com o local, e o ciclo só para quem se aplica e só depois de
   aceitar. A lógica dos alarmes está testada em utils/checkin e na fórmula
   partilhada; aqui é o que o atleta vê e o que chega ao store. */

const saveDailyCheckin = vi.fn();
const setCycleConsent = vi.fn();
const deleteAllCheckins = vi.fn();

const renderCard = () => render(<ToastProvider><CheckinCard /></ToastProvider>);

beforeEach(() => {
  saveDailyCheckin.mockReset().mockResolvedValue({ ok: true, alarms: [] });
  setCycleConsent.mockReset().mockResolvedValue(true);
  deleteAllCheckins.mockReset().mockResolvedValue(true);
  useAppStore.setState({ dailyCheckins: [], profile: { id: 'u1', gender: 'M' }, saveDailyCheckin, setCycleConsent, deleteAllCheckins });
});

describe('CheckinCard', () => {
  it('sem check-in hoje convida; o botão de guardar só acorda com as três escalas', async () => {
    renderCard();
    fireEvent.click(screen.getByTestId('checkin-card'));
    const guardar = screen.getByRole('button', { name: /Falta escolher/ });
    expect(guardar).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /Como dormiste\? 4 de 5/ }));
    fireEvent.click(screen.getByRole('button', { name: /Como está a energia\? 3 de 5/ }));
    fireEvent.click(screen.getByRole('button', { name: /E o stress\? 2 de 5/ }));
    fireEvent.change(screen.getByLabelText('Dores?'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Onde?'), { target: { value: 'gémeo direito' } });

    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(saveDailyCheckin).toHaveBeenCalledTimes(1));
    expect(saveDailyCheckin.mock.calls[0][0]).toEqual({ sleep: 4, energy: 3, stress: 2, pain: 5, pain_location: 'gémeo direito', period_today: null });
  });

  it('com o check-in de hoje feito, mostra o resumo e deixa editar', () => {
    useAppStore.setState({ dailyCheckins: [{ date: todayISO(), sleep: 4, energy: 3, stress: 1, pain: 0 }] });
    renderCard();
    expect(screen.getByTestId('checkin-card-done')).toHaveTextContent('Sono bom · Energia: normal · Stress: calmo · Sem dor');
    // Quem responde é ela, não um "guardado".
    // O dia normal diz-se de três maneiras, uma por dia (pedido 2026-09-26: cordial, não seco).
    expect(DIA_NORMAL).toContain(screen.getByTestId('checkin-reply').textContent);
    fireEvent.click(screen.getByRole('button', { name: 'Editar o check-in de hoje' }));
    expect(screen.getByRole('button', { name: /Como dormiste\? 4 de 5/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('o ciclo não aparece num perfil masculino', () => {
    renderCard();
    fireEvent.click(screen.getByTestId('checkin-card'));
    expect(screen.queryByText(/ciclo menstrual/)).not.toBeInTheDocument();
  });

  it('num perfil feminino, o ciclo só pergunta depois de aceitar', async () => {
    useAppStore.setState({ profile: { id: 'u1', gender: 'F', cycle_tracking_consent_at: null } });
    renderCard();
    fireEvent.click(screen.getByTestId('checkin-card'));
    expect(screen.queryByText('Estás menstruada hoje?')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Registar também o ciclo menstrual/ }));
    expect(screen.getByTestId('checkin-cycle-consent')).toHaveTextContent('RED-S');
    fireEvent.click(screen.getByRole('button', { name: 'Aceito registar' }));
    await waitFor(() => expect(setCycleConsent).toHaveBeenCalledWith(true));
  });

  it('com consentimento, a pergunta aparece e segue no check-in', async () => {
    useAppStore.setState({ profile: { id: 'u1', gender: 'F', cycle_tracking_consent_at: '2026-09-01T00:00:00Z' } });
    renderCard();
    fireEvent.click(screen.getByTestId('checkin-card'));
    fireEvent.click(screen.getByRole('button', { name: /Como dormiste\? 3 de 5/ }));
    fireEvent.click(screen.getByRole('button', { name: /Como está a energia\? 3 de 5/ }));
    fireEvent.click(screen.getByRole('button', { name: /E o stress\? 3 de 5/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Sim' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(saveDailyCheckin).toHaveBeenCalledTimes(1));
    expect(saveDailyCheckin.mock.calls[0][0].period_today).toBe(true);
  });
});

describe('CheckinCard — apagar os check-ins (privacidade)', () => {
  it('sem check-ins guardados, o botão não aparece', () => {
    renderCard();
    fireEvent.click(screen.getByTestId('checkin-card'));
    expect(screen.queryByText('Apagar todos os meus check-ins')).not.toBeInTheDocument();
  });

  it('pede confirmação, e só depois apaga', async () => {
    useAppStore.setState({ dailyCheckins: [{ date: '2026-09-01', sleep: 3 }, { date: '2026-09-02', sleep: 4 }] });
    renderCard();
    fireEvent.click(screen.getByTestId('checkin-card'));
    fireEvent.click(screen.getByRole('button', { name: 'Apagar todos os meus check-ins' }));
    expect(screen.getByTestId('checkin-delete-all')).toHaveTextContent('Apago os 2 check-ins');
    expect(deleteAllCheckins).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Apagar tudo' }));
    await waitFor(() => expect(deleteAllCheckins).toHaveBeenCalledTimes(1));
  });
});

// "Fazer o check-in" nas boas-vindas da manhã (2026-09-23): o pedido abre a
// persiana uma vez e limpa-se.
describe('CheckinCard — pedido das boas-vindas', () => {
  it('abre a persiana quando as boas-vindas o pedem, e consome o pedido', () => {
    useAppStore.setState({ checkinRequested: true });
    renderCard();
    expect(screen.getByTestId('checkin-sheet')).toBeInTheDocument();
    expect(useAppStore.getState().checkinRequested).toBe(false);
  });

  it('sem pedido, fica fechada', () => {
    useAppStore.setState({ checkinRequested: false });
    renderCard();
    expect(screen.queryByTestId('checkin-sheet')).not.toBeInTheDocument();
  });
});

