import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useAppStore } from '../../store';
import Admin from './Admin';

/* Auditoria de segurança (2026-11-14): apagar um registo de app desconhecida apaga também o
   print do storage — primeiro a imagem, depois a linha. */

vi.mock('../../store', () => ({ useAppStore: vi.fn() }));
vi.mock('./Competitions', () => ({ default: () => null }));

const LOG = { id: 'l1', user_id: 'u1', category: 'run', status: 'pending', created_at: '2026-11-14T10:00:00Z', image_path: 'u1/abc.jpg', detected_app_guess: 'Suunto' };
const calls = [];
const remove = vi.fn(async (paths) => { calls.push(['remove', paths]); return { data: paths.map((name) => ({ name })), error: null }; });
const sign = vi.fn(async () => ({ data: { signedUrl: 'https://s/x' }, error: null }));
const del = vi.fn();

vi.mock('../../lib/supabase', () => {
  const chain = (table) => {
    const data = table === 'unknown_app_image_logs' ? [LOG] : [];
    const p = Promise.resolve({ data, error: null });
    const c = {
      select: () => c, order: () => c, limit: () => p, in: () => c, then: (...a) => p.then(...a),
      eq: (col, val) => { if (c.deleting) { calls.push(['delete', table, val]); return del(table, val) ?? Promise.resolve({ error: null }); } return c; },
      delete: () => { c.deleting = true; return c; },
    };
    return c;
  };
  return {
    supabase: {
      rpc: vi.fn(() => Promise.resolve({ data: [], error: null })),
      from: (table) => chain(table),
      storage: { from: () => ({ remove: (...a) => remove(...a), createSignedUrl: (...a) => sign(...a) }) },
    },
  };
});

describe('Admin — apagar uma imagem desconhecida', () => {
  beforeEach(() => { calls.length = 0; remove.mockClear(); sign.mockClear(); del.mockReset(); vi.spyOn(window, 'confirm').mockReturnValue(true); });

  const abrir = async () => {
    useAppStore.mockReturnValue({ profile: { id: 'admin-1', is_admin: true } });
    render(<Admin />);
    fireEvent.click(await screen.findByText('Imagens Desconhecidas'));
    fireEvent.click(await screen.findByText(/Consultar Imagem/));
    fireEvent.click(await screen.findByTestId('unknown-log-delete'));
  };

  it('apaga a imagem do storage e depois a linha', async () => {
    await abrir();
    await waitFor(() => expect(calls).toEqual([['remove', ['u1/abc.jpg']], ['delete', 'unknown_app_image_logs', 'l1']]));
    await waitFor(() => expect(screen.queryByText(/Consultar Imagem/)).toBeNull());
  });

  it('se a imagem não sai, a linha fica', async () => {
    remove.mockResolvedValueOnce({ data: null, error: { message: 'denied' } });
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await abrir();
    await waitFor(() => expect(alert).toHaveBeenCalledWith('Falha ao apagar o registo.'));
    expect(calls.some((c) => c[0] === 'delete')).toBe(false);
    err.mockRestore();
  });

  it('a RLS a recusar em silêncio (data: [] e a imagem ainda lá): a linha fica', async () => {
    remove.mockResolvedValueOnce({ data: [], error: null });
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await abrir();
    await waitFor(() => expect(alert).toHaveBeenCalledWith('Falha ao apagar o registo.'));
    expect(calls.some((c) => c[0] === 'delete')).toBe(false);
    err.mockRestore();
  });

  it('data: [] porque a imagem já não existia (o URL assinado dá «not found»): a linha sai', async () => {
    remove.mockResolvedValueOnce({ data: [], error: null });
    sign.mockImplementation(async () => ({ data: null, error: { statusCode: '404', message: 'Object not found' } }));
    await abrir();
    await waitFor(() => expect(calls.at(-1)).toEqual(['delete', 'unknown_app_image_logs', 'l1']));
    sign.mockImplementation(async () => ({ data: { signedUrl: 'https://s/x' }, error: null }));
  });
});
