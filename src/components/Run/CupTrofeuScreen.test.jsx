import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAppStore } from '../../store';
import { ToastProvider } from '../shared/ToastProvider';
import CupTrofeuScreen from './CupTrofeuScreen';
import { buildCupView } from '../../utils/useCup';
import * as F from '@formulas/cup.fixtures.ts';

/* O ecrã do Troféu, mínimo da Fase 1 (specs/trofeu.md §4.3, 2026-09-26): a
   vista vem de buildCupView (a mesma função pura do hook, ver useCup.test.jsx)
   sobre as fixtures da 34.ª — assim o ecrã é testado com a forma real dos
   dados, não uma imitação. */

const TODAY = '2027-01-11';
const EDITION_ID = F.CASCAIS_34_ABERTA.id;

function makeView({ seasonGoal = 'premio', participations = [], isFederated = false } = {}) {
  const profile = { ...F.PERSONAS.cascais, id: 'u1' };
  const cup = {
    status: 'ready',
    userId: 'u1',
    editions: [{ ...F.CASCAIS_34_ABERTA, competition: F.CASCAIS_COMPETITION }],
    enrollments: [{
      id: 'enr-1', user_id: 'u1', edition_id: EDITION_ID, team_id: 't-ccd', team_other: null,
      is_federated: isFederated, season_goal: seasonGoal, bib: '42', status: 'ativa', notify_calendar: false,
    }],
    dismissals: [],
    catalog: {
      [EDITION_ID]: {
        status: 'ready', rounds: F.CASCAIS_ROUNDS, courses: F.CASCAIS_COURSES,
        overrides: F.CASCAIS_OVERRIDES, categories: F.CASCAIS_CATEGORIES, teams: F.CASCAIS_TEAMS,
      },
    },
    participations,
  };
  return buildCupView({ cup, profile, raceEvents: [], runs: [], today: TODAY });
}

const montar = (view, onClose = () => {}) => render(
  <ToastProvider><CupTrofeuScreen view={view} onClose={onClose} /></ToastProvider>,
);

