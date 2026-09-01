import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { useAppStore } from '../../store';
import { supabase } from '../../lib/supabase';
import CreatedRecordModal from './CreatedRecordModal';

/* Regressão: CreatedRecordModal usava dismissedInterventions e
   dismissIntervention (ver linhas isDismissed/handleGoToChat) sem os
   desestruturar de useAppStore() — ReferenceError logo no render, sempre
   que newlyCreatedRecord tinha um record.id. Sem nenhum Error Boundary
   no topo da app (ver AppErrorBoundary), isto desmontava a app inteira:
   o atleta ficava com um ecrã completamente preto ao registar peso ou
   refeição por foto (finishCreateAndGoToCalendar → newlyCreatedRecord →
   este modal), tendo de fechar e reabrir a aplicação. */

vi.mock('../../store', () => ({
  useAppStore: vi.fn(),
}));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(() => Promise.resolve({ data: null, error: null })),
      delete: vi.fn().mockReturnThis(),
    })),
  },
}));

// Isola o teste da lógica interna de cada cartão — só interessa que
// CreatedRecordModal em si não rebente ao ler o store. Regista hideActions
// num atributo para confirmar que o modal pede ao cartão para esconder as
// suas próprias Ações (Editar/Eliminar) — ver descrição do bug em baixo.
vi.mock('../Run/RunCard', () => ({ default: (props) => <div data-testid="run-card" data-hide-actions={String(!!props.hideActions)} /> }));
vi.mock('../Gym/GymSessionCard', () => ({ default: (props) => <div data-testid="gym-card" data-hide-actions={String(!!props.hideActions)} /> }));
vi.mock('../Nutrition/MealCard', () => ({ default: (props) => <div data-testid="meal-card" data-hide-actions={String(!!props.hideActions)} /> }));
vi.mock('../Body/BodyAssessmentCard', () => ({ default: (props) => <div data-testid="body-card" data-hide-actions={String(!!props.hideActions)} /> }));

function mockStore(overrides = {}) {
  useAppStore.mockReturnValue({
    newlyCreatedRecord: null,
    clearNewlyCreatedRecord: vi.fn(),
    profile: { id: 'user-1' },
    setProfile: vi.fn(),
    setActiveTab: vi.fn(),
    setSelectedDate: vi.fn(),
    dismissedInterventions: {},
    dismissIntervention: vi.fn(),
    loadInitialData: vi.fn(() => Promise.resolve()),
    ...overrides,
  });
}

