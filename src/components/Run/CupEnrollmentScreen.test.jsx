import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAppStore } from '../../store';
import CupEnrollmentScreen from './CupEnrollmentScreen';
import { useCup } from '../../utils/useCup';
import { CUP_EMPTY } from '../../store/cupSlice';
import * as F from '@formulas/cup.fixtures.ts';

/* A inscrição no Troféu (specs/trofeu.md §4.2, Fase 1, 2026-09-26): os passos
   só aparecem quando fazem falta (género/nascimento, "quem te inscreve"), a
   escolha do clube valida-se com as mesmas funções do servidor, e só o botão
   final grava — nada a meio do caminho. */

vi.mock('../../lib/supabase', () => ({
  supabase: { from: () => ({ update: () => ({ eq: () => Promise.resolve({ error: null }) }) }) },
}));

const EDITION = { ...F.CASCAIS_34_ABERTA, competition: F.CASCAIS_COMPETITION };
// O setProfile verdadeiro do store, antes de o beforeEach o trocar por um mock.
const REAL_SET_PROFILE = useAppStore.getState().setProfile;

function baseView(overrides = {}) {
  return {
    edition: EDITION,
    teams: F.CASCAIS_TEAMS,
    catalogReady: true,
    rounds: F.CASCAIS_ROUNDS,
    profileMissing: { gender: false, birthDate: false },
    ...overrides,
  };
}

