import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TabelasScreen from './TabelasScreen';

/* As tabelas com nomes (2026-09-25): o top 10 de um escalão numa quinzena,
   lido pela função leaderboard_top — nome abreviado, nível, índice e is_me,
   nunca o user_id de ninguém. */

let resposta = { data: [], error: null };
const rpc = vi.fn(() => Promise.resolve(resposta));
vi.mock('../../lib/supabase', () => ({ supabase: { rpc: (...a) => rpc(...a) } }));

const SEG = { ageBand: 'M40', gender: 'M', terrain: 'estrada' };

describe('TabelasScreen', () => {
  beforeEach(() => { rpc.mockClear(); resposta = { data: [], error: null }; });

  it('pede a tabela do segmento e da quinzena, e marca a linha dele', async () => {
    resposta = {
      data: [
        { position: 1, display_name: 'Ana S.', experience_level: 'medio', score: 100, is_me: false },
        { position: 2, display_name: 'Rui M.', experience_level: 'basico', score: 87.5, is_me: true },
      ],
      error: null,
    };
    render(<TabelasScreen segment={SEG} windowStart="2026-08-31" windowEnd="2026-09-14" onClose={() => {}} onManageConsent={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('tabelas-lista')).toBeInTheDocument());
    expect(rpc).toHaveBeenCalledWith('leaderboard_top', { p_window_start: '2026-08-31', p_age_band: 'M40', p_gender: 'M', p_terrain: 'estrada' });
    expect(screen.getByTestId('tabelas-eu')).toHaveTextContent('Rui M. · tu');
    expect(screen.getByTestId('tabelas-eu')).toHaveTextContent('87,5%');
    expect(screen.getByTestId('tabelas-screen')).toHaveTextContent('nível médio');
    expect(screen.getByTestId('tabelas-screen')).toHaveTextContent('escalão M40, em estrada');
  });

  it('tabela vazia: diz porquê, sem inventar ninguém', async () => {
    render(<TabelasScreen segment={SEG} windowStart="2026-08-31" onClose={() => {}} onManageConsent={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('tabelas-vazia')).toBeInTheDocument());
  });

  it('gerir a presença leva ao consentimento', async () => {
    const onManageConsent = vi.fn();
    render(<TabelasScreen segment={SEG} windowStart="2026-08-31" onClose={() => {}} onManageConsent={onManageConsent} />);
    fireEvent.click(screen.getByTestId('tabelas-gerir'));
    expect(onManageConsent).toHaveBeenCalled();
  });
});
