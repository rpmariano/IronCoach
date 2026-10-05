import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import CoachInsightModal from './CoachInsightModal';
import { useAppStore } from '../../store';
import { todayISO } from '../../lib/utils';

vi.mock('../../store', () => ({
  useAppStore: vi.fn(),
}));

describe('CoachInsightModal', () => {
  const mockSetInsightState = vi.fn();
  const mockSnoozeInsight = vi.fn();
  const mockSetActiveTab = vi.fn();
  const mockSetCoachIntent = vi.fn();
  const mockLogImpressionDismissed = vi.fn();
  const mockOnClose = vi.fn();

  const acwr = {
    id: 'insight-1',
    title: 'Carga de Treino Excessiva (ACWR)',
    message: 'O teu ACWR está em 1.79 — acima do limiar de 1.5. Risco elevado de lesão.',
    module: 'corrida',
    metric: 'ACWR',
    value: 1.79,
    severity: 'critical',
  };
  const sapatilhas = {
    id: 'insight-2',
    title: 'Sapatilhas perto do fim',
    message: 'Vai pensando no par seguinte.',
    module: 'corrida',
    severity: 'info',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.mockReturnValue({
      setInsightState: mockSetInsightState,
      snoozeInsight: mockSnoozeInsight,
      setActiveTab: mockSetActiveTab,
      setCoachIntent: mockSetCoachIntent,
      logImpressionDismissed: mockLogImpressionDismissed,
    });
  });

  it('renderiza o insight com o título, a mensagem, o módulo e a métrica', () => {
    render(<CoachInsightModal insights={[acwr]} onClose={mockOnClose} />);

    expect(screen.getByText('Insights da Carol')).toBeInTheDocument();
    expect(screen.getByText('Carga de Treino Excessiva (ACWR)')).toBeInTheDocument();
    expect(screen.getByText(/O teu ACWR está em 1.79/i)).toBeInTheDocument();
    expect(screen.getByText('corrida')).toBeInTheDocument();
    expect(screen.getByText(/ACWR: 1.8/i)).toBeInTheDocument();
  });

  /* Pedido 2026-09-27: "Falar com a Carol", "Percebi" (era "Entendido") e
     "Agora não" (era "Ignorar") juntos, no fim de CADA cartão — o
     "Entendido" vivia no cartão e os outros dois no rodapé, para o conjunto. */
  it('as três ações vivem juntas dentro do cartão, e o rodapé não tem nenhuma', () => {
    render(<CoachInsightModal insights={[acwr, sapatilhas]} onClose={mockOnClose} />);

    for (const id of ['insight-1', 'insight-2']) {
      const cartao = screen.getByTestId(`insight-${id}`);
      expect(within(cartao).getByRole('button', { name: 'Falar com a Carol' })).toBeInTheDocument();
      expect(within(cartao).getByRole('button', { name: 'Percebi' })).toBeInTheDocument();
      expect(within(cartao).getByRole('button', { name: /^Agora não/ })).toBeInTheDocument();
    }
    // Uma cópia por cartão, nenhuma solta no rodapé.
    expect(screen.getAllByRole('button', { name: 'Falar com a Carol' })).toHaveLength(2);
    // Ícone único da convenção (2026-10-05): o balão, não a faísca.
    for (const falar of screen.getAllByRole('button', { name: 'Falar com a Carol' })) {
      expect(falar.querySelector('svg.lucide-message-circle')).not.toBeNull();
      expect(falar.querySelector('svg.lucide-sparkles')).toBeNull();
    }
    // Ordem: Falar em cima; Percebi à esquerda e Agora não à direita.
    const botoes = within(screen.getByTestId('insight-insight-1')).getAllByRole('button').map((b) => b.textContent);
    expect(botoes).toEqual(['Falar com a Carol', 'Percebi', 'Agora não']);
    expect(screen.queryByRole('button', { name: /Entendido|Ignorar/ })).not.toBeInTheDocument();
  });

  it('"Falar com a Carol" leva esse insight ao chat e marca-o como percebido — sem registar dispensa', () => {
    render(<CoachInsightModal insights={[acwr, sapatilhas]} onClose={mockOnClose} />);

    fireEvent.click(within(screen.getByTestId('insight-insight-1')).getByRole('button', { name: 'Falar com a Carol' }));

    expect(mockSetInsightState).toHaveBeenCalledTimes(1);
    expect(mockSetInsightState).toHaveBeenCalledWith('insight-1', 'understood');
    expect(mockSetCoachIntent).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'proactive_intervention',
      reason: expect.stringContaining('Carga de Treino Excessiva (ACWR)'),
    }));
    expect(mockSetCoachIntent.mock.calls[0][0].reason).not.toContain('Sapatilhas');
    expect(mockSetActiveTab).toHaveBeenCalledWith('coach');
    expect(mockOnClose).toHaveBeenCalled();
    expect(mockLogImpressionDismissed).not.toHaveBeenCalled();
  });

  it('"Percebi" marca como percebido e tira o cartão — sem registar dispensa', () => {
    render(<CoachInsightModal insights={[acwr, sapatilhas]} onClose={mockOnClose} />);

    fireEvent.click(screen.getByTestId('insight-understood-insight-1'));

    expect(mockSetInsightState).toHaveBeenCalledWith('insight-1', 'understood');
    expect(mockSnoozeInsight).not.toHaveBeenCalled();
    expect(mockLogImpressionDismissed).not.toHaveBeenCalled();
    expect(screen.queryByTestId('insight-insight-1')).not.toBeInTheDocument();
    // Ainda há outro por ver: a janela fica.
    expect(screen.getByTestId('insight-insight-2')).toBeInTheDocument();
    expect(mockOnClose).not.toHaveBeenCalled();
  });

  /* "Agora não" é a dispensa real (ação 5.1): fica em coach_impressions com
     a chave e o título do insight, para a Carol e o outro telemóvel saberem;
     e sai do botão até amanhã (snoozeInsight com o dia de hoje). */
  it('"Agora não" marca como posto de lado até amanhã e regista a dispensa', () => {
    render(<CoachInsightModal insights={[acwr]} onClose={mockOnClose} />);

    fireEvent.click(screen.getByTestId('insight-snooze-insight-1'));

    expect(mockSetInsightState).toHaveBeenCalledWith('insight-1', 'ignored');
    expect(mockSnoozeInsight).toHaveBeenCalledWith('insight-1', todayISO());
    expect(mockLogImpressionDismissed).toHaveBeenCalledTimes(1);
    expect(mockLogImpressionDismissed).toHaveBeenCalledWith({ kind: 'insights', key: 'insight-1', title: 'Carga de Treino Excessiva (ACWR)' });
    // Era o único: a janela fecha.
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('com a saída travada, "Falar com a Carol" não dá o insight por tratado e desfaz o pedido', () => {
    mockSetActiveTab.mockReturnValueOnce(false);
    render(<CoachInsightModal insights={[acwr]} onClose={mockOnClose} />);
    fireEvent.click(screen.getByTestId('insight-talk-insight-1'));
    expect(mockSetInsightState).not.toHaveBeenCalled();
    expect(mockSetCoachIntent).toHaveBeenLastCalledWith(null);
  });

  it('"Agora não" diz a quem usa leitor de ecrã que volta amanhã', () => {
    render(<CoachInsightModal insights={[acwr]} onClose={mockOnClose} />);
    const agoraNao = screen.getByTestId('insight-snooze-insight-1');
    expect(agoraNao.textContent).toBe('Agora não');
    expect(agoraNao).toHaveAccessibleName('Agora não — volta amanhã, se ainda se aplicar');
  });

  /* Um só código de cores e símbolos (pedido 2026-09-27, noticeTones.js):
     o mesmo do botão flutuante. */
  it('o cartão leva a gravidade do insight', () => {
    render(<CoachInsightModal insights={[acwr, sapatilhas]} onClose={mockOnClose} />);
    expect(screen.getByTestId('insight-insight-1')).toHaveAttribute('data-severity', 'critical');
    expect(screen.getByTestId('insight-insight-2')).toHaveAttribute('data-severity', 'info');
  });

  describe('avisos em que a Carol pede para falar', () => {
    const alerta = (over = {}) => ({ id: 'plano', severity: 'warning', title: 'O plano precisa de um ajuste', message: 'A Corrida do Tejo não está no plano.', onTalk: vi.fn(), ...over });

    it('o mesmo cartão: "Falar com a Carol" chama o dele e fecha; sem "Percebi"', () => {
      const a = alerta();
      render(<CoachInsightModal alerts={[a]} onClose={mockOnClose} />);

      const cartao = screen.getByTestId('carol-alert-plano');
      expect(cartao).toHaveTextContent('A Corrida do Tejo não está no plano.');
      expect(cartao).toHaveAttribute('data-severity', 'warning');
      // Uma conversa por ter não se "percebe": sai quando o assunto se resolve.
      expect(within(cartao).queryByRole('button', { name: 'Percebi' })).not.toBeInTheDocument();
      // O ajuste do plano não se dispensa (sem onDismiss).
      expect(screen.queryByTestId('carol-alert-dismiss-plano')).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId('carol-alert-talk-plano'));
      expect(screen.getByTestId('carol-alert-talk-plano')).toHaveTextContent('Falar com a Carol');
      expect(a.onTalk).toHaveBeenCalledTimes(1);
      expect(mockSetCoachIntent).not.toHaveBeenCalled();
      expect(mockOnClose).toHaveBeenCalled();
    });

    const balanco = (over = {}) => alerta({
      id: 'balanco', severity: 'info', title: 'O balanço da prova',
      message: 'Corrida do Tejo: quero fazer o balanço contigo.', onDismiss: vi.fn(), ...over,
    });
    const assuntos = (over = {}) => alerta({
      id: 'assuntos', title: 'Preciso de falar contigo',
      message: 'Há um registo teu que quero ver contigo.', onDismiss: vi.fn(), dismissLabel: 'Dispensar este assunto', ...over,
    });

    /* Pedido 2026-09-27: nos avisos dela a dispensa é de vez, por isso o
       botão diz "Dispensar" — o "Agora não" (até amanhã) é só dos insights. */
    it('"Dispensar" nos avisos que se podem dispensar: o aviso todo', () => {
      const a = balanco();
      render(<CoachInsightModal alerts={[a]} onClose={mockOnClose} />);
      const dispensar = screen.getByTestId('carol-alert-dismiss-balanco');
      expect(dispensar.textContent).toBe('Dispensar');
      expect(dispensar).toHaveAccessibleName('Dispensar este aviso');
      expect(screen.getByTestId('carol-alert-balanco')).not.toHaveTextContent('Agora não');
      fireEvent.click(dispensar);
      expect(a.onDismiss).toHaveBeenCalledTimes(1);
      expect(mockOnClose).toHaveBeenCalled();
    });

    /* Revisão pré-deploy 2026-09-27: em "Preciso de falar contigo" só a
       intervenção se dispensa — um assunto, não o aviso todo. */
    it('"Dispensar" na intervenção diz ao leitor de ecrã que é um assunto', () => {
      render(<CoachInsightModal alerts={[assuntos()]} onClose={mockOnClose} />);
      const dispensar = screen.getByTestId('carol-alert-dismiss-assuntos');
      expect(dispensar.textContent).toBe('Dispensar');
      expect(dispensar).toHaveAccessibleName('Dispensar este assunto');
    });

    it('com avisos e insights: "Dispensar" no aviso, "Agora não" no insight', () => {
      render(<CoachInsightModal alerts={[balanco()]} insights={[acwr]} onClose={mockOnClose} />);
      expect(screen.getByTestId('carol-alert-dismiss-balanco').textContent).toBe('Dispensar');
      expect(screen.getByTestId('insight-snooze-insight-1').textContent).toBe('Agora não');
    });

    it('com avisos e insights, cada cartão tem o seu "Falar com a Carol"', () => {
      render(<CoachInsightModal alerts={[alerta()]} insights={[acwr]} onClose={mockOnClose} />);
      expect(screen.getAllByRole('button', { name: 'Falar com a Carol' })).toHaveLength(2);
      fireEvent.click(screen.getByTestId('insight-snooze-insight-1'));
      expect(mockSetInsightState).toHaveBeenCalledWith('insight-1', 'ignored');
      expect(mockSetInsightState).not.toHaveBeenCalledWith('plano', expect.anything());
      // O aviso continua à vista: a janela não fecha.
      expect(mockOnClose).not.toHaveBeenCalled();
      expect(screen.getByTestId('carol-alert-plano')).toBeInTheDocument();
    });

    it('um aviso de informação é ciano, como no botão', () => {
      render(<CoachInsightModal alerts={[alerta({ id: 'balanco', severity: 'info', title: 'O balanço da prova' })]} onClose={mockOnClose} />);
      expect(screen.getByTestId('carol-alert-balanco')).toHaveAttribute('data-severity', 'info');
    });
  });
});