describe('CupEnrollmentScreen', () => {
  let enrollCup;
  let setProfile;

  beforeEach(() => {
    enrollCup = vi.fn().mockResolvedValue({ ok: true, data: { id: 'enr-1' } });
    setProfile = vi.fn();
    useAppStore.setState({
      profile: { id: 'u1', gender: 'M', birth_date: '1983-01-24' },
      enrollCup,
      setProfile,
    });
  });

  const passo = (testId) => fireEvent.click(screen.getByTestId(testId));

  it('percorre os passos e inscreve-se com o que foi escolhido', async () => {
    const onEnrolled = vi.fn();
    render(<CupEnrollmentScreen view={baseView()} onClose={() => {}} onEnrolled={onEnrolled} />);

    expect(screen.getByTestId('cup-enrollment-edicao')).toBeInTheDocument();
    passo('cup-enrollment-continuar'); // edição → federado

    passo('cup-federado-nao');
    passo('cup-enrollment-continuar'); // federado → clube

    // Sem escolher clube, não avança.
    expect(screen.getByTestId('cup-enrollment-continuar')).toBeDisabled();
    passo('cup-clube-t-ccd');
    expect(screen.getByTestId('cup-clube-kind')).toBeInTheDocument();
    expect(screen.getByTestId('cup-enrollment-continuar')).not.toBeDisabled();
    passo('cup-enrollment-continuar'); // clube → objetivo

    passo('cup-enrollment-continuar'); // objetivo (participar por omissão) → dorsal

    fireEvent.change(screen.getByTestId('cup-dorsal-input'), { target: { value: '123' } });
    passo('cup-enrollment-continuar'); // dorsal → quem_inscreve (entry_mode por_jornada)

    passo('cup-entrada-eu');
    passo('cup-enrollment-continuar'); // quem_inscreve → privacidade

    expect(screen.getByTestId('cup-privacidade')).toBeInTheDocument();
    passo('cup-enrollment-submeter');

    await waitFor(() => expect(enrollCup).toHaveBeenCalledTimes(1));
    expect(enrollCup).toHaveBeenCalledWith(EDITION.id, {
      season_goal: 'participar',
      is_federated: false,
      bib: '123',
      team_id: 't-ccd',
      entry_by: 'atleta',
    });
    await waitFor(() => expect(onEnrolled).toHaveBeenCalledWith({ id: 'enr-1' }));
  });

  it('federado nunca vê Individual na lista de clubes', () => {
    render(<CupEnrollmentScreen view={baseView()} onClose={() => {}} />);
    passo('cup-enrollment-continuar'); // edição → federado
    passo('cup-federado-sim');
    passo('cup-enrollment-continuar'); // federado → clube
    expect(screen.queryByTestId('cup-clube-t-ind')).not.toBeInTheDocument();
  });

  it('género e nascimento em falta pedem-se antes de inscrever, e gravam-se no perfil', async () => {
    useAppStore.setState({ profile: { id: 'u1', gender: null, birth_date: null } });
    const onEnrolled = vi.fn();
    render(<CupEnrollmentScreen view={baseView({ profileMissing: { gender: true, birthDate: true } })} onClose={() => {}} onEnrolled={onEnrolled} />);

    passo('cup-enrollment-continuar'); // edição → federado
    passo('cup-federado-nao');
    passo('cup-enrollment-continuar'); // federado → clube
    passo('cup-clube-t-ind'); // Individual
    passo('cup-enrollment-continuar'); // clube → objetivo
    passo('cup-enrollment-continuar'); // objetivo → dorsal
    passo('cup-enrollment-continuar'); // dorsal → perfil

    // Sem género nem nascimento, não avança.
    expect(screen.getByTestId('cup-enrollment-continuar')).toBeDisabled();
    passo('cup-genero-f');
    fireEvent.change(screen.getByTestId('cup-nascimento'), { target: { value: '1990-05-10' } });
    expect(screen.getByTestId('cup-enrollment-continuar')).not.toBeDisabled();
    passo('cup-enrollment-continuar'); // perfil → quem_inscreve

    await waitFor(() => expect(setProfile).toHaveBeenCalledWith(expect.objectContaining({ gender: 'F', birth_date: '1990-05-10' })));

    passo('cup-entrada-nao-sei');
    passo('cup-enrollment-continuar'); // quem_inscreve → privacidade
    passo('cup-enrollment-submeter');

    await waitFor(() => expect(enrollCup).toHaveBeenCalledTimes(1));
    expect(enrollCup.mock.calls[0][1]).toMatchObject({ team_id: 't-ind', entry_by: null });
  });

  it('federado vê "O meu clube não está na lista" e inscreve-se com ele (§4.2.2)', async () => {
    render(<CupEnrollmentScreen view={baseView()} onClose={() => {}} />);
    passo('cup-enrollment-continuar'); // edição → federado
    passo('cup-federado-sim');
    passo('cup-enrollment-continuar'); // federado → clube
    expect(screen.queryByTestId('cup-clube-t-ind')).not.toBeInTheDocument();
    passo('cup-clube-outro');
    // Sem nome ainda não serve.
    expect(screen.getByTestId('cup-enrollment-continuar')).toBeDisabled();
    fireEvent.change(screen.getByTestId('cup-clube-outro-nome'), { target: { value: 'Clube Federado de Fora' } });
    expect(screen.getByTestId('cup-enrollment-continuar')).not.toBeDisabled();
    expect(screen.getByTestId('cup-clube-kind')).toHaveTextContent('por confirmar');
    passo('cup-enrollment-continuar'); // clube → objetivo
    passo('cup-enrollment-continuar'); // objetivo → dorsal
    passo('cup-enrollment-continuar'); // dorsal → quem_inscreve
    passo('cup-enrollment-continuar'); // quem_inscreve → privacidade
    passo('cup-enrollment-submeter');
    await waitFor(() => expect(enrollCup).toHaveBeenCalledTimes(1));
    expect(enrollCup.mock.calls[0][1]).toMatchObject({ is_federated: true, team_other: 'Clube Federado de Fora' });
    expect(enrollCup.mock.calls[0][1]).not.toHaveProperty('team_id');
  });

  it('o texto de privacidade diz o que o administrador consegue inferir (§4.2.8)', () => {
    render(<CupEnrollmentScreen view={baseView()} onClose={() => {}} />);
    for (let i = 0; i < 6; i += 1) {
      if (screen.queryByTestId('cup-federado-nao')) passo('cup-federado-nao');
      if (screen.queryByTestId('cup-clube-t-ccd')) passo('cup-clube-t-ccd');
      if (screen.queryByTestId('cup-privacidade')) break;
      passo('cup-enrollment-continuar');
    }
    const texto = screen.getByTestId('cup-privacidade').textContent;
    expect(texto).toMatch(/«Vou»/);
    expect(texto).toMatch(/administrador da app/);
    expect(texto).toMatch(/que corres o Troféu/);
    expect(texto).not.toMatch(/continua igual/);
  });

  /* Com o store REAL (revisão da Fase 1, 2026-09-26): a vista vem do
     useCup(), e gravar o género/nascimento no passo 'perfil' põe
     profileMissing a false no render seguinte. Antes, os passos saíam desse
     valor vivo e o índice saltava um. */
  describe('com a vista viva do useCup()', () => {
    function ComHook(props) {
      const view = useCup();
      return view ? <CupEnrollmentScreen view={view} onClose={() => {}} {...props} /> : null;
    }

    function prepararStore(edition) {
      const semPerfil = { ...F.PERSONAS.cascais, id: 'u1', gender: null, birth_date: null };
      useAppStore.setState({
        session: null,
        setProfile: REAL_SET_PROFILE,
        profile: semPerfil,
        raceEvents: [],
        runs: [],
        cup: {
          ...CUP_EMPTY,
          status: 'ready',
          userId: 'u1',
          editions: [edition],
          enrollments: [],
          dismissals: [],
          catalog: {
            [edition.id]: {
              status: 'ready', rounds: F.CASCAIS_ROUNDS, courses: F.CASCAIS_COURSES,
              overrides: F.CASCAIS_OVERRIDES, categories: F.CASCAIS_CATEGORIES, teams: F.CASCAIS_TEAMS,
            },
          },
        },
      });
    }

    async function ateAoPerfil() {
      passo('cup-enrollment-continuar'); // edição → federado
      passo('cup-federado-nao');
      passo('cup-enrollment-continuar'); // federado → clube
      passo('cup-clube-t-ccd');
      passo('cup-enrollment-continuar'); // clube → objetivo
      passo('cup-enrollment-continuar'); // objetivo → dorsal
      passo('cup-enrollment-continuar'); // dorsal → perfil
      passo('cup-genero-f');
      fireEvent.change(screen.getByTestId('cup-nascimento'), { target: { value: '1990-05-10' } });
      passo('cup-enrollment-continuar'); // perfil → (grava no perfil)
      await waitFor(() => expect(useAppStore.getState().profile).toMatchObject({ gender: 'F', birth_date: '1990-05-10' }));
    }

    it('por_jornada: depois de gravar o perfil vem "Quem te inscreve", e o entry_by chega à RPC', async () => {
      prepararStore(EDITION);
      render(<ComHook />);
      expect(screen.getByText(/Passo 1 de 8/)).toBeInTheDocument();
      await ateAoPerfil();

      // O passo seguinte é mesmo "quem te inscreve" — não saltou.
      expect(await screen.findByTestId('cup-entrada-eu')).toBeInTheDocument();
      expect(screen.getByText(/Passo 7 de 8/)).toBeInTheDocument();
      passo('cup-entrada-clube');
      passo('cup-enrollment-continuar'); // → privacidade
      expect(screen.getByTestId('cup-privacidade')).toBeInTheDocument();
      passo('cup-enrollment-submeter');
      await waitFor(() => expect(enrollCup).toHaveBeenCalledTimes(1));
      expect(enrollCup.mock.calls[0][1]).toMatchObject({ team_id: 't-ccd', entry_by: 'clube' });
    });

    it('sem por_jornada: depois de gravar o perfil vem a privacidade e o botão final (nunca um ecrã vazio)', async () => {
      prepararStore({ ...EDITION, entry_mode: 'epoca' });
      render(<ComHook />);
      expect(screen.getByText(/Passo 1 de 7/)).toBeInTheDocument();
      await ateAoPerfil();

      expect(await screen.findByTestId('cup-privacidade')).toBeInTheDocument();
      expect(screen.getByText(/Passo 7 de 7/)).toBeInTheDocument();
      passo('cup-enrollment-submeter');
      await waitFor(() => expect(enrollCup).toHaveBeenCalledTimes(1));
      expect(enrollCup.mock.calls[0][1]).not.toHaveProperty('entry_by');
    });
  });

  it('sem calendário publicado, o botão final é "Avisa-me quando sair" e liga só esse aviso', async () => {
    render(<CupEnrollmentScreen view={baseView({ rounds: [] })} onClose={() => {}} />);
    passo('cup-enrollment-continuar'); // edição → federado
    passo('cup-federado-nao');
    passo('cup-enrollment-continuar');
    passo('cup-clube-t-ind');
    passo('cup-enrollment-continuar'); // clube → objetivo
    passo('cup-enrollment-continuar'); // objetivo → dorsal
    passo('cup-enrollment-continuar'); // dorsal → quem_inscreve

    passo('cup-entrada-nao-sei');
    passo('cup-enrollment-continuar'); // → privacidade

    expect(screen.getByTestId('cup-enrollment-submeter')).toHaveTextContent('Avisa-me quando sair');
    passo('cup-enrollment-submeter');
    await waitFor(() => expect(enrollCup).toHaveBeenCalledTimes(1));
    expect(enrollCup.mock.calls[0][1]).toMatchObject({ notify_calendar: true });
  });
});
