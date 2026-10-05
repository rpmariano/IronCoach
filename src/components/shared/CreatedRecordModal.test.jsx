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
    setActiveTab: vi.fn(() => true),
    setCoachIntent: vi.fn(),
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
     cima, longe de "Fechar" (rodapé à parte).

     Desde 2026-10-05 (convenção única dos botões da Carol) sair é só o X
     do cabeçalho (aria-label "Fechar"): o botão "Fechar" do rodapé saiu, e
     fica o "Eliminar", a única ação que não é sair.

     Havia um terceiro, "Atualizar registo" — saiu (2026-09-21): "acabamos
     de o submeter, atualização só se for ver o detalhe". Editar continua
     possível a partir do cartão do dia no Calendário. */
  describe('Fechar (o X) e Eliminar', () => {
    it('sair é só o X do cabeçalho: não há botão "Fechar" no rodapé', async () => {
      const clearNewlyCreatedRecord = vi.fn();
      mockStore({
        newlyCreatedRecord: { type: 'body', record: { id: 'a1', date: '2026-08-24', weight_kg: 79.2 } },
        clearNewlyCreatedRecord,
      });
      render(<CreatedRecordModal />);

      const fechar = screen.getAllByRole('button', { name: 'Fechar' });
      // Só o X do PremiumModal — sem texto visível "Fechar".
      expect(fechar).toHaveLength(1);
      expect(fechar[0].textContent).not.toBe('Fechar');
      expect(screen.getByRole('button', { name: /^Eliminar$/i })).toBeInTheDocument();

      fireEvent.click(fechar[0]);
      // O PremiumModal fecha depois da animação de saída.
      await waitFor(() => expect(clearNewlyCreatedRecord).toHaveBeenCalled());
    });

    it('não mostra "Atualizar registo" — o registo acabou de ser submetido, não há nada por atualizar ainda', () => {
      mockStore({
        newlyCreatedRecord: { type: 'body', record: { id: 'a1', date: '2026-08-24', weight_kg: 79.2 } },
      });
      render(<CreatedRecordModal />);
      expect(screen.queryByRole('button', { name: /Atualizar registo/i })).not.toBeInTheDocument();
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

  /* Convenção única dos botões da Carol (2026-10-05): a intervenção só
     aparece quando é DESTE registo, "Falar com a Carol" não dispensa e
     "Dispensar" grava a dispensa com a chave única do tipo. */
  describe('a intervenção da Carol neste registo', () => {
    const corrida = (over = {}) => ({ id: 'r1', date: '2026-10-05', name: 'Rodagem', coach_notes: 'Corrida dura. Vamos adaptar o plano para a semana.', ...over });

    it('aparece com "Falar com a Carol" em cima e "Dispensar" por baixo', () => {
      mockStore({ newlyCreatedRecord: { type: 'run', record: corrida() } });
      render(<CreatedRecordModal />);
      const falar = screen.getByRole('button', { name: 'Falar com a Carol' });
      const dispensar = screen.getByRole('button', { name: 'Dispensar este aviso' });
      expect(dispensar).toHaveTextContent('Dispensar');
      expect(falar.compareDocumentPosition(dispensar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(falar.querySelector('svg.lucide-message-circle')).not.toBeNull();
    });

    it('não aparece por uma intervenção do perfil que não é deste registo', () => {
      mockStore({
        newlyCreatedRecord: { type: 'run', record: corrida({ coach_notes: 'Boa corrida.' }) },
        profile: { id: 'user-1', coach_intervention_status: 'needed', coach_intervention_reason: 'Carga alta esta semana' },
      });
      render(<CreatedRecordModal />);
      expect(screen.queryByRole('button', { name: 'Falar com a Carol' })).not.toBeInTheDocument();
    });

    it('aparece pela marca que a análise deste registo devolveu, com o motivo do perfil', () => {
      const setCoachIntent = vi.fn();
      mockStore({
        newlyCreatedRecord: { type: 'meal', record: { id: 'm1', date: '2026-10-05', intervention_needed: true, coach_notes: 'Pouca proteína.' } },
        profile: { id: 'user-1', coach_intervention_status: 'needed', coach_intervention_reason: 'Proteína abaixo do plano' },
        setCoachIntent,
      });
      render(<CreatedRecordModal />);
      fireEvent.click(screen.getByRole('button', { name: 'Falar com a Carol' }));
      expect(setCoachIntent).toHaveBeenCalledWith(expect.objectContaining({
        kind: 'proactive_intervention', recordType: 'meal', recordId: 'm1', reason: 'Proteína abaixo do plano',
      }));
    });

    it('"Falar com a Carol" leva o registo ao chat e fecha — sem dispensar', () => {
      const dismissIntervention = vi.fn();
      const setCoachIntent = vi.fn();
      const setActiveTab = vi.fn(() => true);
      const clearNewlyCreatedRecord = vi.fn();
      mockStore({ newlyCreatedRecord: { type: 'run', record: corrida() }, dismissIntervention, setCoachIntent, setActiveTab, clearNewlyCreatedRecord });
      render(<CreatedRecordModal />);
      fireEvent.click(screen.getByRole('button', { name: 'Falar com a Carol' }));
      expect(setCoachIntent).toHaveBeenCalledWith(expect.objectContaining({ kind: 'proactive_intervention', recordType: 'run', recordId: 'r1' }));
      expect(setActiveTab).toHaveBeenCalledWith('coach');
      expect(clearNewlyCreatedRecord).toHaveBeenCalled();
      expect(dismissIntervention).not.toHaveBeenCalled();
    });

    it('"Dispensar" grava a dispensa com a chave única do tipo e não muda de separador', () => {
      const dismissIntervention = vi.fn();
      const setActiveTab = vi.fn(() => true);
      const record = corrida({ ai_analysis: 'outro texto' });
      mockStore({ newlyCreatedRecord: { type: 'run', record }, dismissIntervention, setActiveTab });
      render(<CreatedRecordModal />);
      fireEvent.click(screen.getByRole('button', { name: 'Dispensar este aviso' }));
      expect(dismissIntervention).toHaveBeenCalledWith('r1', record.coach_notes);
      expect(setActiveTab).not.toHaveBeenCalled();
    });

    it('já dispensada (pela chave única ou pela marca antiga) não aparece', () => {
      mockStore({ newlyCreatedRecord: { type: 'run', record: corrida() }, dismissedInterventions: { r1: 'dismissed' } });
      const { unmount } = render(<CreatedRecordModal />);
      expect(screen.queryByRole('button', { name: 'Falar com a Carol' })).not.toBeInTheDocument();
      unmount();
      mockStore({ newlyCreatedRecord: { type: 'run', record: corrida() }, dismissedInterventions: { r1: corrida().coach_notes } });
      render(<CreatedRecordModal />);
      expect(screen.queryByRole('button', { name: 'Falar com a Carol' })).not.toBeInTheDocument();
    });
  });
});
