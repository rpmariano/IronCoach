import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

/* Acesso da assistente executiva no Perfil (specs/assistente-leitura-contrato.md).
   Com utilizador real as RPCs são imitadas; com 'demo-user' o Supabase não é
   tocado (rebenta se for). */
const rpc = vi.fn();
const order = vi.fn();
const select = vi.fn();
vi.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: (...a) => rpc(...a),
    from: vi.fn(() => ({ select: (...a) => { select(...a); return { is: () => ({ order: (...b) => order(...b) }) }; } })),
  },
  invokeEdgeFunctionWithTimeout: vi.fn(),
}));

const { useAppStore } = await import('../../store');
const { __resetAssistantDemo } = await import('../../lib/assistantTokens');
const { default: AssistantAccessCard, ASSISTANT_MSG_MAX, ASSISTANT_MSG_ERRO } = await import('./AssistantAccessCard');

const setUser = (id) => useAppStore.setState({ session: { user: { id, email: 'a@b.pt' } } });
const ROW = { id: 't1', token_prefix: 'ih_abc12', label: 'Assistente executiva', created_at: '2026-10-20T10:00:00Z', last_used_at: null };

beforeEach(() => {
  vi.clearAllMocks();
  __resetAssistantDemo();
  order.mockResolvedValue({ data: [], error: null });
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue() } });
});

describe('AssistantAccessCard — utilizador real', () => {
  beforeEach(() => setUser('u1'));

  it('lista só as colunas públicas dos ativos', async () => {
    order.mockResolvedValue({ data: [{ ...ROW, last_used_at: '2026-10-22T09:00:00Z' }], error: null });
    render(<AssistantAccessCard />);
    expect(await screen.findByText('ih_abc12…')).toBeInTheDocument();
    expect(select.mock.calls[0][0]).not.toMatch(/token_hash/);
    expect(screen.getByText(/usado pela última vez/)).toBeInTheDocument();
  });

  it('sem acessos diz que a assistente não lê nada', async () => {
    render(<AssistantAccessCard />);
    expect(await screen.findByTestId('perfil-assistente-vazio')).toBeInTheDocument();
  });

  it('gerar mostra o token uma vez, copia, e "Já guardei" apaga-o', async () => {
    rpc.mockResolvedValue({ data: [{ id: 't2', token: 'ih_SEGREDO_COMPLETO', token_prefix: 'ih_SEGRE', created_at: '2026-10-24T10:00:00Z' }], error: null });
    render(<AssistantAccessCard />);
    fireEvent.click(await screen.findByRole('button', { name: 'Gerar acesso' }));
    expect(await screen.findByTestId('perfil-assistente-token')).toHaveTextContent('ih_SEGREDO_COMPLETO');
    expect(rpc).toHaveBeenCalledWith('create_assistant_token', { p_label: 'Assistente executiva' });
    expect(screen.getByText(/só aparece agora/)).toBeInTheDocument();
    expect(screen.getByText('ih_SEGRE…')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Copiar/ }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('ih_SEGREDO_COMPLETO'));
    expect(await screen.findByRole('button', { name: /Copiado/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Já guardei' }));
    expect(screen.queryByText('ih_SEGREDO_COMPLETO')).not.toBeInTheDocument();
    expect(screen.getByText('ih_SEGRE…')).toBeInTheDocument();
  });

  it('max_tokens fala no tom da app, sem códigos', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'max_tokens' } });
    render(<AssistantAccessCard />);
    fireEvent.click(await screen.findByRole('button', { name: 'Gerar acesso' }));
    const msg = await screen.findByRole('alert');
    expect(msg).toHaveTextContent(ASSISTANT_MSG_MAX);
    expect(msg).not.toHaveTextContent('max_tokens');
    expect(screen.queryByTestId('perfil-assistente-token')).not.toBeInTheDocument();
  });

  it('outro erro dá a mensagem genérica', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    render(<AssistantAccessCard />);
    fireEvent.click(await screen.findByRole('button', { name: 'Gerar acesso' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(ASSISTANT_MSG_ERRO);
  });

  it('revogar pede confirmação e só então chama a RPC', async () => {
    order.mockResolvedValue({ data: [ROW], error: null });
    rpc.mockResolvedValue({ data: null, error: null });
    render(<AssistantAccessCard />);
    fireEvent.click(await screen.findByRole('button', { name: /Revogar o acesso ih_abc12/ }));
    expect(rpc).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Revogar' }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('revoke_assistant_token', { p_id: 't1' }));
    await waitFor(() => expect(screen.queryByText('ih_abc12…')).not.toBeInTheDocument());
  });

  it('cancelar a confirmação não revoga', async () => {
    order.mockResolvedValue({ data: [ROW], error: null });
    render(<AssistantAccessCard />);
    fireEvent.click(await screen.findByRole('button', { name: /Revogar o acesso/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(rpc).not.toHaveBeenCalled();
    expect(screen.getByText('ih_abc12…')).toBeInTheDocument();
  });
});

describe('AssistantAccessCard — modo demo', () => {
  beforeEach(() => setUser('demo-user'));

  it('gera e revoga sem tocar no Supabase; à 4.ª dá max_tokens', async () => {
    render(<AssistantAccessCard />);
    const gerar = await screen.findByRole('button', { name: 'Gerar acesso' });
    for (let i = 0; i < 3; i += 1) {
      fireEvent.click(gerar);
      await screen.findByTestId('perfil-assistente-token');
      fireEvent.click(screen.getByRole('button', { name: 'Já guardei' }));
    }
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    fireEvent.click(gerar);
    expect(await screen.findByRole('alert')).toHaveTextContent(ASSISTANT_MSG_MAX);

    fireEvent.click(screen.getAllByRole('button', { name: /Revogar o acesso/ })[0]);
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Revogar' }));
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2));
    expect(rpc).not.toHaveBeenCalled();
    expect(order).not.toHaveBeenCalled();
  });
});