describe('CreatedRecordModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('não rebenta ao mostrar uma avaliação corporal recém-criada (registo por foto)', () => {
    mockStore({
      newlyCreatedRecord: { type: 'body', record: { id: 'a1', date: '2026-08-24', weight_kg: 79.2 } },
    });
    expect(() => render(<CreatedRecordModal />)).not.toThrow();
    expect(screen.getByTestId('body-card')).toBeInTheDocument();
  });

  it('não rebenta ao mostrar uma refeição recém-criada (registo por foto)', () => {
    mockStore({
      newlyCreatedRecord: { type: 'meal', record: { id: 'm1', date: '2026-08-24' } },
    });
    expect(() => render(<CreatedRecordModal />)).not.toThrow();
    expect(screen.getByTestId('meal-card')).toBeInTheDocument();
  });

  it('devolve null sem registo novo', () => {
    mockStore({ newlyCreatedRecord: null });
    const { container } = render(<CreatedRecordModal />);
    expect(container).toBeEmptyDOMElement();
  });

  /* Pedido do utilizador (2026-09-01): o "Eliminar avaliação" do cartão de
     pré-visualização era um botão só de decoração — o wrapper
     pointer-events-none do preview desativa-o — e vivia isolado lá em
     cima, longe de "Atualizar Registo"/"Fechar" (rodapé à parte). Os três
     botões devem de estar juntos no mesmo frame, e "Fechar" deve de ser o
     mais destacado dos três. */
  describe('Fechar, Atualizar Registo e Eliminar juntos', () => {
    it('mostra os três botões no mesmo frame, com "Fechar" como o mais destacado (variant primary)', () => {
      mockStore({
        newlyCreatedRecord: { type: 'body', record: { id: 'a1', date: '2026-08-24', weight_kg: 79.2 } },
      });
      render(<CreatedRecordModal />);

      // PremiumModal também tem o seu próprio X com aria-label="Fechar" —
      // filtra pelo texto visível do botão para apanhar só o nosso.
      const fechar = screen.getAllByRole('button', { name: 'Fechar' }).find((el) => el.textContent === 'Fechar');
      const atualizar = screen.getByRole('button', { name: /Atualizar Registo/i });
      const eliminar = screen.getByRole('button', { name: /^Eliminar$/i });

      // Mesmo contentor (frame) — o pai imediato comum aos três.
      expect(fechar.parentElement).toBe(atualizar.parentElement);
      expect(atualizar.parentElement).toBe(eliminar.parentElement);

      // "Fechar" é o variant="primary" (preenchido, cor de destaque) —
      // o mais visualmente destacado dos três; os outros dois são
      // variantes secundárias (outline/danger-outline).
      expect(fechar.className).toMatch(/bg-\[var\(--accent\)\]/);
      expect(atualizar.className).not.toMatch(/bg-\[var\(--accent\)\]/);
      expect(eliminar.className).not.toMatch(/bg-\[var\(--accent\)\]/);
    });

    it('pede ao cartão de pré-visualização para esconder as suas próprias Ações (Editar/Eliminar) — evita um "Eliminar" duplicado e inerte', () => {
      mockStore({
        newlyCreatedRecord: { type: 'body', record: { id: 'a1', date: '2026-08-24', weight_kg: 79.2 } },
      });
      render(<CreatedRecordModal />);
      expect(screen.getByTestId('body-card')).toHaveAttribute('data-hide-actions', 'true');
    });

    it('clicar em "Eliminar" abre a confirmação; "Cancelar" não elimina nada', async () => {
      mockStore({
        newlyCreatedRecord: { type: 'body', record: { id: 'a1', date: '2026-08-24', weight_kg: 79.2 } },
      });
      render(<CreatedRecordModal />);

      fireEvent.click(screen.getByRole('button', { name: /^Eliminar$/i }));

      // Duas modais abertas ao mesmo tempo — "Registo Guardado" (a de
      // fora) e a confirmação de eliminação (aninhada) — ambas com
      // role="dialog" e o mesmo id="modal-title" (PremiumModal), por isso
      // desambigua pelo conteúdo em vez do accessible name computado.
      const dialog = await waitFor(() => {
        const found = screen.getAllByRole('dialog').find((d) => within(d).queryByText(/Confirmar eliminação/i));
        expect(found).toBeTruthy();
        return found;
      });
      expect(within(dialog).getByText(/avaliação corporal/i)).toBeInTheDocument();

      fireEvent.click(within(dialog).getByRole('button', { name: /Cancelar/i }));

      await waitFor(() => expect(screen.queryByText(/Confirmar eliminação/i)).not.toBeInTheDocument());
      expect(supabase.from).not.toHaveBeenCalledWith('body_assessments');
    });

    it('confirmar a eliminação apaga o registo certo por tipo, recarrega os dados e fecha o modal', async () => {
      const clearNewlyCreatedRecord = vi.fn();
      const loadInitialData = vi.fn(() => Promise.resolve());
      mockStore({
        newlyCreatedRecord: { type: 'gym', record: { id: 'g1', date: '2026-08-24' } },
        clearNewlyCreatedRecord,
        loadInitialData,
      });
      render(<CreatedRecordModal />);

      fireEvent.click(screen.getByRole('button', { name: /^Eliminar$/i }));
      const dialog = await waitFor(() => {
        const found = screen.getAllByRole('dialog').find((d) => within(d).queryByText(/Confirmar eliminação/i));
        expect(found).toBeTruthy();
        return found;
      });
      fireEvent.click(within(dialog).getByRole('button', { name: /^Eliminar$/i }));

      await waitFor(() => expect(clearNewlyCreatedRecord).toHaveBeenCalled());
      expect(supabase.from).toHaveBeenCalledWith('workout_sessions');
      expect(loadInitialData).toHaveBeenCalledWith('user-1');
    });
  });
});
