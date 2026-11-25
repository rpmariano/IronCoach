import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { setDesignV2 } from '../../utils/designV2';
import BodyAssessmentCard from './BodyAssessmentCard';

/* O cartão da avaliação corporal no Design v2: a linha plana (ponto, título, hora), o peso e a
   gordura em números grandes, a Carol numa linha com «Ler mais», as outras medidas atrás de «Ver
   tudo», Editar e Eliminar discretos com o mesmo diálogo de sempre. */

const loadInitialData = vi.fn(() => Promise.resolve());
const showToast = vi.fn();
const eqMock = vi.fn(() => Promise.resolve({ error: null }));
const deleteMock = vi.fn(() => ({ eq: eqMock }));
const fromMock = vi.fn(() => ({ delete: deleteMock }));

vi.mock('../../store', () => {
  const useAppStore = () => ({ profile: { id: 'u1' }, loadInitialData });
  useAppStore.getState = () => useAppStore();
  return { useAppStore };
});
vi.mock('../../lib/supabase', () => ({ supabase: { from: (...a) => fromMock(...a) } }));
vi.mock('../shared/ToastProvider', () => ({ useToast: () => ({ showToast }) }));
vi.mock('../shared/CarolInterventionActions', () => ({
  default: (props) => <div data-testid="carol-intervention" data-type={props.type} />,
}));

const LONG = '**Composição** A gordura desceu e a massa muscular manteve-se, o que é o sinal que procuramos nesta fase. Continua com a proteína alta e o treino de força duas vezes por semana.';
const A = {
  id: 'b1',
  date: '2026-11-20',
  assessment_time: '08:15',
  weight_kg: 76.4,
  body_fat_pct: 19.8,
  muscle_mass_kg: 57.2,
  bmi: 23.1,
  notes: 'Em jejum.',
  ai_summary: LONG,
};

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
  act(() => setDesignV2(true));
});
afterEach(() => {
  act(() => setDesignV2(false));
});

describe('BodyAssessmentCard · Design v2', () => {
  it('mostra a linha plana: ponto do Corpo, título, data e hora, peso e gordura', () => {
    render(<BodyAssessmentCard assessment={A} onEdit={vi.fn()} />);
    const card = screen.getByTestId('v2-card-body');
    expect(within(card).getByTestId('v2-card-body-dot')).toHaveStyle({ background: 'var(--body)' });
    expect(within(card).getByText('Avaliação corporal')).toBeInTheDocument();
    expect(screen.getByTestId('v2-card-body-time')).toHaveTextContent('20/11/2026 · 08:15');
    expect(screen.getByTestId('v2-card-body-num-weight_kg')).toHaveTextContent('76,4kg');
    expect(screen.getByTestId('v2-card-body-num-body_fat_pct')).toHaveTextContent('19,8%');
    // O cartão de sempre não está lá.
    expect(screen.queryByRole('button', { name: 'Ver detalhes da avaliação' })).not.toBeInTheDocument();
  });

  it('a Carol numa linha, e «Ler mais» abre a análise toda no sítio', () => {
    render(<BodyAssessmentCard assessment={A} />);
    const toggle = screen.getByTestId('v2-card-body-carol-toggle');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveTextContent('Ler mais');
    expect(screen.queryByTestId('v2-card-body-carol-full')).not.toBeInTheDocument();
    expect(screen.getByTestId('v2-card-body-carol')).toHaveTextContent('Carol. Composição A gordura desceu');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveTextContent('Ler menos');
    expect(screen.getByTestId('v2-card-body-carol-full')).toHaveTextContent('treino de força duas vezes por semana');
  });

  it('«Ver tudo» mostra as outras medidas e as observações', () => {
    render(<BodyAssessmentCard assessment={A} />);
    const toggle = screen.getByTestId('v2-card-body-details-toggle');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('v2-card-body-details')).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('v2-card-body-metric-muscle_mass_kg')).toHaveTextContent('Massa muscular57,2 kg');
    expect(screen.getByTestId('v2-card-body-metric-bmi')).toHaveTextContent('IMC23,1');
    expect(screen.queryByTestId('v2-card-body-metric-weight_kg')).not.toBeInTheDocument();
    expect(screen.getByTestId('v2-card-body-details')).toHaveTextContent('Em jejum.');
  });

  it('Editar chama onEdit com o id', () => {
    const onEdit = vi.fn();
    render(<BodyAssessmentCard assessment={A} onEdit={onEdit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    expect(onEdit).toHaveBeenCalledWith('b1');
  });

  it('Eliminar abre a mesma confirmação e apaga como antes', async () => {
    render(<BodyAssessmentCard assessment={A} onEdit={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar avaliação' }));
    expect(await screen.findByText('Tem a certeza que deseja eliminar esta avaliação corporal? Esta ação não pode ser desfeita.')).toBeInTheDocument();
    expect(fromMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Avaliação eliminada'));
    expect(fromMock).toHaveBeenCalledWith('body_assessments');
    expect(eqMock).toHaveBeenCalledWith('id', 'b1');
    expect(loadInitialData).toHaveBeenCalledWith('u1');
  });

  it('hideActions esconde Editar, Eliminar e a intervenção da Carol', () => {
    render(<BodyAssessmentCard assessment={A} onEdit={vi.fn()} hideActions />);
    expect(screen.queryByTestId('v2-card-body-actions')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('carol-intervention')).not.toBeInTheDocument();
  });

  it('sem hideActions, mostra a intervenção da Carol do tipo body', () => {
    render(<BodyAssessmentCard assessment={A} />);
    expect(screen.getByTestId('carol-intervention')).toHaveAttribute('data-type', 'body');
  });

  it('defaultExpanded abre a análise toda e as medidas', () => {
    render(<BodyAssessmentCard assessment={A} defaultExpanded hideActions />);
    expect(screen.getByTestId('v2-card-body-carol-toggle')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('v2-card-body-carol-full')).toHaveTextContent('treino de força');
    expect(screen.getByTestId('v2-card-body-details')).toBeInTheDocument();
  });

  it('sem análise, não há linha da Carol', () => {
    render(<BodyAssessmentCard assessment={{ ...A, ai_summary: null }} />);
    expect(screen.queryByTestId('v2-card-body-carol')).not.toBeInTheDocument();
  });

  it('com o v2 desligado, mostra o cartão de sempre', () => {
    act(() => setDesignV2(false));
    render(<BodyAssessmentCard assessment={A} />);
    expect(screen.queryByTestId('v2-card-body')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver detalhes da avaliação' })).toBeInTheDocument();
    expect(screen.getByText('76.4 kg')).toBeInTheDocument();
  });
});
