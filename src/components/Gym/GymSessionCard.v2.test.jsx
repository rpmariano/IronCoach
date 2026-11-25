import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { setDesignV2 } from '../../utils/designV2';

const showToast = vi.fn();
const loadInitialData = vi.fn(() => Promise.resolve());
const eqMock = vi.fn(() => Promise.resolve({ error: null }));
const createSignedUrls = vi.fn(() => Promise.resolve({ data: [{ signedUrl: 'https://x/p1.jpg' }], error: null }));

vi.mock('../../store', () => {
  const state = () => ({
    profile: { id: 'user-1' },
    loadInitialData,
    dismissedInterventions: {},
    dismissIntervention: vi.fn(),
    setCoachIntent: vi.fn(),
    setActiveTab: vi.fn(() => true),
  });
  const useAppStore = vi.fn(() => state());
  useAppStore.getState = state;
  return { useAppStore };
});

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({ delete: vi.fn(() => ({ eq: eqMock })) })),
    storage: { from: vi.fn(() => ({ createSignedUrls })) },
  },
}));

vi.mock('../shared/ToastProvider', () => ({ useToast: () => ({ showToast }) }));
vi.mock('../GraphicsLibrary/CarolMuscleAnatomy', () => ({ default: () => <div data-testid="anatomy" /> }));

import GymSessionCard from './GymSessionCard';
import { supabase } from '../../lib/supabase';

const session = {
  id: 'g1',
  date: '2026-11-20',
  start_time: '18:45:00',
  name: 'Treino A',
  kind: 'forca',
  categories: ['Peito'],
  notes: 'Boa sessão',
  exertion: 7,
  duration_seconds: 3600,
  coach_notes: '## Resumo\nVolume sólido no peito. Mantém a carga na próxima semana.',
  photo_paths: ['u/p1.jpg'],
  workout_session_sets: [
    { id: 's1', exercise_name: 'Supino', reps: 10, weight: 60 },
    { id: 's2', exercise_name: 'Supino', reps: 8, weight: 60 },
    { id: 's3', exercise_name: 'Remada', reps: 12, weight: 40 },
  ],
};

describe('GymSessionCard no Design v2', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
    act(() => setDesignV2(true));
  });
  afterEach(() => {
    act(() => setDesignV2(false));
  });

  it('mostra o bloco plano: ponto, título, hora e os números', () => {
    render(<GymSessionCard session={session} onEdit={vi.fn()} />);
    const card = screen.getByTestId('gym-card-v2');
    expect(card.querySelector('.v2-dot').style.background).toBe('var(--gym)');
    expect(screen.getByText('Treino A')).toBeInTheDocument();
    expect(screen.getByText(/20\/11\/2026 · 18:45/)).toBeInTheDocument();
    expect(within(screen.getByTestId('gym-v2-num-ex')).getByText('2')).toBeInTheDocument();
    expect(within(screen.getByTestId('gym-v2-num-ex')).getByText('exercícios')).toBeInTheDocument();
    // 10×60 + 8×60 + 12×40 = 1560 kg
    expect(within(screen.getByTestId('gym-v2-num-vol')).getByText(/1.?560/)).toBeInTheDocument();
    // As séries ficam atrás de «Ver tudo».
    expect(screen.queryByText('Supino')).toBeNull();
  });

  it('a linha da Carol abre no sítio com «Ler mais»', () => {
    render(<GymSessionCard session={session} />);
    const btn = screen.getByRole('button', { name: 'Ler mais' });
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText(/Volume sólido no peito/).closest('p')).toHaveClass('v2-card-gym-say-line');
    fireEvent.click(btn);
    const less = screen.getByRole('button', { name: 'Ler menos' });
    expect(less).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('gym-v2-carol').querySelector('.v2-card-gym-say-full')).not.toBeNull();
  });

  it('«Ver tudo» mostra as séries, as observações e as fotos (que abrem o print)', async () => {
    render(<GymSessionCard session={session} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ver tudo' }));
    expect(screen.getByRole('button', { name: 'Ver menos' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Supino')).toBeInTheDocument();
    expect(screen.getByText('Remada')).toBeInTheDocument();
    expect(screen.getAllByText(/Série 1/).length).toBe(2);
    expect(screen.getByText('Boa sessão')).toBeInTheDocument();
    expect(screen.getByText(/Esforço 7\/10/)).toBeInTheDocument();
    const link = await screen.findByRole('link', { name: 'Abrir print 1 do treino' });
    expect(link).toHaveAttribute('href', 'https://x/p1.jpg');
    expect(link).toHaveAttribute('target', '_blank');
    expect(createSignedUrls).toHaveBeenCalledWith(['u/p1.jpg'], 3600);
  });

  it('Editar chama onEdit com o id', () => {
    const onEdit = vi.fn();
    render(<GymSessionCard session={session} onEdit={onEdit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    expect(onEdit).toHaveBeenCalledWith('g1');
  });

  it('Eliminar pede a mesma confirmação e apaga o treino', async () => {
    render(<GymSessionCard session={session} />);
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar treino' }));
    expect(screen.getByText('Tem a certeza que deseja eliminar este treino? Esta ação não pode ser desfeita.')).toBeInTheDocument();
    const dialogBtns = screen.getAllByRole('button', { name: 'Eliminar' });
    fireEvent.click(dialogBtns[dialogBtns.length - 1]);
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Treino eliminado'));
    expect(supabase.from).toHaveBeenCalledWith('workout_sessions');
    expect(eqMock).toHaveBeenCalledWith('id', 'g1');
    expect(loadInitialData).toHaveBeenCalledWith('user-1');
  });

  it('hideActions esconde Editar e Eliminar; defaultExpanded abre a análise e os detalhes', async () => {
    render(<GymSessionCard session={session} onEdit={vi.fn()} defaultExpanded hideActions />);
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Eliminar treino' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Ler menos' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('gym-v2-details')).toBeInTheDocument();
    expect(screen.getByText('Supino')).toBeInTheDocument();
    // As fotos carregam também quando os detalhes já nascem abertos.
    expect(await screen.findByRole('link', { name: 'Abrir print 1 do treino' })).toBeInTheDocument();
  });

  it('com o v2 desligado, mostra o cartão de sempre', () => {
    act(() => setDesignV2(false));
    render(<GymSessionCard session={session} />);
    expect(screen.queryByTestId('gym-card-v2')).toBeNull();
    expect(screen.getByRole('button', { name: 'Ver detalhes do treino' })).toBeInTheDocument();
    expect(screen.getByText(`${(1560).toLocaleString('pt-PT')} kg`)).toBeInTheDocument();
  });
});
