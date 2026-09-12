import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SubNav from './SubNav';

/* Subnav do ponto 4 do handoff. O que aqui se fixa é o contrato: quantos
   separadores aparecem, que o toque avisa quem usa, qual está marcado como
   ativo, os 44px de toque e a cor do tom ativo. */

const ITEMS = [
  { key: 'hub', label: 'Geral', srLabel: 'Visão Geral', tone: 'run' },
  { key: 'corrida', label: 'Corrida', tone: 'run' },
  { key: 'ginasio', label: 'Ginásio', tone: 'gym' },
  { key: 'nutricao', label: 'Nutrição', tone: 'nutrition' },
  { key: 'corpo', label: 'Corpo', tone: 'body' },
];

const tabs = () => screen.getAllByRole('button');

describe('SubNav', () => {
  it('renderiza um separador por item', () => {
    render(<SubNav items={ITEMS} activeIndex={0} />);
    expect(tabs()).toHaveLength(5);
    for (const label of ['Geral', 'Corrida', 'Ginásio', 'Nutrição', 'Corpo']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('funciona também com quatro separadores (Perfil)', () => {
    render(<SubNav items={ITEMS.slice(0, 4)} activeIndex={1} />);
    expect(tabs()).toHaveLength(4);
  });

  it('avisa onChange com o índice e o item tocados', () => {
    const onChange = vi.fn();
    render(<SubNav items={ITEMS} activeIndex={0} onChange={onChange} />);
    fireEvent.click(screen.getByText('Nutrição'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(3, ITEMS[3]);
  });

  it('não rebenta sem onChange', () => {
    render(<SubNav items={ITEMS} activeIndex={0} />);
    expect(() => fireEvent.click(screen.getByText('Corpo'))).not.toThrow();
  });

  it('só o separador ativo tem aria-current', () => {
    render(<SubNav items={ITEMS} activeIndex={2} />);
    const ativos = tabs().filter(b => b.getAttribute('aria-current') === 'page');
    expect(ativos).toHaveLength(1);
    expect(ativos[0]).toHaveTextContent('Ginásio');
  });

  it('cada separador tem 44px de altura de toque', () => {
    render(<SubNav items={ITEMS} activeIndex={0} />);
    for (const tab of tabs()) expect(tab).toHaveStyle({ minHeight: '44px' });
  });

  it('o separador ativo pinta-se no seu tom; os outros ficam em --text-muted', () => {
    render(<SubNav items={ITEMS} activeIndex={4} />);
    expect(screen.getByText('Corpo').closest('button')).toHaveStyle({ color: 'var(--body)' });
    expect(screen.getByText('Corrida').closest('button')).toHaveStyle({ color: 'var(--text-muted)' });
  });

  it('a pílula usa o tint do tom ativo', () => {
    const { rerender } = render(<SubNav items={ITEMS} activeIndex={0} />);
    expect(screen.getByTestId('subnav-pill')).toHaveStyle({ background: 'var(--tint-run-bg)' });

    rerender(<SubNav items={ITEMS} activeIndex={3} />);
    expect(screen.getByTestId('subnav-pill')).toHaveStyle({ background: 'var(--tint-nutrition-bg)' });
  });

  it('o rótulo curto ("Geral") guarda o nome por extenso para o leitor de ecrã', () => {
    render(<SubNav items={ITEMS} activeIndex={0} />);
    // Cinco separadores em 390px não deixam escrever "Visão Geral" a 11px
    // (auditoria, achado 1) — o nome acessível não pode perder-se por isso.
    expect(screen.getByText('Visão Geral')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Visão Geral' })).toBeInTheDocument();
  });
});
