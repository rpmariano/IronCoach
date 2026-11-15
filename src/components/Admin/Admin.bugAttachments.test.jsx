import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useAppStore } from '../../store';
import Admin from './Admin';

/* Auditoria de segurança M4 (2026-11-14): o anexo de um bug report abre dentro da app, num
   <img>, e não numa aba nova com o URL assinado. */

vi.mock('../../store', () => ({ useAppStore: vi.fn() }));
vi.mock('./Competitions', () => ({ default: () => null }));

const REPORT = {
  id: 'b1', title: 'Não grava', description: 'O treino não grava.', status: 'open', created_at: '2026-11-14T10:00:00Z',
  attachment_urls: ['u1/1-a.jpg', 'u1/2-b.mp4'],
};

vi.mock('../../lib/supabase', () => {
  const chain = (data) => {
    const p = Promise.resolve({ data, error: null });
    const c = { select: () => c, order: () => c, limit: () => p, eq: () => c, in: () => c, then: (...a) => p.then(...a) };
    return c;
  };
  return {
    supabase: {
      rpc: vi.fn(() => Promise.resolve({ data: [], error: null })),
      from: (table) => chain(table === 'bug_reports' ? [REPORT] : []),
      storage: {
        from: () => ({
          createSignedUrl: (path) => Promise.resolve({ data: { signedUrl: `https://signed.example/${path}?token=t` }, error: null }),
          getPublicUrl: () => ({ data: { publicUrl: '' } }),
        }),
      },
    },
  };
});

describe('Admin — anexos dos bug reports (auditoria M4)', () => {
  it('abrem dentro da app (<img>; um vídeo antigo num <video>), sem link para uma aba nova', async () => {
    useAppStore.mockReturnValue({ profile: { id: 'reviewer-1', bug_reviewer: true } });
    render(<Admin />);
    fireEvent.click(await screen.findByText('Ver detalhes'));
    const anexos = await screen.findAllByTestId('bug-attachment');
    expect(anexos.map((el) => el.tagName)).toEqual(['IMG', 'VIDEO']);
    expect(anexos[0].getAttribute('src')).toBe('https://signed.example/u1/1-a.jpg?token=t');
    expect(screen.queryByText(/Ver anexo/)).toBeNull();
    expect(document.querySelector('a[target="_blank"][href*="signed.example"]')).toBeNull();
  });
});
