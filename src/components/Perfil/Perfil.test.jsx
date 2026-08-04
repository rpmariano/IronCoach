import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAppStore } from '../../store';
import Perfil from './Perfil';

// Captura o payload de cada UPDATE para se poder afirmar o que é enviado.
const mocks = vi.hoisted(() => ({ updates: [] }));
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      update: (payload) => {
        mocks.updates.push(payload);
        return { eq: () => Promise.resolve({ error: null }) };
      },
    }),
    auth: { signOut: () => Promise.resolve({ error: null }) },
  },
}));

// Valores distintos entre si para as consultas por valor não serem ambíguas.
const PROFILE = {
  id: 'user-1',
  display_name: 'Atleta',
  gender: 'M',
  height_cm: 180,
  weight_kg: 81,
  calorie_goal: 2100,
  protein_goal: 155,
  carbs_goal: 205,
  fat_goal: 71,
  water_goal_ml: 2500,
};

const abrirMetas = () => fireEvent.click(screen.getByRole('button', { name: /Metas/ }));

const sujarCalorias = (valor) => {
  fireEvent.change(screen.getByDisplayValue('2100'), { target: { value: valor } });
};

describe('Perfil — rascunho vs recarregamento do perfil', () => {
  beforeEach(() => {
    mocks.updates.length = 0;
    useAppStore.setState({
      profile: PROFILE,
      session: { user: { email: 'atleta@ironhealth.app' } },
      navGuard: null,
      activeTab: 'perfil',
    });
  });

  it('mantém as alterações por gravar quando o perfil é recarregado do servidor', () => {
    render(<Perfil />);
    abrirMetas();
    sujarCalorias('2222');
    expect(screen.getByDisplayValue('2222')).toBeInTheDocument();

    /* loadInitialData corre a cada onAuthStateChange, incluindo TOKEN_REFRESHED
       (de hora a hora), e passa sempre um objeto novo. Depender da identidade
       do objeto apagava o rascunho sem aviso. */
    act(() => {
      useAppStore.getState().setProfile({ ...PROFILE });
    });

    expect(screen.getByDisplayValue('2222')).toBeInTheDocument();
  });

  it('mantém a guarda de saída registada depois desse recarregamento', () => {
    render(<Perfil />);
    abrirMetas();
    sujarCalorias('2222');
    expect(typeof useAppStore.getState().navGuard).toBe('function');

    act(() => {
      useAppStore.getState().setProfile({ ...PROFILE });
    });

    expect(typeof useAppStore.getState().navGuard).toBe('function');
  });

  it('recarrega o rascunho quando é outro perfil', () => {
    render(<Perfil />);
    abrirMetas();
    sujarCalorias('2222');

    act(() => {
      useAppStore.getState().setProfile({ ...PROFILE, id: 'user-2', calorie_goal: 1800 });
    });

    expect(screen.queryByDisplayValue('2222')).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('1800')).toBeInTheDocument();
  });

  it('trava a navegação para fora do Perfil com alterações pendentes', () => {
    render(<Perfil />);
    abrirMetas();
    sujarCalorias('2222');

    // O guard abre o aviso via setState do React — precisa de act para ser
    // processado antes de o consultarmos.
    let permitido;
    act(() => { permitido = useAppStore.getState().setActiveTab('ginasio'); });

    expect(permitido).toBe(false);
    expect(useAppStore.getState().activeTab).toBe('perfil');
    expect(screen.getByRole('dialog')).toHaveTextContent('Tens alterações por gravar');
  });

  it('deixa navegar sem alterações pendentes', () => {
    render(<Perfil />);
    abrirMetas();

    const permitido = useAppStore.getState().setActiveTab('ginasio');

    expect(permitido).toBe(true);
    expect(useAppStore.getState().activeTab).toBe('ginasio');
  });

  it('sair sem gravar reverte os campos para os valores do perfil', () => {
    render(<Perfil />);
    abrirMetas();
    sujarCalorias('2222');
    act(() => { useAppStore.getState().setActiveTab('ginasio'); });

    fireEvent.click(screen.getByRole('button', { name: 'Sair sem gravar' }));

    expect(useAppStore.getState().activeTab).toBe('ginasio');
    // Afirmar sobre o que está no ecrã, não sobre o store: o descartar nunca
    // escreve no store, por isso essa asserção passaria mesmo sem reverter.
    expect(screen.getByDisplayValue('2100')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('2222')).not.toBeInTheDocument();
  });

  it('grava só os campos alterados, sem tocar nos que o servidor também escreve', async () => {
    useAppStore.setState({
      profile: { ...PROFILE, water_last_activity_at: '2026-08-03T09:00:00Z', water_reminder_muted_date: null },
    });
    render(<Perfil />);
    abrirMetas();
    sujarCalorias('2222');

    fireEvent.click(screen.getByRole('button', { name: /Guardar altera/ }));

    await waitFor(() => expect(mocks.updates.length).toBe(1));
    const payload = mocks.updates[0];
    expect(payload).toEqual({ calorie_goal: 2222 });
    /* Enviar a linha inteira escrevia por cima destes dois, que o cron dos
       lembretes e o registo de água alteram do lado do servidor. */
    expect(payload).not.toHaveProperty('water_last_activity_at');
    expect(payload).not.toHaveProperty('water_reminder_muted_date');
    expect(payload).not.toHaveProperty('id');
  });

  it('terminar sessão com alterações pendentes passa pelo aviso', () => {
    render(<Perfil />);
    abrirMetas();
    sujarCalorias('2222');

    // O botão de terminar sessão vive no separador Pessoal — chegar lá com o
    // rascunho sujo já dispara o aviso, que é o comportamento a garantir.
    fireEvent.click(screen.getByRole('button', { name: /Pessoal/ }));

    expect(screen.getByRole('dialog')).toHaveTextContent('Tens alterações por gravar');
  });
});
