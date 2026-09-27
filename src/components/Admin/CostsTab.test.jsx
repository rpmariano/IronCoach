import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CostsTab from './CostsTab';

/* Separador "Custos API" (auditoria de 2026-09-27): carrega app_logs
   paginado, filtra por utilizador sem voltar a pedir, e mostra custo por
   utilizador e o preço sugerido. As contas em si estão em
   utils/aiCosts.test.js; aqui interessa que o ecrã as monta. */

const net = { rows: [], queries: [] };

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table) => {
      const q = { table, filters: [] };
      const b = {};
      for (const m of ['select', 'gte', 'lt', 'order']) {
        b[m] = (...args) => { q.filters.push([m, ...args]); return b; };
      }
      b.range = (a, z) => {
        q.range = [a, z];
        net.queries.push(q);
        return Promise.resolve({ data: net.rows.slice(a, z + 1), error: null });
      };
      return b;
    },
  },
}));

const now = new Date();
const iso = (hoursAgo) => new Date(now.getTime() - hoursAgo * 3600000).toISOString();
const users = [
  { id: 'u1', display_name: 'Ana', email: 'ana@x.pt', created_at: '2026-01-01T00:00:00Z' },
  { id: 'u2', display_name: 'Bruno', email: 'bruno@x.pt', created_at: '2026-01-01T00:00:00Z' },
];

describe('CostsTab', () => {
  beforeEach(() => {
    net.queries = [];
    try { localStorage.clear(); } catch { /* sem storage */ }
    net.rows = [
      { user_id: 'u1', function: 'coach-chat', model: 'gemini-3.8-flash', created_at: iso(3), input_tokens: 20000, output_tokens: 500, thoughts_tokens: 1500, cached_tokens: 5000, calls: 2 },
      // Linha recuperada de app_logs: sem thoughts_tokens (NULL).
      { user_id: 'u2', function: 'analyze-meal', model: null, created_at: iso(2), input_tokens: 2000, output_tokens: 300, thoughts_tokens: null, cached_tokens: 0, calls: 1 },
    ];
  });

  it('lê ai_usage e mostra custo por utilizador, modelo e aviso de legado', async () => {
    render(<CostsTab users={users} />);
    expect(await screen.findByText('Por utilizador')).toBeInTheDocument();
    const q = net.queries[0];
    expect(q.table).toBe('ai_usage');
    expect(screen.getByText('gemini-3.8-flash')).toBeInTheDocument();
    expect(screen.getByText(/3 chamada\(s\) ao Gemini/)).toBeInTheDocument();
    expect(q.range).toEqual([0, 999]);
    expect(screen.getByRole('button', { name: /Ana/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Bruno/ })).toBeInTheDocument();
    // A linha do Bruno não tem thoughts_tokens: é anterior à correção.
    expect(screen.getByText(/1 de 2 registo\(s\) são anteriores/)).toBeInTheDocument();
    expect(screen.getByText(/Amostra de 2 utilizador/)).toBeInTheDocument();
  });

  it('filtrar por utilizador não volta a pedir ao servidor', async () => {
    render(<CostsTab users={users} />);
    await screen.findByText('Por utilizador');
    const before = net.queries.length;
    fireEvent.change(screen.getByLabelText('Utilizador'), { target: { value: 'u1' } });
    await waitFor(() => expect(screen.queryByRole('button', { name: /Bruno/ })).not.toBeInTheDocument());
    expect(net.queries.length).toBe(before);
  });
});
