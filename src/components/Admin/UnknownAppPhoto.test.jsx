import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const createSignedUrl = vi.fn();
const from = vi.fn(() => ({ createSignedUrl, getPublicUrl: () => { throw new Error('bucket privado: nunca getPublicUrl'); } }));
vi.mock('../../lib/supabase', () => ({ supabase: { storage: { from: (...a) => from(...a) } } }));

import UnknownAppPhoto, { clearSignedUrlCache, SIGNED_URL_TTL_S } from './UnknownAppPhoto';

beforeEach(() => { createSignedUrl.mockReset(); from.mockClear(); clearSignedUrlCache(); });

describe('UnknownAppPhoto — bucket privado, URL assinado', () => {
  it('pede um URL assinado de 1 h e mostra a imagem; carregamento antes', async () => {
    createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://x/signed?token=1' }, error: null });
    render(<UnknownAppPhoto path="u1/a.png" variant="modal" />);
    expect(screen.getByRole('status')).toBeTruthy();
    const img = await screen.findByAltText('Screenshot submetido pelo atleta');
    expect(img.getAttribute('src')).toBe('https://x/signed?token=1');
    expect(from).toHaveBeenCalledWith('unknown-app-photos');
    expect(createSignedUrl).toHaveBeenCalledWith('u1/a.png', SIGNED_URL_TTL_S);
    expect(SIGNED_URL_TTL_S).toBe(3600);
  });

  it('com erro do storage mostra a mensagem de erro', async () => {
    createSignedUrl.mockResolvedValue({ data: null, error: { message: 'not found' } });
    render(<UnknownAppPhoto path="u1/b.png" variant="modal" />);
    expect(await screen.findByText('Não foi possível carregar a imagem.')).toBeTruthy();
  });

  it('sem caminho não pede nada', () => {
    render(<UnknownAppPhoto path={null} variant="modal" />);
    expect(screen.getByText('Imagem não disponível no storage.')).toBeTruthy();
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it('a miniatura e o modal do mesmo print pedem o URL uma só vez', async () => {
    createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://x/s2' }, error: null });
    const { unmount } = render(<UnknownAppPhoto path="u1/c.png" />);
    await screen.findByAltText('Screenshot da app');
    unmount();
    render(<UnknownAppPhoto path="u1/c.png" variant="modal" />);
    await waitFor(() => expect(screen.getByAltText('Screenshot submetido pelo atleta').getAttribute('src')).toBe('https://x/s2'));
    expect(createSignedUrl).toHaveBeenCalledTimes(1);
  });
});
