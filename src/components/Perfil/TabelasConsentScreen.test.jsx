import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAppStore } from '../../store';
import { ToastProvider } from '../shared/ToastProvider';
import TabelasConsentScreen from './TabelasConsentScreen';

/* A garantia que este ecrã existe para dar: DOIS interruptores separados,
   nunca encadeados, e a sério — `<input type="checkbox">` dentro de um
   `<label>`, não divs com onClick. */

const montar = () => render(
  <ToastProvider><TabelasConsentScreen onClose={() => {}} /></ToastProvider>,
);

const perfil = (extra = {}) => ({
  id: 'u1', display_name: 'Rui Pedro Mariano',
  stats_pool_consent_at: null, leaderboard_consent_at: null, leaderboard_display_name: null,
  ...extra,
});

describe('TabelasConsentScreen', () => {
  let setPrivacyConsent;

  beforeEach(() => {
    setPrivacyConsent = vi.fn().mockResolvedValue(true);
    useAppStore.setState({
      profile: perfil(),
      setPrivacyConsent,
      setLeaderboardDisplayName: vi.fn().mockResolvedValue(true),
    });
  });

  it('são interruptores a sério: checkbox dentro de label', () => {
    montar();
    for (const testId of ['tabelas-switch-stats-pool', 'tabelas-switch-leaderboard']) {
      const label = screen.getByTestId(testId);
      expect(label.tagName).toBe('LABEL');
      expect(label.querySelector('input[type="checkbox"]')).not.toBeNull();
    }
  });

  it('o segundo só fica disponível depois do primeiro — e diz porquê', () => {
    montar();
    const tabelas = screen.getByTestId('tabelas-switch-leaderboard').querySelector('input');
    expect(tabelas.disabled).toBe(true);
    expect(screen.getByTestId('tabelas-switch-leaderboard')).toHaveTextContent('Primeiro tens de contar para a média');
  });

  it('entrar na média não liga as tabelas: são duas decisões', async () => {
    montar();
    fireEvent.click(screen.getByTestId('tabelas-switch-stats-pool').querySelector('input'));
    await waitFor(() => expect(setPrivacyConsent).toHaveBeenCalledWith('stats_pool', true, { policyVersion: 'v2' }));
    expect(setPrivacyConsent).toHaveBeenCalledTimes(1);
    expect(setPrivacyConsent).not.toHaveBeenCalledWith('leaderboard', expect.anything());
  });

  it('com o primeiro dado, o segundo abre e continua por decidir', () => {
    useAppStore.setState({ profile: perfil({ stats_pool_consent_at: '2026-09-20T10:00:00Z' }) });
    montar();
    const tabelas = screen.getByTestId('tabelas-switch-leaderboard').querySelector('input');
    expect(tabelas.disabled).toBe(false);
    expect(tabelas.checked).toBe(false);
    expect(screen.getByTestId('tabelas-switch-stats-pool').querySelector('input').checked).toBe(true);
  });

  it('avisa que sair da média tira também das tabelas, antes de acontecer', () => {
    useAppStore.setState({
      profile: perfil({ stats_pool_consent_at: '2026-09-20T10:00:00Z', leaderboard_consent_at: '2026-09-20T10:05:00Z' }),
    });
    montar();
    expect(screen.getByTestId('tabelas-consent-screen')).toHaveTextContent('sais também da tabela');
  });

  it('diz o que se vê, o que nunca sai, e o nome abreviado que passaria a aparecer', () => {
    useAppStore.setState({ profile: perfil({ stats_pool_consent_at: '2026-09-20T10:00:00Z' }) });
    montar();
    expect(screen.getByTestId('tabelas-nunca-sai')).toHaveTextContent('Percursos e localização');
    expect(screen.getByTestId('tabelas-nunca-sai')).toHaveTextContent('A tua data de nascimento');
    expect(screen.getByTestId('tabelas-nunca-sai')).toHaveTextContent('O teu email');
    expect(screen.getByTestId('tabelas-passa-a-ver-se')).toHaveTextContent('O teu escalão etário');
    expect(screen.getByTestId('tabelas-switch-leaderboard')).toHaveTextContent('Rui M.');
  });

  it('cita o fundamento legal e o direito a retirar', () => {
    montar();
    const ecra = screen.getByTestId('tabelas-consent-screen');
    expect(ecra).toHaveTextContent('art. 9.º/2 a)');
    expect(ecra).toHaveTextContent('podes desligar a qualquer momento');
  });

  /* O ecrã tem de dizer que sair da média só vale no ciclo seguinte. A versão
     anterior prometia efeito imediato sobre as distribuições já publicadas, e
     isso não era verdade — nem passou a ser: refazer um agregado publicado
     para lhe tirar uma pessoa é o que a aponta. Uma promessa que não se cumpre
     num ecrã de consentimento é pior do que não a fazer. */
  it('diz a verdade sobre quando a saída da média produz efeito', () => {
    montar();
    const ecra = screen.getByTestId('tabelas-consent-screen');
    expect(ecra).toHaveTextContent('O teu nome sai da tabela na hora');
    expect(ecra).toHaveTextContent('Da média sais na atualização seguinte');
    expect(ecra).not.toHaveTextContent('efeito imediato');
  });

  /* Bug #43 (2026-09-22): o cartão do interruptor tem minHeight explícito e
     vive num flex em coluna com scroll — sem flexShrink 0 encolhia até 44px
     e o texto passava por cima do cartão seguinte ("ecrã partido no final"). */
  it('os cartões dos interruptores não encolhem', () => {
    useAppStore.setState({ profile: { id: 'u1', display_name: 'Rui Mariano' } });
    render(<TabelasConsentScreen onClose={() => {}} />);
    expect(screen.getByTestId('tabelas-switch-stats-pool')).toHaveStyle({ flexShrink: '0' });
    expect(screen.getByTestId('tabelas-switch-leaderboard')).toHaveStyle({ flexShrink: '0' });
  });
});