describe('CupTrofeuScreen', () => {
  let setCupParticipations;
  let updateEnrollment;
  let leaveCup;

  beforeEach(() => {
    setCupParticipations = vi.fn().mockResolvedValue({ ok: true, results: [] });
    updateEnrollment = vi.fn().mockResolvedValue({ ok: true, data: {} });
    leaveCup = vi.fn().mockResolvedValue({ ok: true, data: {} });
    useAppStore.setState({ setCupParticipations, updateEnrollment, leaveCup });
  });

  it('mostra o cabeçalho e o contador com objetivo prémio', () => {
    montar(makeView({ seasonGoal: 'premio' }));
    expect(screen.getByTestId('cup-trofeu-cabecalho')).toHaveTextContent('CCD Cascais');
    expect(screen.getByTestId('cup-trofeu-contador')).toHaveTextContent('a confirmar');
  });

  it('sem objetivo prémio, não mostra o contador', () => {
    montar(makeView({ seasonGoal: 'participar' }));
    expect(screen.queryByTestId('cup-trofeu-contador')).not.toBeInTheDocument();
  });

  it('jornadas com data têm as três opções; canceladas e por anunciar não', () => {
    montar(makeView());
    expect(screen.getByTestId('cup-jornada-r-c3-vou')).toBeInTheDocument();
    expect(screen.getByTestId('cup-jornada-r-c3-nao_vou')).toBeInTheDocument();
    expect(screen.getByTestId('cup-jornada-r-c3-nao_sei')).toBeInTheDocument();

    expect(screen.getByTestId('cup-jornada-r-c6')).toHaveTextContent('Cancelada');
    expect(screen.queryByTestId('cup-jornada-r-c6-vou')).not.toBeInTheDocument();

    expect(screen.getByTestId('cup-jornada-r-c5')).toHaveTextContent('Data a anunciar');
    expect(screen.queryByTestId('cup-jornada-r-c5-vou')).not.toBeInTheDocument();

    // Já passou (10/01, hoje 11/01): sem "Vou" depois do dia — criava uma
    // prova agendada no passado (revisão pré-deploy da Fase 1).
    expect(screen.getByTestId('cup-jornada-r-c2')).toHaveTextContent('(já passou)');
    expect(screen.queryByTestId('cup-jornada-r-c2-vou')).not.toBeInTheDocument();
  });

  it('Confirmar grava as jornadas pendentes, uma vez cada, com decision_source atleta', async () => {
    montar(makeView({ seasonGoal: 'premio' }));
    fireEvent.click(screen.getByTestId('cup-confirmar'));
    await waitFor(() => expect(setCupParticipations).toHaveBeenCalledTimes(1));
    const items = setCupParticipations.mock.calls[0][0];
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.patch.decision_source === 'atleta')).toBe(true);
    expect(new Set(items.map((i) => i.roundId)).size).toBe(items.length);
  });

  it('"Decidir depois" esconde a barra sem gravar nada', () => {
    montar(makeView({ seasonGoal: 'premio' }));
    fireEvent.click(screen.getByTestId('cup-decidir-depois'));
    expect(screen.queryByTestId('cup-confirmar')).not.toBeInTheDocument();
    expect(setCupParticipations).not.toHaveBeenCalled();
  });

  it('mudar a decisão manualmente muda o que "Confirmar" vai gravar', async () => {
    montar(makeView({ seasonGoal: 'participar' })); // sem prémio, nada pré-marcado
    expect(screen.queryByTestId('cup-confirmar')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('cup-jornada-r-c3-nao_vou'));
    fireEvent.click(screen.getByTestId('cup-confirmar'));
    await waitFor(() => expect(setCupParticipations).toHaveBeenCalledTimes(1));
    const items = setCupParticipations.mock.calls[0][0];
    expect(items).toEqual([{ roundId: 'r-c3', patch: { decision: 'nao_vou', decision_source: 'atleta' } }]);
  });

  /* Revisão da Fase 1 (2026-09-26): o "Confirmar" lê o resultado de cada
     jornada — colisões com uma principal e erros parciais. */
  it('um "Vou" que volta por decidir (colisão com uma principal) é dito, não dá "Jornadas confirmadas."', async () => {
    setCupParticipations.mockResolvedValue({ ok: true, results: [{ roundId: 'r-c3', ok: true, collided: true }] });
    montar(makeView({ seasonGoal: 'participar' }));
    fireEvent.click(screen.getByTestId('cup-jornada-r-c3-vou'));
    fireEvent.click(screen.getByTestId('cup-confirmar'));
    expect(await screen.findByText('1 jornada ficou por decidir: é o dia de uma prova principal.')).toBeInTheDocument();
    expect(screen.queryByText('Jornadas confirmadas.')).not.toBeInTheDocument();
  });

  it('num erro parcial, as escolhas das jornadas que falharam ficam no rascunho', async () => {
    setCupParticipations.mockResolvedValue({
      ok: false,
      results: [{ roundId: 'r-c3', ok: true, collided: false }, { roundId: 'r-c4', ok: false, error: { message: 'x' } }],
    });
    montar(makeView({ seasonGoal: 'participar' }));
    fireEvent.click(screen.getByTestId('cup-jornada-r-c3-vou'));
    fireEvent.click(screen.getByTestId('cup-jornada-r-c4-nao_vou'));
    expect(screen.getByTestId('cup-confirmar')).toHaveTextContent('1 vou, 1 não vou');
    fireEvent.click(screen.getByTestId('cup-confirmar'));
    expect(await screen.findByText(/Uma jornada não gravou/)).toBeInTheDocument();
    // A que falhou continua escolhida e pendente; a que gravou saiu do rascunho.
    expect(screen.getByTestId('cup-jornada-r-c4-nao_vou').querySelector('input')).toBeChecked();
    expect(screen.getByTestId('cup-confirmar')).toHaveTextContent('0 vou, 1 não vou');
    fireEvent.click(screen.getByTestId('cup-confirmar'));
    await waitFor(() => expect(setCupParticipations).toHaveBeenCalledTimes(2));
    expect(setCupParticipations.mock.calls[1][0]).toEqual([{ roundId: 'r-c4', patch: { decision: 'nao_vou', decision_source: 'atleta' } }]);
  });

  it('Gerir inscrição — um federado também pode dizer que o clube não está na lista, nunca Individual', () => {
    montar(makeView({ isFederated: true }));
    fireEvent.click(screen.getByTestId('cup-abrir-gerir'));
    expect(screen.getByTestId('cup-gerir-clube-outro')).toBeInTheDocument();
    expect(document.getElementById('gerir-clube-t-ind')).toBeNull();
    expect(document.getElementById('gerir-clube-t-ccd')).not.toBeNull();
  });

  it('Gerir inscrição — sair pede confirmação antes de chamar leaveCup, e fecha o ecrã', async () => {
    const onClose = vi.fn();
    montar(makeView(), onClose);
    fireEvent.click(screen.getByTestId('cup-abrir-gerir'));
    fireEvent.click(screen.getByTestId('cup-gerir-sair'));
    fireEvent.click(screen.getByRole('button', { name: 'Sair' }));
    await waitFor(() => expect(leaveCup).toHaveBeenCalledWith('enr-1'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
