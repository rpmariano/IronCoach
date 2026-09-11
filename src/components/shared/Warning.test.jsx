import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Warning, { WarningAction } from './Warning';

describe('Warning', () => {
  it('por omissão é coral (--warn) e nunca âmbar', () => {
    render(<Warning title="Energia disponível">Abaixo de 30 kcal/kg há duas semanas.</Warning>);
    const box = screen.getByRole('status');
    // O âmbar é da prova e só da prova (ponto 3 do handoff).
    expect(box.style.background).toBe('var(--tint-warn-bg)');
    expect(box.style.border).toBe('1px solid var(--tint-warn-bd)');
    expect(box.style.borderRadius).toBe('var(--radius-md)');
    const title = screen.getByText('Energia disponível');
    expect(title.style.color).toBe('var(--warn)');
    expect(title.style.textTransform).toBe('uppercase');
    expect(title.style.fontSize).toBe('var(--text-xs)');
    expect(screen.getByText(/Abaixo de 30 kcal\/kg/).style.color).toBe('var(--warn-soft)');
  });

  it('tom "ok" usa o verde do dentro-do-alvo', () => {
    render(<Warning tone="ok" title="Volume semanal">ACWR em 1.12.</Warning>);
    const box = screen.getByRole('status');
    expect(box.style.background).toBe('var(--tint-ok-bg)');
    expect(screen.getByText('Volume semanal').style.color).toBe('var(--ok)');
    expect(screen.getByText('ACWR em 1.12.').style.color).toBe('var(--ok-soft)');
  });

  it('tom "danger" é vermelho e interrompe (role="alert")', () => {
    render(<Warning tone="danger" title="Análise falhou">Não consegui ler a foto.</Warning>);
    const box = screen.getByRole('alert');
    expect(box.style.background).toBe('var(--tint-danger-bg)');
    expect(screen.getByText('Análise falhou').style.color).toBe('var(--danger)');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('sem ação não desenha a linha de ações', () => {
    render(<Warning title="Aviso">Texto</Warning>);
    expect(screen.queryByTestId('warning-actions')).toBeNull();
  });

  it('a ação opcional cumpre o piso de toque de 44px e dispara o onClick', () => {
    const onClick = vi.fn();
    render(
      <Warning
        title="Análise falhou"
        actions={<WarningAction onClick={onClick}>Tentar de novo</WarningAction>}
      >
        A leitura da foto não deu resultado.
      </Warning>
    );
    expect(screen.getByTestId('warning-actions')).toBeInTheDocument();
    const btn = screen.getByRole('button', { name: 'Tentar de novo' });
    // Piso de toque do ponto 2: --tap = 44px.
    expect(btn.style.minHeight).toBe('var(--tap)');
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('um tom desconhecido cai no coral em vez de inventar uma cor', () => {
    render(<Warning tone="amber" title="Aviso">Texto</Warning>);
    expect(screen.getByRole('status').style.background).toBe('var(--tint-warn-bg)');
  });
});
